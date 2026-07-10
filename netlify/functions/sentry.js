// Inicialización de Sentry compartida entre whatsapp-webhook.js y
// twilio-webhook.js. No hace nada si SENTRY_DSN no está configurada.

const Sentry = require('@sentry/node');

let initialized = false;

function ensureInit() {
  if (initialized) return;
  initialized = true;
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return;
  Sentry.init({ dsn, environment: process.env.CONTEXT || 'production' });
}

function captureException(err) {
  ensureInit();
  if (process.env.SENTRY_DSN) Sentry.captureException(err);
}

module.exports = { captureException };
