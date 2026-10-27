// Edge Function «woocommerce-erp»: puente de SOLO LECTURA entre el ERP y la tienda
// WooCommerce de ofipapel.net (menú «Web» del ERP).
//
// REGLA ABSOLUTA: la web la gestiona una empresa externa y Rober NO ha autorizado
// escribir nada en ella. Esta función solo hace peticiones GET, a una lista blanca de
// recursos. No hay ningún camino de código que mande POST/PUT/PATCH/DELETE a WooCommerce.
//
// Se despliega con verify_jwt = true: solo la pueden llamar usuarios con sesión del ERP.
// Las claves viven en los secretos de la función (Supabase → Edge Functions → Secrets),
// nunca en el navegador:
//   WOOCOMMERCE_CONSUMER_KEY, WOOCOMMERCE_CONSUMER_SECRET  (obligatorias, permiso «Lectura»)
//   WOOCOMMERCE_BYPASS_TOKEN  (opcional: cabecera X-Ofipapel-Bot para el anti-bots del hosting)
//   WOOCOMMERCE_URL           (opcional, por defecto https://ofipapel.net)
// Mismo patrón que netlify/functions/woocommerce-client.js (bot de WhatsApp).
//
// Petición (POST JSON desde el ERP, la función a su vez solo hace GET):
//   { op: 'estado' }                                  → URL y si hay claves (sin enseñarlas)
//   { op: 'probar' }                                  → GET products?per_page=1
//   { op: 'get', recurso, params }                    → una página
//   { op: 'todos', recurso, params, maxPaginas }      → todas las páginas (tope 30 × 100)
// Respuesta: siempre HTTP 200 con { ok: true, data, total, totalPaginas } o
// { ok: false, codigo, error } para que el navegador pueda mostrar el motivo.

const USER_AGENT = 'OfipapelERP/1.0 (+https://ofipapel.net; ERP interno, solo lectura)'
const TIMEOUT_MS = 25000

// Recursos permitidos (todos de solo lectura).
const RECURSOS: RegExp[] = [
  /^products$/,
  /^products\/\d+$/,
  /^products\/categories$/,
  /^products\/reviews$/,
  /^products\/\d+\/variations$/,
  /^orders$/,
  /^orders\/\d+$/,
  /^orders\/\d+\/refunds$/,
  /^customers$/,
  /^customers\/\d+$/,
  /^coupons$/,
  /^reports$/,
  /^reports\/sales$/,
  /^reports\/top_sellers$/,
  /^reports\/(orders|products|customers|coupons|reviews)\/totals$/,
]

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function json(body: unknown) {
  return new Response(JSON.stringify(body), { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function config() {
  const key = Deno.env.get('WOOCOMMERCE_CONSUMER_KEY') ?? ''
  const secret = Deno.env.get('WOOCOMMERCE_CONSUMER_SECRET') ?? ''
  const bypass = Deno.env.get('WOOCOMMERCE_BYPASS_TOKEN') ?? ''
  const url = (Deno.env.get('WOOCOMMERCE_URL') || 'https://ofipapel.net').replace(/\/+$/, '')
  return { key, secret, bypass, url, hayClaves: Boolean(key && secret) }
}

function limpiarParams(params: unknown): URLSearchParams {
  const qs = new URLSearchParams()
  if (!params || typeof params !== 'object') return qs
  for (const [k, v] of Object.entries(params as Record<string, unknown>)) {
    if (!/^[a-z_]{1,40}$/.test(k) || v == null || v === '') continue
    if (typeof v !== 'string' && typeof v !== 'number' && typeof v !== 'boolean') continue
    const s = String(v).slice(0, 300)
    qs.set(k, s)
  }
  const pp = Number(qs.get('per_page') ?? 0)
  if (pp > 100) qs.set('per_page', '100')
  return qs
}

class WcError extends Error {
  codigo: string
  constructor(codigo: string, msg: string) {
    super(msg)
    this.codigo = codigo
  }
}

// ÚNICA función que habla con WooCommerce. method: 'GET' fijo.
async function wcGet(recurso: string, qs: URLSearchParams) {
  const c = config()
  if (!RECURSOS.some((r) => r.test(recurso))) throw new WcError('recurso_no_permitido', `Recurso no permitido: ${recurso}`)
  if (!c.hayClaves) throw new WcError('sin_claves', 'Faltan las claves de WooCommerce en Supabase')
  const headers: Record<string, string> = {
    Authorization: `Basic ${btoa(`${c.key}:${c.secret}`)}`,
    'User-Agent': USER_AGENT,
    Accept: 'application/json',
  }
  if (c.bypass) headers['X-Ofipapel-Bot'] = c.bypass
  const url = `${c.url}/wp-json/wc/v3/${recurso}${qs.toString() ? `?${qs}` : ''}`
  let resp: Response
  try {
    resp = await fetch(url, { method: 'GET', headers, signal: AbortSignal.timeout(TIMEOUT_MS) })
  } catch (e) {
    const err = e as Error
    throw new WcError('red', err.name === 'TimeoutError' ? `La web no ha contestado en ${TIMEOUT_MS / 1000} s` : `No se pudo conectar con ${c.url}: ${err.message}`)
  }
  const tipo = resp.headers.get('content-type') ?? ''
  if (!tipo.includes('json')) {
    throw new WcError(
      'antibots',
      `La web devolvió «${tipo || 'sin tipo'}» en vez de JSON (HTTP ${resp.status}): la protección anti-bots de ofipapel.net ha bloqueado la petición. ` +
        'Ver WHATSAPP_SETUP.md, «Cuando ofipapel.net nos bloquea» (WOOCOMMERCE_BYPASS_TOKEN).',
    )
  }
  const cuerpo = await resp.json().catch(() => null)
  if (!resp.ok) {
    const msg = (cuerpo && typeof cuerpo === 'object' && 'message' in cuerpo ? String((cuerpo as { message: unknown }).message) : '') || resp.statusText
    const codigo = resp.status === 401 || resp.status === 403 ? 'auth' : resp.status === 404 ? 'no_existe' : 'http'
    throw new WcError(codigo, `WooCommerce respondió ${resp.status}: ${msg}`)
  }
  return {
    data: cuerpo,
    total: Number(resp.headers.get('x-wp-total') ?? NaN),
    totalPaginas: Number(resp.headers.get('x-wp-totalpages') ?? NaN),
  }
}

// Registro de la llamada en web_sincronizacion_log, como el usuario que llama (RLS).
async function registrar(req: Request, fila: Record<string, unknown>) {
  const url = Deno.env.get('SUPABASE_URL')
  const anon = Deno.env.get('SUPABASE_ANON_KEY')
  const auth = req.headers.get('authorization')
  if (!url || !anon || !auth) return
  try {
    await fetch(`${url}/rest/v1/web_sincronizacion_log`, {
      method: 'POST',
      headers: { apikey: anon, Authorization: auth, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify({ origen: 'edge', ...fila }),
      signal: AbortSignal.timeout(5000),
    })
  } catch {
    // El registro nunca debe tumbar la consulta.
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, codigo: 'metodo', error: 'Usa POST con un cuerpo JSON' })

  let body: { op?: string; recurso?: string; params?: unknown; maxPaginas?: number }
  try {
    body = await req.json()
  } catch {
    return json({ ok: false, codigo: 'peticion', error: 'Cuerpo JSON no válido' })
  }
  const c = config()
  const op = body.op ?? 'get'

  if (op === 'estado') {
    return json({ ok: true, data: { url: c.url, hayClaves: c.hayClaves, hayBypass: Boolean(c.bypass), soloLectura: true } })
  }

  const inicio = Date.now()
  const recurso = op === 'probar' ? 'products' : String(body.recurso ?? '')
  const qs = op === 'probar' ? new URLSearchParams({ per_page: '1' }) : limpiarParams(body.params)
  try {
    if (op === 'probar' || op === 'get') {
      const r = await wcGet(recurso, qs)
      const n = Array.isArray(r.data) ? r.data.length : 1
      await registrar(req, { operacion: op === 'probar' ? 'probar' : 'GET', recurso, parametros: Object.fromEntries(qs), resultado: 'ok', registros: n, duracion_ms: Date.now() - inicio })
      return json({ ok: true, ...r })
    }
    if (op === 'todos') {
      const max = Math.min(Math.max(Number(body.maxPaginas) || 10, 1), 30)
      qs.set('per_page', '100')
      const todos: unknown[] = []
      let total = NaN
      let totalPaginas = NaN
      for (let p = 1; p <= max; p++) {
        qs.set('page', String(p))
        const r = await wcGet(recurso, qs)
        total = r.total
        totalPaginas = r.totalPaginas
        if (!Array.isArray(r.data)) break
        todos.push(...r.data)
        if (r.data.length < 100 || (Number.isFinite(totalPaginas) && p >= totalPaginas)) break
      }
      qs.delete('page')
      const truncado = Number.isFinite(total) && todos.length < total
      await registrar(req, {
        operacion: 'GET',
        recurso,
        parametros: { ...Object.fromEntries(qs), todas_las_paginas: true },
        resultado: truncado ? 'aviso' : 'ok',
        mensaje: truncado ? `Solo se han traído ${todos.length} de ${total}` : null,
        registros: todos.length,
        duracion_ms: Date.now() - inicio,
      })
      return json({ ok: true, data: todos, total, totalPaginas, truncado })
    }
    return json({ ok: false, codigo: 'op', error: `Operación no permitida: ${op} (esta función es de solo lectura)` })
  } catch (e) {
    const err = e as WcError
    const codigo = err.codigo ?? 'interno'
    if (codigo !== 'sin_claves') {
      await registrar(req, { operacion: op === 'probar' ? 'probar' : 'GET', recurso, parametros: Object.fromEntries(qs), resultado: 'error', mensaje: err.message, duracion_ms: Date.now() - inicio })
    }
    return json({ ok: false, codigo, error: err.message })
  }
})
