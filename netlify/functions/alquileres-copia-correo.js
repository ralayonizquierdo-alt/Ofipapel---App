// Copia de seguridad de Alquileres por correo (Luis, 16/11/2026: «me la puedes
// enviar por correo para guardarlas en un archivo?»).
//
// La app arma la copia (el mismo .json que «Descargar copia»), la descarga y la
// manda aquí; esta función la envía como adjunto por Resend. Un navegador no
// puede mandar un correo con un fichero adjunto por sí solo.
//
// ─── Quién puede llamarla ───────────────────────────────────────────────────
// Igual que «Preguntar a la aplicación» (alquileres-asistente.js): solo con el
// **token de sesión de Firebase** de alguien que ha entrado en Alquileres con
// contraseña (firma RS256 contra las claves públicas de Google, proyecto
// `ofipapelvv`, caducidad). El destinatario es fijo: nadie puede usarla para
// mandar correos a otra dirección.
//
// Variables de entorno (sitio `ofipapel`):
//   RESEND_API_KEY          la misma que usa avisos-pedidos.mjs.
//   ALQUILERES_COPIA_PARA   opcional, uno o varios separados por comas; si no está, ofipapelsl@ofipapelsl.com.
//   ALQUILERES_COPIA_DE     opcional; remitente verificado en Resend. Sin él se
//                           usa el de pruebas de Resend, que SOLO entrega en el
//                           correo con el que se abrió la cuenta de Resend.

const crypto = require('node:crypto');

const PROYECTO = 'ofipapelvv';
const CERTS_URL =
  'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
/** Uno o varios correos, separados por comas (Luis, 16/11/2026: «puede ir a dos correos?»). */
const PARA = (process.env.ALQUILERES_COPIA_PARA || 'ofipapelsl@ofipapelsl.com')
  .split(',').map((s) => s.trim()).filter(Boolean);
const DE = process.env.ALQUILERES_COPIA_DE || 'Alquileres Ofipapel <onboarding@resend.dev>';
/** Una función normal de Netlify no admite cuerpos de más de 6 MB. */
const MAX_BASE64 = 5.5 * 1024 * 1024;

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

// ─── Verificación del token de sesión (la misma que alquileres-asistente.js) ──

let certsCache = { at: 0, certs: null };

async function certificadosDeGoogle() {
  if (certsCache.certs && Date.now() - certsCache.at < 60 * 60 * 1000) return certsCache.certs;
  const resp = await fetch(CERTS_URL);
  if (!resp.ok) throw new Error('No se pudieron leer las claves públicas de Google');
  const certs = await resp.json();
  certsCache = { at: Date.now(), certs };
  return certs;
}

const base64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

async function usuarioDelToken(token) {
  const partes = String(token || '').split('.');
  if (partes.length !== 3) throw new Error('Token mal formado');
  let cabecera, cuerpo;
  try {
    cabecera = JSON.parse(base64url(partes[0]).toString('utf8'));
    cuerpo = JSON.parse(base64url(partes[1]).toString('utf8'));
  } catch {
    throw new Error('Token mal formado');
  }
  if (cabecera.alg !== 'RS256' || !cabecera.kid) throw new Error('Token con firma inesperada');
  const cert = (await certificadosDeGoogle())[cabecera.kid];
  if (!cert) throw new Error('Token firmado con una clave que no reconozco');
  const ok = crypto.createVerify('RSA-SHA256')
    .update(`${partes[0]}.${partes[1]}`)
    .verify(cert, base64url(partes[2]));
  if (!ok) throw new Error('La firma del token no es válida');

  const ahora = Math.floor(Date.now() / 1000);
  if (cuerpo.aud !== PROYECTO) throw new Error('El token no es de esta aplicación');
  if (cuerpo.iss !== `https://securetoken.google.com/${PROYECTO}`) throw new Error('Emisor inesperado');
  if (!cuerpo.exp || cuerpo.exp < ahora) throw new Error('La sesión ha caducado');
  // Como las reglas de Firestore: solo sesiones con contraseña, nunca anónimas.
  if (cuerpo.firebase?.sign_in_provider !== 'password') throw new Error('Sesión sin contraseña');
  return { uid: cuerpo.user_id || cuerpo.sub, email: cuerpo.email || '' };
}

// Como mucho unos envíos por hora y persona: es una copia cada 15 días.
const porUsuario = new Map();
function pasado(uid) {
  const ahora = Date.now();
  const e = porUsuario.get(uid);
  if (!e || ahora - e.desde > 60 * 60 * 1000) { porUsuario.set(uid, { desde: ahora, n: 1 }); return false; }
  e.n += 1;
  return e.n > 5;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) return json(500, { error: 'El envío por correo no está configurado (falta RESEND_API_KEY).' });

  const cabecera = event.headers.authorization || event.headers.Authorization || '';
  let quien;
  try {
    quien = await usuarioDelToken(cabecera.replace(/^Bearer\s+/i, '').trim());
  } catch (err) {
    return json(401, { error: `No he podido comprobar tu sesión: ${err.message}` });
  }
  if (pasado(quien.uid)) return json(429, { error: 'Ya se han enviado varias copias seguidas. Espera un rato.' });

  let cuerpo;
  try {
    cuerpo = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { error: 'La petición no es un JSON válido.' });
  }
  const nombre = String(cuerpo.nombre || '');
  const contenido = String(cuerpo.contenido || '');
  if (!/^alquileres-copia-\d{8}-\d{4}\.json$/.test(nombre)) return json(400, { error: 'Nombre de copia inesperado.' });
  if (!contenido || contenido.length > MAX_BASE64) return json(413, { error: 'La copia es demasiado grande para el correo.' });
  const registros = Number(cuerpo.registros) || 0;
  const quienLaHace = quien.email.replace(/@.*/, '') || 'la app';

  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: DE,
        to: PARA,
        subject: `Copia de seguridad de Alquileres · ${nombre.slice(17, 25).replace(/(\d{4})(\d{2})(\d{2})/, '$3/$2/$1')}`,
        text: `Copia de seguridad de Alquileres, hecha por ${quienLaHace}.\n\n`
          + `Fichero adjunto: ${nombre}${registros ? ` (${registros} registros)` : ''}.\n`
          + 'Guárdalo en la carpeta de copias. Se manda sola cada 15 días al abrir la aplicación.',
        attachments: [{ filename: nombre, content: contenido }],
      }),
    });
    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      console.error('alquileres-copia-correo: Resend', resp.status, err);
      return json(502, { error: err.message || `El servicio de correo ha contestado ${resp.status}.` });
    }
    return json(200, { ok: true, para: PARA.join(" y ") });
  } catch (err) {
    console.error('alquileres-copia-correo:', err);
    return json(502, { error: 'No se ha podido contactar con el servicio de correo.' });
  }
};
