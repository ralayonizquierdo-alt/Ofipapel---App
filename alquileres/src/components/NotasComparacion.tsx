import { useState } from 'react'
import { Check, StickyNote } from 'lucide-react'
import { useNotasAsesoria, anotaAsesoria, quitaNotaAsesoria } from '../lib/notasAsesoria'

/**
 * Notas de la comparación, por año, al final de «Comparar con lo del gestor».
 * Cortas a propósito: una línea por diferencia y su porqué. «Resuelta» la
 * quita. Ver lib/notasAsesoria.ts.
 */
export default function NotasComparacion() {
  const notas = useNotasAsesoria()
  const esteAnio = new Date().getFullYear()
  const [anio, setAnio] = useState(esteAnio)
  const [texto, setTexto] = useState('')
  const [error, setError] = useState('')
  const anios = [...new Set(notas.map(n => n.anio))].sort((a, b) => b - a)
  const opciones = [...new Set([esteAnio + 1, esteAnio, esteAnio - 1, ...anios])].sort((a, b) => b - a)

  async function anadir() {
    if (!texto.trim()) return
    try { await anotaAsesoria(anio, texto); setTexto(''); setError('') } catch { setError('No se ha podido guardar la nota.') }
  }

  return (
    <div className="border border-amber-200 rounded-lg overflow-hidden print:border-slate-300">
      <p className="flex items-center gap-2 px-3 py-2 bg-amber-50 border-b border-amber-200 text-sm font-semibold text-amber-900">
        <StickyNote size={15} /> Notas de la comparación
      </p>
      <div className="px-3 py-2 space-y-2">
        {anios.length === 0 && <p className="text-xs text-slate-400">Sin notas.</p>}
        {anios.map(a => (
          <div key={a}>
            <p className="text-xs font-bold text-slate-500 mb-1">{a}</p>
            <ul className="space-y-1">
              {notas.filter(n => n.anio === a).map(n => (
                <li key={n.id} className="flex items-start gap-2 text-sm text-slate-700">
                  <span className="text-amber-500 mt-0.5">•</span>
                  <span className="flex-1">{n.texto}</span>
                  <button type="button" title="Ya está resuelta: quitarla"
                    onClick={() => { if (confirm('¿Quitar esta nota? Está resuelta.')) quitaNotaAsesoria(n.id).catch(() => setError('No se ha podido quitar.')) }}
                    className="print:hidden shrink-0 flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border border-green-300 text-green-800 hover:bg-green-50">
                    <Check size={12} /> Resuelta
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div className="print:hidden flex flex-wrap gap-2 pt-1">
          <select value={anio} onChange={e => setAnio(Number(e.target.value))}
            className="px-2 py-1.5 text-sm border border-slate-300 rounded-lg bg-white">
            {opciones.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input value={texto} onChange={e => setTexto(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') anadir() }}
            placeholder="Nueva nota, corta" className="flex-1 min-w-[12rem] px-3 py-1.5 text-sm border border-slate-300 rounded-lg" />
          <button type="button" onClick={anadir} disabled={!texto.trim()}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-50">
            Añadir
          </button>
        </div>
        {error && <p className="text-xs text-red-700">{error}</p>}
      </div>
    </div>
  )
}
