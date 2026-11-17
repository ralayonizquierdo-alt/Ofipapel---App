// Edge Function «espejo-gw-ingesta» — espejo de GeminisWin (docs/PLAN_ESPEJO_GEMINISWIN.md, 17/11/2026).
//
// La llama scripts/geminiswin/espejo_geminiswin.py desde un PC de la oficina, cada pocos minutos, con lo
// que ha cambiado en los ficheros de GeminisWin (que solo lee).
//
//   POST { ping: true }                              → comprueba la clave y dice qué tablas admite
//   POST { tabla: 'ARTICULO', filas: [{c, d}, …] }   → guarda las filas que han cambiado (carga_dbf)
//   POST { procesar: 'ARTICULO' }                    → las pasa a las tablas del ERP (fn_carga_gw_*)
//                                                      por tandas; si responde «quedan: true», se vuelve a llamar
//
// Seguridad: como «reparto-gw-ingesta». Se despliega con verify_jwt = false porque quien llama es un
// programa, no un empleado; exige la cabecera «x-puente-clave», de la que en la base de datos solo está la
// huella (fn_reparto_gw_clave_ok). Es la misma clave del puente de reparto: vive solo en ese PC.
// Solo escribe las tablas de la lista de fn_espejo_gw_tablas. No devuelve datos: contadores.

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
  if (texto.length > 4_000_000) return responder(413, { ok: false, error: 'Demasiados datos en un solo envío.' })
  let cuerpo: Record<string, unknown>
  try {
    cuerpo = JSON.parse(texto)
  } catch {
    return responder(400, { ok: false, error: 'El contenido no es JSON.' })
  }
  const equipo = typeof cuerpo.equipo === 'string' ? cuerpo.equipo.slice(0, 60) : null

  if (cuerpo.ping === true) {
    const { data, error } = await admin.rpc('fn_espejo_gw_tablas')
    if (error) return responder(500, { ok: false, error: error.message })
    return responder(200, { ok: true, ping: true, tablas: (data as { tabla: string }[]).map((t) => t.tabla) })
  }
  if (typeof cuerpo.procesar === 'string') {
    // El ERP carga por tandas de unas 5.000 filas. Aquí se encadenan mientras quepan en medio minuto (la
    // conexión se corta a los 60 s); si queda más, se devuelve «quedan» y el programa vuelve a llamar.
    const inicio = Date.now()
    let filas = 0
    let ultimo: Record<string, unknown> = {}
    for (;;) {
      const { data, error } = await admin.rpc('fn_espejo_gw_procesar', { p_tabla: cuerpo.procesar, p_equipo: equipo })
      if (error) return responder(500, { ok: false, error: error.message })
      ultimo = (data ?? {}) as Record<string, unknown>
      if (ultimo.ok !== true) break
      filas += Number(ultimo.filas ?? 0)
      if (ultimo.quedan !== true || Date.now() - inicio > 25_000) break
    }
    return responder(200, { ...ultimo, filas })
  }
  if (typeof cuerpo.tabla === 'string' && Array.isArray(cuerpo.filas)) {
    const { data, error } = await admin.rpc('fn_espejo_gw_recibir', { p_tabla: cuerpo.tabla, p_filas: cuerpo.filas, p_equipo: equipo })
    if (error) return responder(500, { ok: false, error: error.message })
    return responder(200, data as Record<string, unknown>)
  }
  return responder(400, { ok: false, error: 'No entiendo la petición.' })
})
