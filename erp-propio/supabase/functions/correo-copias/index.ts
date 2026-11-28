// Edge Function «correo-copias» (Rober, 28/11/2026): lo que E-milio ha cogido del correo y hay que dejar en las carpetas de
// la oficina (hoy, las tarifas: la carpeta de tarifas de Rober y la de red). La nube no llega a esas carpetas, así que las
// copia el programa del PC scripts/correo/copiar_correo.py, que llama aquí:
//
//   POST { pendientes: true }                 → [{ id, tipo, nombre, url }] (url firmada, 15 min) de los tipos de
//                                               parámetro correo.copiar_tipos que aún no se han copiado
//   POST { copiado: id, rutas: ['C:\…', …] }  → apunta copiado_en / copia_ruta
//
// Seguridad: verify_jwt = false (llama un programa); exige la cabecera «x-copias-clave», de la que en la base de datos solo
// está la huella (reparto_privado.puente_copias, fn_correo_copias_clave_ok). Solo da ficheros de E-milio y solo apunta copias.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const responder = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return responder(405, { ok: false, error: 'Método no permitido.' })
  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const clave = req.headers.get('x-copias-clave') ?? ''
  const { data: vale, error: eClave } = clave.length >= 32 && clave.length <= 200 ? await sb.rpc('fn_correo_copias_clave_ok', { p_clave: clave }) : { data: false, error: null }
  if (eClave) return responder(503, { ok: false, error: 'El servidor está ocupado; se reintenta en la siguiente pasada.' })
  if (vale !== true) return responder(401, { ok: false, error: 'Clave incorrecta.' })

  let cuerpo: { pendientes?: boolean; copiado?: number; rutas?: unknown } = {}
  try {
    cuerpo = await req.json()
  } catch {
    return responder(400, { ok: false, error: 'El contenido no es JSON.' })
  }

  if (cuerpo.pendientes === true) {
    const { data: par } = await sb.from('parametro').select('valor').eq('clave', 'correo.copiar_tipos').maybeSingle()
    const tipos = Array.isArray(par?.valor) ? (par!.valor as string[]) : ['tarifa']
    const { data, error } = await sb
      .from('correo_proveedor_documento')
      .select('id, tipo, nombre_ordenado, archivo')
      .in('tipo', tipos)
      .is('copiado_en', null)
      .neq('estado', 'descartado')
      .not('archivo', 'is', null)
      .not('nombre_ordenado', 'is', null)
      .order('id')
      .limit(50)
    if (error) return responder(500, { ok: false, error: error.message })
    const lista = []
    for (const d of data ?? []) {
      const { data: f } = await sb.storage.from('correo_proveedores').createSignedUrl(d.archivo as string, 900)
      if (f?.signedUrl) lista.push({ id: d.id, tipo: d.tipo, nombre: d.nombre_ordenado, url: f.signedUrl })
    }
    return responder(200, { ok: true, tipos, documentos: lista })
  }

  if (typeof cuerpo.copiado === 'number') {
    const rutas = Array.isArray(cuerpo.rutas) ? cuerpo.rutas.map(String).map((r) => r.slice(0, 300)).slice(0, 5) : []
    const { error } = await sb
      .from('correo_proveedor_documento')
      .update({ copiado_en: new Date().toISOString(), copia_ruta: rutas.join(' | ') || null })
      .eq('id', cuerpo.copiado)
    if (error) return responder(500, { ok: false, error: error.message })
    return responder(200, { ok: true })
  }
  return responder(400, { ok: false, error: 'No entiendo la petición.' })
})
