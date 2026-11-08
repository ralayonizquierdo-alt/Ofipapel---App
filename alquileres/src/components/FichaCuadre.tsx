import { useRef, useState } from 'react'
import { Printer, Mail, Pencil, ListFilter, MessageCircle, Copy, Check } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { useCuadreEstancia, rutaDeTarifa } from '../lib/cuadreEstancia'
import { usuarioActual } from '../lib/auth'
import { formatDate, today } from '../lib/dateUtils'
import { num } from '../lib/formato'
import { useRecordado } from '../lib/recordado'
import { copiarConFormato, htmlConEstilos } from '../lib/copiarConFormato'
import { cobradoDeReserva } from '../lib/anuladas'
import Modal from './ui/Modal'
import CuadroEstancia from './CuadroEstancia'
import type { Reservation } from '../types'

/**
 * La ficha de cuadre de una estancia: de dónde sale su importe y cómo se ha
 * ido cobrando, mes a mes.
 *
 * Lo pidió el propietario el 02/11/2026 con una hoja de Excel hecha a mano y
 * una nota arriba: «todo el cuadro se rellena automático». Son tres cosas que
 * pedía juntas:
 *
 *  · Poder **llegar a la reserva** desde los avisos de arriba de Cobros («falta
 *    por cobrar de estancias ya terminadas», «cobrado de más»): pinchar y ver
 *    todo el proceso del cobro, no quedarse con la cifra suelta.
 *  · Ver la **operativa**: la tarifa dividida entre los días del tramo,
 *    multiplicada por las noches, más los cargos. Tal cual se escribe a mano.
 *  · Que el cuadro se pueda **imprimir o mandar a la agencia** como recibo de
 *    cuadre y conformidad.
 *
 * Una estancia sin cobros repartidos por meses enseña el mismo cuadro sin las
 * líneas vacías (lo pidió así: «no las líneas que no contengan importes»).
 *
 * Las cuentas viven en `lib/cuadreEstancia.ts` y el cuadro en `CuadroEstancia`,
 * que comparte con el recuadro que sale al pasar el ratón por la tabla de Cobros.
 */

const dec = (n: number) => num(n, 2)

/** El mensaje de la conformidad, mientras no se escriba otro (texto de Luis, 08/11/2026, pulido). */
const MENSAJE_CONFORMIDAD = 'Les rogamos que revisen la reserva adjunta y comprueben las noches asignadas a cada '
  + 'mes y el importe que corresponde a cada uno. Si todo es correcto, les agradeceremos que nos envíen su '
  + 'conformidad; en caso contrario, indíquennos las diferencias.\n\nGracias. Un saludo.'

export type ModeloFicha = 'cuadre' | 'conformidad'

export default function FichaCuadre({ reserva, onClose, onVerCobros, modeloInicial = 'cuadre' }: {
  reserva: Reservation
  onClose: () => void
  /**
   * «Cuadre de cobros» (lo cobrado mes a mes) o «Conformidad de la reserva»
   * (Luis, 07/11/2026): la que se manda a la agencia cuando envía una reserva,
   * para corroborar precio y noches, sin nada de cobros.
   */
  modeloInicial?: ModeloFicha
  /**
   * Enseñar todos los cobros de ese apartamento en ese año. Lo pidió el
   * propietario con el descuadre delante: «que me muestre la relación de
   * cobros de este apartamento del año en que se produce el descuadre»,
   * porque un cobro de otra estancia del mismo piso puede explicar la
   * diferencia.
   */
  onVerCobros?: (apartmentId: string, year: number) => void
}) {
  const navigate = useNavigate()
  const { reservations, payments, updateReservation, anotaVolcado } = useData()
  // La reserva tal como está ahora en la base: si se marca como pactada desde
  // aquí, la ficha lo enseña al momento.
  const r = reservations.find(x => x.id === reserva.id) ?? reserva
  const cuadre = useCuadreEstancia(r)
  const [modelo, setModelo] = useState<ModeloFicha>(modeloInicial)
  const conformidad = modelo === 'conformidad'
  /**
   * El cuadro de diálogo de la conformidad (Luis, 08/11/2026): un mensaje para
   * la agencia que **se queda puesto** hasta que se cambie («queda fijo
   * mientras no lo cambie», guardado en este ordenador), dos líneas en blanco y
   * en la tercera «NOTAS:», con lo propio de esta reserva, que **no se guarda**.
   * Va igual al papel, al correo y al WhatsApp.
   */
  const [mensaje, setMensaje] = useRecordado('conformidad.mensaje', MENSAJE_CONFORMIDAD)
  const [notas, setNotas] = useState('')
  /** El cuadro tal como se manda: el mensaje, dos líneas en blanco y «NOTAS:». */
  const dialogo = `${mensaje.trim()}\n\n\nNOTAS: ${notas.trim()}`.trimEnd()
  const [anotando, setAnotando] = useState(false)
  const [motivo, setMotivo] = useState('')
  const [conQuien, setConQuien] = useState('')
  const [fechaPacto, setFechaPacto] = useState(today())

  function anotarPactado() {
    if (!motivo.trim()) return
    updateReservation(r.id, {
      precioPactado: {
        motivo: motivo.trim(), ...(conQuien.trim() ? { con: conQuien.trim() } : {}),
        por: usuarioActual() ?? undefined, fecha: fechaPacto || today(),
      },
    })
    anotaVolcado({
      origen: 'precio-pactado', reservas: 1, year: Number(r.checkIn.slice(0, 4)),
      resumen: `${nombre} del ${formatDate(r.checkIn)} al ${formatDate(r.checkOut)}: precio pactado ${dec(r.total)} €`
        + (conQuien.trim() ? ` con ${conQuien.trim()}` : '') + `, el ${formatDate(fechaPacto || today())} — ${motivo.trim()}`,
    })
    setAnotando(false)
    setMotivo('')
    setConQuien('')
  }
  const { nombre, tarifa, visibles, suma, cobrado, diferencia, mesCorto } = cuadre

  /** «Precio pactado: 2.400,00 €, acordado el 08/01/2026 con Real Estate. Estancia larga.» */
  const lineaPactado = (() => {
    const p = cuadre.precio
    if (p.tipo !== 'pactado') return ''
    return `Precio pactado: ${dec(r.total)} €`
      + (p.pactado.fecha ? `, acordado el ${formatDate(p.pactado.fecha)}` : '')
      + (p.pactado.con ? ` con ${p.pactado.con}` : '')
      + (p.pactado.motivo ? `. ${p.pactado.motivo}` : '') + '.'
  })()

  /** «*Total: 89 noches, 2.400,00 €*», debajo de los meses. */
  const lineaTotales = `*Total: ${suma.noches} noches, ${dec(suma.alojamiento + suma.limpieza)} €*`

  /** La conformidad para WhatsApp, por líneas. */
  function conformidadComoWhatsApp() {
    return [
      `*Conformidad de la reserva — ${nombre}*`,
      `${formatDate(r.checkIn)} al ${formatDate(r.checkOut)} · ${r.nights} noches` + (r.guestName ? ` · ${r.guestName}` : ''),
      '',
      tarifa
        ? `Tarifa: ${dec(tarifa.precioTramo)} ÷ ${tarifa.diasTramo} días × ${r.nights} noches = ${dec(tarifa.base)} €`
        : `Precio base: ${dec(r.basePrice)} €`,
      `Limpieza: ${dec(r.cleaningFee || 0)} €`,
      `*Importe de la reserva: ${dec(r.total)} €*`,
      ...(lineaPactado ? [lineaPactado] : []),
      '',
      '*Por meses*',
      ...visibles.map(l => `• ${mesCorto(l.mes)}: ${l.noches} noches, ${dec(l.alojamiento + (l.limpieza || 0))} €`),
      lineaTotales,
      '',
      dialogo,
    ].join('\n')
  }

  /**
   * Lleva a Precios con la tarifa que se ha aplicado ya a la vista: el año de esa
   * tarifa y su fila marcada, o la oferta si fue una oferta.
   */
  function irATarifa() {
    if (!tarifa) return
    onClose()
    navigate(rutaDeTarifa(tarifa))
  }

  /**
   * La ficha para WhatsApp (Luis, 06/11/2026). Va por líneas y no en columnas
   * como el correo: en el móvil las columnas no caben y se descolocan.
   */
  function comoWhatsApp() {
    const lineas = visibles.map(l => {
      const partes = [`• ${mesCorto(l.mes)}: ${l.noches} noches, ${dec(l.alojamiento + (l.limpieza || 0))} €`]
      if (l.transferencia) partes.push(`transferencia ${dec(l.transferencia)} €`)
      if (l.efectivo) partes.push(`efectivo ${dec(l.efectivo)} €`)
      partes.push(`queda ${dec(l.resto)} €`)
      return partes.join(' · ')
    })
    return [
      `*Cuadre de la estancia — ${nombre}*`,
      `${formatDate(r.checkIn)} al ${formatDate(r.checkOut)} · ${r.nights} noches` + (r.guestName ? ` · ${r.guestName}` : ''),
      '',
      tarifa
        ? `Tarifa: ${dec(tarifa.precioTramo)} ÷ ${tarifa.diasTramo} días × ${r.nights} noches = ${dec(tarifa.base)} €`
        : `Precio base: ${dec(r.basePrice)} €`,
      `Limpieza: ${dec(r.cleaningFee || 0)} €`,
      `*Importe de la reserva: ${dec(r.total)} €*`,
      '',
      '*Por meses*',
      ...lineas,
      lineaTotales,
      '',
      `Cobrado: ${dec(cobrado)} €`,
      `*Diferencia: ${dec(diferencia)} €*`,
      '',
      diferencia === 0
        ? 'La estancia queda cuadrada. Rogamos confirmen su conformidad.'
        : diferencia < 0
          ? `Queda pendiente de cobro ${dec(-diferencia)} €. Rogamos confirmen su conformidad y la fecha de pago.`
          : `Se ha cobrado ${dec(diferencia)} € por encima del importe. Rogamos confirmen su conformidad.`,
    ].join('\n')
  }

  /** Abre WhatsApp (en el PC, WhatsApp Web o el programa) con la ficha escrita; se elige a quién mandarla. */
  function porWhatsApp() {
    const a = document.createElement('a')
    a.href = `https://wa.me/?text=${encodeURIComponent(conformidad ? conformidadComoWhatsApp() : comoWhatsApp())}`
    a.target = '_blank'
    a.rel = 'noopener'
    a.click()
    apuntaEnvio('WhatsApp')
  }

  /**
   * Queda en el Registro que se preparó el envío (Luis, 08/11/2026). «Preparado»
   * y no «enviado»: la aplicación abre el correo o el WhatsApp, pero no sabe si
   * al final se le dio a Enviar.
   */
  function apuntaEnvio(por: 'Correo' | 'WhatsApp') {
    anotaVolcado({
      origen: 'envio', year: Number(r.checkIn.slice(0, 4)),
      resumen: `${por} preparado: ${conformidad ? 'conformidad' : 'cuadre'} de ${nombre}, `
        + `del ${formatDate(r.checkIn)} al ${formatDate(r.checkOut)}`,
    })
  }

  const asunto = `${conformidad ? 'Conformidad de reserva' : 'Cuadre de estancia'} — ${nombre}, `
    + `${formatDate(r.checkIn)} al ${formatDate(r.checkOut)}`
  /**
   * El texto para el correo y para copiar: el mismo que va por WhatsApp, por
   * líneas y sin los asteriscos de la negrita de WhatsApp. En columnas no
   * sirve: en Outlook la letra no es de máquina y las columnas se descolocan.
   */
  const textoLlano = () => (conformidad ? conformidadComoWhatsApp() : comoWhatsApp()).replace(/\*/g, '')

  /**
   * Copia el cuadro **tal como se ve** —tablas incluidas— para pegarlo con
   * Ctrl+V en el correo (Luis, 08/11/2026: «yo quería que se copiara el cuadro
   * tal cual»). Lo mismo que sale al imprimir. Ver lib/copiarConFormato.ts.
   */
  const fichaRef = useRef<HTMLDivElement>(null)
  /** Ya está copiado: se dice en la ficha cómo pegarlo, hasta cerrarla. */
  const [copiado, setCopiado] = useState(false)
  async function copiarCuadro(paraCorreo = false): Promise<boolean> {
    if (!fichaRef.current) return false
    try {
      // Para el correo, solo con formato: ver copiarConFormato().
      await copiarConFormato(htmlConEstilos(fichaRef.current), paraCorreo ? null : `${asunto}\n\n${textoLlano()}`)
      setCopiado(true)
      return true
    } catch {
      window.alert('El navegador no ha dejado copiar el cuadro. Prueba otra vez.')
      return false
    }
  }

  /**
   * Copia el cuadro y abre Outlook en la web, en una pestaña nueva, con el
   * asunto puesto: falta el destinatario y pegar el cuadro con Ctrl+V. El enlace
   * solo puede llevar texto llano, por eso el cuadro va por el portapapeles; si
   * no se pudo copiar, el correo lleva el texto llano. Antes era un «mailto:»,
   * que abría el Outlook de escritorio sin cuenta configurada (08/11/2026).
   */
  async function porCorreo() {
    // Primero copiar: con el correo ya abierto, la pestaña de la app pierde el
    // foco y el navegador no deja escribir en el portapapeles.
    const conCuadro = await copiarCuadro(true)
    const a = document.createElement('a')
    // La dirección de su Outlook, no la general (outlook.office.com): con la
    // general pasaba por el inicio de sesión y se perdía el correo nuevo por el
    // camino. Comprobado con Luis el 08/11/2026.
    a.href = 'https://outlook.cloud.microsoft/mail/deeplink/compose'
      + `?subject=${encodeURIComponent(asunto)}`
      + (conCuadro ? '' : `&body=${encodeURIComponent(textoLlano())}`)
    a.target = '_blank'
    a.rel = 'noopener'
    a.click()
    apuntaEnvio('Correo')
  }

  return (
    <Modal title={`${conformidad ? 'Conformidad' : 'Cuadre'} · ${nombre}`} onClose={onClose} size="lg">
      {/* `solo-esto-al-imprimir`: al imprimir sale esta ficha sola, sin la
          pantalla de Cobros que tiene detrás (ver index.css). */}
      <div ref={fichaRef} className="space-y-4 solo-esto-al-imprimir" translate="no">
        {/* En pantalla el título va en la barra de la ventana; en papel, aquí. */}
        {/* Los dos modelos de la ficha: el cuadre de lo cobrado y la conformidad
            de la reserva para la agencia (Luis, 07/11/2026). */}
        <div className="flex gap-1 border-b border-slate-200 print:hidden" role="tablist">
          {([['cuadre', '🧾 Cuadre de cobros'], ['conformidad', '✅ Conformidad de la reserva']] as const).map(([m, texto]) => (
            <button key={m} type="button" role="tab" aria-selected={modelo === m} onClick={() => setModelo(m)}
              className={`px-3 py-2 text-sm font-medium rounded-t-lg border border-b-0 -mb-px ${modelo === m
                ? 'bg-white border-slate-200 text-blue-700'
                : 'bg-slate-50 border-transparent text-slate-500 hover:text-slate-700'}`}>
              {texto}
            </button>
          ))}
        </div>
        <h2 className="hidden print:!block text-lg font-bold text-slate-900">
          {conformidad ? 'Conformidad de la reserva' : 'Cuadre de la estancia'} — {nombre}{r.guestName ? ` · ${r.guestName}` : ''}
        </h2>
        <CuadroEstancia cuadre={cuadre} onTarifa={irATarifa} conformidad={conformidad} />

        {conformidad && (
          <div className="space-y-2">
            <div className="print:hidden">
              <label htmlFor="mensaje-conformidad" className="flex justify-between text-xs font-semibold text-slate-600 mb-1">
                <span>Mensaje para la agencia <span className="font-normal text-slate-400">· se queda guardado</span></span>
                {mensaje !== MENSAJE_CONFORMIDAD && (
                  <button type="button" onClick={() => setMensaje(MENSAJE_CONFORMIDAD)}
                    className="font-normal text-blue-700 hover:underline">Volver al texto de siempre</button>
                )}
              </label>
              <textarea id="mensaje-conformidad" value={mensaje} onChange={e => setMensaje(e.target.value)}
                rows={6} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
              <label htmlFor="notas-conformidad" className="block text-xs font-semibold text-slate-600 mt-2 mb-1">
                NOTAS <span className="font-normal text-slate-400">· solo para esta reserva, no se guarda</span>
              </label>
              <textarea id="notas-conformidad" value={notas} onChange={e => setNotas(e.target.value)}
                rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            {/* En papel: el mensaje, dos líneas en blanco y «NOTAS:». */}
            <div className="hidden print:!block border border-slate-300 rounded p-3 text-sm whitespace-pre-wrap">
              {dialogo}
            </div>
          </div>
        )}

        {/* Si el importe no sale de la tarifa y nadie dijo que fuera pactado, se
            decide aquí mismo: corregir la reserva o anotar por qué es así. */}
        {cuadre.precio.tipo === 'descuadre' && (
          <div className="rounded-lg border-2 border-amber-300 bg-amber-50 p-3 space-y-2 print:hidden">
            <p className="text-sm font-semibold text-amber-900">¿Qué pasa con este importe?</p>
            {!anotando ? (
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => { onClose(); navigate(`/reservas?edit=${r.id}`) }}
                  className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-white border border-amber-400 text-amber-900 hover:bg-amber-100">
                  <Pencil size={15} /> Está mal: abrir la reserva para corregirlo
                </button>
                <button type="button" onClick={() => setAnotando(true)}
                  className="px-3 py-2 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">
                  🔵 Es un precio pactado: anotar el motivo
                </button>
              </div>
            ) : (
              <form className="flex flex-wrap items-center gap-2"
                onSubmit={e => { e.preventDefault(); anotarPactado() }}>
                <label htmlFor="motivo-pactado" className="text-sm text-amber-900">Motivo:</label>
                <input id="motivo-pactado" autoFocus value={motivo} onChange={e => setMotivo(e.target.value)}
                  placeholder="Estancia larga, acordado con el cliente"
                  className="flex-1 min-w-[16rem] border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
                <label htmlFor="con-pactado" className="text-sm text-amber-900">Con quién:</label>
                <input id="con-pactado" value={conQuien} onChange={e => setConQuien(e.target.value)}
                  placeholder="Real Estate, el cliente…"
                  className="w-48 border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
                <label htmlFor="fecha-pactado" className="text-sm text-amber-900">Fecha:</label>
                <input id="fecha-pactado" type="date" value={fechaPacto} onChange={e => setFechaPacto(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white" />
                <button type="submit" disabled={!motivo.trim()}
                  className="px-4 py-2 text-sm font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40">
                  Guardar
                </button>
                <button type="button" onClick={() => { setAnotando(false); setMotivo('') }}
                  className="px-3 py-2 text-sm text-slate-600 hover:bg-white rounded-lg">
                  Cancelar
                </button>
              </form>
            )}
          </div>
        )}

        {/* Anulada con dinero cobrado: avisa en el Dashboard hasta que se dice
            aquí que está resuelto (Luis, 08/11/2026). Ver lib/anuladas.ts. */}
        {r.status === 'cancelada' && (() => {
          const cobradoAqui = cobradoDeReserva(r.id, payments)
          if (r.anulacionResuelta) {
            return (
              <p className="text-xs text-slate-500 print:hidden">
                Reserva anulada. El dinero cobrado se dio por resuelto
                {r.anulacionResuelta.por ? ` por ${r.anulacionResuelta.por}` : ''} el {formatDate(r.anulacionResuelta.fecha)}.
              </p>
            )
          }
          if (cobradoAqui <= 0.005) return null
          return (
            <div className="rounded-lg border-2 border-red-300 bg-red-50 p-3 space-y-2 print:hidden">
              <p className="text-sm font-semibold text-red-900">
                Reserva anulada con {dec(cobradoAqui)} € cobrados
              </p>
              <p className="text-sm text-red-800">
                Hay que devolverlos o pasarlos a otra reserva. Cuando esté hecho, márcalo y el aviso del Dashboard se quita.
              </p>
              <button type="button"
                onClick={() => {
                  updateReservation(r.id, { anulacionResuelta: { por: usuarioActual() ?? undefined, fecha: today() } })
                  anotaVolcado({
                    origen: 'anulacion-resuelta', year: Number(r.checkIn.slice(0, 4)),
                    resumen: `${nombre} del ${formatDate(r.checkIn)} al ${formatDate(r.checkOut)} (anulada): `
                      + `${dec(cobradoAqui)} € cobrados dados por resueltos`,
                  })
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm font-medium rounded-lg bg-red-600 text-white hover:bg-red-700">
                <Check size={15} /> Ya está resuelto
              </button>
            </div>
          )
        })()}

        {/* Solo en el papel: el pie del recibo que se manda a la agencia. */}
        <p className="hidden print:!block text-xs text-slate-500 border-t border-slate-200 pt-2">
          {conformidad
            ? <>Conformidad de reserva emitida el {formatDate(today())}.</>
            : <>Documento de cuadre emitido el {formatDate(today())} por la aplicación de gestión. Rogamos confirmen su conformidad.</>}
        </p>

        {copiado && (
          <p className="flex items-center gap-2 rounded-lg border border-green-300 bg-green-50 px-3 py-2 text-sm text-green-900 print:hidden">
            <Check size={16} className="text-green-600 shrink-0" />
            <span><b>Cuadro copiado.</b> En el correo, haz clic <b>en el cuerpo, debajo del asunto</b> (no en «Para») y pulsa <b>Ctrl+V</b>.</span>
          </p>
        )}

        <div className="flex flex-wrap justify-end gap-2 pt-1 print:hidden">
          <button onClick={() => { onClose(); navigate(`/reservas?edit=${r.id}`) }}
            className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            <Pencil size={15} /> Abrir la reserva
          </button>
          {onVerCobros && (
            <button onClick={() => { onClose(); onVerCobros(r.apartmentId, Number(r.checkIn.slice(0, 4))) }}
              title="Ver en la tabla todos los cobros de este apartamento en ese año"
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
              <ListFilter size={15} /> Todos los cobros del {r.apartmentId} en {r.checkIn.slice(0, 4)}
            </button>
          )}
          <button onClick={porCorreo}
            title="Copia el cuadro y abre Outlook con el asunto puesto: pega el cuadro con Ctrl+V y pon a quién"
            className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:border-blue-300">
            <Mail size={15} /> Enviar por correo
          </button>
          <button onClick={() => { void copiarCuadro() }}
            title="Copia el cuadro tal como se ve, para pegarlo con Ctrl+V en cualquier correo o documento"
            className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:border-blue-300">
            <Copy size={15} /> Copiar el cuadro
          </button>
          <button onClick={porWhatsApp}
            title="Abre WhatsApp con la ficha escrita; ahí eliges a quién mandarla"
            className="flex items-center gap-2 px-3 py-2 text-sm border border-green-300 text-green-800 rounded-lg hover:bg-green-50">
            <MessageCircle size={15} /> WhatsApp
          </button>
          <button onClick={() => window.print()}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            <Printer size={15} /> Imprimir / PDF
          </button>
        </div>
      </div>
    </Modal>
  )
}
