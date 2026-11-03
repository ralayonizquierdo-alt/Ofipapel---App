// Edge Function «nexa-correo» (03/11/2026): el botón «Enviar» de las tarjetas de correo de NEXA. Separada de «nexa» para
// poder actualizar el envío sin volver a desplegar el asistente entero. Envía con los permisos del usuario (su JWT) por
// Microsoft 365 desde el buzón general de Archivo → Datos de Empresa (ver correo.ts y graph.ts, copias de las de nexa/).
// Petición (POST JSON): { correo: id }. Respuesta: { ok: true, estado } | { ok: false, codigo, error }.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0'
import { enviarCorreo } from './correo.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ ok: false, codigo: 'metodo', error: 'Usa POST.' })
  let cuerpo: { correo?: number }
  try {
    cuerpo = await req.json()
  } catch {
    return json({ ok: false, codigo: 'peticion', error: 'Petición no válida.' })
  }
  const authorization = req.headers.get('Authorization') ?? ''
  const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_ANON_KEY') || Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || '', {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const jwt = authorization.replace(/^Bearer\s+/i, '')
  const { data: u } = jwt ? await sb.auth.getUser(jwt) : { data: null }
  if (!u?.user) return json({ ok: false, codigo: 'sin_sesion', error: 'Inicia sesión en el ERP.' }, 401)
  const id = Number(cuerpo.correo)
  if (!Number.isInteger(id) || id <= 0) return json({ ok: false, codigo: 'peticion', error: 'Falta el correo.' })
  const r = await enviarCorreo(sb, id, { uid: u.user.id, email: u.user.email ?? u.user.id })
  return json(r.ok ? { ok: true, estado: r.estado } : { ok: false, codigo: 'correo', error: r.error })
})
