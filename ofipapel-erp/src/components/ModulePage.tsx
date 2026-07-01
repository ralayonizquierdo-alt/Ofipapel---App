import type { MenuItem } from '../data/menu'
import { PHASE_META } from '../data/menu'
import { CheckCircle2 } from 'lucide-react'

export default function ModulePage({ item }: { item: MenuItem }) {
  const meta = PHASE_META[item.phase]
  const Icon = item.icon

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
            <Icon size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">{item.label}</h1>
        </div>
        <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${meta.color}`}>{meta.label}</span>
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">{item.description}</p>

      {item.sampleColumns && item.sampleRows ? (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200">
                {item.sampleColumns.map((col) => (
                  <th key={col} className="text-left font-medium text-slate-500 px-4 py-2.5 text-xs uppercase tracking-wide">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {item.sampleRows.map((row, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  {row.map((cell, j) => (
                    <td key={j} className="px-4 py-2.5 text-slate-700">
                      {cell}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-4 py-2.5 text-xs text-slate-400 bg-slate-50 border-t border-slate-200">
            Datos de ejemplo — pantalla de referencia visual, sin conexión a datos reales todavía
          </div>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl p-6">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-3">
            Funciones previstas para este módulo
          </div>
          <ul className="space-y-2.5">
            {item.features?.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-sm text-slate-700">
                <CheckCircle2 size={16} className="text-slate-400 mt-0.5 shrink-0" />
                <span>{feature}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
