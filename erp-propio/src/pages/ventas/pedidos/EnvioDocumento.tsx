// Enviar un presupuesto, pedido o proforma (Rober, 22/11/2026; lo usan sobre todo los comerciales):
//  · «Compartir»: la ventana de compartir del propio dispositivo (Android, iPhone/iPad, Windows con Chrome o Edge) con el
//    PDF adjunto y el texto ya escrito; cada uno elige su WhatsApp, Telegram, Gmail, Outlook… y sale de SU número o cuenta.
//  · «Correo»: el servidor lo envía con el PDF adjunto DESDE EL CORREO DE QUIEN LO ENVÍA (el de su ficha de empleado), y
//    queda en sus Enviados. Sin correo en la ficha no se envía: lo pone un administrador (fn_documento_venta_enviar).
// Los dos quedan apuntados en el seguimiento del presupuesto (presupuesto_correo) y un presupuesto en borrador pasa a enviado.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../../lib/supabase'
import { GwInput, GwTextArea, GwWindow } from '../../../components/gw'
import { nombrePdf, presupuestoPdf, type DatosPdf } from './presupuestoPdf'

export type TipoDocVenta = 'pedido' | 'proforma' | 'presupuesto'
const NOMBRE: Record<TipoDocVenta, string> = { pedido: 'pedido', proforma: 'factura proforma', presupuesto: 'presupuesto' }
const ARCHIVO: Record<TipoDocVenta, string> = { pedido: 'Pedido', proforma: 'Proforma', presupuesto: 'Presupuesto' }

interface Yo {
  nombre: string
  email: string | null
}

async function quienSoy(): Promise<Yo | null> {
  const { data: codigo } = await supabase.rpc('fn_empleado_actual')
  if (!codigo) return null
  const { data } = await supabase.from('empleado').select('nombre, email').eq('codigo', codigo as string).maybeSingle()
  return data ? { nombre: String(data.nombre ?? ''), email: (data.email as string | null) || null } : null
}

/** Asunto y texto ya escritos para el cliente. */
export async function textoEnvio(tipo: TipoDocVenta, d: DatosPdf) {
  const [{ data: cli }, yo] = await Promise.all([
    d.clienteCodigo ? supabase.from('cliente').select('email, contacto').eq('codigo', d.clienteCodigo).maybeSingle() : Promise.resolve({ data: null }),
    quienSoy(),
  ])
  const saludo = ((cli as { contacto?: string | null } | null)?.contacto ?? '').trim()
  const valido = tipo === 'presupuesto' && d.validoHasta ? `, válido hasta el ${d.validoHasta.slice(0, 10).split('-').reverse().join('/')}` : ''
  const asunto = `${ARCHIVO[tipo]} ${d.tienda}-${d.numero} · Ofipapel`
  const texto = [
    `Buenos días${saludo ? ` ${saludo}` : ''}:`,
    '',
    `Le adjuntamos ${tipo === 'proforma' ? 'la' : 'el'} ${NOMBRE[tipo]} nº ${d.tienda}-${d.numero}${valido}.`,
    'Quedamos a su disposición para cualquier duda.',
    '',
    'Un saludo,',
    yo?.nombre || d.vendedor || '',
    'Ofipapel',
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
  return { asunto, texto, para: ((cli as { email?: string | null } | null)?.email ?? '').trim(), yo }
}

function nombreArchivo(tipo: TipoDocVenta, d: DatosPdf) {
  return nombrePdf(d).replace(/^Presupuesto/, ARCHIVO[tipo])
}

/** Apunta el envío en el seguimiento y pasa el presupuesto de borrador a enviado (solo para Compartir: Correo lo hace el servidor). */
async function apuntar(tipo: TipoDocVenta, d: DatosPdf, para: string | null, asunto: string, texto: string) {
  await supabase.from('presupuesto_correo').insert({ tienda_terminal_codigo: d.tienda, numero: d.numero, para, asunto: `[Compartido] ${asunto} (con PDF)`, cuerpo: texto })
  if (tipo === 'presupuesto') {
    await supabase
      .from('pedido_cliente')
      .update({ presupuesto_estado: 'enviado' })
      .eq('tienda_terminal_codigo', d.tienda)
      .eq('numero', d.numero)
      .or('presupuesto_estado.is.null,presupuesto_estado.eq.borrador')
  }
}

/** ¿Este dispositivo puede compartir ficheros? (Android, iPhone/iPad, Windows con Chrome o Edge.) */
export function puedeCompartir() {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean }
  try {
    return !!nav.canShare?.({ files: [new File([new Uint8Array(1)], 'x.pdf', { type: 'application/pdf' })] })
  } catch {
    return false
  }
}

/** Abre «Compartir» del dispositivo con el PDF y el texto. Devuelve el aviso para la pantalla. */
export async function compartirDocumento(tipo: TipoDocVenta, d: DatosPdf): Promise<string> {
  const [blob, t] = await Promise.all([presupuestoPdf(d), textoEnvio(tipo, d)])
  const fichero = new File([blob], nombreArchivo(tipo, d), { type: 'application/pdf' })
  try {
    await navigator.share({ files: [fichero], title: t.asunto, text: t.texto })
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'Envío cancelado.'
    throw e
  }
  await apuntar(tipo, d, null, t.asunto, t.texto)
  return `${ARCHIVO[tipo]} compartido y apuntado en el seguimiento.`
}

export function DialogoCorreoDocumento({
  tipo,
  datos,
  onCerrar,
  onAviso,
}: {
  tipo: TipoDocVenta
  datos: DatosPdf
  onCerrar: () => void
  onAviso: (texto: string) => void
}) {
  const [para, setPara] = useState('')
  const [asunto, setAsunto] = useState('')
  const [texto, setTexto] = useState('')
  const [yo, setYo] = useState<Yo | null | undefined>(undefined)
  const [estado, setEstado] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    let cancel = false
    void textoEnvio(tipo, datos).then((t) => {
      if (cancel) return
      setPara(t.para)
      setAsunto(t.asunto)
      setTexto(t.texto)
      setYo(t.yo)
    })
    return () => {
      cancel = true
    }
  }, [tipo, datos])

  const sinCorreo = yo !== undefined && !yo?.email

  async function enviar() {
    setError(null)
    setEnviando(true)
    try {
      setEstado('Preparando el PDF…')
      const blob = await presupuestoPdf(datos)
      const nombre = nombreArchivo(tipo, datos)
      const ruta = `${datos.tienda}-${datos.numero}/${Date.now()}-${nombre.normalize('NFD').replace(/[^A-Za-z0-9.-]+/g, '_').slice(0, 80)}`
      const sube = await supabase.storage.from('documentos_venta').upload(ruta.endsWith('.pdf') ? ruta : `${ruta}.pdf`, blob, { contentType: 'application/pdf' })
      if (sube.error) throw new Error(`No se ha podido subir el PDF: ${sube.error.message}`)
      setEstado('Enviando…')
      const { data, error: e } = await supabase.rpc('fn_documento_venta_enviar', {
        p_tienda: datos.tienda,
        p_numero: datos.numero,
        p_para: para,
        p_asunto: asunto,
        p_texto: texto,
        p_ruta: sube.data.path,
        p_nombre: nombre,
      })
      if (e) throw new Error(e.message)
      const id = (data as { correo_id: number }).correo_id
      // Se envía ya (si no, lo recoge el envío automático en unos minutos) y se espera a ver cómo ha ido.
      await supabase.functions.invoke('correo-enviar').catch(() => null)
      for (let i = 0; i < 8; i++) {
        const { data: st } = await supabase.rpc('fn_documento_venta_correo_estado', { p_id: id })
        const s = st as { enviado_en: string | null; error: string | null } | null
        if (s?.enviado_en) {
          onAviso(`${ARCHIVO[tipo]} enviado por correo a ${para} desde ${yo?.email ?? 'tu correo'}. Queda apuntado en el seguimiento.`)
          onCerrar()
          return
        }
        if (s?.error) throw new Error(`No ha salido: ${s.error}`)
        await new Promise((r) => setTimeout(r, 1500))
      }
      onAviso(`${ARCHIVO[tipo]}: el correo está en la cola y saldrá en unos minutos desde ${yo?.email ?? 'tu correo'}.`)
      onCerrar()
    } catch (e) {
      setError((e as Error).message)
      setEstado(null)
    } finally {
      setEnviando(false)
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/30 p-2" onMouseDown={(e) => e.target === e.currentTarget && !enviando && onCerrar()}>
      <GwWindow title={`Enviar ${NOMBRE[tipo]} ${datos.tienda}-${datos.numero} por correo`} onClose={enviando ? undefined : onCerrar} className="w-[640px] max-w-full">
        <div className="flex flex-col gap-2 p-2 text-[16px]">
          <div className="text-[15px]">
            Sale desde:{' '}
            {yo === undefined ? '…' : yo?.email ? <b>{yo.email}</b> : <b className="text-[#c42b1c]">no tienes correo en tu ficha de empleado</b>}
          </div>
          {sinCorreo && (
            <div className="rounded border border-[#c42b1c] bg-[#fde8e6] px-2 py-1 text-[15px]">
              Para enviar desde tu correo, pide a un administrador que lo ponga en tu ficha (Archivo → Empleados). Mientras tanto puedes usar «Compartir» o «PDF».
            </div>
          )}
          <label className="flex flex-col gap-0.5">
            <span>Para (correo del cliente; varios separados por «;»)</span>
            <GwInput value={para} onChange={(e) => setPara(e.target.value)} disabled={enviando} inputMode="email" />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Asunto</span>
            <GwInput value={asunto} onChange={(e) => setAsunto(e.target.value)} disabled={enviando} />
          </label>
          <label className="flex flex-col gap-0.5">
            <span>Texto (se puede cambiar)</span>
            <GwTextArea className="!h-[190px]" value={texto} onChange={(e) => setTexto(e.target.value)} disabled={enviando} />
          </label>
          <div className="text-[14px] text-[#5b6680]">Adjunto: {nombreArchivo(tipo, datos)}</div>
          {estado && <div className="text-[#1a4fd0]">{estado}</div>}
          {error && <div className="font-bold text-[#c42b1c]">{error}</div>}
          <div className="flex justify-end gap-2">
            <button type="button" className="gw-btn !h-[38px] px-4" onClick={onCerrar} disabled={enviando}>
              Cancelar
            </button>
            <button type="button" className="gw-btn !h-[38px] px-4 font-bold" onClick={enviar} disabled={enviando || sinCorreo || yo === undefined || !para.trim()}>
              {enviando ? 'Enviando…' : 'Enviar'}
            </button>
          </div>
        </div>
      </GwWindow>
    </div>,
    document.body,
  )
}
