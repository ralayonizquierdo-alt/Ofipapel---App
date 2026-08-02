// Endpoint de consulta de estado/resultado para marketing-engine-run-background.js
// (DT-17, `.claude/rax/DEUDA_TECNICA.md`). Función síncrona normal — es
// una simple lectura de Netlify Blobs, no ejecuta el pipeline, así que no
// tiene el problema de tiempo que motivó separarla de la generación.
//
// GET /.netlify/functions/marketing-engine-status?jobId=<trackingId>
//   - 400 si falta jobId
//   - 202 {status:'not_found_or_running'} si el background function aún no
//     ha escrito nada (o el trackingId no existe) — el cliente debe seguir
//     haciendo polling
//   - 200 con el mismo cuerpo que devolvía marketing-engine-run.js en su
//     día (incluye renderedAsset en base64 cuando ya está listo)

const { connectLambda, getStore } = require('@netlify/blobs');

const STORE_NAME = 'marketing-engine-jobs';

exports.handler = async (event) => {
  if (event.httpMethod !== 'GET') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const trackingId = event.queryStringParameters && event.queryStringParameters.jobId;
  if (!trackingId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta el parámetro ?jobId=' }) };
  }

  connectLambda(event);
  const store = getStore(STORE_NAME);
  const data = await store.get(trackingId, { type: 'json' });

  if (!data) {
    return { statusCode: 202, body: JSON.stringify({ status: 'not_found_or_running' }) };
  }

  return { statusCode: 200, body: JSON.stringify(data) };
};
