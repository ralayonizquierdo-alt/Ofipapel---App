// Edge Function «correo-enviar» (Luis, 01/11/2026): envía los correos que esperan en la cola
// correo_pendiente (avisos de recibos devueltos, recordatorios…) con el correo de la empresa.
//
// · Datos del servidor: Archivo → Datos de Empresa (smtp_servidor, smtp_usuario, smtp_puerto, smtp_ssl).
//   Usad el puerto 465 con SSL: las funciones de Supabase no permiten salir por el 25 ni el 587.
// · La contraseña es el secreto SMTP_PASSWORD de las funciones (Project Settings → Edge Functions →
//   Secrets). No está en la base de datos ni en el programa.
// · La llama pg_cron cada 10 minutos (migración 20261101_avisos_correo_y_cuentas_remesa). Se despliega
//   con verify_jwt = false: lo único que hace es enviar lo que ya está en la cola, una sola vez, así que
//   llamarla de más no hace daño. Como mucho 20 correos por llamada y 5 intentos por correo.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.16'

Deno.serve(async () => {
  const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const responder = (cuerpo: Record<string, unknown>, estado = 200) =>
    new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } })

  const { data: cola, error } = await sb
    .from('correo_pendiente')
    .select('id, para, asunto, cuerpo_html, intentos')
    .is('enviado_en', null)
    .lt('intentos', 5)
    .order('id')
    .limit(20)
  if (error) return responder({ error: error.message }, 500)
  if (!cola?.length) return responder({ enviados: 0 })

  const fallo = async (motivo: string) => {
    for (const c of cola) await sb.from('correo_pendiente').update({ intentos: c.intentos + 1, error: motivo }).eq('id', c.id)
    return responder({ enviados: 0, error: motivo })
  }

  const { data: emp } = await sb.from('empresa').select('nombre, email, smtp_servidor, smtp_usuario, smtp_puerto, smtp_ssl').order('codigo').limit(1).maybeSingle()
  const clave = Deno.env.get('SMTP_PASSWORD') ?? ''
  if (!emp?.smtp_servidor || !emp?.smtp_usuario) return fallo('Falta el servidor o el usuario de correo en Archivo → Datos de Empresa.')
  if (!clave) return fallo('Falta la contraseña del correo (secreto SMTP_PASSWORD de las funciones de Supabase).')
  const puerto = Number(emp.smtp_puerto) || 465
  if (puerto === 25 || puerto === 587) return fallo(`El puerto ${puerto} no está permitido desde el servidor: usad el 465 con SSL.`)

  const transporte = nodemailer.createTransport({
    host: emp.smtp_servidor,
    port: puerto,
    secure: emp.smtp_ssl ?? puerto === 465,
    auth: { user: emp.smtp_usuario, pass: clave },
  })
  const remitente = `"${(emp.nombre ?? 'Ofipapel').replace(/"/g, '')} · Avatar" <${emp.email || emp.smtp_usuario}>`

  let enviados = 0
  for (const c of cola) {
    try {
      await transporte.sendMail({ from: remitente, to: c.para, subject: c.asunto, html: c.cuerpo_html })
      await sb.from('correo_pendiente').update({ enviado_en: new Date().toISOString(), intentos: c.intentos + 1, error: null }).eq('id', c.id)
      enviados++
    } catch (e) {
      await sb
        .from('correo_pendiente')
        .update({ intentos: c.intentos + 1, error: String((e as Error).message ?? e).slice(0, 500) })
        .eq('id', c.id)
    }
  }
  return responder({ enviados, pendientes: cola.length - enviados })
})
