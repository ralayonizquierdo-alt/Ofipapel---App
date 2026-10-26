import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Plus, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { TextInput } from '../../../components/FormField'
import type { ArticuloEquivalencia } from '../types'

interface Sugerencia {
  codigo_interno: string
  descripcion: string
}

export function TabEquivalentes({ articuloCodigo }: { articuloCodigo: string }) {
  const [rows, setRows] = useState<ArticuloEquivalencia[]>([])
  const [existentes, setExistentes] = useState<Set<string>>(new Set())
  const [nueva, setNueva] = useState({ codigo_equivalente: '', descripcion_1: '', descripcion_2: '' })
  const [busqueda, setBusqueda] = useState('')
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([])
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data } = await supabase
      .from('articulo_equivalencia')
      .select('id, articulo_codigo, codigo_equivalente, descripcion_1, descripcion_2')
      .eq('articulo_codigo', articuloCodigo)
      .order('codigo_equivalente')
    const list = (data ?? []) as ArticuloEquivalencia[]
    setRows(list)
    if (list.length === 0) {
      setExistentes(new Set())
      return
    }
    const { data: arts } = await supabase
      .from('articulo')
      .select('codigo_interno')
      .in('codigo_interno', list.map((r) => r.codigo_equivalente))
    setExistentes(new Set((arts ?? []).map((a) => a.codigo_interno)))
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articuloCodigo])

  useEffect(() => {
    if (busqueda.trim().length < 2) {
      setSugerencias([])
      return
    }
    const t = setTimeout(async () => {
      const q = busqueda.trim()
      const { data } = await supabase
        .from('articulo')
        .select('codigo_interno, descripcion')
        .or(`codigo_interno.ilike.%${q}%,descripcion.ilike.%${q}%`)
        .neq('codigo_interno', articuloCodigo)
        .limit(8)
      setSugerencias(data ?? [])
    }, 200)
    return () => clearTimeout(t)
  }, [busqueda, articuloCodigo])

  function elegir(s: Sugerencia) {
    setNueva({ ...nueva, codigo_equivalente: s.codigo_interno, descripcion_1: s.descripcion })
    setBusqueda(s.codigo_interno)
    setSugerencias([])
  }

  async function add() {
    setError(null)
    const codigo = (nueva.codigo_equivalente || busqueda).trim()
    if (!codigo) {
      setError('Indica el código equivalente.')
      return
    }
    const { error: err } = await supabase.from('articulo_equivalencia').insert({
      articulo_codigo: articuloCodigo,
      codigo_equivalente: codigo,
      descripcion_1: nueva.descripcion_1 || null,
      descripcion_2: nueva.descripcion_2 || null,
    })
    if (err) {
      setError(err.message)
      return
    }
    setNueva({ codigo_equivalente: '', descripcion_1: '', descripcion_2: '' })
    setBusqueda('')
    load()
  }

  async function remove(r: ArticuloEquivalencia) {
    if (!r.id) return
    if (!confirm(`¿Borrar la equivalencia con ${r.codigo_equivalente}?`)) return
    const { error: err } = await supabase.from('articulo_equivalencia').delete().eq('id', r.id)
    if (err) setError(err.message)
    else load()
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Artículos equivalentes o sustitutos (EQUIVALE)</h3>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
      <div className="overflow-visible rounded-lg border border-slate-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2">Código equivalente</th>
              <th className="px-3 py-2">Descripción 1</th>
              <th className="px-3 py-2">Descripción 2</th>
              <th className="w-10 px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-4 text-center text-slate-400">Sin equivalentes.</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-slate-100 last:border-0">
                <td className="px-3 py-2 font-mono text-xs">
                  {existentes.has(r.codigo_equivalente) ? (
                    <Link to={`/articulos/${encodeURIComponent(r.codigo_equivalente)}`} className="inline-flex items-center gap-1 text-indigo-700 hover:underline">
                      {r.codigo_equivalente} <ExternalLink size={12} />
                    </Link>
                  ) : (
                    r.codigo_equivalente
                  )}
                </td>
                <td className="px-3 py-2">{r.descripcion_1 ?? '—'}</td>
                <td className="px-3 py-2">{r.descripcion_2 ?? '—'}</td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => remove(r)} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600" title="Borrar línea">
                    <Trash2 size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50 align-top">
              <td className="relative px-3 py-1.5">
                <TextInput
                  className="w-full py-1"
                  placeholder="Buscar código o descripción…"
                  value={busqueda}
                  onChange={(e) => {
                    setBusqueda(e.target.value)
                    setNueva({ ...nueva, codigo_equivalente: '' })
                  }}
                />
                {sugerencias.length > 0 && (
                  <ul className="absolute left-3 right-3 z-10 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                    {sugerencias.map((s) => (
                      <li key={s.codigo_interno}>
                        <button type="button" onClick={() => elegir(s)} className="flex w-full gap-2 px-3 py-1.5 text-left text-sm hover:bg-indigo-50">
                          <span className="font-mono text-xs text-slate-500">{s.codigo_interno}</span>
                          <span className="truncate">{s.descripcion}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </td>
              <td className="px-3 py-1.5">
                <TextInput className="w-full py-1" value={nueva.descripcion_1} onChange={(e) => setNueva({ ...nueva, descripcion_1: e.target.value })} />
              </td>
              <td className="px-3 py-1.5">
                <TextInput className="w-full py-1" value={nueva.descripcion_2} onChange={(e) => setNueva({ ...nueva, descripcion_2: e.target.value })} />
              </td>
              <td className="px-3 py-1.5">
                <button type="button" onClick={add} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-indigo-700 hover:bg-indigo-50" title="Añadir">
                  <Plus size={14} />
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
