// Backend de la "recepcionista" del hub (inicio.html): el mismo chat de
// chat-assistant.js, pero con herramientas (tool-use de Claude) para
// consultar datos REALES de Finanzas (Supabase) y Alquileres (Firebase) en
// vez de limitarse a explicar qué hace cada app.
//
// Variables de entorno necesarias (Netlify > Site settings > Environment
// variables, en el sitio "ofipapel"):
//   ANTHROPIC_API_KEY          la misma que ya usan chat-assistant.js y el
//                              bot de WhatsApp.
//   CHAT_ASSISTANT_TOKEN       la misma que ya protege chat-assistant.js
//                              (no es un secreto real, ver esa función).
//   SUPABASE_SERVICE_ROLE_KEY  la misma que ya usa avisos-pedidos.mjs en
//                              este sitio — da acceso de servidor a
//                              "registros" y "app_sync" sin pasar por el
//                              login de cada persona. SOLO LECTURA en este
//                              fichero: no se escribe nada en Supabase
//                              desde aquí, a propósito.
//   FIREBASE_SERVICE_ACCOUNT_ALQUILERES   JSON completo de una cuenta de
//                              servicio de Firebase para el proyecto
//                              "ofipapelvv" (Firebase Console > Configuración
//                              del proyecto > Cuentas de servicio > Generar
//                              nueva clave privada), pegado tal cual como
//                              variable de entorno (una sola línea; Netlify
//                              admite JSON con saltos de línea dentro del
//                              valor). Sin esta variable, las preguntas de
//                              Alquileres responden que no se puede consultar
//                              en vez de fallar la función entera.
//
// Por qué cuenta de servicio y no el login normal de cada app: las reglas
// de Finanzas (RLS) y de Alquileres (firestore.rules) ya exigen una cuenta
// real desde el 2026-10-07/antes — una función de servidor de confianza usa
// su propia credencial de "acceso total de lectura", en vez de guardar la
// contraseña de una persona real como si fuera un secreto de aplicación.

const CLAUDE_MODEL = 'claude-haiku-4-5-20251001';
const MAX_TOKENS = 1024;
const MAX_TOOL_ROUNDS = 4;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-chat-token, X-Chat-Token',
};

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

const SUPA_URL = 'https://agjmciudnnginqybnogh.supabase.co';
const FIREBASE_PROJECT_ID = 'ofipapelvv';

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

// ─── Finanzas (Supabase, proyecto "App Bancos") ──────────────────────────

let supaClient = null;
function getSupaClient() {
  if (supaClient) return supaClient;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return null;
  const { createClient } = require('@supabase/supabase-js');
  supaClient = createClient(SUPA_URL, key, { auth: { persistSession: false } });
  return supaClient;
}

function totalRegistro(r) {
  return (r.bbva_ofip || 0) + (r.sant_ico || 0) + (r.caixa_cta || 0) + (r.caixa_pol || 0) + (r.c7 || 0);
}

async function toolConsultarSaldoCaja(input) {
  const supa = getSupaClient();
  if (!supa) return { error: 'No configurado: falta SUPABASE_SERVICE_ROLE_KEY en el servidor.' };

  let query = supa.from('registros').select('*').order('fecha', { ascending: false }).limit(1);
  if (input && input.fecha) {
    query = supa.from('registros').select('*').eq('fecha', input.fecha).limit(1);
  }
  const { data, error } = await query;
  if (error) return { error: 'Error consultando Supabase: ' + error.message };
  if (!data || !data.length) return { encontrado: false, mensaje: input && input.fecha ? `No hay registro guardado para ${input.fecha}.` : 'No hay ningún registro de saldos guardado todavía.' };

  const r = data[0];
  const totalBancos = totalRegistro(r);
  return {
    encontrado: true,
    fecha: r.fecha,
    saldos_banco: {
      bbva_ofip: r.bbva_ofip || 0,
      sant_ico: r.sant_ico || 0,
      caixa_cta: r.caixa_cta || 0,
      caixa_pol: r.caixa_pol || 0,
      c7: r.c7 || 0,
    },
    efectivo_en_caja: r.caja_central || 0,
    total_bancos: Number(totalBancos.toFixed(2)),
    total_con_efectivo: Number((totalBancos + (r.caja_central || 0)).toFixed(2)),
    notas: r.notas || null,
  };
}

async function toolConsultarCierreCaja(input) {
  const supa = getSupaClient();
  if (!supa) return { error: 'No configurado: falta SUPABASE_SERVICE_ROLE_KEY en el servidor.' };

  const { data, error } = await supa.from('app_sync').select('payload').eq('id', 'cajacierres').limit(1);
  if (error) return { error: 'Error consultando Supabase: ' + error.message };
  const cierres = (data && data[0] && Array.isArray(data[0].payload)) ? data[0].payload : [];
  if (!cierres.length) return { encontrado: false, mensaje: 'No hay ningún cierre de caja guardado todavía.' };

  const fecha = (input && input.fecha) || null;
  const candidatos = fecha ? cierres.filter((c) => c.fecha === fecha) : [cierres[cierres.length - 1]];
  if (!candidatos.length) {
    return { encontrado: false, mensaje: `No hay ningún cierre guardado con fecha ${fecha}. Las fechas más recientes guardadas son: ${cierres.slice(-5).map((c) => c.fecha).join(', ')}.` };
  }

  return {
    encontrado: true,
    aviso: 'Esto es lo que trae el PDF de cierre guardado. Si falta comprobar qué recibos del banco están conciliados, eso solo se ve con detalle en Finanzas → Control de Caja.',
    cierres: candidatos.map((c) => ({
      fecha: c.fecha,
      fecha_apertura: c.fechaApertura || null,
      fecha_cierre_ingresos: c.fechaCierre || null,
      archivo: c.filename || null,
      abierto: !!c.abierto,
      efectivo_total: c.efectivoTotal != null ? c.efectivoTotal : null,
      tarjetas_total: c.tarjetasTotal != null ? c.tarjetasTotal : null,
      cheques_total: c.chequesTotal != null ? c.chequesTotal : null,
      efectivo_depositado_banco: c.efectivoBancoDeposit != null ? c.efectivoBancoDeposit : null,
      tarjetas_depositado_banco: c.tarjetasBancoDeposit != null ? c.tarjetasBancoDeposit : null,
      cuadrado_manual: c.cuadradoManual && !c.cuadradoManual.quitado
        ? { por: c.cuadradoManual.por || null, fecha: c.cuadradoManual.ts ? String(c.cuadradoManual.ts).slice(0, 10) : null }
        : null,
    })),
  };
}

// ─── Alquileres (Firebase Firestore, proyecto "ofipapelvv") ──────────────

let firestoreDb = null;
function getFirestore() {
  if (firestoreDb) return firestoreDb;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_ALQUILERES;
  if (!raw) return null;
  const admin = require('firebase-admin');
  if (!admin.apps.length) {
    const serviceAccount = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount), projectId: FIREBASE_PROJECT_ID });
  }
  firestoreDb = admin.firestore();
  return firestoreDb;
}

async function nombresApartamentos(db) {
  const snap = await db.collection('apartments').get();
  const map = {};
  snap.forEach((doc) => { const d = doc.data(); map[d.id || doc.id] = d.name || (d.id || doc.id); });
  return map;
}

async function toolConsultarReservasAlquileres(input) {
  const db = getFirestore();
  if (!db) return { error: 'No configurado: falta FIREBASE_SERVICE_ACCOUNT_ALQUILERES en el servidor.' };

  const fecha = (input && input.fecha) || hoyISO();
  const tipo = (input && input.tipo) || 'creadas';
  const campo = tipo === 'entran' ? 'checkIn' : tipo === 'salen' ? 'checkOut' : 'createdAt';

  const snap = await db.collection('reservations').get();
  const apartamentos = await nombresApartamentos(db);
  const todas = [];
  snap.forEach((doc) => todas.push(doc.data()));

  const coincide = (r) => {
    const v = r[campo];
    if (!v) return false;
    return String(v).slice(0, 10) === fecha;
  };
  const resultado = todas.filter(coincide);

  return {
    fecha,
    tipo,
    total: resultado.length,
    reservas: resultado.slice(0, 20).map((r) => ({
      apartamento: apartamentos[r.apartmentId] || r.apartmentId || null,
      huesped: r.guestName || null,
      entrada: r.checkIn || null,
      salida: r.checkOut || null,
      noches: r.nights != null ? r.nights : null,
      canal: r.channel || null,
      estado: r.status || null,
      total_euros: r.total != null ? r.total : null,
    })),
  };
}

async function toolConsultarCobrosPendientesAlquileres(input) {
  const db = getFirestore();
  if (!db) return { error: 'No configurado: falta FIREBASE_SERVICE_ACCOUNT_ALQUILERES en el servidor.' };

  const snap = await db.collection('payments').where('received', '==', false).get();
  const pendientes = [];
  snap.forEach((doc) => pendientes.push(doc.data()));

  let filtrados = pendientes;
  if (input && input.apartmentId) {
    filtrados = pendientes.filter((p) => p.apartmentId === input.apartmentId);
  }

  const totalPendiente = filtrados.reduce((s, p) => s + (p.amount || 0), 0);
  const apartamentos = await nombresApartamentos(db);

  return {
    total_cobros_pendientes: filtrados.length,
    importe_total_pendiente: Number(totalPendiente.toFixed(2)),
    cobros: filtrados.slice(0, 20).map((p) => ({
      apartamento: p.apartmentId ? (apartamentos[p.apartmentId] || p.apartmentId) : null,
      importe: p.amount != null ? p.amount : null,
      mes_contable: p.mes || null,
      metodo: p.paymentMethod || null,
    })),
  };
}

// ─── Definición de herramientas para Claude ──────────────────────────────

const TOOLS = [
  {
    name: 'consultar_saldo_caja',
    description: 'Da el último saldo guardado de las cuentas bancarias y el efectivo en caja de Ofipapel (Finanzas). Si no se indica fecha, da el más reciente.',
    input_schema: {
      type: 'object',
      properties: { fecha: { type: 'string', description: 'Fecha concreta en formato AAAA-MM-DD. Si se omite, el más reciente.' } },
    },
  },
  {
    name: 'consultar_cierre_caja',
    description: 'Dice si existe un cierre de caja guardado para una fecha (o el más reciente), si está abierto o cerrado, sus totales de efectivo/tarjetas/cheques y si tiene marca de "cuadrado por excepción". No da el detalle fino de qué recibos del banco están conciliados.',
    input_schema: {
      type: 'object',
      properties: { fecha: { type: 'string', description: 'Fecha concreta en formato AAAA-MM-DD. Si se omite, el cierre más reciente.' } },
    },
  },
  {
    name: 'consultar_reservas_alquileres',
    description: 'Busca reservas de los alquileres vacacionales por fecha: creadas ese día, que entran ese día, o que salen ese día.',
    input_schema: {
      type: 'object',
      properties: {
        fecha: { type: 'string', description: 'Fecha en formato AAAA-MM-DD. Si se omite, hoy.' },
        tipo: { type: 'string', enum: ['creadas', 'entran', 'salen'], description: 'Qué fecha de la reserva comparar. Por defecto "creadas".' },
      },
    },
  },
  {
    name: 'consultar_cobros_pendientes_alquileres',
    description: 'Lista los cobros de alquileres marcados como no recibidos todavía (pendientes de cobrar), con el importe total pendiente.',
    input_schema: {
      type: 'object',
      properties: { apartmentId: { type: 'string', description: 'Filtra por un apartamento concreto (opcional).' } },
    },
  },
];

const TOOL_IMPLS = {
  consultar_saldo_caja: toolConsultarSaldoCaja,
  consultar_cierre_caja: toolConsultarCierreCaja,
  consultar_reservas_alquileres: toolConsultarReservasAlquileres,
  consultar_cobros_pendientes_alquileres: toolConsultarCobrosPendientesAlquileres,
};

async function llamarClaude(apiKey, system, messages) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: CLAUDE_MODEL, max_tokens: MAX_TOKENS, system, messages, tools: TOOLS }),
  });
  if (!resp.ok) {
    const err = await resp.json().catch(() => ({}));
    const error = new Error(err.error?.message || 'Error de Claude API');
    error.status = resp.status;
    throw error;
  }
  return resp.json();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: CORS_HEADERS, body: 'Method Not Allowed' };
  }

  const expectedToken = process.env.CHAT_ASSISTANT_TOKEN;
  if (expectedToken) {
    const token = event.headers['x-chat-token'] || event.headers['X-Chat-Token'];
    if (token !== expectedToken) {
      return { statusCode: 401, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Token inválido' }) };
    }
  }

  const ip = clientIp(event);
  if (isRateLimited(ip)) {
    return { statusCode: 429, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Demasiadas peticiones, inténtalo más tarde' }) };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return { statusCode: 500, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Asistente no configurado (falta ANTHROPIC_API_KEY)' }) };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch (err) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'JSON inválido' }) };
  }

  const { system, messages, quien } = payload;
  if (!Array.isArray(messages) || !messages.length) {
    return { statusCode: 400, headers: CORS_HEADERS, body: JSON.stringify({ error: 'Falta "messages"' }) };
  }

  console.log('receptionist-chat: pregunta de', quien || '(sin identificar)', 'desde', ip);

  try {
    let running = messages.slice();
    let data = await llamarClaude(apiKey, typeof system === 'string' ? system : undefined, running);
    let rounds = 0;

    while (data.stop_reason === 'tool_use' && rounds < MAX_TOOL_ROUNDS) {
      rounds += 1;
      const toolUses = data.content.filter((b) => b.type === 'tool_use');
      const toolResults = [];
      for (const tu of toolUses) {
        console.log('receptionist-chat: herramienta', tu.name, JSON.stringify(tu.input || {}), '(pedida por', quien || '?', ')');
        const impl = TOOL_IMPLS[tu.name];
        let resultPayload;
        try {
          resultPayload = impl ? await impl(tu.input || {}) : { error: 'Herramienta desconocida: ' + tu.name };
        } catch (toolErr) {
          console.error('receptionist-chat: fallo en herramienta', tu.name, toolErr);
          resultPayload = { error: 'Fallo interno consultando ' + tu.name };
        }
        toolResults.push({ type: 'tool_result', tool_use_id: tu.id, content: JSON.stringify(resultPayload) });
      }
      running = running.concat([
        { role: 'assistant', content: data.content },
        { role: 'user', content: toolResults },
      ]);
      data = await llamarClaude(apiKey, typeof system === 'string' ? system : undefined, running);
    }

    const reply = data.content?.find((block) => block.type === 'text')?.text?.trim() || '(Sin respuesta)';
    return { statusCode: 200, headers: CORS_HEADERS, body: JSON.stringify({ reply }) };
  } catch (err) {
    console.error('Fallo llamando a Claude desde receptionist-chat:', err);
    return { statusCode: err.status || 502, headers: CORS_HEADERS, body: JSON.stringify({ error: err.message || 'No se pudo contactar con Claude' }) };
  }
};
