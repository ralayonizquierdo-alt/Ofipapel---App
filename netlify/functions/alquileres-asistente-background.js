// «Preguntar a la aplicación» de Alquileres: la pregunta, en segundo plano.
//
// ─── Por qué en segundo plano ───────────────────────────────────────────────
// El 30/10/2026 el asistente dejó de contestar: salía «El asistente no ha
// podido responder», que es el mensaje genérico de la página cuando la función
// devuelve algo que ni siquiera es un error suyo. En los registros de Netlify
// del sitio `ofipapel` la función figuraba con una sola respuesta correcta en
// 24 horas y **8,6 segundos** de duración. Una función normal de Netlify se
// corta a los 10 segundos y devuelve una página de error que no es JSON: de
// ahí el mensaje genérico. Pedirle dos o tres frases a un modelo puede pasar
// de 10 segundos cualquier día, así que el asistente no cabe en una función
// síncrona.
//
// El patrón es el mismo que ya se usa en el repo para leer pedidos
// (`leer-pedido-manuscrito-background.js` + `-estado.js`) y en el motor de
// marketing (DT-17): el sufijo `-background` hace que Netlify conteste 202 al
// momento y deje correr la función hasta 15 minutos; la respuesta se guarda en
// Netlify Blobs y la página la recoge con `alquileres-asistente-estado.js`.
//
// El `jobId` lo pone la página (un UUID) y viaja en el cuerpo: aquí no se
// puede devolver nada, porque Netlify ya ha contestado 202.
//
// Lo que NO cambia: la clave de Anthropic vive solo aquí, las cifras las
// calcula la app y se mandan ya hechas, esto no escribe en la base de datos, y
// hay que venir con el token de sesión de Firebase de Alquileres.
//
// Variables de entorno (sitio `ofipapel`): ANTHROPIC_API_KEY.

const { connectLambda, getStore } = require('@netlify/blobs');
const {
  MAX_CONTEXTO, STORE, JOB_ID_OK, usuarioDelToken, tokenDe, respuestaDeClaude,
} = require('./alquileres-asistente-core');

/** Cuántas preguntas seguidas admite una persona, para acotar el coste. */
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

exports.handler = async (event) => {
  // Netlify ya ha respondido 202 a la página: lo único que se puede hacer con
  // un fallo es dejarlo escrito donde la página va a mirarlo.
  let store = null;
  let jobId = null;

  const guarda = async (dato) => {
    if (!store || !jobId) return;
    try {
      await store.setJSON(jobId, { ...dato, ts: Date.now() });
    } catch (err) {
      console.error('alquileres-asistente-background: no se pudo guardar', err);
    }
  };

  try {
    let cuerpo;
    try {
      cuerpo = JSON.parse(event.body || '{}');
    } catch {
      return { statusCode: 200 };   // sin jobId no hay dónde dejar el aviso
    }

    jobId = String(cuerpo.jobId || '');
    if (!JOB_ID_OK.test(jobId)) return { statusCode: 200 };

    connectLambda(event);
    store = getStore(STORE);

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      await guarda({ estado: 'error', error: 'El asistente no está configurado (falta ANTHROPIC_API_KEY).' });
      return { statusCode: 200 };
    }

    let quien;
    try {
      quien = await usuarioDelToken(tokenDe(event));
    } catch (err) {
      await guarda({ estado: 'error', error: `No he podido comprobar tu sesión: ${err.message}` });
      return { statusCode: 200 };
    }

    if (pasado(quien.uid)) {
      await guarda({ estado: 'error', error: 'Has hecho muchas preguntas seguidas. Espera unos minutos.' });
      return { statusCode: 200 };
    }

    const pregunta = String(cuerpo.pregunta || '').trim();
    const contexto = String(cuerpo.contexto || '');
    if (!pregunta) {
      await guarda({ estado: 'error', error: 'No has escrito ninguna pregunta.' });
      return { statusCode: 200 };
    }
    if (contexto.length > MAX_CONTEXTO) {
      await guarda({ estado: 'error', error: 'El resumen de datos es demasiado grande.' });
      return { statusCode: 200 };
    }

    const r = await respuestaDeClaude({ apiKey, pregunta, contexto, historial: cuerpo.historial });
    await guarda(r.error ? { estado: 'error', error: r.error } : { estado: 'hecho', respuesta: r.respuesta });
    return { statusCode: 200 };
  } catch (err) {
    console.error('alquileres-asistente-background:', err);
    await guarda({ estado: 'error', error: 'Algo ha fallado al preguntar. Inténtalo otra vez.' });
    return { statusCode: 200 };
  }
};
