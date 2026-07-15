// Panel web para revisar las conversaciones archivadas del bot de WhatsApp.
// Protegido con autenticación básica (usuario cualquiera, contraseña = DASHBOARD_PASSWORD).
// (deploy trigger: recoger el token de Upstash regenerado)
//
// URL: https://<tu-sitio>.netlify.app/.netlify/functions/conversations
//   ?phone=34600000000   -> ver el hilo completo de ese número
//
// Variables de entorno necesarias:
//   DASHBOARD_PASSWORD      contraseña para entrar al panel
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  almacén de conversaciones

const { isConfigured, loadConversation, listConversationPhones, diagnose } = require('./conversation-store');

function checkAuth(event) {
  const password = process.env.DASHBOARD_PASSWORD;
  if (!password) return false;

  const header = event.headers['authorization'] || event.headers['Authorization'] || '';
  const match = header.match(/^Basic (.+)$/);
  if (!match) return false;

  const decoded = Buffer.from(match[1], 'base64').toString('utf8');
  const separatorIndex = decoded.indexOf(':');
  const providedPassword = separatorIndex === -1 ? decoded : decoded.slice(separatorIndex + 1);
  return providedPassword === password;
}

function unauthorized() {
  return {
    statusCode: 401,
    headers: { 'WWW-Authenticate': 'Basic realm="Conversaciones Ofipapel"' },
    body: 'Unauthorized',
  };
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function pageShell(title, body) {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)}</title>
<link rel="icon" type="image/svg+xml" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iIzAwMDAwMCIvPjx0ZXh0IHg9IjUwIiB5PSI3MiIgZm9udC1zaXplPSI2NSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+8J+NgDwvdGV4dD48L3N2Zz4=">
<link rel="apple-touch-icon" href="data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI1MCIgZmlsbD0iIzAwMDAwMCIvPjx0ZXh0IHg9IjUwIiB5PSI3MiIgZm9udC1zaXplPSI2NSIgdGV4dC1hbmNob3I9Im1pZGRsZSI+8J+NgDwvdGV4dD48L3N2Zz4=">
<style>
  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; max-width: 720px; margin: 32px auto; padding: 0 16px; color: #222; }
  h1 { color: #1a6b2f; }
  a { color: #1a6b2f; }
  ul { list-style: none; padding: 0; }
  li { margin: 6px 0; }
  li a { display: block; padding: 12px 16px; background: #f5f5f5; border-radius: 10px; font-size: 16px; }
</style>
</head>
<body>${body}</body>
</html>`;
}

function renderDiagnostic(diagnostic) {
  if (diagnostic.ok) {
    return '<p style="color:#1a6b2f;font-size:14px;">✓ Conexión con Upstash correcta (lectura y escritura).</p>';
  }
  return `<div style="background:#fdecea;border:1px solid #f5c2c0;border-radius:10px;padding:12px 16px;margin:16px 0;">
  <strong style="color:#a41c14;">Fallo de conexión con Upstash (${escapeHtml(diagnostic.stage)})</strong>
  <p style="font-size:14px;margin:6px 0 0;">${escapeHtml(diagnostic.detail)}</p>
</div>`;
}

function renderList(phones, diagnostic) {
  const items = phones
    .map((p) => `<li><a href="?phone=${encodeURIComponent(p)}">${escapeHtml(p)}</a></li>`)
    .join('');
  return pageShell(
    'Conversaciones · Ofipapel',
    `<h1>Conversaciones</h1>${renderDiagnostic(diagnostic)}<ul>${items || '<li>Todavía no hay conversaciones archivadas.</li>'}</ul>`
  );
}

function renderThread(phone, messages) {
  const bubbles = messages
    .map((m) => {
      const isCustomer = m.role === 'user';
      const time = m.ts ? new Date(m.ts).toLocaleString('es-ES') : '';
      return `<div style="display:flex;justify-content:${isCustomer ? 'flex-start' : 'flex-end'};margin:10px 0;">
  <div style="max-width:75%;padding:10px 14px;border-radius:14px;background:${isCustomer ? '#f0f0f0' : '#d9f2d9'};">
    <div>${escapeHtml(m.content)}</div>
    <div style="font-size:11px;color:#888;margin-top:4px;">${escapeHtml(time)}</div>
  </div>
</div>`;
    })
    .join('');

  return pageShell(
    `${phone} · Conversaciones Ofipapel`,
    `<p><a href="?">← Todas las conversaciones</a></p><h1>${escapeHtml(phone)}</h1>${bubbles || '<p>Sin mensajes.</p>'}`
  );
}

exports.handler = async (event) => {
  if (!checkAuth(event)) return unauthorized();

  if (!isConfigured()) {
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: pageShell(
        'Panel no configurado',
        '<p>Faltan las variables <code>UPSTASH_REDIS_REST_URL</code> y <code>UPSTASH_REDIS_REST_TOKEN</code> en Netlify.</p>'
      ),
    };
  }

  const phone = event.queryStringParameters?.phone;

  if (phone) {
    const messages = await loadConversation(phone);
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: renderThread(phone, messages),
    };
  }

  const [phones, diagnostic] = await Promise.all([listConversationPhones(), diagnose()]);
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: renderList(phones, diagnostic),
  };
};
