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
  classifyRun++; undoSnapshot = null; // descarta una clasificación que aún no haya llegado
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
  if (existing) Object.assign(existing, {time,kind,text:value,details,edited:Date.now()});
  else state.reports[dateInput.value].push({id:newId(),created:Date.now(),time,kind,text:value,details});
  save();
  $('voice-note').textContent = existing ? 'Registro actualizado.' : `Registro añadido a las ${time}. Solo se ha guardado el texto.`;
  clearComposer(); renderEntries();
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
    // Dictado en la descripción de un registro nuevo: se ordena solo con la IA.
    if (voiceTarget === $('entry-text') && !editingId) classify();
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
// Manda el texto dictado (nunca audio) a la función fauna-clasificar, que
// devuelve sección, casillas y, si se dijo, la hora. Solo RELLENA el
// formulario: el agente revisa y pulsa «Añadir al parte» como siempre. Si la
// IA no está configurada, no hay cobertura o falla, todo queda como estaba.
const CLASSIFY_URL = '/.netlify/functions/fauna-clasificar';
let classifyRun = 0;
let undoSnapshot = null;
function snapshot() { return {kind:$('entry-kind').value, text:$('entry-text').value, details:collectDetails(), time:$('entry-time').value, timeMode}; }
function restore(snap) {
  $('entry-kind').value = snap.kind; updatePresets(snap.details);
  $('entry-text').value = snap.text; $('entry-time').value = snap.time; timeMode = snap.timeMode; renderTimeNote();
}
function aiNote(message, withUndo) {
  const note = $('voice-note'); note.replaceChildren(message);
  if (withUndo && undoSnapshot) {
    const undo = document.createElement('button'); undo.type = 'button'; undo.className = 'link-button'; undo.textContent = 'Deshacer';
    undo.addEventListener('click', () => { restore(undoSnapshot); undoSnapshot = null; aiNote('Se ha recuperado el texto dictado tal cual.'); });
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
    const res = await fetch(CLASSIFY_URL, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({texto:dictated})});
    const data = await res.json().catch(() => ({}));
    if (run !== classifyRun) return; // se guardó o se borró el registro mientras tanto
    if (!res.ok) { aiNote((data.error || 'La IA no ha podido ordenar el texto.') + ' Puedes completar las casillas a mano.'); return; }
    undoSnapshot = snapshot();
    $('entry-kind').value = data.kind; updatePresets(data.details || {});
    $('entry-text').value = data.text || dictated;
    if (data.time) { $('entry-time').value = data.time; timeMode = 'manual'; renderTimeNote(); }
    aiNote(`Ordenado como «${labels[data.kind] || data.kind}». Revisa las casillas y pulsa «Añadir al parte».`, true);
  } catch {
    if (run === classifyRun) aiNote('Sin conexión con la IA. Puedes completar las casillas a mano.');
  } finally {
    if (run === classifyRun) { button.disabled = false; button.textContent = '✨ Ordenar con IA'; }
  }
}
$('classify-button').addEventListener('click', () => { startEntry(); classify(); });

updatePresets(); loadFields(); tick(); setInterval(tick, 15000);
// Al volver a la pestaña tras horas en segundo plano, refrescar el reloj ya
// (los intervalos se congelan en móvil).
document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
// Ruta relativa: la app vive en /fauna/ y en la raíz hay OTRO sw.js (el de
// Ofipapel) que no debe registrarse desde aquí.
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
