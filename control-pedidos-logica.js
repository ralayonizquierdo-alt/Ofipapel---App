// Lógica de negocio de control-pedidos.html, sin nada de interfaz.
//
// Vive en un fichero aparte (y no inline como el resto de HTML monolíticos)
// solo para poder probarla con node: scripts/probar-control-pedidos.js. El
// navegador la carga con <script src> y la usa como window.ControlPedidos.
//
// Reglas que salen de lo hablado con el propietario (ver el informe de
// migración del prototipo, 2026-10-02) y que NO se deben relajar:
//   - Todo cambio de precio se enseña. Hasta 0,25 € (incluido) es informativo;
//     por encima, hay que revisarlo.
//   - Nada se exporta mientras quede una discordancia sin decidir.
//   - Lo que el cliente pidió y no llega queda en RESTOS, ligado a ese cliente,
//     para reconocerlo cuando aparezca en un pedido posterior.
//   - El precio base nunca se toca para cuadrar un subtotal: se ajusta solo el
//     descuento (Géminis admite uno por línea).
(function (raiz) {
  'use strict';

  const TOLERANCIA_PRECIO = 0.25;

  // ── Normalización ─────────────────────────────────────────────────────────

  /** Referencia comparable: mayúsculas y sin espacios. No quita barras ni
   *  puntos: en los manuscritos una "/" suele ser un 1 mal trazado, y
   *  borrarla convertiría un error visible en otra referencia válida. */
  function normRef(ref) {
    return String(ref == null ? '' : ref).toUpperCase().replace(/\s+/g, '');
  }

  /** Acepta 4,13 · 4'13 · 4.13 · 1.234,56 · números. Vacío o ilegible → null. */
  function parseNum(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    let s = String(v).trim().replace(/[€\s]/g, '').replace(/[´`’']/g, ',');
    if (!s) return null;
    if (s.includes(',') && s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  const red2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

  // ── Comparación pedido ↔ propuesta ────────────────────────────────────────

  function agrupar(lineas) {
    const m = new Map();
    for (const l of lineas || []) {
      const ref = normRef(l.ref);
      if (!ref) continue;
      const cant = parseNum(l.cant) || 0;
      if (!m.has(ref)) m.set(ref, { ref, desc: l.desc || '', ean: l.ean || '', cant: 0, precio: parseNum(l.precio), veces: 0 });
      const g = m.get(ref);
      g.cant += cant;
      g.veces += 1;
      if (!g.desc && l.desc) g.desc = l.desc;
      if (!g.ean && l.ean) g.ean = l.ean;
      if (g.precio == null) g.precio = parseNum(l.precio);
    }
    return m;
  }

  /**
   * Una fila por referencia (unión de pedido y propuesta), en el orden del
   * pedido y después las que solo trae el proveedor.
   *
   * estado: 'ok' | 'falta' (pedida, no viene) | 'extra' (viene sin pedirse)
   *         | 'cambio' (viene, pero con cantidad y/o precio distintos)
   * Cada fila lleva `motivos` con el detalle y `revisar` (true si hace falta
   * decisión). Un cambio de precio dentro de la tolerancia se enseña pero no
   * obliga a decidir, salvo que haya además otro motivo.
   */
  function compararPedido(lineasPedido, lineasPropuesta, opciones) {
    const tol = (opciones && opciones.tolerancia != null) ? opciones.tolerancia : TOLERANCIA_PRECIO;
    const catalogo = (opciones && opciones.catalogo) || null;
    const ped = agrupar(lineasPedido);
    const pro = agrupar(lineasPropuesta);
    const refs = [...ped.keys(), ...[...pro.keys()].filter((r) => !ped.has(r))];

    return refs.map((ref) => {
      const a = ped.get(ref);
      const b = pro.get(ref);
      const fila = {
        ref,
        desc: (b && b.desc) || (catalogo && catalogo[ref] && catalogo[ref].d) || (a && a.desc) || '',
        ean: (b && b.ean) || (a && a.ean) || (catalogo && catalogo[ref] && catalogo[ref].ean) || '',
        cantPedida: a ? a.cant : 0,
        cantPropuesta: b ? b.cant : 0,
        precioPedido: a ? a.precio : null,
        precioPropuesta: b ? b.precio : null,
        difPrecio: null,
        difPrecioPct: null,
        motivos: [],
        estado: 'ok',
        revisar: false,
        enCatalogo: catalogo ? Boolean(catalogo[ref]) : null,
        sugerencias: [],
      };

      if (a && a.veces > 1) fila.motivos.push({ tipo: 'duplicada_pedido', texto: `Aparece ${a.veces} veces en el pedido (se suman)`, revisar: true });
      if (b && b.veces > 1) fila.motivos.push({ tipo: 'duplicada_propuesta', texto: `Aparece ${b.veces} veces en la propuesta (se suman)`, revisar: true });

      if (a && !b) {
        fila.estado = 'falta';
        fila.motivos.push({ tipo: 'falta', texto: 'Pedida y no viene en la propuesta', revisar: true });
      } else if (!a && b) {
        fila.estado = 'extra';
        fila.motivos.push({ tipo: 'extra', texto: 'Viene en la propuesta y no estaba pedida', revisar: true });
      } else {
        if (a.cant !== b.cant) {
          fila.estado = 'cambio';
          fila.motivos.push({ tipo: 'cantidad', texto: `Cantidad ${a.cant} → ${b.cant}`, revisar: true });
        }
        if (a.precio != null && b.precio != null && red2(a.precio) !== red2(b.precio)) {
          const dif = red2(b.precio - a.precio);
          fila.difPrecio = dif;
          fila.difPrecioPct = a.precio ? red2((dif / a.precio) * 100) : null;
          const fuera = Math.abs(dif) > tol + 1e-9;
          fila.estado = 'cambio';
          fila.motivos.push({
            tipo: 'precio',
            texto: `Precio ${fmt(a.precio)} → ${fmt(b.precio)} (${dif > 0 ? '+' : ''}${fmt(dif)})`,
            revisar: fuera,
            informativo: !fuera,
          });
        }
      }

      if (catalogo && !fila.enCatalogo && a) {
        fila.sugerencias = sugerenciasCatalogo(ref, catalogo);
        fila.motivos.push({ tipo: 'no_catalogo', texto: 'La referencia no existe en el catálogo del proveedor: posible error de lectura', revisar: true });
      }

      fila.revisar = fila.motivos.some((m) => m.revisar);
      return fila;
    });
  }

  function fmt(n) {
    return n == null ? '—' : n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** Referencias del catálogo a una cifra de distancia (sustitución o dos
   *  cifras contiguas intercambiadas): el error típico al leer un manuscrito. */
  function sugerenciasCatalogo(ref, catalogo, max) {
    const r = normRef(ref);
    const out = [];
    for (const k of Object.keys(catalogo || {})) {
      if (k.length !== r.length || k === r) continue;
      const difs = [];
      for (let i = 0; i < r.length && difs.length < 3; i++) if (k[i] !== r[i]) difs.push(i);
      const una = difs.length === 1;
      const trans = difs.length === 2 && difs[1] === difs[0] + 1 && k[difs[0]] === r[difs[1]] && k[difs[1]] === r[difs[0]];
      if (una || trans) out.push({ ref: k, desc: catalogo[k].d || '', precio: catalogo[k].p == null ? null : catalogo[k].p });
      if (out.length >= (max || 5)) break;
    }
    return out;
  }

  // ── Decisiones ────────────────────────────────────────────────────────────

  /**
   * Acciones posibles por tipo de fila. La primera es la sugerida.
   *  - resto:    no viene (o viene menos) y el cliente lo sigue esperando → RESTOS
   *  - anular:   no viene y ya no se espera (el cliente renuncia)
   *  - aceptar:  se acepta lo que trae el proveedor
   *  - mantener: se mantiene lo pedido (cantidad y precio del pedido)
   *  - excluir:  la línea no entra en el pedido final
   *  - manual:   cantidad y/o precio a mano
   */
  function accionesPara(fila) {
    if (fila.estado === 'falta') return ['resto', 'anular'];
    if (fila.estado === 'extra') return ['aceptar', 'excluir'];
    const menos = fila.cantPropuesta < fila.cantPedida;
    return menos ? ['aceptar', 'resto', 'mantener', 'manual', 'excluir'] : ['aceptar', 'mantener', 'manual', 'excluir'];
  }

  function sinDecidir(filas, decisiones) {
    return filas.filter((f) => f.revisar && !(decisiones && decisiones[f.ref] && decisiones[f.ref].accion));
  }

  /**
   * Aplica las decisiones. Devuelve las líneas finales del pedido (lo que
   * llega y se factura) y los restos (lo que el cliente espera y no viene).
   * Lanza error si queda algo por decidir: no hay pedido final a medias.
   *
   * `resto` sobre una fila con cantidad menor = se acepta lo que viene y la
   * diferencia queda en restos. Sobre una falta = toda la cantidad a restos.
   */
  function aplicarDecisiones(filas, decisiones) {
    const pendientes = sinDecidir(filas, decisiones);
    if (pendientes.length) {
      const e = new Error('Quedan referencias sin validar: ' + pendientes.map((f) => f.ref).join(', '));
      e.pendientes = pendientes.map((f) => f.ref);
      throw e;
    }
    const lineas = [];
    const restos = [];
    const notas = [];
    for (const f of filas) {
      const d = (decisiones && decisiones[f.ref]) || { accion: f.estado === 'falta' ? 'resto' : 'aceptar' };
      if (d.nota) notas.push({ ref: f.ref, desc: f.desc, texto: d.nota });
      const base = { ref: f.ref, desc: f.desc, ean: f.ean };
      switch (d.accion) {
        case 'excluir':
        case 'anular':
          break;
        case 'resto':
          if (f.cantPropuesta > 0) lineas.push({ ...base, cant: f.cantPropuesta, precio: f.precioPropuesta });
          if (f.cantPedida > f.cantPropuesta) {
            restos.push({ ...base, cant: f.cantPedida - f.cantPropuesta, precio: f.precioPedido != null ? f.precioPedido : f.precioPropuesta });
          }
          break;
        case 'mantener':
          lineas.push({ ...base, cant: f.cantPedida, precio: f.precioPedido != null ? f.precioPedido : f.precioPropuesta });
          break;
        case 'manual': {
          const cant = parseNum(d.cant);
          if (cant == null || cant < 0) throw new Error(`Cantidad manual no válida en ${f.ref}`);
          const precio = parseNum(d.precio);
          if (cant > 0) lineas.push({ ...base, cant, precio: precio != null ? precio : f.precioPropuesta });
          break;
        }
        default: // aceptar
          if (f.cantPropuesta > 0) lineas.push({ ...base, cant: f.cantPropuesta, precio: f.precioPropuesta });
      }
    }
    return { lineas, restos, notas };
  }

  // ── Restos y llegadas posteriores ─────────────────────────────────────────

  /**
   * Reparte lo que llega en un pedido posterior entre los restos abiertos del
   * mismo proveedor, empezando por el más antiguo (FIFO). Es una PROPUESTA:
   * el usuario la confirma o la cambia antes de aplicarla.
   *
   * restos:   [{id, proveedor, ref, pendiente, fecha, cliente}]
   * llegada:  [{ref, cant}]
   * Devuelve  [{restoId, ref, cliente, cant}] y lo que sobra sin dueño.
   */
  function sugerirAsignacion(restos, llegada, proveedor) {
    const abiertos = (restos || [])
      .filter((r) => r.pendiente > 0 && (!proveedor || r.proveedor === proveedor))
      .slice()
      .sort((x, y) => String(x.fecha).localeCompare(String(y.fecha)) || String(x.id).localeCompare(String(y.id)));
    const asignaciones = [];
    const sobrante = [];
    for (const [ref, g] of agrupar(llegada)) {
      let queda = g.cant;
      for (const r of abiertos) {
        if (queda <= 0) break;
        if (normRef(r.ref) !== ref) continue;
        const ya = asignaciones.filter((a) => a.restoId === r.id).reduce((s, a) => s + a.cant, 0);
        const cabe = Math.min(queda, r.pendiente - ya);
        if (cabe <= 0) continue;
        asignaciones.push({ restoId: r.id, ref, cliente: r.cliente, cant: cabe });
        queda -= cabe;
      }
      if (queda > 0) sobrante.push({ ref, cant: queda });
    }
    return { asignaciones, sobrante };
  }

  // ── Descuentos ────────────────────────────────────────────────────────────

  /**
   * Varios descuentos encadenados → uno solo equivalente, sin tocar el precio
   * base. Si el proveedor imprime el subtotal, se cuadra contra ese (absorbe
   * sus redondeos). `residuo` ≠ 0 avisa de que con esos decimales no cuadra.
   */
  function descuentoEquivalente(precioBase, cant, descuentos, opciones) {
    const dec = (opciones && opciones.decimales != null) ? opciones.decimales : 2;
    const bruto = precioBase * cant;
    if (!(bruto > 0)) return { descuento: 0, subtotal: 0, objetivo: 0, residuo: 0 };
    let mult = 1;
    for (const d of descuentos || []) {
      const v = parseNum(d) || 0;
      if (v < 0 || v >= 100) throw new Error('Cada descuento debe estar entre 0 y 100');
      mult *= 1 - v / 100;
    }
    const objetivo = red2(opciones && opciones.subtotalObjetivo != null ? opciones.subtotalObjetivo : bruto * mult);
    const f = Math.pow(10, dec);
    const descuento = Math.round((1 - objetivo / bruto) * 100 * f) / f;
    const subtotal = red2(bruto * (1 - descuento / 100));
    return { descuento, subtotal, objetivo, residuo: red2(subtotal - objetivo) };
  }

  // ── Lectura de la propuesta del proveedor (Excel) ─────────────────────────

  const quitarTildes = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
  const clave = (s) => quitarTildes(s == null ? '' : s).toUpperCase().replace(/\s+/g, ' ').trim();

  /**
   * Recibe la hoja como matriz (SheetJS sheet_to_json con header:1) y busca la
   * fila de cabecera. Perfil Finocam: «Referencia», «CANT. PEDIDO»,
   * «PTD sin IVA», «EAN13», «Descripción facturas», «% DTO.GLOBAL» arriba y
   * «OBSERVACIONES» con el nº de pedido. Si las columnas tienen otros nombres,
   * prueba sinónimos genéricos.
   *
   * Devuelve las líneas con cantidad (lo que propone el proveedor), el
   * catálogo completo (todas las filas con referencia, también las de
   * cantidad vacía: el formulario de Finocam trae la tarifa entera) y la
   * cabecera que haya.
   */
  function leerPropuesta(filas) {
    const hallar = (cab, pruebas) => cab.findIndex((c) => pruebas.some((p) => p.test(clave(c))));
    let iCab = -1;
    let col = null;
    for (let i = 0; i < Math.min(filas.length, 60); i++) {
      const cab = filas[i] || [];
      const ref = hallar(cab, [/^REFERENCIA\b/, /^REF\.?\b/, /^REFCIA/, /^RFCIA/, /^CODIGO\b/, /^ARTICULO\b/]);
      const cant = hallar(cab, [/^CANT/, /^UDS\b/, /^UNIDADES\b/, /^PEDIDAS\b/]);
      if (ref >= 0 && cant >= 0) {
        iCab = i;
        col = {
          ref,
          cant,
          desc: hallar(cab, [/^DESCRIPCION/, /^DENOMINACION/, /^CONCEPTO/]),
          ean: hallar(cab, [/^EAN/, /^COD\.? ?BARRAS/]),
          precio: hallar(cab, [/^PTD\b/, /^PRECIO\b/, /^P\.? ?UNIT/, /^COSTE?\b/, /^TARIFA\b/]),
          dto: hallar(cab, [/^DESC\.? ?LIN/, /^DTO\b/, /^DCTO\b/, /^% ?DTO\b/]),
          iva: hallar(cab, [/^IVA\b/, /^IGIC\b/]),
        };
        break;
      }
    }
    if (iCab < 0) throw new Error('No encuentro la fila de cabecera (columnas de referencia y cantidad) en la propuesta');

    const cabecera = { dtoGlobal: null, observaciones: '', numeroPedido: null, importeNeto: null };
    for (let i = 0; i < iCab; i++) {
      const f = filas[i] || [];
      for (let j = 0; j < f.length; j++) {
        const k = clave(f[j]);
        const sig = f.slice(j + 1).find((v) => v !== '' && v != null);
        if (/% ?DTO\.? ?GLOBAL/.test(k)) {
          const n = parseNum(sig);
          if (n != null) cabecera.dtoGlobal = n > 0 && n < 1 ? red2(n * 100) : n;
        } else if (/^OBSERVACIONES/.test(k) && sig != null) {
          cabecera.observaciones = String(sig).trim();
        } else if (/IMPORTE PEDIDO NETO/.test(k)) {
          cabecera.importeNeto = parseNum(sig);
        }
      }
    }
    const m = clave(cabecera.observaciones).match(/PEDIDO\s*N\S*\s*(\d+)/);
    if (m) cabecera.numeroPedido = Number(m[1]);

    const val = (f, i) => (i >= 0 ? f[i] : null);
    const lineas = [];
    const catalogo = {};
    for (let i = iCab + 1; i < filas.length; i++) {
      const f = filas[i] || [];
      const ref = normRef(val(f, col.ref));
      if (!ref) continue;
      const desc = String(val(f, col.desc) || '').trim();
      const ean = String(val(f, col.ean) || '').trim();
      const precio = parseNum(val(f, col.precio));
      catalogo[ref] = { d: desc, p: precio, ean };
      const cant = parseNum(val(f, col.cant));
      if (cant) {
        const dtoLin = parseNum(val(f, col.dto));
        let iva = parseNum(val(f, col.iva));
        if (iva != null && iva > 0 && iva < 1) iva = red2(iva * 100);
        lineas.push({ ref, desc, ean, cant, precio, dtoLinea: dtoLin, iva });
      }
    }
    return { lineas, catalogo, cabecera };
  }

  // ── Excel para Géminis ────────────────────────────────────────────────────

  /**
   * Disposición del Excel de importación. Los artículos empiezan en la fila 11
   * (confirmado por el propietario el 2026-10-02). Las columnas A–N siguen la
   * plantilla «PROPUESTA DE PEDIDO» que entregó; las filas de cabecera 1–10
   * están PENDIENTES de comprobar con un .xls que Géminis haya aceptado: si
   * cambia algo, se toca solo aquí.
   */
  const PLANTILLA_GEMINIS = {
    primeraFila: 11,
    columnas: ['ean', 'desc', 'ref', 'cajas', 'udsCaja', 'cant', 'precio', 'dto', 'igic', 'total', 'bonif', 'sinStock', 'codOfipapel', 'refProveedor'],
    titulos: ['Cod.Barras EAN13', 'DESCRIPCION', 'Rfcia. Proveedor', 'Cajas', 'UdsXCja', 'Pedidas', 'UNIDAD', 'Dcto', 'Igic', 'TOTAL', 'U/Bonifica', 'Sin STOCK', 'Cod. Ofipapel', 'Code/rfcia Provee.'],
  };

  /** Matriz lista para SheetJS (aoa_to_sheet) con cabecera en 1–10 y datos desde la 11. */
  function filasGeminis(lineas, cab, opciones) {
    const P = PLANTILLA_GEMINIS;
    const n = P.columnas.length;
    const vacia = () => new Array(n).fill('');
    const aoa = [];
    for (let i = 0; i < P.primeraFila - 1; i++) aoa.push(vacia());
    aoa[1][1] = 'PROPUESTA DE PEDIDO';
    aoa[1][2] = 'ALMACEN ' + ((cab && cab.almacen) || '');
    aoa[3][1] = 'PROVEEDOR; ' + ((cab && cab.proveedor) || '');
    aoa[3][2] = 'FECHA: ' + ((cab && cab.fecha) || '');
    aoa[5][2] = 'N PEDIDO: ' + ((cab && cab.numero) || '');
    if (cab && cab.observaciones) { aoa[1][5] = 'Observaciones:'; aoa[2][5] = cab.observaciones; }
    aoa[P.primeraFila - 2] = P.titulos.slice();

    const dto = (opciones && opciones.dto) || 0;
    const igic = (opciones && opciones.igic != null) ? opciones.igic : '';
    for (const l of lineas) {
      const precio = l.precio == null ? 0 : l.precio;
      const dtoLinea = l.dto != null ? l.dto : dto;
      const total = red2(precio * l.cant * (1 - dtoLinea / 100));
      const v = {
        ean: l.ean || '', desc: l.desc || '', ref: l.ref, cajas: '', udsCaja: '', cant: l.cant,
        precio, dto: dtoLinea, igic, total, bonif: '', sinStock: '', codOfipapel: '', refProveedor: l.ref,
      };
      aoa.push(P.columnas.map((c) => v[c]));
    }
    return aoa;
  }

  const api = {
    TOLERANCIA_PRECIO, PLANTILLA_GEMINIS,
    normRef, parseNum, red2, fmt, agrupar,
    compararPedido, sugerenciasCatalogo, accionesPara, sinDecidir, aplicarDecisiones,
    sugerirAsignacion, descuentoEquivalente, leerPropuesta, filasGeminis,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else raiz.ControlPedidos = api;
})(typeof window !== 'undefined' ? window : globalThis);
