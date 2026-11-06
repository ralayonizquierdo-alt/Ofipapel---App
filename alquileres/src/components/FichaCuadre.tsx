import { useState } from 'react'
import { Printer, Mail, Pencil, ListFilter } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { useCuadreEstancia, rutaDeTarifa } from '../lib/cuadreEstancia'
import { usuarioActual } from '../lib/auth'
import { formatDate, today } from '../lib/dateUtils'
import { num } from '../lib/formato'
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

export default function FichaCuadre({ reserva, onClose, onVerCobros }: {
  reserva: Reservation
  onClose: () => void
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
  const { reservations, updateReservation } = useData()
  // La reserva tal como está ahora en la base: si se marca como pactada desde
  // aquí, la ficha lo enseña al momento.
  const r = reservations.find(x => x.id === reserva.id) ?? reserva
  const cuadre = useCuadreEstancia(r)
  const [anotando, setAnotando] = useState(false)
  const [motivo, setMotivo] = useState('')

  function anotarPactado() {
    if (!motivo.trim()) return
    updateReservation(r.id, {
      precioPactado: { motivo: motivo.trim(), por: usuarioActual() ?? undefined, fecha: today() },
    })
    setAnotando(false)
    setMotivo('')
  }
  const { nombre, tarifa, visibles, suma, cobrado, diferencia, mesCorto } = cuadre

  /** La ficha en texto llano, para el correo a la agencia. */
  function comoTexto() {
    const sep = '-'.repeat(58)
    const filas = visibles.map(l =>
      `${mesCorto(l.mes).padEnd(12)}${String(l.noches).padStart(4)}  `
      + `${dec(l.alojamiento).padStart(10)}  ${(l.limpieza ? dec(l.limpieza) : '').padStart(8)}  `
      + `${(l.transferencia ? dec(l.transferencia) : '').padStart(11)}  `
      + `${(l.efectivo ? dec(l.efectivo) : '').padStart(9)}  ${dec(l.resto).padStart(10)}`)
    return [
      `CUADRE DE LA ESTANCIA — ${nombre}`,
      `${formatDate(r.checkIn)} al ${formatDate(r.checkOut)} · ${r.nights} noches`
        + (r.guestName ? ` · ${r.guestName}` : ''),
      '',
      tarifa
        ? `Operativa: ${dec(tarifa.precioTramo)} / ${tarifa.diasTramo} = `
          + `${dec(tarifa.precioTramo / tarifa.diasTramo)} x ${r.nights} noches = ${dec(tarifa.base)}`
        : `Precio pactado: ${dec(r.basePrice)}`,
      `Cargos (limpieza): ${dec(r.cleaningFee || 0)}`,
      `IMPORTE NETO DE LA RESERVA: ${dec(r.total)}`,
      '',
      sep,
      `${'Mes'.padEnd(12)}${'Noch'.padStart(4)}  ${'Alojam.'.padStart(10)}  ${'Limp.'.padStart(8)}  `
        + `${'Transfer.'.padStart(11)}  ${'Efectivo'.padStart(9)}  ${'Resto'.padStart(10)}`,
      sep,
      ...filas,
      sep,
      `${'TOTALES'.padEnd(12)}${String(suma.noches).padStart(4)}  ${dec(suma.alojamiento).padStart(10)}  `
        + `${dec(suma.limpieza).padStart(8)}  ${dec(suma.transferencia).padStart(11)}  `
        + `${dec(suma.efectivo).padStart(9)}`,
      '',
      `Importe de la reserva: ${dec(r.total)}`,
      `Cobrado:               ${dec(cobrado)}`,
      `Diferencia:            ${dec(diferencia)}`,
      '',
      diferencia === 0
        ? 'La estancia queda cuadrada. Rogamos confirmen su conformidad respondiendo a este correo.'
        : diferencia < 0
          ? `Queda pendiente de cobro ${dec(-diferencia)} €. Rogamos confirmen su conformidad y la fecha de pago.`
          : `Se ha cobrado ${dec(diferencia)} € por encima del importe. Rogamos confirmen su conformidad.`,
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

  function porCorreo() {
    const asunto = `Cuadre de estancia — ${nombre}, ${formatDate(r.checkIn)} al ${formatDate(r.checkOut)}`
    // Con un enlace, no tocando `window.location`: es el mismo apaño que usa
    // el registro para descargar el CSV y no se pelea con el compilador.
    const a = document.createElement('a')
    a.href = `mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(comoTexto())}`
    a.click()
  }

  return (
    <Modal title={`Cuadre · ${nombre}`} onClose={onClose} size="lg">
      {/* `solo-esto-al-imprimir`: al imprimir sale esta ficha sola, sin la
          pantalla de Cobros que tiene detrás (ver index.css). */}
      <div className="space-y-4 solo-esto-al-imprimir" translate="no">
        <CuadroEstancia cuadre={cuadre} onTarifa={irATarifa} />

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

        {/* Solo en el papel: el pie del recibo que se manda a la agencia. */}
        <p className="hidden print:!block text-xs text-slate-500 border-t border-slate-200 pt-2">
          Documento de cuadre emitido el {formatDate(new Date().toISOString().slice(0, 10))} por la
          aplicación de gestión. Rogamos confirmen su conformidad.
        </p>

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
            title="Abre tu programa de correo con el cuadre escrito, para mandárselo a la agencia"
            className="flex items-center gap-2 px-3 py-2 text-sm border border-slate-200 rounded-lg hover:border-blue-300">
            <Mail size={15} /> Enviar a la agencia
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
