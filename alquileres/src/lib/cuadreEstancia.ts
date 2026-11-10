import { useMemo } from 'react'
import { mesContable } from './mesContable'
import { useData } from '../contexts/DataContext'
import { buscaTarifa } from './priceCalc'
import { partesDeAlojamiento, nochesEnMes } from './devengo'
import { MONTH_NAMES_ES } from './dateUtils'
import { estadoPrecio } from './precioReserva'
import type { Payment, Reservation } from '../types'

/**
 * Las cuentas del cuadre de una estancia: de dónde sale su importe y cómo se ha
 * ido cobrando, mes a mes. Las usan la ficha que se abre al pinchar y el recuadro
 * que sale al pasar el ratón, para que las dos digan siempre lo mismo.
 *
 * No calcula nada nuevo: la tarifa sale de `buscaTarifa()` y el reparto por
 * meses de `lib/devengo.ts`, los mismos que usan Cobros y Reservas. Si una
 * cifra de aquí no cuadra con la tabla, es que no cuadra en la aplicación.
 */

/** Un cobro en efectivo: lo que diga su forma de pago; los viejos, por canal. */
const esEfectivo = (p: Payment, canalDirecto: boolean) =>
  p.paymentMethod ? p.paymentMethod === 'efectivo' : canalDirecto

export interface LineaMes {
  mes: string
  noches: number
  alojamiento: number
  limpieza: number
  transferencia: number
  efectivo: number
  /** Lo que queda por cobrar de la estancia después de este mes. */
  resto: number
}

export function useCuadreEstancia(r: Reservation) {
  const { apartments, payments, prices, offerPrices } = useData()
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
   * Los meses son los de la estancia y además cualquiera en el que caiga un
   * cobro (solo pasa con el mes contable de un cobro del Excel): un cobro
   * pagado después de la salida cuenta en el último mes de la estancia
   * (lib/mesContable.ts).
   */
  const lineas = useMemo((): LineaMes[] => {
    const partes = partesDeAlojamiento(r)
    const meses = new Set<string>([...partes.keys()])
    for (const p of cobros) {
      const mes = mesContable(p, r)
      if (mes) meses.add(mes)
    }
    const directo = r.channel === 'directo'
    const mesEntrada = r.checkIn.slice(0, 7)
    const salida: LineaMes[] = []
    let cobradoAcum = 0
    for (const mes of [...meses].sort()) {
      const delMes = cobros.filter(p => mesContable(p, r) === mes)
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

  /** Si el importe sale de la tarifa, es un precio pactado o no cuadra. */
  const precio = useMemo(() => estadoPrecio(r, prices, offerPrices), [r, prices, offerPrices])

  return { reserva: r, nombre, tarifa, visibles, suma, cobrado, diferencia, mesCorto, precio }
}

export type CuadreEstancia = ReturnType<typeof useCuadreEstancia>

/**
 * Dónde se ve en Precios la tarifa que se aplicó: el año de esa tarifa con su
 * fila y su tramo marcados, o la oferta si fue una oferta (Luis, 06/11/2026).
 */
export function rutaDeTarifa(tarifa: NonNullable<CuadreEstancia['tarifa']>): string {
  return tarifa.oferta
    ? `/precios?oferta=${encodeURIComponent(tarifa.oferta.id)}`
    : `/precios?anio=${tarifa.entry.year}&tarifa=${encodeURIComponent(tarifa.entry.id)}&tramo=${tarifa.tramo}`
}
