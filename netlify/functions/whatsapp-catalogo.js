// Búsqueda en el catálogo para un mensaje concreto, y el texto que se le pasa a
// la IA con lo encontrado. Vive aparte porque lo usan DOS sitios: el webhook
// (whatsapp-webhook.js) en el momento, y el reintento en segundo plano
// (whatsapp-reintento-background.js) cuando la web no contestó a la primera.
//
// Devuelve además si hubo un FALLO TÉCNICO, que es lo que permite distinguir
// "la web no contestó" de "ese producto no existe" — dos cosas que antes
// acababan igual y llevaban al bot a decirle al cliente que no encontraba algo
// que ni siquiera había podido mirar.

const woocommerce = require('./woocommerce-client');
const conversationStore = require('./conversation-store');
const consumibles = require('./whatsapp-consumibles');

// Une lo que sabemos del catálogo y lo que sabemos de la impresora del cliente.
// Los dos bloques son independientes: uno puede existir sin el otro.
function unirContexto(contextoConsumibles, productContext) {
  return [contextoConsumibles, productContext].filter(Boolean).join('\n\n') || null;
}

// Cuántos mensajes atrás se busca el modelo de impresora.
const MENSAJES_QUE_RECUERDAN_LA_IMPRESORA = 4;

function buscarImpresoraEnConversacion(text, history = []) {
  const enEsteMensaje = consumibles.buscarImpresoras(text);
  if (enEsteMensaje.length > 0) return enEsteMensaje;

  const anteriores = history
    .filter((m) => m.role === 'user')
    .slice(-MENSAJES_QUE_RECUERDAN_LA_IMPRESORA)
    .reverse();

  for (const mensaje of anteriores) {
    const encontradas = consumibles.buscarImpresoras(mensaje.content);
    if (encontradas.length > 0) return encontradas;
  }
  return [];
}

async function construirContextoCatalogo({ from, text, history }) {
  // El índice de consumibles viaja con el bot, así que responde aunque la web
  // esté caída. Se mira siempre, no solo cuando el cliente pregunta "qué
  // cartucho lleva": basta con que nombre su impresora en cualquier frase.
  //
  // Y se mira también en los mensajes anteriores, porque el modelo se dice UNA
  // vez y luego se da por sabido. Visto en real: "tengo una Epson XP-4200,
  // necesito tinta" y después "¿me muestras las opciones? necesito los 4" — en
  // el segundo mensaje ya no hay ni marca ni modelo, y sin esto el bot se
  // quedaba sin saber de qué impresora hablaban justo cuando tenía que dar los
  // precios. Solo los últimos mensajes: si nombró una impresora hace media
  // conversación y ahora pregunta por otra cosa, no viene a cuento.
  const impresoras = buscarImpresoraEnConversacion(text, history);
  const contextoConsumibles = consumibles.bloqueDeConsumibles(impresoras);

  if (!woocommerce.isConfigured()) {
    return { productContext: null, contextoConsumibles, impresoras, fallo: false };
  }

  // Si el mensaje es muy corto (p. ej. "A4", "en fucsia", "tenaza"), lo más
  // probable es que sea la respuesta a una pregunta de aclaración de la IA sobre
  // tamaño/color/tipo — se combina con el mensaje anterior del cliente para no
  // perder ese contexto en la búsqueda (si se buscara solo "A4", encontraría
  // cualquier cosa en A4).
  const esRespuestaCorta = text.trim().split(/\s+/).filter(Boolean).length <= 3;
  const mensajeAnterior = [...history].reverse().find((m) => m.role === 'user');
  const searchQuery = esRespuestaCorta && mensajeAnterior ? `${mensajeAnterior.content} ${text}` : text;

  // Si sabemos qué impresora tiene, su referencia es MEJOR consulta que la frase
  // que ha escrito: nadie escribe "TN-248", escribe "tóner para mi Brother" o
  // directamente "¿tenéis compatibles?". Visto en real las dos veces:
  //   - "¿me muestras las opciones? necesito los 4" no encuentra nada.
  //   - "¿tienen compatibles?" encuentra compatibles, sí, pero de cualquier cosa
  //     del catálogo, no los de su impresora — y con esa lista delante el bot
  //     contestó "sí tenemos, llama por teléfono" en vez de dar precios.
  // Por eso, cuando hay referencia, se busca por ella PRIMERO, y solo si no
  // devuelve nada se recurre a la frase del cliente.
  const referencia = impresoras.length === 1 ? consumibles.consultaDeCatalogo(impresoras[0]) : null;
  const consultaPrincipal = referencia ? `${impresoras[0].m} ${referencia}` : searchQuery;

  const [busqueda, categorias] = await Promise.all([
    woocommerce.buscarEnCatalogo(consultaPrincipal, 6),
    woocommerce.searchCategories(searchQuery),
  ]);

  let productos = busqueda.productos;
  let fallo = busqueda.fallo;

  if (productos.length === 0 && referencia) {
    const porFrase = await woocommerce.buscarEnCatalogo(searchQuery, 6);
    productos = porFrase.productos;
    fallo = fallo || porFrase.fallo;
  }

  // Una pregunta de seguimiento puede no ser corta y aun así depender del
  // mensaje anterior — comprobado en real: tras preguntar por cartuchos
  // "603XL", el cliente escribió "Do you have generics or compatibles?" (6
  // palabras, así que no entraba por la vía de arriba) y esa frase suelta no
  // encuentra nada en el catálogo, aunque los compatibles existan. Si la
  // búsqueda se queda vacía y hay un mensaje anterior, se reintenta con los
  // dos juntos: es más fiable que fiarlo todo a un número de palabras.
  //
  // Solo cuando NO hay referencia de impresora: con ella ya se han hecho las dos
  // búsquedas de arriba, y encadenar una tercera no cabe en los 10 segundos que
  // da Meta.
  if (productos.length === 0 && !referencia && mensajeAnterior && !esRespuestaCorta) {
    const conContexto = await woocommerce.buscarEnCatalogo(`${mensajeAnterior.content} ${text}`, 6);
    productos = conContexto.productos;
    fallo = fallo || conContexto.fallo;
  }

  const bloques = [];
  if (productos.length > 0) {
    // Se anota en su ficha por qué preguntó (lo que él escribió, no lo que la
    // IA deduzca), para poder reconocerle en próximas conversaciones.
    await conversationStore.registrarProductoPreguntado(from, text);
    bloques.push(
      `PRODUCTOS que coinciden:\n${productos
        .map(
          (p) =>
            `- ${p.nombre}: ${p.precio || 'precio no disponible'}${
              p.ofertaPorCantidad
                ? ' por unidad, CON DESCUENTO POR CANTIDAD (el precio baja al comprar más; el escalado completo está en la ficha)'
                : ''
            }, ${p.disponible ? 'con stock' : 'sin stock'} (${p.url})`
        )
        .join('\n')}`
    );
  }
  if (categorias.length > 0) {
    bloques.push(
      `CATEGORÍAS que coinciden (útil cuando la pregunta es genérica y hay varios tipos distintos):\n${categorias
        .map((c) => `- ${c.nombre} (${c.cantidadProductos} productos): ${c.url}`)
        .join('\n')}`
    );
  }

  return {
    productContext: bloques.length > 0 ? bloques.join('\n\n') : null,
    contextoConsumibles,
    impresoras,
    fallo,
  };
}

module.exports = { construirContextoCatalogo, unirContexto };
