// Firma compartida entre el webhook y el reintento en segundo plano.
//
// Las funciones de Netlify son direcciones públicas: cualquiera que averigüe la
// del reintento podría llamarla con el número que quisiera y hacer que el bot
// le escriba a esa persona. Por eso el webhook firma lo que envía y el reintento
// comprueba esa firma antes de mover un dedo.
//
// El secreto sale de variables que ya existen y que solo conoce el servidor. Si
// no hubiera ninguna, la firma devuelve null y el reintento rechaza TODO — antes
// quedarse sin reintento que dejar una puerta abierta.

const crypto = require('crypto');

function secretoInterno() {
  return process.env.WHATSAPP_APP_SECRET || process.env.WHATSAPP_TOKEN || '';
}

function firmaDeReintento(from, text) {
  const secreto = secretoInterno();
  if (!secreto) return null;
  return crypto.createHmac('sha256', secreto).update(`${from}|${text}`).digest('hex');
}

module.exports = { firmaDeReintento };
