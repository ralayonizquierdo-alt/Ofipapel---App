// Versión de escritorio: misma pantalla de registro que el móvil (app.js) más
// la sección «Procesar y enviar el parte»: abre el parte del día con el formato
// de la plantilla Word, rellenado con los registros, con todas las casillas
// editables; lo exporta a PDF y prepara el correo.
//
// Lee los registros de la misma clave de localStorage que app.js, así que en
// este navegador ve lo mismo que se registra en la pestaña «Registro». Sin
// base de datos todavía: lo que se registra en un móvil NO llega aquí.

(() => {
const REGISTROS_KEY = 'fauna-parte-prototipo-v1';
const BORRADOR_KEY = 'fauna-parte-borrador-v1';
const ENVIO_KEY = 'fauna-envio-v1';
const $ = id => document.getElementById(id);

// Leyendas tal cual vienen en la plantilla Word.
const LEYENDA_ACTUACION = 'VI: Vigilancia, V: vuelos con las Rapaces, V.M: vuelos de Marcaje, V.Z: Vuelos de caza, V.Z.C vuelos de caza con captura, A: utilización de aves rapaces tanto en vuelos como capturas, P: utilización de Perro, S: Sonidos, P.I: Pirotecnia, T: Trampa, R: Red.';
const LEYENDA_CAPTURA = 'METODO DE CAPTURA: T: trampa  L: Lazo  A: Ave de cetrería  P: Perro adiestrado  O: Otro medio (especificar en observaciones)\nDESTINO DEL ANIMAL CAPTURADO: A: Alimento para las aves rapaces  C: Centro de Recuperación de Especies Silvestres «La Tahonilla»  E: Eutanasia  M: Agente de Medio Ambiente  P: Albergues de animales  L: Liberado.';

// Secciones del parte, en el orden de la plantilla. `min` = filas que trae la
// plantilla vacía (el parte se imprime con ese hueco aunque no haya datos).
const SECCIONES = [
  {key:'crono', titulo:null, cols:['HORA','VIENTO (NUDOS)','ACTUACIONES','OBSERVACIONES'], anchos:[11,14,45,30], min:22, leyenda:LEYENDA_ACTUACION},
  {key:'fauna', titulo:'OBSERVACIONES DE FAUNA', cols:['HORA','NOMBRE COMUN','N.º','COMPORTAMIENTO','ALTITUD DE VUELO (0-20, 20-100)','PROCEDENCIA (Donde está)','DESTINO (Hacia dónde va)','ACTUACION','AMENAZA / COINCIDE CON OPERACIONES (Si / No)','OBSERVACIONES'], anchos:[6,11,5,13,9,11,10,8,11,16], min:4},
  {key:'captura', titulo:'CAPTURAS / TRAMPEOS REALIZADOS', cols:['NOMBRE COMUN','METODO DE CAPTURA','Nº','LOCALIZACION','DESTINO','OBSERVACIONES'], anchos:[16,14,6,20,12,32], min:8, leyenda:LEYENDA_CAPTURA},
  {key:'retirada', titulo:'RETIRADA DE ANIMALES MUERTOS (FOD)', cols:['HORA','NOMBRE COMUN','N.º','ZONA DE INCIDENCIAS','PROCEDENTE DE IMPACTO (SI/NO)','OBSERVACIONES'], anchos:[8,17,6,18,20,31], min:4},
  {key:'impacto', titulo:'IMPACTOS DE FAUNA CON AERONAVES', cols:['HORA','NOMBRE COMUN','ZONA DE INCIDENCIA','MATRICULA AERONAVE','SEVERIDAD','OBSERVACIONES'], anchos:[8,16,19,18,14,25], min:2},
  {key:'aviso', titulo:'AVISOS RECIBIDOS / REALIZADOS', cols:['HORA','RECIBIDO / REALIZADO','PROCEDENCIA / DESTINO DEL AVISO','ASUNTO','ACTUACION DEL SCF / ACTUACION DERIVADA','OBSERVACIONES'], anchos:[8,12,17,23,22,18], min:5},
];
const ETIQUETAS = {actuacion:'Actuación',fauna:'Fauna',captura:'Captura',retirada:'Retirada',impacto:'Impacto',aviso:'Aviso'};

function leer(key) { try { return JSON.parse(localStorage.getItem(key)) || {}; } catch { return {}; } }
function guardar(key, value) { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } }
function fechaActual() { return $('report-date').value; }
function fechaES(iso) { const [a,m,d] = (iso || '').split('-'); return d ? `${d}/${m}/${a}` : ''; }
// En el formulario los códigos llevan su significado («V – Vuelos con rapaces»);
// en el parte, como en la plantilla, solo va el código.
function codigo(valor) { return String(valor || '').split(' – ')[0].trim(); }

// ── Construir el parte a partir de los registros (misma lógica que server.py) ──
function datosDelDia(fecha) {
  const registros = leer(REGISTROS_KEY);
  return {
    campos: (registros.fields || {})[fecha] || {},
    entradas: [...((registros.reports || {})[fecha] || [])].sort((a,b) => String(a.time).localeCompare(String(b.time)) || a.created - b.created),
  };
}
function huella(fecha) { return JSON.stringify(datosDelDia(fecha)); }

function construirParte(fecha) {
  const {campos, entradas} = datosDelDia(fecha);
  const d = (e, k) => String((e.details || {})[k] || '').trim();
  const texto = e => String(e.text || '').trim();
  const de = tipo => entradas.filter(e => e.kind === tipo);
  const horario = [campos['start-time'], campos['end-time']].filter(Boolean).join(' – ');
  return {
    fecha,
    huella: huella(fecha),
    editado: null,
    cabecera: {empresa:'FENIX CONTROL DE FAUNA', fecha:fechaES(fecha), halconero:campos.agent || '', clima:campos.weather || '', horario},
    filas: {
      crono: entradas.map((e, i) => {
        let actuacion = texto(e);
        if (e.kind === 'aviso') actuacion = `Aviso ${(d(e,'direction') || 'recibido').toLowerCase()}: ${actuacion}`;
        else if (e.kind !== 'actuacion') actuacion = `${ETIQUETAS[e.kind] || 'Registro'}: ${actuacion}`;
        return [e.time || '', d(e,'wind') || (i === 0 ? campos.wind || '' : ''), actuacion, e.kind === 'aviso' ? 'AVISO' : d(e,'observations')];
      }),
      fauna: de('fauna').map(e => [e.time || '', d(e,'species'), d(e,'count'), d(e,'behavior'), d(e,'altitude'), d(e,'origin'), d(e,'destination'), codigo(d(e,'action')), d(e,'threat'), d(e,'observations') || texto(e)]),
      captura: de('captura').map(e => [d(e,'species'), codigo(d(e,'method')), d(e,'count'), d(e,'location'), codigo(d(e,'destination')), d(e,'observations') || texto(e)]),
      retirada: de('retirada').map(e => [e.time || '', d(e,'species'), d(e,'count'), d(e,'location'), d(e,'impact'), d(e,'observations') || texto(e)]),
      impacto: de('impacto').map(e => [e.time || '', d(e,'species'), d(e,'location'), d(e,'aircraft'), d(e,'severity'), d(e,'observations') || texto(e)]),
      aviso: de('aviso').map(e => [e.time || '', d(e,'direction') || 'Recibido', d(e,'source'), texto(e), d(e,'response'), d(e,'observations')]),
    },
  };
}
function conHueco(seccion, filas) {
  const out = filas.map(f => [...f]);
  while (out.length < seccion.min) out.push(seccion.cols.map(() => ''));
  return out;
}

// ── Borrador editable (uno por fecha) ──────────────────────────────────────
let parte = null;
function guardarBorrador() {
  const borradores = leer(BORRADOR_KEY);
  borradores[parte.fecha] = parte;
  if (!guardar(BORRADOR_KEY, borradores)) setEstado('No se pudo guardar el borrador en este ordenador.', true);
}
function abrirParte({regenerar = false} = {}) {
  const fecha = fechaActual();
  $('proc-date').textContent = fechaES(fecha);
  const borrador = leer(BORRADOR_KEY)[fecha];
  if (borrador && !regenerar) parte = borrador;
  else {
    parte = construirParte(fecha);
    for (const s of SECCIONES) parte.filas[s.key] = conHueco(s, parte.filas[s.key]);
  }
  pintarParte();
  actualizarEstado();
  prepararCorreo();
  actualizarBotonOrdenar();
}
function actualizarEstado() {
  const {entradas} = datosDelDia(parte.fecha);
  const desfasado = parte.huella !== huella(parte.fecha);
  if (desfasado) setEstado(`Ojo: los registros del día han cambiado desde que se abrió este parte${parte.editado ? ' y has hecho correcciones a mano' : ''}. Pulsa «Recargar desde los registros» para incorporarlos${parte.editado ? ' (se perderán tus correcciones)' : ''}.`, true);
  else if (parte.editado) setEstado(`Parte con correcciones a mano (última a las ${new Date(parte.editado).toTimeString().slice(0,5)}). Guardado en este ordenador.`);
  else setEstado(entradas.length ? `Parte rellenado con ${entradas.length} ${entradas.length === 1 ? 'registro' : 'registros'} del día. Revísalo antes de enviarlo.` : 'No hay registros para este día: el parte sale vacío. Puedes rellenarlo aquí directamente.');
}
function setEstado(texto, aviso = false) { const p = $('proc-status'); p.textContent = texto; p.classList.toggle('warn', aviso); }
function marcarEditado() { parte.editado = Date.now(); guardarBorrador(); actualizarEstado(); marcarPendientes(); }

// ── Casillas pendientes ────────────────────────────────────────────────────
// En cada fila con algún dato, las casillas vacías se señalan para completarlas
// antes de enviar; las filas vacías de relleno de la plantilla no cuentan.
// Observaciones y el viento de la cronología no son obligatorias: en los partes
// reales casi siempre van vacías.
function opcional(s, j) { return s.cols[j] === 'OBSERVACIONES' || (s.key === 'crono' && j === 1); }
function contarPendientes() {
  let n = ['fecha','halconero','clima','horario'].filter(k => !String(parte.cabecera[k] || '').trim()).length;
  for (const s of SECCIONES) for (const fila of parte.filas[s.key]) {
    if (!fila.some(v => String(v).trim())) continue;
    n += fila.filter((v, j) => !opcional(s, j) && !String(v).trim()).length;
  }
  return n;
}
function marcarPendientes() {
  for (const t of $('parte').querySelectorAll('textarea[data-sec]')) {
    const s = SECCIONES.find(x => x.key === t.dataset.sec), fila = parte.filas[s.key][+t.dataset.fila], j = +t.dataset.col;
    t.classList.toggle('pendiente', fila.some(v => String(v).trim()) && !opcional(s, j) && !t.value.trim());
  }
  for (const t of $('parte').querySelectorAll('textarea[data-cab]')) t.classList.toggle('pendiente', ['fecha','halconero','clima','horario'].includes(t.dataset.cab) && !t.value.trim());
  const n = contarPendientes(), p = $('proc-pendientes');
  p.textContent = n ? `⚠ Quedan ${n} ${n === 1 ? 'casilla' : 'casillas'} por completar, marcadas en amarillo.` : '✓ No queda ninguna casilla obligatoria por completar.';
  p.classList.toggle('ok', !n);
  return n;
}
function confirmarPendientes() {
  const n = contarPendientes();
  return !n || confirm(`Quedan ${n} ${n === 1 ? 'casilla' : 'casillas'} por completar (marcadas en amarillo). ¿Generar el PDF igualmente?`);
}

// ── Editor: réplica de la plantilla con casillas editables ─────────────────
function autoAlto(t) { t.style.height = 'auto'; t.style.height = t.scrollHeight + 'px'; }
function casilla(valor, onInput, etiqueta) {
  const t = document.createElement('textarea'); t.rows = 1; t.value = valor; t.setAttribute('aria-label', etiqueta);
  t.addEventListener('input', () => { onInput(t.value); autoAlto(t); });
  return t;
}
// Las casillas crecen con el texto. La altura depende del ancho real de la
// columna, que solo se conoce tras maquetar: se recalcula cada vez que el parte
// cambia de tamaño (al mostrarse, al redimensionar la ventana…).
function ajustarAltos() { for (const t of $('parte').querySelectorAll('textarea')) autoAlto(t); }
new ResizeObserver(() => ajustarAltos()).observe($('parte'));
function pintarParte() {
  const doc = $('parte'); doc.replaceChildren();
  const c = parte.cabecera;
  const cab = document.createElement('table'); cab.className = 'pd-cabecera';
  const fila1 = cab.insertRow(), fila2 = cab.insertRow();
  const celda = (fila, prefijo, campo, colSpan = 1, fuerte = false) => {
    const td = fila.insertCell(); td.colSpan = colSpan; if (fuerte) td.className = 'fuerte';
    const wrap = document.createElement('div'); wrap.className = 'pd-campo';
    if (prefijo) { const b = document.createElement('span'); b.textContent = prefijo; wrap.append(b); }
    const t = casilla(c[campo], v => { c[campo] = v; marcarEditado(); }, prefijo || campo); t.dataset.cab = campo;
    wrap.append(t);
    td.append(wrap);
  };
  celda(fila1, '', 'empresa', 1, true);
  const pd = fila1.insertCell(); pd.className = 'fuerte'; pd.textContent = 'PARTE DIARIO';
  celda(fila1, 'FECHA:', 'fecha'); celda(fila1, 'HALCONERO:', 'halconero');
  celda(fila2, 'CLIMATOLOGIA:', 'clima', 2); celda(fila2, 'HORARIO:', 'horario', 2);
  doc.append(cab);

  for (const s of SECCIONES) {
    const bloque = document.createElement('div'); bloque.className = 'pd-bloque';
    if (s.titulo) { const h = document.createElement('div'); h.className = 'pd-titulo'; h.textContent = s.titulo; bloque.append(h); }
    const scroll = document.createElement('div'); scroll.className = 'pd-scroll';
    const tabla = document.createElement('table'); tabla.className = `pd-tabla pd-${s.key}`;
    const cg = document.createElement('colgroup'); for (const a of s.anchos) { const col = document.createElement('col'); col.style.width = a + '%'; cg.append(col); } tabla.append(cg);
    const th = tabla.createTHead().insertRow(); for (const nombre of s.cols) { const h = document.createElement('th'); h.textContent = nombre; th.append(h); }
    const cuerpo = tabla.createTBody();
    parte.filas[s.key].forEach((fila, i) => {
      const tr = cuerpo.insertRow();
      fila.forEach((valor, j) => {
        const t = casilla(valor, v => { parte.filas[s.key][i][j] = v; marcarEditado(); }, `${s.titulo || 'Cronología'}, fila ${i + 1}, ${s.cols[j]}`);
        Object.assign(t.dataset, {sec:s.key, fila:i, col:j});
        tr.insertCell().append(t);
      });
    });
    scroll.append(tabla); bloque.append(scroll);
    const mas = document.createElement('button'); mas.type = 'button'; mas.className = 'pd-mas'; mas.textContent = '+ Añadir fila';
    mas.addEventListener('click', () => { parte.filas[s.key].push(s.cols.map(() => '')); marcarEditado(); pintarParte(); });
    bloque.append(mas);
    if (s.leyenda) { const l = document.createElement('div'); l.className = 'pd-leyenda'; l.textContent = s.leyenda; bloque.append(l); }
    doc.append(bloque);
  }
  marcarPendientes();
  requestAnimationFrame(ajustarAltos);
}

// ── PDF (A4, mismo orden y columnas que la plantilla) ──────────────────────
function generarPDF() {
  if (!window.jspdf || !window.jspdf.jsPDF) throw new Error('No se ha podido cargar el generador de PDF. Comprueba la conexión a internet y recarga la página.');
  const pdf = new window.jspdf.jsPDF({unit:'mm', format:'a4'});
  const margen = 12, ancho = 210 - margen * 2;
  const base = {theme:'grid', margin:{left:margen, right:margen, top:14, bottom:14}, rowPageBreak:'avoid',
    styles:{font:'helvetica', fontSize:8, textColor:20, lineColor:0, lineWidth:0.2, cellPadding:1.4, valign:'top', overflow:'linebreak'},
    headStyles:{fillColor:false, textColor:0, fontStyle:'bold', halign:'center', valign:'middle', fontSize:7}};
  const anchos = s => Object.fromEntries(s.anchos.map((a, i) => [i, {cellWidth: ancho * a / 100}]));
  const c = parte.cabecera;
  pdf.autoTable({...base, startY:14, body:[[
    {content:c.empresa, styles:{fontStyle:'bold'}}, {content:'PARTE DIARIO', styles:{fontStyle:'bold'}},
    `FECHA: ${c.fecha}`, `HALCONERO: ${c.halconero}`]], styles:{...base.styles, fontSize:9},
    columnStyles:{0:{cellWidth:ancho*.26},1:{cellWidth:ancho*.15},2:{cellWidth:ancho*.27},3:{cellWidth:ancho*.32}}});
  pdf.autoTable({...base, startY:pdf.lastAutoTable.finalY, body:[[`CLIMATOLOGIA: ${c.clima}`, `HORARIO: ${c.horario}`]], styles:{...base.styles, fontSize:9}, columnStyles:{0:{cellWidth:ancho*.52},1:{cellWidth:ancho*.48}}});
  for (const s of SECCIONES) {
    const y = pdf.lastAutoTable.finalY + (s.key === 'crono' ? 0 : 6);
    const filaVacia = s.key === 'crono' ? 9 : 6;
    const cabeza = s.titulo ? [[{content:s.titulo, colSpan:s.cols.length, styles:{fontSize:8}}], s.cols] : [s.cols];
    // Las tablas cortas no se parten: si no caben en lo que queda de hoja, empiezan
    // en la siguiente. La cronología sí puede ocupar varias hojas.
    pdf.autoTable({...base, startY:y, head:cabeza, body:parte.filas[s.key], pageBreak: s.key === 'crono' ? 'auto' : 'avoid',
      columnStyles:anchos(s), styles:{...base.styles, fontSize: s.key === 'fauna' ? 6.5 : 7.5, minCellHeight: filaVacia},
      headStyles:{...base.headStyles, fontSize: s.key === 'fauna' ? 5.5 : 6.5}});
    if (s.leyenda) pdf.autoTable({...base, startY:pdf.lastAutoTable.finalY + (s.key === 'crono' ? 4 : 0), body:[[s.leyenda]], styles:{...base.styles, fontSize:6.5}, pageBreak:'avoid'});
  }
  return pdf;
}
function nombrePDF() { return `parte-fauna-${parte.fecha}.pdf`; }
function descargar(blob, nombre) {
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nombre;
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function pdfBlob() { return generarPDF().output('blob'); }
$('proc-pdf').addEventListener('click', () => {
  if (!confirmarPendientes()) return;
  try { descargar(pdfBlob(), nombrePDF()); setEstado(`PDF descargado: ${nombrePDF()}`); }
  catch (e) { setEstado(e.message, true); }
});
$('proc-reload').addEventListener('click', () => {
  if (parte.editado && !confirm('Se volverá a rellenar el parte con los registros del día y se perderán las correcciones hechas a mano. ¿Continuar?')) return;
  abrirParte({regenerar:true}); guardarBorrador();
});

// ── Correo ─────────────────────────────────────────────────────────────────
// Enviar con adjunto automático necesita un servidor y una cuenta remitente
// (pendiente). Mientras tanto: descarga el PDF y abre el programa de correo con
// todo preparado (mailto no permite adjuntar), o, donde el navegador lo
// permite, «Compartir» manda el PDF ya adjunto a Outlook/Correo.
const envio = leer(ENVIO_KEY);
$('mail-to').value = envio.to || '';
$('mail-to').addEventListener('input', () => { envio.to = $('mail-to').value; guardar(ENVIO_KEY, envio); });
function prepararCorreo() {
  $('mail-subject').value = `Parte diario control de fauna – ${parte.cabecera.fecha}`;
  $('mail-body').value = `Buenos días:\n\nSe adjunta el parte diario de control de fauna del ${parte.cabecera.fecha}${parte.cabecera.halconero ? ` (halconero: ${parte.cabecera.halconero})` : ''}.\n\nUn saludo.`;
}
function destinatarios() {
  const lista = $('mail-to').value.split(/[,;\s]+/).filter(Boolean);
  const malas = lista.filter(d => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d));
  return {lista, malas};
}
$('mail-send').addEventListener('click', () => {
  const {lista, malas} = destinatarios();
  if (!lista.length) { $('mail-status').textContent = 'Escribe al menos una dirección de correo en «Para».'; $('mail-to').focus(); return; }
  if (malas.length) { $('mail-status').textContent = `Revisa esta dirección: ${malas.join(', ')}`; $('mail-to').focus(); return; }
  if (!confirmarPendientes()) return;
  let blob;
  try { blob = pdfBlob(); } catch (e) { $('mail-status').textContent = e.message; return; }
  descargar(blob, nombrePDF());
  const url = `mailto:${lista.join(',')}?subject=${encodeURIComponent($('mail-subject').value)}&body=${encodeURIComponent($('mail-body').value)}`;
  setTimeout(() => { window.location.href = url; }, 400);
  $('mail-status').textContent = `PDF descargado (${nombrePDF()}) y correo abierto. Adjunta el PDF desde la carpeta de descargas y pulsa enviar. Si no se abre ningún programa de correo, este ordenador no tiene uno configurado.`;
});
const puedeCompartir = (() => { try { return !!(navigator.canShare && navigator.canShare({files:[new File([''], 'x.pdf', {type:'application/pdf'})]})); } catch { return false; } })();
$('mail-share').hidden = !puedeCompartir;
$('mail-share').addEventListener('click', async () => {
  try {
    if (!confirmarPendientes()) return;
    const file = new File([pdfBlob()], nombrePDF(), {type:'application/pdf'});
    await navigator.share({files:[file], title:$('mail-subject').value, text:$('mail-body').value});
    $('mail-status').textContent = 'PDF compartido. Comprueba en tu correo que el destinatario es el correcto antes de enviar.';
  } catch (e) { if (e.name !== 'AbortError') $('mail-status').textContent = 'No se pudo compartir: usa «Enviar por correo».'; }
});

// ── Registros sin ordenar por la IA ────────────────────────────────────────
// Los que se guardaron sin cobertura o en los que la IA falló se ordenan aquí
// de una vez, antes de revisar el parte. La cola es la de app.js.
function sinOrdenar() { return datosDelDia(fechaActual()).entradas.filter(e => ['pendiente','ordenando','error'].includes(e.ai)).length; }
function actualizarBotonOrdenar() {
  const n = sinOrdenar(), b = $('proc-ordenar');
  b.hidden = !n; b.textContent = `✨ Ordenar con IA ${n} ${n === 1 ? 'registro pendiente' : 'registros pendientes'}`;
}
$('proc-ordenar').addEventListener('click', async () => {
  const b = $('proc-ordenar'); b.disabled = true; b.textContent = 'Ordenando…';
  await orderPending({retryErrors:true});
  b.disabled = false;
  const n = sinOrdenar();
  if (n) setEstado(`${n} ${n === 1 ? 'registro no se ha podido' : 'registros no se han podido'} ordenar (sin conexión o la IA no responde). Puedes reintentarlo o completarlos a mano.`, true);
  // Si no hay correcciones a mano, el parte se rehace con los registros ya ordenados.
  if (parte && !parte.editado) abrirParte({regenerar:true});
  actualizarBotonOrdenar();
});
window.addEventListener('fauna-registros', () => {
  if (location.hash !== '#procesar' || !parte) return;
  actualizarBotonOrdenar(); actualizarEstado();
});

// ── Pestañas ───────────────────────────────────────────────────────────────
function mostrarVista() {
  const procesar = location.hash === '#procesar';
  $('view-registro').hidden = procesar;
  $('view-procesar').hidden = !procesar;
  $('tab-registro').classList.toggle('active', !procesar);
  $('tab-procesar').classList.toggle('active', procesar);
  if (procesar) abrirParte();
}
window.addEventListener('hashchange', mostrarVista);
$('report-date').addEventListener('change', () => { if (location.hash === '#procesar') abrirParte(); });
mostrarVista();
})();
