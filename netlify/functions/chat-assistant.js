// Proxy server-side para el "Asistente IA" de Index.html.
//
// Antes, cada usuario pegaba su propia API key de Anthropic en el navegador
// y el navegador llamaba directamente a api.anthropic.com (con el header
// "anthropic-dangerous-direct-browser-access") — la key quedaba expuesta en
// el Network tab/devtools y en localStorage de cada equipo. Esta función
// mueve la llamada al servidor: la key vive solo aquí, como variable de
// entorno, igual que ya se hacía para el agente de WhatsApp.
//
// Variables de entorno necesarias (Netlify > Site settings > Environment variables):
//   ANTHROPIC_API_KEY   la misma que ya usan las funciones de WhatsApp
//   CHAT_ASSISTANT_TOKEN  cadena que tú inventas; debe coincidir con la
//                         constante APP_CHAT_TOKEN embebida en Index.html.
//                         Como Index.html es HTML estático servido tal cual,
//                         cualquiera puede ver ese token con "ver código
//                         fuente" — no es un secreto real, solo sube el
//                         listón por encima de dejar el endpoint totalmente
//                         abierto. La protección real requiere autenticación
//                         de servidor de verdad (pendiente, ver P1-2 en
//                         .claude/rax/DEUDA_TECNICA.md).
//
// Límite de peticiones: best-effort en memoria (se reinicia si la función
// se "enfría"), pensado solo para acotar el coste ante un uso indebido, no
// como control de acceso.

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_PER_IP = 20;
const requestsByIp = new Map();

function isRateLimited(ip) {
  const now = Date.now();
  const entry = requestsByIp.get(ip);
  if (!entry || now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    requestsByIp.set(ip, { windowStart: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return entry.count > RATE_LIMIT_MAX_PER_IP;
}

function clientIp(event) {
  return (
    event.headers['x-nf-client-connection-ip'] ||
    (event.headers['x-forwarded-for'] || '').split(',')[0].trim() ||
    'unknown'
  );
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const expectedToken = process.env.CHAT_ASSISTANT_TOKEN;
  if (expectedToken) {
    const token = event.headers['x-chat-token'] || event.headers['X-Chat-Token'];
    if (token !== expectedToken) {
      return { statusCode: 401, body: JSON.stringify({ error: 'Token inválido' }) };
    }
  }

  const ip = clientIp(event);
  if (isRateLimited(ip)) {
    return { statusCode: 429, body: JSON.stringify({ error: 'Demasiadas peticiones, inténtalo más tarde' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Asistente no configurado (falta ANTHROPIC_API_KEY)' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { system, messages } = payload;
  if (!Array.isArray(messages) || !messages.length) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Falta "messages"' }) };
  }

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: MAX_TOKENS,
        system: typeof system === 'string' ? system : undefined,
        messages,
      }),
    });

    if (!resp.ok) {
      const err = await resp.json().catch(() => ({}));
      return { statusCode: resp.status, body: JSON.stringify({ error: err.error?.message || 'Error de Claude API' }) };
    }

    const data = await resp.json();
    const reply = data.content?.find((block) => block.type === 'text')?.text?.trim() || '(Sin respuesta)';
    return { statusCode: 200, body: JSON.stringify({ reply }) };
  } catch (err) {
    console.error('Fallo llamando a Claude desde chat-assistant:', err);
    return { statusCode: 502, body: JSON.stringify({ error: 'No se pudo contactar con Claude' }) };
  }
};
