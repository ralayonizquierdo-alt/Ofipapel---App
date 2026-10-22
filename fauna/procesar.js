// Pestaña «Procesar y enviar el parte» (móvil y ordenador, misma página que el
// registro de app.js): abre el parte del día con el formato
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

// La cronología abre siempre con «Inicio de servicio» y cierra con «Fin de
// servicio», a la hora del horario del turno. Si el halconero ya lo apuntó
// como registro, se usa ese (con su hora) en lugar de duplicarlo.
const INICIO = 'Inicio de servicio', FIN = 'Fin de servicio';
const esInicio = t => /^\s*inicio de(l)? servicio/i.test(String(t || ''));
const esFin = t => /^\s*fin de(l)? servicio/i.test(String(t || ''));

// `solo` (opcional): ids de registros; devuelve solo sus filas, sin inicio ni
// fin de servicio (para añadirlos a un parte ya corregido a mano).
function construirParte(fecha, solo = null) {
  const dia = datosDelDia(fecha), campos = dia.campos;
  const entradas = solo ? dia.entradas.filter(e => solo.has(e.id)) : dia.entradas;
  const d = (e, k) => String((e.details || {})[k] || '').trim();
  const texto = e => String(e.text || '').trim();
  const de = tipo => entradas.filter(e => e.kind === tipo);
  const horario = [campos['start-time'], campos['end-time']].filter(Boolean).join(' – ');
  return {
    fecha,
    huella: huella(fecha),
    editado: null,
    incluidos: dia.entradas.map(e => e.id),
    cabecera: {empresa:'FENIX CONTROL DE FAUNA', fecha:fechaES(fecha), halconero:campos.agent || '', clima:campos.weather || '', horario},
    filas: {
      crono: (() => {
        const fila = e => {
          let actuacion = texto(e);
          if (e.kind === 'aviso') actuacion = `Aviso ${(d(e,'direction') || 'recibido').toLowerCase()}: ${actuacion}`;
          else if (e.kind !== 'actuacion') actuacion = `${ETIQUETAS[e.kind] || 'Registro'}: ${actuacion}`;
          return [e.time || '', d(e,'wind'), actuacion, e.kind === 'aviso' ? 'AVISO' : d(e,'observations')];
        };
        const propia = (prueba, hora, nombre) => {
          const e = entradas.find(x => x.kind === 'actuacion' && prueba(texto(x)));
          return e ? fila(e) : [hora || '', '', nombre, ''];
        };
        if (solo) return entradas.map(fila);
        const inicio = propia(esInicio, campos['start-time'], INICIO);
        const fin = propia(esFin, campos['end-time'], FIN);
        if (!inicio[1]) inicio[1] = campos.wind || '';
        const resto = entradas.filter(e => !(e.kind === 'actuacion' && (esInicio(texto(e)) || esFin(texto(e))))).map(fila);
        return [inicio, ...resto, fin];
      })(),
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
  if (!guardar(BORRADOR_KEY, borradores)) setEstado('No se pudo guardar el borrador en este dispositivo.', true);
}
function abrirParte({regenerar = false} = {}) {
  const fecha = fechaActual();
  $('proc-date').textContent = fechaES(fecha);
  // El borrador guardado solo se usa si tiene correcciones a mano: si no, el
  // parte se rehace siempre con los registros, así sale al momento lo último
  // que se haya dictado.
  const borrador = leer(BORRADOR_KEY)[fecha];
  if (borrador?.editado && !regenerar) { parte = borrador; añadirNuevos(); }
  else {
    parte = construirParte(fecha);
    for (const s of SECCIONES) parte.filas[s.key] = conHueco(s, parte.filas[s.key]);
  }
  pintarParte();
  actualizarEstado();
  prepararCorreo();
  actualizarBotonOrdenar();
  rellenarViento();
}

// ── Viento de cada actuación (METAR de Tenerife Sur) ───────────────────────
// Rellena solo las casillas de viento VACÍAS de la cronología que tengan hora,
// con la observación del aeropuerto más cercana a esa hora
// (netlify/functions/fauna-viento.js). Lo escrito a mano nunca se toca. Sin
// cobertura o sin función (copia de GitHub Pages) no pasa nada: quedan vacías.
const VIENTO_URL = '/.netlify/functions/fauna-viento';
const vientoPorFecha = {};
// Milisegundos UTC de una hora HH:MM de ese día en Canarias (con su horario de verano).
function instanteCanarias(fecha, hhmm) {
  const [a, m, d] = fecha.split('-').map(Number), [h, mi] = hhmm.split(':').map(Number);
  const supuesto = Date.UTC(a, m - 1, d, h, mi);
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).formatToParts(new Date(supuesto)).map(x => [x.type, x.value]));
  const local = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute);
  return supuesto - (local - supuesto);
}
async function rellenarViento() {
  const fecha = parte.fecha, s = SECCIONES.find(x => x.key === 'crono');
  const cHora = s.cols.indexOf('HORA'), cViento = s.cols.indexOf('VIENTO (NUDOS)');
  const huecos = () => parte.filas.crono.filter(f => tieneDatos(f) && !String(f[cViento]).trim() && minutos(f[cHora]) !== null);
  if (!huecos().length) return;
  let datos = vientoPorFecha[fecha];
  if (!datos) {
    try {
      const r = await fetch(`${VIENTO_URL}?fecha=${fecha}`);
      if (!r.ok) return;
      datos = vientoPorFecha[fecha] = await r.json();
    } catch { return; }
  }
  if (!parte || parte.fecha !== fecha) return; // se cambió de día mientras llegaba
  const obs = (datos.observaciones || []).filter(o => o.t <= Date.now());
  const margen = (datos.fuente === 'metar' ? 35 : 45) * 6e4;
  let puestas = 0;
  for (const f of huecos()) {
    const m = minutos(f[cHora]);
    const t = instanteCanarias(fecha, `${Math.floor(m / 60)}:${m % 60}`);
    const o = obs.reduce((mejor, x) => Math.abs(x.t - t) < Math.abs((mejor?.t ?? Infinity) - t) ? x : mejor, null);
    if (!o || Math.abs(o.t - t) > margen) continue;
    f[cViento] = o.racha ? `${o.kt} G${o.racha}` : String(o.kt);
    puestas++;
  }
  if (!puestas) return;
  // Si el cursor está en una casilla, no se repinta (se perdería lo que se escribe).
  if (parte.editado) guardarBorrador();
  if (document.activeElement?.dataset?.sec) return;
  pintarParte();
  const nota = $('proc-viento');
  if (nota) nota.textContent = datos.fuente === 'metar'
    ? `💨 Viento rellenado en ${puestas} ${puestas === 1 ? 'línea' : 'líneas'} con el METAR de Tenerife Sur (lo medido en el aeropuerto a esa hora, ±30 min). Revísalo.`
    : `💨 Viento rellenado en ${puestas} ${puestas === 1 ? 'línea' : 'líneas'} con una ESTIMACIÓN (Open-Meteo): para esa fecha ya no hay METAR. Revísalo.`;
}
// En un parte corregido a mano, los registros nuevos se añaden sin perder las
// correcciones. Solo cuando la IA ya los ha ordenado (o no ha podido), para no
// meter el dictado en bruto y que luego cambie de sección. Lo que cambie en un
// registro que ya estaba en el parte sigue avisándose con «Recargar».
function añadirNuevos() {
  if (!Array.isArray(parte.incluidos)) return false; // borrador antiguo
  const {entradas} = datosDelDia(parte.fecha), ya = new Set(parte.incluidos);
  // ¿El parte estaba al día antes de estos registros? (huella sin los nuevos)
  const sinNuevos = JSON.stringify({campos: datosDelDia(parte.fecha).campos, entradas: entradas.filter(e => ya.has(e.id))});
  const listos = entradas.filter(e => !ya.has(e.id) && e.ai !== 'pendiente' && e.ai !== 'ordenando');
  if (!listos.length) return false;
  const soloAñadidos = parte.huella === sinNuevos && listos.length === entradas.filter(e => !ya.has(e.id)).length;
  const nuevas = construirParte(parte.fecha, new Set(listos.map(e => e.id))).filas;
  for (const s of SECCIONES) {
    for (const f of nuevas[s.key]) {
      const filas = parte.filas[s.key], hueco = filas.findIndex(x => !tieneDatos(x));
      if (hueco >= 0) filas[hueco] = f; else filas.push(f);
    }
    if (nuevas[s.key].length && s.cols.includes('HORA')) ordenarFilas(s);
  }
  parte.incluidos.push(...listos.map(e => e.id));
  // Si lo único que había cambiado eran registros nuevos, el parte vuelve a estar al día.
  if (soloAñadidos) parte.huella = huella(parte.fecha);
  guardarBorrador();
  return true;
}
function actualizarEstado() {
  const {entradas} = datosDelDia(parte.fecha);
  const desfasado = parte.huella !== huella(parte.fecha);
  if (desfasado) setEstado(`Ojo: los registros del día han cambiado desde que se abrió este parte${parte.editado ? ' y has hecho correcciones a mano' : ''}. Pulsa «Recargar desde los registros» para incorporarlos${parte.editado ? ' (se perderán tus correcciones)' : ''}.`, true);
  else if (parte.editado) setEstado(`Parte con correcciones a mano (última a las ${new Date(parte.editado).toTimeString().slice(0,5)}). Guardado en este dispositivo.`);
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
    if (!fila) continue;
    t.classList.toggle('pendiente', fila.some(v => String(v).trim()) && !opcional(s, j) && !t.value.trim());
  }
  // Las filas de relleno vacías no muestran los botones de mover/quitar.
  for (const tr of $('parte').querySelectorAll('.pd-tabla tbody tr')) tr.classList.toggle('pd-vacia', ![...tr.querySelectorAll('textarea')].some(t => t.value.trim()));
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
    // La última columna (botón para quitar la fila) solo existe en pantalla: el
    // PDF se genera desde parte.filas y no la ve.
    const cg = document.createElement('colgroup'); for (const a of s.anchos) { const col = document.createElement('col'); col.style.width = (a * 0.95) + '%'; cg.append(col); }
    const colCtrl = document.createElement('col'); colCtrl.style.width = '5%'; cg.append(colCtrl); tabla.append(cg);
    const th = tabla.createTHead().insertRow(); for (const nombre of s.cols) { const h = document.createElement('th'); h.textContent = nombre; th.append(h); }
    const thCtrl = document.createElement('th'); thCtrl.className = 'pd-ctrl'; thCtrl.setAttribute('aria-label', 'Quitar fila'); th.append(thCtrl);
    const colHora = s.cols.indexOf('HORA');
    const cuerpo = tabla.createTBody();
    const filas = parte.filas[s.key];
    filas.forEach((fila, i) => {
      const tr = cuerpo.insertRow();
      fila.forEach((valor, j) => {
        const t = casilla(valor, v => { parte.filas[s.key][i][j] = v; marcarEditado(); }, `${s.titulo || 'Cronología'}, fila ${i + 1}, ${s.cols[j]}`);
        Object.assign(t.dataset, {sec:s.key, fila:i, col:j});
        // Al terminar de cambiar una hora (al salir de la casilla), la fila se
        // recoloca sola en su sitio.
        // setTimeout: se espera a que el foco haya pasado a la casilla que se tocó.
        if (j === colHora) t.addEventListener('change', () => setTimeout(() => ordenarPorHora(s), 0));
        tr.insertCell().append(t);
      });
      const ctrl = tr.insertCell(); ctrl.className = 'pd-ctrl';
      ctrl.append(botonFila('×', `Quitar fila ${i + 1}`, () => quitarFila(s, i)));
    });
    scroll.append(tabla); bloque.append(scroll);
    const herramientas = document.createElement('div'); herramientas.className = 'pd-herramientas';
    const mas = document.createElement('button'); mas.type = 'button'; mas.className = 'pd-mas'; mas.textContent = '+ Añadir fila';
    mas.addEventListener('click', () => { parte.filas[s.key].push(s.cols.map(() => '')); marcarEditado(); pintarParte(); });
    herramientas.append(mas);
    bloque.append(herramientas);
    if (s.leyenda) { const l = document.createElement('div'); l.className = 'pd-leyenda'; l.textContent = s.leyenda; bloque.append(l); }
    doc.append(bloque);
  }
  marcarPendientes();
  requestAnimationFrame(ajustarAltos);
}

// ── Quitar filas y recolocarlas por hora ───────────────────────────────────
function botonFila(texto, etiqueta, accion) {
  const b = document.createElement('button'); b.type = 'button'; b.className = 'pd-btn'; b.textContent = texto;
  b.title = etiqueta; b.setAttribute('aria-label', etiqueta);
  b.addEventListener('click', accion);
  return b;
}
function tieneDatos(fila) { return fila.some(v => String(v).trim()); }
function quitarFila(s, i) {
  const filas = parte.filas[s.key];
  if (tieneDatos(filas[i]) && !confirm('¿Quitar esta fila del parte? Sus datos se borrarán del parte (no de los registros del día).')) return;
  filas.splice(i, 1);
  pintarParte(); // primero redibujar: las casillas viejas apuntan a filas que ya no existen
  marcarEditado();
}
// Hora válida → minutos desde las 00:00; admite «9:05», «09.05», «9h05» o «0905».
function minutos(hora) {
  const m = String(hora || '').trim().match(/^(\d{1,2})[:.h]?(\d{2})$/);
  return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null;
}
function ordenarPorHora(s) {
  const activa = document.activeElement?.dataset?.sec ? document.activeElement : null;
  const filaActiva = activa && parte.filas[activa.dataset.sec][+activa.dataset.fila];
  const {cambiado, sinHora} = ordenarFilas(s);
  if (!cambiado) return;
  pintarParte();
  marcarEditado();
  if (activa) {
    const nueva = parte.filas[activa.dataset.sec].indexOf(filaActiva);
    $('parte').querySelector(`textarea[data-sec="${activa.dataset.sec}"][data-fila="${nueva}"][data-col="${activa.dataset.col}"]`)?.focus();
  }
  if (sinHora) setEstado(`${sinHora} ${sinHora === 1 ? 'fila no tiene' : 'filas no tienen'} una hora válida (formato 09:30) y ${sinHora === 1 ? 'se ha dejado' : 'se han dejado'} detrás de las demás.`, true);
}
// Recoloca las filas de una sección por hora (sin repintar). Devuelve si algo cambió.
function ordenarFilas(s) {
  const col = s.cols.indexOf('HORA');
  const filas = parte.filas[s.key];
  const conHora = [], sinHora = [], vacias = [];
  for (const f of filas) (!tieneDatos(f) ? vacias : minutos(f[col]) === null ? sinHora : conHora).push(f);
  // En la cronología, inicio y fin de servicio no se mueven de su sitio.
  const act = s.cols.indexOf('ACTUACIONES');
  const fijo = f => act < 0 ? 0 : esInicio(f[act]) ? -1 : esFin(f[act]) ? 1 : 0;
  conHora.sort((a, b) => minutos(a[col]) - minutos(b[col])); // sort es estable: a igual hora, se respeta el orden
  let formatoCambiado = false;
  for (const f of conHora) {
    const m = minutos(f[col]), bonita = `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    if (f[col] !== bonita) { f[col] = bonita; formatoCambiado = true; }
  }
  // Inicio siempre arriba y fin siempre al final (tengan hora o no).
  const datos = [...conHora, ...sinHora];
  const nuevas = [...datos.filter(f => fijo(f) < 0), ...datos.filter(f => !fijo(f)), ...datos.filter(f => fijo(f) > 0), ...vacias];
  // Si nada se mueve ni cambia de formato, no se redibuja (no se pierde el cursor).
  if (!formatoCambiado && nuevas.every((f, i) => f === filas[i])) return {cambiado: false, sinHora: sinHora.length};
  parte.filas[s.key] = nuevas;
  return {cambiado: true, sinHora: sinHora.length};
}

// ── PDF (A4, mismo orden y columnas que la plantilla) ──────────────────────
// El generador (~450 KB) solo se descarga al abrir esta pestaña, no al abrir la
// app en pista, que es donde importan los datos móviles.
const LIBRERIAS_PDF = ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/4.2.1/jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/5.0.8/jspdf.plugin.autotable.min.js'];
let cargaPDF = null;
function cargarPDF() {
  cargaPDF ||= LIBRERIAS_PDF.reduce((previa, src) => previa.then(() => new Promise((ok, mal) => {
    const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = () => mal(new Error('No se ha podido descargar el generador de PDF. Comprueba la conexión a internet.'));
    document.head.append(s);
  })), Promise.resolve()).catch(e => { cargaPDF = null; throw e; });
  return cargaPDF;
}
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
$('proc-pdf').addEventListener('click', async () => {
  if (!confirmarPendientes()) return;
  try { await cargarPDF(); descargar(pdfBlob(), nombrePDF()); setEstado(`PDF descargado: ${nombrePDF()}`); }
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
$('mail-send').addEventListener('click', async () => {
  const {lista, malas} = destinatarios();
  if (!lista.length) { $('mail-status').textContent = 'Escribe al menos una dirección de correo en «Para».'; $('mail-to').focus(); return; }
  if (malas.length) { $('mail-status').textContent = `Revisa esta dirección: ${malas.join(', ')}`; $('mail-to').focus(); return; }
  if (!confirmarPendientes()) return;
  let blob;
  try { await cargarPDF(); blob = pdfBlob(); } catch (e) { $('mail-status').textContent = e.message; return; }
  descargar(blob, nombrePDF());
  const url = `mailto:${lista.join(',')}?subject=${encodeURIComponent($('mail-subject').value)}&body=${encodeURIComponent($('mail-body').value)}`;
  setTimeout(() => { window.location.href = url; }, 400);
  $('mail-status').textContent = `PDF descargado (${nombrePDF()}) y correo abierto. Adjunta el PDF desde la carpeta de descargas y pulsa enviar. Si no se abre ningún programa de correo, este dispositivo no tiene uno configurado.`;
});
const puedeCompartir = (() => { try { return !!(navigator.canShare && navigator.canShare({files:[new File([''], 'x.pdf', {type:'application/pdf'})]})); } catch { return false; } })();
$('mail-share').hidden = !puedeCompartir;
$('mail-share').addEventListener('click', async () => {
  try {
    if (!confirmarPendientes()) return;
    await cargarPDF();
    const file = new File([pdfBlob()], nombrePDF(), {type:'application/pdf'});
    await navigator.share({files:[file], title:$('mail-subject').value, text:$('mail-body').value});
    $('mail-status').textContent = 'PDF compartido. Comprueba en tu correo que el destinatario es el correcto antes de enviar.';
  } catch (e) { if (e.name !== 'AbortError') $('mail-status').textContent = 'No se pudo compartir: usa «Enviar por correo».'; }
});

// ── Registros sin ordenar por la IA ────────────────────────────────────────
// Los que se guardaron sin cobertura o en los que la IA falló se ordenan aquí
// de una vez, antes de revisar el parte. La cola es la de app.js.
function sinOrdenar() { return datosDelDia(fechaActual()).entradas.filter(e => ['pendiente','ordenando','error'].includes(e.ai) || ['pendiente','ordenando','error'].includes(e.ampliarEstado)).length; }
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
// Un registro nuevo (o la IA que termina de ordenar uno) se ve en el parte al
// momento, también con esta pestaña abierta; salvo mientras se escribe en una
// casilla, para no quitarle el cursor a nadie (se ve al salir de ella).
function refrescarParte() {
  if (location.hash !== '#procesar' || !parte) return;
  if (!document.activeElement?.dataset?.sec) {
    if (!parte.editado) abrirParte({regenerar:true});
    else if (añadirNuevos()) pintarParte();
  }
  actualizarBotonOrdenar(); actualizarEstado();
}
window.addEventListener('fauna-registros', refrescarParte);
// Otra pestaña del mismo dispositivo (p. ej. el registro abierto aparte).
window.addEventListener('storage', e => { if (e.key === REGISTROS_KEY) refrescarParte(); });

// ── Pestañas ───────────────────────────────────────────────────────────────
function mostrarVista() {
  const procesar = location.hash === '#procesar';
  $('view-registro').hidden = procesar;
  $('view-procesar').hidden = !procesar;
  $('tab-registro').classList.toggle('active', !procesar);
  $('tab-procesar').classList.toggle('active', procesar);
  if (procesar) { abrirParte(); cargarPDF().catch(() => {}); }
}
window.addEventListener('hashchange', mostrarVista);
$('report-date').addEventListener('change', () => { if (location.hash === '#procesar') abrirParte(); });
mostrarVista();
})();
