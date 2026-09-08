// Fichar sin sesión anónima — verificación del PIN y registro del evento, en
// el servidor.
//
// ─── El problema que resuelve ───────────────────────────────────────────────
// Hasta ahora `fichaje.html` abría una sesión ANÓNIMA contra Firebase y hacía
// todo desde el navegador: leía el hash del PIN de la persona, lo comparaba en
// el propio dispositivo, y escribía el evento. Como una sesión anónima la crea
// cualquiera con la apiKey pública (que va dentro del HTML), eso significaba
// que cualquiera podía:
//
//   · leer los hashes de TODOS los PIN — y son de 4 dígitos con sal conocida
//     (`personId:pin`), o sea 10.000 combinaciones: se rompen en segundos;
//   · leer todos los fichajes, con las coordenadas GPS de cada persona;
//   · crear fichajes falsos a nombre de quien fuera.
//
// Las reglas publicadas el 2026-09-02 ya cortaron modificar y borrar, pero
// leer y crear siguen abiertos justo porque la app los necesita. Esta función
// es lo que permite cerrarlos: cuando `fichaje.html` fiche a través de aquí,
// el navegador dejará de necesitar sesión de Firebase para nada, y las reglas
// podrán exigir `sign_in_provider == 'password'` sin dejar a nadie fuera.
//
// ─── Qué cambia para la persona que ficha ──────────────────────────────────
// Nada. Sigue eligiéndose en la lista y tecleando su PIN de 4 dígitos. La
// diferencia es que el PIN viaja al servidor y se comprueba ahí, en vez de
// descargarse el hash al móvil y compararlo en local.
//
// ─── Variables de entorno (Netlify) ────────────────────────────────────────
//   FICHAJE_FIREBASE_EMAIL     cuenta creada en Firebase Console →
//   FICHAJE_FIREBASE_PASSWORD  ofipapel-fichaje-63ced → Authentication
//
// Sin ellas la función responde 503 y `fichaje.html` sigue fichando por su
// ruta antigua: desplegarla no cambia nada hasta que existan.

const crypto = require('node:crypto');

const PROJECT_ID = 'ofipapel-fichaje-63ced';
const API_KEY = 'AIzaSyCZ7cBQXZkw-VB0vnJE4m8lj3mscyiIMEc';
const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1';
const FIRESTORE = 'https://firestore.googleapis.com/v1';
const CONFIG = 'ofipapel_fichaje_config';
const EVENTOS = 'ofipapel_fichaje_eventos';

// Mismos orígenes que plantilla-vacaciones.js: el hub vive en GitHub Pages y
// enlaza a fichaje.html con ruta relativa, así que las peticiones salen desde
// ese dominio y no desde Netlify.
const ALLOWED_ORIGINS = [
  'https://ralayonizquierdo-alt.github.io',
  'https://ofipapel.netlify.app',
  'https://spontaneous-lebkuchen-60fa41.netlify.app',
  'https://joesworld.netlify.app',
];

// ─── Freno a la fuerza bruta ───────────────────────────────────────────────
// Un PIN de 4 dígitos son 10.000 combinaciones: sin freno, se prueban todas en
// minutos. El contador vive en memoria del contenedor, así que no es perfecto
// (Netlify puede levantar varios), pero convierte un ataque de minutos en uno
// de horas y deja rastro en los logs. El freno definitivo es alargar el PIN,
// que es decisión del propietario.
const INTENTOS = new Map();
const MAX_INTENTOS = 5;
const VENTANA_MS = 10 * 60 * 1000;

function demasiadosIntentos(clave) {
  const ahora = Date.now();
  const previos = (INTENTOS.get(clave) || []).filter((t) => ahora - t < VENTANA_MS);
  INTENTOS.set(clave, previos);
  return previos.length >= MAX_INTENTOS;
}
function anotarFallo(clave) {
  const previos = INTENTOS.get(clave) || [];
  previos.push(Date.now());
  INTENTOS.set(clave, previos);
}

let sesion = null;
async function tokenServicio() {
  const email = process.env.FICHAJE_FIREBASE_EMAIL;
  const password = process.env.FICHAJE_FIREBASE_PASSWORD;
  if (!email || !password) {
    const e = new Error('sin-configurar'); e.code = 'NO_CONFIG'; throw e;
  }
  if (sesion && Date.now() < sesion.expira - 5 * 60 * 1000) return sesion.idToken;

  const res = await fetch(`${IDENTITY_TOOLKIT}/accounts:signInWithPassword?key=${API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const json = await res.json();
  if (!res.ok) {
    sesion = null;
    console.error('fichar: login de servicio fallido:', (json.error && json.error.message) || res.status);
    const e = new Error('login-fallido'); e.code = 'BAD_CREDENTIALS'; throw e;
  }
  sesion = { idToken: json.idToken, expira: Date.now() + parseInt(json.expiresIn, 10) * 1000 };
  return sesion.idToken;
}

function origenPermitido(event) {
  const origin = event.headers['origin'] || event.headers['Origin'];
  const referer = event.headers['referer'] || event.headers['Referer'];
  const propio = process.env.URL || process.env.DEPLOY_PRIME_URL || '';
  let own = null;
  try { own = propio ? new URL(propio).origin : null; } catch { own = null; }
  const vale = (o) => Boolean(o) && (ALLOWED_ORIGINS.includes(o) || o === own);
  if (origin) return vale(origin) ? origin : null;
  if (referer) {
    try { const o = new URL(referer).origin; return vale(o) ? o : null; } catch { return null; }
  }
  return null;
}

// Firestore devuelve los campos envueltos por tipo; se desenvuelven solo los
// que esta función necesita.
function valor(v) {
  if (!v) return null;
  if ('stringValue' in v) return v.stringValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('nullValue' in v) return null;
  return null;
}

const sha256 = (t) => crypto.createHash('sha256').update(t, 'utf8').digest('hex');

exports.handler = async (event) => {
  const origen = origenPermitido(event);
  const cors = origen ? { 'Access-Control-Allow-Origin': origen, 'Vary': 'Origin' } : {};
  const responder = (statusCode, cuerpo) => ({
    statusCode,
    headers: { ...cors, 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  });

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: origen ? 204 : 403,
      headers: { ...cors, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' },
      body: '',
    };
  }
  if (event.httpMethod !== 'POST') return responder(405, { error: 'Método no permitido' });
  if (!origen) return { statusCode: 403, body: JSON.stringify({ error: 'Origen no permitido' }) };

  let payload;
  try { payload = JSON.parse(event.body || '{}'); }
  catch { return responder(400, { error: 'Petición mal formada' }); }

  // La pantalla de fichar tiene dos pasos: primero se teclea el PIN (y solo si
  // es correcto aparecen los botones de acción), y después se elige entrada,
  // salida o pausa. Por eso la función admite dos modos:
  //
  //   sin `type`  → SOLO comprueba el PIN, no registra nada (paso 1)
  //   con `type`  → vuelve a comprobar el PIN y registra el fichaje (paso 2)
  //
  // El PIN se revalida en el paso 2 a propósito: si el servidor se fiara de
  // que "ya se validó antes", cualquiera podría saltarse el paso 1 y fichar
  // por otra persona llamando directamente al endpoint.
  const { personId, pin, type, geo } = payload;
  if (!personId || !pin) return responder(400, { error: 'Faltan datos' });
  const soloComprobar = !type;
  if (!soloComprobar && !['entrada', 'salida', 'pausa_inicio', 'pausa_fin'].includes(type)) {
    return responder(400, { error: 'Tipo de fichaje no válido' });
  }

  // El freno cuenta por persona Y por IP: así ni se ataca un PIN concreto desde
  // muchos sitios, ni muchos PIN desde uno solo.
  const ip = event.headers['x-nf-client-connection-ip'] || event.headers['client-ip'] || 'sin-ip';
  const claves = [`persona:${personId}`, `ip:${ip}`];
  if (claves.some(demasiadosIntentos)) {
    console.warn(`fichar: demasiados intentos fallidos (persona=${personId}, ip=${ip})`);
    return responder(429, { error: 'Demasiados intentos. Espera unos minutos e inténtalo otra vez.' });
  }

  let token;
  try { token = await tokenServicio(); }
  catch (err) {
    const detalle = err.code === 'NO_CONFIG'
      ? 'Faltan FICHAJE_FIREBASE_EMAIL / FICHAJE_FIREBASE_PASSWORD en Netlify.'
      : 'Las credenciales configuradas no valen en el proyecto de fichaje.';
    return responder(503, { error: 'Servicio de fichaje no disponible', detalle });
  }

  const base = `${FIRESTORE}/projects/${PROJECT_ID}/databases/(default)/documents`;
  const auth = { Authorization: `Bearer ${token}` };

  // 1. Configuración de la persona (hash del PIN y si está activa)
  let cfg;
  try {
    const res = await fetch(`${base}/${CONFIG}/${encodeURIComponent(personId)}`, { headers: auth });
    if (res.status === 404) return responder(403, { error: 'Esta persona no tiene PIN configurado.', reason: 'SIN_PIN' });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) sesion = null;
      console.error('fichar: Firestore respondió', res.status, 'al leer la configuración');
      return responder(502, { error: 'No se pudo comprobar el PIN' });
    }
    cfg = (await res.json()).fields || {};
  } catch (err) {
    console.error('fichar: fallo de red leyendo la configuración:', err.message);
    return responder(502, { error: 'No se pudo comprobar el PIN' });
  }

  if (valor(cfg.active) === false) {
    return responder(403, { error: 'Esta persona está dada de baja en el sistema de fichaje.', reason: 'INACTIVO' });
  }

  const hashGuardado = valor(cfg.pinHash);
  if (!hashGuardado) return responder(403, { error: 'Esta persona no tiene PIN configurado.', reason: 'SIN_PIN' });

  // 2. Comparación del PIN, en tiempo constante para no filtrar información por
  // lo que tarda en responder. El hash se calcula igual que en el navegador
  // (`personId:pin`) para no invalidar los PIN que ya existen.
  const hashRecibido = sha256(`${personId}:${pin}`);
  const a = Buffer.from(hashRecibido, 'hex');
  const b = Buffer.from(hashGuardado, 'hex');
  const coincide = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!coincide) {
    claves.forEach(anotarFallo);
    // Mismo mensaje que un PIN correcto de una persona inexistente: no se
    // confirma desde fuera qué personId existe.
    return responder(403, { error: 'PIN incorrecto.', reason: 'INCORRECTO' });
  }

  // Paso 1: el PIN vale y no hay que registrar nada todavía. Se responde sin
  // tocar Firestore, para que teclear el PIN no deje rastro de fichaje.
  if (soloComprobar) return responder(200, { ok: true, verificado: true });

  // 3. Registrar el fichaje. La hora la pone el SERVIDOR, no el móvil: si la
  // marcase el dispositivo, bastaría con cambiar el reloj del teléfono para
  // falsear la jornada.
  const ahora = new Date();
  const dateKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Atlantic/Canary', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(ahora);

  const fields = {
    personId: { stringValue: String(personId) },
    type: { stringValue: String(type) },
    occurredAt: { stringValue: ahora.toISOString() },
    dateKey: { stringValue: dateKey },
    correctionOf: { nullValue: null },
    correctionReason: { nullValue: null },
    correctedBy: { nullValue: null },
    geoLat: geo && typeof geo.lat === 'number' ? { doubleValue: geo.lat } : { nullValue: null },
    geoLng: geo && typeof geo.lng === 'number' ? { doubleValue: geo.lng } : { nullValue: null },
  };

  try {
    const res = await fetch(`${base}/${EVENTOS}`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      if (res.status === 401 || res.status === 403) sesion = null;
      console.error('fichar: Firestore respondió', res.status, 'al crear el evento');
      return responder(502, { error: 'No se pudo registrar el fichaje' });
    }
    const doc = await res.json();
    return responder(200, {
      ok: true,
      id: doc.name ? doc.name.split('/').pop() : null,
      type,
      occurredAt: ahora.toISOString(),
      dateKey,
    });
  } catch (err) {
    console.error('fichar: fallo de red creando el evento:', err.message);
    return responder(502, { error: 'No se pudo registrar el fichaje' });
  }
};
