// Edge Function «guanxe-catalogo»: catálogo de ofipapel.net en CSV para Guanxe (tarea 21; Luis, 04/11/2026).
//
// Guanxe descarga el fichero de una dirección fija (1 vez al día altas, 3 veces al día stock y precios):
//   GET  /functions/v1/guanxe-catalogo/products.csv?clave=…   → el último CSV generado (almacén privado «guanxe»)
//   POST /functions/v1/guanxe-catalogo/generar  (cabecera x-clave) → lo vuelve a generar (pg_cron, 4 veces al día)
//
// Solo se envían las familias elegidas (ajustes.incluir_categorias: ids de categoría de la web, con sus subcategorías).
// La clave está en la tabla integracion_externa (nombre 'guanxe'), nunca en el repositorio ni en el navegador.
// La tienda se lee en SOLO LECTURA (GET), con las mismas claves que «woocommerce-erp» (secretos de Supabase:
// WOOCOMMERCE_CONSUMER_KEY / _SECRET, WOOCOMMERCE_BYPASS_TOKEN opcional, WOOCOMMERCE_URL opcional).
// Se despliega con verify_jwt = false: Guanxe no tiene sesión del ERP; la protección es la clave.
//
// Columnas (las que pide Guanxe y las opcionales): referencia, nombre, descripcion_corta, descripcion_larga, cantidad,
// precio, categorias («Ofipapel > INFORMATICA > ACCESORIOS INFORMATICA > Cables Informática»), imagen,
// imagenes_adicionales (separadas por «|»), peso_kg, largo_cm, ancho_cm, alto_cm, ean13, marca, url, id_web.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const USER_AGENT = 'OfipapelERP/1.0 (+https://ofipapel.net; catalogo Guanxe, solo lectura)'
const BUCKET = 'guanxe'
const FICHERO = 'products.csv'
const CAMPOS =
  'id,name,sku,type,status,permalink,short_description,description,price,regular_price,sale_price,manage_stock,' +
  'stock_quantity,stock_status,categories,images,weight,dimensions,global_unique_id,attributes,brands'

type Cat = { id: number; name: string; parent: number }
// deno-lint-ignore no-explicit-any
type Prod = Record<string, any>

const db = () => createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)

function woo() {
  const key = Deno.env.get('WOOCOMMERCE_CONSUMER_KEY') ?? ''
  const secret = Deno.env.get('WOOCOMMERCE_CONSUMER_SECRET') ?? ''
  const bypass = Deno.env.get('WOOCOMMERCE_BYPASS_TOKEN') ?? ''
  const url = (Deno.env.get('WOOCOMMERCE_URL') || 'https://ofipapel.net').replace(/\/+$/, '')
  if (!key || !secret) throw new Error('Faltan las claves de WooCommerce en los secretos de Supabase.')
  const headers: Record<string, string> = { Authorization: `Basic ${btoa(`${key}:${secret}`)}`, 'User-Agent': USER_AGENT, Accept: 'application/json' }
  if (bypass) headers['X-Ofipapel-Bot'] = bypass
  return async (recurso: string, params: Record<string, string>) => {
    const qs = new URLSearchParams(params)
    for (let intento = 1; ; intento++) {
      try {
        const r = await fetch(`${url}/wp-json/wc/v3/${recurso}?${qs}`, { headers, signal: AbortSignal.timeout(60000) })
        if (!r.ok) throw new Error(`La web respondió ${r.status} en ${recurso}`)
        return { datos: (await r.json()) as unknown[], paginas: Number(r.headers.get('x-wp-totalpages') ?? 1) }
      } catch (e) {
        if (intento >= 3) throw e
        await new Promise((ok) => setTimeout(ok, 2000 * intento))
      }
    }
  }
}

async function todas(get: ReturnType<typeof woo>, recurso: string, params: Record<string, string>) {
  const p1 = await get(recurso, { ...params, per_page: '100', page: '1' })
  const lista = [...p1.datos]
  const resto = Array.from({ length: Math.max(0, p1.paginas - 1) }, (_, i) => i + 2)
  for (let i = 0; i < resto.length; i += 4) {
    const lote = await Promise.all(resto.slice(i, i + 4).map((page) => get(recurso, { ...params, per_page: '100', page: String(page) })))
    for (const l of lote) lista.push(...l.datos)
  }
  return lista
}

const sinEspacios = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim()
const entidades = (s: string) =>
  s.replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;|&#8217;/g, '’').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
const csv = (v: unknown) => {
  const s = String(v ?? '')
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

function ruta(cats: Map<number, Cat>, id: number) {
  const partes: string[] = []
  for (let c = cats.get(id), n = 0; c && n < 10; c = cats.get(c.parent), n++) partes.unshift(entidades(c.name))
  return ['Ofipapel', ...partes].join(' > ')
}

function ean(p: Prod) {
  const g = sinEspacios(p.global_unique_id)
  if (/^\d{8,14}$/.test(g)) return g
  const a = (p.attributes ?? []).find((x: Prod) => /ean|gtin|c[oó]digo de barras/i.test(x.name ?? ''))
  const v = sinEspacios(a?.options?.[0])
  return /^\d{8,14}$/.test(v) ? v : ''
}

async function generar() {
  const sb = db()
  const { data: conf } = await sb.from('integracion_externa').select('ajustes').eq('nombre', 'guanxe').single()
  const aj = (conf?.ajustes ?? {}) as { recargo_pct?: number; incluir_categorias?: number[]; excluir_categorias?: number[]; stock_sin_control?: number }
  const recargo = 1 + Number(aj.recargo_pct ?? 0) / 100
  const excluir = new Set((aj.excluir_categorias ?? []).map(Number))
  // Solo las familias elegidas (y sus subfamilias). Sin familias elegidas no se envía nada: Guanxe publica una
  // selección, no todo el catálogo.
  const incluir = new Set((aj.incluir_categorias ?? []).map(Number))
  const sinControl = Math.max(0, Math.floor(Number(aj.stock_sin_control ?? 0)))

  const get = woo()
  const cats = new Map<number, Cat>()
  for (const c of (await todas(get, 'products/categories', {})) as Cat[]) cats.set(c.id, c)
  const dentro = (id: number) => {
    for (let c = cats.get(id), n = 0; c && n < 10; c = cats.get(c.parent), n++) if (incluir.has(c.id)) return true
    return false
  }
  if (!incluir.size) throw new Error('No hay familias elegidas para Guanxe (ajustes → incluir_categorias).')
  const productos = (await todas(get, 'products', { status: 'publish', _fields: CAMPOS })) as Prod[]

  const cab = ['referencia', 'nombre', 'descripcion_corta', 'descripcion_larga', 'cantidad', 'precio', 'categorias', 'imagen',
    'imagenes_adicionales', 'peso_kg', 'largo_cm', 'ancho_cm', 'alto_cm', 'ean13', 'marca', 'url', 'id_web']
  const lineas = [cab.join(',')]
  let fuera = 0
  for (const p of productos) {
    const idsCat: number[] = (p.categories ?? []).map((c: Prod) => Number(c.id))
    const precioWeb = Number(p.price || p.regular_price || 0)
    if (!p.sku || !(precioWeb > 0) || !idsCat.some(dentro) || idsCat.some((id) => excluir.has(id))) {
      fuera++
      continue
    }
    // La categoría más profunda da la ruta completa (Ofipapel > A > B > C).
    const prof = (id: number) => ruta(cats, id).split(' > ').length
    const principal = [...idsCat].sort((a, b) => prof(b) - prof(a))[0]
    const cantidad = p.stock_status !== 'instock' ? 0 : p.manage_stock ? Math.max(0, Number(p.stock_quantity ?? 0)) : sinControl
    const imgs: string[] = (p.images ?? []).map((i: Prod) => String(i.src ?? '')).filter(Boolean)
    const d = p.dimensions ?? {}
    lineas.push(
      [
        sinEspacios(p.sku),
        entidades(sinEspacios(p.name)),
        sinEspacios(p.short_description),
        sinEspacios(p.description),
        cantidad,
        (Math.round(precioWeb * recargo * 100) / 100).toFixed(2),
        principal ? ruta(cats, principal) : 'Ofipapel',
        imgs[0] ?? '',
        imgs.slice(1).join('|'),
        sinEspacios(p.weight),
        sinEspacios(d.length),
        sinEspacios(d.width),
        sinEspacios(d.height),
        ean(p),
        entidades(sinEspacios((p.brands ?? [])[0]?.name)),
        sinEspacios(p.permalink),
        p.id,
      ].map(csv).join(','),
    )
  }
  const contenido = '﻿' + lineas.join('\r\n') + '\r\n'
  const { error } = await sb.storage.from(BUCKET).upload(FICHERO, new Blob([contenido], { type: 'text/csv' }), { upsert: true, contentType: 'text/csv; charset=utf-8' })
  if (error) throw new Error(`No se pudo guardar el CSV: ${error.message}`)
  const resumen = `${lineas.length - 1} productos en el CSV; ${fuera} fuera (sin referencia, sin precio o de otra familia); ${productos.length} leídos de la web.`
  await sb.from('integracion_externa').update({ ultima_generacion: new Date().toISOString(), ultimo_resultado: resumen }).eq('nombre', 'guanxe')
  return resumen
}

async function claveValida(clave: string | null) {
  if (!clave) return false
  const { data } = await db().from('integracion_externa').select('clave, activa').eq('nombre', 'guanxe').single()
  return Boolean(data?.activa && data.clave && data.clave === clave)
}

const texto = (s: string, status = 200) => new Response(s, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const fin = url.pathname.split('/').pop() ?? ''

  if (fin === 'generar') {
    if (!(await claveValida(req.headers.get('x-clave')))) return texto('Clave no válida.', 401)
    try {
      return texto(await generar())
    } catch (e) {
      const msg = `Error al generar: ${e instanceof Error ? e.message : String(e)}`
      await db().from('integracion_externa').update({ ultimo_resultado: msg }).eq('nombre', 'guanxe')
      return texto(msg, 500)
    }
  }

  if (req.method !== 'GET') return texto('Usa GET.', 405)
  if (!(await claveValida(url.searchParams.get('clave')))) {
    return texto('Clave no válida. Cómo hacerlo bien: usa la dirección completa con ?clave=… que os ha dado Ofipapel.', 401)
  }
  const sb = db()
  const { data, error } = await sb.storage.from(BUCKET).download(FICHERO)
  if (error || !data) return texto('El catálogo todavía no está generado. Prueba dentro de un rato.', 503)
  const { data: c } = await sb.from('integracion_externa').select('descargas').eq('nombre', 'guanxe').single()
  await sb.from('integracion_externa').update({ ultima_descarga: new Date().toISOString(), descargas: (c?.descargas ?? 0) + 1 }).eq('nombre', 'guanxe')
  return new Response(data, {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `inline; filename="${FICHERO}"`, 'Cache-Control': 'no-store' },
  })
})
