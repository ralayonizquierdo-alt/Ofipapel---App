// Edge Function «reparto-gw-ingesta» — puente de reparto con GeminisWin (tarea 35, 13/11/2026). TEMPORAL.
//
// La llama el programa scripts/geminiswin/puente_reparto.py desde un PC de la oficina, cada 5 minutos,
// con lo que ha leído (solo lectura) de los ficheros de GeminisWin.
//
//   POST { completo: true, repartos: [ … ] }   → repartos abiertos de GeminisWin (fn_reparto_gw_entrada)
//   POST { ping: true }                         → comprueba la clave; dice qué rutas traer, si hay que mandar
//                                                 ventas y qué ventas volver a leer (fn_reparto_gw_vigilar)
//   POST { partes: true }                       → el «parte» de cada reparto abierto (lo marcado en la app)
//   POST { ventas: [ … ] }                      → ventas nuevas y vigiladas (fn_reparto_gw_ventas, 18/11/2026)
//
// Seguridad:
//  · Se despliega con verify_jwt = false: quien llama no es un empleado, es un programa. Por eso exige
//    la cabecera «x-puente-clave». En la base de datos solo está su huella (sha-256), en un esquema
//    privado (fn_reparto_gw_clave_ok); la clave en claro vive solo en el PC del puente. Sin ella, 401.
//  · Solo escribe repartos de origen «geminiswin» de las rutas del parámetro reparto.puente_gw_rutas y la
//    copia de las ventas de GeminisWin (reparto_gw_venta). No devuelve nombres ni direcciones: contadores,
//    números de venta y estados.
//  · Tope de tamaño para que nadie la use de sumidero.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const responder = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method !== 'POST') return responder(405, { ok: false, error: 'Método no permitido.' })
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const recibida = req.headers.get('x-puente-clave') ?? ''
  const { data: vale } = recibida.length >= 32 && recibida.length <= 200 ? await admin.rpc('fn_reparto_gw_clave_ok', { p_clave: recibida }) : { data: false }
  if (vale !== true) return responder(401, { ok: false, error: 'Clave del puente incorrecta.' })

  const texto = await req.text()
  if (texto.length > 2_000_000) return responder(413, { ok: false, error: 'Demasiados datos en una sola pasada.' })
  let cuerpo: Record<string, unknown>
  try {
    cuerpo = JSON.parse(texto)
  } catch {
    return responder(400, { ok: false, error: 'El contenido no es JSON.' })
  }
  if (cuerpo.ping === true) {
    const { data: pars } = await admin.from('parametro').select('clave, valor').in('clave', ['reparto.puente_gw_rutas', 'reparto.puente_gw_ventas'])
    const par = (k: string) => pars?.find((p) => p.clave === k)?.valor
    const rutas = Array.isArray(par('reparto.puente_gw_rutas')) ? par('reparto.puente_gw_rutas') : []
    const ventas = par('reparto.puente_gw_ventas') === true
    let vigilar: unknown = []
    if (ventas) {
      const { data, error } = await admin.rpc('fn_reparto_gw_vigilar')
      if (error) return responder(500, { ok: false, error: error.message })
      vigilar = data ?? []
    }
    return responder(200, { ok: true, ping: true, rutas, ventas, vigilar })
  }
  if (cuerpo.partes === true) {
    const { data: partes, error: e2 } = await admin.rpc('fn_reparto_gw_partes')
    if (e2) return responder(500, { ok: false, error: e2.message })
    return responder(200, { ok: true, partes })
  }
  if (Array.isArray(cuerpo.ventas)) {
    const { data, error } = await admin.rpc('fn_reparto_gw_ventas', { p: { ventas: cuerpo.ventas } })
    if (error) {
      console.error('fn_reparto_gw_ventas', error.message)
      return responder(500, { ok: false, error: error.message })
    }
    return responder(200, data as Record<string, unknown>)
  }
  if (!Array.isArray(cuerpo.repartos)) return responder(400, { ok: false, error: 'Falta la lista de repartos.' })

  const { data, error } = await admin.rpc('fn_reparto_gw_entrada', { p: cuerpo })
  if (error) {
    console.error('fn_reparto_gw_entrada', error.message)
    return responder(500, { ok: false, error: error.message })
  }
  return responder(200, data as Record<string, unknown>)
})
