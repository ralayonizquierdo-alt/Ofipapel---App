import { useMemo, useState } from 'react'
import { AlertTriangle, ChevronDown, ChevronRight } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { calculaDescuadres, type Descuadre } from '../lib/descuadres'

/**
 * Avisos de descuadre entre el Excel y la app. Solo señalan; no corrigen nada.
 *
 * Van plegados: lo que importa de un vistazo es cuántos hay y de qué son. El
 * desglose por inmueble está debajo, para quien tenga que comprobarlo.
 */
export default function AlertasDescuadre() {
  const { incomes, repairTotals, occupancies, payments, reservations, repairs, apartments } = useData()
  const [abierto, setAbierto] = useState<string | null>(null)

  const descuadres = useMemo(() => calculaDescuadres({
    incomes, repairTotals, occupancies, payments, reservations, repairs,
    nombreApt: (id: string) => apartments.find(a => a.id === id)?.name || id,
  }), [incomes, repairTotals, occupancies, payments, reservations, repairs, apartments])

  if (descuadres.length === 0) return null

  return (
    <div className="mb-6 bg-white rounded-xl shadow-sm border border-amber-200 overflow-hidden">
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-600 shrink-0" />
        <p className="text-sm font-semibold text-amber-900">
          Para revisar: {descuadres.length} {descuadres.length === 1 ? 'descuadre' : 'descuadres'} entre el Excel y la app
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {descuadres.map(d => (
          <Fila key={d.id} d={d} abierto={abierto === d.id}
            onToggle={() => setAbierto(a => (a === d.id ? null : d.id))} />
        ))}
      </div>
      <p className="px-4 py-2 text-[11px] text-slate-400 border-t border-slate-100">
        Son avisos informativos: ninguna cifra de la app se ha cambiado por esto.
      </p>
    </div>
  )
}

function Fila({ d, abierto, onToggle }: { d: Descuadre; abierto: boolean; onToggle: () => void }) {
  return (
    <div>
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-start gap-2 text-left hover:bg-slate-50">
        {abierto
          ? <ChevronDown size={15} className="text-slate-400 mt-0.5 shrink-0" />
          : <ChevronRight size={15} className="text-slate-400 mt-0.5 shrink-0" />}
        <span className="flex-1 text-sm text-slate-700">{d.titulo}</span>
        {d.diferencia !== 0 && (
          <span className="text-sm font-semibold text-amber-700 shrink-0" translate="no">
            {d.diferencia > 0 ? '+' : ''}
            {d.diferencia.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
          </span>
        )}
      </button>
      {abierto && (
        <div className="px-4 pb-3 pl-11 space-y-0.5 text-xs text-slate-500" translate="no">
          {d.detalle.map((l, i) => <p key={i}>{l}</p>)}
        </div>
      )}
    </div>
  )
}
