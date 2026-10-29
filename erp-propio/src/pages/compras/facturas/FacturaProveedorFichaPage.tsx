import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Check, FileText, HandCoins, RefreshCw, Settings2, ShoppingCart, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { ahoraTrabajo, fechaTrabajo, tiendaDeTrabajo } from '../../../lib/sesionTrabajo'
import { navIndice, useNavRegistro, type NavDir } from '../../../components/gw/useNavRegistro'
import { useNexaContexto } from '../../../nexa/contexto'
import { GwDate, GwField, GwGroup, GwInput, GwLookupButton, GwNumber, GwSelect, GwTextArea, GwWindow, formatGw } from '../../../components/gw'
import { GwRecordBar } from '../../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import { FilasVacias, GridMiniBar } from '../../../components/gw/GwGridParts'
import { GenerarFacturasDialog } from './GenerarFacturasDialog'

// Ficha «Facturas Proveedores» (Compras → Facturas Proveedor en GeminisWin): agrupa
// pedidos/albaranes de proveedor ya recibidos en una factura, con sus vencimientos.

export interface FacturaProveedor {
  tienda_terminal_codigo: string
  id: number
  fecha_hora: string
  proveedor_codigo: string
  numero_factura_externo: string | null
  fecha_factura: string | null
  fecha_vencimiento: string | null
  oficina_desde_codigo: string | null
  oficina_hasta_codigo: string | null
  almacen_desde_codigo: string | null
  almacen_hasta_codigo: string | null
  fecha_desde: string | null
  fecha_hasta: string | null
  forma_pago_codigo: string | null
  pagado: boolean
  fecha_pago: string | null
  numero_pagos: number | null
  subtotal: number | null
  base_imponible: number | null
  total_igic: number | null
  total_gastos: number | null
  total_canon: number
  gastos_adicionales_pct: number
  total_igic_gastos: number
  total: number | null
  total_a_pagar_proveedor: number | null
  total_pendiente: number | null
  observaciones: string | null
}

interface Albaran {
  tienda_terminal_codigo: string
  numero: number
  fecha_hora: string | null
  fecha_recepcion: string | null
  numero_albaran_proveedor: string | null
  stock_movido: boolean
  base_imponible: number | null
  total_igic: number | null
  total_gastos: number | null
  total: number | null
}

interface Pago {
  tienda_terminal_codigo: string
  codigo_pago: number
  tipo_pago: string | null
  cuota: number | null
  fecha_vencimiento: string | null
  estado_pago: string | null
  importe_pagado: number | null
  fecha_pago: string | null
  id_pago: number | null
  concepto: string | null
}

const COLS =
  'tienda_terminal_codigo, id, fecha_hora, proveedor_codigo, numero_factura_externo, fecha_factura, fecha_vencimiento, oficina_desde_codigo, oficina_hasta_codigo, almacen_desde_codigo, almacen_hasta_codigo, fecha_desde, fecha_hasta, forma_pago_codigo, pagado, fecha_pago, numero_pagos, subtotal, base_imponible, total_igic, total_gastos, total_canon, gastos_adicionales_pct, total_igic_gastos, total, total_a_pagar_proveedor, total_pendiente, observaciones'
const ALB_COLS =
  'tienda_terminal_codigo, numero, fecha_hora, fecha_recepcion, numero_albaran_proveedor, stock_movido, base_imponible, total_igic, total_gastos, total'

const n = (v: number | null | undefined) => Number(v ?? 0)
const r2 = (v: number) => Math.round(v * 100) / 100
// Fecha de trabajo (Utilidades → Cambio de Fecha), por defecto hoy.
const hoy = () => fechaTrabajo()

function fecha(v: string | null | undefined) {
  if (!v) return ' / /'
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function fechaHora(v: string | null | undefined) {
  if (!v) return ''
  const d = new Date(v)
  return Number.isNaN(d.getTime())
    ? v
    : `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-ES')}`
}

function sumaDias(base: string, dias: number) {
  const d = new Date(`${base}T00:00:00`)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

function vacia(tienda: string): FacturaProveedor {
  return {
    tienda_terminal_codigo: tienda,
    id: 0,
    fecha_hora: ahoraTrabajo().toISOString(),
    proveedor_codigo: '',
    numero_factura_externo: null,
    fecha_factura: hoy(),
    fecha_vencimiento: null,
    oficina_desde_codigo: tienda || null,
    oficina_hasta_codigo: tienda || null,
    almacen_desde_codigo: null,
    almacen_hasta_codigo: null,
    fecha_desde: null,
    fecha_hasta: null,
    forma_pago_codigo: null,
    pagado: false,
    fecha_pago: null,
    numero_pagos: 0,
    subtotal: 0,
    base_imponible: 0,
    total_igic: 0,
    total_gastos: 0,
    total_canon: 0,
    gastos_adicionales_pct: 0,
    total_igic_gastos: 0,
    total: 0,
    total_a_pagar_proveedor: 0,
    total_pendiente: 0,
    observaciones: null,
  }
}

/** Totales de la factura a partir de sus albaranes y de los campos de pie. */
export function calcularTotales(f: FacturaProveedor, albaranes: Albaran[], pagado: number) {
  const base = r2(albaranes.reduce((s, a) => s + n(a.base_imponible), 0))
  const igic = r2(albaranes.reduce((s, a) => s + n(a.total_igic), 0))
  const gastosAlb = r2(albaranes.reduce((s, a) => s + n(a.total_gastos), 0))
  const gastosAdic = r2((base * n(f.gastos_adicionales_pct)) / 100)
  const total = r2(base + igic + n(f.total_canon) + gastosAlb + gastosAdic + n(f.total_igic_gastos))
  return { base, igic, gastosAlb, gastosAdic, total, pendiente: r2(total - pagado) }
}

export function FacturaProveedorFichaPage() {
  const params = useParams()
  const navigate = useNavigate()
  const [claveTienda, claveId] = (params['*'] ?? '').split('/')
  const esNuevo = claveTienda === 'nuevo'

  const [tiendas, setTiendas] = useState<string[]>([])
  const [almacenes, setAlmacenes] = useState<string[]>([])
  const [orden, setOrden] = useState<'id' | 'fecha'>('id')
  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>('consulta')
  const [cab, setCab] = useState<FacturaProveedor | null>(null)
  const [orig, setOrig] = useState<FacturaProveedor | null>(null)
  const [albaranes, setAlbaranes] = useState<Albaran[]>([])
  const [pagos, setPagos] = useState<Pago[]>([])
  const [selAlb, setSelAlb] = useState(0)
  const [selPago, setSelPago] = useState(0)
  const [nombreProv, setNombreProv] = useState('')
  const [nombreFp, setNombreFp] = useState('')
  const [formasPago, setFormasPago] = useState<{ codigo: string; descripcion: string }[]>([])
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [lookup, setLookup] = useState<null | 'proveedor' | 'forma' | 'buscar' | 'albaran'>(null)
  const [generar, setGenerar] = useState(false)
  const [recarga, setRecarga] = useState(0)

  const editing = mode !== 'consulta'

  useEffect(() => {
    Promise.all([
      supabase.from('tienda_terminal').select('codigo').order('codigo'),
      supabase.from('almacen').select('codigo').order('codigo'),
      supabase.from('forma_pago').select('codigo, descripcion').order('codigo'),
    ]).then(([t, a, f]) => {
      setTiendas((t.data ?? []).map((r) => r.codigo as string))
      setAlmacenes((a.data ?? []).map((r) => r.codigo as string))
      setFormasPago((f.data ?? []) as { codigo: string; descripcion: string }[])
    })
  }, [])

  // Navegación contra el servidor: solo el vecino (gt/lt + limit 1) y el recuento, nunca la lista.
  const nav = useNavRegistro<{ tienda_terminal_codigo: string; id: number }>({
    tabla: 'factura_proveedor',
    orden: orden === 'id' ? ['tienda_terminal_codigo', 'id'] : ['fecha_hora', 'id', 'tienda_terminal_codigo'],
    actual:
      mode !== 'consulta' || !cab
        ? null
        : orden === 'id'
          ? [cab.tienda_terminal_codigo, cab.id]
          : [cab.fecha_hora, cab.id, cab.tienda_terminal_codigo],
    select: 'tienda_terminal_codigo, id',
  })
  const cargarClaves = nav.refrescar

  const cargarSatelites = useCallback(async (f: FacturaProveedor) => {
    const [a, p] = await Promise.all([
      supabase
        .from('pedido_proveedor')
        .select(ALB_COLS)
        .eq('factura_proveedor_tienda_codigo', f.tienda_terminal_codigo)
        .eq('factura_proveedor_id', f.id)
        .order('numero'),
      supabase
        .from('pago_proveedor')
        .select('tienda_terminal_codigo, codigo_pago, tipo_pago, cuota, fecha_vencimiento, estado_pago, importe_pagado, fecha_pago, id_pago, concepto')
        .eq('factura_relacionada_tienda_codigo', f.tienda_terminal_codigo)
        .eq('factura_relacionada_id', f.id)
        .order('fecha_vencimiento'),
    ])
    setAlbaranes((a.data ?? []) as Albaran[])
    setPagos((p.data ?? []) as Pago[])
  }, [])

  // Carga: la factura de la URL, la última si no hay ninguna, o una vacía en alta.
  useEffect(() => {
    let cancel = false
    async function run() {
      setMensaje(null)
      setSelAlb(0)
      setSelPago(0)
      if (esNuevo) {
        const c = vacia(tiendaDeTrabajo(tiendas.map((codigo) => ({ codigo }))))
        setCab(c)
        setOrig(null)
        setAlbaranes([])
        setPagos([])
        setNombreProv('')
        setNombreFp('')
        setMode('alta')
        return
      }
      let q = supabase.from('factura_proveedor').select(COLS)
      if (claveTienda && claveId) q = q.eq('tienda_terminal_codigo', claveTienda).eq('id', Number(claveId))
      else q = q.order('fecha_hora', { ascending: false }).order('id', { ascending: false })
      const { data } = await q.limit(1)
      if (cancel) return
      const f = ((data ?? [])[0] as FacturaProveedor | undefined) ?? null
      setCab(f)
      setOrig(f)
      setMode('consulta')
      if (f) await cargarSatelites(f)
      else {
        setAlbaranes([])
        setPagos([])
      }
    }
    run()
    return () => {
      cancel = true
    }
  }, [claveTienda, claveId, esNuevo, tiendas, cargarSatelites, recarga])

  useEffect(() => {
    if (!cab?.proveedor_codigo) return setNombreProv('')
    supabase
      .from('proveedor')
      .select('nombre')
      .eq('codigo', cab.proveedor_codigo)
      .maybeSingle()
      .then(({ data }) => setNombreProv((data?.nombre as string | undefined) ?? ''))
  }, [cab?.proveedor_codigo])

  useEffect(() => {
    setNombreFp(formasPago.find((f) => f.codigo === cab?.forma_pago_codigo)?.descripcion ?? '')
  }, [cab?.forma_pago_codigo, formasPago])

  const pagado = useMemo(() => r2(pagos.reduce((s, p) => s + n(p.importe_pagado), 0)), [pagos])
  const tot = useMemo(() => (cab ? calcularTotales(cab, albaranes, pagado) : null), [cab, albaranes, pagado])

  // Contexto para NEXA: la factura de proveedor guardada que se está consultando.
  useNexaContexto(
    cab && mode === 'consulta' && cab.id
      ? {
          documento: `Factura de proveedor ${cab.tienda_terminal_codigo}-${cab.id}`,
          proveedor: cab.proveedor_codigo,
          nombreProveedor: nombreProv,
          numeroFacturaProveedor: cab.numero_factura_externo,
          fechaFactura: cab.fecha_factura,
          fechaVencimiento: cab.fecha_vencimiento,
          formaPago: nombreFp || cab.forma_pago_codigo,
          pagada: cab.pagado,
          fechaPago: cab.fecha_pago,
          albaranes: albaranes.slice(0, 40).map((a) => `${a.tienda_terminal_codigo}-${a.numero}`),
          total: tot?.total ?? cab.total,
          pendiente: tot?.pendiente ?? cab.total_pendiente,
        }
      : null,
  )

  function patch(p: Partial<FacturaProveedor>) {
    setCab((c) => (c ? { ...c, ...p } : c))
  }

  const idx = navIndice(nav)
  const totalClaves = nav.total ?? 0
  const irNav = async (d: NavDir) => {
    const k = await nav.ir(d)
    if (k) navigate(`/facturas-proveedor/${k.tienda_terminal_codigo}/${k.id}`)
  }

  function payloadTotales(f: FacturaProveedor) {
    const t = calcularTotales(f, albaranes, pagado)
    return {
      subtotal: t.base,
      base_imponible: t.base,
      total_igic: t.igic,
      total_gastos: r2(t.gastosAlb + t.gastosAdic),
      total: t.total,
      total_a_pagar_proveedor: t.total,
      total_pendiente: t.pendiente,
      numero_pagos: pagos.length,
    }
  }

  async function guardar() {
    if (!cab) return
    if (!cab.proveedor_codigo) return setMensaje('Indica el proveedor.')
    if (!cab.tienda_terminal_codigo) return setMensaje('Indica la tienda.')
    setSaving(true)
    setMensaje(null)
    const datos = {
      fecha_hora: cab.fecha_hora,
      proveedor_codigo: cab.proveedor_codigo,
      numero_factura_externo: cab.numero_factura_externo,
      fecha_factura: cab.fecha_factura,
      fecha_vencimiento: cab.fecha_vencimiento,
      oficina_desde_codigo: cab.oficina_desde_codigo,
      oficina_hasta_codigo: cab.oficina_hasta_codigo,
      almacen_desde_codigo: cab.almacen_desde_codigo,
      almacen_hasta_codigo: cab.almacen_hasta_codigo,
      fecha_desde: cab.fecha_desde,
      fecha_hasta: cab.fecha_hasta,
      forma_pago_codigo: cab.forma_pago_codigo,
      pagado: cab.pagado,
      fecha_pago: cab.pagado ? (cab.fecha_pago ?? hoy()) : null,
      total_canon: n(cab.total_canon),
      gastos_adicionales_pct: n(cab.gastos_adicionales_pct),
      total_igic_gastos: n(cab.total_igic_gastos),
      observaciones: cab.observaciones,
      ...payloadTotales(cab),
    }
    if (mode === 'alta') {
      const { data: num, error: e1 } = await supabase.rpc('fn_siguiente_numero', {
        p_tienda: cab.tienda_terminal_codigo,
        p_tipo_documento: 'factura_proveedor',
        p_serie: '',
      })
      if (e1) {
        setSaving(false)
        return setMensaje(e1.message)
      }
      const id = Number(num)
      const { error } = await supabase.from('factura_proveedor').insert({ tienda_terminal_codigo: cab.tienda_terminal_codigo, id, ...datos })
      setSaving(false)
      if (error) return setMensaje(error.message)
      cargarClaves()
      navigate(`/facturas-proveedor/${cab.tienda_terminal_codigo}/${id}`, { replace: true })
      return
    }
    const { error } = await supabase
      .from('factura_proveedor')
      .update(datos)
      .eq('tienda_terminal_codigo', cab.tienda_terminal_codigo)
      .eq('id', cab.id)
    setSaving(false)
    if (error) return setMensaje(error.message)
    setMode('consulta')
    setRecarga((x) => x + 1)
  }

  async function eliminar() {
    if (!cab) return
    if (pagos.some((p) => n(p.importe_pagado) > 0)) return setMensaje('La factura tiene pagos realizados: no se puede eliminar.')
    if (!confirm(`¿Eliminar la factura ${cab.id}? Sus albaranes quedarán otra vez pendientes de facturar.`)) return
    await supabase
      .from('pedido_proveedor')
      .update({ factura_proveedor_tienda_codigo: null, factura_proveedor_id: null })
      .eq('factura_proveedor_tienda_codigo', cab.tienda_terminal_codigo)
      .eq('factura_proveedor_id', cab.id)
    await supabase
      .from('pago_proveedor')
      .delete()
      .eq('factura_relacionada_tienda_codigo', cab.tienda_terminal_codigo)
      .eq('factura_relacionada_id', cab.id)
    const { error } = await supabase.from('factura_proveedor').delete().eq('tienda_terminal_codigo', cab.tienda_terminal_codigo).eq('id', cab.id)
    if (error) return setMensaje(error.message)
    cargarClaves()
    navigate('/facturas-proveedor')
    setRecarga((x) => x + 1)
  }

  async function guardarTotales(f: FacturaProveedor, alb: Albaran[]) {
    const t = calcularTotales(f, alb, pagado)
    await supabase
      .from('factura_proveedor')
      .update({
        subtotal: t.base,
        base_imponible: t.base,
        total_igic: t.igic,
        total_gastos: r2(t.gastosAlb + t.gastosAdic),
        total: t.total,
        total_a_pagar_proveedor: t.total,
        total_pendiente: t.pendiente,
      })
      .eq('tienda_terminal_codigo', f.tienda_terminal_codigo)
      .eq('id', f.id)
  }

  async function agregarAlbaran(r: Record<string, unknown>) {
    setLookup(null)
    if (!cab) return
    const { error } = await supabase
      .from('pedido_proveedor')
      .update({ factura_proveedor_tienda_codigo: cab.tienda_terminal_codigo, factura_proveedor_id: cab.id })
      .eq('tienda_terminal_codigo', r.tienda_terminal_codigo as string)
      .eq('numero', Number(r.numero))
    if (error) return setMensaje(error.message)
    const nuevos = [...albaranes, r as unknown as Albaran]
    await guardarTotales(cab, nuevos)
    setRecarga((x) => x + 1)
  }

  async function quitarAlbaran() {
    const a = albaranes[selAlb]
    if (!cab || !a) return
    if (!confirm(`¿Quitar el albarán ${a.tienda_terminal_codigo}-${a.numero} de esta factura?`)) return
    await supabase.from('pedido_proveedor').update({ factura_proveedor_tienda_codigo: null, factura_proveedor_id: null }).eq('tienda_terminal_codigo', a.tienda_terminal_codigo).eq('numero', a.numero)
    await guardarTotales(
      cab,
      albaranes.filter((_, i) => i !== selAlb),
    )
    setRecarga((x) => x + 1)
  }

  async function recalcular() {
    if (!cab) return
    await guardarTotales(cab, albaranes)
    setRecarga((x) => x + 1)
  }

  /** Genera los vencimientos según la forma de pago (nº de pagos, % de entrada y cadencias en días). */
  async function generarPagos() {
    if (!cab || !tot) return
    if (pagos.length > 0) return setMensaje('La factura ya tiene pagos generados.')
    if (!cab.forma_pago_codigo) return setMensaje('Indica la forma de pago para generar los vencimientos.')
    if (tot.total <= 0) return setMensaje('La factura no tiene importe.')
    const { data: fp } = await supabase.from('forma_pago').select('*').eq('codigo', cab.forma_pago_codigo).maybeSingle()
    const numPagos = Math.max(1, Number(fp?.generador_num_pagos ?? 1))
    const pctEntrada = Number(fp?.generador_pct_entrada ?? 0)
    const base = cab.fecha_factura ?? hoy()
    const entrada = r2((tot.total * pctEntrada) / 100)
    const resto = r2(tot.total - entrada)
    const plazos = pctEntrada > 0 ? numPagos - 1 : numPagos
    const cuotas: { importe: number; dias: number }[] = []
    if (pctEntrada > 0) cuotas.push({ importe: entrada, dias: 0 })
    let acumulado = 0
    for (let i = 0; i < plazos; i++) {
      const importe = i === plazos - 1 ? r2(resto - acumulado) : r2(resto / plazos)
      acumulado = r2(acumulado + importe)
      const dias = Number(fp?.[`cadencia_nivel${Math.min(i, 6)}`] ?? 0)
      cuotas.push({ importe, dias: dias || 0 })
    }
    let diasAcum = 0
    for (let i = 0; i < cuotas.length; i++) {
      diasAcum = i === 0 ? cuotas[i].dias : diasAcum + cuotas[i].dias
      const { data: num, error: e1 } = await supabase.rpc('fn_siguiente_numero', {
        p_tienda: cab.tienda_terminal_codigo,
        p_tipo_documento: 'pago_proveedor',
        p_serie: '',
      })
      if (e1) return setMensaje(e1.message)
      const { error } = await supabase.from('pago_proveedor').insert({
        tienda_terminal_codigo: cab.tienda_terminal_codigo,
        codigo_pago: Number(num),
        receptor_codigo: cab.proveedor_codigo,
        receptor_nombre: nombreProv || null,
        numero_factura_externa: cab.numero_factura_externo,
        fecha_factura: cab.fecha_factura,
        fecha_vencimiento: sumaDias(base, diasAcum),
        cuota: cuotas[i].importe,
        importe_pagado: 0,
        estado_pago: 'Pendiente',
        tipo_pago: cab.forma_pago_codigo,
        id_pago: i + 1,
        concepto: `${i + 1} de ${cuotas.length}`,
        fecha: hoy(),
        factura_relacionada_tienda_codigo: cab.tienda_terminal_codigo,
        factura_relacionada_id: cab.id,
      })
      if (error) return setMensaje(error.message)
    }
    const ultimo = sumaDias(base, diasAcum)
    await supabase
      .from('factura_proveedor')
      .update({ numero_pagos: cuotas.length, fecha_vencimiento: ultimo })
      .eq('tienda_terminal_codigo', cab.tienda_terminal_codigo)
      .eq('id', cab.id)
    setRecarga((x) => x + 1)
  }

  const th = 'whitespace-nowrap'
  const num = 'text-right tabular-nums'
  const disabledCab = !editing

  return (
    <div className="flex flex-col gap-1">
      {/* Cabecera */}
      <div className="flex gap-2">
        <div className="grid flex-none grid-cols-[70px_110px_170px_130px_120px_120px] gap-x-1 border border-[var(--gw-border-light)] px-1.5 pb-1.5 pt-0.5">
          <GwField label={<span className="text-[15px]">Tienda</span>}>
            <GwSelect value={cab?.tienda_terminal_codigo ?? ''} disabled={mode !== 'alta'} onChange={(e) => patch({ tienda_terminal_codigo: e.target.value })}>
              {tiendas.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </GwSelect>
          </GwField>
          <GwField label={<span className="text-[15px]">Id. Factura</span>}>
            <GwInput readOnly className="gw-num" value={cab && mode !== 'alta' ? cab.id : ''} title="ID" />
          </GwField>
          <GwField label={<span className="text-[15px]">Fecha y Hora</span>}>
            <GwInput readOnly value={fechaHora(cab?.fecha_hora)} />
          </GwField>
          <GwField label={<span className="text-[15px]">Nº de Factura</span>}>
            <GwInput
              className="gw-num"
              title="NUMFACTURA"
              disabled={disabledCab}
              value={cab?.numero_factura_externo ?? ''}
              onChange={(e) => patch({ numero_factura_externo: e.target.value || null })}
            />
          </GwField>
          <GwField label={<span className="text-[15px]">Fec. Factura</span>}>
            <GwDate disabled={disabledCab} value={cab?.fecha_factura} onChange={(v) => patch({ fecha_factura: v })} />
          </GwField>
          <GwField label={<span className="text-[15px]">Fec. Vencim.</span>}>
            <GwDate disabled={disabledCab} value={cab?.fecha_vencimiento} onChange={(v) => patch({ fecha_vencimiento: v })} />
          </GwField>
        </div>
        <GwGroup title={<span className="text-[15px]">Proveedor</span>} className="min-w-0 max-w-[540px] flex-1">
          <div className="flex gap-1">
            <GwInput
              className="!w-[120px]"
              disabled={mode !== 'alta'}
              value={cab?.proveedor_codigo ?? ''}
              onChange={(e) => patch({ proveedor_codigo: e.target.value })}
            />
            <GwInput readOnly value={nombreProv} tabIndex={-1} />
            <GwLookupButton disabled={mode !== 'alta'} onClick={() => setLookup('proveedor')} title="Buscar proveedor" />
          </div>
        </GwGroup>
      </div>

      <div className="flex gap-2">
        <GwGroup title={<span className="text-[15px]">Periodo Facturado</span>} className="w-[310px] flex-none">
          <div className="flex items-center gap-1">
            <GwDate disabled={disabledCab} value={cab?.fecha_desde} onChange={(v) => patch({ fecha_desde: v })} />
            <span>—</span>
            <GwDate disabled={disabledCab} value={cab?.fecha_hasta} onChange={(v) => patch({ fecha_hasta: v })} />
          </div>
        </GwGroup>
        <GwGroup title={<span className="text-[15px]">Tiendas Facturadas</span>} className="w-[300px] flex-none">
          <DesdeHasta
            opciones={tiendas}
            disabled={disabledCab}
            desde={cab?.oficina_desde_codigo ?? ''}
            hasta={cab?.oficina_hasta_codigo ?? ''}
            onChange={(d, h) => patch({ oficina_desde_codigo: d || null, oficina_hasta_codigo: h || null })}
          />
        </GwGroup>
        <GwGroup title={<span className="text-[15px]">Almacenes Facturados</span>} className="w-[300px] flex-none">
          <DesdeHasta
            opciones={almacenes}
            disabled={disabledCab}
            desde={cab?.almacen_desde_codigo ?? ''}
            hasta={cab?.almacen_hasta_codigo ?? ''}
            onChange={(d, h) => patch({ almacen_desde_codigo: d || null, almacen_hasta_codigo: h || null })}
          />
        </GwGroup>
        <GwGroup title={<span className="text-[15px]">Forma de pago</span>} className="min-w-0 flex-1">
          <div className="flex gap-1">
            <GwInput
              className="!w-[70px]"
              disabled={disabledCab}
              value={cab?.forma_pago_codigo ?? ''}
              onChange={(e) => patch({ forma_pago_codigo: e.target.value || null })}
            />
            <GwSelect disabled={disabledCab} value={cab?.forma_pago_codigo ?? ''} onChange={(e) => patch({ forma_pago_codigo: e.target.value || null })}>
              <option value="">{nombreFp || ''}</option>
              {formasPago.map((f) => (
                <option key={f.codigo} value={f.codigo}>
                  {f.descripcion}
                </option>
              ))}
            </GwSelect>
            <GwLookupButton disabled={disabledCab} onClick={() => setLookup('forma')} title="Buscar forma de pago" />
          </div>
        </GwGroup>
      </div>

      {/* Albaranes */}
      <div className="h-[210px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th className={th} style={{ width: 36 }}>Ti.</th>
              <th className={th} style={{ width: 80 }}>Numero</th>
              <th className={th} style={{ width: 92 }}>Fecha Lle.</th>
              <th className={`${th} text-center!`}>Nº Albaran</th>
              <th className={th} style={{ width: 100 }}>Fecha Alb.</th>
              <th className={th} style={{ width: 34 }}>Act.</th>
              <th className={`${th} text-center!`} style={{ width: 110 }}>Subtotal</th>
              <th className={`${th} text-center!`} style={{ width: 90 }}>IGIC</th>
              <th className={th} style={{ width: 110 }}>Subtotal</th>
              <th className={`${th} text-center!`} style={{ width: 100 }}>Gastos Adic.</th>
              <th className={`${th} text-center!`} style={{ width: 84 }}>IGIC Gast.</th>
              <th className={th} style={{ width: 100 }}>Total Gastos</th>
              <th className={th} style={{ width: 110 }}>Total Factura</th>
            </tr>
          </thead>
          <tbody>
            {albaranes.map((a, i) => (
              <tr key={`${a.tienda_terminal_codigo}-${a.numero}`} className={i === selAlb ? 'gw-selected' : ''} onClick={() => setSelAlb(i)} onDoubleClick={() => navigate(`/pedidos-proveedor/${a.tienda_terminal_codigo}/${a.numero}`)}>
                <td>{a.tienda_terminal_codigo}</td>
                <td className={num}>{a.numero}</td>
                <td>{fecha(a.fecha_recepcion)}</td>
                <td>{a.numero_albaran_proveedor ?? ''}</td>
                <td>{fecha(a.fecha_hora)}</td>
                <td className="text-center">{a.stock_movido ? '☑' : '☐'}</td>
                <td className={num}>{formatGw(n(a.base_imponible), 2)}</td>
                <td className={num}>{formatGw(n(a.total_igic), 2)}</td>
                <td className={num}>{formatGw(n(a.base_imponible) + n(a.total_igic), 2)}</td>
                <td className={num}>{formatGw(n(a.total_gastos), 2)}</td>
                <td className={num}>{formatGw(0, 2)}</td>
                <td className={num}>{formatGw(n(a.total_gastos), 2)}</td>
                <td className={num}>{formatGw(n(a.total), 2)}</td>
              </tr>
            ))}
            <FilasVacias cols={13} ocupadas={albaranes.length} total={9} />
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-1.5">
        {/* Pie izquierdo: totales, pagado y observaciones */}
        <div className="flex flex-col gap-1">
          <GridMiniBar
            nuevo={mode === 'consulta' && !!cab}
            modificar={!!albaranes[selAlb]}
            borrar={mode === 'consulta' && !!albaranes[selAlb]}
            buscar={!!cab}
            onNuevo={() => setLookup('albaran')}
            onModificar={() => {
              const a = albaranes[selAlb]
              if (a) navigate(`/pedidos-proveedor/${a.tienda_terminal_codigo}/${a.numero}`)
            }}
            onBorrar={quitarAlbaran}
            onBuscar={() => setLookup('albaran')}
          >
            <button type="button" className="gw-btn h-[22px] px-2" title="Recalcular totales" disabled={mode !== 'consulta' || !cab} onClick={recalcular}>
              <RefreshCw size={13} className="text-[#127a12]" />
            </button>
            <span className="flex-1 text-[15px] text-[#1a4fd0]">Nº de Alb.: {albaranes.length}</span>
            <span className="pr-2 text-[15px] font-bold tabular-nums">{formatGw(tot?.base ?? 0, 2)}</span>
          </GridMiniBar>
          <div className="grid grid-cols-[150px_110px_minmax(0,1fr)_110px] items-center gap-x-2 text-[15px]">
            <span />
            <span className="text-right">Total IGIC:</span>
            <span className="text-right font-bold tabular-nums">{formatGw(tot?.igic ?? 0, 2)}</span>
            <span className="text-right font-bold tabular-nums">{formatGw((tot?.base ?? 0) + (tot?.igic ?? 0), 2)}</span>
            <span />
            <span className="text-right">Canon:</span>
            <span className="flex justify-end">
              <GwNumber
                className="!w-[100px]"
                decimals={2}
                disabled={!editing}
                value={cab?.total_canon ?? 0}
                onChange={(v) => patch({ total_canon: v ?? 0 })}
              />
            </span>
            <span className="text-right font-bold tabular-nums">{formatGw((tot?.base ?? 0) + (tot?.igic ?? 0) + n(cab?.total_canon), 2)}</span>
            <span>Gastos Adicic.:</span>
            <span className="flex items-center gap-1">
              <GwNumber
                className="!w-[70px]"
                decimals={2}
                disabled={!editing}
                value={cab?.gastos_adicionales_pct ?? 0}
                onChange={(v) => patch({ gastos_adicionales_pct: v ?? 0 })}
              />
              %
            </span>
            <span className="flex items-center justify-end gap-2">
              <span className="font-bold tabular-nums">{formatGw(tot?.gastosAdic ?? 0, 2)}</span>
              <span className="font-bold">Igic:</span>
              <GwNumber
                className="!w-[80px]"
                decimals={2}
                disabled={!editing}
                value={cab?.total_igic_gastos ?? 0}
                onChange={(v) => patch({ total_igic_gastos: v ?? 0 })}
              />
            </span>
            <span className="text-right font-bold tabular-nums">{formatGw((tot?.gastosAlb ?? 0) + (tot?.gastosAdic ?? 0) + n(cab?.total_igic_gastos), 2)}</span>
          </div>
          <div className="grid grid-cols-[150px_150px_minmax(0,1fr)_110px] items-center gap-x-2">
            <button
              type="button"
              className="gw-btn row-span-2 h-[50px] text-[16px]"
              disabled={!editing}
              title="FACTPAGADA"
              onClick={() => patch({ pagado: !cab?.pagado, fecha_pago: !cab?.pagado ? (cab?.fecha_pago ?? hoy()) : null })}
            >
              {cab?.pagado ? <Check size={16} className="text-[#127a12]" /> : <X size={16} className="text-[#c42b1c]" />}
              Pagado
            </button>
            <GwField label={<span className="text-[15px]">Fecha del Pago</span>} className="row-span-2">
              <GwDate disabled={!editing || !cab?.pagado} value={cab?.fecha_pago} onChange={(v) => patch({ fecha_pago: v })} />
            </GwField>
            <span className="text-right text-[16px] font-bold">Total...:</span>
            <span className="text-right text-[16px] font-bold tabular-nums">{formatGw(tot?.total ?? 0, 2)}</span>
            <span className="text-right text-[16px] font-bold">Pagado:</span>
            <span className="text-right text-[16px] font-bold tabular-nums">{formatGw(pagado, 2)}</span>
          </div>
          <div className="flex items-end justify-between">
            <span className="text-[16px] font-bold">Observaciones</span>
            <span className={`pr-2 text-[16px] font-bold ${cab && (cab.pagado || (tot && tot.total > 0 && tot.pendiente <= 0)) ? 'text-[#1a4fd0]' : 'text-[#c42b1c]'}`}>
              {cab ? (cab.pagado || (tot && tot.total > 0 && tot.pendiente <= 0) ? 'Factura Pagada' : 'Factura Pendiente') : ''}
            </span>
          </div>
          <GwTextArea rows={3} disabled={!editing} value={cab?.observaciones ?? ''} onChange={(e) => patch({ observaciones: e.target.value || null })} />
        </div>

        {/* Pie derecho: vencimientos y botones */}
        <div className="flex flex-col gap-1">
          <span className="text-[15px] text-[#1a4fd0]">Pagos de la factura</span>
          <div className="h-[132px] overflow-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid">
              <thead className="sticky top-0">
                <tr>
                  <th style={{ width: 44 }}>F. P.</th>
                  <th className="text-center!">Cuota Pago</th>
                  <th>Fech. Venc.</th>
                  <th>Estado</th>
                  <th className="text-center!">Pagado</th>
                  <th>Fech. Pago</th>
                  <th style={{ width: 30 }}>Nº</th>
                  <th>Concepto</th>
                </tr>
              </thead>
              <tbody>
                {pagos.map((p, i) => (
                  <tr key={`${p.tienda_terminal_codigo}-${p.codigo_pago}`} className={i === selPago ? 'gw-selected' : ''} onClick={() => setSelPago(i)}>
                    <td>{p.tipo_pago ?? ''}</td>
                    <td className={num}>{formatGw(n(p.cuota), 3)}</td>
                    <td>{fecha(p.fecha_vencimiento)}</td>
                    <td>{p.estado_pago ?? ''}</td>
                    <td className={num}>{formatGw(n(p.importe_pagado), 2)}</td>
                    <td>{fecha(p.fecha_pago)}</td>
                    <td className={num}>{p.id_pago ?? ''}</td>
                    <td className="whitespace-nowrap">{p.concepto ?? ''}</td>
                  </tr>
                ))}
                <FilasVacias cols={8} ocupadas={pagos.length} total={5} />
              </tbody>
            </table>
          </div>
          <GridMiniBar
            nuevo={false}
            modificar={!!pagos[selPago]}
            borrar={false}
            buscar={false}
            onModificar={() => navigate('/pagos-proveedor')}
          >
            <span className="flex-1 text-[15px] text-[#1a4fd0]">Nº Pagos: {pagos.length}</span>
            <span className="pr-2 text-[16px] font-bold tabular-nums">Pagado: {formatGw(pagado, 2)}</span>
          </GridMiniBar>
          <div className="mt-auto grid grid-cols-4 gap-1">
            <BotonGrande onClick={() => setGenerar(true)} disabled={mode !== 'consulta'} icono={<Settings2 size={16} />}>
              Generar Facturas
            </BotonGrande>
            <BotonGrande onClick={() => navigate('/pedidos-proveedor')} disabled={mode !== 'consulta'} icono={<ShoppingCart size={16} className="text-[#a0522d]" />}>
              Pedidos
            </BotonGrande>
            <BotonGrande onClick={() => navigate('/pagos-proveedor')} disabled={mode !== 'consulta'} icono={<HandCoins size={16} className="text-[#127a12]" />}>
              Ir a Pagos
            </BotonGrande>
            <BotonGrande onClick={generarPagos} disabled={mode !== 'consulta' || !cab || pagos.length > 0} icono={<FileText size={16} />}>
              Generar Pagos
            </BotonGrande>
          </div>
        </div>
      </div>

      <GwRecordBar
        mode={mode}
        canNavigate={mode === 'consulta' && idx >= 0}
        saving={saving}
        onFirst={() => irNav('primero')}
        onPrev={() => idx > 0 && irNav('anterior')}
        onNext={() => idx >= 0 && idx < totalClaves - 1 && irNav('siguiente')}
        onLast={() => irNav('ultimo')}
        onSort={() => setOrden((o) => (o === 'id' ? 'fecha' : 'id'))}
        onSearch={() => setLookup('buscar')}
        onPrint={() => window.print()}
        onNew={() => navigate('/facturas-proveedor/nuevo')}
        onEdit={() => cab && setMode('edicion')}
        onDelete={eliminar}
        onSave={guardar}
        onCancel={() => {
          if (mode === 'alta') navigate('/facturas-proveedor')
          else {
            setCab(orig)
            setMode('consulta')
          }
        }}
        onExit={() => navigate('/')}
      />
      <span className="gw-label text-[11px] text-[#555]">
        {mensaje ?? `Orden: ${orden === 'id' ? 'por Id. factura' : 'por fecha'} · ${idx >= 0 ? `Registro ${idx + 1} de ${totalClaves}` : mode === 'alta' ? 'Alta de factura' : nav.total !== 0 ? '' : 'No hay facturas de proveedor'}`}
      </span>

      {lookup === 'proveedor' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Proveedores"
          table="proveedor"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'nombre', label: 'Nombre' },
            { key: 'nif', label: 'NIF', width: 110 },
          ]}
          searchColumns={['codigo', 'nombre', 'nif']}
          orderBy="nombre"
          keyColumn="codigo"
          onPick={(r) => {
            setLookup(null)
            patch({ proveedor_codigo: r.codigo as string })
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'forma' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Formas de pago"
          table="forma_pago"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo', 'descripcion']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            setLookup(null)
            patch({ forma_pago_codigo: r.codigo as string })
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'buscar' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Localizar facturas de proveedor"
          table="factura_proveedor"
          columns={[
            { key: 'tienda_terminal_codigo', label: 'Ti.', width: 50 },
            { key: 'id', label: 'Id. Factura', width: 100 },
            { key: 'numero_factura_externo', label: 'Nº de Factura', width: 130 },
            { key: 'proveedor_codigo', label: 'Proveedor', width: 100 },
            { key: 'fecha_factura', label: 'Fec. Factura' },
          ]}
          searchColumns={['numero_factura_externo', 'proveedor_codigo']}
          orderBy="id"
          keyColumn="id"
          onPick={(r) => {
            setLookup(null)
            navigate(`/facturas-proveedor/${r.tienda_terminal_codigo as string}/${r.id as number}`)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {lookup === 'albaran' && cab && (
        <AlbaranesPendientesDialog proveedor={cab.proveedor_codigo} onPick={agregarAlbaran} onClose={() => setLookup(null)} />
      )}
      {generar && (
        <GenerarFacturasDialog
          tiendas={tiendas}
          onClose={() => setGenerar(false)}
          onHecho={async (creadas) => {
            setGenerar(false)
            cargarClaves()
            setMensaje(creadas.length ? `Generadas ${creadas.length} facturas.` : 'No hay albaranes recibidos pendientes de facturar en ese periodo.')
            if (creadas[0]) navigate(`/facturas-proveedor/${creadas[0].t}/${creadas[0].id}`)
          }}
        />
      )}
    </div>
  )
}

function DesdeHasta({
  opciones,
  desde,
  hasta,
  disabled,
  onChange,
}: {
  opciones: string[]
  desde: string
  hasta: string
  disabled: boolean
  onChange: (desde: string, hasta: string) => void
}) {
  return (
    <div className="flex items-center gap-1.5 text-[15px]">
      Desde:
      <GwSelect className="!w-[70px]" disabled={disabled} value={desde} onChange={(e) => onChange(e.target.value, hasta)}>
        <option value="" />
        {opciones.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </GwSelect>
      Hasta:
      <GwSelect className="!w-[70px]" disabled={disabled} value={hasta} onChange={(e) => onChange(desde, e.target.value)}>
        <option value="" />
        {opciones.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </GwSelect>
    </div>
  )
}

function BotonGrande({ children, icono, onClick, disabled }: { children: string; icono: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="gw-btn h-[42px] gap-1.5 whitespace-nowrap px-1 text-[16px]" disabled={disabled} onClick={onClick}>
      {icono}
      {children}
    </button>
  )
}

/** Albaranes (pedidos de proveedor recibidos) del proveedor que aún no están en ninguna factura. */
function AlbaranesPendientesDialog({
  proveedor,
  onPick,
  onClose,
}: {
  proveedor: string
  onPick: (r: Record<string, unknown>) => void
  onClose: () => void
}) {
  const [rows, setRows] = useState<Albaran[]>([])
  const [sel, setSel] = useState(0)
  useEffect(() => {
    supabase
      .from('pedido_proveedor')
      .select(ALB_COLS)
      .eq('proveedor_codigo', proveedor)
      .eq('recibido', true)
      .is('factura_proveedor_id', null)
      .order('fecha_hora')
      .then(({ data }) => setRows((data ?? []) as Albaran[]))
  }, [proveedor])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title={`Albaranes recibidos sin facturar del proveedor ${proveedor}`} onClose={onClose} className="w-[640px] max-w-[95vw]">
        <div className="max-h-[320px] overflow-y-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th>Ti.</th>
                <th>Numero</th>
                <th>Nº Albaran</th>
                <th>Fecha Lle.</th>
                <th className="text-right!">Total</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="text-center text-[#6d6d6d]">
                    No hay albaranes pendientes de facturar.
                  </td>
                </tr>
              )}
              {rows.map((a, i) => (
                <tr
                  key={`${a.tienda_terminal_codigo}-${a.numero}`}
                  className={i === sel ? 'gw-selected' : ''}
                  onClick={() => setSel(i)}
                  onDoubleClick={() => onPick(a as unknown as Record<string, unknown>)}
                >
                  <td>{a.tienda_terminal_codigo}</td>
                  <td>{a.numero}</td>
                  <td>{a.numero_albaran_proveedor ?? ''}</td>
                  <td>{fecha(a.fecha_recepcion)}</td>
                  <td className="text-right">{formatGw(n(a.total), 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-1.5 flex justify-end gap-1.5">
          <button type="button" className="gw-btn" disabled={!rows[sel]} onClick={() => rows[sel] && onPick(rows[sel] as unknown as Record<string, unknown>)}>
            Aceptar
          </button>
          <button type="button" className="gw-btn" onClick={onClose}>
            Cancelar
          </button>
        </div>
      </GwWindow>
    </div>
  )
}
