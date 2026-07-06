import { useMemo, useState } from 'react'
import { Download, Printer } from 'lucide-react'
import { inputClass } from './FormField'
import { formatEUR } from '../lib/format'
import { downloadCsv } from '../lib/exportCsv'

export interface DimensionOption<T> {
  value: string
  label: string
  resolve: (item: T) => string
}

interface ReportRow {
  label: string
  operaciones: number
  unidades: number
  importe: number
}

interface ReportBuilderProps<T> {
  title: string
  data: T[]
  dimensions: DimensionOption<T>[]
  getFecha: (item: T) => string
  getUnidades: (item: T) => number
  getImporte: (item: T) => number
  csvPrefix: string
  rowUnitLabel?: string
}

export default function ReportBuilder<T>({ title, data, dimensions, getFecha, getUnidades, getImporte, csvPrefix, rowUnitLabel = 'Registros' }: ReportBuilderProps<T>) {
  const [dimensionValue, setDimensionValue] = useState(dimensions[0]?.value ?? '')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const dimension = dimensions.find((d) => d.value === dimensionValue) ?? dimensions[0]

  const filtered = useMemo(() => {
    return data.filter((item) => {
      const fecha = getFecha(item)
      if (desde && fecha < desde) return false
      if (hasta && fecha > hasta) return false
      return true
    })
  }, [data, desde, hasta, getFecha])

  const rows = useMemo(() => {
    const map = new Map<string, ReportRow>()
    filtered.forEach((item) => {
      const label = dimension.resolve(item)
      const acc = map.get(label) ?? { label, operaciones: 0, unidades: 0, importe: 0 }
      acc.operaciones += 1
      acc.unidades += getUnidades(item)
      acc.importe += getImporte(item)
      map.set(label, acc)
    })
    return [...map.values()].sort((a, b) => b.importe - a.importe)
  }, [filtered, dimension, getUnidades, getImporte])

  const total = rows.reduce((sum, r) => sum + r.importe, 0)
  const maxImporte = Math.max(...rows.map((r) => r.importe), 1)

  function exportarCsv() {
    downloadCsv(
      `${csvPrefix}-${dimension.value}${desde ? `-${desde}` : ''}${hasta ? `_${hasta}` : ''}.csv`,
      [dimension.label, rowUnitLabel, 'Unidades', 'Importe (€)'],
      rows.map((r) => [r.label, r.operaciones, r.unidades, r.importe.toFixed(2)]),
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="text-sm font-medium text-slate-700 mr-auto">{title}</div>
        <select value={dimensionValue} onChange={(e) => setDimensionValue(e.target.value)} className={`${inputClass} max-w-[190px]`}>
          {dimensions.map((d) => (
            <option key={d.value} value={d.value}>
              Por {d.label.toLowerCase()}
            </option>
          ))}
        </select>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={`${inputClass} max-w-[150px]`} title="Desde" />
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={`${inputClass} max-w-[150px]`} title="Hasta" />
        <button onClick={exportarCsv} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50">
          <Download size={14} /> CSV
        </button>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border border-slate-200 rounded-lg hover:bg-slate-50">
          <Printer size={14} /> PDF
        </button>
      </div>

      <div className="print-area">
        <div className="hidden print:block text-base font-semibold text-slate-900 mb-3">
          {title} — Por {dimension.label.toLowerCase()}
          {desde || hasta ? ` (${desde || '…'} a ${hasta || '…'})` : ''}
        </div>
        <div className="border border-slate-200 rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="text-left px-3 py-2">{dimension.label}</th>
                <th className="text-right px-3 py-2">{rowUnitLabel}</th>
                <th className="text-right px-3 py-2">Unidades</th>
                <th className="text-right px-3 py-2">Importe</th>
                <th className="text-left px-3 py-2 print:hidden">%</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.label} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">{r.label}</td>
                  <td className="px-3 py-2 text-right">{r.operaciones}</td>
                  <td className="px-3 py-2 text-right">{r.unidades.toLocaleString('es-ES')}</td>
                  <td className="px-3 py-2 text-right font-medium">{formatEUR(r.importe)}</td>
                  <td className="px-3 py-2 print:hidden">
                    <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden w-24">
                      <div className="h-full bg-slate-700 rounded-full" style={{ width: `${Math.max(4, Math.round((r.importe / maxImporte) * 100))}%` }} />
                    </div>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                    Sin datos en el rango seleccionado
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                <tr className="bg-slate-50 font-medium">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right">{rows.reduce((s, r) => s + r.operaciones, 0)}</td>
                  <td className="px-3 py-2 text-right">{rows.reduce((s, r) => s + r.unidades, 0).toLocaleString('es-ES')}</td>
                  <td className="px-3 py-2 text-right">{formatEUR(total)}</td>
                  <td className="print:hidden" />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  )
}
