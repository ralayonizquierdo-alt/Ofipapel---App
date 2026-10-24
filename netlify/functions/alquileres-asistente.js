// «Preguntar a la aplicación» de Alquileres: el proxy que habla con Claude.
//
// Lo pidió el propietario el 23/10/2026 («incluir dónde preguntar a la
// aplicación»). La idea es poder escribir «¿cuánto llevamos cobrado del 402
// este año?» o «¿qué estancias terminaron sin cobrar?» en vez de ir sumando
// columnas a mano.
//
// ─── Qué hace y qué NO hace ─────────────────────────────────────────────────
// · La clave de Anthropic vive SOLO aquí, como variable de entorno, igual que
//   en el chat de Finanzas (`chat-assistant.js`). Nunca llega al navegador.
// · Las cifras NO las calcula Claude: las calcula la app y se mandan ya hechas
//   en el resumen. Aquí solo se redacta la respuesta sobre ese resumen. Si algo
//   no está en él, se dice en vez de inventarlo.
// · No escribe nada en la base de datos. Es de solo leer, siempre.
//
// ─── Quién puede llamarla ───────────────────────────────────────────────────
// A diferencia del chat de Finanzas, que se protege con un token embebido en
// el HTML (y por tanto a la vista de cualquiera), aquí se exige el **token de
// sesión de Firebase** del usuario que ha entrado en Alquileres: se comprueba
// su firma contra las claves públicas de Google, que sea de nuestro proyecto y
// que no haya caducado. Sin sesión abierta en la app, no hay respuesta.
//
// Variables de entorno (sitio `ofipapel`):
//   ANTHROPIC_API_KEY   la misma que ya usan el bot de WhatsApp y Finanzas.

const crypto = require('node:crypto');

/** El proyecto de Firebase de Alquileres. El token tiene que ser suyo. */
const PROYECTO = 'ofipapelvv';
const CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';

const MODELO = 'claude-sonnet-5-5';
/** Si el modelo de arriba no estuviera disponible, el que ya usa Finanzas. */
const MODELO_RESPALDO = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;
/** El resumen que manda la app: de sobra para un ejercicio entero. */
const MAX_CONTEXTO = 200 * 1024;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const json = (statusCode, body) => ({
  statusCode,
  headers: { ...CORS, 'content-type': 'application/json' },
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

const base64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

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

// ─── Límite de uso, para acotar el coste ────────────────────────────────────

const VENTANA_MS = 10 * 60 * 1000;
const MAX_POR_USUARIO = 30;
const porUsuario = new Map();

function pasado(uid) {
  const ahora = Date.now();
  const e = porUsuario.get(uid);
  if (!e || ahora - e.desde > VENTANA_MS) { porUsuario.set(uid, { desde: ahora, n: 1 }); return false; }
  e.n += 1;
  return e.n > MAX_POR_USUARIO;
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

async function preguntaAClaude(apiKey, modelo, sistema, mensajes) {
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

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return json(500, { error: 'El asistente no está configurado (falta ANTHROPIC_API_KEY).' });

  const cabecera = event.headers.authorization || event.headers.Authorization || '';
  const token = cabecera.replace(/^Bearer\s+/i, '').trim();
  let quien;
  try {
    quien = await usuarioDelToken(token);
  } catch (err) {
    return json(401, { error: `No he podido comprobar tu sesión: ${err.message}` });
  }

  if (pasado(quien.uid)) {
    return json(429, { error: 'Has hecho muchas preguntas seguidas. Espera unos minutos.' });
  }

  let cuerpo;
  try {
    cuerpo = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'La petición no es un JSON válido.' });
  }

  const pregunta = String(cuerpo.pregunta || '').trim();
  const contexto = String(cuerpo.contexto || '');
  if (!pregunta) return json(400, { error: 'No has escrito ninguna pregunta.' });
  if (contexto.length > MAX_CONTEXTO) return json(413, { error: 'El resumen de datos es demasiado grande.' });

  // El historial permite repreguntar («¿y del 105?») sin repetirlo todo.
  const historial = Array.isArray(cuerpo.historial) ? cuerpo.historial.slice(-6) : [];
  const mensajes = [
    ...historial
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) })),
    { role: 'user', content: pregunta.slice(0, 2000) },
  ];

  const sistema = `${INSTRUCCIONES}\n\n--- RESUMEN DE DATOS DE LA APLICACIÓN ---\n${contexto}`;

  try {
    let resp = await preguntaAClaude(apiKey, MODELO, sistema, mensajes);
    if (!resp.ok && (resp.status === 404 || resp.status === 400)) {
      // Modelo no disponible en esta cuenta: se reintenta con el de siempre.
      resp = await preguntaAClaude(apiKey, MODELO_RESPALDO, sistema, mensajes);
    }
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return json(resp.status, { error: err.error?.message || 'Claude no ha podido responder.' });
    }
    const data = await resp.json();
    const respuesta = data.content?.find((b) => b.type === 'text')?.text?.trim();
    return json(200, { respuesta: respuesta || '(Sin respuesta)' });
  } catch (err) {
    console.error('alquileres-asistente:', err);
    return json(502, { error: 'No se ha podido contactar con Claude.' });
  }
};
