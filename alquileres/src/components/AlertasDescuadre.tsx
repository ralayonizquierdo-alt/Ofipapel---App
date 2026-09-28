import { useMemo, useState } from 'react'
import { AlertTriangle, Check, ChevronDown, ChevronRight, Undo2 } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { calculaDescuadres, type Descuadre } from '../lib/descuadres'

/**
 * Avisos de descuadre entre el Excel y la app. Solo señalan; no corrigen nada.
 *
 * Van plegados: lo que importa de un vistazo es cuántos hay y de qué son. El
 * desglose por inmueble está debajo, para quien tenga que comprobarlo.
 */
export default function AlertasDescuadre() {
  const {
    incomes, repairTotals, occupancies, payments, reservations, repairs, apartments,
    avisosRevisados, darPorBueno, volverAAvisar,
  } = useData()
  const [abierto, setAbierto] = useState<string | null>(null)
  const [verRevisados, setVerRevisados] = useState(false)

  const descuadres = useMemo(() => calculaDescuadres({
    incomes, repairTotals, occupancies, payments, reservations, repairs,
    nombreApt: (id: string) => apartments.find(a => a.id === id)?.name || id,
  }), [incomes, repairTotals, occupancies, payments, reservations, repairs, apartments])

  // Un aviso dado por bueno desaparece, pero vuelve si su diferencia cambia:
  // entonces ya no es lo mismo que alguien miró en su día.
  const revisado = (d: Descuadre) => avisosRevisados.some(
    r => r.descuadreId === d.id && Math.abs(r.diferencia - Math.round(d.diferencia * 100) / 100) < 0.01)
  const vivos = descuadres.filter(d => !revisado(d))
  const dadosPorBuenos = descuadres.filter(revisado)

  if (descuadres.length === 0) return null

  return (
    <div className="mb-6 bg-white rounded-xl shadow-sm border border-amber-200 overflow-hidden">
      <div className="bg-amber-50 border-b border-amber-200 px-4 py-2.5 flex items-center gap-2">
        <AlertTriangle size={16} className="text-amber-600 shrink-0" />
        <p className="text-sm font-semibold text-amber-900">
          {vivos.length > 0
            ? `Para revisar: ${vivos.length} ${vivos.length === 1 ? 'descuadre' : 'descuadres'} entre el Excel y la app`
            : 'Todo revisado: no queda ningún descuadre pendiente'}
        </p>
      </div>
      <div className="divide-y divide-slate-100">
        {vivos.map(d => (
          <Fila key={d.id} d={d} abierto={abierto === d.id}
            onToggle={() => setAbierto(a => (a === d.id ? null : d.id))}
            onDarPorBueno={() => darPorBueno(d.id, d.diferencia)} />
        ))}
        {verRevisados && dadosPorBuenos.map(d => (
          <Fila key={d.id} d={d} abierto={abierto === d.id} revisado
            onToggle={() => setAbierto(a => (a === d.id ? null : d.id))}
            onVolverAAvisar={() => volverAAvisar(d.id)} />
        ))}
      </div>
      <div className="px-4 py-2 border-t border-slate-100 flex flex-wrap items-center gap-x-3 gap-y-1">
        <p className="text-[11px] text-slate-400">
          Son avisos informativos: ninguna cifra de la app se ha cambiado por esto.
        </p>
        {dadosPorBuenos.length > 0 && (
          <button onClick={() => setVerRevisados(v => !v)}
            className="text-[11px] text-blue-600 hover:underline">
            {verRevisados ? 'ocultar' : 'ver'} {dadosPorBuenos.length} dados por buenos
          </button>
        )}
      </div>
    </div>
  )
}

function Fila({ d, abierto, onToggle, onDarPorBueno, onVolverAAvisar, revisado = false }: {
  d: Descuadre; abierto: boolean; onToggle: () => void
  onDarPorBueno?: () => void; onVolverAAvisar?: () => void; revisado?: boolean
}) {
  return (
    <div className={revisado ? 'bg-slate-50/70' : ''}>
      <button onClick={onToggle} className="w-full px-4 py-3 flex items-start gap-2 text-left hover:bg-slate-50">
        {abierto
          ? <ChevronDown size={15} className="text-slate-400 mt-0.5 shrink-0" />
          : <ChevronRight size={15} className="text-slate-400 mt-0.5 shrink-0" />}
        <span className={`flex-1 text-sm ${revisado ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
          {d.titulo}
        </span>
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
          {onDarPorBueno && (
            <button onClick={onDarPorBueno}
              className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-200 bg-white text-xs text-slate-600 hover:border-green-400 hover:text-green-700">
              <Check size={13} /> Dar por bueno
            </button>
          )}
          {onVolverAAvisar && (
            <button onClick={onVolverAAvisar}
              className="mt-2 flex items-center gap-1.5 px-2.5 py-1.5 rounded border border-slate-200 bg-white text-xs text-slate-600 hover:border-amber-400 hover:text-amber-700">
              <Undo2 size={13} /> Volver a avisar
            </button>
          )}
        </div>
      )}
    </div>
  )
}
