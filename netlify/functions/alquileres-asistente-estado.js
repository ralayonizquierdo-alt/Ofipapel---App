// Devuelve la respuesta que dejó `alquileres-asistente-background.js`, por jobId.
//
// La página pregunta cada poco hasta que hay algo. En cuanto entrega un
// resultado terminado —bien o con error— lo borra: lleva cifras del negocio y
// no tiene por qué quedarse en Blobs una vez que la página lo tiene.
//
// Pide el mismo token de sesión de Firebase que la pregunta: sin sesión
// abierta en Alquileres no se puede recoger una respuesta, ni la propia ni la
// de nadie.

const { connectLambda, getStore } = require('@netlify/blobs');
const { STORE, JOB_ID_OK, CORS, json, usuarioDelToken, tokenDe } = require('./alquileres-asistente-core');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers: CORS, body: '' };
  if (event.httpMethod !== 'GET') return json(405, { error: 'Method Not Allowed' });

  try {
    await usuarioDelToken(tokenDe(event));
  } catch (err) {
    return json(401, { error: `No he podido comprobar tu sesión: ${err.message}` });
  }

  const jobId = event.queryStringParameters && event.queryStringParameters.jobId;
  if (!jobId || !JOB_ID_OK.test(jobId)) return json(400, { error: 'Falta ?jobId= o no es válido' });

  connectLambda(event);
  const store = getStore(STORE);

  let dato;
  try {
    dato = await store.get(jobId, { type: 'json' });
  } catch (err) {
    return json(502, { error: `No se pudo leer el resultado: ${err.message}` });
  }

  // Todavía no está: la página seguirá preguntando.
  if (!dato) return json(200, { estado: 'pensando' });

  try {
    await store.delete(jobId);
  } catch {
    // Que no se haya podido borrar no es motivo para no entregarlo.
  }
  return json(200, dato);
};
