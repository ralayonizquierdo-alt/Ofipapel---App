// Edge Function «correo-enviar» (Luis, 01/11/2026): envía los correos que esperan en la cola
// correo_pendiente (avisos de recibos devueltos, recordatorios…) con el correo de la empresa.
//
// · Desde el 03/11/2026 (Rober) sale por Microsoft 365 (graph.ts) desde el buzón de Archivo → Datos de Empresa →
//   «Correo remitente» (de momento ofipapelsl@ofipapelsl.com), si están los secretos AZURE_*. Si no, por SMTP:
// · Datos del servidor: Archivo → Datos de Empresa (smtp_servidor, smtp_usuario, smtp_puerto, smtp_ssl).
//   Usad el puerto 465 con SSL: las funciones de Supabase no permiten salir por el 25 ni el 587.
// · La contraseña es el secreto SMTP_PASSWORD de las funciones (Project Settings → Edge Functions →
//   Secrets). No está en la base de datos ni en el programa.
// · La llama pg_cron cada 10 minutos (migración 20261101_avisos_correo_y_cuentas_remesa). Se despliega
//   con verify_jwt = false: lo único que hace es enviar lo que ya está en la cola, una sola vez, así que
//   llamarla de más no hace daño. Como mucho 20 correos por llamada y 5 intentos por correo.
// · Adjuntos (12/11/2026, Gestor de Roturas): correo_pendiente.adjuntos = [{ bucket, ruta, nombre }]. Se leen del
//   almacenamiento PRIVADO con la clave de servicio. Como mucho 3 MB en total por correo (límite de Microsoft
//   para un envío directo); si se pasa, el correo queda con error y no sale a medias.

import { createClient } from 'jsr:@supabase/supabase-js@2'
import nodemailer from 'npm:nodemailer@6.9.16'
import { enviarGraph, graphConfigurado } from './graph.ts'

interface AdjuntoCola {
  bucket: string
  ruta: string
  nombre?: string
}
const MAX_ADJUNTOS = 3 * 1024 * 1024

function aBase64(bytes: Uint8Array) {
  let binario = ''
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binario)
}

Deno.serve(async () => {
  const sb = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const responder = (cuerpo: Record<string, unknown>, estado = 200) =>
    new Response(JSON.stringify(cuerpo), { status: estado, headers: { 'Content-Type': 'application/json' } })

  /** Lee los adjuntos de un correo del almacenamiento privado. Lanza un error legible si falta alguno o pesan demasiado. */
  const cargarAdjuntos = async (lista: unknown): Promise<{ nombre: string; base64: string; tipo: string; bytes: Uint8Array }[]> => {
    if (!Array.isArray(lista) || !lista.length) return []
    const salida: { nombre: string; base64: string; tipo: string; bytes: Uint8Array }[] = []
    let total = 0
    for (const a of lista as AdjuntoCola[]) {
      if (!a?.bucket || !a?.ruta) throw new Error('Adjunto mal definido en la cola de correo.')
      const { data, error: errDesc } = await sb.storage.from(a.bucket).download(a.ruta)
      if (errDesc || !data) throw new Error(`No se ha podido leer el adjunto «${a.nombre ?? a.ruta}».`)
      const bytes = new Uint8Array(await data.arrayBuffer())
      total += bytes.length
      if (total > MAX_ADJUNTOS) throw new Error('Los adjuntos pesan más de 3 MB: quita fotos de la reclamación y vuelve a enviarla.')
      salida.push({ nombre: a.nombre ?? a.ruta.split('/').pop() ?? 'adjunto', base64: aBase64(bytes), tipo: data.type || 'application/octet-stream', bytes })
    }
    return salida
  }

  const { data: cola, error } = await sb
    .from('correo_pendiente')
    .select('id, para, asunto, cuerpo_html, intentos, buzon, adjuntos')
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

  const { data: emp } = await sb
    .from('empresa')
    .select('nombre, email, smtp_servidor, smtp_usuario, smtp_puerto, smtp_ssl, correo_remitente, correo_responder_a, correo_remitente_compras, correo_remitente_administracion')
    .order('codigo')
    .limit(1)
    .maybeSingle()

  // Microsoft 365
  if (graphConfigurado()) {
    // Pedidos y reclamaciones a proveedores: salen de Compras y las respuestas vuelven a Compras.
    const general = (emp?.correo_remitente ?? '').trim()
    const compras = (emp?.correo_remitente_compras ?? '').trim()
    // Cobros a clientes (recibos devueltos, recordatorios, reclamaciones de deuda): desde Administración.
    const administracion = (emp?.correo_remitente_administracion ?? '').trim()
    let enviados = 0
    for (const c of cola) {
      try {
        const esCompras = c.buzon === 'compras'
        const esAdmin = c.buzon === 'administracion'
        const desde = esCompras ? compras : esAdmin ? administracion : general
        if (!desde) throw new Error(`Falta el buzón ${esCompras ? 'de Compras' : esAdmin ? 'de Administración' : 'del ERP'} en Archivo → Datos de Empresa.`)
        const adjuntos = await cargarAdjuntos(c.adjuntos)
        await enviarGraph({
          desde,
          para: String(c.para).split(/[;,]/).map((x) => x.trim()).filter(Boolean),
          responderA: esCompras || esAdmin ? desde : emp?.correo_responder_a || null,
          asunto: c.asunto,
          html: c.cuerpo_html,
          adjuntos: adjuntos.map((a) => ({ nombre: a.nombre, base64: a.base64, tipo: a.tipo })),
        })
        await sb.from('correo_pendiente').update({ enviado_en: new Date().toISOString(), intentos: c.intentos + 1, error: null }).eq('id', c.id)
        enviados++
      } catch (e) {
        await sb.from('correo_pendiente').update({ intentos: c.intentos + 1, error: String((e as Error).message ?? e).slice(0, 500) }).eq('id', c.id)
      }
    }
    return responder({ enviados, pendientes: cola.length - enviados, via: 'microsoft' })
  }

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
      const adjuntos = await cargarAdjuntos(c.adjuntos)
      await transporte.sendMail({
        from: remitente,
        to: c.para,
        subject: c.asunto,
        html: c.cuerpo_html,
        attachments: adjuntos.map((a) => ({ filename: a.nombre, content: a.base64, encoding: 'base64', contentType: a.tipo })),
      })
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
