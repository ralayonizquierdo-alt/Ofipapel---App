// Canva Connect — gestión de OAuth (FASE CANVA, DT-19,
// `.claude/rax/DEUDA_TECNICA.md`). Vive en la capa de función Netlify, no
// en creative-engine/ (que debe seguir siendo Node.js puro sin
// dependencias npm, ver README.md de provider-manager/), porque necesita
// @netlify/blobs para persistir el refresh_token: confirmado contra la
// documentación oficial de Canva (www.canva.dev/docs/connect/authentication/)
// que Canva ROTA el refresh_token en cada uso (de un solo uso) — a
// diferencia de OPENAI_API_KEY (una clave estática), guardar solo el
// valor inicial en una variable de entorno no basta: tras el primer
// refresco ese valor deja de ser válido si el nuevo no se persiste en
// algún sitio antes de la siguiente invocación.

const { getStore } = require('@netlify/blobs');

const TOKEN_ENDPOINT = 'https://api.canva.com/rest/v1/oauth/token';
const STORE_NAME = 'canva-oauth';
const TOKEN_KEY = 'tokens';

async function fetchWithTimeout(url, options, timeoutMs = 20_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Devuelve un access_token de Canva válido para esta invocación, o null si
 * Canva no está configurado todavía — sin CANVA_CLIENT_ID/CANVA_CLIENT_SECRET,
 * o sin ningún refresh_token disponible (ni guardado en Blobs de una
 * ejecución anterior, ni en CANVA_REFRESH_TOKEN como semilla inicial tras
 * el login OAuth interactivo único que documenta CANVA_CONNECT_ARCHITECTURE.md).
 * Null es el mismo criterio que el resto de proveedores opcionales del
 * pipeline (ver openai-images.provider.js — sin OPENAI_API_KEY, se cae a
 * "simulated" sin romper nada) — nunca lanza por "no configurado todavía",
 * solo lanza si Canva SÍ está configurado pero el refresco falla de
 * verdad (credenciales inválidas, refresh_token revocado, etc.).
 */
async function getCanvaAccessToken() {
  const clientId = process.env.CANVA_CLIENT_ID;
  const clientSecret = process.env.CANVA_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const store = getStore(STORE_NAME);
  const stored = await store.get(TOKEN_KEY, { type: 'json' }).catch(() => null);
  const refreshToken = (stored && stored.refreshToken) || process.env.CANVA_REFRESH_TOKEN;
  if (!refreshToken) return null;

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  const body = new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken });

  const res = await fetchWithTimeout(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body.toString(),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Canva OAuth: refresco de token respondió ${res.status}: ${errBody}`);
  }

  const json = await res.json();
  if (!json.access_token || !json.refresh_token) {
    throw new Error('Canva OAuth: la respuesta de refresco no incluyó access_token/refresh_token.');
  }

  // Refresh token rotativo — hay que guardar el nuevo ANTES de devolver
  // el control, o la siguiente invocación se queda sin ninguno válido
  // (ni el guardado, que ya se consumió aquí, ni el de la env var, que
  // solo sirve como semilla para la primera vez).
  await store.setJSON(TOKEN_KEY, {
    refreshToken: json.refresh_token,
    updatedAt: new Date().toISOString(),
  });

  return json.access_token;
}

module.exports = { getCanvaAccessToken };
