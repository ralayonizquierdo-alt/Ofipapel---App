import { TRAMO_LABEL, calcPrices } from '../lib/priceCalc'
import { getSeason, formatDate, addDays, today } from '../lib/dateUtils'
import { num } from '../lib/formato'
import type { CuadreEstancia } from '../lib/cuadreEstancia'
import { textoDiferencia } from '../lib/precioReserva'

const eur = (n: number) => `${num(n, 2)} €`
const dec = (n: number) => num(n, 2)
/** Días desde la entrada en los que la agencia suele mandar el cobro. */
const DIAS_PAGO_AGENCIA = 5

/**
 * La línea que dice de dónde sale el importe: de la tarifa, de un precio
 * pactado (con su motivo) o de ninguno de los dos (Luis, 06/11/2026: «yo sé lo
 * que hay, tiene que decírmelo la aplicación»). Ver `lib/precioReserva.ts`.
 */
function EstadoDelPrecio({ cuadre, compacto }: { cuadre: CuadreEstancia; compacto: boolean }) {
  const p = cuadre.precio
  // Es para nosotros, no para la agencia: no sale al imprimir ni al copiar el
  // cuadro para el correo (ni el aviso de tarifa ni el motivo de un pactado).
  const caja = `rounded border px-2 print:hidden ${compacto ? 'py-0.5 mt-1' : 'py-1.5 mt-2'}`
  if (p.tipo === 'tarifa') {
    return <p className={`${caja} border-green-300 bg-green-50 text-green-800`}>✅ El importe sale de la tarifa.</p>
  }
  if (p.tipo === 'pactado') {
    const quien = [p.pactado.por, p.pactado.con ? `con ${p.pactado.con}` : '', p.pactado.fecha ? formatDate(p.pactado.fecha) : '']
      .filter(Boolean).join(', ')
    return (
      <p className={`${caja} border-blue-300 bg-blue-50 text-blue-900`}>
        🔵 <b>Precio pactado</b>: «{p.pactado.motivo}»{quien ? ` (${quien})` : ''}.
        {p.esperado !== null && p.diferencia !== null && Math.abs(p.diferencia) >= 1 && (
          <> Por tarifa serían {eur(p.esperado)}: {textoDiferencia(p.diferencia, eur)}.</>
        )}
      </p>
    )
  }
  if (p.tipo === 'descuadre') {
    return (
      <p className={`${caja} border-amber-400 bg-amber-50 text-amber-900`}>
        ⚠️ <b>El importe no sale de la tarifa</b>: por tarifa serían {eur(p.esperado)}, {textoDiferencia(p.diferencia, eur)}.
        No consta como precio pactado.
      </p>
    )
  }
  if (p.tipo === 'sin-tarifa') {
    return <p className={`${caja} border-slate-300 bg-slate-50 text-slate-600`}>No se puede comprobar: no hay tarifa para estas fechas.</p>
  }
  return <p className={`${caja} border-slate-300 bg-slate-50 text-slate-600`}>No se compara con la tarifa. {p.motivo}</p>
}

/**
 * En la conformidad que se manda a la agencia, del precio solo se dice si fue
 * pactado: qué importe, cuándo y con quién (Luis, 07/11/2026). Lo de si cuadra
 * con la tarifa es cosa nuestra y no sale.
 */
function PactadoParaLaAgencia({ cuadre }: { cuadre: CuadreEstancia }) {
  const p = cuadre.precio
  if (p.tipo !== 'pactado') return null
  const { motivo, fecha, con } = p.pactado
  return (
    <p className="rounded border border-blue-300 bg-blue-50 text-blue-900 px-2 py-1.5 mt-2 print:bg-transparent">
      <b>Precio pactado: {eur(cuadre.reserva.total)}</b>
      {fecha && <>, acordado el {formatDate(fecha)}</>}
      {con && <> con {con}</>}
      {motivo && <>. {motivo}</>}.
    </p>
  )
}

/**
 * El cuadro de una estancia, con el formato de la hoja de Excel del propietario:
 * la reserva, la operativa del importe, el desglose por meses con sus cobros y
 * la diferencia. `compacto` es para el recuadro que sale al pasar el ratón, que
 * tiene que caber en pantalla sin desplazarse.
 */
export default function CuadroEstancia({ cuadre, compacto = false, onTarifa, conformidad = false, conWeb = false }: {
  cuadre: CuadreEstancia
  compacto?: boolean
  /** Con esto la tarifa se puede pinchar para ir a verla en Precios (Luis, 06/11/2026). */
  onTarifa?: () => void
  /**
   * La «conformidad» que se manda a la agencia cuando envía una reserva, para
   * corroborar precio y noches (Luis, 07/11/2026): el mismo cuadro sin cobros,
   * sin resto, sin lo cobrado ni la diferencia, y sin la comparación con la
   * tarifa. Del precio, solo si fue pactado.
   */
  conformidad?: boolean
  /**
   * La columna «Web (publicar)» (Luis, 13/11/2026): el precio con el que se
   * publica ese tramo, de orientación para él y para la agencia. Sale de la
   * misma cuenta que Precios (`calcPrices`): base + las dos comisiones del 15 %.
   * Se pone o se quita con la casilla de la ficha.
   */
  conWeb?: boolean
}) {
  const { reserva: r, tarifa, visibles, suma, cobrado, diferencia, mesCorto } = cuadre
  /**
   * La agencia suele pagar a los DIAS_PAGO_AGENCIA días de la entrada (Luis,
   * 13/11/2026): hasta entonces lo que falta es «pendiente de cobro», no un
   * descubierto, y no va en rojo.
   */
  const plazoCobro = addDays(r.checkIn, DIAS_PAGO_AGENCIA)
  const aunEnPlazo = today() <= plazoCobro
  const celda = `${compacto ? 'py-0.5 px-1.5' : 'py-1.5 px-2'} border border-slate-300`

  return (
    <>
      {/* ── Cabecera: la reserva de un vistazo ── */}
      <table className="cabecera-reserva w-full text-xs tabular-nums">
        <thead>
          <tr className="bg-slate-100 text-slate-600">
            <th className={`${celda} text-left font-medium`}>Apto.</th>
            <th className={`${celda} text-left font-medium`}>Reserva</th>
            <th className={`${celda} text-right font-medium`}>Noches</th>
            <th className={`${celda} text-right font-medium`}>Tarifa</th>
            <th className={`${celda} text-right font-medium`}>Cargos</th>
            <th className={`${celda} text-left font-medium`}>Temporada</th>
            {conWeb && tarifa && (
              <th className={`${celda} text-right font-medium text-green-700 bg-green-50`}>Web (publicar)</th>
            )}
          </tr>
        </thead>
        <tbody>
          <tr className="font-medium text-slate-800">
            <td className={celda}>{r.apartmentId}</td>
            <td className={celda}>{formatDate(r.checkIn)} al {formatDate(r.checkOut)}</td>
            <td className={`${celda} text-right`}>{r.nights}</td>
            {/* Toda la casilla lleva a Precios, no solo la cifra: pinchando un poco
                al lado de los números se abría la ficha (Luis, 06/11/2026). */}
            {tarifa && onTarifa ? (
              <td role="link" tabIndex={0} title="Ver esta tarifa en Precios"
                onClick={e => { e.stopPropagation(); onTarifa() }}
                onKeyDown={e => { if (e.key === 'Enter') { e.stopPropagation(); onTarifa() } }}
                className={`${celda} text-right cursor-pointer bg-blue-50 hover:bg-blue-100 font-medium text-blue-700 underline print:bg-transparent print:no-underline print:text-inherit`}>
                {dec(tarifa.precioTramo)}
              </td>
            ) : (
              <td className={`${celda} text-right`}>{tarifa ? dec(tarifa.precioTramo) : '—'}</td>
            )}
            <td className={`${celda} text-right`}>{dec(r.cleaningFee || 0)}</td>
            <td className={celda}>{getSeason(r.checkIn) === 'VERANO' ? 'Verano' : 'Invierno'}</td>
            {conWeb && tarifa && (
              <td className={`${celda} text-right font-bold text-green-700 bg-green-50`}>
                {dec(calcPrices(tarifa.precioTramo).webPrice)}
              </td>
            )}
          </tr>
        </tbody>
      </table>

      {/* ── La operativa: de dónde sale el importe ── */}
      <div className="border border-slate-300 rounded">
        <p className={`bg-slate-100 text-xs font-semibold text-slate-700 ${compacto ? 'px-2 py-0.5' : 'px-3 py-1.5'}`}>
          Operativa del importe
        </p>
        <div className={`tabular-nums ${compacto ? 'px-2 py-1 text-xs space-y-0.5' : 'p-3 text-sm space-y-1'}`}>
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
            // Antes ponía «Precio pactado a mano» siempre que no hubiera tarifa,
            // aunque nadie lo hubiera pactado: ahora lo dice la línea de abajo.
            <p className="text-slate-700">No hay tarifa en Precios para estas fechas. Precio base de la reserva: <b>{dec(r.basePrice)}</b></p>
          )}
          {!!r.discountPct && (
            <p className="text-slate-700">Descuento del {r.discountPct} %</p>
          )}
          <p className="text-slate-700">Cargos (limpieza): <b>{dec(r.cleaningFee || 0)}</b></p>
          <p className={`flex justify-between border-t border-slate-200 font-bold text-slate-900 ${compacto ? 'pt-0.5 mt-0.5' : 'pt-1.5 mt-1.5'}`}>
            {/* Bruto: lo que paga el cliente, antes de la comisión de la agencia,
                que va aparte como gasto (Luis, 08/11/2026). El Arenal es la
                excepción: se apunta lo que llega de SOC, ya descontado. */}
            <span>{r.apartmentId === 'AP2B' ? 'IMPORTE NETO DE LA RESERVA (lo que paga SOC)' : 'IMPORTE BRUTO DE LA RESERVA'}</span>
            <span>{eur(r.total)}</span>
          </p>
          {conformidad
            ? <PactadoParaLaAgencia cuadre={cuadre} />
            : <EstadoDelPrecio cuadre={cuadre} compacto={compacto} />}
        </div>
      </div>

      {/* ── Conformidad: el desglose por meses, sin cobros ── */}
      {conformidad && (
        <table className="w-full text-xs tabular-nums">
          <thead>
            <tr className="bg-slate-100 text-slate-600">
              <th className={`${celda} text-left font-medium`} colSpan={5}>
                Importes de la reserva (desglose por mes)
              </th>
            </tr>
            <tr className="bg-slate-50 text-slate-500">
              <th className={`${celda} text-left font-medium`}>Mes</th>
              <th className={`${celda} text-right font-medium`}>Noches</th>
              <th className={`${celda} text-right font-medium`}>Alojamiento</th>
              <th className={`${celda} text-right font-medium`}>Limpieza</th>
              <th className={`${celda} text-right font-medium`}>Total del mes</th>
            </tr>
          </thead>
          <tbody>
            {visibles.map(l => (
              <tr key={l.mes} className="text-slate-700">
                <td className={`${celda} capitalize`}>{mesCorto(l.mes)}</td>
                <td className={`${celda} text-right`}>{l.noches || ''}</td>
                <td className={`${celda} text-right`}>{l.alojamiento ? dec(l.alojamiento) : ''}</td>
                <td className={`${celda} text-right`}>{l.limpieza ? dec(l.limpieza) : ''}</td>
                <td className={`${celda} text-right font-medium`}>{dec(l.alojamiento + (l.limpieza || 0))}</td>
              </tr>
            ))}
            {/* Un renglón en blanco: sin él, los meses y el total se
                confundían a la vista (Luis, 11/11/2026). */}
            <tr aria-hidden="true"><td colSpan={5} className="h-3 p-0 bg-white" /></tr>
            <tr className="bg-slate-50 font-bold text-slate-800">
              <td className={celda}>Totales</td>
              <td className={`${celda} text-right`}>{suma.noches}</td>
              <td className={`${celda} text-right`}>{dec(suma.alojamiento)}</td>
              <td className={`${celda} text-right`}>{dec(suma.limpieza)}</td>
              <td className={`${celda} text-right`}>{eur(suma.alojamiento + suma.limpieza)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {/* ── El desglose por meses y sus cobros ── */}
      {!conformidad && (<>
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
          {/* Un renglón en blanco: sin él, los meses y el total se
              confundían a la vista (Luis, 11/11/2026). */}
          <tr aria-hidden="true"><td colSpan={7} className="h-3 p-0 bg-white" /></tr>
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
      <table className={`w-full tabular-nums ${compacto ? 'text-xs' : 'text-sm'}`}>
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
              : diferencia < 0 ? (aunEnPlazo ? 'text-amber-600' : 'text-red-600') : 'text-purple-700'}`}>
            <td className={celda}>
              Diferencia{' '}
              <span className="ml-2 font-normal text-slate-500">
                {Math.abs(diferencia) < 0.005 ? 'la estancia queda cuadrada'
                  : diferencia >= 0 ? 'cobrado de más'
                  : aunEnPlazo ? `pendiente de cobro · la agencia suele pagarlo hacia el ${formatDate(plazoCobro)}`
                  : `falta por cobrar · debía llegar hacia el ${formatDate(plazoCobro)}`}
              </span>
            </td>
            <td className={`${celda} text-right`}>{eur(diferencia)}</td>
          </tr>
        </tbody>
      </table>
      </>)}
    </>
  )
}
