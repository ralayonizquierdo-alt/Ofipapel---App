// Plantilla de personal para fichaje.html — lectura server-side del documento
// `ofipapel_vacaciones/shared` del proyecto Firebase `ofipapelvv`.
//
// ─── Por qué existe ─────────────────────────────────────────────────────────
// `fichaje.html` necesita la lista de empleados ANTES de cualquier login: es
// la lista donde la persona se elige a sí misma para fichar. Vive en el
// proyecto `ofipapelvv`, compartido con `alquileres/` y `vacaciones.html`.
//
// Hasta ahora la leía abriendo una sesión ANÓNIMA contra ese proyecto. Cuando
// `alquileres/firestore.rules` pasó a exigir `sign_in_provider == 'password'`
// (bien hecho: una sesión anónima la puede abrir cualquiera con la apiKey
// pública, ver DT-23), esa lectura empezó a devolver 403 y la pantalla de
// fichaje se quedó sin personal — nadie podía fichar. Esas reglas cubren todo
// `ofipapelvv` con `match /{collection}/{docId}`, así que también alcanzan al
// documento de Vacaciones, aunque se escribieran pensando solo en Alquileres.
//
// La salida correcta no es reabrir las reglas ni meter una contraseña en el
// HTML (`fichaje.html` es estático: cualquiera la vería). Es esto: la
// credencial vive solo en el servidor, y el navegador recibe únicamente los
// tres campos que necesita.
//
// ─── Qué NO expone ──────────────────────────────────────────────────────────
// El documento `shared` lleva el estado completo de `vacaciones.html`
// (periodos, bloqueos, historial). Aquí se devuelven solo `{id, name, unitId}`
// de los empleados activos — nada más sale de esta función.
//
// ─── Variables de entorno (Netlify) ─────────────────────────────────────────
//   VACACIONES_FIREBASE_EMAIL     correo de una cuenta creada en
//   VACACIONES_FIREBASE_PASSWORD  Firebase Console → ofipapelvv →
//                                 Authentication → Usuarios
// Con crear una cuenta cualquiera basta (p.ej. `fichaje@ofipapel.internal`):
// las reglas solo comprueban que el proveedor sea `password`, no quién es.
//
// Sin estas dos variables la función responde 503 y `fichaje.html` cae a su
// ruta anterior — es decir, exactamente el comportamiento de hoy, ni mejor ni
// peor. Desplegarla no cambia nada hasta que las variables existan.

const VACACIONES_PROJECT_ID = 'ofipapelvv';
const VACACIONES_API_KEY = 'AIzaSyDLqPoqiMgiqbk5Uv-4RoYrbA-5Yfc1A_s';
const IDENTITY_TOOLKIT = 'https://identitytoolkit.googleapis.com/v1';
const FIRESTORE = 'https://firestore.googleapis.com/v1';

// Reaprovecha el token entre invocaciones calientes del mismo contenedor —
// una sesión de Identity Toolkit dura 1 h, así que la mayoría de peticiones no
// vuelven a pasar por el login. Se descarta 5 min antes de caducar.
let cachedSession = null;

async function getIdToken() {
  const email = process.env.VACACIONES_FIREBASE_EMAIL;
  const password = process.env.VACACIONES_FIREBASE_PASSWORD;
  if (!email || !password) {
    const err = new Error('credenciales-no-configuradas');
    err.code = 'NO_CONFIG';
    throw err;
  }

  if (cachedSession && Date.now() < cachedSession.expiresAt - 5 * 60 * 1000) {
    return cachedSession.idToken;
  }

  const res = await fetch(`${IDENTITY_TOOLKIT}/accounts:signInWithPassword?key=${VACACIONES_API_KEY}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const json = await res.json();
  if (!res.ok) {
    cachedSession = null;
    // El mensaje de Google puede delatar si la cuenta existe; se registra en
    // los logs de la función pero nunca se devuelve al navegador.
    console.error('plantilla-vacaciones: login fallido:', (json.error && json.error.message) || res.status);
    const err = new Error('login-fallido');
    err.code = 'BAD_CREDENTIALS';
    throw err;
  }

  cachedSession = {
    idToken: json.idToken,
    expiresAt: Date.now() + parseInt(json.expiresIn, 10) * 1000,
  };
  return cachedSession.idToken;
}

// Orígenes permitidos. No añade seguridad real (la lista ya la ve cualquiera
// que abra fichaje.html, es su pantalla de inicio) pero evita que el endpoint
// acabe siendo una API abierta de nombres de empleados para terceros.
//
// Incluye GitHub Pages a propósito: `ralayonizquierdo-alt.github.io` es la
// interfaz por la que el propietario entra a todas sus aplicaciones, y el hub
// (`inicio.html`) enlaza a `fichaje.html` con ruta RELATIVA — así que quien
// entra por ahí abre el fichaje servido por Pages, donde no existe ninguna
// función de Netlify. Sin esta entrada, `fichaje.html` en Pages se queda otra
// vez sin plantilla y solo aparece gerencia. Ese despliegue no es un
// duplicado prescindible: es producción.
const ALLOWED_ORIGINS = [
  'https://ralayonizquierdo-alt.github.io',
  'https://ofipapel.netlify.app',
  'https://spontaneous-lebkuchen-60fa41.netlify.app',
  'https://joesworld.netlify.app',
];

function allowedOrigin(event) {
  const origin = event.headers['origin'] || event.headers['Origin'];
  const referer = event.headers['referer'] || event.headers['Referer'];
  // El propio dominio del despliegue, para que las URL de previsualización de
  // Netlify (deploy previews, con dominio distinto en cada rama) funcionen sin
  // tener que mantenerlas en la lista.
  const siteUrl = process.env.URL || process.env.DEPLOY_PRIME_URL || '';
  let own = null;
  try { own = siteUrl ? new URL(siteUrl).origin : null; } catch { own = null; }

  const isOk = (o) => Boolean(o) && (ALLOWED_ORIGINS.includes(o) || o === own);

  // Una petición del mismo origen (GET normal) no lleva cabecera `Origin`;
  // sí lleva `Referer`. Se acepta cualquiera de las dos.
  if (origin) return isOk(origin) ? origin : null;
  if (referer) {
    try {
      const o = new URL(referer).origin;
      return isOk(o) ? o : null;
    } catch { return null; }
  }
  return null;
}

exports.handler = async (event) => {
  const origin = allowedOrigin(event);
  // Cabeceras CORS: sin ellas el navegador descarta la respuesta cuando
  // fichaje.html se sirve desde GitHub Pages y llama a Netlify (otro dominio).
  const cors = origin
    ? { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' }
    : {};

  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: origin ? 204 : 403,
      headers: { ...cors, 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Accept' },
      body: '',
    };
  }
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: 'Método no permitido' }) };
  }
  if (!origin) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Origen no permitido' }) };
  }

  let idToken;
  try {
    idToken = await getIdToken();
  } catch (err) {
    // 503, no 500: es un problema de configuración del entorno, no del
    // navegador que llama. fichaje.html lo trata como "no disponible" y usa
    // su ruta antigua.
    const detalle = err.code === 'NO_CONFIG'
      ? 'Faltan VACACIONES_FIREBASE_EMAIL / VACACIONES_FIREBASE_PASSWORD en Netlify.'
      : 'Las credenciales configuradas no son válidas en el proyecto ofipapelvv.';
    return { statusCode: 503, headers: cors, body: JSON.stringify({ error: 'Plantilla no disponible', detalle }) };
  }

  let doc;
  try {
    const res = await fetch(
      `${FIRESTORE}/projects/${VACACIONES_PROJECT_ID}/databases/(default)/documents/ofipapel_vacaciones/shared`,
      { headers: { Authorization: `Bearer ${idToken}` } }
    );
    if (!res.ok) {
      // Un 401/403 aquí casi siempre significa que el token caducó justo
      // ahora o que la cuenta ya no cumple las reglas: se tira la caché para
      // que el siguiente intento vuelva a iniciar sesión desde cero.
      if (res.status === 401 || res.status === 403) cachedSession = null;
      console.error('plantilla-vacaciones: Firestore respondió', res.status);
      return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'No se pudo leer la plantilla' }) };
    }
    doc = await res.json();
  } catch (err) {
    console.error('plantilla-vacaciones: fallo de red contra Firestore:', err.message);
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'No se pudo leer la plantilla' }) };
  }

  // El estado de vacaciones.html se guarda como un único campo `data` con
  // JSON serializado dentro, no como campos nativos de Firestore.
  let state;
  try {
    const raw = doc && doc.fields && doc.fields.data && doc.fields.data.stringValue;
    if (!raw) throw new Error('el documento no tiene campo `data`');
    state = JSON.parse(raw);
  } catch (err) {
    console.error('plantilla-vacaciones: documento con formato inesperado:', err.message);
    return { statusCode: 502, headers: cors, body: JSON.stringify({ error: 'Plantilla con formato inesperado' }) };
  }

  const employees = (state.employees || [])
    .filter((e) => e && e.active !== false)
    .map((e) => ({ id: e.id, name: e.name, unitId: e.unitId }));

  return {
    statusCode: 200,
    headers: {
      ...cors,
      'Content-Type': 'application/json',
      // La plantilla cambia como mucho un par de veces al mes; 5 min de caché
      // en el navegador evitan una petición por cada recarga de la pantalla de
      // fichar sin que un alta nueva tarde en aparecer.
      'Cache-Control': 'private, max-age=300',
    },
    body: JSON.stringify({ employees }),
  };
};
