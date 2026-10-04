// Parte diario de control de fauna — prueba móvil.
// Todo vive en localStorage de este dispositivo: no hay servidor, ni Word/PDF
// real, ni correo, ni sincronización. Solo se guarda texto, nunca audio.

const usualActions = ['Escribir libremente', 'Inicio de servicio', 'Ronda perimetral', 'Revisión de rodadura y pista', 'Revisión de trampas de conejos', 'Revisión de las trampas', 'Revisión de vegetación', 'Presencia y vuelos en Cab.07', 'Presencia y vuelos en Cab.25', 'Presencia en P. Sur', 'Revisión de trampas (CMD, terminal de carga, bomberos, helipuerto y halconera)', 'Halconera', 'Fin de servicio'];
const labels = {actuacion:'Actuación',fauna:'Fauna',captura:'Captura / trampeo',retirada:'Retirada',impacto:'Impacto',aviso:'Aviso'};
// Códigos tal como vienen en las leyendas de la plantilla Word del parte.
const actionCodes = ['','VI – Vigilancia','V – Vuelos con rapaces','V.M – Vuelos de marcaje','V.Z – Vuelos de caza','V.Z.C – Vuelos de caza con captura','A – Aves rapaces (vuelos y capturas)','P – Perro','S – Sonidos','P.I – Pirotecnia','T – Trampa','R – Red'];
const captureMethods = ['','T – Trampa','L – Lazo','A – Ave de cetrería','P – Perro adiestrado','O – Otro medio (indicar en observaciones)'];
const captureDestinations = ['','A – Alimento para las rapaces','C – C. Recuperación «La Tahonilla»','E – Eutanasia','M – Agente de Medio Ambiente','P – Albergue de animales','L – Liberado'];
const detailFields = {
  actuacion: [['wind','Viento (nudos)'],['observations','Observaciones']],
  fauna: [['species','Nombre común'],['count','Número'],['behavior','Comportamiento'],['altitude','Altitud de vuelo','select',['','0-20','20-100']],['origin','Procedencia (dónde está)'],['destination','Destino (hacia dónde va)'],['action','Actuación','select',actionCodes],['threat','Amenaza / coincide con operaciones','select',['','Sí','No']],['observations','Observaciones']],
  captura: [['species','Nombre común'],['method','Método de captura','select',captureMethods],['count','Número'],['location','Localización'],['destination','Destino del animal','select',captureDestinations],['observations','Observaciones']],
  retirada: [['species','Nombre común'],['count','Número'],['location','Zona de incidencia'],['impact','Procede de impacto','select',['','Sí','No']],['observations','Observaciones']],
  impacto: [['species','Nombre común'],['location','Zona de incidencia'],['aircraft','Matrícula aeronave'],['severity','Severidad'],['observations','Observaciones']],
  aviso: [['direction','Recibido / realizado','select',['Recibido','Realizado']],['source','Procedencia / destino del aviso'],['response','Actuación del SCF / derivada','textarea'],['observations','Observaciones']]
};
const textLabels = {actuacion:'Actuación',fauna:'Descripción breve',captura:'Descripción breve',retirada:'Descripción breve',impacto:'Descripción breve',aviso:'Asunto del aviso'};
const storageKey = 'fauna-parte-prototipo-v1';
const $ = id => document.getElementById(id);
const today = () => new Date().toLocaleDateString('sv-SE');
const now = () => new Date().toTimeString().slice(0,5);

let state;
try { state = JSON.parse(localStorage.getItem(storageKey)) || {}; } catch { state = {}; }
state.reports ||= {};
state.fields ||= {};
function save() {
  try { localStorage.setItem(storageKey, JSON.stringify(state)); }
  catch { $('voice-note').textContent = 'No se pudo guardar en este dispositivo (¿navegación privada?). No cierres la página.'; }
}

const fields = ['agent','start-time','end-time','weather','wind'];
const dateInput = $('report-date');
dateInput.value = today();
function currentEntries() { return state.reports[dateInput.value] || []; }
function dayFields() { return (state.fields[dateInput.value] ||= {}); }

// Halconero: desplegable con un solo nombre. Es siempre quien rellena el parte,
// así que no hay campo de autor.

// ── Hora del hecho ──────────────────────────────────────────────────────
// Antes se rellenaba al cargar la página o al guardar el registro anterior,
// así que con la página abierta un rato se guardaba una hora vieja. Ahora:
//   - mientras el formulario está vacío, la hora va en vivo;
//   - se FIJA en cuanto se empieza el registro (micrófono, texto, plantilla…);
//   - si el agente la cambia a mano, manda la suya;
//   - "usar hora actual" la vuelve a poner en vivo.
let timeMode = 'live'; // 'live' | 'fixed' | 'manual'
function renderTimeNote() {
  const note = $('time-note'); note.replaceChildren();
  if (timeMode === 'live') { note.textContent = 'La hora se fijará al empezar el registro.'; return; }
  note.append(timeMode === 'manual' ? 'Hora corregida a mano. ' : `Hora fijada al empezar el registro (${$('entry-time').value}). `);
  const reset = document.createElement('button'); reset.type = 'button'; reset.textContent = 'Usar hora actual';
  reset.addEventListener('click', () => { $('entry-time').value = now(); timeMode = 'fixed'; renderTimeNote(); });
  note.append(reset);
}
function startEntry() {
  if (timeMode !== 'live') return;
  $('entry-time').value = now(); timeMode = 'fixed'; renderTimeNote();
}
function resetTime() { timeMode = 'live'; $('entry-time').value = now(); renderTimeNote(); }
$('entry-time').addEventListener('input', () => { timeMode = 'manual'; renderTimeNote(); });
// pointerdown llega antes que el click del micrófono: la hora queda fijada
// al pulsar, no al terminar de dictar.
document.querySelector('.composer').addEventListener('pointerdown', event => { if (!event.target.closest('#entry-time, .time-note, #cancel-edit')) startEntry(); });
document.querySelector('.composer').addEventListener('input', event => { if (event.target.id !== 'entry-time') startEntry(); });
function tick() {
  $('clock').textContent = `Hora actual ${now()}`;
  if (timeMode === 'live') $('entry-time').value = now();
}

// ── Lista del día ───────────────────────────────────────────────────────
let editingId = null;
// Casillas que deben ir rellenas en el parte final (observaciones y viento no:
// en los partes reales casi siempre van vacías). Lo que falte se señala para
// completarlo antes de enviar.
const requiredFields = {actuacion:[], fauna:['species','count','behavior','altitude','origin','destination','action','threat'], captura:['species','method','count','location','destination'], retirada:['species','count','location','impact'], impacto:['species','location','aircraft','severity'], aviso:['direction','source','response']};
function missingFields(entry) {
  const titles = Object.fromEntries((detailFields[entry.kind] || []).map(([key,title]) => [key,title]));
  return (requiredFields[entry.kind] || []).filter(key => !entry.details?.[key]).map(key => titles[key] || key);
}
function markPending() {
  const required = requiredFields[$('entry-kind').value] || [];
  let count = 0;
  for (const input of $('detail-fields').querySelectorAll('[data-key]')) {
    const pending = required.includes(input.dataset.key) && !input.value.trim();
    input.classList.toggle('pendiente', pending); if (pending) count++;
  }
  return count;
}
$('detail-fields').addEventListener('input', event => { if (event.target.value.trim()) event.target.classList.remove('pendiente'); });
$('detail-fields').addEventListener('change', event => { if (event.target.value.trim()) event.target.classList.remove('pendiente'); });
function detailSummary(entry) {
  const definitions = detailFields[entry.kind] || [];
  return definitions.map(([key,title]) => entry.details?.[key] ? `${title}: ${entry.details[key]}` : '').filter(Boolean).join(' · ');
}
function renderEntries() {
  const entries = [...currentEntries()].sort((a,b) => a.time.localeCompare(b.time) || a.created - b.created);
  $('entry-count').textContent = `${entries.length} ${entries.length === 1 ? 'registro' : 'registros'}`;
  const list = $('entry-list'); list.replaceChildren();
  if (!entries.length) { const empty = document.createElement('div'); empty.className = 'empty'; empty.textContent = 'Todavía no hay registros para este día. Añade el primero desde el formulario.'; list.append(empty); return; }
  for (const entry of entries) {
    const row = document.createElement('article'); row.className = 'entry' + (entry.id === editingId ? ' is-editing' : '');
    const time = document.createElement('span'); time.className = 'entry-time'; time.textContent = entry.time;
    const body = document.createElement('div');
    const kind = document.createElement('span'); kind.className = 'entry-kind'; kind.textContent = labels[entry.kind] || entry.kind;
    const description = document.createElement('p'); description.textContent = entry.text;
    body.append(kind,description);
    const summary = detailSummary(entry);
    if (summary) { const extra = document.createElement('p'); extra.className = 'entry-details'; extra.textContent = summary; body.append(extra); }
    const missing = missingFields(entry);
    if (missing.length && !['pendiente','ordenando','error'].includes(entry.ai)) { const warn = document.createElement('p'); warn.className = 'entry-missing'; warn.textContent = `Faltan: ${missing.join(', ')}`; body.append(warn); }
    if (entry.ai) body.append(aiStatus(entry));
    const actions = document.createElement('div'); actions.className = 'entry-actions';
    const edit = document.createElement('button'); edit.type = 'button'; edit.title = 'Editar registro'; edit.setAttribute('aria-label','Editar registro de las ' + entry.time); edit.textContent = '✎';
    edit.addEventListener('click', () => beginEdit(entry));
    const remove = document.createElement('button'); remove.type = 'button'; remove.title = 'Eliminar registro'; remove.setAttribute('aria-label','Eliminar registro de las ' + entry.time); remove.textContent = '×';
    remove.addEventListener('click', () => {
      if (!confirm('¿Eliminar este registro?')) return;
      state.reports[dateInput.value] = currentEntries().filter(item => item.id !== entry.id);
      if (editingId === entry.id) clearComposer();
      save(); renderEntries();
    });
    actions.append(edit,remove);
    row.append(time,body,actions); list.append(row);
  }
}

// ── Datos del turno ─────────────────────────────────────────────────────
// Al abrir un día nuevo se copian nombres y horario del último día con datos,
// para revisar. Tiempo, viento y registros empiezan vacíos: nunca se copian
// incidencias de otro día.
function loadFields() {
  let values = state.fields[dateInput.value];
  let previousDate;
  if (!values) {
    previousDate = Object.keys(state.fields).filter(day => day < dateInput.value).sort().at(-1);
    const previous = previousDate ? state.fields[previousDate] : {};
    values = previousDate ? {agent: previous.agent || '', 'start-time': previous['start-time'] || '', 'end-time': previous['end-time'] || ''} : {};
    state.fields[dateInput.value] = values;
    save();
  }
  for (const id of fields) $(id).value = values[id] || '';
  $('carry-note').hidden = !previousDate;
  if (previousDate) $('carry-note').textContent = `Se han copiado los nombres y el horario del ${previousDate}. Revísalos; el tiempo y los registros empiezan vacíos.`;
  clearComposer();
  renderEntries();
}
for (const id of fields) $(id).addEventListener('input', () => { dayFields()[id] = $(id).value; save(); });
dateInput.addEventListener('change', loadFields);

// ── Formulario de registro ──────────────────────────────────────────────
function renderDetailFields(values = {}) {
  const kind = $('entry-kind').value;
  $('entry-text-label').textContent = textLabels[kind];
  const container = $('detail-fields'); container.replaceChildren();
  for (const [key,title,type,options] of detailFields[kind]) {
    const label = document.createElement('label'); label.textContent = title;
    const input = document.createElement(type === 'select' ? 'select' : type === 'textarea' ? 'textarea' : 'input');
    input.dataset.key = key;
    if (type === 'select') for (const choice of options) { const option = document.createElement('option'); option.value = choice; option.textContent = choice || 'Seleccionar'; input.append(option); }
    if (type === 'textarea') input.rows = 3;
    if (key === 'count') input.inputMode = 'numeric';
    if (values[key]) {
      if (type === 'select' && ![...input.options].some(option => option.value === values[key])) { const option = document.createElement('option'); option.value = option.textContent = values[key]; input.append(option); }
      input.value = values[key];
    }
    label.append(input); container.append(label);
  }
}
function collectDetails() { return Object.fromEntries([...$('detail-fields').querySelectorAll('[data-key]')].map(input => [input.dataset.key,input.value.trim()])); }
function updatePresets(values) {
  const isAction = $('entry-kind').value === 'actuacion';
  $('preset-field').hidden = !isAction;
  const select = $('entry-preset'); select.replaceChildren();
  if (isAction) for (const value of usualActions) { const option = document.createElement('option'); option.value = value === 'Escribir libremente' ? '' : value; option.textContent = value; select.append(option); }
  renderDetailFields(values);
}
$('entry-kind').addEventListener('change', () => { const selectedPreset = $('entry-preset').value; if (selectedPreset && $('entry-text').value.trim() === selectedPreset) $('entry-text').value = ''; updatePresets(); });
$('entry-preset').addEventListener('change', () => { if ($('entry-preset').value) $('entry-text').value = $('entry-preset').value; $('entry-text').focus(); });

function clearComposer() {
  classifyRun++; undoSnapshot = null; composerOrdered = false; // descarta una clasificación que aún no haya llegado
  if ($('classify-button')) { $('classify-button').disabled = false; $('classify-button').textContent = '✨ Ordenar con IA'; }
  // Si se guarda con el dictado abierto, que no siga escribiendo en el registro siguiente.
  if (recognition && $('voice-button').classList.contains('listening')) { try { recognition.abort(); } catch { /* ya parado */ } stopListening(); }
  editingId = null;
  $('entry-text').value = ''; $('entry-preset').value = '';
  renderDetailFields();
  document.querySelector('.composer').classList.remove('editing');
  $('entry-title').textContent = 'Nuevo registro';
  $('save-entry').textContent = 'Añadir al parte';
  $('cancel-edit').hidden = true;
  resetTime();
}
function beginEdit(entry) {
  editingId = entry.id;
  $('entry-kind').value = entry.kind;
  updatePresets(entry.details || {});
  $('entry-text').value = entry.text;
  $('entry-time').value = entry.time; timeMode = 'manual'; renderTimeNote();
  document.querySelector('.composer').classList.add('editing');
  $('entry-title').textContent = 'Editando registro';
  $('save-entry').textContent = 'Guardar cambios';
  $('cancel-edit').hidden = false;
  $('voice-note').textContent = 'Corrige lo que haga falta y pulsa «Guardar cambios».';
  renderEntries();
  document.querySelector('.composer').scrollIntoView({behavior:'smooth', block:'start'});
}
$('cancel-edit').addEventListener('click', () => { clearComposer(); renderEntries(); $('voice-note').textContent = 'Edición cancelada.'; });

$('save-entry').addEventListener('click', () => {
  const details = collectDetails();
  const kind = $('entry-kind').value;
  const value = $('entry-text').value.trim() || (details.species ? `${labels[kind]}: ${details.species}${details.count ? ' (' + details.count + ')' : ''}` : '');
  if (!value) { $('entry-text').focus(); $('voice-note').textContent = 'Añade una descripción antes de guardar el registro.'; return; }
  const time = $('entry-time').value || now();
  state.reports[dateInput.value] ||= [];
  const existing = editingId && state.reports[dateInput.value].find(item => item.id === editingId);
  // Texto libre = no se eligió actuación habitual, no se ordenó ya en el
  // formulario y no hay ninguna casilla rellena («Recibido» es solo el valor
  // por defecto del desplegable de avisos). Eso es lo que ordena la IA.
  const freeText = !composerOrdered && !$('entry-preset').value && !Object.entries(details).some(([key,v]) => v && key !== 'direction');
  const aiFields = freeText ? {ai:'pendiente', seccion: kind === 'actuacion' ? '' : kind, dictado:value} : {};
  if (existing) {
    const keepAi = existing.ai === 'ordenado' ? {ai:'ordenado'} : aiFields;
    delete existing.ai; delete existing.seccion;
    Object.assign(existing, {time,kind,text:value,details,edited:Date.now()}, keepAi);
  }
  else state.reports[dateInput.value].push({id:newId(),created:Date.now(),time,kind,text:value,details,...aiFields});
  save();
  $('voice-note').textContent = existing ? 'Registro actualizado.' : `Registro añadido a las ${time}.${freeText ? ' La IA lo ordena ahora en segundo plano; puedes seguir con el siguiente.' : ''}`;
  clearComposer(); renderEntries();
  if (freeText) orderPending();
});
function newId() { return crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2); }

// ── Voz ─────────────────────────────────────────────────────────────────
// Reconocimiento del navegador si existe; si no (o si falla, típico en iPhone
// con la app añadida a pantalla de inicio), se enfoca el campo para usar el
// micrófono del teclado, que en iOS y Android funciona siempre.
const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition;
let voiceTarget = $('entry-text');
document.querySelector('.composer').addEventListener('focusin', event => { if (event.target === $('entry-text') || event.target.matches('#detail-fields input,#detail-fields textarea')) voiceTarget = event.target; });
function keyboardFallback(message) {
  const target = voiceTarget.isConnected ? voiceTarget : $('entry-text');
  target.focus();
  $('voice-note').textContent = message || 'Pulsa el micrófono del teclado para dictar en este campo.';
}
function stopListening() { $('voice-button').classList.remove('listening'); $('voice-label').textContent = 'Dictar registro'; }
if (Recognition) {
  recognition = new Recognition(); recognition.lang = 'es-ES'; recognition.continuous = false; recognition.interimResults = false;
  recognition.onresult = event => {
    const text = event.results[0][0].transcript.trim();
    if (!voiceTarget.isConnected) voiceTarget = $('entry-text');
    voiceTarget.value = [voiceTarget.value.trim(),text].filter(Boolean).join(' ');
    $('voice-note').textContent = 'Transcripción añadida al campo seleccionado. Revísala antes de guardar.';
  };
  recognition.onerror = event => {
    stopListening();
    if (event.error === 'no-speech' || event.error === 'aborted') { $('voice-note').textContent = 'No se ha oído nada. Vuelve a pulsar y habla cerca del teléfono.'; return; }
    if (event.error === 'not-allowed') { $('voice-note').textContent = 'El navegador no tiene permiso de micrófono. Actívalo en los ajustes o usa el micrófono del teclado.'; return; }
    // service-not-allowed, network, etc.: el dictado del navegador no sirve aquí.
    recognition = null;
    keyboardFallback('El dictado directo no está disponible en este navegador. Usa el micrófono del teclado.');
  };
  recognition.onend = stopListening;
}
$('voice-button').addEventListener('click', () => {
  startEntry();
  if (!recognition) { keyboardFallback(); return; }
  if ($('voice-button').classList.contains('listening')) { recognition.stop(); return; }
  try {
    recognition.start();
    $('voice-button').classList.add('listening'); $('voice-label').textContent = 'Detener dictado';
    $('voice-note').textContent = 'Escuchando… Pulsa otra vez para detener.';
  } catch { keyboardFallback(); }
});
if (!Recognition) $('voice-note').textContent = 'En este navegador se dicta con el micrófono del teclado.';

// ── Ordenar con IA ──────────────────────────────────────────────────────
// La IA recibe el texto ya transcrito (nunca audio) y devuelve sección,
// casillas y, si se dijo, la hora. Dos formas de usarla:
//   - En segundo plano (lo normal): el agente guarda el dictado al momento y
//     sigue trabajando; la IA ordena el registro guardado un par de segundos
//     después. Si no hay cobertura o falla, queda «Sin ordenar» y se reintenta
//     al volver la conexión, al abrir la app o desde la pestaña «Procesar».
//   - Con el botón del formulario, para verlo ordenado antes de guardar.
// Lo que la IA no detecta queda en blanco y marcado «Faltan: …».
const CLASSIFY_URL = '/.netlify/functions/fauna-clasificar';
let classifyRun = 0;
let undoSnapshot = null;
let composerOrdered = false;
async function requestOrdering(texto, seccion) {
  const res = await fetch(CLASSIFY_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({texto, seccion: seccion || undefined}), signal: AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined});
  const data = await res.json().catch(() => ({}));
  return {ok: res.ok, status: res.status, data};
}

// Registros guardados como texto libre → ordenados por la IA, uno tras otro.
let ordering = false;
function findEntry(id) {
  for (const [date, list] of Object.entries(state.reports)) { const entry = list.find(item => item.id === id); if (entry) return {date, entry}; }
  return {};
}
function notifyChange() { save(); renderEntries(); window.dispatchEvent(new Event('fauna-registros')); }
async function orderPending({retryErrors = false} = {}) {
  if (ordering) return;
  ordering = true;
  try {
    // La cola se revisa en cada vuelta: lo que se guarde mientras la IA trabaja
    // también entra. `tried` evita repetir en esta pasada uno que acaba de fallar.
    const tried = new Set();
    for (;;) {
      let entry = Object.values(state.reports).flat().find(e => !tried.has(e.id) && e.id !== editingId && (e.ai === 'pendiente' || (retryErrors && e.ai === 'error')));
      if (!entry) break;
      const id = entry.id; tried.add(id);
      entry.ai = 'ordenando'; notifyChange();
      let result;
      try { result = await requestOrdering(entry.dictado || entry.text, entry.seccion); }
      catch { result = {ok:false, status:0, data:{}}; }
      ({entry} = findEntry(id));
      if (!entry) continue; // borrado mientras tanto
      if (entry.id === editingId) { entry.ai = 'pendiente'; notifyChange(); continue; }
      if (result.ok && result.data.kind) {
        const {data} = result;
        entry.dictado ||= entry.text;
        Object.assign(entry, {kind:data.kind, text:data.text || entry.dictado, details:data.details || {}, ai:'ordenado'});
        if (data.time && data.time !== entry.time) { entry.horaGuardada = entry.time; entry.time = data.time; }
        notifyChange();
      } else {
        entry.ai = 'error'; entry.aiError = result.status === 0 ? 'sin conexión' : (result.data.error || 'la IA no respondió');
        notifyChange();
        // Sin conexión o IA no configurada: no tiene sentido seguir con el resto ahora.
        if (result.status === 0 || result.status === 503) break;
      }
    }
  } finally { ordering = false; }
}
function aiStatus(entry) {
  const p = document.createElement('p'); p.className = 'entry-ai ai-' + entry.ai;
  const link = (text, onClick) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'link-button'; b.textContent = text; b.addEventListener('click', onClick); return b; };
  if (entry.ai === 'ordenando') p.textContent = '⏳ Ordenando con IA…';
  else if (entry.ai === 'pendiente') p.textContent = '⏳ Pendiente de ordenar con IA';
  else if (entry.ai === 'error') p.append(`Sin ordenar (${entry.aiError || 'la IA no respondió'}). `, link('Reintentar', () => { entry.ai = 'pendiente'; notifyChange(); orderPending(); }));
  else if (entry.ai === 'ordenado') p.append('✨ Ordenado por IA · ', link('Deshacer', () => {
    // Vuelve al texto tal como se dictó, en la sección que eligió el agente.
    Object.assign(entry, {text: entry.dictado || entry.text, kind: entry.seccion || 'actuacion', details: {}, time: entry.horaGuardada || entry.time});
    delete entry.ai; delete entry.dictado; delete entry.seccion; delete entry.aiError; delete entry.horaGuardada;
    notifyChange();
  }));
  return p;
}
function snapshot() { return {kind:$('entry-kind').value, text:$('entry-text').value, details:collectDetails(), time:$('entry-time').value, timeMode}; }
function restore(snap) {
  $('entry-kind').value = snap.kind; updatePresets(snap.details);
  $('entry-text').value = snap.text; $('entry-time').value = snap.time; timeMode = snap.timeMode; renderTimeNote();
}
function aiNote(message, withUndo) {
  const note = $('voice-note'); note.replaceChildren(message);
  if (withUndo && undoSnapshot) {
    const undo = document.createElement('button'); undo.type = 'button'; undo.className = 'link-button'; undo.textContent = 'Deshacer';
    undo.addEventListener('click', () => { restore(undoSnapshot); undoSnapshot = null; composerOrdered = false; aiNote('Se ha recuperado el texto dictado tal cual.'); });
    note.append(' ', undo);
  }
}
async function classify() {
  const dictated = $('entry-text').value.trim();
  if (!dictated) { $('entry-text').focus(); aiNote('Dicta o escribe primero lo ocurrido en la descripción.'); return; }
  const run = ++classifyRun;
  const button = $('classify-button'); button.disabled = true; button.textContent = 'Ordenando…';
  aiNote('Ordenando con IA…');
  try {
    const kindChosen = $('entry-kind').value;
    const res = await requestOrdering(dictated, kindChosen === 'actuacion' ? '' : kindChosen);
    const data = res.data;
    if (run !== classifyRun) return; // se guardó o se borró el registro mientras tanto
    if (!res.ok) { aiNote((data.error || 'La IA no ha podido ordenar el texto.') + ' Puedes completar las casillas a mano.'); return; }
    undoSnapshot = snapshot(); composerOrdered = true;
    $('entry-kind').value = data.kind; updatePresets(data.details || {});
    $('entry-text').value = data.text || dictated;
    if (data.time) { $('entry-time').value = data.time; timeMode = 'manual'; renderTimeNote(); }
    const pending = markPending();
    aiNote(`Ordenado como «${labels[data.kind] || data.kind}». ${pending === 1 ? '1 casilla ha quedado en blanco (en amarillo): complétala ahora o al procesar el parte. ' : pending ? `${pending} casillas han quedado en blanco (en amarillo): complétalas ahora o al procesar el parte. ` : ''}Revisa y pulsa «Añadir al parte».`, true);
  } catch {
    if (run === classifyRun) aiNote('Sin conexión con la IA. Puedes completar las casillas a mano.');
  } finally {
    if (run === classifyRun) { button.disabled = false; button.textContent = '✨ Ordenar con IA'; }
  }
}
$('classify-button').addEventListener('click', () => { startEntry(); classify(); });

updatePresets(); loadFields(); tick(); setInterval(tick, 15000);
// Si se cerró la app mientras la IA ordenaba, ese registro vuelve a la cola.
for (const entry of Object.values(state.reports).flat()) if (entry.ai === 'ordenando') entry.ai = 'pendiente';
save();
orderPending({retryErrors:true});
window.addEventListener('online', () => orderPending({retryErrors:true}));
// Al volver a la pestaña tras horas en segundo plano, refrescar el reloj ya
// (los intervalos se congelan en móvil).
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
// Ruta relativa: la app vive en /fauna/ y en la raíz hay OTRO sw.js (el de
// Ofipapel) que no debe registrarse desde aquí.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
