// Envío del presupuesto en PDF por correo o WhatsApp (Luis, 29/10/2026). Sin servidor de correo:
//  1) Si el navegador puede compartir ficheros (Windows, móvil), abre «Compartir» con el PDF y el
//     empleado elige Outlook, Gmail o WhatsApp.
//  2) Si no, descarga el PDF y abre el correo (mailto:) o WhatsApp Web (wa.me) con el texto hecho
//     para adjuntarlo a mano.
// Queda apuntado en presupuesto_correo (el asunto dice si fue por WhatsApp y que llevaba el PDF) y, si estaba en borrador, el presupuesto pasa a «enviado»
// (la base de datos pone la fecha de envío y la del próximo contacto).

import { supabase } from '../../../lib/supabase'
import { nombrePdf, presupuestoPdf, type DatosPdf } from './presupuestoPdf'

export type Medio = 'email' | 'whatsapp' | 'descargar'

function descargar(blob: Blob, nombre: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = nombre
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}

/** Móvil español a formato internacional para wa.me (sin + ni espacios). */
function telefonoWa(t: string | null): string {
  const d = (t ?? '').replace(/\D/g, '')
  if (!d) return ''
  if (d.length === 9) return `34${d}`
  return d.replace(/^00/, '')
}

export async function enviarPresupuesto(
  medio: Medio,
  datos: DatosPdf,
  estadoActual: string | null,
): Promise<{ texto: string; enviado: boolean }> {
  const blob = await presupuestoPdf(datos)
  const nombre = nombrePdf(datos)
  if (medio === 'descargar') {
    descargar(blob, nombre)
    return { texto: `PDF descargado: ${nombre}`, enviado: false }
  }
  const { data: cli } = datos.clienteCodigo
    ? await supabase.from('cliente').select('email, telefono_movil, telefono_fijo, contacto').eq('codigo', datos.clienteCodigo).maybeSingle()
    : { data: null }
  const email = (cli?.email as string | null) ?? ''
  const movil = telefonoWa((cli?.telefono_movil as string | null) ?? (cli?.telefono_fijo as string | null) ?? null)
  const saludo = (cli?.contacto as string | null) ?? ''
  const asunto = `Presupuesto ${datos.tienda}-${datos.numero} · Ofipapel`
  const texto = [
    `Buenos días${saludo ? ` ${saludo}` : ''}:`,
    '',
    `Le enviamos el presupuesto nº ${datos.tienda}-${datos.numero}${datos.validoHasta ? `, válido hasta el ${datos.validoHasta.split('-').reverse().join('/')}` : ''}.`,
    'Quedamos a su disposición para cualquier duda.',
    '',
    `Un saludo,\nOfipapel${datos.vendedor ? ` · Vend. ${datos.vendedor}` : ''}`,
  ].join('\n')

  const fichero = new File([blob], nombre, { type: 'application/pdf' })
  let compartido = false
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  if (nav.canShare?.({ files: [fichero] })) {
    try {
      await navigator.share({ files: [fichero], title: asunto, text: texto })
      compartido = true
    } catch (e) {
      if ((e as Error).name === 'AbortError') return { texto: 'Envío cancelado.', enviado: false }
    }
  }
  if (!compartido) {
    descargar(blob, nombre)
    if (medio === 'email') window.location.href = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(texto + '\n\n(Adjunto: ' + nombre + ')')}`
    else window.open(`https://wa.me/${movil}?text=${encodeURIComponent(texto)}`, '_blank', 'noopener')
  }

  await supabase.from('presupuesto_correo').insert({
    tienda_terminal_codigo: datos.tienda,
    numero: datos.numero,
    para: medio === 'email' ? email || null : movil ? `+${movil}` : null,
    asunto: `${medio === 'whatsapp' ? '[WhatsApp] ' : ''}${asunto} (con PDF)`,
    cuerpo: texto,
  })
  if (!estadoActual || estadoActual === 'borrador') {
    await supabase.from('pedido_cliente').update({ presupuesto_estado: 'enviado' }).eq('tienda_terminal_codigo', datos.tienda).eq('numero', datos.numero)
  }
  const como = medio === 'email' ? 'correo' : 'WhatsApp'
  return {
    texto: compartido
      ? `Presupuesto enviado por ${como} y apuntado. Arranca el seguimiento.`
      : `PDF descargado (${nombre}) y ${como} abierto: adjunta el PDF y envíalo. Queda apuntado y arranca el seguimiento.`,
    enviado: true,
  }
}
