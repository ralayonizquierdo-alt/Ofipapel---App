import { useEffect, useState } from 'react'
import { Binoculars, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwInline, GwInput, GwLookupButton, GwNumber, formatGw } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'

interface ComponenteRow {
  id: number
  articulo_componente_codigo: string
  unidades: number
  descripcion: string
  coste_neto: number | null
  pvp: number | null
}

interface Candidato extends Record<string, unknown> {
  codigo_interno: string
  descripcion: string
  coste_neto: number | null
  pvp: number | null
}

const LOOKUP_COLS = [
  { key: 'codigo_interno', label: 'Código Interno', width: 130 },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'coste_neto', label: 'Coste Neto', width: 90 },
  { key: 'pvp', label: 'Pvp', width: 80 },
]
const LOOKUP_SEARCH = ['codigo_interno', 'descripcion']

export function TabComposicion({ articuloCodigo }: { articuloCodigo: string }) {
  const [rows, setRows] = useState<ComponenteRow[]>([])
  const [esCompuesto, setEsCompuesto] = useState<boolean | null>(null)
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const [editingId, setEditingId] = useState<number | 'nuevo' | null>(null)
  const [unidades, setUnidades] = useState<number | null>(1)
  const [componente, setComponente] = useState<Candidato | null>(null)
  const [codigoTecleado, setCodigoTecleado] = useState('')
  const [lookup, setLookup] = useState(false)
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

  async function resolverCodigo(codigo: string) {
    const c = codigo.trim()
    if (!c) return
    const { data } = await supabase
      .from('articulo')
      .select('codigo_interno, descripcion, coste_neto, pvp')
      .eq('codigo_interno', c)
      .maybeSingle()
    if (data) setComponente(data as Candidato)
    else setError(`No existe el artículo ${c}.`)
  }

  function nuevo() {
    setError(null)
    setEditingId('nuevo')
    setUnidades(1)
    setComponente(null)
    setCodigoTecleado('')
  }

  function cancel() {
    setEditingId(null)
    setComponente(null)
    setCodigoTecleado('')
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

  const acciones = (
    <div className="flex gap-1">
      <button type="button" className="gw-btn px-1.5" title="Aceptar" onClick={save}>
        <Check size={14} className="text-[#127a12]" />
      </button>
      <button type="button" className="gw-btn px-1.5" title="Cancelar" onClick={cancel}>
        <X size={14} className="text-[#c42b1c]" />
      </button>
    </div>
  )

  return (
    <div className="flex flex-col gap-1.5" title="COMPUEST">
      <div className="flex items-center gap-1">
        <button type="button" className="gw-btn" disabled={editingId != null} onClick={nuevo}>
          <Plus size={14} /> Añadir línea
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!selected || editingId != null}
          onClick={() => {
            if (!selected) return
            setError(null)
            setEditingId(selected.id)
            setUnidades(selected.unidades)
          }}
        >
          <Pencil size={14} /> Modificar línea
        </button>
        <button type="button" className="gw-btn" disabled={!selected || editingId != null} onClick={deleteSelected}>
          <Trash2 size={14} /> Borrar línea
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={editingId != null && editingId !== 'nuevo'}
          onClick={() => {
            if (editingId !== 'nuevo') nuevo()
            setLookup(true)
          }}
        >
          <Binoculars size={14} /> Buscar artículo
        </button>
        {esCompuesto === false && (
          <span className="ml-3 text-[#a4262c]">El artículo no está marcado como compuesto.</span>
        )}
      </div>
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}

      <table className="gw-grid">
        <thead>
          <tr>
            <th style={{ width: 150 }}>Código</th>
            <th>Descripción</th>
            <th className="text-right" style={{ width: 100 }}>Unidades</th>
            <th className="text-right" style={{ width: 100 }}>Coste Neto</th>
            <th className="text-right" style={{ width: 100 }}>Total Coste</th>
            <th className="text-right" style={{ width: 100 }}>Pvp</th>
            <th className="text-right" style={{ width: 100 }}>Total Pvp</th>
            <th style={{ width: 70 }} />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && editingId == null && (
            <tr>
              <td colSpan={8} className="text-center text-[#6d6d6d]">Sin componentes.</td>
            </tr>
          )}
          {rows.map((r) => (
            <tr
              key={r.id}
              onClick={() => editingId == null && setSelectedId(r.id)}
              className={editingId !== r.id && selectedId === r.id ? 'gw-selected' : ''}
            >
              <td>{r.articulo_componente_codigo}</td>
              <td>{r.descripcion}</td>
              <td className="text-right">
                {editingId === r.id ? <GwNumber autoFocusless value={unidades} decimals={3} onChange={setUnidades} /> : formatGw(r.unidades, 3)}
              </td>
              <td className="text-right tabular-nums">{formatGw(r.coste_neto, 3)}</td>
              <td className="text-right tabular-nums">{r.coste_neto != null ? formatGw(r.coste_neto * r.unidades, 3) : ''}</td>
              <td className="text-right tabular-nums">{formatGw(r.pvp, 3)}</td>
              <td className="text-right tabular-nums">{r.pvp != null ? formatGw(r.pvp * r.unidades, 3) : ''}</td>
              <td>{editingId === r.id && acciones}</td>
            </tr>
          ))}
          {editingId === 'nuevo' && (
            <tr>
              <td>
                <div className="flex">
                  <GwInput
                    autoFocus
                    value={componente?.codigo_interno ?? codigoTecleado}
                    onChange={(e) => {
                      setComponente(null)
                      setCodigoTecleado(e.target.value)
                    }}
                    onBlur={(e) => !componente && resolverCodigo(e.target.value)}
                  />
                  <GwLookupButton onClick={() => setLookup(true)} title="Buscar artículo" />
                </div>
              </td>
              <td>{componente?.descripcion ?? ''}</td>
              <td>
                <GwNumber value={unidades} decimals={3} onChange={setUnidades} />
              </td>
              <td className="text-right tabular-nums">{formatGw(componente?.coste_neto ?? null, 3)}</td>
              <td className="text-right tabular-nums">
                {componente?.coste_neto != null && unidades ? formatGw(componente.coste_neto * unidades, 3) : ''}
              </td>
              <td className="text-right tabular-nums">{formatGw(componente?.pvp ?? null, 3)}</td>
              <td className="text-right tabular-nums">{componente?.pvp != null && unidades ? formatGw(componente.pvp * unidades, 3) : ''}</td>
              <td>{acciones}</td>
            </tr>
          )}
        </tbody>
      </table>

      <div className="flex justify-end gap-4">
        <GwInline label={`Total Coste (${rows.length} comp.):`}>
          <GwNumber className="w-[110px]" value={totalCoste} decimals={3} disabled />
        </GwInline>
        <GwInline label="Total Pvp:">
          <GwNumber className="w-[110px]" value={totalPvp} decimals={3} disabled />
        </GwInline>
      </div>

      {lookup && (
        <GwLookupDialog<Candidato>
          title="Artículos"
          table="articulo"
          columns={LOOKUP_COLS}
          searchColumns={LOOKUP_SEARCH}
          orderBy="descripcion"
          keyColumn="codigo_interno"
          onClose={() => setLookup(false)}
          onPick={(a) => {
            setComponente(a)
            setLookup(false)
          }}
        />
      )}
    </div>
  )
}
