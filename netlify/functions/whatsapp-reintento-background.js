// Segundo intento de búsqueda en el catálogo, en SEGUNDO PLANO.
//
// El webhook tiene ~10 segundos para contestarle a Meta. Si se pasa, Meta da la
// respuesta por perdida y reenvía el mensaje — y el cliente recibe respuestas
// duplicadas (pasó en real). Por eso ahí no cabe un reintento: una búsqueda
// lenta ya se come 6 segundos.
//
// Cuando la web de Ofipapel no contesta (va lenta, está caída o su protección
// anti-bots nos bloquea), el webhook manda un "dame un segundo" y delega aquí.
// Las funciones con sufijo -background de Netlify no tienen ese límite: pueden
// tardar minutos. Así que aquí se reintenta con calma y se manda la respuesta
// buena cuando la hay.
//
// Nadie de fuera puede invocarla: el webhook la firma (ver firmaDeReintento) y
// aquí se comprueba esa firma. Sin ella cualquiera que supiera la dirección
// podría hacer que el bot escribiera a cualquier número.

// El mensaje del cliente NO se archiva aquí: ya lo archivó el webhook antes de
// delegar, para no perderlo si este reintento no llegara a ejecutarse.
const { askClaude, getHistory } = require('./whatsapp-agent-core');
const {
  isNoSeLaRespuesta,
  NO_SE_LA_RESPUESTA,
  isUnverifiedConfirmation,
  isUnverifiedStockClaim,
  PRODUCTO_NO_VERIFICADO_INFO,
} = require('./whatsapp-agent-config');
const { construirContextoCatalogo, unirContexto } = require('./whatsapp-catalogo');
const { respuestaSinCatalogo } = require('./whatsapp-consumibles');
const { sendWhatsappMessage } = require('./whatsapp-send');
const woocommerce = require('./woocommerce-client');
const conversationStore = require('./conversation-store');
const { firmaDeReintento } = require('./whatsapp-firma');

// Cuántas veces se vuelve a intentar y cuánto se espera entre intentos. Los
// cortes de la web suelen durar segundos, no minutos, así que con tres intentos
// espaciados se recupera la inmensa mayoría; y si no, se contesta igual, nunca
// se deja al cliente sin respuesta.
const INTENTOS = 3;
const ESPERA_ENTRE_INTENTOS_MS = 2500;

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function buscarConPaciencia({ from, text, history }) {
  woocommerce.usarTiemposLargos();

  // Lo que sabemos de la impresora del cliente no depende de la web, así que se
  // conserva aunque los tres intentos se queden sin catálogo: con eso solo ya se
  // le puede decir qué referencia necesita.
  let consumibles = null;
  let equipos = [];

  for (let intento = 1; intento <= INTENTOS; intento += 1) {
    const { productContext, contextoConsumibles, impresoras, fallo } =
      await construirContextoCatalogo({ from, text, history });
    consumibles = contextoConsumibles || consumibles;
    equipos = impresoras && impresoras.length > 0 ? impresoras : equipos;

    // Con datos, o con un "no existe" fiable (la web contestó), ya no hay nada
    // que reintentar.
    if (productContext || !fallo) {
      return { productContext, contextoConsumibles: consumibles, impresoras: equipos, fallo };
    }

    console.warn(`whatsapp-reintento: intento ${intento} de ${INTENTOS} sin respuesta de la web`);
    if (intento < INTENTOS) await dormir(ESPERA_ENTRE_INTENTOS_MS);
  }

  return { productContext: null, contextoConsumibles: consumibles, impresoras: equipos, fallo: true };
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { from, text, firma } = payload;
  if (!from || !text) return { statusCode: 400, body: 'Faltan datos' };
  if (firma !== firmaDeReintento(from, text)) {
    console.error('whatsapp-reintento: firma inválida, se ignora la petición.');
    return { statusCode: 401, body: 'Firma inválida' };
  }

  try {
    const [history, fichaCliente] = await Promise.all([
      getHistory(from),
      conversationStore.getFichaCliente(from),
    ]);

    const { productContext, contextoConsumibles, impresoras, fallo } = await buscarConPaciencia({
      from,
      text,
      history,
    });

    let reply = await askClaude(
      text,
      history,
      unirContexto(contextoConsumibles, productContext),
      fichaCliente
    );

    // Mismas redes de seguridad que en el webhook: sin datos reales de catálogo
    // no nos fiamos de una confirmación de la IA, que puede ser invención.
    if (!productContext && (isUnverifiedConfirmation(reply) || isUnverifiedStockClaim(reply))) {
      reply = respuestaSinCatalogo(impresoras) || PRODUCTO_NO_VERIFICADO_INFO;
    }
    if (isNoSeLaRespuesta(reply)) reply = NO_SE_LA_RESPUESTA;

    await sendWhatsappMessage(from, reply);
    await conversationStore.appendBotReply(from, reply);

    if (fallo) {
      console.error(`whatsapp-reintento: la web siguió sin responder tras ${INTENTOS} intentos (${from}).`);
    }
    return { statusCode: 200, body: 'OK' };
  } catch (err) {
    console.error('whatsapp-reintento: error procesando el reintento:', err);
    return { statusCode: 500, body: 'Error' };
  }
};
