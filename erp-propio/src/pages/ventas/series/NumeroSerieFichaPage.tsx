import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Binoculars, ChevronFirst, ChevronLast, Play } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { navDir, navIndice, useNavRegistro, type NavDir } from '../../../components/gw/useNavRegistro'
import { GwDate, GwField, GwGroup, GwInput, GwLookupButton, GwNumber, GwTabs, GwTextArea, formatGw, type GwTabDef } from '../../../components/gw'
import { GwRecordBar } from '../../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import { FilasVacias } from '../../../components/gw/GwGridParts'

// Ficha «Números de Series» (Ventas → Nº Serie) de GeminisWin: tabla articulo_numero_serie (N_SERIES).

interface NumeroSerie {
  id?: number
  numero_serie: string
  descripcion: string | null
  numero_serie_secundario: string | null
  numero_serie_electronico: string | null
  articulo_codigo: string
  marca_codigo: string | null
  color: string | null
  cliente_codigo: string | null
  fecha_venta: string | null
  garantia_meses: number | null
  fin_garantia: string | null
  observaciones: string | null
  activo: boolean
  fecha_alta: string | null
  fecha_baja: string | null
}

const VACIO: NumeroSerie = {
  numero_serie: '',
  descripcion: null,
  numero_serie_secundario: null,
  numero_serie_electronico: null,
  articulo_codigo: '',
  marca_codigo: null,
  color: null,
  cliente_codigo: null,
  fecha_venta: null,
  garantia_meses: 0,
  fin_garantia: null,
  observaciones: null,
  activo: true,
  fecha_alta: null,
  fecha_baja: null,
}

const CAMPOS =
  'id, numero_serie, descripcion, numero_serie_secundario, numero_serie_electronico, articulo_codigo, marca_codigo, color, cliente_codigo, fecha_venta, garantia_meses, fin_garantia, observaciones, activo, fecha_alta, fecha_baja'

const TAB_ROWS: GwTabDef[][] = [
  [
    { key: 'generales', label: 'Datos Generales' },
    { key: 'reparaciones', label: 'Reparaciones' },
  ],
]

interface VentaSerie {
  tienda_terminal_codigo: string
  numero: number
  fecha: string | null
  precio: number | null
}

interface ReparacionSerie {
  tienda_terminal_codigo: string
  numero: number
  fecha: string | null
  hora: string | null
  fecha_entrega: string | null
  hora_reserva: string | null
  total: number | null
  aceptado: boolean
  preparado: boolean
  entregado: boolean
  anulado: boolean
  averia: string | null
  observaciones: string | null
}

const hoy = () => new Date().toISOString().slice(0, 10)

function fmtFecha(v: string | null) {
  if (!v) return '  /  /'
  const [y, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function sumarMeses(fecha: string, meses: number) {
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00`)
  d.setMonth(d.getMonth() + meses)
  return d.toISOString().slice(0, 10)
}

function FechaInput({ value, onChange, disabled }: { value: string | null; onChange?: (v: string | null) => void; disabled?: boolean }) {
  return (
    <GwDate value={value} disabled={disabled} onChange={onChange} />
  )
}

type Lookup = 'cliente' | 'articulo' | 'marca' | 'color' | 'buscar' | null

export function NumeroSerieFichaPage() {
  const params = useParams()
  const ruta = params['*'] ?? ''
  const navigate = useNavigate()
  const isNew = ruta === 'nuevo'

  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>(isNew ? 'alta' : 'consulta')
  const [serie, setSerie] = useState<NumeroSerie>(VACIO)
  const [draft, setDraft] = useState<NumeroSerie>(VACIO)
  const [vacio, setVacio] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [inverso, setInverso] = useState(false)
  const [tab, setTab] = useState('generales')
  const [lookup, setLookup] = useState<Lookup>(null)
  const [nombreCliente, setNombreCliente] = useState('')
  const [descArticulo, setDescArticulo] = useState('')
  const [venta, setVenta] = useState<VentaSerie | null>(null)
  const [reparaciones, setReparaciones] = useState<ReparacionSerie[]>([])
  const [selRep, setSelRep] = useState(0)

  const editing = mode !== 'consulta'

  // Navegación contra el servidor: solo el vecino (gt/lt + limit 1) y el recuento, nunca la lista.
  const nav = useNavRegistro<{ id: number }>({
    tabla: 'articulo_numero_serie',
    orden: ['numero_serie', 'id'],
    actual: serie.id ? [serie.numero_serie, serie.id] : null,
    select: 'id',
  })

  useEffect(() => {
    let cancel = false
    setError(null)
    if (isNew) {
      const nuevo = { ...VACIO, fecha_alta: hoy() }
      setSerie(nuevo)
      setDraft(nuevo)
      setMode('alta')
      setVacio(false)
      setLoading(false)
      return
    }
    setLoading(true)
    const q = ruta
      ? supabase.from('articulo_numero_serie').select(CAMPOS).eq('id', Number(ruta)).maybeSingle()
      : supabase.from('articulo_numero_serie').select(CAMPOS).order('numero_serie').limit(1).maybeSingle()
    q.then(({ data, error: err }) => {
      if (cancel) return
      if (err) setError(err.message)
      if (!data) {
        setVacio(true)
        setSerie(VACIO)
        setDraft(VACIO)
      } else {
        setVacio(false)
        setSerie(data as NumeroSerie)
        setDraft(data as NumeroSerie)
      }
      setMode('consulta')
      setLoading(false)
    })
    return () => {
      cancel = true
    }
  }, [ruta, isNew])

  useEffect(() => {
    if (!draft.cliente_codigo) return setNombreCliente('')
    supabase
      .from('cliente')
      .select('nombre')
      .eq('codigo', draft.cliente_codigo)
      .maybeSingle()
      .then(({ data }) => setNombreCliente(data?.nombre ?? ''))
  }, [draft.cliente_codigo])

  useEffect(() => {
    if (!draft.articulo_codigo) return setDescArticulo('')
    supabase
      .from('articulo')
      .select('descripcion')
      .eq('codigo_interno', draft.articulo_codigo)
      .maybeSingle()
      .then(({ data }) => setDescArticulo(data?.descripcion ?? ''))
  }, [draft.articulo_codigo])

  useEffect(() => {
    if (!serie.numero_serie) {
      setVenta(null)
      setReparaciones([])
      return
    }
    supabase
      .from('venta_linea')
      .select('tienda_terminal_codigo, numero, fecha, precio')
      .eq('numero_serie', serie.numero_serie)
      .order('fecha', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => setVenta((data as VentaSerie | null) ?? null))
    supabase
      .from('pedido_cliente')
      .select('tienda_terminal_codigo, numero, fecha, hora, fecha_entrega, hora_reserva, total, aceptado, preparado, entregado, anulado, averia, observaciones')
      .eq('es_reparacion', true)
      .eq('numero_serie', serie.numero_serie)
      .order('fecha', { ascending: false })
      .then(({ data }) => {
        setReparaciones((data ?? []) as ReparacionSerie[])
        setSelRep(0)
      })
  }, [serie.numero_serie])

  function patch(p: Partial<NumeroSerie>) {
    setDraft((d) => {
      const n = { ...d, ...p }
      if (('fecha_venta' in p || 'garantia_meses' in p) && n.fecha_venta && n.garantia_meses) {
        n.fin_garantia = sumarMeses(n.fecha_venta, n.garantia_meses)
      }
      return n
    })
  }

  const idx = navIndice(nav, inverso)
  const ir = async (d: NavDir) => {
    const r = await nav.ir(navDir(d, inverso))
    if (r) navigate(`/numeros-serie/${r.id}`)
  }

  async function guardar() {
    setError(null)
    if (!draft.numero_serie.trim()) return setError('Indica el Nº de serie.')
    if (!draft.articulo_codigo.trim()) return setError('Indica el artículo del número de serie.')
    setSaving(true)
    const { id, ...payload } = draft
    const res =
      mode === 'alta'
        ? await supabase.from('articulo_numero_serie').insert(payload).select('id').single()
        : await supabase.from('articulo_numero_serie').update(payload).eq('id', id!).select('id').single()
    setSaving(false)
    if (res.error) {
      setError(res.error.code === '23505' ? `Ya existe el Nº de serie ${draft.numero_serie}.` : res.error.message)
      return
    }
    setSerie({ ...draft, id: res.data.id })
    setMode('consulta')
    navigate(`/numeros-serie/${res.data.id}`, { replace: true })
  }

  async function eliminar() {
    if (!serie.id) return
    if (!confirm(`¿Dar de baja el Nº de serie ${serie.numero_serie}?`)) return
    const { error: err } = await supabase
      .from('articulo_numero_serie')
      .update({ activo: false, fecha_baja: hoy() })
      .eq('id', serie.id)
    if (err) return setError(err.message)
    setSerie((s) => ({ ...s, activo: false, fecha_baja: hoy() }))
    setDraft((s) => ({ ...s, activo: false, fecha_baja: hoy() }))
  }

  if (loading) return <div className="gw-label p-2">Cargando…</div>

  const dis = !editing
  const rep = reparaciones[selRep]

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[minmax(0,320px)_minmax(0,1fr)_minmax(0,320px)] gap-x-1.5">
        <GwField label="Nº de Serie">
          <GwInput title="N_SERIE" value={draft.numero_serie} disabled={dis} onChange={(e) => patch({ numero_serie: e.target.value })} />
        </GwField>
        <GwField label="Descripción">
          <GwInput title="DESCRIP" value={draft.descripcion ?? ''} disabled={dis} onChange={(e) => patch({ descripcion: e.target.value || null })} />
        </GwField>
        <GwField label="Nº de Nº Identif.">
          <GwInput
            title="N_SERIE2"
            value={draft.numero_serie_secundario ?? ''}
            disabled={dis}
            onChange={(e) => patch({ numero_serie_secundario: e.target.value || null })}
          />
        </GwField>
      </div>

      {vacio && !editing && <div className="gw-label text-[#1a4fd0]">No hay números de serie. Pulsa Nuevo para dar de alta el primero.</div>}

      <GwTabs rows={TAB_ROWS} active={tab} onChange={setTab}>
        {tab === 'generales' ? (
          <div className="grid min-h-[300px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-4 gap-y-1.5">
            <div className="flex min-w-0 flex-col gap-1.5">
              <div className="grid grid-cols-[minmax(0,1fr)_150px_150px] gap-x-2">
                <GwField label="Nº Serie Electrónico">
                  <GwInput
                    title="N_SER_ELEC"
                    value={draft.numero_serie_electronico ?? ''}
                    disabled={dis}
                    onChange={(e) => patch({ numero_serie_electronico: e.target.value || null })}
                  />
                </GwField>
                <GwField label="Fecha Alta">
                  <FechaInput value={draft.fecha_alta} disabled={dis} onChange={(v) => patch({ fecha_alta: v })} />
                </GwField>
                <GwField label="Fecha Baja">
                  <FechaInput value={draft.fecha_baja} disabled={dis} onChange={(v) => patch({ fecha_baja: v })} />
                </GwField>
              </div>
              <GwGroup title="Cliente">
                <div className="flex gap-1">
                  <GwInput
                    className="!w-[120px] flex-none"
                    title="IDCLIENTE"
                    value={draft.cliente_codigo ?? ''}
                    disabled={dis}
                    onChange={(e) => patch({ cliente_codigo: e.target.value || null })}
                  />
                  <GwInput readOnly value={nombreCliente} />
                  <GwLookupButton disabled={dis} onClick={() => setLookup('cliente')} />
                </div>
              </GwGroup>
              <GwGroup title="Artículo">
                <div className="flex gap-1">
                  <GwInput
                    className="!w-[120px] flex-none"
                    title="COD_INTERN"
                    value={draft.articulo_codigo}
                    disabled={dis}
                    onChange={(e) => patch({ articulo_codigo: e.target.value })}
                  />
                  <GwInput readOnly value={descArticulo} />
                  <GwLookupButton disabled={dis} onClick={() => setLookup('articulo')} />
                </div>
              </GwGroup>
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <GwGroup title="Venta">
                <div className="grid grid-cols-[50px_minmax(0,1fr)_120px_minmax(0,1fr)] gap-x-1.5">
                  <GwField label="Tie.">
                    <GwInput readOnly disabled value={venta?.tienda_terminal_codigo ?? ''} />
                  </GwField>
                  <GwField label="Nº Venta">
                    <GwInput readOnly disabled className="text-right" value={venta?.numero ?? ''} />
                  </GwField>
                  <GwField label="Fecha">
                    <GwInput readOnly disabled value={venta ? fmtFecha(venta.fecha) : '  /  /'} />
                  </GwField>
                  <GwField label="Precio">
                    <GwInput readOnly disabled className="text-right" value={venta ? formatGw(venta.precio, 3) : ''} />
                  </GwField>
                </div>
              </GwGroup>
              <GwGroup title="Garantía" className="max-w-[460px]">
                <div className="grid grid-cols-[150px_80px_150px] gap-x-1.5">
                  <GwField label="Inicio">
                    <FechaInput value={draft.fecha_venta} disabled={dis} onChange={(v) => patch({ fecha_venta: v })} />
                  </GwField>
                  <GwField label="Meses">
                    <GwNumber value={draft.garantia_meses} decimals={0} disabled={dis} emptyAsZero onChange={(v) => patch({ garantia_meses: v })} />
                  </GwField>
                  <GwField label="Final">
                    <FechaInput value={draft.fin_garantia} disabled={dis} onChange={(v) => patch({ fin_garantia: v })} />
                  </GwField>
                </div>
              </GwGroup>
              <div className="grid grid-cols-2 gap-x-2">
                <GwField label="Marca">
                  <div className="flex gap-1">
                    <GwInput title="MARCA" value={draft.marca_codigo ?? ''} disabled={dis} onChange={(e) => patch({ marca_codigo: e.target.value || null })} />
                    <GwLookupButton disabled={dis} onClick={() => setLookup('marca')} />
                  </div>
                </GwField>
                <GwField label="Color">
                  <div className="flex gap-1">
                    <GwInput title="COLOR" value={draft.color ?? ''} disabled={dis} onChange={(e) => patch({ color: e.target.value || null })} />
                    <GwLookupButton disabled={dis} onClick={() => setLookup('color')} />
                  </div>
                </GwField>
              </div>
            </div>

            <GwField label="Observaciones" className="col-span-2">
              <GwTextArea
                rows={4}
                title="OBSERV"
                value={draft.observaciones ?? ''}
                disabled={dis}
                onChange={(e) => patch({ observaciones: e.target.value || null })}
              />
            </GwField>
          </div>
        ) : (
          <div className="flex min-h-[300px] flex-col gap-1">
            <div className="h-[262px] overflow-auto border border-[var(--gw-border)] bg-white">
              <table className="gw-grid min-w-[1050px]">
                <thead className="sticky top-0">
                  <tr>
                    <th style={{ width: 50 }}>Tie.</th>
                    <th style={{ width: 90 }}>Número</th>
                    <th style={{ width: 90 }}>Fecha</th>
                    <th style={{ width: 60 }}>Hora</th>
                    <th style={{ width: 100 }}>Fe. Entrega</th>
                    <th style={{ width: 70 }}>Hr. Entr.</th>
                    <th style={{ width: 90 }} className="text-right!">
                      Total
                    </th>
                    <th style={{ width: 54 }}>Acept.</th>
                    <th style={{ width: 44 }}>Fin.</th>
                    <th style={{ width: 48 }}>Entr.</th>
                    <th style={{ width: 48 }}>Anul.</th>
                    <th style={{ width: 140 }}>Averia</th>
                    <th>Observaciones</th>
                  </tr>
                </thead>
                <tbody>
                  {reparaciones.map((r, i) => (
                    <tr
                      key={`${r.tienda_terminal_codigo}-${r.numero}`}
                      className={i === selRep ? 'gw-selected' : ''}
                      onClick={() => setSelRep(i)}
                      onDoubleClick={() => navigate(`/reparaciones/${r.tienda_terminal_codigo}/${r.numero}`)}
                    >
                      <td>{r.tienda_terminal_codigo}</td>
                      <td className="text-right">{r.numero}</td>
                      <td>{fmtFecha(r.fecha)}</td>
                      <td>{r.hora ?? ''}</td>
                      <td>{fmtFecha(r.fecha_entrega)}</td>
                      <td>{r.hora_reserva ?? ''}</td>
                      <td className="text-right">{formatGw(r.total ?? 0, 3)}</td>
                      <td className="text-center">{r.aceptado ? '✓' : ''}</td>
                      <td className="text-center">{r.preparado ? '✓' : ''}</td>
                      <td className="text-center">{r.entregado ? '✓' : ''}</td>
                      <td className="text-center">{r.anulado ? '✓' : ''}</td>
                      <td className="truncate">{r.averia ?? ''}</td>
                      <td className="truncate">{r.observaciones ?? ''}</td>
                    </tr>
                  ))}
                  <FilasVacias cols={13} ocupadas={reparaciones.length} total={9} />
                </tbody>
              </table>
            </div>
            <div className="flex w-[530px] border border-[var(--gw-border)] bg-[var(--gw-face)]">
              {[
                { t: 'Primero', i: <ChevronFirst size={14} />, f: () => setSelRep(0) },
                { t: 'Anterior', i: <Play size={10} className="rotate-180" fill="currentColor" />, f: () => setSelRep((s) => Math.max(0, s - 1)) },
                { t: 'Siguiente', i: <Play size={10} fill="currentColor" />, f: () => setSelRep((s) => Math.min(reparaciones.length - 1, s + 1)) },
                { t: 'Último', i: <ChevronLast size={14} />, f: () => setSelRep(Math.max(0, reparaciones.length - 1)) },
                { t: 'Abrir reparación', i: <Binoculars size={14} />, f: () => rep && navigate(`/reparaciones/${rep.tienda_terminal_codigo}/${rep.numero}`) },
              ].map((b) => (
                <button
                  key={b.t}
                  type="button"
                  title={b.t}
                  disabled={reparaciones.length === 0}
                  onClick={b.f}
                  className="flex h-[26px] flex-1 items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#a8a8a8]"
                >
                  {b.i}
                </button>
              ))}
            </div>
          </div>
        )}
      </GwTabs>

      <GwRecordBar
        mode={mode}
        canNavigate={mode === 'consulta' && idx >= 0}
        saving={saving}
        onFirst={() => ir('primero')}
        onPrev={() => ir('anterior')}
        onNext={() => ir('siguiente')}
        onLast={() => ir('ultimo')}
        onSort={() => setInverso((v) => !v)}
        onSearch={() => setLookup('buscar')}
        onPrint={() => window.print()}
        onNew={() => navigate('/numeros-serie/nuevo')}
        onEdit={() => !vacio && setMode('edicion')}
        onDelete={eliminar}
        onSave={guardar}
        onCancel={() => {
          if (mode === 'alta') return navigate('/numeros-serie')
          setDraft(serie)
          setMode('consulta')
        }}
        onExit={() => navigate('/')}
      />
      <div className="gw-label text-[11px] text-[#444]">
        {error ? <span className="text-[#c42b1c]">{error}</span> : mode === 'alta' ? 'Alta de número de serie' : !serie.activo ? 'Número de serie dado de baja' : ''}
      </div>

      {lookup === 'cliente' && (
        <GwLookupDialog<{ codigo: string; nombre: string; nif: string | null }>
          title="Clientes"
          table="cliente"
          keyColumn="codigo"
          orderBy="codigo"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'nombre', label: 'Nombre' },
            { key: 'nif', label: 'NIF', width: 110 },
          ]}
          searchColumns={['codigo', 'nombre', 'nif']}
          onPick={(r) => {
            patch({ cliente_codigo: r.codigo })
            setLookup(null)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'articulo' && (
        <GwLookupDialog<{ codigo_interno: string; descripcion: string; marca_codigo: string | null; garantia_meses: number | null }>
          title="Artículos"
          table="articulo"
          keyColumn="codigo_interno"
          orderBy="codigo_interno"
          columns={[
            { key: 'codigo_interno', label: 'Código', width: 110 },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'marca_codigo', label: 'Marca', width: 120 },
            { key: 'garantia_meses', label: 'Garantía', width: 70 },
          ]}
          searchColumns={['codigo_interno', 'descripcion', 'codigo_barras_principal']}
          onPick={(r) => {
            patch({
              articulo_codigo: r.codigo_interno,
              marca_codigo: draft.marca_codigo ?? r.marca_codigo,
              garantia_meses: draft.garantia_meses || r.garantia_meses || 0,
            })
            setLookup(null)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'marca' && (
        <GwLookupDialog<{ codigo: string }>
          title="Marcas"
          table="marca"
          keyColumn="codigo"
          orderBy="codigo"
          columns={[{ key: 'codigo', label: 'Marca' }]}
          searchColumns={['codigo']}
          onPick={(r) => {
            patch({ marca_codigo: r.codigo })
            setLookup(null)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'color' && (
        <GwLookupDialog<{ id: number; descripcion: string }>
          title="Colores"
          table="color"
          keyColumn="id"
          orderBy="descripcion"
          columns={[
            { key: 'id', label: 'Id', width: 60 },
            { key: 'descripcion', label: 'Color' },
          ]}
          searchColumns={['descripcion']}
          onPick={(r) => {
            patch({ color: r.descripcion })
            setLookup(null)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'buscar' && (
        <GwLookupDialog<{ id: number; numero_serie: string; descripcion: string | null; articulo_codigo: string; cliente_codigo: string | null }>
          title="Localizar números de serie"
          table="articulo_numero_serie"
          keyColumn="id"
          orderBy="numero_serie"
          columns={[
            { key: 'numero_serie', label: 'Nº de Serie', width: 160 },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'articulo_codigo', label: 'Artículo', width: 110 },
            { key: 'cliente_codigo', label: 'Cliente', width: 80 },
            { key: 'id', label: 'Id', width: 50 },
          ]}
          searchColumns={['numero_serie', 'numero_serie_secundario', 'numero_serie_electronico', 'descripcion']}
          onPick={(r) => {
            setLookup(null)
            navigate(`/numeros-serie/${r.id}`)
          }}
          onClose={() => setLookup(null)}
        />
      )}
    </div>
  )
}
