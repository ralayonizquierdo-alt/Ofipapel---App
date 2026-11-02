// Correos de NEXA. NEXA solo PREPARA el correo (fila «borrador» en nexa_correo); lo envía el botón «Enviar» de la
// tarjeta, que llama a la función con accion = enviar_correo. Aquí: validar lo que prepara la IA y mandarlo por el
// MISMO correo de la empresa que usa el resto del ERP (función correo-enviar): servidor, usuario y puerto en
// Archivo → Datos de Empresa, y la contraseña en el secreto SMTP_PASSWORD de Supabase. Puerto 465 con SSL: las Edge
// Functions de Supabase no dejan salir por el 25 ni el 587.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import nodemailer from 'npm:nodemailer@6.9.16'

const EMAIL = /^[^\s@<>()",;:]+@[^\s@<>()",;:]+\.[^\s@<>()",;:]{2,}$/
const MAX_DESTINATARIOS = 5
const MAX_ENVIOS_DIA = 30

export const PERMISO_CORREO = 'accion:nexa-enviar-correo'

export function direcciones(x: unknown): string[] {
  const lista = Array.isArray(x) ? x : typeof x === 'string' ? x.split(/[;,]/) : []
  return [...new Set(lista.filter((s): s is string => typeof s === 'string').map((s) => s.trim().toLowerCase()).filter(Boolean))]
}

export interface CorreoPanel {
  id: number
  para: string[]
  cc: string[]
  asunto: string
  cuerpo: string
  adjuntos: { id: number; nombre: string }[]
  estado: 'borrador' | 'enviado' | 'cancelado'
}

/** Guarda el borrador (con los permisos del usuario) y devuelve lo que enseña la tarjeta. */
export async function prepararCorreo(sb: SupabaseClient, entrada: Record<string, unknown>): Promise<{ texto: string; error: boolean; correo?: CorreoPanel }> {
  const para = direcciones(entrada.para)
  const cc = direcciones(entrada.cc)
  const asunto = typeof entrada.asunto === 'string' ? entrada.asunto.trim().slice(0, 200) : ''
  const cuerpo = typeof entrada.cuerpo === 'string' ? entrada.cuerpo.trim().slice(0, 8000) : ''
  const ids = (Array.isArray(entrada.documentos) ? entrada.documentos : []).map(Number).filter((n) => Number.isInteger(n) && n > 0).slice(0, 3)
  if (!para.length) return { texto: 'Falta el destinatario: pregúntale a quién va el correo (no lo inventes).', error: true }
  if (para.length + cc.length > MAX_DESTINATARIOS) return { texto: `Demasiados destinatarios (máximo ${MAX_DESTINATARIOS}).`, error: true }
  const mala = [...para, ...cc].find((d) => !EMAIL.test(d))
  if (mala) return { texto: `«${mala}» no es una dirección de correo válida: pídele la correcta.`, error: true }
  if (!asunto || !cuerpo) return { texto: 'Faltan el asunto o el texto del correo.', error: true }

  let adjuntos: { id: number; nombre: string }[] = []
  if (ids.length) {
    const { data, error } = await sb.from('nexa_documento').select('id, nombre').in('id', ids)
    if (error) return { texto: `No he podido leer los adjuntos: ${error.message}`, error: true }
    adjuntos = (data ?? []) as { id: number; nombre: string }[]
    if (adjuntos.length !== ids.length) return { texto: 'Algún documento adjunto no existe o no es tuyo. Crea el PDF primero con crear_pdf.', error: true }
  }
  const { data, error } = await sb
    .from('nexa_correo')
    .insert({ para, cc, asunto, cuerpo, documentos: ids })
    .select('id, estado')
    .single()
  if (error || !data) return { texto: `No he podido preparar el correo: ${error?.message ?? 'sin respuesta'}`, error: true }
  const correo: CorreoPanel = { id: (data as { id: number }).id, para, cc, asunto, cuerpo, adjuntos, estado: 'borrador' }
  return {
    texto:
      `Correo preparado (nº ${correo.id}) para ${para.join(', ')}${cc.length ? ` con copia a ${cc.join(', ')}` : ''}. NO está enviado: la persona lo revisa en la tarjeta y lo envía ella con el botón «Enviar». ` +
      'Díselo así, sin decir nunca que ya se ha enviado.',
    error: false,
    correo,
  }
}

function aHtml(texto: string) {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#222">${texto
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`)
    .join('')}</div>`
}

function base64(bytes: Uint8Array) {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(s)
}

/** Envía un correo ya preparado (lo llama el botón). Con los permisos del usuario. */
export async function enviarCorreo(
  sb: SupabaseClient,
  id: number,
  usuario: { uid: string; email: string },
): Promise<{ ok: boolean; error?: string; estado?: string }> {
  const { data: puede } = await sb.rpc('fn_puede', { p_codigo: PERMISO_CORREO })
  if (puede !== true) return { ok: false, error: 'No tienes permiso para enviar correos desde NEXA (Grupos de acceso → «NEXA: enviar correos»).' }

  const { data: emp } = await sb.from('empresa').select('nombre, email, smtp_servidor, smtp_usuario, smtp_puerto, smtp_ssl').order('codigo').limit(1).maybeSingle()
  const clave = Deno.env.get('SMTP_PASSWORD') ?? ''
  if (!emp?.smtp_servidor || !emp?.smtp_usuario || !clave) {
    return { ok: false, error: 'El correo de la empresa aún no está configurado: faltan servidor y usuario en Archivo → Datos de Empresa y/o la contraseña (secreto SMTP_PASSWORD en Supabase).' }
  }
  const puerto = Number(emp.smtp_puerto) || 465
  if (puerto === 25 || puerto === 587) return { ok: false, error: `El puerto ${puerto} no está permitido desde el servidor: usad el 465 con SSL.` }

  const { data: c, error } = await sb.from('nexa_correo').select('*').eq('id', id).maybeSingle()
  if (error || !c) return { ok: false, error: 'No encuentro ese correo (¿es de otra persona?).' }
  if (c.estado !== 'borrador') return { ok: false, error: c.estado === 'enviado' ? 'Ese correo ya se envió.' : 'Ese correo se canceló.' }

  const desde = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { count } = await sb.from('nexa_correo').select('id', { count: 'exact', head: true }).eq('estado', 'enviado').gte('enviado_en', desde)
  if ((count ?? 0) >= MAX_ENVIOS_DIA) return { ok: false, error: `Límite diario alcanzado (${MAX_ENVIOS_DIA} correos en 24 h desde NEXA).` }

  const adjuntos: { filename: string; content: string }[] = []
  const ids = (c.documentos ?? []) as number[]
  if (ids.length) {
    const { data: docs } = await sb.from('nexa_documento').select('id, nombre, ruta').in('id', ids)
    for (const d of (docs ?? []) as { nombre: string; ruta: string }[]) {
      const { data: blob, error: e2 } = await sb.storage.from('nexa-documentos').download(d.ruta)
      if (e2 || !blob) return { ok: false, error: `No he podido leer el adjunto «${d.nombre}».` }
      adjuntos.push({ filename: d.nombre, content: base64(new Uint8Array(await blob.arrayBuffer())) })
    }
  }

  const pie = `\n\n—\nEnviado desde el ERP de Ofipapel por ${usuario.email}.`
  const transporte = nodemailer.createTransport({
    host: emp.smtp_servidor,
    port: puerto,
    secure: emp.smtp_ssl ?? puerto === 465,
    auth: { user: emp.smtp_usuario, pass: clave },
  })
  try {
    await transporte.sendMail({
      from: `"${String(emp.nombre ?? 'Ofipapel').replace(/"/g, '')}" <${emp.email || emp.smtp_usuario}>`,
      to: c.para,
      ...(c.cc?.length ? { cc: c.cc } : {}),
      replyTo: (Deno.env.get('EMAIL_REPLY_TO') ?? '').trim() || usuario.email,
      subject: c.asunto,
      text: c.cuerpo + pie,
      html: aHtml(c.cuerpo + pie),
      attachments: adjuntos.map((a) => ({ filename: a.filename, content: a.content, encoding: 'base64' as const })),
    })
  } catch (e) {
    const msg = String((e as Error).message ?? e)
    await sb.from('nexa_correo').update({ error: msg.slice(0, 500) }).eq('id', id)
    return { ok: false, error: `El servidor de correo lo ha rechazado: ${msg}` }
  }
  await sb.from('nexa_correo').update({ estado: 'enviado', enviado_en: new Date().toISOString(), proveedor_id: null, error: null }).eq('id', id)
  return { ok: true, estado: 'enviado' }
}
