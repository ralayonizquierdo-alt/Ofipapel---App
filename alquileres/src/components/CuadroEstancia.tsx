import { TRAMO_LABEL } from '../lib/priceCalc'
import { getSeason, formatDate } from '../lib/dateUtils'
import { num } from '../lib/formato'
import type { CuadreEstancia } from '../lib/cuadreEstancia'

const eur = (n: number) => `${num(n, 2)} €`
const dec = (n: number) => num(n, 2)

/**
 * El cuadro de una estancia, con el formato de la hoja de Excel del propietario:
 * la reserva, la operativa del importe, el desglose por meses con sus cobros y
 * la diferencia. `compacto` es para el recuadro que sale al pasar el ratón, que
 * tiene que caber en pantalla sin desplazarse.
 */
export default function CuadroEstancia({ cuadre, compacto = false }: {
  cuadre: CuadreEstancia
  compacto?: boolean
}) {
  const { reserva: r, tarifa, visibles, suma, cobrado, diferencia, mesCorto } = cuadre
  const celda = `${compacto ? 'py-0.5 px-1.5' : 'py-1.5 px-2'} border border-slate-300`

  return (
    <>
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
            <p className="text-slate-700">Precio pactado a mano: <b>{dec(r.basePrice)}</b></p>
          )}
          {!!r.discountPct && (
            <p className="text-slate-700">Descuento del {r.discountPct} %</p>
          )}
          <p className="text-slate-700">Cargos (limpieza): <b>{dec(r.cleaningFee || 0)}</b></p>
          <p className={`flex justify-between border-t border-slate-200 font-bold text-slate-900 ${compacto ? 'pt-0.5 mt-0.5' : 'pt-1.5 mt-1.5'}`}>
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
    </>
  )
}
