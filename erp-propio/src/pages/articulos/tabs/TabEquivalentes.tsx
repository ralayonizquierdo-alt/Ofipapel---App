import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Binoculars, Check, ExternalLink, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwInput, GwLookupButton } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import type { ArticuloEquivalencia } from '../types'

interface ArticuloLookup extends Record<string, unknown> {
  codigo_interno: string
  descripcion: string
}

const LOOKUP_COLS = [
  { key: 'codigo_interno', label: 'Código Interno', width: 140 },
  { key: 'descripcion', label: 'Descripción' },
]
const LOOKUP_SEARCH = ['codigo_interno', 'descripcion']

export function TabEquivalentes({ articuloCodigo }: { articuloCodigo: string }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState<ArticuloEquivalencia[]>([])
  const [existentes, setExistentes] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [nueva, setNueva] = useState({ codigo_equivalente: '', descripcion_1: '', descripcion_2: '' })
  const [lookup, setLookup] = useState(false)
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

  async function resolverCodigo(codigo: string) {
    const c = codigo.trim()
    if (!c) return
    const { data } = await supabase.from('articulo').select('descripcion').eq('codigo_interno', c).maybeSingle()
    if (data) setNueva((n) => ({ ...n, codigo_equivalente: c, descripcion_1: n.descripcion_1 || data.descripcion }))
  }

  function empezar() {
    setError(null)
    setNueva({ codigo_equivalente: '', descripcion_1: '', descripcion_2: '' })
    setAdding(true)
  }

  function cancelar() {
    setAdding(false)
    setError(null)
  }

  async function add() {
    setError(null)
    const codigo = nueva.codigo_equivalente.trim()
    if (!codigo) {
      setError('Indica el código equivalente.')
      return
    }
    if (codigo === articuloCodigo) {
      setError('Un artículo no puede ser equivalente de sí mismo.')
      return
    }
    if (rows.some((r) => r.codigo_equivalente === codigo)) {
      setError(`${codigo} ya está en la lista de equivalentes.`)
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
    setAdding(false)
    load()
  }

  async function remove() {
    const r = rows.find((x) => x.id === sel)
    if (!r?.id) return
    if (!confirm(`¿Borrar la equivalencia con ${r.codigo_equivalente}?`)) return
    const { error: err } = await supabase.from('articulo_equivalencia').delete().eq('id', r.id)
    if (err) setError(err.message)
    else {
      setSel(null)
      load()
    }
  }

  const selRow = rows.find((x) => x.id === sel)

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1">
        <button type="button" className="gw-btn" onClick={empezar} disabled={adding}>
          <Plus size={14} /> Añadir línea
        </button>
        <button type="button" className="gw-btn" onClick={remove} disabled={!selRow || adding}>
          <Trash2 size={14} /> Borrar línea
        </button>
        <button type="button" className="gw-btn" onClick={() => { if (!adding) empezar(); setLookup(true) }}>
          <Binoculars size={14} /> Buscar artículo
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!selRow || !existentes.has(selRow.codigo_equivalente)}
          onClick={() => selRow && navigate(`/articulos/${encodeURIComponent(selRow.codigo_equivalente)}`)}
        >
          <ExternalLink size={14} /> Ir al artículo
        </button>
      </div>
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
      <table className="gw-grid" title="EQUIVALE">
        <thead>
          <tr>
            <th style={{ width: 200 }}>Código Equivalente</th>
            <th>Descripción 1</th>
            <th>Descripción 2</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !adding && (
            <tr>
              <td colSpan={3} className="text-center text-[#6d6d6d]">Sin equivalentes.</td>
            </tr>
          )}
          {rows.map((r) => (
            <tr
              key={r.id}
              className={sel === r.id ? 'gw-selected' : ''}
              onClick={() => setSel(r.id ?? null)}
              onDoubleClick={() => existentes.has(r.codigo_equivalente) && navigate(`/articulos/${encodeURIComponent(r.codigo_equivalente)}`)}
            >
              <td>{r.codigo_equivalente}</td>
              <td>{r.descripcion_1 ?? ''}</td>
              <td>{r.descripcion_2 ?? ''}</td>
            </tr>
          ))}
          {adding && (
            <tr>
              <td>
                <div className="flex">
                  <GwInput
                    autoFocus
                    value={nueva.codigo_equivalente}
                    onChange={(e) => setNueva({ ...nueva, codigo_equivalente: e.target.value })}
                    onBlur={(e) => resolverCodigo(e.target.value)}
                  />
                  <GwLookupButton onClick={() => setLookup(true)} title="Buscar artículo" />
                </div>
              </td>
              <td>
                <GwInput value={nueva.descripcion_1} onChange={(e) => setNueva({ ...nueva, descripcion_1: e.target.value })} />
              </td>
              <td>
                <div className="flex gap-1">
                  <GwInput value={nueva.descripcion_2} onChange={(e) => setNueva({ ...nueva, descripcion_2: e.target.value })} />
                  <button type="button" className="gw-btn px-1.5" title="Aceptar" onClick={add}>
                    <Check size={14} className="text-[#127a12]" />
                  </button>
                  <button type="button" className="gw-btn px-1.5" title="Cancelar" onClick={cancelar}>
                    <X size={14} className="text-[#c42b1c]" />
                  </button>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {lookup && (
        <GwLookupDialog<ArticuloLookup>
          title="Artículos"
          table="articulo"
          columns={LOOKUP_COLS}
          searchColumns={LOOKUP_SEARCH}
          orderBy="codigo_interno"
          keyColumn="codigo_interno"
          onClose={() => setLookup(false)}
          onPick={(a) => {
            setNueva((n) => ({ ...n, codigo_equivalente: a.codigo_interno, descripcion_1: a.descripcion }))
            setLookup(false)
          }}
        />
      )}
    </div>
  )
}
