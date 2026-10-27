// Edge Function «empleados-acceso»: usuario de acceso y clave de un empleado (Archivo →
// Empleados → Seguridad). En GeminisWin cada empleado tiene grupo y clave; en el ERP se entra
// con un usuario de Supabase Auth (usuario@ofipapel.local) vinculado a empleado.auth_user_id.
//
// Seguridad:
//  - Se despliega con verify_jwt = true: sin sesión del ERP no llega aquí.
//  - Además se valida el token con auth.getUser y se comprueba EN LA BASE DE DATOS que el
//    empleado que llama está activo y su grupo (rol) tiene es_administrador = true.
//    Si no, 403 y no se hace nada.
//  - Solo entonces se usa la service role (SUPABASE_SERVICE_ROLE_KEY, la inyecta Supabase).
//  - Las contraseñas nunca se devuelven ni se escriben en el registro.
//
// Petición (POST JSON):
//   { accion: 'crear_usuario', empleado: '<código>', usuario: 'nombre', clave: '…' }
//   { accion: 'cambiar_clave', empleado: '<código>', clave: '…' }
// Respuesta: { ok: true, usuario } o { ok: false, error } con 400/401/403/404/409/500.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const DOMINIO = 'ofipapel.local'

function respuesta(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
}

function claveValida(clave: unknown): string | null {
  if (typeof clave !== 'string') return 'Falta la contraseña.'
  if (clave.length < 8) return 'La contraseña tiene que tener al menos 8 caracteres.'
  if (clave.length > 72) return 'La contraseña es demasiado larga (máximo 72 caracteres).'
  return null
}

/** Nombre de usuario: minúsculas, sin acentos ni espacios (luis, rober, maria.p…). */
function normalizarUsuario(u: unknown): string | null {
  if (typeof u !== 'string') return null
  const s = u
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '.')
  return /^[a-z0-9][a-z0-9._-]{1,30}$/.test(s) ? s : null
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return respuesta(405, { ok: false, error: 'Método no permitido.' })

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !serviceKey) return respuesta(500, { ok: false, error: 'Función sin configurar.' })

  const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
  if (!token) return respuesta(401, { ok: false, error: 'Falta la sesión.' })

  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  // 1. Quién llama (token de sesión real, no la clave pública).
  const { data: quien, error: errQuien } = await admin.auth.getUser(token)
  if (errQuien || !quien?.user) return respuesta(401, { ok: false, error: 'Sesión no válida.' })

  // 2. ¿Es administrador? Empleado activo vinculado a ese usuario, con grupo administrador.
  const { data: llamante } = await admin
    .from('empleado')
    .select('codigo, activo, rol:rol_id(es_administrador)')
    .eq('auth_user_id', quien.user.id)
    .maybeSingle()
  const esAdmin = Boolean(llamante?.activo && (llamante as { rol?: { es_administrador?: boolean } | null }).rol?.es_administrador)
  if (!esAdmin) return respuesta(403, { ok: false, error: 'Solo un administrador puede crear usuarios de acceso o cambiar claves.' })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return respuesta(400, { ok: false, error: 'Petición no válida.' })
  }
  const accion = body.accion
  const codigo = typeof body.empleado === 'string' ? body.empleado.trim() : ''
  if (!codigo) return respuesta(400, { ok: false, error: 'Falta el empleado.' })

  const { data: emp } = await admin.from('empleado').select('codigo, auth_user_id, activo').eq('codigo', codigo).maybeSingle()
  if (!emp) return respuesta(404, { ok: false, error: `No existe el empleado ${codigo}.` })

  const fallo = claveValida(body.clave)
  if (fallo) return respuesta(400, { ok: false, error: fallo })
  const clave = body.clave as string

  if (accion === 'crear_usuario') {
    if (emp.auth_user_id) return respuesta(409, { ok: false, error: 'Este empleado ya tiene usuario de acceso: usa «Poner clave».' })
    const usuario = normalizarUsuario(body.usuario)
    if (!usuario) return respuesta(400, { ok: false, error: 'Usuario no válido: letras minúsculas, números, punto o guion (2 a 31).' })
    const { data: creado, error: errCrear } = await admin.auth.admin.createUser({
      email: `${usuario}@${DOMINIO}`,
      password: clave,
      email_confirm: true,
      user_metadata: { empleado_codigo: codigo },
    })
    if (errCrear || !creado?.user) {
      const existe = /already|registered|exists/i.test(errCrear?.message ?? '')
      return respuesta(existe ? 409 : 500, { ok: false, error: existe ? `El usuario «${usuario}» ya existe.` : 'No se ha podido crear el usuario.' })
    }
    const { error: errVinc } = await admin.from('empleado').update({ auth_user_id: creado.user.id }).eq('codigo', codigo)
    if (errVinc) {
      // No dejar un usuario suelto sin empleado.
      await admin.auth.admin.deleteUser(creado.user.id)
      return respuesta(500, { ok: false, error: 'No se ha podido vincular el usuario al empleado.' })
    }
    console.log(`empleados-acceso: ${llamante?.codigo} creó el usuario ${usuario} para el empleado ${codigo}`)
    return respuesta(200, { ok: true, usuario })
  }

  if (accion === 'cambiar_clave') {
    if (!emp.auth_user_id) return respuesta(409, { ok: false, error: 'Este empleado no tiene usuario de acceso: créalo primero.' })
    const { error: errClave } = await admin.auth.admin.updateUserById(emp.auth_user_id, { password: clave })
    if (errClave) return respuesta(500, { ok: false, error: 'No se ha podido cambiar la contraseña.' })
    console.log(`empleados-acceso: ${llamante?.codigo} cambió la clave del empleado ${codigo}`)
    return respuesta(200, { ok: true })
  }

  return respuesta(400, { ok: false, error: 'Acción no válida.' })
})
