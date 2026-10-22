// Devuelve el resultado de leer-pedido-manuscrito-background.js por jobId.
//
// En cuanto entrega un resultado terminado (bien o con error) lo borra: lleva
// el nombre del cliente y sus líneas, y no tiene por qué quedarse en Blobs una
// vez que la página lo tiene.
const { connectLambda, getStore } = require('@netlify/blobs');

const STORE_NAME = 'pedidos-manuscritos';
const JOB_ID_OK = /^[A-Za-z0-9-]{8,64}$/;
const CABECERAS = { 'content-type': 'application/json', 'cache-control': 'no-store' };
const responde = (statusCode, cuerpo) => ({ statusCode, headers: CABECERAS, body: JSON.stringify(cuerpo) });

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') return { statusCode: 405, body: 'Method Not Allowed' };

  const esperado = process.env.OCR_TOKEN || 'ofipapel-ocr-2026';
  const token = event.headers['x-ocr-token'] || event.headers['X-Ocr-Token'];
  if (token !== esperado) return responde(401, { error: 'Token inválido' });

  const jobId = event.queryStringParameters && event.queryStringParameters.jobId;
  if (!jobId || !JOB_ID_OK.test(jobId)) return responde(400, { error: 'Falta ?jobId= o no es válido' });

  connectLambda(event);
  const store = getStore(STORE_NAME);
  let data;
  try {
    data = await store.get(jobId, { type: 'json' });
  } catch (err) {
    return responde(502, { error: `No se pudo leer Netlify Blobs: ${err.message}` });
  }
  // Aún no ha empezado a escribir (la función en segundo plano tarda un
  // instante en arrancar) o sigue leyendo.
  if (!data || data.status === 'running') return responde(202, { status: 'running' });

  await store.delete(jobId).catch(() => {});
  return responde(200, data);
};
