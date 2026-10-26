import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Binoculars, Check, FilePen, FilePlus2, Trash2, X } from 'lucide-react'
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
const FILAS_MINIMAS = 14

export function TabEquivalentes({ articuloCodigo }: { articuloCodigo: string }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState<ArticuloEquivalencia[]>([])
  const [existentes, setExistentes] = useState<Set<string>>(new Set())
  const [sel, setSel] = useState<number | null>(null)
  const [modo, setModo] = useState<'alta' | 'modificar' | null>(null)
  const [nueva, setNueva] = useState({ codigo_equivalente: '', descripcion_1: '' })
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
    setNueva({ codigo_equivalente: '', descripcion_1: '' })
    setModo('alta')
  }

  function cancelar() {
    setModo(null)
    setError(null)
  }

  async function aceptar() {
    setError(null)
    if (modo === 'modificar') {
      const r = rows.find((x) => x.id === sel)
      if (!r?.id) return
      const { error: err } = await supabase
        .from('articulo_equivalencia')
        .update({ descripcion_1: nueva.descripcion_1 || null })
        .eq('id', r.id)
      if (err) {
        setError(err.message)
        return
      }
      setModo(null)
      load()
      return
    }
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
    })
    if (err) {
      setError(err.message)
      return
    }
    setModo(null)
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
  const huecos = Math.max(0, FILAS_MINIMAS - rows.length - (modo === 'alta' ? 1 : 0))

  return (
    <div className="flex flex-col gap-1" title="EQUIVALE">
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
      <div className="max-h-[300px] overflow-y-auto border border-[var(--gw-border)]">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: '26%' }}>Código Interno</th>
              <th>Descripción</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) =>
              modo === 'modificar' && sel === r.id ? (
                <tr key={r.id} className="bg-[#fffbe6]">
                  <td>{r.codigo_equivalente}</td>
                  <td>
                    <GwInput autoFocus value={nueva.descripcion_1} onChange={(e) => setNueva({ ...nueva, descripcion_1: e.target.value })} />
                  </td>
                </tr>
              ) : (
                <tr
                  key={r.id}
                  className={sel === r.id ? 'gw-selected' : ''}
                  onClick={() => !modo && setSel(r.id ?? null)}
                  onDoubleClick={() => !modo && existentes.has(r.codigo_equivalente) && navigate(`/articulos/${encodeURIComponent(r.codigo_equivalente)}`)}
                  title={existentes.has(r.codigo_equivalente) ? 'Doble clic para abrir la ficha' : undefined}
                >
                  <td>{r.codigo_equivalente}</td>
                  <td>{r.descripcion_1 ?? ''}</td>
                </tr>
              ),
            )}
            {modo === 'alta' && (
              <tr className="bg-[#fffbe6]">
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
              </tr>
            )}
            {Array.from({ length: huecos }, (_, i) => (
              <tr key={`h${i}`}>
                <td />
                <td />
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex w-fit border border-[var(--gw-border)]">
        {modo ? (
          <>
            <MiniBtn title="Aceptar" onClick={aceptar}>
              <Check size={14} strokeWidth={3} className="text-[#127a12]" />
            </MiniBtn>
            <MiniBtn title="Cancelar" onClick={cancelar}>
              <X size={14} strokeWidth={3} className="text-[#c42b1c]" />
            </MiniBtn>
            <MiniBtn title="Buscar artículo" disabled={modo !== 'alta'} onClick={() => setLookup(true)}>
              <Binoculars size={13} />
            </MiniBtn>
          </>
        ) : (
          <>
            <MiniBtn title="Nuevo" onClick={empezar}>
              <FilePlus2 size={13} />
            </MiniBtn>
            <MiniBtn
              title="Modificar"
              disabled={!selRow}
              onClick={() => {
                if (!selRow) return
                setError(null)
                setNueva({ codigo_equivalente: selRow.codigo_equivalente, descripcion_1: selRow.descripcion_1 ?? '' })
                setModo('modificar')
              }}
            >
              <FilePen size={13} />
            </MiniBtn>
            <MiniBtn title="Borrar" disabled={!selRow} onClick={remove}>
              <Trash2 size={13} />
            </MiniBtn>
            <MiniBtn
              title="Buscar artículo"
              onClick={() => {
                empezar()
                setLookup(true)
              }}
            >
              <Binoculars size={13} />
            </MiniBtn>
          </>
        )}
      </div>
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
            setNueva({ codigo_equivalente: a.codigo_interno, descripcion_1: a.descripcion })
            setLookup(false)
          }}
        />
      )}
    </div>
  )
}

function MiniBtn({ title, onClick, disabled, children }: { title: string; onClick?: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[22px] w-[48px] items-center justify-center border-r border-[var(--gw-border-light)] bg-[var(--gw-face)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#9a9a9a] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}
