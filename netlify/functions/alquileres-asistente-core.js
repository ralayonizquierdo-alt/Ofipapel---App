// Lo que comparten las dos piezas de «Preguntar a la aplicación» de Alquileres:
// la comprobación del token de sesión de Firebase y la llamada a Claude.
//
// Vive aparte porque desde el 30/10/2026 el asistente son dos funciones —la que
// pregunta en segundo plano y la que recoge el resultado— y las dos tienen que
// comprobar la sesión exactamente igual. Antes todo esto estaba dentro de
// `alquileres-asistente.js`, que se queda como estaba para las páginas viejas
// que aún la llamen.

const crypto = require('node:crypto');

/** El proyecto de Firebase de Alquileres. El token tiene que ser suyo. */
const PROYECTO = 'ofipapelvv';
const CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

/**
 * El modelo. Haiku va primero **a propósito** (30/10/2026): aquí el modelo no
 * calcula nada —las cifras llegan ya sumadas por la app— y solo redacta dos o
 * tres frases sobre ellas, así que lo que importa es que conteste rápido.
 */
const MODELO = 'claude-haiku-4-5-20251001';
/** Si ese no estuviera disponible en la cuenta, el grande. */
const MODELO_RESPALDO = 'claude-sonnet-5-5';
const MAX_TOKENS = 1024;
/** El resumen que manda la app: de sobra para un ejercicio entero. */
const MAX_CONTEXTO = 200 * 1024;

/** El almacén de Netlify Blobs donde espera cada respuesta. */
const STORE = 'alquileres-asistente';
const JOB_ID_OK = /^[A-Za-z0-9-]{8,64}$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (statusCode, body) => ({
  statusCode,
  headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' },
  body: JSON.stringify(body),
});

// ─── Verificación del token de sesión ───────────────────────────────────────

let certsCache = { at: 0, certs: null };

async function certificadosDeGoogle() {
  // Google los rota cada pocas horas y manda su caducidad en la cabecera; una
  // hora de caché es conservador y evita pedirlos en cada pregunta.
  if (certsCache.certs && Date.now() - certsCache.at < 60 * 60 * 1000) return certsCache.certs;
  const resp = await fetch(CERTS_URL);
  if (!resp.ok) throw new Error('No se pudieron leer las claves públicas de Google');
  const certs = await resp.json();
  certsCache = { at: Date.now(), certs };
  return certs;
}

const base64url = (s) => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * Comprueba el token de sesión de Firebase y devuelve quién es.
 *
 * Se hace a mano con `node:crypto` para no meter una dependencia nueva en las
 * funciones, que hoy no tienen ninguna: firma RS256 contra el certificado que
 * señala el `kid`, y luego emisor, destinatario y caducidad.
 */
async function usuarioDelToken(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) throw new Error('Token mal formado');
  let cabecera, cuerpo;
  try {
    cabecera = JSON.parse(base64url(partes[0]).toString('utf8'));
    cuerpo = JSON.parse(base64url(partes[1]).toString('utf8'));
  } catch {
    // Sin detalles: lo que falle al descifrar el token es cosa nuestra, no
    // algo que haya que contarle a quien lo manda.
    throw new Error('Token mal formado');
  }

  if (cabecera.alg !== 'RS256' || !cabecera.kid) throw new Error('Token con firma inesperada');
  const certs = await certificadosDeGoogle();
  const cert = certs[cabecera.kid];
  if (!cert) throw new Error('Token firmado con una clave que no reconozco');

  const ok = crypto.createVerify('RSA-SHA256')
    .update(`${partes[0]}.${partes[1]}`)
    .verify(cert, base64url(partes[2]));
  if (!ok) throw new Error('La firma del token no es válida');

  const ahora = Math.floor(Date.now() / 1000);
  if (cuerpo.aud !== PROYECTO) throw new Error('El token no es de esta aplicación');
  if (cuerpo.iss !== `https://securetoken.google.com/${PROYECTO}`) throw new Error('Emisor inesperado');
  if (!cuerpo.exp || cuerpo.exp < ahora) throw new Error('La sesión ha caducado');
  if (cuerpo.auth_time && cuerpo.auth_time > ahora + 60) throw new Error('Token del futuro');

  return { uid: cuerpo.user_id || cuerpo.sub, email: cuerpo.email || '' };
}

/** El token que viene en la cabecera `Authorization: Bearer …`. */
function tokenDe(event) {
  const cabecera = (event.headers && (event.headers.authorization || event.headers.Authorization)) || '';
  return cabecera.replace(/^Bearer\s+/i, '').trim();
}

// ─── Qué se le dice a Claude ────────────────────────────────────────────────

const INSTRUCCIONES = `Eres el asistente de «Alquileres», la aplicación con la que Luis y Rober llevan ocho
apartamentos de alquiler vacacional en Tenerife. Respondes preguntas sobre SUS datos.

Reglas, por este orden:

1. Responde SOLO con los datos del resumen que viene a continuación. Si la respuesta no está
   ahí, dilo claramente («eso no está en los datos que manejo») y, si procede, di en qué
   pantalla de la app puede mirarlo. No inventes ni estimes cifras.
2. Las cifras del resumen ya están calculadas por la aplicación: úsalas tal cual. Si tienes que
   sumar varias, hazlo con cuidado y enseña la suma.
3. Sé breve y directo: el dueño lee esto en el móvil, muchas veces de pie en la calle. Dos o
   tres frases, o una lista corta. Nada de rodeos ni de repetir la pregunta.
4. Los importes van en euros con dos decimales y coma decimal (1.234,56 €).
5. Habla en español de España, en el mismo tono llano que usa la app: «cobrado», «falta por
   cobrar», «estancia», «mes contable». Nada de jerga técnica ni de nombres de campos.
6. Cuando una cifra necesite un matiz para no engañar, dilo en media frase: por ejemplo, que
   lo que falta de una estancia que aún no ha terminado no es un descubierto.
7. No propongas cambios en los datos ni digas que los has hecho: tú solo miras.`;

async function llamaAClaude(apiKey, modelo, sistema, mensajes) {
  return fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: modelo, max_tokens: MAX_TOKENS, system: sistema, messages: mensajes }),
  });
}

/**
 * La respuesta a una pregunta, o un error explicado.
 *
 * Devuelve `{ respuesta }` o `{ error }`: nunca lanza, porque quien la llama
 * está en segundo plano y lo único que puede hacer con un fallo es guardarlo
 * para que la página lo enseñe.
 */
async function respuestaDeClaude({ apiKey, pregunta, contexto, historial }) {
  const mensajes = [
    ...(Array.isArray(historial) ? historial : [])
      .slice(-6)
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
    { role: 'user', content: String(pregunta).slice(0, 2000) },
  ];
  const sistema = `${INSTRUCCIONES}\n\n--- RESUMEN DE DATOS DE LA APLICACIÓN ---\n${contexto}`;

  try {
    let resp = await llamaAClaude(apiKey, MODELO, sistema, mensajes);
    if (!resp.ok && (resp.status === 404 || resp.status === 400)) {
      // Modelo no disponible en esta cuenta: se reintenta con el otro.
      resp = await llamaAClaude(apiKey, MODELO_RESPALDO, sistema, mensajes);
    }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { error: (err.error && err.error.message) || 'Claude no ha podido responder.' };
    }
    const data = await resp.json();
    const texto = (data.content || []).find((b) => b.type === 'text');
    return { respuesta: (texto && texto.text && texto.text.trim()) || '(Sin respuesta)' };
  } catch (err) {
    console.error('alquileres-asistente:', err);
    return { error: 'No se ha podido contactar con Claude.' };
  }
}

module.exports = {
  PROYECTO, MODELO, MODELO_RESPALDO, MAX_CONTEXTO, STORE, JOB_ID_OK, CORS,
  json, usuarioDelToken, tokenDe, respuestaDeClaude,
};
