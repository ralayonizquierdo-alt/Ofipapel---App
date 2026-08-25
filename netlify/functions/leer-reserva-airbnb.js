// Lee el texto de una captura de pantalla de una reserva de Airbnb.
//
// Por qué existe: los avisos de reserva llegan a la aplicación de Airbnb en el
// móvil, y ahí seleccionar y copiar el texto es incómodo. Hacer una captura y
// soltarla es mucho más rápido. Esta función solo transcribe lo que ve; quién
// interpreta las fechas, el huésped y las noches sigue siendo
// alquileres/src/lib/pegarReservas.ts, que es donde están las pruebas.
//
// Esa separación es a propósito: el modelo no decide nada de negocio, solo
// convierte la imagen en el mismo texto que saldría de copiar y pegar. Así,
// si mañana cambia el formato del aviso, se arregla en un sitio.
//
// Variables de entorno (Netlify > Site settings > Environment variables):
//   ANTHROPIC_API_KEY  la misma que ya usan el bot de WhatsApp y chat-assistant.
//   OCR_TOKEN          (opcional) cadena que tú inventas; si está puesta, la
//                      petición debe traerla en la cabecera x-ocr-token. En el
//                      cliente se inyecta con VITE_OCR_TOKEN al construir
//                      alquileres. Igual que en chat-assistant, no es un
//                      secreto de verdad —va dentro del JavaScript servido—,
//                      solo evita dejar el endpoint completamente abierto.
//
// Se llama con fetch directo, sin el SDK de Anthropic, para no añadir
// dependencias al bundle de las funciones: es exactamente lo que ya hace
// chat-assistant.js al lado.

const CLAUDE_MODEL = 'claude-opus-5';
const MAX_TOKENS = 1024;
/** Un aviso de Airbnb es texto corto y claro: no hace falta que se lo piense. */
const EFFORT = 'low';

/** Lo que Netlify acepta de cuerpo es ~6 MB; el base64 infla un tercio. */
const MAX_BASE64 = 4 * 1024 * 1024;

const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-ocr-token, X-Ocr-Token',
};

const INSTRUCCIONES = `Transcribe TODO el texto visible de esta captura de pantalla, línea a línea y en el mismo orden en que aparece.

Reglas:
- Copia el texto tal cual, sin traducir, sin corregir y sin reordenar.
- Respeta los guiones de los rangos de fechas («16–22 sept») y los separadores («·»).
- Si dos columnas van una al lado de la otra (por ejemplo «Llegada» y «Salida»), escribe primero el bloque de la izquierda entero y después el de la derecha.
- No añadas comentarios, ni encabezados, ni explicaciones: solo el texto de la imagen.
- Si la imagen no es un aviso de reserva, transcríbela igualmente.`;

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_PER_IP = 30;
const requestsByIp = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = requestsByIp.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    requestsByIp.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_PER_IP;
}

function clientIp(event) {
  return (
    event.headers['x-nf-client-connection-ip'] ||
    (event.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    'unknown'
  );
}

const responde = (statusCode, cuerpo) => ({
  statusCode,
  headers: { ...CORS_HEADERS, 'content-type': 'application/json' },
  body: JSON.stringify(cuerpo),
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
  }

  const esperado = process.env.OCR_TOKEN;
  if (esperado) {
    const token = event.headers['x-ocr-token'] || event.headers['X-Ocr-Token'];
    if (token !== esperado) return responde(401, { error: 'Token inválido' });
  }

  if (isRateLimited(clientIp(event))) {
    return responde(429, { error: 'Demasiadas imágenes seguidas. Espera un momento.' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return responde(500, { error: 'Lector de imágenes no configurado (falta ANTHROPIC_API_KEY)' });
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return responde(400, { error: 'JSON inválido' });
  }

  const { imagenBase64, mediaType } = payload;
  if (typeof imagenBase64 !== 'string' || !imagenBase64) {
    return responde(400, { error: 'Falta la imagen' });
  }
  if (!TIPOS_OK.includes(mediaType)) {
    return responde(400, { error: `Formato no admitido: ${mediaType || 'desconocido'}` });
  }
  if (imagenBase64.length > MAX_BASE64) {
    return responde(413, { error: 'La imagen es demasiado grande. Prueba con una captura más pequeña.' });
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        output_config: { effort: EFFORT },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType, data: imagenBase64 } },
            { type: 'text', text: INSTRUCCIONES },
          ],
        }],
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      console.error('Claude respondió', resp.status, err.error?.message);
      return responde(resp.status, { error: err.error?.message || 'Error de Claude API' });
    }

    const data = await resp.json();
    // Con thinking activado vienen también bloques de tipo "thinking": solo
    // interesa el texto.
    const texto = (data.content || [])
      .filter((b) => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();

    if (!texto) return responde(502, { error: 'No se ha podido leer nada en la imagen' });
    return responde(200, { texto });
  } catch (err) {
    console.error('Fallo leyendo la captura:', err);
    return responde(502, { error: 'No se pudo contactar con el lector de imágenes' });
  }
};
