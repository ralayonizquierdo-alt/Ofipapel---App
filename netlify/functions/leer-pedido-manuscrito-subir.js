// Primer paso de la lectura con IA (control-pedidos.html): recibe la foto o el
// PDF y lo deja en Netlify Blobs para que leer-pedido-manuscrito-background.js
// lo recoja por su jobId.
//
// Por qué existe: las Background Functions de Netlify rechazan con 413 todo
// cuerpo de más de ~256 KB (comprobado en producción el 2026-10-03: 200 KB →
// 202, 250 KB → 413). Una foto de móvil, aun reducida, y casi cualquier PDF de
// factura pasan de eso. Las funciones normales admiten hasta 6 MB, así que el
// fichero entra por aquí y a la de segundo plano solo le llega el jobId.
const { connectLambda, getStore } = require('@netlify/blobs');

const STORE_NAME = 'pedidos-manuscritos';
const JOB_ID_OK = /^[A-Za-z0-9-]{8,64}$/;
const TIPOS_OK = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_BASE64 = 4 * 1024 * 1024;
const CABECERAS = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const responde = (statusCode, cuerpo) => ({ statusCode, headers: CABECERAS, body: JSON.stringify(cuerpo) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  // Mismo token y mismo valor por defecto que la función de lectura (ver allí).
  const esperado = process.env.OCR_TOKEN || 'ofipapel-ocr-2026';
  const token = event.headers['x-ocr-token'] || event.headers['X-Ocr-Token'];
  if (token !== esperado) return responde(401, { error: 'Token inválido' });

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return responde(400, { error: 'JSON inválido' });
  }
  const { jobId, imagenBase64, mediaType } = payload;
  if (typeof jobId !== 'string' || !JOB_ID_OK.test(jobId)) return responde(400, { error: 'Falta jobId o no es válido' });
  if (typeof imagenBase64 !== 'string' || !imagenBase64) return responde(400, { error: 'Falta el fichero' });
  if (!TIPOS_OK.includes(mediaType)) return responde(400, { error: `Formato no admitido: ${mediaType || 'desconocido'}` });
  if (imagenBase64.length > MAX_BASE64) {
    return responde(413, { error: 'El fichero es demasiado grande (máximo unos 3 MB). Si es un PDF escaneado, redúcelo o haz una foto de cada página.' });
  }

  connectLambda(event);
  try {
    await getStore(STORE_NAME).setJSON('entrada-' + jobId, { imagenBase64, mediaType, subido: new Date().toISOString() });
  } catch (err) {
    return responde(502, { error: `No se pudo guardar el fichero: ${err.message}` });
  }
  return responde(200, { ok: true });
};
