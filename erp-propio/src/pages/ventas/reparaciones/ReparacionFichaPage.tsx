import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, FilePen, FilePlus2, FileX2, Binoculars, Tag, Package, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwField, GwGroup, GwInput, GwLookupButton, GwNumber, GwSelect, GwTextArea, GwWindow, formatGw } from '../../../components/gw'
import { GwRecordBar } from '../../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import { FilasVacias } from '../../../components/gw/GwGridParts'

// Ficha «Reparaciones» (Ventas → Reparaciones, CTRL+F11) de GeminisWin. En GeminisWin una reparación
// es un pedido de cliente con REPA = Sí (pedido_cliente.es_reparacion): misma numeración, mismas líneas
// (con técnico y Nº de serie por línea) y mismos estados (Presupuesto, Anulada, Aceptada, Realizada,
// Entregada y paso a venta/factura).

interface Reparacion {
  tienda_terminal_codigo: string
  numero: number | null
  fecha: string | null
  hora: string | null
  empleado_codigo: string | null
  vendedor_codigo: string | null
  tecnico_codigo: string | null
  cliente_codigo: string
  cliente_sucursal_codigo: string | null
  nombre_cliente: string | null
  tarifa_nivel: number | null
  es_presupuesto: boolean
  numero_serie: string | null
  averia: string | null
  fecha_entrega: string | null
  hora_reserva: string | null
  observaciones: string | null
  anulado: boolean
  aceptado: boolean
  preparado: boolean
  entregado: boolean
  descuento_pie_pct: number | null
  igic_pie_pct: number | null
  subtotal: number | null
  total_descuento_pie: number | null
  subtotal_2: number | null
  total_igic_pie: number | null
  total: number | null
  venta_tienda_codigo: string | null
  venta_numero: number | null
}

interface Linea {
  numero_linea: number
  articulo_codigo: string
  codigo_venta: string | null
  descripcion: string | null
  tecnico_codigo: string | null
  numero_serie: string | null
  cantidad: number
  precio: number | null
  descuento_pct: number | null
  igic_pct: number | null
  impuesto2_pct: number | null // canon por unidad (IMPU2), como en Artículos
}

interface SerieInfo {
  numero_serie: string
  descripcion: string | null
  numero_serie_secundario: string | null
  articulo_codigo: string
  fecha_venta: string | null
  garantia_meses: number | null
  fin_garantia: string | null
  observaciones: string | null
}

interface VentaInfo {
  fecha: string | null
  hora: string | null
  tipo_credito: string | null
  factura_tienda_codigo: string | null
  factura_numero: number | null
}

interface FacturaInfo {
  serie: string | null
  n_factura: number | null
  fecha_factura: string | null
  hora_factura: string | null
}

const CAMPOS =
  'tienda_terminal_codigo, numero, fecha, hora, empleado_codigo, vendedor_codigo, tecnico_codigo, cliente_codigo, cliente_sucursal_codigo, nombre_cliente, tarifa_nivel, es_presupuesto, numero_serie, averia, fecha_entrega, hora_reserva, observaciones, anulado, aceptado, preparado, entregado, descuento_pie_pct, igic_pie_pct, subtotal, total_descuento_pie, subtotal_2, total_igic_pie, total, venta_tienda_codigo, venta_numero'

const ahora = () => {
  const d = new Date()
  return { fecha: d.toISOString().slice(0, 10), hora: d.toTimeString().slice(0, 5) }
}

function vacia(tienda: string): Reparacion {
  const { fecha, hora } = ahora()
  return {
    tienda_terminal_codigo: tienda,
    numero: null,
    fecha,
    hora,
    empleado_codigo: null,
    vendedor_codigo: null,
    tecnico_codigo: null,
    cliente_codigo: '',
    cliente_sucursal_codigo: null,
    nombre_cliente: null,
    tarifa_nivel: 0,
    es_presupuesto: false,
    numero_serie: null,
    averia: null,
    fecha_entrega: null,
    hora_reserva: null,
    observaciones: null,
    anulado: false,
    aceptado: false,
    preparado: false,
    entregado: false,
    descuento_pie_pct: 0,
    igic_pie_pct: 0,
    subtotal: 0,
    total_descuento_pie: 0,
    subtotal_2: 0,
    total_igic_pie: 0,
    total: 0,
    venta_tienda_codigo: null,
    venta_numero: null,
  }
}

const r3 = (n: number) => Math.round(n * 1000) / 1000

function calcular(lineas: Linea[], dtoPie: number) {
  let subtotal = 0
  let canon = 0
  let igic = 0
  for (const l of lineas) {
    const base = (l.cantidad || 0) * (l.precio ?? 0) * (1 - (l.descuento_pct ?? 0) / 100)
    const c = (l.cantidad || 0) * (l.impuesto2_pct ?? 0)
    subtotal += base
    canon += c
    igic += (base * (1 - dtoPie / 100) + c) * ((l.igic_pct ?? 0) / 100)
  }
  const dto = subtotal * (dtoPie / 100)
  return {
    subtotal: r3(subtotal),
    total_descuento_pie: r3(dto),
    subtotal_2: r3(subtotal - dto),
    canon: r3(canon),
    total_igic_pie: r3(igic),
    total: r3(subtotal - dto + canon + igic),
  }
}

function fmtFecha(v: string | null) {
  if (!v) return '  /  /'
  const [y, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** Botón-casilla de estado de GeminisWin: texto subrayado con ✓ verde o × roja. */
function Estado({ label, value, onClick, disabled, vertical }: { label: string; value: boolean; onClick?: () => void; disabled?: boolean; vertical?: boolean }) {
  const icono = value ? <Check size={14} strokeWidth={3} className="text-[#127a12]" /> : <X size={14} strokeWidth={3} className="text-[#c42b1c]" />
  return (
    <button
      type="button"
      className={`gw-btn ${vertical ? 'h-[44px] flex-col gap-0 px-3' : 'h-[30px] px-3'} text-[14px]`}
      onClick={onClick}
      disabled={disabled}
      title={label}
    >
      {vertical ? (
        <>
          <span className="underline decoration-1 underline-offset-2">{label}</span>
          {icono}
        </>
      ) : (
        <>
          {icono}
          <span className="underline decoration-1 underline-offset-2">{label}</span>
        </>
      )}
    </button>
  )
}

function MiniBtn({ title, onClick, disabled, children, ancho = 58 }: { title: string; onClick?: () => void; disabled?: boolean; children: ReactNode; ancho?: number }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      style={{ width: ancho }}
      className="flex h-[26px] items-center justify-center gap-1 border-r border-[var(--gw-border-light)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

type Lookup = 'empleado' | 'vendedor' | 'tecnico' | 'cliente' | 'serie' | 'articulo_linea' | 'buscar' | null

type CodNom = { codigo: string; nombre: string }

export function ReparacionFichaPage() {
  const params = useParams()
  const ruta = params['*'] ?? ''
  const navigate = useNavigate()
  const isNew = ruta === 'nuevo'
  const [tiendaRuta, numeroRuta] = ruta.split('/')

  const [tiendas, setTiendas] = useState<string[]>([])
  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>(isNew ? 'alta' : 'consulta')
  const [rep, setRep] = useState<Reparacion>(vacia('01'))
  const [draft, setDraft] = useState<Reparacion>(vacia('01'))
  const [lineas, setLineas] = useState<Linea[]>([])
  const [lineasOrig, setLineasOrig] = useState<Linea[]>([])
  const [selLinea, setSelLinea] = useState(0)
  const [vacio, setVacio] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lista, setLista] = useState<{ tienda_terminal_codigo: string; numero: number }[]>([])
  const [lookup, setLookup] = useState<Lookup>(null)
  const [nombres, setNombres] = useState<{ empleado: string; vendedor: string; tecnico: string; cliente: string; articuloSerie: string }>({
    empleado: '',
    vendedor: '',
    tecnico: '',
    cliente: '',
    articuloSerie: '',
  })
  const [serie, setSerie] = useState<SerieInfo | null>(null)
  const [venta, setVenta] = useState<VentaInfo | null>(null)
  const [factura, setFactura] = useState<FacturaInfo | null>(null)
  const [stock, setStock] = useState<{ codigoCompra: string | null; stock: number; pedido: number } | null>(null)

  const editing = mode !== 'consulta'
  const dis = !editing

  useEffect(() => {
    supabase
      .from('tienda_terminal')
      .select('codigo')
      .order('codigo')
      .then(({ data }) => setTiendas((data ?? []).map((t) => t.codigo as string)))
  }, [])

  useEffect(() => {
    supabase
      .from('pedido_cliente')
      .select('tienda_terminal_codigo, numero')
      .eq('es_reparacion', true)
      .order('tienda_terminal_codigo')
      .order('numero')
      .then(({ data }) => setLista((data ?? []) as { tienda_terminal_codigo: string; numero: number }[]))
  }, [rep.numero])

  useEffect(() => {
    let cancel = false
    setError(null)
    if (isNew) {
      ;(async () => {
        const { data: emp } = await supabase.rpc('fn_empleado_actual')
        const tienda = tiendas[0] ?? '01'
        const nueva = { ...vacia(tienda), empleado_codigo: (emp as string | null) ?? null }
        if (cancel) return
        setRep(nueva)
        setDraft(nueva)
        setLineas([])
        setLineasOrig([])
        setMode('alta')
        setVacio(false)
        setLoading(false)
      })()
      return () => {
        cancel = true
      }
    }
    setLoading(true)
    ;(async () => {
      const q =
        tiendaRuta && numeroRuta
          ? supabase.from('pedido_cliente').select(CAMPOS).eq('tienda_terminal_codigo', tiendaRuta).eq('numero', Number(numeroRuta)).eq('es_reparacion', true).maybeSingle()
          : supabase.from('pedido_cliente').select(CAMPOS).eq('es_reparacion', true).order('fecha', { ascending: false }).order('numero', { ascending: false }).limit(1).maybeSingle()
      const { data, error: err } = await q
      if (cancel) return
      if (err) setError(err.message)
      if (!data) {
        setVacio(true)
        setRep(vacia(tiendas[0] ?? '01'))
        setDraft(vacia(tiendas[0] ?? '01'))
        setLineas([])
        setLineasOrig([])
      } else {
        const r = data as Reparacion
        setVacio(false)
        setRep(r)
        setDraft(r)
        const { data: ls } = await supabase
          .from('pedido_cliente_linea')
          .select('numero_linea, articulo_codigo, codigo_venta, descripcion, tecnico_codigo, numero_serie, cantidad, precio, descuento_pct, igic_pct, impuesto2_pct')
          .eq('tienda_terminal_codigo', r.tienda_terminal_codigo)
          .eq('numero', r.numero!)
          .order('numero_linea')
        if (cancel) return
        const lineasCargadas = ((ls ?? []) as Linea[]).map((l) => ({ ...l, cantidad: Number(l.cantidad) }))
        setLineas(lineasCargadas)
        setLineasOrig(lineasCargadas)
      }
      setSelLinea(0)
      setMode('consulta')
      setLoading(false)
    })()
    return () => {
      cancel = true
    }
  }, [ruta, isNew, tiendaRuta, numeroRuta, tiendas])

  useEffect(() => {
    const cargar = async (tabla: string, campo: string, valor: string | null) => {
      if (!valor) return ''
      const { data } = await supabase.from(tabla).select(campo).eq('codigo', valor).maybeSingle()
      return ((data as Record<string, string> | null)?.[campo] as string) ?? ''
    }
    Promise.all([
      cargar('empleado', 'nombre', draft.empleado_codigo),
      cargar('vendedor', 'nombre', draft.vendedor_codigo),
      cargar('tecnico', 'nombre', draft.tecnico_codigo),
      draft.nombre_cliente ? Promise.resolve(draft.nombre_cliente) : cargar('cliente', 'nombre', draft.cliente_codigo || null),
    ]).then(([empleado, vendedor, tecnico, cliente]) => setNombres((n) => ({ ...n, empleado, vendedor, tecnico, cliente })))
  }, [draft.empleado_codigo, draft.vendedor_codigo, draft.tecnico_codigo, draft.cliente_codigo, draft.nombre_cliente])

  useEffect(() => {
    if (!draft.numero_serie) {
      setSerie(null)
      setNombres((n) => ({ ...n, articuloSerie: '' }))
      return
    }
    supabase
      .from('articulo_numero_serie')
      .select('numero_serie, descripcion, numero_serie_secundario, articulo_codigo, fecha_venta, garantia_meses, fin_garantia, observaciones')
      .eq('numero_serie', draft.numero_serie)
      .limit(1)
      .maybeSingle()
      .then(async ({ data }) => {
        const s = (data as SerieInfo | null) ?? null
        setSerie(s)
        if (s?.articulo_codigo) {
          const { data: a } = await supabase.from('articulo').select('descripcion').eq('codigo_interno', s.articulo_codigo).maybeSingle()
          setNombres((n) => ({ ...n, articuloSerie: a?.descripcion ?? '' }))
        } else setNombres((n) => ({ ...n, articuloSerie: '' }))
      })
  }, [draft.numero_serie])

  useEffect(() => {
    setVenta(null)
    setFactura(null)
    if (!rep.venta_tienda_codigo || !rep.venta_numero) return
    supabase
      .from('venta')
      .select('fecha, hora, tipo_credito, factura_tienda_codigo, factura_numero')
      .eq('tienda_terminal_codigo', rep.venta_tienda_codigo)
      .eq('numero', rep.venta_numero)
      .maybeSingle()
      .then(async ({ data }) => {
        const v = (data as VentaInfo | null) ?? null
        setVenta(v)
        if (v?.factura_tienda_codigo && v.factura_numero) {
          const { data: f } = await supabase
            .from('factura')
            .select('serie, n_factura, fecha_factura, hora_factura')
            .eq('tienda_terminal_codigo', v.factura_tienda_codigo)
            .eq('numero', v.factura_numero)
            .maybeSingle()
          setFactura((f as FacturaInfo | null) ?? null)
        }
      })
  }, [rep.venta_tienda_codigo, rep.venta_numero])

  const lineaSel = lineas[selLinea]
  useEffect(() => {
    if (!lineaSel?.articulo_codigo) return setStock(null)
    Promise.all([
      supabase.from('articulo').select('codigo_compra_habitual, unidades_pedidas').eq('codigo_interno', lineaSel.articulo_codigo).maybeSingle(),
      supabase.from('articulo_almacen_stock').select('cantidad_actual').eq('articulo_codigo', lineaSel.articulo_codigo),
    ]).then(([a, s]) =>
      setStock({
        codigoCompra: (a.data?.codigo_compra_habitual as string | null) ?? null,
        stock: (s.data ?? []).reduce((t, r) => t + Number(r.cantidad_actual ?? 0), 0),
        pedido: Number(a.data?.unidades_pedidas ?? 0),
      }),
    )
  }, [lineaSel?.articulo_codigo])

  const totales = useMemo(() => calcular(lineas, draft.descuento_pie_pct ?? 0), [lineas, draft.descuento_pie_pct])

  const idx = useMemo(
    () => lista.findIndex((l) => l.tienda_terminal_codigo === rep.tienda_terminal_codigo && l.numero === rep.numero),
    [lista, rep.tienda_terminal_codigo, rep.numero],
  )
  const ir = (i: number) => lista[i] && navigate(`/reparaciones/${lista[i].tienda_terminal_codigo}/${lista[i].numero}`)

  function patch(p: Partial<Reparacion>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  function patchLinea(i: number, p: Partial<Linea>) {
    setLineas((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))
  }

  async function agregarArticulo(codigo: string) {
    const { data: a } = await supabase
      .from('articulo')
      .select('codigo_interno, codigo_venta, descripcion, pvp, igic_pct, impuesto2_pct')
      .eq('codigo_interno', codigo)
      .maybeSingle()
    if (!a) return
    let precio = a.pvp as number | null
    const nivel = draft.tarifa_nivel ?? 0
    const { data: pn } = await supabase
      .from('articulo_precio_nivel')
      .select('pvp')
      .eq('articulo_codigo', codigo)
      .eq('nivel_tarifa', nivel)
      .maybeSingle()
    if (pn?.pvp != null) precio = Number(pn.pvp)
    setLineas((ls) => {
      const siguiente = ls.reduce((m, l) => Math.max(m, l.numero_linea), 0) + 1
      return [
        ...ls,
        {
          numero_linea: siguiente,
          articulo_codigo: a.codigo_interno,
          codigo_venta: a.codigo_venta ?? a.codigo_interno,
          descripcion: a.descripcion,
          tecnico_codigo: draft.tecnico_codigo,
          numero_serie: draft.numero_serie,
          cantidad: 1,
          precio: precio != null ? Number(precio) : 0,
          descuento_pct: 0,
          igic_pct: a.igic_pct != null ? Number(a.igic_pct) : 0,
          impuesto2_pct: a.impuesto2_pct != null ? Number(a.impuesto2_pct) : 0,
        },
      ]
    })
    setSelLinea(lineas.length)
  }

  async function guardar() {
    setError(null)
    if (!draft.cliente_codigo.trim()) return setError('Indica el cliente de la reparación.')
    setSaving(true)
    const cabecera = {
      ...draft,
      es_reparacion: true,
      subtotal: totales.subtotal,
      total_descuento_pie: totales.total_descuento_pie,
      subtotal_2: totales.subtotal_2,
      total_igic_pie: totales.total_igic_pie,
      total: totales.total,
    }
    let tienda = draft.tienda_terminal_codigo
    let numero = draft.numero
    if (mode === 'alta') {
      const { data: n, error: errNum } = await supabase.rpc('fn_siguiente_numero', {
        p_tienda: tienda,
        p_tipo_documento: 'pedido_cliente',
        p_serie: '',
      })
      if (errNum) {
        setSaving(false)
        return setError(errNum.message)
      }
      numero = Number(n)
      const { error: err } = await supabase.from('pedido_cliente').insert({ ...cabecera, numero })
      if (err) {
        setSaving(false)
        return setError(err.message)
      }
    } else {
      const { tienda_terminal_codigo: _t, numero: _n, ...resto } = cabecera
      void _t
      void _n
      const { error: err } = await supabase
        .from('pedido_cliente')
        .update(resto)
        .eq('tienda_terminal_codigo', rep.tienda_terminal_codigo)
        .eq('numero', rep.numero!)
      if (err) {
        setSaving(false)
        return setError(err.message)
      }
      tienda = rep.tienda_terminal_codigo
    }

    const filas = lineas.map((l, i) => {
      const base = l.cantidad * (l.precio ?? 0) * (1 - (l.descuento_pct ?? 0) / 100)
      const canon = l.cantidad * (l.impuesto2_pct ?? 0)
      return {
        ...l,
        numero_linea: i + 1,
        tienda_terminal_codigo: tienda,
        numero,
        fecha: draft.fecha,
        hora: draft.hora,
        subtotal: r3(base),
        total_base: r3(base),
        total_impuesto2: r3(canon),
        total_igic: r3((base + canon) * ((l.igic_pct ?? 0) / 100)),
      }
    })
    if (filas.length) {
      const { error: errL } = await supabase.from('pedido_cliente_linea').upsert(filas, { onConflict: 'tienda_terminal_codigo,numero,numero_linea' })
      if (errL) {
        setSaving(false)
        return setError(`Cabecera guardada, pero las líneas no: ${errL.message}`)
      }
    }
    if (lineasOrig.length > filas.length) {
      await supabase
        .from('pedido_cliente_linea')
        .delete()
        .eq('tienda_terminal_codigo', tienda)
        .eq('numero', numero!)
        .gt('numero_linea', filas.length)
    }
    setSaving(false)
    const guardada = { ...cabecera, tienda_terminal_codigo: tienda, numero }
    setRep(guardada)
    setDraft(guardada)
    const renumeradas = filas.map((f) => ({
      numero_linea: f.numero_linea,
      articulo_codigo: f.articulo_codigo,
      codigo_venta: f.codigo_venta,
      descripcion: f.descripcion,
      tecnico_codigo: f.tecnico_codigo,
      numero_serie: f.numero_serie,
      cantidad: f.cantidad,
      precio: f.precio,
      descuento_pct: f.descuento_pct,
      igic_pct: f.igic_pct,
      impuesto2_pct: f.impuesto2_pct,
    }))
    setLineas(renumeradas)
    setLineasOrig(renumeradas)
    setMode('consulta')
    navigate(`/reparaciones/${tienda}/${numero}`, { replace: true })
  }

  async function anular() {
    if (!rep.numero) return
    if (!confirm(`¿Anular la reparación ${rep.numero}?`)) return
    const { error: err } = await supabase
      .from('pedido_cliente')
      .update({ anulado: true })
      .eq('tienda_terminal_codigo', rep.tienda_terminal_codigo)
      .eq('numero', rep.numero)
    if (err) return setError(err.message)
    setRep((r) => ({ ...r, anulado: true }))
    setDraft((r) => ({ ...r, anulado: true }))
  }

  const estado = (() => {
    const tipo = draft.es_presupuesto ? 'Presupuesto' : 'Reparación'
    if (draft.anulado) return `${tipo} Anulado`
    if (rep.venta_numero) return `${tipo} Entregado y pasado a venta${factura ? '. Facturado' : ''}`
    if (draft.entregado) return `${tipo} Entregado`
    if (draft.preparado) return `${tipo} Realizado. Pendiente de Entregar`
    if (draft.es_presupuesto && !draft.aceptado) return 'Presupuesto Pendiente de Entregar'
    return `${tipo} Pendiente de Entregar`
  })()

  if (loading) return <div className="gw-label p-2">Cargando…</div>

  const nombreCampo = (valor: string, onBuscar: () => void, ancho = 80, onCodigo?: (v: string) => void, codigo?: string | null, title?: string) => (
    <div className="flex gap-1">
      <GwInput
        className="flex-none"
        style={{ width: ancho }}
        title={title}
        value={codigo ?? ''}
        disabled={dis}
        onChange={(e) => onCodigo?.(e.target.value)}
      />
      <GwInput readOnly value={valor} />
      <GwLookupButton disabled={dis} onClick={onBuscar} />
    </div>
  )

  return (
    <div className="flex flex-col gap-[3px]">
      {/* Cabecera: tienda, número, fecha y hora · empleado · vendedor */}
      <div className="grid grid-cols-[minmax(0,470px)_minmax(0,1fr)_minmax(0,1fr)] gap-x-2">
        <GwGroup>
          <div className="grid grid-cols-[70px_minmax(0,1fr)_120px_80px] gap-x-1.5">
            <GwField label="Tienda">
              <GwSelect
                title="IDOFICINA"
                value={draft.tienda_terminal_codigo}
                disabled={mode !== 'alta'}
                onChange={(e) => patch({ tienda_terminal_codigo: e.target.value })}
              >
                {(tiendas.length ? tiendas : [draft.tienda_terminal_codigo]).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </GwSelect>
            </GwField>
            <GwField label={<span className="underline decoration-1 underline-offset-2">Número</span>}>
              <GwInput className="text-right" readOnly disabled value={draft.numero ?? ''} title="IDPEDIDO — se asigna al guardar" />
            </GwField>
            <GwField label="Fecha">
              <GwInput type="date" value={draft.fecha ?? ''} disabled={dis} onChange={(e) => patch({ fecha: e.target.value || null })} />
            </GwField>
            <GwField label="Hora">
              <GwInput value={draft.hora ?? ''} disabled={dis} onChange={(e) => patch({ hora: e.target.value || null })} />
            </GwField>
          </div>
        </GwGroup>
        <GwGroup title={<span className="underline decoration-1 underline-offset-2">Empleado</span>}>
          {nombreCampo(nombres.empleado, () => setLookup('empleado'), 80, (v) => patch({ empleado_codigo: v || null }), draft.empleado_codigo, 'IDEMPLEADO')}
        </GwGroup>
        <GwGroup title={<span className="underline decoration-1 underline-offset-2">Vendedor</span>}>
          {nombreCampo(nombres.vendedor, () => setLookup('vendedor'), 80, (v) => patch({ vendedor_codigo: v || null }), draft.vendedor_codigo, 'IDVENDEDOR')}
        </GwGroup>
      </div>

      {/* Presupuesto · cliente · técnico */}
      <div className="grid grid-cols-[150px_minmax(0,1fr)_minmax(0,1fr)] items-end gap-x-2">
        <Estado label="Presupuesto" value={draft.es_presupuesto} disabled={dis} onClick={() => patch({ es_presupuesto: !draft.es_presupuesto })} />
        <GwGroup title="Cliente">
          <div className="flex items-center gap-1">
            <GwInput
              className="!w-[90px] flex-none"
              title="IDCLIENTE"
              value={draft.cliente_codigo}
              disabled={dis}
              onChange={(e) => patch({ cliente_codigo: e.target.value, nombre_cliente: null })}
            />
            <GwInput readOnly value={nombres.cliente} />
            <GwLookupButton disabled={dis} onClick={() => setLookup('cliente')} />
            <span className="gw-label px-0.5">–</span>
            <GwInput
              className="!w-[40px] flex-none text-right"
              title="IDCLISUCUR — sucursal del cliente"
              value={draft.cliente_sucursal_codigo ?? ''}
              disabled={dis}
              onChange={(e) => patch({ cliente_sucursal_codigo: e.target.value || null })}
            />
          </div>
        </GwGroup>
        <GwGroup title={<span className="underline decoration-1 underline-offset-2">Técnico</span>}>
          {nombreCampo(nombres.tecnico, () => setLookup('tecnico'), 80, (v) => patch({ tecnico_codigo: v || null }), draft.tecnico_codigo, 'IDTECNICO')}
        </GwGroup>
      </div>

      {/* Nº de serie, artículo y garantía · observaciones del Nº de serie */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,440px)] gap-x-2">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="grid grid-cols-[minmax(0,1fr)_250px] gap-x-2">
            <GwGroup title="Nº de Serie">
              <div className="flex gap-1">
                <GwInput className="!w-[200px] flex-none" title="N_SERIE" value={draft.numero_serie ?? ''} disabled={dis} onChange={(e) => patch({ numero_serie: e.target.value || null })} />
                <GwInput readOnly value={serie?.descripcion ?? nombres.articuloSerie} />
                <GwLookupButton disabled={dis} onClick={() => setLookup('serie')} />
              </div>
            </GwGroup>
            <GwField label="Nº de Nº Identif.">
              <div className="flex gap-1">
                <GwInput readOnly value={serie?.numero_serie_secundario ?? ''} title="N_SERIE2" />
                <GwLookupButton disabled={dis} onClick={() => setLookup('serie')} />
              </div>
            </GwField>
          </div>
          <div className="grid grid-cols-[170px_minmax(0,1fr)_minmax(0,330px)] items-end gap-x-2">
            <div className="flex border border-[var(--gw-border)] bg-[var(--gw-face)]">
              <MiniBtn title="Nuevo Nº de serie" disabled={dis} onClick={() => window.open('/numeros-serie/nuevo', '_blank')}>
                <FilePlus2 size={13} />
              </MiniBtn>
              <MiniBtn
                title="Modificar Nº de serie"
                disabled={!draft.numero_serie}
                onClick={async () => {
                  const { data } = await supabase.from('articulo_numero_serie').select('id').eq('numero_serie', draft.numero_serie!).limit(1).maybeSingle()
                  if (data) navigate(`/numeros-serie/${data.id}`)
                }}
              >
                <FilePen size={13} />
              </MiniBtn>
              <MiniBtn title="Quitar Nº de serie" disabled={dis || !draft.numero_serie} onClick={() => patch({ numero_serie: null })}>
                <FileX2 size={13} />
              </MiniBtn>
            </div>
            <GwField label="Código del artículo">
              <div className="flex gap-1">
                <GwInput readOnly disabled value={serie ? `${serie.articulo_codigo}  ${nombres.articuloSerie}` : ''} />
                <GwLookupButton disabled={dis} onClick={() => setLookup('serie')} />
              </div>
            </GwField>
            <GwGroup title="Garantía">
              <div className="grid grid-cols-[minmax(0,1fr)_60px_minmax(0,1fr)] gap-x-1.5">
                <GwField label="Inicio">
                  <GwInput readOnly disabled value={fmtFecha(serie?.fecha_venta ?? null)} />
                </GwField>
                <GwField label="Meses">
                  <GwInput readOnly disabled className="text-right" value={serie?.garantia_meses ?? ''} />
                </GwField>
                <GwField label="Final">
                  <GwInput readOnly disabled value={fmtFecha(serie?.fin_garantia ?? null)} />
                </GwField>
              </div>
            </GwGroup>
          </div>
        </div>
        <GwField label="Observaciones">
          <GwTextArea rows={4} readOnly disabled className="h-full" title="Observaciones del Nº de serie (N_SERIES.OBSERV)" value={serie?.observaciones ?? ''} />
        </GwField>
      </div>

      {/* Avería · datos de entrega · observaciones de la reparación */}
      <div className="grid grid-cols-[minmax(0,1fr)_350px_minmax(0,370px)] gap-x-2">
        <GwField label={<span className="underline decoration-1 underline-offset-2">Averia</span>}>
          <GwTextArea rows={2} title="AVERIA" value={draft.averia ?? ''} disabled={dis} onChange={(e) => patch({ averia: e.target.value || null })} />
        </GwField>
        <GwGroup title="Datos de Entrega" className="self-start">
          <div className="flex items-center gap-1.5">
            <span className="gw-label">Fecha:</span>
            <GwInput type="date" className="!w-[140px]" title="FECHA_ENTR" value={draft.fecha_entrega ?? ''} disabled={dis} onChange={(e) => patch({ fecha_entrega: e.target.value || null })} />
            <span className="gw-label">Hora:</span>
            <GwInput className="!w-[70px]" title="HORARESERV" value={draft.hora_reserva ?? ''} disabled={dis} onChange={(e) => patch({ hora_reserva: e.target.value || null })} />
          </div>
        </GwGroup>
        <GwField label="Observaciones">
          <GwTextArea rows={2} title="OBSER" value={draft.observaciones ?? ''} disabled={dis} onChange={(e) => patch({ observaciones: e.target.value || null })} />
        </GwField>
      </div>

      {/* Líneas */}
      <div className="h-[160px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid min-w-[980px]">
          <thead className="sticky top-0 z-10">
            <tr>
              <th style={{ width: 130 }}>Cod. Venta</th>
              <th>Descripción</th>
              <th style={{ width: 60 }}>Técn.</th>
              <th style={{ width: 86 }} className="text-center!">
                Cantidad
              </th>
              <th style={{ width: 110 }} className="text-center!">
                Pvp
              </th>
              <th style={{ width: 62 }} className="text-center!">
                Dto
              </th>
              <th style={{ width: 62 }} className="text-center!">
                igic
              </th>
              <th style={{ width: 72 }} className="text-center!">
                Canon
              </th>
              <th style={{ width: 110 }} className="text-center!">
                Subtotal
              </th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => {
              const sub = l.cantidad * (l.precio ?? 0) * (1 - (l.descuento_pct ?? 0) / 100)
              const sel = i === selLinea
              const num = (campo: keyof Linea, dec: number) =>
                editing && sel ? (
                  <GwNumber className="h-[20px]" value={l[campo] as number | null} decimals={dec} onChange={(v) => patchLinea(i, { [campo]: campo === 'cantidad' ? (v ?? 0) : v } as Partial<Linea>)} />
                ) : (
                  formatGw((l[campo] as number | null) ?? 0, dec)
                )
              return (
                <tr key={`${l.numero_linea}-${i}`} className={sel && !editing ? 'gw-selected' : ''} onClick={() => setSelLinea(i)}>
                  <td>{l.codigo_venta ?? l.articulo_codigo}</td>
                  <td>
                    {editing && sel ? (
                      <GwInput className="h-[20px]" value={l.descripcion ?? ''} onChange={(e) => patchLinea(i, { descripcion: e.target.value })} />
                    ) : (
                      l.descripcion
                    )}
                  </td>
                  <td>
                    {editing && sel ? (
                      <GwInput className="h-[20px]" value={l.tecnico_codigo ?? ''} onChange={(e) => patchLinea(i, { tecnico_codigo: e.target.value || null })} />
                    ) : (
                      l.tecnico_codigo
                    )}
                  </td>
                  <td className="text-right">{num('cantidad', 2)}</td>
                  <td className="text-right">{num('precio', 3)}</td>
                  <td className="text-right">{num('descuento_pct', 2)}</td>
                  <td className="text-right">{num('igic_pct', 2)}</td>
                  <td className="text-right">{num('impuesto2_pct', 3)}</td>
                  <td className="text-right">{formatGw(sub, 3)}</td>
                </tr>
              )
            })}
            <FilasVacias cols={9} ocupadas={lineas.length} total={6} />
          </tbody>
        </table>
      </div>

      {/* Mini barra de líneas, aviso de stock y pie */}
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,620px)] gap-x-3">
        <div className="flex min-w-0 flex-col gap-1">
          <div className="flex items-center gap-2">
            <div className="flex border border-[var(--gw-border)] bg-[var(--gw-face)]">
              <MiniBtn title="Agregar línea (buscar artículo)" disabled={dis} onClick={() => setLookup('articulo_linea')}>
                <FilePlus2 size={13} />
              </MiniBtn>
              <MiniBtn title="Editar línea" disabled={dis || !lineaSel}>
                <FilePen size={13} />
              </MiniBtn>
              <MiniBtn
                title="Eliminar línea"
                disabled={dis || !lineaSel}
                onClick={() => {
                  setLineas((ls) => ls.filter((_, j) => j !== selLinea))
                  setSelLinea((s) => Math.max(0, s - 1))
                }}
              >
                <FileX2 size={13} />
              </MiniBtn>
              <MiniBtn title="Buscar artículo" disabled={dis} onClick={() => setLookup('articulo_linea')}>
                <Binoculars size={13} />
              </MiniBtn>
              <MiniBtn title="Tarifa del cliente para esta reparación" ancho={78}>
                <Tag size={12} />
                <span className="text-[13px] text-black">Tarifa {draft.tarifa_nivel ?? 0}</span>
              </MiniBtn>
              <MiniBtn title="Peticiones (aún no disponible)" disabled>
                <Package size={13} />
              </MiniBtn>
            </div>
            <span className="gw-label truncate text-[#e00000]">
              {lineaSel ? `CC: ${stock?.codigoCompra ?? 'solo usar para aviso'}  Stk: ${formatGw(stock?.stock ?? 0, 3)}  UPd: ${formatGw(stock?.pedido ?? 0, 3)}` : ''}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Estado label="Anulada" value={draft.anulado} disabled={dis} onClick={() => patch({ anulado: !draft.anulado })} />
            <Estado label="Aceptada" value={draft.aceptado} disabled={dis} onClick={() => patch({ aceptado: !draft.aceptado })} />
            <span className="gw-label ml-2 text-[15px] text-[#1a4fd0]">{estado}</span>
          </div>
        </div>
        <div className="grid grid-cols-[auto_90px_auto_minmax(0,1fr)_minmax(0,190px)] items-center gap-x-1.5 gap-y-1">
          <span className="gw-label font-bold">Dto.:</span>
          <GwNumber value={draft.descuento_pie_pct} decimals={2} emptyAsZero disabled={dis} onChange={(v) => patch({ descuento_pie_pct: v ?? 0 })} />
          <span className="gw-label font-bold">%</span>
          <GwInput readOnly className="text-right" value={formatGw(totales.total_descuento_pie, 3)} />
          <div className="flex flex-col items-end leading-tight">
            <span className="text-[15px] font-bold">{formatGw(totales.subtotal, 3)}</span>
            <span className="text-[15px] font-bold">{formatGw(totales.subtotal_2, 3)}</span>
          </div>
          <span className="gw-label font-bold">IGIC:</span>
          <GwNumber value={draft.igic_pie_pct} decimals={2} emptyAsZero disabled={dis} onChange={(v) => patch({ igic_pie_pct: v ?? 0 })} />
          <span className="gw-label font-bold">%</span>
          <span className="text-right text-[15px] font-bold">{formatGw(totales.total_igic_pie, 3)}</span>
          <GwInput readOnly className="!h-[28px] text-right !text-[17px] font-bold" value={formatGw(totales.total, 3)} />
        </div>
      </div>

      {/* Realizada, entregada y paso a venta / factura */}
      <div className="flex items-end gap-1.5">
        <Estado label="Realizada" vertical value={draft.preparado} disabled={dis} onClick={() => patch({ preparado: !draft.preparado })} />
        <Estado label="Entregada" vertical value={draft.entregado} disabled={dis} onClick={() => patch({ entregado: !draft.entregado })} />
        <GwField label="Fecha" className="w-[120px]">
          <GwInput readOnly disabled value={fmtFecha(venta?.fecha ?? null)} />
        </GwField>
        <GwField label="Hora" className="w-[70px]">
          <GwInput readOnly disabled value={venta?.hora ?? ''} />
        </GwField>
        <GwField label="Tipo Venta" className="w-[140px]">
          <GwInput readOnly disabled value={venta?.tipo_credito ?? ''} />
        </GwField>
        <Estado label="Factura" vertical value={!!factura} disabled />
        <GwField label="Tie. F." className="w-[60px]">
          <GwInput readOnly disabled value={venta?.factura_tienda_codigo ?? ''} />
        </GwField>
        <GwField label="Id. Factura" className="w-[110px]">
          <GwInput readOnly disabled className="text-right" value={venta?.factura_numero ?? ''} />
        </GwField>
        <GwField label="D.C." className="w-[60px]">
          <GwInput readOnly disabled value={factura?.serie ?? ''} />
        </GwField>
        <GwField label="Nº de Factura" className="w-[120px]">
          <GwInput readOnly disabled className="text-right" value={factura?.n_factura ?? 0} />
        </GwField>
        <GwField label="Fecha Fact." className="w-[110px]">
          <GwInput readOnly disabled value={fmtFecha(factura?.fecha_factura ?? null)} />
        </GwField>
        <GwField label="Hora Fact." className="w-[90px]">
          <GwInput readOnly disabled value={factura?.hora_factura ?? ''} />
        </GwField>
      </div>

      <GwRecordBar
        mode={mode}
        canNavigate={mode === 'consulta' && idx >= 0}
        saving={saving}
        onFirst={() => ir(0)}
        onPrev={() => ir(idx - 1)}
        onNext={() => ir(idx + 1)}
        onLast={() => ir(lista.length - 1)}
        onSort={() => setLista((l) => [...l].reverse())}
        onSearch={() => setLookup('buscar')}
        onPrint={() => window.print()}
        onNew={() => navigate('/reparaciones/nuevo')}
        onEdit={() => !vacio && setMode('edicion')}
        onDelete={anular}
        onSave={guardar}
        onCancel={() => {
          if (mode === 'alta') return navigate('/reparaciones')
          setDraft(rep)
          setLineas(lineasOrig)
          setMode('consulta')
        }}
        onExit={() => navigate('/')}
      />
      <div className="gw-label text-[11px] text-[#444]">
        {error ? (
          <span className="text-[#c42b1c]">{error}</span>
        ) : vacio && !editing ? (
          'No hay reparaciones. Pulsa Nuevo para dar de alta la primera.'
        ) : mode === 'alta' ? (
          'Alta de reparación: el número se asigna al guardar.'
        ) : (
          ''
        )}
      </div>

      {lookup === 'empleado' && (
        <GwLookupDialog<CodNom>
          title="Empleados"
          table="empleado"
          keyColumn="codigo"
          orderBy="codigo"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          onPick={(r) => {
            patch({ empleado_codigo: r.codigo })
            setLookup(null)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'vendedor' && (
        <GwLookupDialog<CodNom>
          title="Vendedores"
          table="vendedor"
          keyColumn="codigo"
          orderBy="codigo"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          onPick={(r) => {
            patch({ vendedor_codigo: r.codigo })
            setLookup(null)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'tecnico' && (
        <GwLookupDialog<CodNom>
          title="Técnicos"
          table="tecnico"
          keyColumn="codigo"
          orderBy="codigo"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          onPick={(r) => {
            patch({ tecnico_codigo: r.codigo })
            setLookup(null)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'cliente' && (
        <GwLookupDialog<{ codigo: string; nombre: string; nif: string | null; tarifa_nivel_defecto: number | null; vendedor_codigo: string | null }>
          title="Clientes"
          table="cliente"
          keyColumn="codigo"
          orderBy="codigo"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'nombre', label: 'Nombre' },
            { key: 'nif', label: 'NIF', width: 110 },
            { key: 'tarifa_nivel_defecto', label: 'Tarifa', width: 60 },
            { key: 'vendedor_codigo', label: 'Vendedor', width: 70 },
          ]}
          searchColumns={['codigo', 'nombre', 'nif']}
          onPick={(r) => {
            patch({
              cliente_codigo: r.codigo,
              nombre_cliente: r.nombre,
              tarifa_nivel: r.tarifa_nivel_defecto ?? 0,
              vendedor_codigo: draft.vendedor_codigo ?? r.vendedor_codigo,
            })
            setLookup(null)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'serie' && (
        <GwLookupDialog<{ id: number; numero_serie: string; descripcion: string | null; articulo_codigo: string; cliente_codigo: string | null }>
          title="Números de serie"
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
          searchColumns={['numero_serie', 'numero_serie_secundario', 'descripcion']}
          onPick={(r) => {
            patch({ numero_serie: r.numero_serie })
            setLookup(null)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'articulo_linea' && (
        <GwLookupDialog<{ codigo_interno: string; descripcion: string; codigo_venta: string | null; pvp: number | null }>
          title="Artículos"
          table="articulo"
          keyColumn="codigo_interno"
          orderBy="codigo_interno"
          columns={[
            { key: 'codigo_interno', label: 'Código', width: 110 },
            { key: 'descripcion', label: 'Descripción' },
            { key: 'codigo_venta', label: 'Cód. Venta', width: 110 },
            { key: 'pvp', label: 'PVP', width: 80 },
          ]}
          searchColumns={['codigo_interno', 'descripcion', 'codigo_venta', 'codigo_barras_principal']}
          onPick={(r) => {
            setLookup(null)
            agregarArticulo(r.codigo_interno)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'buscar' && <LocalizarReparacion onPick={(t, n) => navigate(`/reparaciones/${t}/${n}`)} onClose={() => setLookup(null)} />}
    </div>
  )
}

/** Buscador de reparaciones (solo pedidos con REPA = Sí). */
function LocalizarReparacion({ onPick, onClose }: { onPick: (tienda: string, numero: number) => void; onClose: () => void }) {
  const [filtro, setFiltro] = useState('')
  const [filas, setFilas] = useState<{ tienda_terminal_codigo: string; numero: number; fecha: string | null; cliente_codigo: string; nombre_cliente: string | null; numero_serie: string | null; total: number | null }[]>([])
  const [sel, setSel] = useState(0)

  useEffect(() => {
    const t = setTimeout(async () => {
      let q = supabase
        .from('pedido_cliente')
        .select('tienda_terminal_codigo, numero, fecha, cliente_codigo, nombre_cliente, numero_serie, total')
        .eq('es_reparacion', true)
        .order('fecha', { ascending: false })
        .limit(200)
      const f = filtro.trim().replace(/[,%()]/g, ' ')
      if (f) {
        const ors = [`cliente_codigo.ilike.%${f}%`, `nombre_cliente.ilike.%${f}%`, `numero_serie.ilike.%${f}%`, `averia.ilike.%${f}%`]
        if (/^\d+$/.test(f)) ors.push(`numero.eq.${f}`)
        q = q.or(ors.join(','))
      }
      const { data } = await q
      setFilas((data ?? []) as typeof filas)
      setSel(0)
    }, 200)
    return () => clearTimeout(t)
  }, [filtro])

  const elegir = (i: number) => filas[i] && onPick(filas[i].tienda_terminal_codigo, filas[i].numero)

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title="Localizar reparaciones" onClose={onClose} className="w-[760px] max-w-[95vw]">
        <div className="flex flex-col gap-1.5">
          <GwInput
            autoFocus
            placeholder="Número, cliente, Nº de serie o avería…"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') setSel((s) => Math.min(s + 1, filas.length - 1))
              if (e.key === 'ArrowUp') setSel((s) => Math.max(s - 1, 0))
              if (e.key === 'Enter') elegir(sel)
            }}
          />
          <div className="max-h-[360px] overflow-y-auto border border-[var(--gw-border)]">
            <table className="gw-grid">
              <thead className="sticky top-0">
                <tr>
                  <th style={{ width: 50 }}>Tie.</th>
                  <th style={{ width: 90 }}>Número</th>
                  <th style={{ width: 90 }}>Fecha</th>
                  <th>Cliente</th>
                  <th style={{ width: 140 }}>Nº de Serie</th>
                  <th style={{ width: 100 }} className="text-right!">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.length === 0 && (
                  <tr>
                    <td colSpan={6} className="text-center text-[#6d6d6d]">
                      Sin reparaciones.
                    </td>
                  </tr>
                )}
                {filas.map((r, i) => (
                  <tr key={`${r.tienda_terminal_codigo}-${r.numero}`} className={i === sel ? 'gw-selected' : ''} onClick={() => setSel(i)} onDoubleClick={() => elegir(i)}>
                    <td>{r.tienda_terminal_codigo}</td>
                    <td className="text-right">{r.numero}</td>
                    <td>{fmtFecha(r.fecha)}</td>
                    <td className="truncate">
                      {r.cliente_codigo} {r.nombre_cliente ?? ''}
                    </td>
                    <td>{r.numero_serie ?? ''}</td>
                    <td className="text-right">{formatGw(r.total ?? 0, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex justify-end gap-1.5">
            <button type="button" className="gw-btn" disabled={!filas[sel]} onClick={() => elegir(sel)}>
              Aceptar
            </button>
            <button type="button" className="gw-btn" onClick={onClose}>
              Cancelar
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}
