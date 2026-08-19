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

async function construirContextoCatalogo({ from, text, history }) {
  if (!woocommerce.isConfigured()) return { productContext: null, fallo: false };

  // Si el mensaje es muy corto (p. ej. "A4", "en fucsia", "tenaza"), lo más
  // probable es que sea la respuesta a una pregunta de aclaración de la IA sobre
  // tamaño/color/tipo — se combina con el mensaje anterior del cliente para no
  // perder ese contexto en la búsqueda (si se buscara solo "A4", encontraría
  // cualquier cosa en A4).
  const esRespuestaCorta = text.trim().split(/\s+/).filter(Boolean).length <= 3;
  const mensajeAnterior = [...history].reverse().find((m) => m.role === 'user');
  const searchQuery = esRespuestaCorta && mensajeAnterior ? `${mensajeAnterior.content} ${text}` : text;

  const [busqueda, categorias] = await Promise.all([
    woocommerce.buscarEnCatalogo(searchQuery, 6),
    woocommerce.searchCategories(searchQuery),
  ]);

  let productos = busqueda.productos;
  let fallo = busqueda.fallo;

  // Una pregunta de seguimiento puede no ser corta y aun así depender del
  // mensaje anterior — comprobado en real: tras preguntar por cartuchos
  // "603XL", el cliente escribió "Do you have generics or compatibles?" (6
  // palabras, así que no entraba por la vía de arriba) y esa frase suelta no
  // encuentra nada en el catálogo, aunque los compatibles existan. Si la
  // búsqueda se queda vacía y hay un mensaje anterior, se reintenta con los
  // dos juntos: es más fiable que fiarlo todo a un número de palabras.
  if (productos.length === 0 && mensajeAnterior && !esRespuestaCorta) {
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

  return { productContext: bloques.length > 0 ? bloques.join('\n\n') : null, fallo };
}

module.exports = { construirContextoCatalogo };
