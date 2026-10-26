import { useEffect, useState } from 'react'
import { Binoculars, Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import {
  GwCheck,
  GwField,
  GwGroup,
  GwInput,
  GwLookupButton,
  GwNumber,
  GwRadio,
  GwSelect,
  GwTabs,
  formatGw,
} from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import type { ClienteTabProps } from '../types'

const NIVELES = [
  { nivel: 0, nombre: 'General' },
  { nivel: 1, nombre: 'MAYOR M-1' },
  { nivel: 2, nombre: 'MAYOR M-2' },
  { nivel: 3, nombre: 'MAYOR M-3' },
  { nivel: 4, nombre: 'Tarifa Dto-4' },
  { nivel: 5, nombre: 'Tarifa Dto-5' },
  { nivel: 6, nombre: 'Tarifa Dto-6' },
]

const nombreNivel = (n: string | number | null) => NIVELES.find((x) => String(x.nivel) === String(n))?.nombre ?? (n ?? '')

function ErrorBox({ msg }: { msg: string | null }) {
  if (!msg) return null
  return <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{msg}</div>
}

function fecha(v: string | null) {
  if (!v) return ''
  const [y, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

export function TabTarifas(props: ClienteTabProps) {
  const [sub, setSub] = useState('tarifas')
  return (
    <GwTabs
      rows={[
        [
          { key: 'tarifas', label: 'Tarifas y descuentos' },
          { key: 'precios', label: 'Precios fijos por artículo' },
        ],
      ]}
      active={sub}
      onChange={setSub}
    >
      {sub === 'tarifas' ? <TarifasDescuentos {...props} /> : <PreciosFijos {...props} />}
    </GwTabs>
  )
}

function TarifasDescuentos({ cliente, editing, onChange }: ClienteTabProps) {
  const disabled = !editing
  return (
    <div className="grid grid-cols-[minmax(0,420px)_minmax(0,1fr)] gap-2">
      <div className="flex flex-col gap-1.5">
        <GwGroup title="Tarifas y descuentos" className="grid grid-cols-2 gap-x-3 gap-y-1">
          <GwField label="Incremento fijo sobre coste %" className="col-span-2">
            <span
              className="w-[110px]"
              title="INCCOSTE — si se indica, anula el resto de precios: el PVP es el coste más este %"
            >
              <GwNumber
                decimals={2}
                value={cliente.incremento_sobre_coste_pct}
                disabled={disabled}
                onChange={(v) => onChange({ incremento_sobre_coste_pct: v })}
              />
            </span>
          </GwField>
          <GwField label="Descuento %">
            <span className="w-[110px]" title="DESCUENTO">
              <GwNumber decimals={2} value={cliente.descuento_pct} disabled={disabled} onChange={(v) => onChange({ descuento_pct: v })} />
            </span>
          </GwField>
          <div className="flex flex-col justify-end gap-0.5 pb-0.5" title="Dónde se aplica el descuento">
            <GwRadio
              name="dto-donde"
              label="En línea"
              checked={!cliente.descuento_en_pie}
              disabled={disabled}
              onChange={() => onChange({ descuento_en_pie: false })}
            />
            <GwRadio
              name="dto-donde"
              label="En pie"
              checked={cliente.descuento_en_pie}
              disabled={disabled}
              onChange={() => onChange({ descuento_en_pie: true })}
            />
          </div>
          <GwField label="Descuento ficticio %" className="col-span-2">
            <span className="w-[110px]" title="DTOFICTICIO — se aplica manteniendo visible el PVP">
              <GwNumber
                decimals={2}
                value={cliente.descuento_ficticio_pct}
                disabled={disabled}
                onChange={(v) => onChange({ descuento_ficticio_pct: v })}
              />
            </span>
          </GwField>
          <GwField label="Tarifa predeterminada" className="col-span-2">
            <GwSelect
              title="TARIFA"
              className="!w-[200px]"
              value={cliente.tarifa_nivel_defecto ?? ''}
              disabled={disabled}
              onChange={(e) => onChange({ tarifa_nivel_defecto: e.target.value === '' ? null : Number(e.target.value) })}
            >
              <option value="" />
              {NIVELES.map((n) => (
                <option key={n.nivel} value={n.nivel}>
                  {n.nombre}
                </option>
              ))}
            </GwSelect>
          </GwField>
        </GwGroup>
        <GwGroup title="Opciones" className="flex flex-col gap-0.5">
          <GwCheck
            label="No permitir modificar la tarifa al vender"
            checked={cliente.no_permite_modificar_tarifa}
            disabled={disabled}
            onChange={(v) => onChange({ no_permite_modificar_tarifa: v })}
          />
          <GwCheck
            label="No aplicar el canon"
            checked={cliente.no_aplica_impuesto2}
            disabled={disabled}
            onChange={(v) => onChange({ no_aplica_impuesto2: v })}
          />
        </GwGroup>
      </div>
      <TarifaPorFamilia clienteCodigo={cliente.codigo} editing={editing} />
    </div>
  )
}

interface FilaFamilia {
  cliente_codigo: string
  grupo_familia: number
  nivel_tarifa: string | null
}

function TarifaPorFamilia({ clienteCodigo, editing }: { clienteCodigo: string; editing: boolean }) {
  const [rows, setRows] = useState<FilaFamilia[]>([])
  const [sel, setSel] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)
  const [nueva, setNueva] = useState<{ grupo: number | null; nivel: string }>({ grupo: null, nivel: '0' })
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!clienteCodigo) return setRows([])
    const { data } = await supabase
      .from('cliente_descuento_familia')
      .select('cliente_codigo, grupo_familia, nivel_tarifa')
      .eq('cliente_codigo', clienteCodigo)
      .order('grupo_familia')
    setRows((data ?? []) as FilaFamilia[])
  }

  useEffect(() => {
    load()
    setAdding(false)
    setSel(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteCodigo])

  async function add() {
    setError(null)
    if (nueva.grupo == null) return setError('Indica el nivel de familia.')
    if (rows.some((r) => r.grupo_familia === nueva.grupo)) return setError(`El nivel de familia ${nueva.grupo} ya tiene tarifa.`)
    const { error: err } = await supabase
      .from('cliente_descuento_familia')
      .insert({ cliente_codigo: clienteCodigo, grupo_familia: nueva.grupo, nivel_tarifa: nueva.nivel })
    if (err) return setError(err.message)
    setAdding(false)
    load()
  }

  async function remove() {
    if (sel == null || !confirm(`¿Borrar la tarifa del nivel de familia ${sel}?`)) return
    const { error: err } = await supabase
      .from('cliente_descuento_familia')
      .delete()
      .eq('cliente_codigo', clienteCodigo)
      .eq('grupo_familia', sel)
    if (err) return setError(err.message)
    setSel(null)
    load()
  }

  return (
    <GwGroup title="Tarifa por nivel de familia" className="flex flex-col gap-1.5">
      <div className="flex gap-1">
        <button
          type="button"
          className="gw-btn"
          disabled={!editing || adding || !clienteCodigo}
          onClick={() => {
            setError(null)
            setNueva({ grupo: null, nivel: '0' })
            setAdding(true)
          }}
        >
          <Plus size={14} /> Añadir línea
        </button>
        <button type="button" className="gw-btn" disabled={!editing || sel == null || adding} onClick={remove}>
          <Trash2 size={14} /> Borrar línea
        </button>
      </div>
      <ErrorBox msg={error} />
      <table className="gw-grid" title="NIVEL_DT">
        <thead>
          <tr>
            <th style={{ width: 140 }}>Nivel de familia</th>
            <th>Tarifa</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && !adding && (
            <tr>
              <td colSpan={2} className="text-center text-[#6d6d6d]">
                Sin tarifas por familia.
              </td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.grupo_familia} className={sel === r.grupo_familia ? 'gw-selected' : ''} onClick={() => setSel(r.grupo_familia)}>
              <td>{r.grupo_familia}</td>
              <td>{nombreNivel(r.nivel_tarifa)}</td>
            </tr>
          ))}
          {adding && (
            <tr>
              <td>
                <GwNumber decimals={0} value={nueva.grupo} onChange={(v) => setNueva({ ...nueva, grupo: v })} />
              </td>
              <td>
                <div className="flex gap-1">
                  <GwSelect value={nueva.nivel} onChange={(e) => setNueva({ ...nueva, nivel: e.target.value })}>
                    {NIVELES.map((n) => (
                      <option key={n.nivel} value={n.nivel}>
                        {n.nombre}
                      </option>
                    ))}
                  </GwSelect>
                  <button type="button" className="gw-btn px-1.5" title="Aceptar" onClick={add}>
                    <Check size={14} className="text-[#127a12]" />
                  </button>
                  <button type="button" className="gw-btn px-1.5" title="Cancelar" onClick={() => setAdding(false)}>
                    <X size={14} className="text-[#c42b1c]" />
                  </button>
                </div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </GwGroup>
  )
}

interface PrecioFijo {
  cliente_codigo: string
  articulo_codigo: string
  pvp: number
  cantidad_minima: number | null
  fecha_inicio: string | null
  fecha_fin: string | null
  articulo?: { descripcion: string } | null
}

interface Borrador {
  articulo_codigo: string
  descripcion: string
  fecha_inicio: string
  fecha_fin: string
  pvp: number | null
  cantidad_minima: number | null
}

interface ArticuloLookup extends Record<string, unknown> {
  codigo_interno: string
  descripcion: string
}

const LOOKUP_COLS = [
  { key: 'codigo_interno', label: 'Código Interno', width: 140 },
  { key: 'descripcion', label: 'Descripción' },
]
const LOOKUP_SEARCH = ['codigo_interno', 'descripcion']
const LIMITE = 200

const vacio: Borrador = { articulo_codigo: '', descripcion: '', fecha_inicio: '', fecha_fin: '', pvp: null, cantidad_minima: null }

function PreciosFijos({ cliente, editing, onChange }: ClienteTabProps) {
  const clienteCodigo = cliente.codigo
  const [rows, setRows] = useState<PrecioFijo[]>([])
  const [total, setTotal] = useState(0)
  const [filtro, setFiltro] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [modo, setModo] = useState<'nuevo' | 'editar' | null>(null)
  const [draft, setDraft] = useState<Borrador>(vacio)
  const [lookup, setLookup] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    if (!clienteCodigo) {
      setRows([])
      setTotal(0)
      return
    }
    let q = supabase
      .from('cliente_articulo_precio')
      .select('cliente_codigo, articulo_codigo, pvp, cantidad_minima, fecha_inicio, fecha_fin, articulo:articulo_codigo(descripcion)', {
        count: 'exact',
      })
      .eq('cliente_codigo', clienteCodigo)
      .order('articulo_codigo')
      .limit(LIMITE)
    const f = filtro.trim().replace(/[,%()]/g, ' ')
    if (f) q = q.ilike('articulo_codigo', `${f}%`)
    const { data, count } = await q
    setRows((data ?? []) as unknown as PrecioFijo[])
    setTotal(count ?? 0)
  }

  useEffect(() => {
    const t = setTimeout(load, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteCodigo, filtro])

  useEffect(() => {
    setModo(null)
    setSel(null)
  }, [clienteCodigo])

  async function resolverArticulo(codigo: string) {
    const c = codigo.trim()
    if (!c) return
    const { data } = await supabase.from('articulo').select('descripcion').eq('codigo_interno', c).maybeSingle()
    setDraft((d) => ({ ...d, articulo_codigo: c, descripcion: data?.descripcion ?? '' }))
    if (!data) setError(`No existe el artículo ${c}.`)
    else setError(null)
  }

  function nuevo() {
    setError(null)
    setDraft(vacio)
    setModo('nuevo')
  }

  function modificar() {
    const r = rows.find((x) => x.articulo_codigo === sel)
    if (!r) return
    setError(null)
    setDraft({
      articulo_codigo: r.articulo_codigo,
      descripcion: r.articulo?.descripcion ?? '',
      fecha_inicio: r.fecha_inicio ?? '',
      fecha_fin: r.fecha_fin ?? '',
      pvp: r.pvp == null ? null : Number(r.pvp),
      cantidad_minima: r.cantidad_minima == null ? null : Number(r.cantidad_minima),
    })
    setModo('editar')
  }

  async function guardar() {
    setError(null)
    const codigo = draft.articulo_codigo.trim()
    if (!codigo) return setError('Indica el artículo.')
    if (draft.pvp == null) return setError('Indica el PVP.')
    if (draft.fecha_inicio && draft.fecha_fin && draft.fecha_fin < draft.fecha_inicio)
      return setError('La fecha «hasta» es anterior a la fecha «desde».')
    const valores = {
      pvp: draft.pvp,
      cantidad_minima: draft.cantidad_minima,
      fecha_inicio: draft.fecha_inicio || null,
      fecha_fin: draft.fecha_fin || null,
    }
    if (modo === 'nuevo') {
      const { data: existe } = await supabase
        .from('cliente_articulo_precio')
        .select('articulo_codigo')
        .eq('cliente_codigo', clienteCodigo)
        .eq('articulo_codigo', codigo)
        .maybeSingle()
      if (existe) return setError(`El artículo ${codigo} ya tiene precio fijo para este cliente: modifícalo en vez de añadirlo otra vez.`)
      const { error: err } = await supabase
        .from('cliente_articulo_precio')
        .insert({ cliente_codigo: clienteCodigo, articulo_codigo: codigo, ...valores })
      if (err) return setError(err.code === '23503' ? `No existe el artículo ${codigo}.` : err.message)
    } else {
      const { error: err } = await supabase
        .from('cliente_articulo_precio')
        .update(valores)
        .eq('cliente_codigo', clienteCodigo)
        .eq('articulo_codigo', codigo)
      if (err) return setError(err.message)
    }
    setModo(null)
    setSel(codigo)
    load()
  }

  async function borrar() {
    if (!sel || !confirm(`¿Borrar el precio fijo del artículo ${sel}?`)) return
    const { error: err } = await supabase
      .from('cliente_articulo_precio')
      .delete()
      .eq('cliente_codigo', clienteCodigo)
      .eq('articulo_codigo', sel)
    if (err) return setError(err.message)
    setSel(null)
    load()
  }

  const filaEdicion = (
    <tr key="__edicion">
      <td>
        <div className="flex">
          <GwInput
            autoFocus={modo === 'nuevo'}
            disabled={modo === 'editar'}
            value={draft.articulo_codigo}
            onChange={(e) => setDraft({ ...draft, articulo_codigo: e.target.value })}
            onBlur={(e) => modo === 'nuevo' && resolverArticulo(e.target.value)}
          />
          {modo === 'nuevo' && <GwLookupButton onClick={() => setLookup(true)} title="Buscar artículo" />}
        </div>
      </td>
      <td>{draft.descripcion}</td>
      <td>
        <GwInput type="date" value={draft.fecha_inicio} onChange={(e) => setDraft({ ...draft, fecha_inicio: e.target.value })} />
      </td>
      <td>
        <GwInput type="date" value={draft.fecha_fin} onChange={(e) => setDraft({ ...draft, fecha_fin: e.target.value })} />
      </td>
      <td>
        <GwNumber decimals={3} value={draft.pvp} onChange={(v) => setDraft({ ...draft, pvp: v })} />
      </td>
      <td>
        <div className="flex gap-1">
          <GwNumber decimals={3} value={draft.cantidad_minima} onChange={(v) => setDraft({ ...draft, cantidad_minima: v })} />
          <button type="button" className="gw-btn px-1.5" title="Aceptar" onClick={guardar}>
            <Check size={14} className="text-[#127a12]" />
          </button>
          <button type="button" className="gw-btn px-1.5" title="Cancelar" onClick={() => setModo(null)}>
            <X size={14} className="text-[#c42b1c]" />
          </button>
        </div>
      </td>
    </tr>
  )

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-end gap-1">
        <button type="button" className="gw-btn" disabled={!editing || !!modo || !clienteCodigo} onClick={nuevo}>
          <Plus size={14} /> Añadir línea
        </button>
        <button type="button" className="gw-btn" disabled={!editing || !!modo || !sel} onClick={modificar}>
          <Pencil size={14} /> Modificar línea
        </button>
        <button type="button" className="gw-btn" disabled={!editing || !!modo || !sel} onClick={borrar}>
          <Trash2 size={14} /> Borrar línea
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!editing || !clienteCodigo}
          onClick={() => {
            if (!modo) nuevo()
            setLookup(true)
          }}
        >
          <Binoculars size={14} /> Buscar artículo
        </button>
        <GwField label="Artículo desde" className="ml-3">
          <GwInput className="!w-[160px]" value={filtro} onChange={(e) => setFiltro(e.target.value)} />
        </GwField>
        <span className="ml-auto" title="PVPFIJO">
          <GwCheck label="PVPs fijos, sin ofertas y dtos" checked={cliente.pvp_fijos} disabled={!editing} onChange={(v) => onChange({ pvp_fijos: v })} />
        </span>
      </div>
      <ErrorBox msg={error} />
      <div className="max-h-[360px] overflow-y-auto border border-[var(--gw-border)]">
        <table className="gw-grid" title="CLIENART">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 170 }}>Artículo</th>
              <th>Descripción</th>
              <th style={{ width: 130 }}>Desde</th>
              <th style={{ width: 130 }}>Hasta</th>
              <th style={{ width: 110 }} className="text-right!">
                PVP
              </th>
              <th style={{ width: 170 }} className="text-right!">
                Cantidad
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !modo && (
              <tr>
                <td colSpan={6} className="text-center text-[#6d6d6d]">
                  Sin precios fijos.
                </td>
              </tr>
            )}
            {modo === 'nuevo' && filaEdicion}
            {rows.map((r) =>
              modo === 'editar' && r.articulo_codigo === sel ? (
                filaEdicion
              ) : (
                <tr
                  key={r.articulo_codigo}
                  className={sel === r.articulo_codigo ? 'gw-selected' : ''}
                  onClick={() => !modo && setSel(r.articulo_codigo)}
                  onDoubleClick={() => editing && !modo && modificar()}
                >
                  <td>{r.articulo_codigo}</td>
                  <td>{r.articulo?.descripcion ?? ''}</td>
                  <td>{fecha(r.fecha_inicio)}</td>
                  <td>{fecha(r.fecha_fin)}</td>
                  <td className="text-right">{formatGw(r.pvp, 3)}</td>
                  <td className="text-right">{r.cantidad_minima == null ? '' : formatGw(r.cantidad_minima, 3)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      </div>
      <span className="gw-label">
        {total > rows.length ? `Se muestran ${rows.length} de ${total} precios: filtra por artículo para ver el resto.` : `${total} precios fijos`}
      </span>
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
            setDraft((d) => ({ ...d, articulo_codigo: a.codigo_interno, descripcion: a.descripcion }))
            setError(null)
            setLookup(false)
          }}
        />
      )}
    </div>
  )
}
