// Panel web para revisar las conversaciones archivadas del bot de WhatsApp.
// Protegido con autenticación básica (usuario cualquiera, contraseña = DASHBOARD_PASSWORD).
//
// URL: https://<tu-sitio>.netlify.app/.netlify/functions/conversations
//   ?phone=34600000000   -> ver el hilo completo de ese número
//
// Variables de entorno necesarias:
//   DASHBOARD_PASSWORD      contraseña para entrar al panel
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN  almacén de conversaciones

const {
  isConfigured,
  loadConversation,
  appendAgentMessage,
  listConversationPhones,
  pauseBot,
  isBotPaused,
  resumeBot,
  diagnose,
} = require('./conversation-store');
const { isAgenteInfoMessage } = require('./whatsapp-agent-config');
const { sendWhatsappMessage } = require('./whatsapp-send');

// Logo real de Ofipapel (design-studio/assets/logo-ofipapel-transparente.png), embebido
// como base64 para que el panel sea autocontenido y no dependa de que build.sh lo copie.
const LOGO_BASE64 = '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';

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

// --- Iconos SVG (en vez de emojis, para un aspecto más profesional/de marca) ---
const ICON = {
  warning: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>',
  pause: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>',
  play: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>',
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
  alert: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  chat: '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',
  back: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
  send: '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>',
  chevron: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>',
};

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
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

  :root {
    --green-dark: #1A5C1A;
    --green-mid: #237523;
    --green-light: #3DAF3D;
    --lime: #8DC41E;
    --orange: #F5A623;
    --bg: #F2F8F2;
    --bg-soft: #EBF7EB;
    --card: #FFFFFF;
    --text: #16321a;
    --text-muted: #5c7a5c;
    --border: #dcefdc;
    --danger: #c0392b;
    --danger-bg: #fdecea;
    --danger-border: #f5c2c0;
    --shadow: 0 1px 2px rgba(15,50,15,.06), 0 4px 14px rgba(15,50,15,.08);
    --shadow-hover: 0 2px 4px rgba(15,50,15,.08), 0 10px 24px rgba(15,50,15,.14);
  }

  * { box-sizing: border-box; }

  body {
    font-family: 'Inter', -apple-system, Segoe UI, Roboto, Arial, sans-serif;
    max-width: 720px;
    margin: 0 auto 48px;
    padding: 0 0 16px;
    background: var(--bg);
    color: var(--text);
    -webkit-font-smoothing: antialiased;
  }

  .topbar {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 22px 20px 26px;
    margin-bottom: 22px;
    background: linear-gradient(135deg, #0d3d0d 0%, var(--green-dark) 40%, var(--green-mid) 70%, #3a8f2a 100%);
    box-shadow: 0 6px 20px rgba(13,61,13,.25);
  }
  .topbar img { height: 40px; width: auto; display: block; filter: drop-shadow(0 2px 3px rgba(0,0,0,.25)); }
  .topbar h1 {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: .2px;
    color: #fff;
    text-shadow: 0 1px 0 rgba(255,255,255,.18), 0 3px 8px rgba(0,0,0,.35);
  }

  main { padding: 0 16px; }

  h2 { font-size: 15px; font-weight: 700; color: var(--green-dark); margin: 0 0 10px; }

  a { color: var(--green-mid); }

  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 12.5px; font-weight: 600;
    padding: 6px 10px; border-radius: 999px;
    line-height: 1;
  }
  .badge-ok { background: #e4f6e4; color: var(--green-dark); }
  .badge-error { background: var(--danger-bg); color: var(--danger); }

  .diagnostic {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 12px 16px; border-radius: 12px; margin: 0 0 18px;
    font-size: 13.5px;
  }
  .diagnostic.ok { background: #e4f6e4; color: var(--green-dark); border: 1px solid #c8e8c8; }
  .diagnostic.fail { background: var(--danger-bg); color: var(--danger); border: 1px solid var(--danger-border); }
  .diagnostic svg { flex-shrink: 0; margin-top: 1px; }
  .diagnostic strong { display: block; margin-bottom: 2px; }

  ul.convo-list { list-style: none; padding: 0; margin: 0; }
  ul.convo-list li { margin: 0 0 10px; }

  .convo-card {
    display: flex; align-items: center; gap: 14px;
    padding: 14px 16px;
    background: var(--card);
    border-radius: 14px;
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
    text-decoration: none;
    color: var(--text);
    transition: transform .18s ease, box-shadow .18s ease, border-color .18s ease;
  }
  .convo-card:hover, .convo-card:focus-visible { transform: translateY(-2px); box-shadow: var(--shadow-hover); border-color: var(--green-light); outline: none; }
  .convo-card:active { transform: translateY(0); }

  .convo-avatar {
    display: flex; align-items: center; justify-content: center;
    width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0;
    background: linear-gradient(135deg, var(--green-mid), var(--green-light));
    color: #fff;
    box-shadow: inset 0 1px 0 rgba(255,255,255,.25), 0 2px 6px rgba(35,117,35,.35);
  }
  .convo-card.escalated .convo-avatar {
    background: linear-gradient(135deg, #d9432f, var(--orange));
    box-shadow: inset 0 1px 0 rgba(255,255,255,.3), 0 2px 6px rgba(217,67,47,.4);
  }

  .convo-info { flex: 1; min-width: 0; }
  .convo-phone { font-family: 'IBM Plex Mono', monospace; font-size: 15.5px; font-weight: 600; }
  .convo-flag { display: flex; align-items: center; gap: 5px; color: var(--danger); font-size: 12.5px; font-weight: 600; margin-top: 3px; }

  .convo-card svg.chevron { flex-shrink: 0; color: var(--text-muted); }
  .convo-card.escalated { border-color: #f3c6bd; }

  .empty-state { padding: 24px 16px; text-align: center; color: var(--text-muted); font-size: 14px; background: var(--card); border-radius: 14px; border: 1px dashed var(--border); }

  .back-link {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 13.5px; font-weight: 600; color: var(--green-mid);
    text-decoration: none; margin-bottom: 14px;
  }
  .back-link:hover { color: var(--green-dark); }

  .thread-title {
    font-family: 'IBM Plex Mono', monospace;
    font-size: 21px; font-weight: 700; color: var(--green-dark);
    margin: 0 0 16px;
    text-shadow: 0 1px 0 #fff, 0 2px 0 rgba(26,92,26,.08);
  }

  .pause-bar {
    display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
    background: #fff7e6; border: 1px solid #f2dca0; color: #8a6416;
    padding: 10px 14px; border-radius: 12px; margin-bottom: 14px; font-size: 13.5px;
  }
  .pause-bar svg { flex-shrink: 0; }

  .btn {
    display: inline-flex; align-items: center; gap: 7px;
    border: none; border-radius: 10px; cursor: pointer;
    font-family: inherit; font-weight: 600; font-size: 14px;
    padding: 8px 14px;
    transition: transform .12s ease, box-shadow .12s ease, opacity .12s ease;
  }
  .btn:active { transform: scale(.97); }
  .btn:disabled { opacity: .6; cursor: default; transform: none; }

  .btn-ghost { background: #fff; color: #8a6416; border: 1px solid #f2dca0; }
  .btn-ghost:hover { background: #fffaf0; }

  .btn-primary {
    background: linear-gradient(135deg, var(--green-mid), var(--green-dark));
    color: #fff;
    box-shadow: 0 2px 6px rgba(26,92,26,.35);
  }
  .btn-primary:hover { box-shadow: 0 4px 12px rgba(26,92,26,.45); }

  .error-banner { display: flex; gap: 10px; background: var(--danger-bg); border: 1px solid var(--danger-border); color: var(--danger); padding: 12px 16px; border-radius: 12px; margin: 0 0 14px; font-size: 13.5px; }
  .error-banner svg { flex-shrink: 0; margin-top: 1px; }

  .bubble-row { display: flex; margin: 10px 0; }
  .bubble-row.right { justify-content: flex-end; }
  .bubble {
    max-width: 78%; padding: 10px 14px; border-radius: 16px;
    box-shadow: var(--shadow); font-size: 14.5px; line-height: 1.45;
  }
  .bubble.customer { background: #fff; border: 1px solid var(--border); border-bottom-left-radius: 4px; }
  .bubble.bot { background: var(--bg-soft); border: 1px solid #cdeacd; border-bottom-right-radius: 4px; }
  .bubble.agent { background: #e7f0fd; border: 1px solid #c6dbf9; border-bottom-right-radius: 4px; }
  .bubble .sender { font-size: 11px; font-weight: 700; color: var(--green-mid); margin-bottom: 3px; }
  .bubble.agent .sender { color: #2a5ea8; }
  .bubble .time { font-size: 10.5px; color: var(--text-muted); margin-top: 5px; }

  .empty-thread { padding: 24px; text-align: center; color: var(--text-muted); font-size: 14px; }

  .reply-form { margin-top: 22px; }
  .reply-form textarea {
    width: 100%; padding: 12px 14px; border-radius: 12px;
    border: 1.5px solid var(--border); font-family: inherit; font-size: 15px;
    background: #fff; resize: vertical;
    transition: border-color .15s ease, box-shadow .15s ease;
  }
  .reply-form textarea:focus { outline: none; border-color: var(--green-light); box-shadow: 0 0 0 3px rgba(61,175,61,.18); }
  .reply-form .btn-primary { margin-top: 10px; }
</style>
</head>
<body>
<div class="topbar">
  <img src="data:image/png;base64,${LOGO_BASE64}" alt="Ofipapel">
  <h1>Conversaciones</h1>
</div>
<main>${body}</main>
</body>
</html>`;
}

// "Requiere atención" solo si el escalado más reciente todavía no ha tenido
// ninguna respuesta manual (role "agent") después. En cuanto contestas desde el
// panel, se considera atendida (aunque quede en el historial que se escaló).
function needsAttention(messages) {
  let pending = false;
  for (const m of messages) {
    if (m.role === 'assistant' && isAgenteInfoMessage(m.content)) pending = true;
    else if (m.role === 'agent') pending = false;
  }
  return pending;
}

function renderDiagnostic(diagnostic) {
  if (diagnostic.ok) {
    return `<div class="diagnostic ok">${ICON.check}<span>Conexión con Upstash correcta (lectura y escritura).</span></div>`;
  }
  return `<div class="diagnostic fail">${ICON.alert}<div><strong>Fallo de conexión con Upstash (${escapeHtml(diagnostic.stage)})</strong>${escapeHtml(diagnostic.detail)}</div></div>`;
}

function renderList(entries, diagnostic) {
  // Las conversaciones con escalado confirmado van primero, para que salten a la vista.
  const sorted = [...entries].sort((a, b) => Number(b.escalated) - Number(a.escalated));
  const items = sorted
    .map(({ phone, escalated }) => {
      const flag = escalated ? `<div class="convo-flag">${ICON.warning} Requiere atención</div>` : '';
      return `<li><a class="convo-card${escalated ? ' escalated' : ''}" href="?phone=${encodeURIComponent(phone)}">
    <div class="convo-avatar">${ICON.chat}</div>
    <div class="convo-info">
      <div class="convo-phone">${escapeHtml(phone)}</div>
      ${flag}
    </div>
    <span class="chevron">${ICON.chevron}</span>
  </a></li>`;
    })
    .join('');
  return pageShell(
    'Conversaciones · Ofipapel',
    `${renderDiagnostic(diagnostic)}<ul class="convo-list">${items || '<li><div class="empty-state">Todavía no hay conversaciones archivadas.</div></li>'}</ul>`
  );
}

function renderThread(phone, messages, { paused, error } = {}) {
  const bubbles = messages
    .map((m) => {
      const isCustomer = m.role === 'user';
      const isAgent = m.role === 'agent';
      const kind = isCustomer ? 'customer' : isAgent ? 'agent' : 'bot';
      const time = m.ts ? new Date(m.ts).toLocaleString('es-ES') : '';
      const sender = isAgent ? '<div class="sender">Tú</div>' : '';
      return `<div class="bubble-row ${isCustomer ? 'left' : 'right'}">
  <div class="bubble ${kind}">
    ${sender}
    <div>${escapeHtml(m.content)}</div>
    <div class="time">${escapeHtml(time)}</div>
  </div>
</div>`;
    })
    .join('');

  const errorBanner = error
    ? `<div class="error-banner">${ICON.alert}<span>No se pudo enviar el mensaje. Puede que hayan pasado más de 24h desde el último mensaje del cliente — en ese caso WhatsApp exige una plantilla aprobada en vez de texto libre.</span></div>`
    : '';

  const pauseBar = paused
    ? `<div class="pause-bar">
    ${ICON.pause}
    <span>Bot en pausa — tus mensajes no se cruzarán con los suyos.</span>
    <form method="POST" style="margin-left:auto;">
      <input type="hidden" name="phone" value="${escapeHtml(phone)}">
      <input type="hidden" name="action" value="resume">
      <button type="submit" class="btn btn-ghost">${ICON.play} Reactivar bot</button>
    </form>
  </div>`
    : '';

  const replyForm = `<form class="reply-form" method="POST" onsubmit="this.querySelector('button').disabled=true;this.querySelector('button').lastChild.textContent=' Enviando...';">
  <input type="hidden" name="phone" value="${escapeHtml(phone)}">
  <input type="hidden" name="action" value="reply">
  <textarea name="message" rows="3" required placeholder="Escribe tu respuesta..."></textarea>
  <button type="submit" class="btn btn-primary">${ICON.send} Enviar</button>
</form>`;

  return pageShell(
    `${phone} · Conversaciones Ofipapel`,
    `<a class="back-link" href="?">${ICON.back} Todas las conversaciones</a>
<h2 class="thread-title">${escapeHtml(phone)}</h2>
${pauseBar}${errorBanner}${bubbles || '<div class="empty-thread">Sin mensajes.</div>'}${replyForm}`
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

  if (event.httpMethod === 'POST') {
    const rawBody = event.isBase64Encoded ? Buffer.from(event.body, 'base64').toString('utf8') : event.body || '';
    const params = new URLSearchParams(rawBody);
    const phone = params.get('phone') || '';
    const action = params.get('action');

    if (phone && action === 'reply') {
      const message = (params.get('message') || '').trim();
      if (message) {
        const result = await sendWhatsappMessage(phone, message);
        if (!result.ok) {
          return {
            statusCode: 303,
            headers: { Location: `?phone=${encodeURIComponent(phone)}&error=1` },
            body: '',
          };
        }
        await appendAgentMessage(phone, message);
        await pauseBot(phone, 24); // que no se crucen bot y respuesta manual
      }
    } else if (phone && action === 'resume') {
      await resumeBot(phone);
    }

    return {
      statusCode: 303,
      headers: { Location: `?phone=${encodeURIComponent(phone)}` },
      body: '',
    };
  }

  const phone = event.queryStringParameters?.phone;

  if (phone) {
    const [messages, paused] = await Promise.all([loadConversation(phone), isBotPaused(phone)]);
    const error = event.queryStringParameters?.error === '1';
    return {
      statusCode: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: renderThread(phone, messages, { paused, error }),
    };
  }

  const [phones, diagnostic] = await Promise.all([listConversationPhones(), diagnose()]);
  const entries = await Promise.all(
    phones.map(async (phone) => {
      const messages = await loadConversation(phone);
      const escalated = needsAttention(messages);
      return { phone, escalated };
    })
  );
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
    body: renderList(entries, diagnostic),
  };
};
