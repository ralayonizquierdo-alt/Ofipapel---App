// TEMPORAL · Gestor de Roturas, fase 6. Se BORRA al terminar la migración (ver docs/ROTURAS.md).
//
// Copia UN adjunto (foto, PDF…) de la app antigua (Firebase Storage) al almacenamiento privado del
// ERP y lo apunta en rotura_documento. Lo llama la pantalla de importar, una vez por adjunto.
// - Solo administradores del ERP (fn_es_administrador con la sesión de la persona).
// - Lee de Firebase con la sesión de la persona en la app antigua (id_token, dura una hora); aquí no
//   hay ninguna clave de Firebase guardada.
// - Solo lee de los almacenes de la app antigua y de la carpeta «expedientes/».
// - Se puede repetir: si el adjunto ya está traído (origen_ruta), no hace nada.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const ALMACENES = ['devoluciones-y-roturas.appspot.com', 'devoluciones-y-roturas.firebasestorage.app']
const TIPOS = ['FOTO', 'PDF', 'EMAIL', 'FACTURA', 'ALBARAN', 'EXCEL', 'ABONO', 'OTRO']
const MAX = 15_000_000

const json = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const fallo = (error: string, status = 200) => json({ ok: false, error }, status)

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fallo('Método no permitido.', 405)

  const authorization = req.headers.get('Authorization') ?? ''
  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const sb = createClient(url, Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '', {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const jwt = authorization.replace(/^Bearer\s+/i, '')
  const { data: usuario } = jwt ? await sb.auth.getUser(jwt) : { data: null }
  if (!usuario?.user) return fallo('Inicia sesión en el ERP.', 401)
  const { data: admin } = await sb.rpc('fn_es_administrador')
  if (admin !== true) return fallo('Solo un administrador puede importar.', 403)

  let c: { expediente_id?: number; almacen?: string; ruta?: string; nombre?: string; tipo?: string; id_token?: string }
  try {
    c = await req.json()
  } catch {
    return fallo('Petición no válida.', 400)
  }
  const expediente = Number(c.expediente_id)
  const ruta = String(c.ruta ?? '')
  const almacen = String(c.almacen ?? '')
  const tipo = TIPOS.includes(String(c.tipo)) ? String(c.tipo) : 'OTRO'
  if (!Number.isInteger(expediente) || expediente <= 0) return fallo('Falta el expediente.', 400)
  if (!ALMACENES.includes(almacen)) return fallo('Almacén de origen no permitido.', 400)
  if (!ruta.startsWith('expedientes/') || ruta.includes('..')) return fallo('Ruta de origen no permitida.', 400)
  if (!c.id_token) return fallo('Falta la sesión de la app antigua.', 400)

  const servicio = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', { auth: { persistSession: false, autoRefreshToken: false } })
  const { data: ya } = await servicio.from('rotura_documento').select('id').eq('origen_ruta', ruta).maybeSingle()
  if (ya) return json({ ok: true, nuevo: false })
  const { data: exp } = await servicio.from('rotura_expediente').select('id').eq('id', expediente).not('origen_id', 'is', null).maybeSingle()
  if (!exp) return fallo('El expediente no es uno importado.', 400)

  const r = await fetch(`https://firebasestorage.googleapis.com/v0/b/${almacen}/o/${encodeURIComponent(ruta)}?alt=media`, { headers: { Authorization: `Firebase ${c.id_token}` } })
  if (!r.ok) return fallo(`La app antigua no deja leer el archivo (${r.status}).`)
  const datos = new Uint8Array(await r.arrayBuffer())
  if (datos.length > MAX) return fallo('El archivo pesa más de 15 MB.')

  const nombre = (String(c.nombre ?? '').trim() || ruta.split('/').pop() || 'archivo').slice(0, 120)
  const limpio = nombre.normalize('NFD').replace(/[^\w.\- ]+/g, '').replace(/\s+/g, '_') || 'archivo'
  const destino = `${expediente}/${crypto.randomUUID()}-${limpio}`
  const { error: errSubida } = await servicio.storage.from('roturas').upload(destino, datos, { contentType: r.headers.get('content-type') ?? 'application/octet-stream', upsert: false })
  if (errSubida) return fallo(`No se ha podido guardar: ${errSubida.message}`)
  const { error: errFila } = await servicio.from('rotura_documento').insert({ expediente_id: expediente, tipo, nombre, ruta: destino, origen_ruta: ruta, creado_por: 'importación' })
  if (errFila) {
    await servicio.storage.from('roturas').remove([destino])
    return fallo(errFila.message)
  }
  return json({ ok: true, nuevo: true, bytes: datos.length })
})
