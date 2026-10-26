import { useEffect, useState, type ReactNode } from 'react'
import { Binoculars, Check, FilePen, FilePlus2, Trash2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwInput, GwLookupButton, GwNumber, formatGw } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import type { Articulo } from '../types'

interface ComponenteRow {
  id: number
  articulo_componente_codigo: string
  unidades: number
  nivel_tarifa_referencia: number | null
  descripcion: string
  liquido: number | null
  pvp: number | null
}

interface Candidato extends Record<string, unknown> {
  codigo_interno: string
  descripcion: string
  precio_liquidado: number | null
  coste_neto: number | null
  pvp: number | null
}

const LOOKUP_COLS = [
  { key: 'codigo_interno', label: 'Código Interno', width: 130 },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'precio_liquidado', label: 'Líquido', width: 90 },
  { key: 'pvp', label: 'Pvp', width: 80 },
]
const LOOKUP_SEARCH = ['codigo_interno', 'descripcion']
const FILAS_MINIMAS = 12

const liquidoDe = (a: { precio_liquidado: number | null; coste_neto: number | null }) => a.precio_liquidado ?? a.coste_neto ?? null

export function TabComposicion({
  articuloCodigo,
  articulo,
  editing: fichaEditing,
  onChange,
}: {
  articuloCodigo: string
  articulo?: Articulo
  editing?: boolean
  onChange?: (patch: Partial<Articulo>) => void
}) {
  const [rows, setRows] = useState<ComponenteRow[]>([])
  const [flags, setFlags] = useState({ compuesto: false, es_accesorio: false, composicion_no_sumar_coste: false, composicion_no_sumar_pvp: false })
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
        .select('id, articulo_componente_codigo, unidades, nivel_tarifa_referencia')
        .eq('articulo_kit_codigo', articuloCodigo)
        .order('id'),
      supabase
        .from('articulo')
        .select('compuesto, es_accesorio, composicion_no_sumar_coste, composicion_no_sumar_pvp')
        .eq('codigo_interno', articuloCodigo)
        .maybeSingle(),
    ])
    if (err) setError(err.message)
    if (kit) setFlags(kit)
    const codigos = (lineas ?? []).map((l) => l.articulo_componente_codigo)
    const { data: arts } = codigos.length
      ? await supabase.from('articulo').select('codigo_interno, descripcion, precio_liquidado, coste_neto, pvp').in('codigo_interno', codigos)
      : { data: [] as Candidato[] }
    const byCode = new Map((arts ?? []).map((a) => [a.codigo_interno, a]))
    setRows(
      (lineas ?? []).map((l) => {
        const a = byCode.get(l.articulo_componente_codigo)
        return {
          id: l.id,
          articulo_componente_codigo: l.articulo_componente_codigo,
          unidades: Number(l.unidades),
          nivel_tarifa_referencia: l.nivel_tarifa_referencia,
          descripcion: a?.descripcion ?? '(artículo no encontrado)',
          liquido: a ? liquidoDe(a) : null,
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
      .select('codigo_interno, descripcion, precio_liquidado, coste_neto, pvp')
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

  const totalCoste = rows.reduce((s, r) => s + (r.liquido ?? 0) * r.unidades, 0)
  const totalPvp = rows.reduce((s, r) => s + (r.pvp ?? 0) * r.unidades, 0)
  const selected = rows.find((r) => r.id === selectedId)

  // Las casillas son campos del artículo: si la ficha las pasa, se editan con su Aceptar general.
  const valor = (k: keyof typeof flags) => (articulo ? Boolean(articulo[k]) : flags[k])
  const casillaDisabled = !onChange || !fichaEditing
  const casilla = (k: keyof typeof flags, label: string) => (
    <GwCheck label={label} checked={valor(k)} disabled={casillaDisabled} onChange={(v) => onChange?.({ [k]: v } as Partial<Articulo>)} />
  )

  const huecos = Math.max(0, FILAS_MINIMAS - rows.length - (editingId === 'nuevo' ? 1 : 0))

  return (
    <div className="flex flex-col gap-1" title="COMPUEST">
      <div className="grid grid-cols-[21%_minmax(0,1fr)]">
        <span title="COMPUESTO">{casilla('compuesto', 'Composición Activada')}</span>
        <span title="COMPESKITA (confirmar)">{casilla('es_accesorio', 'Es un accesorio o un condimento o un aditivo')}</span>
      </div>
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}

      <div className="max-h-[260px] overflow-y-auto border border-[var(--gw-border)]">
        <table className="gw-grid table-fixed">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: '21.5%' }}>Código</th>
              <th style={{ width: '27%' }}>Descripción</th>
              <th className="text-right" style={{ width: '7.2%' }}>Cant.</th>
              <th className="text-right" style={{ width: '9%' }}>Liquido</th>
              <th style={{ width: '9.6%' }}>Total Coste</th>
              <th style={{ width: '3.4%' }}>Tar.</th>
              <th className="text-right" style={{ width: '9.4%' }}>PVP</th>
              <th className="text-right" style={{ width: '12.9%' }}>Total PVP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.id}
                onClick={() => editingId == null && setSelectedId(r.id)}
                className={editingId !== r.id && selectedId === r.id ? 'gw-selected' : ''}
              >
                <td>{r.articulo_componente_codigo}</td>
                <td>{r.descripcion}</td>
                <td className="text-right">
                  {editingId === r.id ? <GwNumber value={unidades} decimals={3} onChange={setUnidades} /> : formatGw(r.unidades, 3)}
                </td>
                <td className="text-right tabular-nums">{formatGw(r.liquido, 3)}</td>
                <td className="text-right tabular-nums">{r.liquido != null ? formatGw(r.liquido * r.unidades, 3) : ''}</td>
                <td>{r.nivel_tarifa_referencia ?? ''}</td>
                <td className="text-right tabular-nums">{formatGw(r.pvp, 3)}</td>
                <td className="text-right tabular-nums">{r.pvp != null ? formatGw(r.pvp * r.unidades, 3) : ''}</td>
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
                <td className="text-right tabular-nums">{componente ? formatGw(liquidoDe(componente), 3) : ''}</td>
                <td className="text-right tabular-nums">
                  {componente && liquidoDe(componente) != null && unidades ? formatGw((liquidoDe(componente) ?? 0) * unidades, 3) : ''}
                </td>
                <td />
                <td className="text-right tabular-nums">{formatGw(componente?.pvp ?? null, 3)}</td>
                <td className="text-right tabular-nums">{componente?.pvp != null && unidades ? formatGw(componente.pvp * unidades, 3) : ''}</td>
              </tr>
            )}
            {Array.from({ length: huecos }, (_, i) => (
              <tr key={`h${i}`}>
                {Array.from({ length: 8 }, (_, j) => (
                  <td key={j} />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-[64.7%_9.6%_12.8%_12.9%] items-center pr-[1px] text-[#1a4fd0]">
        <span>Nº Componentes: {rows.length}</span>
        <span className="text-right tabular-nums">{formatGw(totalCoste, 0)}</span>
        <span />
        <span className="text-right tabular-nums">{formatGw(totalPvp, 0)}</span>
      </div>

      <div className="grid grid-cols-[57%_minmax(0,1fr)] items-center">
        <div className="flex items-center gap-6">
        <div className="flex border border-[var(--gw-border)]">
          {editingId == null ? (
            <>
              <MiniBtn title="Nuevo componente" onClick={nuevo}>
                <FilePlus2 size={13} />
              </MiniBtn>
              <MiniBtn
                title="Modificar componente"
                disabled={!selected}
                onClick={() => {
                  if (!selected) return
                  setError(null)
                  setEditingId(selected.id)
                  setUnidades(selected.unidades)
                }}
              >
                <FilePen size={13} />
              </MiniBtn>
              <MiniBtn title="Borrar componente" disabled={!selected} onClick={deleteSelected}>
                <Trash2 size={13} />
              </MiniBtn>
              <MiniBtn
                title="Buscar artículo"
                onClick={() => {
                  nuevo()
                  setLookup(true)
                }}
              >
                <Binoculars size={13} />
              </MiniBtn>
            </>
          ) : (
            <>
              <MiniBtn title="Aceptar" onClick={save}>
                <Check size={14} strokeWidth={3} className="text-[#127a12]" />
              </MiniBtn>
              <MiniBtn title="Cancelar" onClick={cancel}>
                <X size={14} strokeWidth={3} className="text-[#c42b1c]" />
              </MiniBtn>
              <MiniBtn title="Buscar artículo" disabled={editingId !== 'nuevo'} onClick={() => setLookup(true)}>
                <Binoculars size={13} />
              </MiniBtn>
            </>
          )}
        </div>
        <span title="NOCALCCTE (confirmar)">{casilla('composicion_no_sumar_coste', 'No usar la suma de los precios de coste')}</span>
        </div>
        <span title="NOCALCPVP (confirmar)">
          {casilla('composicion_no_sumar_pvp', 'No usar la suma de los PVPs')}
        </span>
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
