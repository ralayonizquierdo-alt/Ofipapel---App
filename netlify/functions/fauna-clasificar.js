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
//   GEMINI_MODEL    opcional; por defecto gemini-flash-lite-latest (el único que
//                   respondió en la prueba del 4/10/2026: 36 de 36, ver
//                   commit). Si Google retira
//                   ese modelo, se cambia aquí sin tocar código.
//
// Límite de peticiones best-effort en memoria (como chat-assistant.js): solo
// acota el abuso de la cuota gratuita, no es control de acceso.

const MODELO_POR_DEFECTO = 'gemini-flash-lite-latest';
// Si el principal está saturado o sin cuota, se prueban estos (también gratuitos).
// gemini-2.5-flash y -lite ya devuelven 404 con esta clave (5/10/2026): fuera.
const MODELOS_RESPALDO = ['gemini-flash-latest'];
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
- "fauna": avistamiento de animales vivos y la actuación sobre ellos. Casillas: species (nombre común, en singular, p. ej. "Gaviota patiamarilla"), count (número, solo cifras), behavior (comportamiento: volando, posado, alimentándose…), altitude (la altura tal como se dice, con su unidad), origin (dónde está/de dónde viene), destination (hacia dónde va), action (una de: ${ACCIONES.join(' | ')}), threat ("Sí"/"No": si coincide con operaciones o supone amenaza), observations.
- "captura": captura o trampeo de un animal. Casillas: species, method (una de: ${METODOS.join(' | ')}), count, location, destination (destino del animal, una de: ${DESTINOS_CAPTURA.join(' | ')}), observations.
- "retirada": retirada de un animal MUERTO (FOD). Casillas: species, count, location (zona), impact ("Sí"/"No": si procede de un impacto con aeronave), observations.
- "impacto": impacto/colisión de fauna con una aeronave. Casillas: species, location, aircraft (matrícula), severity, observations.
- "aviso": aviso recibido de otro (torre, operaciones, bomberos, handling, un piloto…) o realizado por el agente a otro. Casillas: direction ("Recibido" o "Realizado"), source (de quién viene o a quién se da), response (actuación derivada: qué se hizo a raíz del aviso), observations. En "text" va el ASUNTO del aviso.

Reglas:
- "text": descripción breve y clara en español, en el estilo impersonal de un parte ("Se acude a…", "Presencia de…"), sin la hora. Corrige errores evidentes de transcripción.
- "details": rellena solo las casillas de la sección elegida; el resto, vacías.
- En las casillas con lista, usa EXACTAMENTE uno de los valores dados o "".
- "time": solo si el agente dice una hora ("a las diez y cuarto" → "10:15"); si no, "".
- Si hay duda entre secciones: un aviso de otra persona/dependencia es "aviso"; un animal muerto es "retirada"; un golpe con un avión es "impacto"; animales vivos vistos es "fauna"; lo demás, "actuacion".

MUY IMPORTANTE — no deduzcas, solo transcribe lo dicho:
- "altitude": solo si se dice una altura, y TAL COMO SE DICE, con su unidad y sin convertir: "a unos cincuenta pies" → "50 pies"; "a quince metros" → "15 metros"; si se dice uno de los rangos de la plantilla ("entre 0 y 20", "de 20 a 100") → "0-20" o "20-100". Si no se dice la unidad, el número solo ("a unos 50" → "50"). Un animal posado o "volando" sin altura → "".
- "threat": solo si se dice expresamente si coincide o no con operaciones o si es un riesgo. Si no se dice → "".
- "severity": las palabras que use el agente ("sin daños", "daños en el motor"…). Nunca pongas una valoración tuya como "Leve".
- "action": si se describe la actuación, elige el código que corresponde ("vigilancia" → VI; "vuelo con rapaz", "vuelo con el halcón" → V; "vuelos de caza" sin captura → V.Z; "vuelos de caza" con captura → V.Z.C; "pirotecnia", "petardos" → P.I; "perro" → P; "sonidos", "cañón" → S). Si no se describe → "".
- Lugares: "sobre/en la cabecera 07" es la procedencia (dónde está): escríbela como "Cab.07"; las cabeceras se escriben "Cab.07", "Cab.25"; pistas "Pista 03"; calles de rodaje "TWY B" si se dice la letra.
- Lo que se diga y no tenga casilla propia (p. ej. "sin novedad", "sin captura") va en "observations" de forma breve.

Ejemplos:
«doce gaviotas volando sobre la cabecera cero siete hacia el mar no coinciden con operaciones se hace vigilancia» → kind "fauna", text "Grupo de gaviotas volando sobre Cab.07", species "Gaviota", count "12", behavior "Volando", origin "Cab.07", destination "Mar", action "VI – Vigilancia", threat "No", altitude "".
«dos milanos posados en la valla cerca del helipuerto vuelos de caza con el halcón sin captura» → kind "fauna", species "Milano", count "2", behavior "Posados", origin "Valla perimetral, junto al helipuerto", action "V.Z – Vuelos de caza", observations "Sin captura", altitude "", threat "".
«el piloto informa de impacto con un cernícalo en pista cero tres sin daños matrícula EI DCL» → kind "impacto", species "Cernícalo", location "Pista 03", aircraft "EI-DCL", severity "Sin daños", observations "Informa el piloto".`;

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
// `seccion`: la que eligió el agente a mano, si eligió alguna; manda sobre la IA.
function sanear(r, seccion) {
  const kind = Object.hasOwn(CAMPOS, seccion) ? seccion : Object.hasOwn(CAMPOS, r?.kind) ? r.kind : 'actuacion';
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

  let dictado, seccion;
  try {
    const peticion = JSON.parse(event.body || '{}');
    dictado = String(peticion.texto || '').trim();
    seccion = Object.hasOwn(CAMPOS, peticion.seccion) ? peticion.seccion : '';
  } catch { return responder(400, { error: 'Petición no válida' }); }
  if (!dictado) return responder(400, { error: 'Falta el texto' });
  if (dictado.length > MAX_TEXTO) return responder(400, { error: 'Texto demasiado largo' });

  // Plan gratuito: cada modelo tiene su propia cuota y a veces Google lo da por
  // saturado (503). Si el primero no está disponible, se prueba el siguiente,
  // siempre dentro del tiempo que Netlify da a una función (~10 s).
  const modelos = [...new Set([process.env.GEMINI_MODEL || MODELO_POR_DEFECTO, ...MODELOS_RESPALDO])];
  const limite = Date.now() + 9300;
  // Sin «pensar»: para colocar un texto en casillas no hace falta y lo hace más
  // lento (el 5/10/2026 el modelo principal dejó de responder en 6 s). Si un
  // modelo no admite la opción (400), se repite la petición sin ella.
  const sinPensar = { thinkingConfig: { thinkingBudget: 0 } };
  const llamar = (m, ms, extra = sinPensar) => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(m)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': clave },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: INSTRUCCIONES }] },
      contents: [{ role: 'user', parts: [{ text: seccion ? `Sección elegida por el agente (obligatoria, úsala como "kind"): ${seccion}\n\nDictado: ${dictado}` : dictado }] }],
      generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: ESQUEMA, ...extra },
    }),
    signal: AbortSignal.timeout(ms),
  });
  try {
    let res, usado = '';
    const intentos = []; // «modelo:estado» de cada intento, para diagnosticar
    for (const m of modelos) {
      const quedan = limite - Date.now();
      if (quedan < 1500) break;
      usado = m;
      const t0 = Date.now();
      // El primero puede usar casi todo el margen; si falla, al siguiente le queda el resto.
      try {
        res = await llamar(m, Math.min(m === modelos[0] ? 7000 : quedan, quedan));
        if (res.status === 400) { intentos.push(`${m}:400 con sinPensar`); res = await llamar(m, Math.max(1000, limite - Date.now()), {}); }
      }
      catch (e) { intentos.push(`${m}:sin respuesta ${((Date.now() - t0) / 1000).toFixed(1)}s`); console.error(`fauna-clasificar: ${m} no respondió (${e && e.name})`); continue; }
      intentos.push(`${m}:${res.status} ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      if (res.ok || ![404, 429, 500, 503].includes(res.status)) break;
      console.error(`fauna-clasificar: ${m} respondió ${res.status}; se prueba el siguiente modelo`);
    }
    if (!res) return responder(502, { error: 'La IA no ha respondido a tiempo.', intentos });
    if (!res.ok) {
      const detalle = (await res.text()).slice(0, 300);
      console.error('fauna-clasificar: Gemini respondió', res.status, detalle);
      // El motivo que da Google (clave no válida, API no activada, cuota…) se
      // devuelve para poder diagnosticar sin mirar los registros. Nunca
      // incluye la clave.
      let motivo = '';
      try { motivo = String(JSON.parse(detalle).error?.message || '').slice(0, 200); } catch { /* no era JSON */ }
      return responder(502, { error: res.status === 429 ? 'Se ha agotado la cuota gratuita de la IA por ahora.' : 'La IA no ha podido clasificar el texto.', gemini: { status: res.status, motivo }, intentos });
    }
    const datos = await res.json();
    const salida = datos?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    return responder(200, { ...sanear(JSON.parse(salida), seccion), modelo: usado, intentos });
  } catch (e) {
    console.error('fauna-clasificar:', e && e.message);
    return responder(502, { error: 'La IA no ha respondido a tiempo.' });
  }
};

exports._internos = { sanear, ESQUEMA, INSTRUCCIONES };
