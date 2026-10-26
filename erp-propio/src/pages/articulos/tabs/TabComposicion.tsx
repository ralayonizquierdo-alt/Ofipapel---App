import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, Save, X, AlertTriangle } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { TextInput } from '../../../components/FormField'

interface ComponenteRow {
  id: number
  articulo_componente_codigo: string
  unidades: number
  descripcion: string
  coste_neto: number | null
  pvp: number | null
}

interface Candidato {
  codigo_interno: string
  descripcion: string
  coste_neto: number | null
  pvp: number | null
}

const th = 'px-2 py-2 text-left font-semibold'
const td = 'px-2 py-1.5'
const miniBtn =
  'flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-30'
const eur = (v: number | null) => (v == null ? '—' : `${v.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} €`)

export function TabComposicion({ articuloCodigo }: { articuloCodigo: string }) {
  const [rows, setRows] = useState<ComponenteRow[]>([])
  const [esCompuesto, setEsCompuesto] = useState<boolean | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | 'nuevo' | null>(null)
  const [unidades, setUnidades] = useState('1')
  const [componente, setComponente] = useState<Candidato | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [candidatos, setCandidatos] = useState<Candidato[]>([])
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const [{ data: lineas, error: err }, { data: kit }] = await Promise.all([
      supabase
        .from('articulo_componente')
        .select('id, articulo_componente_codigo, unidades')
        .eq('articulo_kit_codigo', articuloCodigo)
        .order('id'),
      supabase.from('articulo').select('compuesto, es_kit_de_componentes').eq('codigo_interno', articuloCodigo).single(),
    ])
    if (err) setError(err.message)
    setEsCompuesto(kit ? kit.compuesto || kit.es_kit_de_componentes : null)
    const codigos = (lineas ?? []).map((l) => l.articulo_componente_codigo)
    const { data: arts } = codigos.length
      ? await supabase.from('articulo').select('codigo_interno, descripcion, coste_neto, pvp').in('codigo_interno', codigos)
      : { data: [] as Candidato[] }
    const byCode = new Map((arts ?? []).map((a) => [a.codigo_interno, a]))
    setRows(
      (lineas ?? []).map((l) => {
        const a = byCode.get(l.articulo_componente_codigo)
        return {
          id: l.id,
          articulo_componente_codigo: l.articulo_componente_codigo,
          unidades: Number(l.unidades),
          descripcion: a?.descripcion ?? '(artículo no encontrado)',
          coste_neto: a?.coste_neto ?? null,
          pvp: a?.pvp ?? null,
        }
      }),
    )
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articuloCodigo])

  useEffect(() => {
    if (editingId !== 'nuevo' || busqueda.trim().length < 2) {
      setCandidatos([])
      return
    }
    const t = setTimeout(async () => {
      const q = busqueda.trim()
      const { data } = await supabase
        .from('articulo')
        .select('codigo_interno, descripcion, coste_neto, pvp')
        .or(`descripcion.ilike.%${q}%,codigo_interno.ilike.%${q}%`)
        .neq('codigo_interno', articuloCodigo)
        .eq('activo', true)
        .order('descripcion')
        .limit(15)
      setCandidatos(data ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [busqueda, editingId, articuloCodigo])

  function cancel() {
    setEditingId(null)
    setComponente(null)
    setBusqueda('')
    setCandidatos([])
  }

  async function save() {
    setError(null)
    const uds = Number(unidades)
    if (!uds || uds <= 0) {
      setError('Las unidades deben ser mayores que cero.')
      return
    }
    if (editingId === 'nuevo') {
      if (!componente) {
        setError('Busca y elige el artículo componente.')
        return
      }
      if (componente.codigo_interno === articuloCodigo) {
        setError('Un artículo no puede ser componente de sí mismo.')
        return
      }
      if (rows.some((r) => r.articulo_componente_codigo === componente.codigo_interno)) {
        setError(`${componente.codigo_interno} ya está en el kit: modifica sus unidades en vez de añadirlo otra vez.`)
        return
      }
      const { error: err } = await supabase.from('articulo_componente').insert({
        articulo_kit_codigo: articuloCodigo,
        articulo_componente_codigo: componente.codigo_interno,
        unidades: uds,
      })
      if (err) {
        setError(err.message)
        return
      }
    } else if (editingId != null) {
      const { error: err } = await supabase.from('articulo_componente').update({ unidades: uds }).eq('id', editingId)
      if (err) {
        setError(err.message)
        return
      }
    }
    cancel()
    load()
  }

  async function deleteSelected() {
    const row = rows.find((r) => r.id === selectedId)
    if (!row) return
    if (!confirm(`¿Quitar «${row.descripcion}» de la composición?`)) return
    const { error: err } = await supabase.from('articulo_componente').delete().eq('id', row.id)
    if (err) {
      setError(err.message)
      return
    }
    setSelectedId(null)
    load()
  }

  const totalCoste = rows.reduce((s, r) => s + (r.coste_neto ?? 0) * r.unidades, 0)
  const totalPvp = rows.reduce((s, r) => s + (r.pvp ?? 0) * r.unidades, 0)
  const selected = rows.find((r) => r.id === selectedId)

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-slate-500">
        Artículo compuesto o kit: componentes, cantidades, coste y PVP. Tabla COMPUEST.
      </p>
      {esCompuesto === false && (
        <p className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
          <AlertTriangle size={14} />
          Este artículo no está marcado como compuesto (pestaña Características). Los componentes no se descontarán
          del stock al venderlo hasta que lo marques.
        </p>
      )}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-slate-200">
        <div className="flex items-center gap-1 border-b border-slate-200 bg-slate-50 px-2 py-1">
          <span className="mr-auto text-xs font-semibold uppercase tracking-wide text-slate-500">Componentes</span>
          <button
            type="button"
            className={miniBtn}
            disabled={editingId != null}
            onClick={() => {
              setEditingId('nuevo')
              setUnidades('1')
            }}
          >
            <Plus size={14} /> Añadir línea
          </button>
          <button
            type="button"
            className={miniBtn}
            disabled={!selected || editingId != null}
            onClick={() => {
              if (!selected) return
              setEditingId(selected.id)
              setUnidades(String(selected.unidades))
            }}
          >
            <Pencil size={14} /> Modificar
          </button>
          <button
            type="button"
            className={`${miniBtn} hover:bg-red-50 hover:text-red-600`}
            disabled={!selected || editingId != null}
            onClick={deleteSelected}
          >
            <Trash2 size={14} /> Borrar línea
          </button>
        </div>
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200 text-slate-500">
              <th className={th}>Código</th>
              <th className={th}>Descripción</th>
              <th className={`${th} text-right`}>Unidades</th>
              <th className={`${th} text-right`}>Coste neto</th>
              <th className={`${th} text-right`}>Subtotal coste</th>
              <th className={`${th} text-right`}>PVP</th>
              <th className={`${th} text-right`}>Subtotal PVP</th>
              <th className={th} />
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && editingId == null && (
              <tr>
                <td colSpan={8} className="px-2 py-4 text-center text-slate-400">
                  Sin componentes.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => editingId == null && setSelectedId(r.id)}
                className={`border-b border-slate-100 last:border-0 ${
                  editingId === r.id
                    ? 'bg-amber-50/40'
                    : selectedId === r.id
                      ? 'cursor-pointer bg-indigo-50'
                      : 'cursor-pointer hover:bg-slate-50'
                }`}
              >
                <td className={`${td} font-mono`}>{r.articulo_componente_codigo}</td>
                <td className={td}>{r.descripcion}</td>
                <td className={`${td} text-right`}>
                  {editingId === r.id ? (
                    <TextInput
                      type="number"
                      step="0.001"
                      className="w-24 py-1 text-right text-xs"
                      value={unidades}
                      onChange={(e) => setUnidades(e.target.value)}
                      autoFocus
                    />
                  ) : (
                    r.unidades
                  )}
                </td>
                <td className={`${td} text-right`}>{eur(r.coste_neto)}</td>
                <td className={`${td} text-right`}>{eur(r.coste_neto != null ? r.coste_neto * r.unidades : null)}</td>
                <td className={`${td} text-right`}>{eur(r.pvp)}</td>
                <td className={`${td} text-right`}>{eur(r.pvp != null ? r.pvp * r.unidades : null)}</td>
                <td className={`${td} whitespace-nowrap`}>
                  {editingId === r.id && (
                    <>
                      <button type="button" className={miniBtn} onClick={save}>
                        <Save size={14} />
                      </button>
                      <button type="button" className={miniBtn} onClick={cancel}>
                        <X size={14} />
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {editingId === 'nuevo' && (
              <tr className="border-b border-slate-100 bg-amber-50/40 align-top">
                <td className={td} colSpan={2}>
                  {componente ? (
                    <div className="flex items-center gap-2">
                      <span className="font-mono">{componente.codigo_interno}</span>
                      <span>{componente.descripcion}</span>
                      <button type="button" className="text-indigo-600 hover:underline" onClick={() => setComponente(null)}>
                        cambiar
                      </button>
                    </div>
                  ) : (
                    <div className="relative">
                      <TextInput
                        className="w-full py-1 text-xs"
                        placeholder="Buscar artículo por descripción o código…"
                        value={busqueda}
                        onChange={(e) => setBusqueda(e.target.value)}
                        autoFocus
                      />
                      {candidatos.length > 0 && (
                        <ul className="absolute z-10 mt-1 max-h-56 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                          {candidatos.map((c) => (
                            <li key={c.codigo_interno}>
                              <button
                                type="button"
                                className="flex w-full gap-2 px-3 py-1.5 text-left hover:bg-indigo-50"
                                onClick={() => {
                                  setComponente(c)
                                  setCandidatos([])
                                }}
                              >
                                <span className="font-mono text-slate-500">{c.codigo_interno}</span>
                                <span>{c.descripcion}</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  )}
                </td>
                <td className={`${td} text-right`}>
                  <TextInput
                    type="number"
                    step="0.001"
                    className="w-24 py-1 text-right text-xs"
                    value={unidades}
                    onChange={(e) => setUnidades(e.target.value)}
                  />
                </td>
                <td className={`${td} text-right`}>{eur(componente?.coste_neto ?? null)}</td>
                <td className={td} />
                <td className={`${td} text-right`}>{eur(componente?.pvp ?? null)}</td>
                <td className={td} />
                <td className={`${td} whitespace-nowrap`}>
                  <button type="button" className={miniBtn} onClick={save}>
                    <Save size={14} />
                  </button>
                  <button type="button" className={miniBtn} onClick={cancel}>
                    <X size={14} />
                  </button>
                </td>
              </tr>
            )}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t border-slate-200 bg-slate-50 font-semibold text-slate-700">
                <td className={td} colSpan={4}>
                  Total del kit ({rows.length} componente{rows.length === 1 ? '' : 's'})
                </td>
                <td className={`${td} text-right`}>{eur(totalCoste)}</td>
                <td className={td} />
                <td className={`${td} text-right`}>{eur(totalPvp)}</td>
                <td className={td} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </div>
  )
}
