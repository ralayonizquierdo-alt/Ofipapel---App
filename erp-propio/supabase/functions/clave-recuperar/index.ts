// Edge Function «clave-recuperar» (Luis, 01/11/2026: «¿Has olvidado la clave?»). Sin sesión.
//
//   { accion: 'pedir', usuario, captcha? }            → manda un código de 6 cifras al correo del empleado
//   { accion: 'cambiar', usuario, codigo, nueva }     → con ese código, pone la clave nueva
//
// Seguridad:
//  · Se despliega con verify_jwt = false (quien la usa ha olvidado la clave). Por eso:
//  · «pedir» contesta SIEMPRE lo mismo, exista o no el usuario (no sirve para adivinar usuarios).
//  · Como mucho 3 códigos por empleado y 10 por dirección IP cada hora. El código caduca a los 15
//    minutos y admite 5 intentos. En la base de datos solo se guarda su huella (sha-256), nunca el código.
//  · «No soy un robot»: si existe el secreto TURNSTILE_SECRET (Cloudflare Turnstile) se exige.
//  · El correo sale por la cola correo_pendiente y la función correo-enviar (correo de la empresa).
//  · Las claves nunca se devuelven ni se escriben en el registro.

import { createClient } from 'jsr:@supabase/supabase-js@2'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const responder = (status: number, body: Record<string, unknown>) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })

const GENERICO =
  'Si el usuario existe y tiene correo en su ficha, le hemos enviado un código de 6 cifras (mira también en «correo no deseado»). Si no te llega en unos minutos, pide a un administrador que te ponga una clave nueva.'

const COMUNES = ['12345678', '123456789', 'password', 'contraseña', 'ofipapel', 'qwerty123', 'abc12345', '11111111', 'avatar123']

/** Mismas reglas que src/lib/claves.ts. */
function fallosClave(clave: unknown, usuario: string): string | null {
  if (typeof clave !== 'string' || !clave) return 'Falta la clave nueva.'
  if (clave.length < 8) return 'La clave tiene que tener al menos 8 caracteres.'
  if (clave.length > 72) return 'La clave es demasiado larga (máximo 72 caracteres).'
  if (!/[a-zñ]/i.test(clave) || !/\d/.test(clave)) return 'La clave tiene que llevar letras y números.'
  const c = clave.toLowerCase()
  if (usuario && usuario.length >= 3 && c.includes(usuario)) return 'La clave no puede llevar dentro tu nombre de usuario.'
  if (COMUNES.some((x) => c.includes(x))) return 'Esa clave es demasiado fácil de adivinar.'
  return null
}

async function huella(texto: string) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('')
}

function codigoNuevo() {
  const n = new Uint32Array(1)
  crypto.getRandomValues(n)
  return String(n[0] % 1_000_000).padStart(6, '0')
}

const usuarioLimpio = (u: unknown) => (typeof u === 'string' ? u.trim().toLowerCase().replace(/@ofipapel\.local$/, '') : '')

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return responder(405, { ok: false, error: 'Método no permitido.' })

  const url = Deno.env.get('SUPABASE_URL') ?? ''
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  if (!url || !serviceKey) return responder(500, { ok: false, error: 'Función sin configurar.' })
  const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return responder(400, { ok: false, error: 'Petición no válida.' })
  }
  const usuario = usuarioLimpio(body.usuario)
  if (!/^[a-z0-9][a-z0-9._-]{1,30}$/.test(usuario)) return responder(400, { ok: false, error: 'Escribe tu usuario.' })
  const ip = (req.headers.get('x-forwarded-for') ?? '').split(',')[0].trim() || null

  const { data: filas } = await admin.rpc('fn_clave_empleado_por_usuario', { p_usuario: usuario })
  const emp = (filas as { codigo: string; email: string | null; auth_user_id: string; nombre: string }[] | null)?.[0] ?? null
  const haceUnaHora = new Date(Date.now() - 3600_000).toISOString()

  if (body.accion === 'pedir') {
    const secreto = Deno.env.get('TURNSTILE_SECRET')
    if (secreto) {
      const f = new FormData()
      f.append('secret', secreto)
      f.append('response', typeof body.captcha === 'string' ? body.captcha : '')
      if (ip) f.append('remoteip', ip)
      const r = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', body: f })
      const v = (await r.json().catch(() => ({}))) as { success?: boolean }
      if (!v.success) return responder(400, { ok: false, error: 'Marca la casilla «No soy un robot».' })
    }
    if (ip) {
      const { count } = await admin.from('clave_codigo').select('id', { count: 'exact', head: true }).eq('ip', ip).gt('creado_en', haceUnaHora)
      if ((count ?? 0) >= 10) return responder(429, { ok: false, error: 'Demasiadas peticiones. Prueba dentro de una hora.' })
    }
    if (!emp?.email) return responder(200, { ok: true, mensaje: GENERICO })
    const { count } = await admin
      .from('clave_codigo')
      .select('id', { count: 'exact', head: true })
      .eq('empleado_codigo', emp.codigo)
      .gt('creado_en', haceUnaHora)
    if ((count ?? 0) >= 3) return responder(200, { ok: true, mensaje: GENERICO })

    const codigo = codigoNuevo()
    await admin.from('clave_codigo').update({ usado_en: new Date().toISOString() }).eq('empleado_codigo', emp.codigo).is('usado_en', null)
    const { error: errIns } = await admin.from('clave_codigo').insert({
      empleado_codigo: emp.codigo,
      huella: await huella(`${emp.codigo}:${codigo}`),
      expira_en: new Date(Date.now() + 15 * 60_000).toISOString(),
      ip,
    })
    if (errIns) return responder(500, { ok: false, error: 'No se ha podido preparar el código. Prueba otra vez.' })
    const nombre = (emp.nombre ?? '').split(' ')[0]
    await admin.from('correo_pendiente').insert({
      para: emp.email,
      asunto: `Avatar · Código para cambiar tu clave: ${codigo}`,
      cuerpo_html:
        `<p>Hola ${nombre},</p><p>Tu código para poner una clave nueva en Avatar es:</p>` +
        `<p style="font-size:26px;font-weight:bold;letter-spacing:4px">${codigo}</p>` +
        `<p>Caduca en 15 minutos. Si no lo has pedido tú, no hagas nada: tu clave sigue igual. Y avisa a un administrador.</p>`,
      origen: 'clave-recuperar',
    })
    // Que salga ya, sin esperar a los 10 minutos del programador.
    await fetch(`${url}/functions/v1/correo-enviar`, { method: 'POST', headers: { Authorization: `Bearer ${serviceKey}` } }).catch(() => null)
    console.log(`clave-recuperar: código pedido para ${emp.codigo}`)
    return responder(200, { ok: true, mensaje: GENERICO })
  }

  if (body.accion === 'cambiar') {
    const codigo = typeof body.codigo === 'string' ? body.codigo.replace(/\D/g, '') : ''
    const malo = () => responder(400, { ok: false, error: 'Código incorrecto o caducado. Pide uno nuevo.' })
    if (!emp || codigo.length !== 6) return malo()
    const fallo = fallosClave(body.nueva, usuario)
    if (fallo) return responder(400, { ok: false, error: fallo })
    const { data: c } = await admin
      .from('clave_codigo')
      .select('id, huella, intentos')
      .eq('empleado_codigo', emp.codigo)
      .is('usado_en', null)
      .gt('expira_en', new Date().toISOString())
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (!c || c.intentos >= 5) return malo()
    if (c.huella !== (await huella(`${emp.codigo}:${codigo}`))) {
      await admin.from('clave_codigo').update({ intentos: c.intentos + 1 }).eq('id', c.id)
      return malo()
    }
    const { error: errClave } = await admin.auth.admin.updateUserById(emp.auth_user_id, { password: body.nueva as string })
    if (errClave) return responder(500, { ok: false, error: 'No se ha podido cambiar la clave. Prueba otra vez.' })
    await admin.from('clave_codigo').update({ usado_en: new Date().toISOString() }).eq('id', c.id)
    await admin.from('empleado').update({ debe_cambiar_clave: false }).eq('codigo', emp.codigo)
    console.log(`clave-recuperar: clave cambiada con código para ${emp.codigo}`)
    return responder(200, { ok: true, mensaje: 'Clave cambiada. Ya puedes entrar con la nueva.' })
  }

  return responder(400, { ok: false, error: 'Acción no válida.' })
})
