import { calcPrices } from '../lib/priceCalc'
import { numSuelto } from '../lib/formato'
import type { PriceEntry } from '../types'

/**
 * La tarifa de la que sale el importe, **limpia** (solo la tabla, sin la
 * pantalla de Precios), para mandarla con la ficha cuando haga falta (Luis,
 * 13/11/2026: «estamos diciendo que el importe sale de la tarifa»).
 *
 * Son las mismas filas y cuentas que la tabla de Precios (pages/Prices.tsx,
 * PriceTable) con el tramo aplicado marcado. Para que quepa en la imagen de
 * WhatsApp (440 px, ver index.css) van sin «Pago Propietario» (es base +
 * limpieza), sin «€/Noche» (ya sale en la «Operativa del importe») y sin el
 * «€» en cada casilla. Va dentro de la
 * ficha, así que entra igual en la imagen, el correo y el papel.
 */
export default function TarifaParaEnviar({ entry, tramo, titulo }: {
  entry: PriceEntry
  /** El tramo que se aplicó a la estancia: va resaltado. */
  tramo?: string
  titulo: string
}) {
  const filas = [
    { label: '1 semana', base: entry.price1week, tramo: '1semana' },
    { label: '2 semanas', base: entry.price2weeks, tramo: '2semanas' },
    { label: '3 semanas', base: entry.price3weeks, tramo: '3semanas' },
    { label: '1 mes', base: entry.price1month, tramo: '1mes' },
    { label: 'Directo (−10 %)', base: entry.price1month * 0.9, directo: true },
  ]
  const celda = 'py-1.5 px-2 border border-slate-300'

  return (
    <div className="space-y-1 break-inside-avoid">
      <p className="text-xs font-semibold text-slate-700">
        Tarifa: {titulo} · <span className={entry.season === 'VERANO' ? 'text-orange-700' : 'text-blue-700'}>
          {entry.season} {entry.year}
        </span>
      </p>
      <table className="tarifa-enviar w-full text-xs tabular-nums">
        <thead>
          <tr className="bg-slate-100 text-slate-600">
            <th className={`${celda} text-left font-medium`}>Duración</th>
            <th className={`${celda} text-right font-medium`}>Base</th>
            <th className={`${celda} text-right font-medium`}>Limpieza</th>
            <th className={`${celda} text-right font-medium text-amber-700`}>Inmobi. 15 %</th>
            <th className={`${celda} text-right font-medium text-violet-700`}>Reserva 15 %</th>
            <th className={`${celda} text-right font-medium text-green-700 bg-green-50`}>Web (publicar)</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(f => {
            if (!f.base) return null
            const c = calcPrices(f.base, entry.cleaningFee)
            const marcada = !!tramo && f.tramo === tramo
            return (
              <tr key={f.label} className={marcada ? 'bg-blue-100 font-semibold' : f.directo ? 'text-green-800' : 'text-slate-700'}>
                <td className={celda}>{f.label}</td>
                <td className={`${celda} text-right`}>{numSuelto(f.base)}</td>
                <td className={`${celda} text-right`}>{entry.cleaningFee}</td>
                <td className={`${celda} text-right text-amber-700`}>{numSuelto(c.realEstate)}</td>
                <td className={`${celda} text-right text-violet-700`}>{numSuelto(c.booking)}</td>
                <td className={`${celda} text-right font-bold text-green-700 bg-green-50`}>
                  {f.directo ? '—' : numSuelto(c.webPrice)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      <p className="text-xs text-slate-500">
        Importes en €. Pago al propietario = base + limpieza. Canales: limpieza no incluida, se cobra aparte.
      </p>
    </div>
  )
}
