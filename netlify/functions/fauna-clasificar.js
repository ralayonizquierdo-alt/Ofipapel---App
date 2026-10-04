// Clasificación por IA de lo que dicta un agente de control de fauna
// (fauna/index.html y fauna/escritorio.html — proyecto aparte, sin relación con
// Ofipapel). Recibe el texto ya transcrito por el móvil (nunca audio) y devuelve
// la sección del parte y sus casillas rellenas, para que el agente solo revise
// y pulse «Añadir al parte». La app nunca guarda nada sola con esto.
//
// Proveedor: Google Gemini, plan GRATUITO (sin tarjeta). Ojo, condición del
// plan gratuito: Google puede usar los textos enviados para mejorar sus
// productos. El cliente lo ha aceptado (los partes no son confidenciales).
//
// Variables de entorno (Netlify > Site settings > Environment variables):
//   GEMINI_API_KEY  clave creada en https://aistudio.google.com/apikey con la
//                   cuenta de Google del CLIENTE. Sin ella la función responde
//                   503 y la app sigue funcionando como antes (solo transcribe).
//   GEMINI_MODEL    opcional; por defecto gemini-2.5-flash. Si Google retira
//                   ese modelo, se cambia aquí sin tocar código.
//
// Límite de peticiones best-effort en memoria (como chat-assistant.js): solo
// acota el abuso de la cuota gratuita, no es control de acceso.

const MODELO_POR_DEFECTO = 'gemini-2.5-flash';
const MODELO_RESPALDO = 'gemini-flash-latest';
const MAX_TEXTO = 1500;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json; charset=utf-8',
};

// Mismas opciones, con el mismo texto exacto, que los desplegables de
// fauna/app.js: la app las pone tal cual en el <select>.
const ACCIONES = ['VI – Vigilancia','V – Vuelos con rapaces','V.M – Vuelos de marcaje','V.Z – Vuelos de caza','V.Z.C – Vuelos de caza con captura','A – Aves rapaces (vuelos y capturas)','P – Perro','S – Sonidos','P.I – Pirotecnia','T – Trampa','R – Red'];
const METODOS = ['T – Trampa','L – Lazo','A – Ave de cetrería','P – Perro adiestrado','O – Otro medio (indicar en observaciones)'];
const DESTINOS_CAPTURA = ['A – Alimento para las rapaces','C – C. Recuperación «La Tahonilla»','E – Eutanasia','M – Agente de Medio Ambiente','P – Albergue de animales','L – Liberado'];
const ACTUACIONES_HABITUALES = ['Inicio de servicio','Ronda perimetral','Revisión de rodadura y pista','Revisión de trampas de conejos','Revisión de las trampas','Revisión de vegetación','Presencia y vuelos en Cab.07','Presencia y vuelos en Cab.25','Presencia en P. Sur','Revisión de trampas (CMD, terminal de carga, bomberos, helipuerto y halconera)','Halconera','Fin de servicio'];

// Casillas válidas por sección (las mismas claves que guarda la app).
const CAMPOS = {
  actuacion: ['wind','observations'],
  fauna: ['species','count','behavior','altitude','origin','destination','action','threat','observations'],
  captura: ['species','method','count','location','destination','observations'],
  retirada: ['species','count','location','impact','observations'],
  impacto: ['species','location','aircraft','severity','observations'],
  aviso: ['direction','source','response','observations'],
};
// Casillas que son desplegables: solo se acepta un valor de su lista.
function opcionesDe(seccion, campo) {
  if (campo === 'altitude') return ['0-20','20-100'];
  if (campo === 'action') return ACCIONES;
  if (campo === 'threat' || campo === 'impact') return ['Sí','No'];
  if (campo === 'method') return METODOS;
  if (campo === 'destination' && seccion === 'captura') return DESTINOS_CAPTURA;
  if (campo === 'direction') return ['Recibido','Realizado'];
  return null;
}

const texto = { type: 'STRING' };
const ESQUEMA = {
  type: 'OBJECT',
  properties: {
    kind: { type: 'STRING', enum: Object.keys(CAMPOS) },
    time: { type: 'STRING', description: 'Hora del hecho en formato HH:MM SOLO si el agente la dice expresamente; si no, cadena vacía.' },
    text: texto,
    details: {
      type: 'OBJECT',
      properties: {
        wind: texto, observations: texto, species: texto, count: texto, behavior: texto,
        altitude: texto, origin: texto, destination: texto, action: texto, threat: texto,
        method: texto, location: texto, impact: texto, aircraft: texto, severity: texto,
        direction: texto, source: texto, response: texto,
      },
    },
  },
  required: ['kind','time','text','details'],
};

const INSTRUCCIONES = `Eres el asistente del parte diario del servicio de control de fauna de un aeropuerto español. Un agente (halconero) dicta en pista lo que ha pasado; recibes la transcripción automática, que puede tener errores de reconocimiento de voz. Tu trabajo es colocar la información en la sección y las casillas correctas del parte. NO inventes nada: si un dato no se dice, deja la casilla vacía ("").

Secciones (campo "kind"):
- "actuacion": actividad rutinaria del servicio (rondas, revisiones, inicio/fin de servicio, halconera…). En "text" va la actuación. Si coincide con una de estas, usa su texto exacto: ${ACTUACIONES_HABITUALES.join(' | ')}. Casillas: wind (viento en nudos), observations.
- "fauna": avistamiento de animales vivos y la actuación sobre ellos. Casillas: species (nombre común, en singular, p. ej. "Gaviota patiamarilla"), count (número, solo cifras), behavior (comportamiento: volando, posado, alimentándose…), altitude ("0-20" o "20-100" metros), origin (dónde está/de dónde viene), destination (hacia dónde va), action (una de: ${ACCIONES.join(' | ')}), threat ("Sí"/"No": si coincide con operaciones o supone amenaza), observations.
- "captura": captura o trampeo de un animal. Casillas: species, method (una de: ${METODOS.join(' | ')}), count, location, destination (destino del animal, una de: ${DESTINOS_CAPTURA.join(' | ')}), observations.
- "retirada": retirada de un animal MUERTO (FOD). Casillas: species, count, location (zona), impact ("Sí"/"No": si procede de un impacto con aeronave), observations.
- "impacto": impacto/colisión de fauna con una aeronave. Casillas: species, location, aircraft (matrícula), severity, observations.
- "aviso": aviso recibido de otro (torre, operaciones, bomberos, handling, un piloto…) o realizado por el agente a otro. Casillas: direction ("Recibido" o "Realizado"), source (de quién viene o a quién se da), response (actuación derivada: qué se hizo a raíz del aviso), observations. En "text" va el ASUNTO del aviso.

Reglas:
- "text": descripción breve y clara en español, en el estilo impersonal de un parte ("Se acude a…", "Presencia de…"), sin la hora. Corrige errores evidentes de transcripción.
- "details": rellena solo las casillas de la sección elegida; el resto, vacías.
- En las casillas con lista, usa EXACTAMENTE uno de los valores dados o "".
- "time": solo si el agente dice una hora ("a las diez y cuarto" → "10:15"); si no, "".
- Si hay duda entre secciones: un aviso de otra persona/dependencia es "aviso"; un animal muerto es "retirada"; un golpe con un avión es "impacto"; animales vivos vistos es "fauna"; lo demás, "actuacion".`;

const peticionesPorIp = new Map();
function limitado(ip) {
  const ahora = Date.now();
  const e = peticionesPorIp.get(ip);
  if (!e || ahora - e.inicio > 10 * 60 * 1000) { peticionesPorIp.set(ip, { inicio: ahora, n: 1 }); return false; }
  e.n += 1;
  return e.n > 60;
}
const responder = (statusCode, body) => ({ statusCode, headers: CORS, body: JSON.stringify(body) });

// Deja solo lo que la app sabe pintar: sección válida, casillas de esa
// sección, y en los desplegables solo valores de su lista.
function sanear(r) {
  const kind = Object.hasOwn(CAMPOS, r?.kind) ? r.kind : 'actuacion';
  const details = {};
  for (const campo of CAMPOS[kind]) {
    let v = String(r?.details?.[campo] ?? '').trim().slice(0, 300);
    const opciones = opcionesDe(kind, campo);
    if (opciones && !opciones.includes(v)) v = '';
    if (v) details[campo] = v;
  }
  const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(r?.time || '')) ? r.time : '';
  return { kind, time, text: String(r?.text ?? '').trim().slice(0, 500), details };
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return responder(405, { error: 'Método no permitido' });

  const clave = process.env.GEMINI_API_KEY;
  if (!clave) return responder(503, { error: 'La clasificación automática no está configurada (falta GEMINI_API_KEY).' });

  const ip = event.headers['x-nf-client-connection-ip'] || (event.headers['x-forwarded-for'] || '').split(',')[0].trim() || 'desconocida';
  if (limitado(ip)) return responder(429, { error: 'Demasiadas peticiones; prueba en unos minutos.' });

  let dictado;
  try { dictado = String(JSON.parse(event.body || '{}').texto || '').trim(); } catch { return responder(400, { error: 'Petición no válida' }); }
  if (!dictado) return responder(400, { error: 'Falta el texto' });
  if (dictado.length > MAX_TEXTO) return responder(400, { error: 'Texto demasiado largo' });

  const modelo = process.env.GEMINI_MODEL || MODELO_POR_DEFECTO;
  const llamar = m => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCCIONES }] },
      contents: [{ role: 'user', parts: [{ text: dictado }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: ESQUEMA },
    }),
    signal: AbortSignal.timeout(15000),
  });
  try {
    let res = await llamar(modelo);
    // Google retira modelos con el tiempo: si el configurado ya no existe, se
    // usa su alias «flash» más reciente en vez de dejar la función rota.
    if (res.status === 404 && modelo !== MODELO_RESPALDO) {
      console.error(`fauna-clasificar: el modelo ${modelo} ya no existe; se usa ${MODELO_RESPALDO}`);
      res = await llamar(MODELO_RESPALDO);
    }
    if (!res.ok) {
      const detalle = (await res.text()).slice(0, 300);
      console.error('fauna-clasificar: Gemini respondió', res.status, detalle);
      // El motivo que da Google (clave no válida, API no activada, cuota…) se
      // devuelve para poder diagnosticar sin mirar los registros. Nunca
      // incluye la clave.
      let motivo = '';
      try { motivo = String(JSON.parse(detalle).error?.message || '').slice(0, 200); } catch { /* no era JSON */ }
      return responder(502, { error: res.status === 429 ? 'Se ha agotado la cuota gratuita de la IA por ahora.' : 'La IA no ha podido clasificar el texto.', gemini: { status: res.status, motivo } });
    }
    const datos = await res.json();
    const salida = datos?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    return responder(200, sanear(JSON.parse(salida)));
  } catch (e) {
    console.error('fauna-clasificar:', e && e.message);
    return responder(502, { error: 'La IA no ha respondido a tiempo.' });
  }
};

exports._internos = { sanear, ESQUEMA, INSTRUCCIONES };
