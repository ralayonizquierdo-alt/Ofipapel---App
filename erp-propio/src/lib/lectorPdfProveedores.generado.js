// GENERADO por scripts/generar-lector-pdf.mjs desde importacion-pedidos-proveedores.html. NO EDITAR A MANO:
// cualquier cambio se hace en esa app (entre las marcas LECTOR-PDF) y se vuelve a generar.
/* eslint-disable */
// @ts-nocheck
// pdfjsLib es el global que deja pdf.js al cargarse (lo carga src/lib/lectorPdf.ts antes de usar esto).

// genera desde este trozo erp-propio/src/lib/lectorPdfProveedores.generado.js. Aquí solo funciones puras: nada de la pantalla.)
// ═══════════════════════════════════════════════════════
// NÚCLEO: extracción de texto posicional del PDF (líneas reconstruidas
// agrupando por coordenada Y y ordenando por X), igual patrón que
// importProveedoresPDF en Index.html.
// ═══════════════════════════════════════════════════════
async function extraerLineasPDF(file){
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data:buf}).promise;
  const todasLineas = [];
  for(let p=1; p<=pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const rowMap = {};
    content.items.forEach(item=>{
      const y = Math.round(item.transform[5]/2)*2;
      if(!rowMap[y]) rowMap[y] = [];
      rowMap[y].push({x:item.transform[4], str:item.str});
    });
    Object.keys(rowMap).sort((a,b)=>b-a).forEach(y=>{
      const linea = rowMap[y].sort((a,b)=>a.x-b.x).map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();
      if(linea) todasLineas.push(linea);
    });
  }
  return todasLineas;
}

// Variante para PDFs cuya página entera viene escrita con el texto girado
// 90° (no es el atributo estándar /Rotate de la página — que vendría a 0 y
// cualquier lector lo enderezaría solo — sino que cada trozo de texto tiene
// su propia matriz de rotación, así que hay que deshacerla a mano). Se nota
// porque extraerLineasPDF normal agrupa por Y y ordena por X: con el texto
// girado eso agrupa por CASUALIDAD los valores de una misma columna de
// varias filas en una sola línea (en vez de agrupar cada fila completa), y
// las palabras de la descripción quedan sueltas y desordenadas. Girando los
// ejes (agrupar por X, ordenar por Y) cada fila vuelve a salir completa y
// en su sitio — usado por SGEL LIBROS, ver PERFILES_PROVEEDOR.
async function extraerLineasPDFRotado(file){
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({data:buf}).promise;
  const todasLineas = [];
  for(let p=1; p<=pdf.numPages; p++){
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const colMap = {};
    content.items.forEach(item=>{
      const k = Math.round(item.transform[4]/2)*2;
      if(!colMap[k]) colMap[k] = [];
      colMap[k].push({pos:item.transform[5], str:item.str});
    });
    Object.keys(colMap).sort((a,b)=>b-a).forEach(k=>{
      const linea = colMap[k].sort((a,b)=>a.pos-b.pos).map(i=>i.str).join(' ').replace(/\s+/g,' ').trim();
      if(linea) todasLineas.push(linea);
    });
    todasLineas.push('--- PAGE BREAK ---');
  }
  return todasLineas;
}

// ═══════════════════════════════════════════════════════
// UTILIDADES NUMÉRICAS COMUNES
// (comas como separador decimal, punto como separador de miles —
// salvo parseDecPunto, que es al revés, para proveedores como NOGUERA).
// ═══════════════════════════════════════════════════════
function fila_(o){
  return Object.assign({codigo:'', descripcion:'', cantidad:0, precioUnitario:0, dto1:0, dto2:0, dto3:0, dto4:0, importe:0, ean:''}, o);
}
function parseDecComa(s){ return parseFloat(String(s).replace(/\./g,'').replace(',','.')); }
function parseDecPunto(s){ return parseFloat(String(s).replace(/,/g,'')); }
const round2_ = v => Math.round(v*100)/100;

// ═══════════════════════════════════════════════════════
// PARSER GENÉRICO: reconoce líneas de artículo con el patrón habitual
// "CODIGO  DESCRIPCION  CANTIDAD  PRECIO  DTO%  [DTOAD%]  PRECIO_NETO  IMPORTE"
// Sirve de base cuando un proveedor no tiene perfil propio dado de alta.
// ═══════════════════════════════════════════════════════
const CODE_RE = /^(\d{6,9}|[A-Z]{2}\d{3,6})$/;
const INT_RE = /^\d+$/;
const DEC_RE = /^\d{1,3}(?:\.\d{3})*,\d{2,3}$/;

function parserGenerico(lineas){
  const filas = [];
  lineas.forEach(linea=>{
    const tokens = linea.split(/\s+/);
    if(!CODE_RE.test(tokens[0])) return;
    const codigo = tokens[0];
    const n = tokens.length;
    if(n < 6) return;

    const last = tokens[n-1], prevLast = tokens[n-2];
    if(!DEC_RE.test(last) || !DEC_RE.test(prevLast)) return;
    const impTotal = parseDecComa(last);
    const precNeto = parseDecComa(prevLast);

    let i = n-3;
    const decimales = [];
    while(i >= 0 && DEC_RE.test(tokens[i])){ decimales.unshift(tokens[i]); i--; }
    if(decimales.length < 2 || decimales.length > 3) return;
    const precTarifa = parseDecComa(decimales[0]);

    if(i < 1 || !INT_RE.test(tokens[i])) return;
    const cantidad = parseInt(tokens[i], 10);

    let descTokens = tokens.slice(1, i);
    if(descTokens.length && descTokens[descTokens.length-1] === '=') descTokens.pop();
    const descripcion = descTokens.join(' ').trim();
    if(!descripcion) return;

    const dtoEfectivo = precTarifa > 0 ? round2_((1 - precNeto/precTarifa) * 100) : 0;
    // Precio U. siempre el de tarifa (el que trae la factura sin tocar);
    // el descuento real hasta llegar al precio neto se guarda aparte.
    filas.push(fila_({codigo, descripcion, cantidad, precioUnitario:precTarifa, dto1:dtoEfectivo, importe:impTotal}));
  });
  return filas;
}

// ═══════════════════════════════════════════════════════
// PARSERS ESPECÍFICOS POR PROVEEDOR
// Cada uno recibe el array de líneas reconstruidas del PDF y devuelve
// filas {codigo, descripcion, cantidad, precioUnitario, dto1..dto4, importe}.
// ═══════════════════════════════════════════════════════

// APLI: "CODIGO DESCRIPCION [=] CANTIDAD PRECIO.TARIFA DTO% [DTOAD%] PRECIO.NETO IMPORTE"
function parseApli(lineas){
  const filas = [];
  lineas.forEach(linea=>{
    const tokens = linea.split(/\s+/);
    if(!CODE_RE.test(tokens[0])) return;
    const codigo = tokens[0];
    const n = tokens.length;
    if(n < 6) return;
    const last = tokens[n-1], prevLast = tokens[n-2];
    if(!DEC_RE.test(last) || !DEC_RE.test(prevLast)) return;
    const importe = parseDecComa(last);
    // precioNeto (Prec.Neto de la factura) no se exporta: solo sirve para
    // saber que esta línea es válida. Precio U. es siempre precTarifa, el
    // precio de tarifa sin descontar, tal cual lo imprime la factura.
    let i = n-3;
    const decimales = [];
    while(i >= 0 && DEC_RE.test(tokens[i])){ decimales.unshift(tokens[i]); i--; }
    if(decimales.length < 2 || decimales.length > 3) return;
    if(i < 1 || !INT_RE.test(tokens[i])) return;
    const cantidad = parseInt(tokens[i], 10);
    let descTokens = tokens.slice(1, i);
    if(descTokens.length && descTokens[descTokens.length-1] === '=') descTokens.pop();
    const descripcion = descTokens.join(' ').trim();
    if(!descripcion) return;
    const precTarifa = parseDecComa(decimales[0]);
    const dtoPct = parseDecComa(decimales[1]);
    const dtoAdPct = decimales.length===3 ? parseDecComa(decimales[2]) : 0;
    filas.push(fila_({codigo, descripcion, cantidad, precioUnitario:precTarifa, dto1:dtoPct, dto3:dtoAdPct, importe}));
  });
  return filas;
}

// COFRAP / MAPED: "CODIGO(6d) DESC_L1 PRECIO CANT IMPORTE" (+ DESC_L2 opcional) + "EAN : xxx"
function parseCofrap(lineas){
  const filas = [];
  const FULL_RE = /^(\d{6})\s+(.*?)\s+(\d+,\d{3})\s+(\d{1,3}(?:\.\d{3})*)\s+(\d{1,3}(?:\.\d{3})*,\d{2})$/;
  const FREE_RE = /^(\d{6})\s+(.*?)\s+0,000\s+(\d{1,3}(?:\.\d{3})*)$/;
  const EAN_RE = /^EAN\s*:\s*(\d+)$/;
  const CODE_START_RE = /^\d{6}\s/;
  let pendingIdx = -1;
  lineas.forEach(l=>{
    const m = l.match(FULL_RE);
    if(m){
      const [,codigo,desc,precio,cant,importe] = m;
      filas.push(fila_({codigo, descripcion:desc.trim(),
        cantidad:parseInt(cant.replace(/\./g,''),10),
        precioUnitario:parseDecComa(precio), importe:parseDecComa(importe)}));
      pendingIdx = filas.length-1;
      return;
    }
    if(FREE_RE.test(l)){ pendingIdx = -1; return; }
    const eanM = l.match(EAN_RE);
    if(eanM){ if(pendingIdx>=0) filas[pendingIdx].ean = eanM[1]; pendingIdx = -1; return; }
    if(pendingIdx>=0 && !CODE_START_RE.test(l)){
      filas[pendingIdx].descripcion = (filas[pendingIdx].descripcion + ' ' + l).trim();
    }
  });
  return filas;
}

// HAMELIN / FILA (mismo software): "LINEA REF DESC EAN IVA%" + "CANT UNI PRECIO EUR por 1 UNI [-DTO% ]NETO EUR [IMPORTE EUR]"
// Las líneas "Compue" / "s. por ..." son el desglose de lo que trae la caja
// del artículo compuesto y ya están incluidas en su precio: se ignoran.
function parseHamelinStyle(lineas){
  const filas = [];
  // Factura normal: cabecera termina en un % (ej. Igic). "Notificación de pedido": sin ese % final.
  const HEADER_RE = /^(\d+)\s+([A-Z0-9]{6,10})\s+(.*?)\s+(\d{8,14})\s+[\d.]+%$/;
  const HEADER_RE2 = /^(\d+)\s+(\d{6,10})\s+(.+?)\s+(\d{8,14})$/;
  const PRICE_RE = /^(\d+(?:\.\d{3})*)\s*[A-Z]{2,4}\s+(\d+,\d{2})\s*EUR\s+por\s+\d+\s*[A-Z]{2,4}\s+(?:-([\d.]+)%\s+)?(\d+,\d{2})\s*(?:EUR)?(?:\s+(\d+(?:\.\d{3})*,\d{2})\s*(?:EUR)?)?$/;
  let header = null, isComponent = false;
  lineas.forEach(l=>{
    if(/^Compue\s*$/.test(l) || /^s\.\s*por\b/.test(l) || /^Compues\.\s*por\s+/.test(l)){ isComponent = true; header = null; return; }
    const hm = l.match(HEADER_RE) || l.match(HEADER_RE2);
    if(hm){ isComponent = false; header = { codigo:hm[2], descripcion:hm[3].trim(), ean:hm[4] }; return; }
    const pm = l.match(PRICE_RE);
    if(pm){
      if(!isComponent && header){
        const cantidad = parseInt(pm[1].replace(/\./g,''),10);
        const precioNeto = parseDecComa(pm[4]);
        const dto = pm[3] ? parseFloat(pm[3]) : 0;
        const importe = pm[5] ? parseDecComa(pm[5]) : round2_(cantidad*precioNeto);
        filas.push(fila_({codigo:header.codigo, descripcion:header.descripcion, cantidad, precioUnitario:precioNeto, dto1:dto, importe, ean:header.ean}));
      }
      header = null; isComponent = false;
      return;
    }
    if(header && !isComponent) header.descripcion = (header.descripcion + ' ' + l).trim();
  });
  return filas;
}

// CABERO / FINOCAN: "CANTIDAD CODIGO EAN13 DESCRIPCION PRECIO %DTO(0 en la línea)"
// + un descuento GLOBAL de factura ("Descuento Global XX %") aplicado a todas las líneas.
function parseFinocan(lineas){
  const filas = [];
  // Formato antiguo (albarán): sin total ni %IVA por línea.
  const RE_VIEJO = /^(\d+)\s+(\d{5,10})\s+(\d{13})\s+(.*?)\s+(\d+,\d{2})\s+(\d+)%$/;
  // Formato nuevo (p.ej. abonos): trae ya el total de línea y el %IVA.
  const RE_NUEVO = /^(\d+)\s+(\d+)\s+(\d{13})\s+(.+?)\s+(\d+,\d{2})\s?€\s+(\d+,\d{2})\s?%\s+(\d+(?:\.\d{3})*,\d{2})\s?€\s+(\d+)\s?%$/;
  const texto = lineas.join('\n');
  let globalDto = 0;
  const gm = texto.match(/Descuento Global\s+(\d+)\s*%/i);
  if(gm){
    globalDto = parseInt(gm[1],10);
  } else {
    const idx = texto.search(/Suma Parciales/i);
    if(idx>=0){
      const resto = texto.slice(idx).split('\n');
      for(let i=1;i<resto.length;i++){
        const gm2 = resto[i].match(/^[\d.,]+\s?€\s+(\d+)\s?%/);
        if(gm2){ globalDto = parseInt(gm2[1],10); break; }
      }
    }
  }
  lineas.forEach(l=>{
    let m = l.match(RE_NUEVO);
    if(m){
      const [,cant,codigo,ean,desc,precio,,totalParcial] = m;
      const cantidad = parseInt(cant,10);
      const precioUnitario = parseDecComa(precio);
      const importe = round2_(parseDecComa(totalParcial)*(1-globalDto/100));
      filas.push(fila_({codigo, descripcion:desc.trim().replace(/[+]+$/,'').trim(), cantidad, precioUnitario, dto1:globalDto, importe, ean}));
      return;
    }
    m = l.match(RE_VIEJO);
    if(!m) return;
    const [,cant,codigo,ean,desc,precio] = m;
    const cantidad = parseInt(cant,10);
    const precioUnitario = parseDecComa(precio);
    const importe = round2_(cantidad*precioUnitario*(1-globalDto/100));
    filas.push(fila_({codigo, descripcion:desc.trim().replace(/[+]+$/,'').trim(), cantidad, precioUnitario, dto1:globalDto, importe, ean}));
  });
  return filas;
}

// JOUMMA BAGS: "REF REF2 DESC.. MARCA EAN CANTIDAD PRECIO DTO. [DTO.2] PRECIONETO IMPORTE" (+ desc. envuelta en líneas siguientes)
function parseJoumma(lineas){
  const filas = [];
  const RE = /^(\d{9,15})\s+(\d{5,10})\s+(.*?)\s+(\d{13})\s+(\d{1,3}(?:\.\d{3})*)\s+(\d+,\d{2})\s+(\d+,\d{2})\s+(?:(\d+,\d{2})\s+)?(\d+,\d{2})\s+(\d+(?:\.\d{3})*,\d{2})$/;
  const CODE_START_RE = /^\d{9,15}\s/;
  let pendingIdx = -1;
  lineas.forEach(l=>{
    const m = l.match(RE);
    if(m){
      filas.push(fila_({codigo:m[1], descripcion:m[3].trim(), cantidad:parseInt(m[5].replace(/\./g,''),10),
        precioUnitario:parseDecComa(m[9]), dto1:parseDecComa(m[7]), dto2: m[8]?parseDecComa(m[8]):0, importe:parseDecComa(m[10]), ean:m[4]}));
      pendingIdx = filas.length-1;
      return;
    }
    if(/^TOTAL\b/.test(l)){ pendingIdx=-1; return; }
    if(pendingIdx>=0 && !CODE_START_RE.test(l)){
      filas[pendingIdx].descripcion = (filas[pendingIdx].descripcion + ' ' + l).trim();
    }
  });
  return filas;
}

// FAIBO: "CODIGO CANTIDAD DETALLE PRECIO [DTO1] + [DTO2] IMPORTE" (el "+" es literal, doble descuento en cascada)
function parseFaibo(lineas){
  const filas = [];
  const RE = /^([A-Z0-9][A-Z0-9-]{1,12})\s+(\d+)\s+(.*?)\s+(\d+,\d{3})\s+(?:(\d+)?\s*\+\s*(\d+)?\s+)?(\d+(?:\.\d{3})*,\d{2})$/;
  lineas.forEach(l=>{
    if(/^Peso \(kg\)/.test(l) || /^Codigo Arancelario/.test(l)) return;
    const m = l.match(RE);
    if(!m) return;
    const [,codigo,cant,desc,precio,d1,d2,importe] = m;
    filas.push(fila_({codigo, descripcion:desc.trim(), cantidad:parseInt(cant,10),
      precioUnitario:parseDecComa(precio), dto1: d1?parseInt(d1,10):0, dto2: d2?parseInt(d2,10):0, importe:parseDecComa(importe)}));
  });
  return filas;
}

// NOGUERA Y VINTRÓ: usa PUNTO como separador decimal (no coma)
function parseNoguera(lineas){
  const filas = [];
  const RE = /^([A-Z]{2}[A-Z0-9]*\d[A-Z0-9]*)\s+(.*?)\s+(\d+\.\d{2})\s+(\d+\.\d{3})\s+(\d+\.\d{2})\s+(\d+\.\d{3})\s+(\d+(?:,\d{3})*\.\d{2})$/;
  lineas.forEach(l=>{
    const m = l.match(RE);
    if(!m) return;
    const [,codigo,desc,cant,,dto,precioNeto,importe] = m;
    filas.push(fila_({codigo, descripcion:desc.trim(), cantidad:Math.round(parseDecPunto(cant)),
      precioUnitario:parseDecPunto(precioNeto), dto1:parseDecPunto(dto), importe:parseDecPunto(importe)}));
  });
  return filas;
}

// ROYMART: el "Paquetes" (cantidad) flota de posición según cuánto se envuelva la
// descripción, así que no se localiza por posición: se deriva matemáticamente de
// PVP, %Dto y Total (que sí son fiables: PVP es siempre el 1er decimal del bloque
// y Total el 2º — cualquier decimal posterior es un subtotal de página, se ignora).
function parseRoymart(lineas){
  const CODE_START_RE = /^([A-Z]{2,4}-?\d+[A-Z0-9]*)\s+(.*)$/;
  const DEC_RE_RM = /^\d{1,3}(?:\.\d{3})*,\d{2}$/;
  const STOP_RE = /^(---|Suma y sigue|Sumas anteriores|C[oó]digo Paquetes|Datos del cliente|Suma imp\. DTO)/i;
  const blocks = [];
  let cur = null;
  lineas.forEach(l=>{
    if(STOP_RE.test(l)){ if(cur){ blocks.push(cur); cur=null; } return; }
    const m = l.match(CODE_START_RE);
    if(m){ if(cur) blocks.push(cur); cur = { codigo:m[1], texto:[m[2]] }; return; }
    if(cur) cur.texto.push(l);
  });
  if(cur) blocks.push(cur);

  const filas = [];
  blocks.forEach(b=>{
    const tokens = b.texto.join(' ').split(/\s+/).filter(Boolean);
    const decIdx = [];
    tokens.forEach((t,i)=>{ if(DEC_RE_RM.test(t)) decIdx.push(i); });
    if(decIdx.length < 2) return;
    const pvpIdx = decIdx[0], totalIdx = decIdx[1];
    const pvp = parseDecComa(tokens[pvpIdx]);
    const total = parseDecComa(tokens[totalIdx]);
    let dto = 0, dtoIdx = -1;
    if(/^\d{1,3}$/.test(tokens[pvpIdx+1])){ dto = parseInt(tokens[pvpIdx+1],10); dtoIdx = pvpIdx+1; }
    const cantidad = dto < 100 && pvp>0 ? Math.round(total/(pvp*(1-dto/100))) : 0;
    const dropIdx = new Set([pvpIdx, totalIdx, dtoIdx, ...decIdx.slice(2)]);
    const descTokens = tokens.filter((t,i)=> !dropIdx.has(i));
    filas.push(fila_({codigo:b.codigo, descripcion:descTokens.join(' ').trim(), cantidad, precioUnitario:pvp, dto1:dto, importe:total}));
  });
  return filas;
}

// TALENS: "LINEA,000 [ARTICULO] DESC CANT.PEDIDA CANT.ENTREGADA PRECIO.BRUTO [%DTO] PRECIO.NETO IMPORTE IVA%"
function parseTalens(lineas){
  const filas = [];
  const RE = /^\d+,000\s+(?:([A-Z0-9]{4,12})\s+)?(.*?)\s+(\d+)\s+(\d+)\s+(\d+,\d{2})\s+(?:(\d+,\d)\s+)?(\d+,\d{2})\s+(\d+(?:\.\d{3})*,\d{2})\s+\d+,\d{2}$/;
  lineas.forEach(l=>{
    const m = l.match(RE);
    if(!m) return;
    const [,codigo,desc,,cantEnt,precioBruto,pct,precioNeto,importe] = m;
    const bruto = parseDecComa(precioBruto), neto = parseDecComa(precioNeto);
    const dto = pct ? parseDecComa(pct) : (bruto>0 ? round2_((1-neto/bruto)*100) : 0);
    filas.push(fila_({codigo:codigo||'', descripcion:desc.trim(), cantidad:parseInt(cantEnt,10),
      precioUnitario:neto, dto1:dto, importe:parseDecComa(importe)}));
  });
  return filas;
}

// SENFORT: dos formatos. El "clásico" (factura tabular, con descripción e
// importe por línea, sin descuentos) usa RE_CLASICA. El de "Pedido"
// (confirmación visual con foto de cada artículo, sin texto de descripción
// — va dentro de la imagen) dispone los códigos en cuadrícula: una línea con
// varios códigos y la siguiente con "cantidad precio €" de cada uno, mismo
// orden; el descuento es GLOBAL para todo el pedido (DTO. LINEAS / IMP.
// BRUTO), no hay descuento por línea.
function parseSenfor(lineas){
  const RE_CLASICA = /^(\d{4,10})\s+(.*?)\s+(\d{1,3}(?:\.\d{3})*)\s+(\d+,\d{2})\s+(\d+(?:\.\d{3})*,\d{2})\s+\d+$/;
  const filasClasica = [];
  lineas.forEach(l=>{
    const m = l.match(RE_CLASICA);
    if(!m) return;
    const [,codigo,desc,cant,precio,importe] = m;
    filasClasica.push(fila_({codigo, descripcion:desc.trim(), cantidad:parseInt(cant.replace(/\./g,''),10),
      precioUnitario:parseDecComa(precio), importe:parseDecComa(importe)}));
  });
  if(filasClasica.length) return filasClasica;
  return parseSenfortPedido(lineas);
}
function parseSenfortPedido(lineas){
  const texto = lineas.join('\n');
  let dtoGlobal = 0;
  const gm = texto.match(/IMP\. BRUTO[\s\S]{0,20}DTO\. LINEAS[\s\S]{0,200}?(\d{1,3}(?:\.\d{3})*,\d{2})\s?€\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s?€/i);
  if(gm){
    const impBruto = parseDecComa(gm[1]);
    const dtoLineas = parseDecComa(gm[2]);
    if(impBruto>0) dtoGlobal = round2_(100*dtoLineas/impBruto);
  }
  const filas = [];
  const RE_CODIGOS = /^\d{4,10}(?:\s+\d{4,10})*$/;
  const RE_PAR = /(\d+(?:\.\d{3})*)\s+(\d+,\d{2})\s?€/g;
  for(let i=0;i<lineas.length-1;i++){
    if(!RE_CODIGOS.test(lineas[i])) continue;
    const codigos = lineas[i].split(/\s+/);
    const pares = [...lineas[i+1].matchAll(RE_PAR)];
    if(pares.length !== codigos.length) continue;
    codigos.forEach((codigo, idx)=>{
      const cantidad = parseInt(pares[idx][1].replace(/\./g,''),10);
      const precioUnitario = parseDecComa(pares[idx][2]);
      const importe = round2_(cantidad*precioUnitario*(1-dtoGlobal/100));
      filas.push(fila_({codigo, descripcion:'', cantidad, precioUnitario, dto1:dtoGlobal, importe}));
    });
  }
  return filas;
}
function totalSenfortPedido(texto){
  const m = texto.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s?€\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s?€\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s?€\s+\d+,\d{2}\s?%/);
  return m ? parseDecComa(m[3]) : null;
}

// PRYSE: dos formatos distintos según el tipo de documento del mismo proveedor.
// a) Factura: "[CODIGO] DESCRIPCION CANTIDAD,000 PRECIO,00000 DTO,00 No sujeto IMPORTE,00 €"
// b) Presupuesto/Orden de venta: "CODIGO DESCRIPCION Pend,000 Entregada,000
//    Precio,00000 [€] DtoPP,00000 Dto,00000 Importe,00 [€]" — la cantidad a
//    usar es "Pend" (lo pedido), no "Entregada": en un presupuesto nada se ha
//    servido todavía, así que Entregada siempre sale a 0 aunque sí haya un
//    importe calculado sobre lo pedido. La descripción a veces se parte en
//    una línea aparte (texto suelto, o solo "€" cuando el símbolo de Precio
//    se desborda a la línea siguiente) que se pega a la fila anterior —
//    salvo que sea el pie de página fijo que repite cada hoja ("R.M.B...").
function parsePryse(lineas){
  const filas = [];
  const RE_FACTURA = /^\[([A-Z0-9]{4,10})\]\s+(.*?)\s+(\d{1,3}(?:\.\d{3})*),(\d{3})\s+(\d+),(\d{5})\s+(\d+),(\d{2})\s+No sujeto\s+(\d+(?:\.\d{3})*),(\d{2})\s*€$/;
  const RE_PRESUPUESTO = /^([A-Z0-9#-]{4,14})\s+(.+?)\s+(\d+),\d{3}\s+\d+,\d{3}\s+(\d+),(\d{5})\s*€?\s+\d+,\d{5}\s+(\d+),(\d{5})\s+(\d{1,3}(?:\.\d{3})*),(\d{2})\s*€?$/;
  let ultimaFila = null, esperandoContinuacion = false;
  lineas.forEach(l=>{
    const mf = l.match(RE_FACTURA);
    if(mf){
      const desc = mf[2].replace(/\(Bienes\)\s*$/,'').trim();
      ultimaFila = fila_({codigo:mf[1], descripcion:desc, cantidad:parseInt(mf[3].replace(/\./g,''),10),
        precioUnitario:parseFloat(mf[5]+'.'+mf[6]), dto1:parseFloat(mf[7]+'.'+mf[8]), importe:parseDecComa(mf[9]+','+mf[10])});
      filas.push(ultimaFila);
      esperandoContinuacion = false;
      return;
    }
    const mp = l.match(RE_PRESUPUESTO);
    if(mp){
      ultimaFila = fila_({codigo:mp[1], descripcion:mp[2].trim(), cantidad:parseInt(mp[3],10),
        precioUnitario:parseFloat(mp[4]+'.'+mp[5]), dto1:parseFloat(mp[6]+'.'+mp[7]), importe:parseDecComa(mp[8]+','+mp[9])});
      filas.push(ultimaFila);
      esperandoContinuacion = true;
      return;
    }
    if(esperandoContinuacion && ultimaFila && l !== '--- PAGE BREAK ---' && !/^R\.M\.B\b/.test(l)){
      const extra = l.replace(/\s*€\s*$/,'').trim();
      if(extra) ultimaFila.descripcion = (ultimaFila.descripcion + ' ' + extra).trim();
    }
    esperandoContinuacion = false;
  });
  return filas;
}

// INTEGRAL INFORMÁTICA IMPORT (Mandatelo.com): "CODIGO EAN13 DESCRIPCION UNID PRECIO [%DTO1 %DTO2] IGIC IMPORTE"
// Cuando la descripción queda vacía en la línea (a veces el texto del PDF la
// deja en la línea anterior), se recupera de ahí.
function parseMandatelo(lineas){
  const filas = [];
  const RE = /^([A-Z0-9]{4,10})\s+(\d{13})\s+(.*?)\s*(\d+,\d{2})\s+(\d+,\d{2})\s+(?:(\d+,\d{2})\s+(\d+,\d{2})\s+)?(\d+)\s+(\d+(?:\.\d{3})*,\d{2})$/;
  let prevLine = '';
  lineas.forEach(l=>{
    const m = l.match(RE);
    if(m){
      let desc = m[3].trim();
      if(!desc) desc = prevLine;
      filas.push(fila_({codigo:m[1], descripcion:desc, cantidad:Math.round(parseDecComa(m[4])),
        precioUnitario:parseDecComa(m[5]), dto1: m[6]?parseDecComa(m[6]):0, dto2: m[7]?parseDecComa(m[7]):0,
        importe:parseDecComa(m[9]), ean:m[2]}));
    }
    prevLine = l;
  });
  return filas;
}

function parseMuchoCartucho(lineas){
  const filas = [];
  const RE = /^(\S+)\s+(\S+)\s+(.+?)\s+(\d+)\s+([\d.,]+)\s?€\s+([\d.,]+)%\s+([\d.,]+)\s?€$/;
  lineas.forEach(linea=>{
    const m = linea.match(RE);
    if(!m) return;
    const [, sku, part, desc, cantidad, precio, dto, importe] = m;
    let ean = '';
    if(/^\d{13}$/.test(sku)) ean = sku;
    else if(/^\d{13}$/.test(part)) ean = part;
    filas.push(fila_({
      codigo: sku==='---' ? '' : sku, ean, descripcion: desc.trim(),
      cantidad: parseInt(cantidad,10), precioUnitario: parseDecComa(precio),
      dto1: parseDecComa(dto), importe: parseDecComa(importe)
    }));
  });
  return filas;
}

// POESSA (The Paper & Office Equipment Spain Association): "Código EAN Descripción Unid.
// Precio % Descuento Importe C. Re. % IVA". El texto de artículos viene mezclado en un único
// bloque (las descripciones y números a veces se reparten en líneas distintas, y algún artículo
// trae un valor suelto intercalado antes del precio), así que se ancla por el patrón
// "CODIGO EAN13" (siempre fiable) y se calcula el importe probando qué combinación de los
// números sueltos que le siguen (0, 1 o 2 descuentos en cascada) reproduce Unidades×Precio.
function parsePoessa(lineas){
  const RE_NOISE_LINEA = /^Nº Registro|^Nº Albar|^Inscrita en el Registro|^Importe Bruto|^Total Fra|^Banco:|^Fecha vencimiento|PAGE BREAK|^Código EAN|^Número :|^Fecha:.*Agente|^The Paper|^AVENIDA|BASAURI|^Tel:|^A4822|^OFIPAPEL|^BULEVAR|^38650|^SANTA CRUZ|^FACTURA$|^AEN-COC/;
  const limpias = lineas
    .filter(l=>l.trim()!=='' && !RE_NOISE_LINEA.test(l))
    .map(l => l.replace(/^Sólo los productos identificados como tales en este documento están certificados FSC®\s*/,''));
  const blob = limpias.join(' ').replace(/\s+/g,' ');

  const filas = [];
  const RE_PROD = /(\d{5,7})\s+(\d{13})\s+/g;
  const matches = [...blob.matchAll(RE_PROD)];
  matches.forEach((m0,i)=>{
    const codigo = m0[1], ean = m0[2];
    const start = m0.index + m0[0].length;
    const end = (i+1<matches.length) ? matches[i+1].index : blob.length;
    const chunk = blob.slice(start, end).trim();
    const m = chunk.match(/^(.+?)\s+([\d.]+)\s+(?:\d+,\d{2}\s+)?(\d+,\d{3})\s+(.*)$/);
    if(!m) return;
    const [, desc, unidStr, precioStr, resto] = m;
    const unidades = parseInt(unidStr.replace(/\./g,''),10);
    const precio = parseDecComa(precioStr);
    const bruto = round2_(unidades*precio);
    const nums = [...resto.matchAll(/\d+,\d{2}/g)].map(x=>parseDecComa(x[0]));
    let importe = bruto, dto1 = 0;
    for(let k=0;k<nums.length;k++){
      let factor=1;
      for(let j=0;j<k;j++) factor *= (1-nums[j]/100);
      if(Math.abs(round2_(bruto*factor)-nums[k])<0.02){ importe = nums[k]; dto1 = k>0?nums[0]:0; break; }
    }
    filas.push(fila_({codigo, ean, descripcion:desc.trim(), cantidad:unidades, precioUnitario:precio, dto1, importe}));
  });
  return filas;
}
function totalPoessa(texto){
  const idx = texto.search(/Base Imp\./i);
  if(idx<0) return null;
  const lineas = texto.slice(idx).split('\n');
  for(let i=1;i<lineas.length && i<8;i++){
    const nums = [...lineas[i].matchAll(/\d{1,3}(?:\.\d{3})*,\d{2}/g)].map(m=>m[0]);
    if(nums.length) return parseDecComa(nums[0]);
  }
  return null;
}

// PARDO: "COD.ARTICULO CONCEPTO CANTIDAD PRECIO IMPORTE" (precio a 4 decimales)
function parsePardo(lineas){
  const filas = [];
  const RE = /^(\d{4,7})\s+(.+?)\s+(\d+)\s+(\d+,\d{2,4})\s+(\d+(?:\.\d{3})*,\d{2})$/;
  lineas.forEach(l=>{
    const m = l.match(RE);
    if(!m) return;
    const [,codigo,desc,cant,precio,importe] = m;
    filas.push(fila_({codigo, descripcion:desc.trim(), cantidad:parseInt(cant,10), precioUnitario:parseDecComa(precio), importe:parseDecComa(importe)}));
  });
  return filas;
}

// PILOT (Comercial Arge): "EAN Caja Código Descripción Cajas Unidades PVP Caja PVP Unidad Neto Caja Neto Unidad % Dto. Total Neto"
// La descripción a veces queda vacía en la línea numérica y se completa con las líneas siguientes.
function parsePilot(lineas){
  const filas = [];
  const RE_CON_DESC = /^(\d{13})\s+(\S+)\s+(.+?)\s+(\d+)\s+(\d+)\s+(\d+,\d{3})\s+(\d+,\d{3})\s+(\d+,\d{3})\s+(\d+,\d{3})\s+(?:\d+\.\d{2}\s+\d+\.\d{2}\s+)?(\d+(?:\.\d{3})*,\d{2})$/;
  const RE_SIN_DESC = /^(\d{13})\s+(\S+)\s+(\d+)\s+(\d+)\s+(\d+,\d{3})\s+(\d+,\d{3})\s+(\d+,\d{3})\s+(\d+,\d{3})\s+(?:\d+\.\d{2}\s+\d+\.\d{2}\s+)?(\d+(?:\.\d{3})*,\d{2})$/;
  const RE_DTO_SOLO = /^\d+\.\d{2}\s+\d+\.\d{2}$/;
  const RE_NO_CONTINUACION = /page \d|PAGE BREAK|registro mercantil|c\.i\.f\.|tarifa|desglose|condiciones de entrega|suministros oficina|n. factura|cliente|agente|telefono|EAN Caja/i;
  function continuacion(i){
    let extra = '';
    let j = i+1;
    while(j<lineas.length && lineas[j].trim()!=='' && lineas[j].length<40 && !RE_CON_DESC.test(lineas[j]) && !RE_SIN_DESC.test(lineas[j]) && !RE_DTO_SOLO.test(lineas[j]) && !RE_NO_CONTINUACION.test(lineas[j])){
      extra += (extra?' ':'') + lineas[j].trim();
      j++;
    }
    return extra;
  }
  lineas.forEach((l,i)=>{
    let m = l.match(RE_CON_DESC);
    if(m){
      const [,ean,codigo,desc,,unidades,,,,netou,totalNeto] = m;
      const descFull = (desc.trim() + ' ' + continuacion(i)).trim();
      filas.push(fila_({codigo, ean, descripcion:descFull, cantidad:parseInt(unidades,10), precioUnitario:parseDecComa(netou), importe:parseDecComa(totalNeto)}));
      return;
    }
    m = l.match(RE_SIN_DESC);
    if(m){
      const [,ean,codigo,,unidades,,,,netou,totalNeto] = m;
      const descFull = continuacion(i).trim();
      filas.push(fila_({codigo, ean, descripcion:descFull, cantidad:parseInt(unidades,10), precioUnitario:parseDecComa(netou), importe:parseDecComa(totalNeto)}));
    }
  });
  return filas;
}

// MICHEL: "CODIGO DESCRIPCION CANTIDAD PRECIO DTO% IMPORTE" con precios en formato punto-decimal.
function parseMichel(lineas){
  const filas = [];
  const RE = /^(\d{8})\s+(.+?)\s+(\d+)\s+(\d+\.\d{4})\s+(\d+)[A-Z]?\s+(\d+\.\d{2})$/;
  lineas.forEach(l=>{
    const m = l.match(RE);
    if(!m) return;
    const [,codigo,desc,cant,precio,dto,importe] = m;
    filas.push(fila_({codigo, descripcion:desc.trim(), cantidad:parseInt(cant,10), precioUnitario:parseDecPunto(precio), dto1:parseInt(dto,10), importe:parseDecPunto(importe)}));
  });
  return filas;
}

// ESSELTE/ACCO: "REFERENCIA DESCRIPCION CANTIDAD PRECIO IMPORTE DESCUENTOS IMP.NETO IVA/RE"
// El descuento puede ser "NETO" (0%) o hasta 3 porcentajes en cascada antes del importe neto final.
function parseEsselte(lineas){
  const filas = [];
  const RE = /^(\S+)\s+(.+?)\s+(\d+)\s+(\d+,\d{3})\s+(\d+(?:\.\d{3})*,\d{2})\s+(?:NETO\s+|(?:\d+,\d\s+){1,3})(\d+(?:\.\d{3})*,\d{2})$/;
  lineas.forEach(l=>{
    const m = l.match(RE);
    if(!m) return;
    const [,codigo,desc,cant,precio,,impNeto] = m;
    filas.push(fila_({codigo, descripcion:desc.trim(), cantidad:parseInt(cant,10), precioUnitario:parseDecComa(precio), importe:parseDecComa(impNeto)}));
  });
  return filas;
}

// FABRISA (Fabri-Papel): "Cód.Prod. Descripción Cantidad Prec.Tarifa Dto% Prec.Neto Imp.Total"
function parseFabrisa(lineas){
  const filas = [];
  const RE = /^(\d{6,9})\s+(.+?)\s+(\d+)\s+(\d+,\d{3})\s+(\d+,\d{2})\s+(\d+,\d{3})\s+(\d+(?:\.\d{3})*,\d{2})$/;
  lineas.forEach(l=>{
    const m = l.match(RE);
    if(!m) return;
    const [,codigo,desc,cant,precioTarifa,dto,,importe] = m;
    filas.push(fila_({codigo, descripcion:desc.trim(), cantidad:parseInt(cant,10), precioUnitario:parseDecComa(precioTarifa), dto1:parseDecComa(dto), importe:parseDecComa(importe)}));
  });
  return filas;
}

// FELLOWES IBERICA: "Código Descripción Cantidad Precio Unitario Importe Neto Total" (formato punto-decimal)
function parseFellowes(lineas){
  const filas = [];
  const RE = /^(\d{4,8})\s+(.+?)\s+(\d+)\s+(\d+\.\d{2})\s+(\d+\.\d{2})\s+(\d+(?:,\d{3})*\.\d{2})$/;
  lineas.forEach(l=>{
    const m = l.match(RE);
    if(!m) return;
    const [,codigo,desc,cant,precio,,total] = m;
    filas.push(fila_({codigo, descripcion:desc.trim(), cantidad:parseInt(cant,10), precioUnitario:parseDecPunto(precio), importe:parseDecPunto(total)}));
  });
  return filas;
}

// GRAFOPLAS DEL NOROESTE: "MODELO DESCRIPCIÓN CANTIDAD PRECIO IMPORTE DTO. TOTAL IVA" (IVA siempre en blanco, solo "%")
function parseGrafoplas(lineas){
  const filas = [];
  const RE = /^(\d{7,8})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*)\s+(\d+,\d{4})\s+(\d+(?:\.\d{3})*,\d{2})\s+(\d+(?:\.\d{3})*,\d{2})\s+%$/;
  lineas.forEach(l=>{
    const m = l.match(RE);
    if(!m) return;
    const [,codigo,desc,cant,precio,importe] = m;
    filas.push(fila_({codigo, descripcion:desc.trim(), cantidad:parseInt(cant.replace(/\./g,''),10), precioUnitario:parseDecComa(precio), importe:parseDecComa(importe)}));
  });
  return filas;
}

// JOVI: formato muy irregular (precio/dto/importe pueden aparecer en distinto orden según cómo
// envuelva la descripción). Se ancla por el descuento compuesto "XX+X,XX[+X]" (siempre con "+")
// y se deriva la cantidad matemáticamente: cantidad = importe / (precio × factor_descuento).
function parseJovi(lineas){
  const RE_NOISE = /SUMINISTROS DE OFICINA|Factura N|^Fecha$|Su pedido N\.|C.digo Cliente|C.digo Representante|Alb.r.n N|Agencia Transporte|F\. Expedici.n|PAGE BREAK|C\.I\.F\. A - 08828113|REFERENCIA CONCEPTO|^FFF|BULEVAR CHAJOFE|ESPA.A$/;
  const limpias = lineas.filter(l => l.trim()!=='' && !RE_NOISE.test(l));
  const filas = [];
  let buffer = [];
  limpias.forEach(l=>{
    if(/^1,00$/.test(l.trim())){
      let ean = '';
      const idxEan = buffer.findIndex(x=>/EAN:\s*(\d+)/.test(x));
      if(idxEan>=0){ ean = buffer[idxEan].match(/EAN:\s*(\d+)/)[1]; buffer.splice(idxEan,1); }
      const blob = buffer.join(' ').replace(/\s+/g,' ').trim();
      const m = blob.match(/^(\S+)\s+(.*)$/);
      if(m){
        const codigo = m[1];
        let resto = m[2];
        let precio, dtoStr, importe, descripcion;
        let mNum = resto.match(/(\d+,\d+|0)\s+(\d+(?:,\d+)?(?:\+\d+(?:,\d+)?){1,3})\s+(\d+(?:\.\d{3})*,\d{2})/);
        if(mNum){
          precio = parseDecComa(mNum[1]); dtoStr = mNum[2]; importe = parseDecComa(mNum[3]);
          descripcion = resto.replace(mNum[0], '').replace(/\s+/g,' ').trim();
        } else {
          const mDto = resto.match(/\d+(?:,\d+)?(?:\+\d+(?:,\d+)?){1,3}/);
          if(mDto){
            dtoStr = mDto[0];
            const sinDto = resto.slice(0,mDto.index) + ' ' + resto.slice(mDto.index+mDto[0].length);
            const mPar = sinDto.match(/(\d+,\d+)\s+(\d+(?:\.\d{3})*,\d{2})/);
            if(mPar){
              precio = parseDecComa(mPar[1]); importe = parseDecComa(mPar[2]);
              descripcion = sinDto.replace(mPar[0], '').replace(/\s+/g,' ').trim();
            }
          }
        }
        if(precio!==undefined && importe!==undefined){
          const factor = dtoStr.split('+').reduce((f,p)=>f*(1-parseDecComa(p)/100), 1);
          const cantidad = precio>0 ? Math.round(importe/(precio*factor)) : 0;
          filas.push(fila_({codigo, ean, descripcion, cantidad, precioUnitario:precio, dto1:parseDecComa(dtoStr.split('+')[0]), importe}));
        }
      }
      buffer = [];
    } else {
      buffer.push(l);
    }
  });
  return filas;
}

// DICAPRODUCT: "Nº Albarán Código Descripción Cantidad Precio Total"; la descripción puede
// envolver a la línea siguiente (donde vienen los números) o venir todo en una sola línea.
function parseDicaproduct(lineas){
  const filas = [];
  const RE_COMPLETA = /^(\d+)\s+(\S+)\s+(.+?)\s+(\d+(?:\.\d{3})*,\d{2})\s+(\d+,\d{3})\s+(\d+(?:\.\d{3})*,\d{2})$/;
  const RE_HEADER = /^(\d+)\s+(\S+)\s+(.+)$/;
  const RE_CONT = /^(.*?)\s+(\d+(?:\.\d{3})*,\d{2})\s+(\d+,\d{3})\s+(\d+(?:\.\d{3})*,\d{2})$/;
  for(let i=0;i<lineas.length;i++){
    const l = lineas[i];
    let m = l.match(RE_COMPLETA);
    if(m){
      const [,,codigo,desc,cant,precio,total] = m;
      filas.push(fila_({codigo, descripcion:desc.trim(), cantidad:Math.round(parseDecComa(cant)), precioUnitario:parseDecComa(precio), importe:parseDecComa(total)}));
      continue;
    }
    m = l.match(RE_HEADER);
    if(m && i+1<lineas.length){
      const mc = lineas[i+1].match(RE_CONT);
      if(mc){
        const [,,codigo,desc1] = m;
        const [,desc2,cant,precio,total] = mc;
        const desc = (desc1.trim() + ' ' + desc2.trim()).trim();
        filas.push(fila_({codigo, descripcion:desc, cantidad:Math.round(parseDecComa(cant)), precioUnitario:parseDecComa(precio), importe:parseDecComa(total)}));
        i++;
      }
    }
  }
  return filas;
}

// SADIPAL (Arconvert): "Codigo Descripción Cantidad Precio Dto% Import I.V.A."
// Alguna línea trae la descripción en la línea ANTERIOR en vez de en la misma.
function parseSadipal(lineas){
  const filas = [];
  const RE_CON_DESC = /^(\S+)\s+(.+?)\s+(\d+)\s+(\d+,\d{2,3})\s+(\d+)\s+(\d+(?:\.\d{3})*,\d{2})\s+\d+$/;
  const RE_SIN_DESC = /^(\S+)\s+(\d+)\s+(\d+,\d{2,3})\s+(\d+)\s+(\d+(?:\.\d{3})*,\d{2})\s+\d+$/;
  lineas.forEach((l,i)=>{
    let m = l.match(RE_CON_DESC);
    if(m){
      const [,codigo,desc,cant,precio,dto,importe] = m;
      filas.push(fila_({codigo, descripcion:desc.trim(), cantidad:parseInt(cant,10), precioUnitario:parseDecComa(precio), dto1:parseInt(dto,10), importe:parseDecComa(importe)}));
      return;
    }
    m = l.match(RE_SIN_DESC);
    if(m){
      const [,codigo,cant,precio,dto,importe] = m;
      const desc = (i>0 && !RE_CON_DESC.test(lineas[i-1]) && !RE_SIN_DESC.test(lineas[i-1])) ? lineas[i-1].trim() : '';
      filas.push(fila_({codigo, descripcion:desc, cantidad:parseInt(cant,10), precioUnitario:parseDecComa(precio), dto1:parseInt(dto,10), importe:parseDecComa(importe)}));
    }
  });
  return filas;
}

// UNI MITSUBISHI (Uni-ball / POSCA): "Cliente Art. Artículo Descripción Unidades Precio Dto Dto Dto Imp.Neto"
// formato punto-decimal; el descuento es opcional (puede faltar del todo).
function parseUniMitsubishi(lineas){
  const filas = [];
  const RE = /^(\d{6,9})\s+(.+?)\s+(\d+)\s+(\d+\.\d{2})\s+(?:(\d+\.\d{2})\s+)?(\d+(?:,\d{3})*\.\d{2})$/;
  lineas.forEach(l=>{
    const m = l.match(RE);
    if(!m) return;
    const [,codigo,desc,cant,precio,dto,importe] = m;
    const descLimpia = desc.replace(/\bFACTURA\b/g,'').replace(/\s+/g,' ').trim();
    filas.push(fila_({codigo, descripcion:descLimpia, cantidad:parseInt(cant,10), precioUnitario:parseFloat(precio), dto1: dto?parseFloat(dto):0, importe:parseDecPunto(importe)}));
  });
  return filas;
}

// UTANPLAS (Grupo Archivo 2000): "REFERENCIA DESCRIPCION CANTIDAD PRECIO IMPORTE NETO"
// cantidad en formato "X,000"; a veces trae un 4º número repitiendo el importe (Imp.Neto).
function parseUtanplas(lineas){
  const filas = [];
  const RE = /^(\S+)\s+(.+?)\s+(\d+,\d{3})\s+(\d+,\d{2,4})\s+(\d+(?:\.\d{3})*,\d{2})(?:\s+\d+(?:\.\d{3})*,\d{2})?$/;
  lineas.forEach(l=>{
    const m = l.match(RE);
    if(!m) return;
    const [,codigo,desc,cant,precio,importe] = m;
    filas.push(fila_({codigo, descripcion:desc.trim(), cantidad:Math.round(parseDecComa(cant)), precioUnitario:parseDecComa(precio), importe:parseDecComa(importe)}));
  });
  return filas;
}

// PERFOTEC: "CODIGO DENOMINACION CANTIDAD PRECIO DTO DTO IGIC IMPORTE".
// PDF con bastante ruido/OCR: cantidad, precio, descuentos e importe a veces se reparten en
// líneas distintas (a veces la continuación va DESPUÉS, a veces ANTES de la cabecera del artículo).
function parsePerfotec(lineas){
  const filas = [];
  // Cantidad e Igic a veces vienen sin decimales ("3", "7") en vez de "3,00"/"7,00"
  // según la factura (mismo proveedor, formatos de impresión distintos) — ambos
  // grupos toleran el decimal opcional.
  const RE_COMPLETA = /^(\S+)\s+(.+?)\s+(\d+(?:,\d{2})?)\s+(\d+,\d{3})\s+(\d+,\d{2})(?:\s+(\d+,\d{2}))?\s+(\d+(?:,\d{2})?)\s+(\d+(?:\.\d{3})*,\d{2})$/;
  const RE_HEADER_PARCIAL = /^(\S+)\s+(.+?)\s+(\d+,\d{2})\s+(\d+,\d{3})\s+(\d+,\d{2})$/;
  const RE_COLA = /^(?:(\d+,\d{2})\s+)?(\d+,\d{2})\s+(\d+(?:\.\d{3})*,\d{2})$/;
  const RE_HEADER_SOLO = /^(\S+)\s+(.+?)\s+(\d+,\d{2})$/;
  const RE_NUM_COMPLETOS = /^(\d+,\d{3})\s+(\d+,\d{2})(?:\s+(\d+,\d{2}))?\s+(\d+,\d{2})\s+(\d+(?:\.\d{3})*,\d{2})$/;
  const RE_NUM_TODO = /^(\d+,\d{2})\s+(\d+,\d{3})\s+(\d+,\d{2})(?:\s+(\d+,\d{2}))?\s+(\d+,\d{2})\s+(\d+(?:\.\d{3})*,\d{2})$/;
  const RE_HEADER_PURO = /^(\S+)\s+([^\d]+)$/;
  const usados = new Set();
  const push = (codigo,desc,cant,precio,dto1,dto2,importe) => {
    if(parseDecComa(importe)===0 && parseDecComa(precio)===0) return;
    filas.push(fila_({codigo, descripcion:desc.replace(/^\*/,'').trim(), cantidad:Math.round(parseDecComa(cant)), precioUnitario:parseDecComa(precio), dto1:parseDecComa(dto1), dto2: dto2?parseDecComa(dto2):0, importe:parseDecComa(importe)}));
  };
  for(let i=0;i<lineas.length;i++){
    if(usados.has(i)) continue;
    const l = lineas[i];
    let m = l.match(RE_COMPLETA);
    if(m){ push(m[1],m[2],m[3],m[4],m[5],m[6],m[8]); continue; }

    m = l.match(RE_HEADER_PARCIAL);
    if(m){
      let hecho = false;
      for(const j of [i+1, i-1]){
        if(j<0 || j>=lineas.length || usados.has(j)) continue;
        const mc = lineas[j].match(RE_COLA);
        if(mc){ push(m[1],m[2],m[3],m[4],m[5],mc[1],mc[3]); usados.add(j); hecho=true; break; }
      }
      if(hecho) continue;
    }

    m = l.match(RE_HEADER_PURO);
    if(m){
      let hecho = false;
      for(const j of [i+1, i-1]){
        if(j<0 || j>=lineas.length || usados.has(j)) continue;
        const mn = lineas[j].match(RE_NUM_TODO);
        if(mn){ push(m[1],m[2],mn[1],mn[2],mn[3],mn[4],mn[6]); usados.add(j); hecho=true; break; }
      }
      if(hecho) continue;
    }

    m = l.match(RE_HEADER_SOLO);
    if(m){
      for(const j of [i+1, i-1]){
        if(j<0 || j>=lineas.length || usados.has(j)) continue;
        const mn = lineas[j].match(RE_NUM_COMPLETOS);
        if(mn){ push(m[1],m[2],m[3],mn[1],mn[2],mn[3],mn[5]); usados.add(j); break; }
      }
    }
  }
  return filas;
}

// ACRILICOS (ACRYLICOS) VALLEJO: el PDF usa una fuente subconjunto cuyo mapeo de caracteres
// está desplazado +29 en el código Unicode respecto al texto real (letras, dígitos y signos
// incluidos). Hay que "descifrar" cada línea antes de poder aplicar ningún patrón normal.
function desplazarTexto(s, n){
  return String(s).split('').map(c => String.fromCodePoint(c.codePointAt(0)+n)).join('');
}
function parseAcrilicosVallejo(lineasCrudas){
  const lineas = lineasCrudas.map(l => desplazarTexto(l, 29));
  const filas = [];
  const RE = /^\d+=(\S+)=(.+?)=(\d+)=([\d,]+)=(-?\d+)%=(?:(-?\d+)=%=)?([\d.]+,\d{2})$/;
  lineas.forEach(l=>{
    const m = l.match(RE);
    if(!m) return;
    const [,codigo,desc,cant,precio,dto1,dto2,importe] = m;
    filas.push(fila_({codigo, descripcion:desc.trim(), cantidad:parseInt(cant,10), precioUnitario:parseDecComa(precio), dto1:Math.abs(parseDecComa(dto1)), dto2: dto2?Math.abs(parseDecComa(dto2)):0, importe:parseDecComa(importe)}));
  });
  return filas;
}

// SGEL LIBROS: la página entera viene con el texto escrito girado 90° (ver
// extraerLineasPDFRotado más arriba) — con esas líneas ya enderezadas, cada
// artículo vuelve a ser una única línea limpia y completa, descripción
// incluida: "EAN Cantidad [Dpto] Título *PVP.CON IVA %IVA *PVP.SIN IVA %Dto
// Neto Euros". No se separa el código de departamento (p.ej. "BL24") del
// título porque no siempre está presente (algunos títulos no lo traen) y de
// todos modos ambos acaban en la misma columna de descripción.
function parseSgel(lineas){
  const filas = [];
  const RE = /^(\d{13})\s+(\d+)\s+(.+?)\s+(\d+,\d{2})\s+(\d+,\d{1,2})\s+(\d+,\d{2})\s+(\d+,\d{2})\s+(\d+,\d{2})$/;
  lineas.forEach(l=>{
    const m = l.match(RE);
    if(!m) return;
    const [,ean,cant,desc,,,precioSin,dto,neto] = m;
    filas.push(fila_({codigo:ean, ean, descripcion:desc.trim(), cantidad:parseInt(cant,10),
      precioUnitario:parseDecComa(precioSin), dto1:parseDecComa(dto), importe:parseDecComa(neto)}));
  });
  return filas;
}
// Solo la ÚLTIMA página trae el resumen con los totales reales (en las
// páginas anteriores esa caja sale en blanco): una línea con "líneas,
// ejemplares, kilos, bultos, Importe Bruto, Importe Neto, %IVA, Total" — se
// toma el Importe Neto (penúltimo valor de los cuatro monetarios), que es
// el que cuadra con la suma de las líneas ya con el descuento aplicado.
function totalSgel(texto){
  const m = texto.match(/^\d+\s+\d+\s+\d+\s+\d+\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+[\d,]+\s+(\d{1,3}(?:\.\d{3})*,\d{2})$/m);
  return m ? parseDecComa(m[2]) : null;
}

// JÚPITER EDICIONES: proveedor marcado como "baja confianza" (ver el campo
// bajaConfianza en PERFILES_PROVEEDOR) — homologado a petición expresa,
// asumiendo que puede salir descuadrado. Sus facturas llegan escaneadas y
// pasadas por el propio OCR del escáner (no el de esta app), con errores
// típicos de reconocimiento (coma/punto confundidos, palabras cortadas) Y
// además cada artículo queda repartido entre 2 líneas de texto que no
// siempre van seguidas — a veces la línea con el ISBN trae ya el importe
// completo, a veces le falta un trozo que aparece suelto antes o después,
// mezclado con el trozo del artículo vecino. No hay forma fiable de saber
// por posición a qué artículo pertenece cada número suelto, así que cada
// hueco de números entre dos ISBN se ofrece a los DOS artículos vecinos y
// se deja que las matemáticas decidan (Importe = Uds × Precio × (1-Dto/100))
// — pero como esa comprobación es por línea, una línea puede "cuadrar"
// consigo misma usando por error un número que en realidad era de la línea
// de al lado. Por eso, aunque cada fila cuadre suelta, el total final no
// tiene por qué cuadrar (visto en pruebas reales) — de ahí bajaConfianza.
function parseJupiter(lineas){
  const parseDecFlex = s => parseFloat(String(s).replace(',', '.'));
  const RE_ISBN_ANCHOR = /^(\d{3}(?:-[\dX]+){3,6})\s+(\d+)\s+(.*)$/;
  const RE_NUM = /\d+[.,]\d{2}/g;

  function buscarTriple(nums, uds){
    for(let i=0;i<nums.length;i++){
      for(let j=0;j<nums.length;j++){
        if(j===i) continue;
        for(let k=0;k<nums.length;k++){
          if(k===i||k===j) continue;
          const precio=nums[i], dto=nums[j], importe=nums[k];
          if(dto<0||dto>100) continue;
          const esperado = round2_(uds*precio*(1-dto/100));
          if(Math.abs(esperado-importe) <= 0.02) return {precio, dto, importe};
        }
      }
    }
    return null;
  }

  const anclas = [];
  const huecos = [];
  let huecoActual = [];
  lineas.forEach(l=>{
    const m = l.match(RE_ISBN_ANCHOR);
    if(m){
      huecos.push(huecoActual);
      huecoActual = [];
      anclas.push({isbn:m[1], uds:parseInt(m[2],10), resto:m[3], propios:[...l.matchAll(RE_NUM)].map(x=>x[0])});
    } else {
      huecoActual.push(...[...l.matchAll(RE_NUM)].map(x=>x[0]));
    }
  });
  huecos.push(huecoActual);

  const filas = [];
  anclas.forEach((a,i)=>{
    const pool = [...a.propios, ...huecos[i], ...huecos[i+1]].map(parseDecFlex);
    const match = buscarTriple(pool, a.uds);
    if(!match) return;
    // "resto" trae el título (y a veces autor/editorial pegados detrás,
    // sin forma fiable de separarlos) — se deja tal cual como descripción.
    const desc = a.resto.replace(/(?:\s+\d[\d.,]*%?)+\s*$/,'').trim();
    filas.push(fila_({codigo:a.isbn, ean:a.isbn, descripcion:desc, cantidad:a.uds,
      precioUnitario:match.precio, dto1:match.dto, importe:match.importe}));
  });
  return filas;
}
// Solo aparece en la ÚLTIMA página de un depósito de varias — si el PDF
// subido es solo esa página, se puede leer; si es una página anterior (sin
// el resumen final) no hay total que comparar y el aviso de "revisa a
// mano" ya avisa de que no se ha podido leer.
function totalJupiter(texto){
  const m = texto.match(/(\d{1,3}(?:\.\d{3})*[.,]\d{2})\s+(\d{1,3}(?:\.\d{3})*[.,]\d{2})\s+\d+[.,]\d{2}%\s+\d+[.,]\d{2}\s*\n\s*(\d{1,3}(?:\.\d{3})*[.,]\d{2})\s*€/);
  if(!m) return null;
  return parseFloat(m[2].replace(',', '.'));
}

// DOHE: "CODIGO(5 díg.) CONCEPTO CANTIDAD PRECIO [%DTO] [IMPORTE]" — factura
// de texto normal, sin descuadres. Algunas líneas (artículos a precio 0, o
// las de transporte/Incoterm al final) solo traen Cantidad+Precio, sin
// Dto ni Importe — según cuántos números de cola tenga la línea se
// interpretan como (cant,precio) / (cant,precio,importe) / (cant,precio,dto,importe).
function parseDohe(lineas){
  const filas = [];
  const RE = /^(\d{5})\s+(.+?)\s+((?:\d+,\d{2}\s*){2,4})$/;
  lineas.forEach(l=>{
    const m = l.match(RE);
    if(!m) return;
    const [,codigo,desc,cola] = m;
    const nums = cola.trim().split(/\s+/);
    let cantidad, precio, dto='0', importe='0';
    if(nums.length===2){ [cantidad,precio] = nums; }
    else if(nums.length===3){ [cantidad,precio,importe] = nums; }
    else { [cantidad,precio,dto,importe] = nums; }
    filas.push(fila_({codigo, descripcion:desc.trim(), cantidad:parseDecComa(cantidad),
      precioUnitario:parseDecComa(precio), dto1:parseDecComa(dto), importe:parseDecComa(importe)}));
  });
  return filas;
}
function totalDohe(texto){
  return totalSimple(texto, /Base Imponible[\s\S]{0,80}?\n(\d{1,3}(?:\.\d{3})*,\d{2})/i);
}

// PAPERBLANKS: "Nº ISBN(13d) DESCRIPCION Pedidos Enviados Pendientes P.V.P
// Precio.Neto Importe". La cantidad facturada es la de "Enviados" (no
// "Pedidos": si hay pendientes de servir, Enviados puede ser menor o 0,
// con Importe a 0 en ese caso). El P.V.P. de esta factura NO es un precio
// de tarifa con descuento negociado (como en APLI) — es solo el precio de
// venta al público recomendado para revender, sin relación con lo que paga
// Ofipapel. El precio real es el Precio Neto tal cual lo imprime la
// factura, sin ningún descuento que calcular (Dto queda a 0).
// La descripción a veces se parte en una línea extra sin números (p.ej.
// "time", "/ Horizontal") cuando es muy larga — se pega a la fila anterior.
function parsePaperblanks(lineas){
  const filas = [];
  const RE = /^\d{1,3}\s+(\d{13})\s+(.+?)\s+\d+\s+(\d+)\s+\d+\s+\d+,\d{2}\s+(\d+,\d{2})\s+(\d+,\d{2})$/;
  let ultimaFila = null;
  lineas.forEach(l=>{
    const m = l.match(RE);
    if(m){
      const [,isbn,desc,enviados,precioNeto,importe] = m;
      ultimaFila = fila_({codigo:isbn, ean:isbn, descripcion:desc.trim(), cantidad:parseInt(enviados,10),
        precioUnitario:parseDecComa(precioNeto), dto1:0, importe:parseDecComa(importe)});
      filas.push(ultimaFila);
    } else if(ultimaFila && l !== '--- PAGE BREAK ---' && !/\d/.test(l)){
      ultimaFila.descripcion = (ultimaFila.descripcion + ' ' + l.trim()).trim();
    } else {
      ultimaFila = null;
    }
  });
  return filas;
}
function totalPaperblanks(texto){
  return totalSimple(texto, /Total de la factura \(EUR\):\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i);
}

// ═══════════════════════════════════════════════════════
// PERFILES DE PROVEEDOR: detección automática + parser propio.
// Para añadir un proveedor nuevo: aportar una factura de muestra y
// registrar aquí su detección + su función de parser, sin tocar el resto.
// ═══════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════
// EXTRACCIÓN DEL TOTAL QUE IMPRIME LA PROPIA FACTURA (base imponible /
// subtotal, SIN Igic), para poder comparar contra la suma calculada.
// ═══════════════════════════════════════════════════════
function totalSimple(texto, re){ const m = texto.match(re); return m ? parseDecComa(m[1]) : null; }
function totalRepetidoComa(texto, keyword){
  const idx = texto.search(new RegExp(keyword, 'i'));
  if(idx<0) return null;
  const resto = texto.slice(idx, idx+400);
  const m = resto.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s+\1\b/);
  return m ? parseDecComa(m[1]) : null;
}
function totalRepetidoPunto(texto, keyword){
  const idx = texto.search(new RegExp(keyword, 'i'));
  if(idx<0) return null;
  const resto = texto.slice(idx, idx+400);
  const m = resto.match(/(\d{1,3}(?:,\d{3})*\.\d{2})\s+\1\b/);
  return m ? parseDecPunto(m[1]) : null;
}
function ultimoNumeroTrasLinea(texto, keyword){
  const idx = texto.search(new RegExp(keyword, 'i'));
  if(idx<0) return null;
  const lineas = texto.slice(idx, idx+300).split('\n').slice(0,6);
  let mejor = null;
  lineas.forEach(linea=>{
    const nums = [...linea.matchAll(/\d{1,3}(?:\.\d{3})*,\d{2}/g)].map(m=>m[0]);
    if(nums.length>=2 && (!mejor || nums.length>mejor.length)) mejor = nums;
  });
  return mejor ? parseDecComa(mejor[mejor.length-1]) : null;
}
// FINOCAN (Cabero) tiene dos formatos de factura: el antiguo solo trae
// "Base imponible: X". El nuevo (p.ej. abonos) trae una fila de totales
// "Suma Parciales %DtoGlobal ImporteDto BaseImponible ..." - se coge el
// 4º valor (Base Imponible), buscándolo en las líneas siguientes al header
// porque puede haber alguna línea de cabecera partida por el medio.
function totalFinocan(texto){
  const idx = texto.search(/Suma Parciales/i);
  if(idx>=0){
    const lineas = texto.slice(idx).split('\n');
    for(let i=1;i<lineas.length;i++){
      const m = lineas[i].match(/^[\d.,]+\s?€\s+\d+\s?%\s+[\d.,]+\s?€\s+([\d.,]+)\s?€/);
      if(m) return parseDecComa(m[1]);
    }
  }
  return totalSimple(texto, /Base imponible:?\s+(\d{1,3}(?:\.\d{3})*,\d{2})/i);
}
// La fila de VALORES viene en la línea siguiente a la fila de ETIQUETAS
// (ej. "B.I. LPI ... Total factura" seguida de "3.503,52€ 23,65€ ... 3.527,17€").
function totalSiguienteLinea(texto, keyword){
  const idx = texto.search(new RegExp(keyword, 'i'));
  if(idx<0) return null;
  const lineas = texto.slice(idx).split('\n');
  for(let i=1;i<lineas.length;i++){
    const nums = [...lineas[i].matchAll(/\d{1,3}(?:\.\d{3})*,\d{2}/g)].map(m=>m[0]);
    if(nums.length) return parseDecComa(nums[nums.length-1]);
    if(lineas[i].trim()) break;
  }
  return null;
}
// Versión en formato punto-decimal (miles con coma, decimales con punto) de totalSiguienteLinea.
function totalSiguienteLineaPunto(texto, keyword){
  const idx = texto.search(new RegExp(keyword, 'i'));
  if(idx<0) return null;
  const lineas = texto.slice(idx).split('\n');
  for(let i=1;i<lineas.length;i++){
    const nums = [...lineas[i].matchAll(/\d{1,3}(?:,\d{3})*\.\d{2}/g)].map(m=>m[0]);
    if(nums.length) return parseDecPunto(nums[nums.length-1]);
    if(lineas[i].trim()) break;
  }
  return null;
}
// El valor aparece en la línea ANTERIOR a la palabra clave (en vez de en la siguiente),
// por cómo ordena pdf.js algunas cajas de texto superpuestas en ciertas plantillas.
function totalLineaAnterior(texto, keyword){
  const idx = texto.search(new RegExp(keyword, 'i'));
  if(idx<0) return null;
  const antes = texto.slice(0, idx).split('\n');
  for(let i=antes.length-1;i>=0;i--){
    const nums = [...antes[i].matchAll(/\d{1,3}(?:\.\d{3})*,\d{2}/g)].map(m=>m[0]);
    if(nums.length) return parseDecComa(nums[nums.length-1]);
    if(antes[i].trim()) break;
  }
  return null;
}
// Como totalRepetidoComa pero probando TODAS las apariciones de la palabra clave (algunos PDF
// multipágina repiten la cabecera de totales en cada página, pero solo la última trae valores).
function totalRepetidoComaTodas(texto, keyword){
  const re = new RegExp(keyword, 'gi');
  let m; let resultado = null;
  while((m = re.exec(texto))){
    const resto = texto.slice(m.index, m.index+400);
    const mm = resto.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s+\1\b/);
    if(mm) resultado = parseDecComa(mm[1]);
  }
  return resultado;
}
// Base Imponible del formato nuevo de ACRILICOS VALLEJO (previo descifrado +29): tras
// "Suma importes", la línea de valores empieza con "IMPORTE EUR" (el propio subtotal).
function totalAcrilicosVallejo(textoCrudo){
  // Ojo: desplazar el bloque completo movería también los '\n' (10+29=39=comilla),
  // destruyendo los saltos de línea. Hay que desplazar línea a línea y volver a unir.
  const texto = textoCrudo.split('\n').map(l => desplazarTexto(l, 29)).join('\n');
  const idx = texto.search(/Suma importes/i);
  if(idx<0) return null;
  const lineas = texto.slice(idx).split('\n');
  for(let i=1;i<lineas.length;i++){
    const m = lineas[i].match(/([\d.]+,\d{2})\s*EUR/);
    if(m) return parseDecComa(m[1]);
    if(lineas[i].trim()) break;
  }
  return null;
}

const PERFILES_PROVEEDOR = [
  { id:'apli', nombre:'APLI PAPER S.A.U.', detectar: t => /APLI\s+PAPER|ESA60914108/i.test(t), parser: parseApli,
    total: t => totalSimple(t, /Subtotal:\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i) },
  { id:'cofrap', nombre:'COFRAP ESPAÑOLA (MAPED)', detectar: t => /COFRAP\s+ESPA|A28533586/i.test(t), parser: parseCofrap,
    total: t => totalSimple(t, /Base imponible\s+(\d{1,3}(?:\.\d{3})*,\d{2})/i) },
  { id:'hamelin', nombre:'HAMELIN BRANDS S.L.U.', detectar: t => /HAMELIN\s+BRANDS|B64271281/i.test(t), parser: parseHamelinStyle,
    total: t => totalSimple(t, /Base imponible\s+(\d{1,3}(?:\.\d{3})*,\d{2})/i) },
  { id:'fila', nombre:'FILA IBERIA', detectar: t => /FILA\s+IBERIA|ESB66875329/i.test(t), parser: parseHamelinStyle,
    total: t => totalSimple(t, /Base imponible\s+(\d{1,3}(?:\.\d{3})*,\d{2})/i) },
  { id:'finocan', nombre:'CABERO GROUP (FINOCAN)', detectar: t => /CABERO\s+GROUP|A58210675/i.test(t), parser: parseFinocan,
    total: t => totalFinocan(t) },
  { id:'joumma', nombre:'JOUMMA BAGS, S.L.', detectar: t => /JOUMMA\s+BAGS|B98087331/i.test(t), parser: parseJoumma,
    total: t => { const m = t.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+(\d{1,3}(?:\.\d{3})*,\d{2})\s+Multivencimientos/i); return m?parseDecComa(m[4]):null; } },
  { id:'faibo', nombre:'FAIBO (VDA. E. FAJEDA)', detectar: t => /VDA\.\s*E\.\s*FAJEDA|FAIBO/i.test(t), parser: parseFaibo,
    total: t => totalRepetidoComa(t, 'BASE IMPONIBLE') },
  { id:'noguera', nombre:'NOGUERA Y VINTRÓ ANDALUCIA', detectar: t => /NOGUERA\s+Y\s+VINTR|B-41574435/i.test(t), parser: parseNoguera,
    total: t => totalRepetidoPunto(t, 'Total Factura') },
  { id:'roymart', nombre:'ROYMART, S.L.', detectar: t => /ROYMART|B58263526/i.test(t), parser: parseRoymart,
    total: t => ultimoNumeroTrasLinea(t, 'Total pedido') },
  { id:'talens', nombre:'TALENS ESPAÑA, S.A.U.', detectar: t => /TALENS\s+ESPA|A08542771/i.test(t), parser: parseTalens,
    total: t => ultimoNumeroTrasLinea(t, 'IMPORTE\\s+TOTAL\\s+FACT') },
  { id:'senfor', nombre:'SENFORT S.A.', detectar: t => /SENFORT|A08795809/i.test(t), parser: parseSenfor,
    total: t => /IMP\. BRUTO/i.test(t) ? totalSenfortPedido(t) : totalSimple(t, /Total \(Euros\)\s+(\d{1,3}(?:\.\d{3})*,\d{2})/i) },
  { id:'sgel', nombre:'SGEL LIBROS, S.L.', detectar: t => /\bSGEL\b/i.test(t), parser: parseSgel,
    total: t => totalSgel(t), extraccion: file => extraerLineasPDFRotado(file) },
  { id:'jupiter', nombre:'JÚPITER EDICIONES', detectar: t => /jupiterediciones/i.test(t), parser: parseJupiter,
    total: t => totalJupiter(t), bajaConfianza: true },
  { id:'dohe', nombre:'DOHE, S.A.', detectar: t => /\bDohe\b/i.test(t), parser: parseDohe,
    total: t => totalDohe(t) },
  { id:'paperblanks', nombre:'PAPERBLANKS LIMITED', detectar: t => /Paperblanks/i.test(t), parser: parsePaperblanks,
    total: t => totalPaperblanks(t) },
  { id:'pryse', nombre:'PRYSE S.A.', detectar: t => /PRYSE|A58276254/i.test(t), parser: parsePryse,
    total: t => totalSimple(t, /Base imponible\s+(?:Base imponible\s+)?(\d{1,3}(?:\.\d{3})*,\d{2})/i) },
  { id:'mandatelo', nombre:'INTEGRAL INFORMATICA IMPORT (Mandatelo)', detectar: t => /INTEGRAL INFORMATICA|MANDATELO|B-?76539642/i.test(t), parser: parseMandatelo,
    total: t => totalRepetidoComa(t, 'SUBTOTAL') },
  { id:'muchocartucho', nombre:'MUCHO CARTUCHO (ATRAMENTUM S.L.)', detectar: t => /Atramentum\s+S\.?L\.?|ESB54685573/i.test(t), parser: parseMuchoCartucho,
    total: t => totalSiguienteLinea(t, 'Total\\s+factura') },
  { id:'pardo', nombre:'PARDO', detectar: t => /CIF:\s*B75062927/i.test(t), parser: parsePardo,
    total: t => totalRepetidoComa(t, 'BASE IMP') },
  { id:'pilot', nombre:'COMERCIAL ARGE (PILOT)', detectar: t => /Comercial\s+Arge|A-?28623379/i.test(t), parser: parsePilot,
    total: t => totalLineaAnterior(t, 'Total Factura') },
  { id:'michel', nombre:'MICHEL', detectar: t => /SUMA Y SIGUE/i.test(t), parser: parseMichel,
    total: t => { const ms = [...t.matchAll(/(\d+\.\d{2})\s+\1\b/g)]; return ms.length ? parseDecPunto(ms[ms.length-1][1]) : null; } },
  { id:'esselte', nombre:'ESSELTE (ACCO BRANDS)', detectar: t => /Pedidos\.Spain@acco\.com|BOFAES2X/i.test(t), parser: parseEsselte,
    total: t => totalRepetidoComaTodas(t, 'SUMA IMPORTE') },
  { id:'fabrisa', nombre:'FABRI-PAPEL, S.L.U.', detectar: t => /FABRI-PAPEL|B-?34239392/i.test(t), parser: parseFabrisa,
    total: t => totalSimple(t, /Subtotal:\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i) },
  { id:'fellowes', nombre:'FELLOWES IBERICA S.L.', detectar: t => /Fellowes\s+Iberica|B84265172/i.test(t), parser: parseFellowes,
    total: t => totalSiguienteLineaPunto(t, 'Total Factura') },
  { id:'grafoplas', nombre:'GRAFOPLÁS DEL NOROESTE, S.A.', detectar: t => /Grafopl.s\s+del\s+Noroeste|A15027139/i.test(t), parser: parseGrafoplas,
    total: t => totalRepetidoComaTodas(t, 'TOTAL FACTURA') },
  { id:'jovi', nombre:'JOVI', detectar: t => /C\.I\.F\.\s*A\s*-?\s*08828113/i.test(t), parser: lineas => parseJovi(lineas),
    total: t => totalRepetidoComa(t, 'TOTAL FACTURA') },
  { id:'dicaproduct', nombre:'DICAPRODUCT, S.L.', detectar: t => /DICAPRODUCT|B-?73204166/i.test(t), parser: parseDicaproduct,
    total: t => totalSimple(t, /Total neto\s+(\d{1,3}(?:\.\d{3})*,\d{2})/i) },
  { id:'sadipal', nombre:'ARCONVERT / SADIPAL', detectar: t => /SADIPAL|ARCONVERT|ESA\s*17001801/i.test(t), parser: parseSadipal,
    total: t => totalSimple(t, /\bImporte\s+(\d+(?:\.\d{3})*,\d{2})\b/) },
  { id:'unimitsubishi', nombre:'UNI-BALL / MITSUBISHI (POSCA)', detectar: t => /MPESA\d+/i.test(t), parser: parseUniMitsubishi,
    total: t => totalRepetidoPunto(t, 'Imp.Bruto') },
  { id:'utanplas', nombre:'UTANPLAS, S.L.U. (Archivo 2000)', detectar: t => /UTANPLAS|B-?19467562/i.test(t), parser: parseUtanplas,
    total: t => totalRepetidoComa(t, 'BASE IMPONIBLE') },
  { id:'perfotec', nombre:'PERFOTEC, S.L.', detectar: t => /PERFOTEC/i.test(t), parser: parsePerfotec,
    total: t => totalSimple(t, /B\. IMPONIBLE[\s\S]{0,30}?(\d{1,3}(?:\.\d{3})*,\d{2})/i) },
  { id:'acrilicosvallejo', nombre:'ACRÍLICOS VALLEJO, S.L.U.', detectar: t => /ACRYLICOS VALLEJO|ESB60562956/i.test(desplazarTexto(t, 29)), parser: parseAcrilicosVallejo,
    total: t => totalAcrilicosVallejo(t) },
  { id:'poessa', nombre:'POESSA (The Paper & Office Equipment Spain)', detectar: t => /The Paper & Office Equipment|A48221998/i.test(t), parser: parsePoessa,
    total: t => totalPoessa(t) }
];

function detectarProveedor(lineas){
  const texto = lineas.join('\n');
  return PERFILES_PROVEEDOR.find(p => p.detectar(texto)) || null;
}

export { extraerLineasPDF, extraerLineasPDFRotado, parserGenerico, PERFILES_PROVEEDOR, detectarProveedor }
