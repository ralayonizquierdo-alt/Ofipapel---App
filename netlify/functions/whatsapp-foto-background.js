// LA FOTO ESPERA A SU PREGUNTA, Y ESTO ES LO QUE PASA SI NO LLEGA.
//
// En WhatsApp la foto y la pregunta son dos mensajes: primero la imagen y un
// segundo después "¿y este papel?". Contestar a la foto nada más llegar es
// contestar a medias y encima soltar dos respuestas seguidas, una por mensaje.
// Decisión del propietario (19/10/2026): "prefiero que espere y conteste con
// todo el contexto antes que dar dos respuestas rápidas... la pregunta manda
// sobre la foto, la foto es para ampliar datos o contexto".
//
// Así que el webhook deja la foto leída en espera y delega aquí. Esta función
// aguarda un rato y mira si alguien se la llevó:
//
//   - Si el cliente preguntó, el webhook ya se la llevó y contestó con las dos
//     cosas. Aquí no queda nada y esta función se calla.
//   - Si no preguntó, se la lleva ella y contesta con la foto sola, que es
//     mejor que dejarle sin respuesta.
//
// El reparto no se decide mirando el historial sino quitando la foto de en
// medio (`tomarFotosPendientes` la saca y la borra a la vez): las dos corren al
// mismo tiempo y solo una puede llevársela. Sin eso, el cliente recibiría dos
// respuestas a lo mismo — justo lo que se vino a quitar.
//
// Va en segundo plano porque el webhook tiene ~10 segundos antes de que Meta dé
// la respuesta por perdida y reenvíe el mensaje: ahí no se puede esperar a
// nada. Las funciones -background de Netlify no tienen ese límite.
//
// Nadie de fuera puede invocarla: el webhook la firma y aquí se comprueba esa
// firma. Sin ella cualquiera que supiera la dirección podría hacer que el bot
// escribiera a cualquier número.

const { getHistory } = require('./whatsapp-agent-core');
const { todasLasNotas } = require('./whatsapp-notas');
const { responderAUnaFoto } = require('./whatsapp-foto-responder');
const { firmaDeReintento } = require('./whatsapp-firma');
const conversationStore = require('./conversation-store');

// CUÁNTO SE ESPERA A LA PREGUNTA.
//
// El que manda una foto y luego escribe tarda lo que tarda en teclear: unos
// segundos. Con quince se recoge prácticamente todo, y quien manda la foto a
// secas espera quince segundos a su respuesta, que en WhatsApp no se nota.
// Subirlo hace esperar a todo el mundo; bajarlo deja fuera al que escribe
// despacio y vuelven las dos respuestas.
//
// Se puede cambiar sin tocar el código con la variable FOTO_ESPERA_MS en
// Netlify (hace falta volver a desplegar para que llegue a las funciones).
const ESPERA_MS = Number(process.env.FOTO_ESPERA_MS) > 0 ? Number(process.env.FOTO_ESPERA_MS) : 15000;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { from, referencia, idioma = 'es', presentacion = '', firma } = payload;
  if (!from || !referencia) return { statusCode: 400, body: 'Faltan datos' };
  if (firma !== firmaDeReintento(from, referencia)) {
    console.error('whatsapp-foto: firma inválida, se ignora la petición.');
    return { statusCode: 401, body: 'Firma inválida' };
  }

  try {
    await dormir(ESPERA_MS);

    // Si el cliente preguntó mientras tanto, el webhook ya se llevó las fotos y
    // contestó con todo. Aquí no queda nada que hacer.
    const lecturas = await conversationStore.tomarFotosPendientes(from);
    if (!lecturas.length) return { statusCode: 200, body: 'Ya se contestó con la pregunta del cliente' };

    const [history, fichaCliente, notasDelPanel] = await Promise.all([
      getHistory(from),
      conversationStore.getFichaCliente(from),
      conversationStore.listarNotasNegocio(),
    ]);

    const enviado = await responderAUnaFoto({
      from,
      lecturas,
      // Sin pregunta: es justo el caso de la foto suelta.
      pregunta: '',
      history,
      fichaCliente,
      notas: todasLasNotas(notasDelPanel),
      idioma,
      presentacion,
    });

    // La foto del cliente ya la archivó el webhook al recibirla, así que aquí
    // solo falta lo que se le acabó contestando.
    await conversationStore.appendBotReply(from, enviado);
    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('whatsapp-foto: error contestando a la foto:', err);
    return { statusCode: 500, body: 'Error' };
  }
};

module.exports.ESPERA_MS = ESPERA_MS;
