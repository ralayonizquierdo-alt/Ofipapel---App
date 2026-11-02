import { useMemo } from 'react'
import { Printer, Mail, Pencil } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import { buscaTarifa, TRAMO_LABEL } from '../lib/priceCalc'
import { partesDeAlojamiento, nochesEnMes } from '../lib/devengo'
import { getSeason, formatDate, MONTH_NAMES_ES } from '../lib/dateUtils'
import { num } from '../lib/formato'
import Modal from './ui/Modal'
import type { Payment, Reservation } from '../types'

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
 * No calcula nada nuevo: la tarifa sale de `buscaTarifa()` y el reparto por
 * meses de `lib/devengo.ts`, los mismos que usan Cobros y Reservas. Si una
 * cifra de aquí no cuadra con la tabla, es que no cuadra en la aplicación.
 */

const eur = (n: number) => `${num(n, 2)} €`
const dec = (n: number) => num(n, 2)

/** Un cobro en efectivo: lo que diga su forma de pago; los viejos, por canal. */
const esEfectivo = (p: Payment, canalDirecto: boolean) =>
  p.paymentMethod ? p.paymentMethod === 'efectivo' : canalDirecto

interface LineaMes {
  mes: string
  noches: number
  alojamiento: number
  limpieza: number
  transferencia: number
  efectivo: number
  /** Lo que queda por cobrar de la estancia después de este mes. */
  resto: number
}

export default function FichaCuadre({ reserva, onClose }: { reserva: Reservation; onClose: () => void }) {
  const { apartments, payments, prices, offerPrices } = useData()
  const navigate = useNavigate()
  const r = reserva
  const nombre = apartments.find(a => a.id === r.apartmentId)?.name ?? r.apartmentId

  const tarifa = useMemo(
    () => buscaTarifa(prices, r.apartmentId, r.checkIn, r.nights, offerPrices),
    [prices, offerPrices, r.apartmentId, r.checkIn, r.nights],
  )

  const cobros = useMemo(
    () => payments.filter(p => p.reservationId === r.id && p.received),
    [payments, r.id],
  )

  /**
   * El cuadro mes a mes: las noches y el alojamiento que devenga cada mes, y
   * lo cobrado en él por su mes contable.
   *
   * Los meses son los de la estancia y además cualquiera en el que haya un
   * cobro: un prepago de noviembre de una estancia de enero tiene que verse.
   */
  const lineas = useMemo((): LineaMes[] => {
    const partes = partesDeAlojamiento(r)
    const meses = new Set<string>([...partes.keys()])
    for (const p of cobros) {
      const mes = p.mes ?? p.paymentDate?.slice(0, 7)
      if (mes) meses.add(mes)
    }
    const directo = r.channel === 'directo'
    const mesEntrada = r.checkIn.slice(0, 7)
    const salida: LineaMes[] = []
    let cobradoAcum = 0
    for (const mes of [...meses].sort()) {
      const delMes = cobros.filter(p => (p.mes ?? p.paymentDate?.slice(0, 7)) === mes)
      const transferencia = delMes.filter(p => !esEfectivo(p, directo)).reduce((s, p) => s + p.amount, 0)
      const efectivo = delMes.filter(p => esEfectivo(p, directo)).reduce((s, p) => s + p.amount, 0)
      cobradoAcum = Math.round((cobradoAcum + transferencia + efectivo) * 100) / 100
      salida.push({
        mes,
        noches: nochesEnMes(r, mes),
        alojamiento: partes.get(mes) ?? 0,
        // La limpieza no se parte: se cobra una vez, en el mes de entrada.
        limpieza: mes === mesEntrada ? (Number(r.cleaningFee) || 0) : 0,
        transferencia,
        efectivo,
        resto: Math.round((r.total - cobradoAcum) * 100) / 100,
      })
    }
    return salida
  }, [r, cobros])

  /** Sin cobros repartidos: se quitan las líneas que no traen ningún importe. */
  const visibles = lineas.filter(l => l.alojamiento || l.limpieza || l.transferencia || l.efectivo)

  const suma = visibles.reduce((a, l) => ({
    noches: a.noches + l.noches,
    alojamiento: Math.round((a.alojamiento + l.alojamiento) * 100) / 100,
    limpieza: Math.round((a.limpieza + l.limpieza) * 100) / 100,
    transferencia: Math.round((a.transferencia + l.transferencia) * 100) / 100,
    efectivo: Math.round((a.efectivo + l.efectivo) * 100) / 100,
  }), { noches: 0, alojamiento: 0, limpieza: 0, transferencia: 0, efectivo: 0 })

  const cobrado = Math.round((suma.transferencia + suma.efectivo) * 100) / 100
  /** La diferencia: en negativo lo que falta por cobrar, en positivo lo cobrado de más. */
  const diferencia = Math.round((cobrado - r.total) * 100) / 100

  const mesCorto = (mm: string) => {
    const m = MONTH_NAMES_ES[Number(mm.slice(5, 7)) - 1]
    return `${m}${mm.slice(0, 4) !== r.checkIn.slice(0, 4) ? ` ${mm.slice(2, 4)}` : ''}`
  }

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

  function porCorreo() {
    const asunto = `Cuadre de estancia — ${nombre}, ${formatDate(r.checkIn)} al ${formatDate(r.checkOut)}`
    // Con un enlace, no tocando `window.location`: es el mismo apaño que usa
    // el registro para descargar el CSV y no se pelea con el compilador.
    const a = document.createElement('a')
    a.href = `mailto:?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(comoTexto())}`
    a.click()
  }

  const celda = 'py-1.5 px-2 border border-slate-300'

  return (
    <Modal title={`Cuadre · ${nombre}`} onClose={onClose} size="lg">
      {/* `solo-esto-al-imprimir`: al imprimir sale esta ficha sola, sin la
          pantalla de Cobros que tiene detrás (ver index.css). */}
      <div className="space-y-4 solo-esto-al-imprimir" translate="no">
        {/* ── Cabecera: la reserva de un vistazo ── */}
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="bg-slate-100 text-slate-600">
              <th className={`${celda} text-left font-medium`}>Apto.</th>
              <th className={`${celda} text-left font-medium`}>Reserva</th>
              <th className={`${celda} text-right font-medium`}>Noches</th>
              <th className={`${celda} text-right font-medium`}>Tarifa</th>
              <th className={`${celda} text-right font-medium`}>Cargos</th>
              <th className={`${celda} text-left font-medium`}>Temporada</th>
            </tr>
          </thead>
          <tbody>
            <tr className="font-medium text-slate-800">
              <td className={celda}>{r.apartmentId}</td>
              <td className={celda}>{formatDate(r.checkIn)} al {formatDate(r.checkOut)}</td>
              <td className={`${celda} text-right`}>{r.nights}</td>
              <td className={`${celda} text-right`}>{tarifa ? dec(tarifa.precioTramo) : '—'}</td>
              <td className={`${celda} text-right`}>{dec(r.cleaningFee || 0)}</td>
              <td className={celda}>{getSeason(r.checkIn) === 'VERANO' ? 'Verano' : 'Invierno'}</td>
            </tr>
          </tbody>
        </table>

        {/* ── La operativa: de dónde sale el importe ── */}
        <div className="border border-slate-300 rounded">
          <p className="bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-700">
            Operativa del importe
          </p>
          <div className="p-3 text-sm tabular-nums space-y-1">
            {tarifa ? (
              <p className="text-slate-700">
                Tarifa de {TRAMO_LABEL[tarifa.tramo]} <b>{dec(tarifa.precioTramo)}</b> ÷ {tarifa.diasTramo} días
                = <b>{dec(tarifa.precioTramo / tarifa.diasTramo)}</b> por noche × {r.nights} noches
                = <b>{dec(tarifa.base)}</b>
                {tarifa.oferta && (
                  <span className="ml-2 text-violet-700">🏷️ tarifa de oferta «{tarifa.oferta.label}»</span>
                )}
              </p>
            ) : (
              <p className="text-slate-700">Precio pactado a mano: <b>{dec(r.basePrice)}</b></p>
            )}
            {!!r.discountPct && (
              <p className="text-slate-700">Descuento del {r.discountPct} %</p>
            )}
            <p className="text-slate-700">Cargos (limpieza): <b>{dec(r.cleaningFee || 0)}</b></p>
            <p className="flex justify-between border-t border-slate-200 pt-1.5 mt-1.5 font-bold text-slate-900">
              <span>IMPORTE NETO DE LA RESERVA</span><span>{eur(r.total)}</span>
            </p>
          </div>
        </div>

        {/* ── El desglose por meses y sus cobros ── */}
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="bg-slate-100 text-slate-600">
              <th className={`${celda} text-left font-medium`} colSpan={4}>
                Importes de la reserva (desglose por mes)
              </th>
              <th className={`${celda} text-center font-medium`} colSpan={2}>Cobros</th>
              <th className={`${celda} text-right font-medium`}>Resto</th>
            </tr>
            <tr className="bg-slate-50 text-slate-500">
              <th className={`${celda} text-left font-medium`}>Mes</th>
              <th className={`${celda} text-right font-medium`}>Noches</th>
              <th className={`${celda} text-right font-medium`}>Alojamiento</th>
              <th className={`${celda} text-right font-medium`}>Limpieza</th>
              <th className={`${celda} text-right font-medium text-blue-700`}>Transferencia</th>
              <th className={`${celda} text-right font-medium text-red-600`}>Efectivo</th>
              <th className={`${celda} text-right font-medium`}>pendiente</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map(l => (
              <tr key={l.mes} className="text-slate-700">
                <td className={`${celda} capitalize`}>{mesCorto(l.mes)}</td>
                <td className={`${celda} text-right`}>{l.noches || ''}</td>
                <td className={`${celda} text-right`}>{l.alojamiento ? dec(l.alojamiento) : ''}</td>
                <td className={`${celda} text-right`}>{l.limpieza ? dec(l.limpieza) : ''}</td>
                <td className={`${celda} text-right text-blue-700`}>{l.transferencia ? dec(l.transferencia) : ''}</td>
                <td className={`${celda} text-right text-red-600`}>{l.efectivo ? dec(l.efectivo) : ''}</td>
                <td className={`${celda} text-right ${l.resto > 0.005 ? 'text-slate-700' : 'text-green-700'}`}>
                  {dec(l.resto)}
                </td>
              </tr>
            ))}
            <tr className="bg-slate-50 font-bold text-slate-800">
              <td className={celda}>Totales</td>
              <td className={`${celda} text-right`}>{suma.noches}</td>
              <td className={`${celda} text-right`}>{dec(suma.alojamiento)}</td>
              <td className={`${celda} text-right`}>{dec(suma.limpieza)}</td>
              <td className={`${celda} text-right text-blue-700`}>{dec(suma.transferencia)}</td>
              <td className={`${celda} text-right text-red-600`}>{dec(suma.efectivo)}</td>
              <td className={celda} />
            </tr>
          </tbody>
        </table>

        {/* ── El cuadre ── */}
        <table className="w-full text-sm tabular-nums">
          <tbody>
            <tr className="text-slate-700">
              <td className={celda}>Importe de la reserva</td>
              <td className={`${celda} text-right font-medium`}>{eur(r.total)}</td>
            </tr>
            <tr className="text-slate-700">
              <td className={celda}>Cobrado</td>
              <td className={`${celda} text-right font-medium`}>{eur(cobrado)}</td>
            </tr>
            <tr className={`font-bold ${
              Math.abs(diferencia) < 0.005 ? 'text-green-700'
                : diferencia < 0 ? 'text-red-600' : 'text-purple-700'}`}>
              <td className={celda}>
                Diferencia{' '}
                <span className="ml-2 font-normal text-slate-500">
                  {Math.abs(diferencia) < 0.005 ? 'la estancia queda cuadrada'
                    : diferencia < 0 ? 'falta por cobrar' : 'cobrado de más'}
                </span>
              </td>
              <td className={`${celda} text-right`}>{eur(diferencia)}</td>
            </tr>
          </tbody>
        </table>

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
