import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Binoculars, Check, FilePen, FilePlus2, FileX2, Sheet, Wallet, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { aplicarArticulo, tocarLinea, type LineaEnEdicion } from '../../../lib/lineaEnEdicion'
import { ahoraTrabajo, fechaTrabajo, tiendaDeTrabajo } from '../../../lib/sesionTrabajo'
import { textoRegistro, useNavRegistro, type NavDir } from '../../../components/gw/useNavRegistro'
import { useAuth } from '../../../lib/AuthContext'
import { useNexaContexto } from '../../../nexa/contexto'
import { GwDate, GwInput, GwLookupButton, GwNumber, GwSelect, GwTextArea, GwWindow, formatGw } from '../../../components/gw'
import { GwLookupDialog, type GwLookupColumn } from '../../../components/gw/GwLookupDialog'
import { buscarArticulo } from '../../ventas/pedidos/precios'
import { CompraBar } from './CompraBar'
import { camposTotales } from './totales'
import {
  CAB_COMPRA_COLS,
  ESTADOS_COMPRA,
  LINEA_COMPRA_COLS,
  actualizarCompra,
  calcularCompra,
  netoLinea,
  r3,
  subLinea,
  type CabeceraCompra,
  type LineaCompra,
} from './compras'

// Ficha «Compras» (Compras → Pedidos a Proveedores) de GeminisWin: pedido y albarán de proveedor
// en el mismo documento. «Actualizado» entra el stock y recalcula los costes del artículo.
// Con `rapida` es «Creación rápida de pedidos»: el mismo documento con letra grande y sin
// transporte, pagos, gastos ni canon.

interface Tienda {
  codigo: string
  almacen_codigo: string | null
}

interface Codigo {
  codigo: string
  nombre: string
}

interface ProveedorInfo {
  codigo: string
  nombre: string
  forma_pago_codigo: string | null
  descuento_pie_pct: number | null
  no_aplica_impuesto2: boolean
  almacen_defecto_codigo: string | null
}

const ARTICULO_COMPRA_COLS =
  'codigo_interno, descripcion, codigo_compra_habitual, coste_puro, coste_neto, ultimo_descuento_compra_pct, igic_pct, impuesto2_pct, unidades_por_caja, cajas_por_bulto'

const LOOKUP_PROVEEDOR: GwLookupColumn[] = [
  { key: 'codigo', label: 'Código', width: 90 },
  { key: 'nombre', label: 'Nombre' },
  { key: 'nif', label: 'Nif', width: 110 },
]
const LOOKUP_ARTICULO: GwLookupColumn[] = [
  { key: 'codigo_interno', label: 'Código Interno', width: 120 },
  { key: 'codigo_compra_habitual', label: 'Código Compra', width: 120 },
  { key: 'descripcion', label: 'Descripción' },
]
const LOOKUP_PEDIDO: GwLookupColumn[] = [
  { key: 'tienda_terminal_codigo', label: 'Tienda', width: 60 },
  { key: 'numero', label: 'Número', width: 90 },
  { key: 'proveedor_codigo', label: 'Proveedor', width: 90 },
  { key: 'numero_factura_proveedor_externo', label: 'Nº Factura' },
  { key: 'estado', label: 'Estado', width: 120 },
]
const LOOKUP_CODIGO: GwLookupColumn[] = [
  { key: 'codigo', label: 'Código', width: 90 },
  { key: 'nombre', label: 'Nombre' },
]
const LOOKUP_FORMA_PAGO: GwLookupColumn[] = [
  { key: 'codigo', label: 'Código', width: 90 },
  { key: 'descripcion', label: 'Descripción' },
]

// Fecha de trabajo (Utilidades → Cambio de Fecha), por defecto hoy.
function hoy() {
  return fechaTrabajo()
}

function fechaHoraEs(v: string | null | undefined) {
  if (!v) return ''
  const d = new Date(v)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function vacia(tienda: Tienda | undefined): CabeceraCompra {
  return {
    tienda_terminal_codigo: tienda?.codigo ?? '01',
    numero: null,
    fecha_hora: ahoraTrabajo().toISOString(),
    proveedor_codigo: '',
    almacen_codigo: tienda?.almacen_codigo ?? '01',
    estado: 'pendiente',
    es_abono: false,
    numero_factura_proveedor_externo: null,
    fecha_solicitud: hoy(),
    fecha_prevista: null,
    fecha_factura: null,
    fecha_pago: null,
    fecha_vencimiento_1: null,
    fecha_recepcion: null,
    transportista_codigo: null,
    transporte_numero_factura: null,
    transporte_factura_pagada: false,
    transporte_forma_pago_codigo: null,
    transporte_fecha_pago: null,
    transporte_coste: 0,
    transporte_igic_pct: 0,
    forma_pago_codigo: null,
    descuento_pie_pct: 0,
    igic_pie_pct: 0,
    gastos_proveedor: 0,
    gastos_proveedor_igic_pct: 0,
    otros_gastos: 0,
    recibido: false,
    stock_movido: false,
    pagado: false,
    proveedor_pagado: false,
    no_pasar_contabilidad: false,
    observaciones: null,
  }
}

function lineaVacia(): LineaCompra {
  return {
    articulo_codigo: '',
    codigo_compra: '',
    descripcion: '',
    bultos: 0,
    cajas: 0,
    cantidad: 1,
    unidades_por_caja: 0,
    cajas_por_bulto: 0,
    coste_anterior: null,
    precio_compra: 0,
    descuento_pct: 0,
    igic_pct: 0,
    canon: 0,
    bonificacion: 0,
  }
}

const NUM_CAB: (keyof CabeceraCompra)[] = [
  'transporte_coste',
  'transporte_igic_pct',
  'descuento_pie_pct',
  'igic_pie_pct',
  'gastos_proveedor',
  'gastos_proveedor_igic_pct',
  'otros_gastos',
]

export function PedidoProveedorFichaPage({ rapida = false }: { rapida?: boolean }) {
  const params = useParams()
  const [search] = useSearchParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const base = rapida ? '/creacion-rapida-pedidos' : '/pedidos-proveedor'
  // La ficha completa lleva la clave en la ruta; la creación rápida (ruta sin comodín), en la query.
  const resto = rapida
    ? search.get('nuevo')
      ? ['nuevo']
      : search.get('t') && search.get('n')
        ? [search.get('t') as string, search.get('n') as string]
        : []
    : (params['*'] ?? '').split('/').filter(Boolean)
  const esNuevo = resto[0] === 'nuevo'
  const claveTienda = !esNuevo && resto.length >= 2 ? decodeURIComponent(resto[0]) : null
  const claveNumero = !esNuevo && resto.length >= 2 ? Number(resto[1]) : null
  const rutaDoc = (k: { t: string; n: number }) =>
    rapida ? `${base}?t=${encodeURIComponent(k.t)}&n=${k.n}` : `${base}/${encodeURIComponent(k.t)}/${k.n}`
  const rutaNuevo = rapida ? `${base}?nuevo=1` : `${base}/nuevo`

  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>(esNuevo ? 'alta' : 'consulta')
  const [tiendas, setTiendas] = useState<Tienda[]>([])
  const [almacenes, setAlmacenes] = useState<Codigo[]>([])
  const [transportistas, setTransportistas] = useState<Codigo[]>([])
  const [formasPago, setFormasPago] = useState<Codigo[]>([])
  const [empleado, setEmpleado] = useState<string | null>(null)
  const [cab, setCab] = useState<CabeceraCompra | null>(null)
  const [orig, setOrig] = useState<{ cab: CabeceraCompra; lineas: LineaCompra[] } | null>(null)
  const [lineas, setLineas] = useState<LineaCompra[]>([])
  const [proveedor, setProveedor] = useState<ProveedorInfo | null>(null)
  const [orden, setOrden] = useState<'numero' | 'proveedor'>('numero')
  const [sel, setSel] = useState(0)
  const [editLinea, setEditLinea] = useState<LineaEnEdicion<LineaCompra> | null>(null)
  // Nº de la última carga de artículo pedida para la línea: una respuesta más antigua no manda.
  const cargaArticulo = useRef(0)
  const [stockSel, setStockSel] = useState<number | null>(null)
  const [dialogo, setDialogo] = useState<null | 'proveedor' | 'almacen' | 'transportista' | 'forma_pago' | 'forma_pago_t' | 'articulo' | 'buscar' | 'importar'>(null)
  const [importTexto, setImportTexto] = useState('')
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [refresco, setRefresco] = useState(0)

  const editing = mode !== 'consulta'
  const ro = !editing

  useEffect(() => {
    supabase
      .from('tienda_terminal')
      .select('codigo, almacen_codigo')
      .order('codigo')
      .then(({ data }) => setTiendas((data ?? []) as Tienda[]))
    supabase
      .from('almacen')
      .select('codigo, nombre')
      .order('codigo')
      .then(({ data }) => setAlmacenes((data ?? []) as Codigo[]))
    supabase
      .from('transportista')
      .select('codigo, nombre')
      .order('nombre')
      .then(({ data }) => setTransportistas((data ?? []) as Codigo[]))
    supabase
      .from('forma_pago')
      .select('codigo, descripcion')
      .eq('no_ver_en_compras', false)
      .order('descripcion')
      .then(({ data }) => setFormasPago((data ?? []).map((f) => ({ codigo: f.codigo as string, nombre: (f.descripcion as string) ?? '' }))))
    const uid = session?.user.id
    if (uid)
      supabase
        .from('empleado')
        .select('codigo')
        .eq('auth_user_id', uid)
        .maybeSingle()
        .then(({ data }) => setEmpleado(data?.codigo ?? null))
  }, [session?.user.id])

  // Navegación contra el servidor: solo el vecino (gt/lt + limit 1) y el recuento, nunca la lista.
  const nav = useNavRegistro<{ tienda_terminal_codigo: string; numero: number }>({
    tabla: 'pedido_proveedor',
    orden: orden === 'numero' ? ['tienda_terminal_codigo', 'numero'] : ['proveedor_codigo', 'numero', 'tienda_terminal_codigo'],
    actual:
      mode !== 'consulta' || !cab || cab.numero == null
        ? null
        : orden === 'numero'
          ? [cab.tienda_terminal_codigo, cab.numero]
          : [cab.proveedor_codigo, cab.numero, cab.tienda_terminal_codigo],
    select: 'tienda_terminal_codigo, numero',
  })
  const cargarClaves = nav.refrescar

  const cargarProveedor = useCallback(async (codigo: string) => {
    if (!codigo) {
      setProveedor(null)
      return null
    }
    const { data } = await supabase
      .from('proveedor')
      .select('codigo, nombre, forma_pago_codigo, descuento_pie_pct, no_aplica_impuesto2, almacen_defecto_codigo')
      .eq('codigo', codigo)
      .maybeSingle()
    setProveedor((data as ProveedorInfo | null) ?? null)
    return (data as ProveedorInfo | null) ?? null
  }, [])

  // Carga del documento: el de la URL, el último si no hay ninguno, o uno vacío en alta.
  useEffect(() => {
    let cancel = false
    async function run() {
      setCargando(true)
      setMensaje(null)
      setEditLinea(null)
      setSel(0)
      if (esNuevo) {
        setCab(vacia(tiendas.find((t) => t.codigo === tiendaDeTrabajo(tiendas))))
        setOrig(null)
        setLineas([])
        setProveedor(null)
        setMode('alta')
        setCargando(false)
        return
      }
      let q = supabase.from('pedido_proveedor').select(CAB_COMPRA_COLS)
      if (claveTienda && claveNumero != null) q = q.eq('tienda_terminal_codigo', claveTienda).eq('numero', claveNumero)
      else q = q.order('fecha_hora', { ascending: false }).order('numero', { ascending: false })
      const { data } = await q.limit(1)
      if (cancel) return
      const raw = ((data ?? [])[0] as CabeceraCompra | undefined) ?? null
      if (!raw) {
        setCab(null)
        setOrig(null)
        setLineas([])
        setMode('consulta')
        setCargando(false)
        return
      }
      const c = { ...raw }
      for (const k of NUM_CAB) (c as unknown as Record<string, number>)[k] = Number(raw[k] ?? 0)
      const { data: ls } = await supabase
        .from('pedido_proveedor_linea')
        .select(LINEA_COMPRA_COLS)
        .eq('tienda_terminal_codigo', c.tienda_terminal_codigo)
        .eq('numero', c.numero)
        .order('linea')
      if (cancel) return
      const lns: LineaCompra[] = (ls ?? []).map((l) => ({
        articulo_codigo: l.articulo_codigo as string,
        codigo_compra: l.codigo_compra as string | null,
        descripcion: l.descripcion as string | null,
        bultos: Number(l.bultos ?? 0),
        cajas: Number(l.cajas ?? 0),
        cantidad: Number(l.cantidad ?? 0),
        unidades_por_caja: Number(l.unidades_por_caja ?? 0),
        cajas_por_bulto: Number(l.cajas_por_bulto ?? 0),
        coste_anterior: l.coste_anterior == null ? null : Number(l.coste_anterior),
        precio_compra: Number(l.precio_compra ?? 0),
        descuento_pct: Number(l.descuento_pct ?? 0),
        igic_pct: Number(l.igic_pct ?? 0),
        canon: Number(l.canon ?? 0),
        bonificacion: Number(l.bonificacion ?? 0),
      }))
      setCab(c)
      setOrig({ cab: c, lineas: lns })
      setLineas(lns)
      setMode('consulta')
      await cargarProveedor(c.proveedor_codigo)
      if (!cancel) setCargando(false)
    }
    run()
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esNuevo, claveTienda, claveNumero, tiendas.length])

  const lineaSel = editLinea?.l ?? lineas[sel]

  // «Stock:» del pie: existencias del artículo de la línea seleccionada en el almacén del pedido.
  useEffect(() => {
    if (!lineaSel?.articulo_codigo || !cab?.almacen_codigo) {
      setStockSel(null)
      return
    }
    let cancel = false
    supabase
      .from('articulo_almacen_stock')
      .select('cantidad_actual')
      .eq('articulo_codigo', lineaSel.articulo_codigo)
      .eq('almacen_codigo', cab.almacen_codigo)
      .maybeSingle()
      .then(({ data }) => !cancel && setStockSel(Number(data?.cantidad_actual ?? 0)))
    return () => {
      cancel = true
    }
  }, [lineaSel?.articulo_codigo, cab?.almacen_codigo, refresco])

  const lineasCalculo = editLinea ? (editLinea.idx === 'nuevo' ? [...lineas, editLinea.l] : lineas.map((l, i) => (i === editLinea.idx ? editLinea.l : l))) : lineas
  const tot = useMemo(
    () =>
      calcularCompra(
        lineasCalculo,
        cab ?? { descuento_pie_pct: 0, igic_pie_pct: 0, gastos_proveedor: 0, gastos_proveedor_igic_pct: 0, transporte_coste: 0, transporte_igic_pct: 0, otros_gastos: 0 },
      ),
    [lineasCalculo, cab],
  )

  // Contexto para NEXA («¿qué le falta a este pedido?»): el pedido guardado, en consulta.
  useNexaContexto(
    cab && cab.numero != null && mode === 'consulta'
      ? {
          documento: `${cab.es_abono ? 'Abono' : 'Pedido'} a proveedor ${cab.tienda_terminal_codigo}-${cab.numero}`,
          proveedor: cab.proveedor_codigo,
          nombreProveedor: proveedor?.nombre ?? null,
          almacen: cab.almacen_codigo,
          estado: ESTADOS_COMPRA.find((e) => e.v === cab.estado)?.t ?? cab.estado,
          fechaSolicitud: cab.fecha_solicitud,
          fechaPrevista: cab.fecha_prevista,
          fechaRecepcion: cab.fecha_recepcion,
          recibido: cab.recibido,
          stockActualizado: cab.stock_movido,
          facturaProveedor: cab.numero_factura_proveedor_externo,
          numeroLineas: lineas.length,
          lineas: lineas.slice(0, 40).map((l) => ({ articulo: l.articulo_codigo, codigoCompra: l.codigo_compra, descripcion: l.descripcion, cantidad: l.cantidad })),
          total: tot.total,
        }
      : null,
  )

  function patch(p: Partial<CabeceraCompra>) {
    setCab((c) => (c ? { ...c, ...p } : c))
  }

  async function elegirProveedor(codigo: string) {
    const p = await cargarProveedor(codigo.trim())
    if (!p) {
      patch({ proveedor_codigo: codigo.trim() })
      if (codigo.trim()) setMensaje(`No existe el proveedor ${codigo.trim()}.`)
      return
    }
    setMensaje(null)
    patch({
      proveedor_codigo: p.codigo,
      forma_pago_codigo: p.forma_pago_codigo ?? cab?.forma_pago_codigo ?? null,
      descuento_pie_pct: Number(p.descuento_pie_pct ?? cab?.descuento_pie_pct ?? 0),
      ...(p.almacen_defecto_codigo ? { almacen_codigo: p.almacen_defecto_codigo } : {}),
    })
  }

  /** Línea a partir del artículo: código, precio, dto. y coste neto anterior de este proveedor. */
  async function lineaDesdeArticulo(codigoInterno: string, previa: LineaCompra): Promise<LineaCompra | null> {
    const [{ data: a }, { data: ap }] = await Promise.all([
      supabase.from('articulo').select(ARTICULO_COMPRA_COLS).eq('codigo_interno', codigoInterno).maybeSingle(),
      supabase
        .from('articulo_proveedor')
        .select('codigo_compra, coste_puro, coste_neto, ultimo_descuento_pct')
        .eq('articulo_codigo', codigoInterno)
        .eq('proveedor_codigo', cab?.proveedor_codigo ?? '')
        .maybeSingle(),
    ])
    if (!a) return null
    const upc = Number(a.unidades_por_caja ?? 0)
    const cpb = Number(a.cajas_por_bulto ?? 0)
    // Los costes de este proveedor mandan; si están vacíos o a cero, los del artículo.
    const puro = Number(ap?.coste_puro ?? 0) || Number(a.coste_puro ?? 0)
    const anterior = Number(ap?.coste_neto ?? 0) || (a.coste_neto != null ? Number(a.coste_neto) : null)
    return {
      ...previa,
      articulo_codigo: a.codigo_interno as string,
      codigo_compra: (ap?.codigo_compra as string | null) || (a.codigo_compra_habitual as string | null) || (a.codigo_interno as string),
      descripcion: a.descripcion as string,
      unidades_por_caja: upc,
      cajas_por_bulto: cpb,
      coste_anterior: anterior,
      precio_compra: puro,
      descuento_pct: Number(ap?.ultimo_descuento_pct ?? a.ultimo_descuento_compra_pct ?? 0),
      igic_pct: Number(a.igic_pct ?? 0),
      canon: proveedor?.no_aplica_impuesto2 ? 0 : Number(a.impuesto2_pct ?? 0),
    }
  }

  /** El código de la línea es el de compra del proveedor; si no, el de venta, interno o barras. */
  async function resolverCodigo(codigo: string) {
    const c = codigo.trim()
    if (!c) return null
    if (cab?.proveedor_codigo) {
      const { data } = await supabase
        .from('articulo_proveedor')
        .select('articulo_codigo')
        .eq('proveedor_codigo', cab.proveedor_codigo)
        .eq('codigo_compra', c)
        .limit(1)
      if (data && data.length) return data[0].articulo_codigo as string
    }
    const { data } = await supabase.from('articulo').select('codigo_interno').eq('codigo_compra_habitual', c).limit(1)
    if (data && data.length) return data[0].codigo_interno as string
    const a = await buscarArticulo(c)
    return a?.codigo_interno ?? null
  }

  async function codigoLinea(codigo: string) {
    if (!editLinea) return
    const n = ++cargaArticulo.current
    const art = await resolverCodigo(codigo)
    const l = art ? await lineaDesdeArticulo(art, editLinea.l) : null
    if (n !== cargaArticulo.current) return
    if (!l) {
      setMensaje(`No existe ningún artículo con el código ${codigo.trim()}.`)
      return
    }
    setMensaje(null)
    // Las cantidades de la línea y lo tecleado mientras se buscaba el artículo (precio, dto.…)
    // se conservan: la carga del artículo no pisa lo que ha escrito el usuario.
    setEditLinea((e) => aplicarArticulo(e, l, CANTIDADES_LINEA))
  }

  function nuevaLinea() {
    if (!editing || !cab?.proveedor_codigo || !proveedor) {
      if (editing) setMensaje('Indica primero el proveedor.')
      return
    }
    if (cab.stock_movido) {
      setMensaje('El pedido ya está Actualizado: sus líneas no se pueden cambiar.')
      return
    }
    setEditLinea({ idx: 'nuevo', l: lineaVacia() })
  }

  function aceptarLinea() {
    if (!editLinea) return
    if (!editLinea.l.articulo_codigo) {
      setMensaje('Indica el código del artículo de la línea.')
      return
    }
    if (!(editLinea.l.cantidad > 0)) {
      setMensaje('La cantidad debe ser mayor que cero.')
      return
    }
    setMensaje(null)
    if (editLinea.idx === 'nuevo') {
      setLineas((ls) => [...ls, editLinea.l])
      setSel(lineas.length)
    } else {
      const i = editLinea.idx
      setLineas((ls) => ls.map((l, k) => (k === i ? editLinea.l : l)))
    }
    setEditLinea(null)
  }

  function borrarLinea() {
    if (!editing || !lineas[sel] || cab?.stock_movido) return
    if (!confirm(`¿Borrar la línea «${lineas[sel].descripcion ?? lineas[sel].articulo_codigo}»?`)) return
    setLineas((ls) => ls.filter((_, k) => k !== sel))
    setSel((s) => Math.max(0, s - 1))
  }

  /** Importar líneas: una por renglón, «código;cantidad[;precio[;dto]]» (como el pegado desde Excel). */
  async function importarLineas() {
    const nuevas: LineaCompra[] = []
    const fallos: string[] = []
    for (const renglon of importTexto.split(/\r?\n/)) {
      const partes = renglon.split(/[;\t]/).map((s) => s.trim())
      if (!partes[0]) continue
      const art = await resolverCodigo(partes[0])
      const l = art ? await lineaDesdeArticulo(art, lineaVacia()) : null
      if (!l) {
        fallos.push(partes[0])
        continue
      }
      const num = (s: string | undefined) => (s ? Number(s.replace(/\./g, '').replace(',', '.')) : NaN)
      const cant = num(partes[1])
      const precio = num(partes[2])
      const dto = num(partes[3])
      nuevas.push({
        ...l,
        cantidad: cant > 0 ? cant : 1,
        precio_compra: Number.isNaN(precio) ? l.precio_compra : precio,
        descuento_pct: Number.isNaN(dto) ? l.descuento_pct : dto,
      })
    }
    setLineas((ls) => [...ls, ...nuevas])
    setDialogo(null)
    setImportTexto('')
    setMensaje(`${nuevas.length} líneas importadas${fallos.length ? ` · sin artículo: ${fallos.join(', ')}` : ''}.`)
  }

  async function guardar() {
    if (!cab) return
    if (!cab.proveedor_codigo || !proveedor) {
      setMensaje('El proveedor es obligatorio.')
      return
    }
    if (!cab.almacen_codigo) {
      setMensaje('El almacén es obligatorio.')
      return
    }
    if (editLinea) {
      setMensaje('Acepta o cancela la línea en edición antes de guardar.')
      return
    }
    setSaving(true)
    setMensaje(null)
    try {
      let numero = cab.numero
      if (mode === 'alta') {
        const { data, error } = await supabase.rpc('fn_siguiente_numero', {
          p_tienda: cab.tienda_terminal_codigo,
          p_tipo_documento: 'pedido_proveedor',
          p_serie: '',
        })
        if (error) throw new Error(error.message)
        numero = data as number
      }
      const fila = { ...cab, numero, ...camposTotales(lineas, cab) }
      if (mode === 'alta') {
        const { error } = await supabase.from('pedido_proveedor').insert(fila)
        if (error) throw new Error(error.message)
      } else {
        const { tienda_terminal_codigo: _t, numero: _n, ...upd } = fila
        const { error } = await supabase
          .from('pedido_proveedor')
          .update(upd)
          .eq('tienda_terminal_codigo', cab.tienda_terminal_codigo)
          .eq('numero', cab.numero)
        if (error) throw new Error(error.message)
      }
      if (!cab.stock_movido) {
        const filasLinea = lineas.map((l, i) => ({
          tienda_terminal_codigo: cab.tienda_terminal_codigo,
          numero,
          linea: i + 1,
          ...l,
          total_unidades: l.cantidad + (l.bonificacion || 0),
          total_unidades_bonificadas: l.bonificacion || 0,
          coste_neto: netoLinea(l),
        }))
        if (filasLinea.length) {
          const { error } = await supabase.from('pedido_proveedor_linea').upsert(filasLinea, { onConflict: 'tienda_terminal_codigo,numero,linea' })
          if (error) throw new Error(error.message)
        }
        if (mode !== 'alta') {
          const { error } = await supabase
            .from('pedido_proveedor_linea')
            .delete()
            .eq('tienda_terminal_codigo', cab.tienda_terminal_codigo)
            .eq('numero', cab.numero)
            .gt('linea', filasLinea.length)
          if (error) throw new Error(error.message)
        }
      }
      setSaving(false)
      cargarClaves()
      if (mode === 'alta') navigate(rutaDoc({ t: cab.tienda_terminal_codigo, n: numero as number }), { replace: true })
      else {
        setOrig({ cab: { ...cab }, lineas })
        setMode('consulta')
      }
    } catch (e) {
      setSaving(false)
      setMensaje((e as Error).message)
    }
  }

  function cancelar() {
    setEditLinea(null)
    setMensaje(null)
    if (mode === 'alta') {
      navigate(base)
      return
    }
    if (orig) {
      setCab(orig.cab)
      setLineas(orig.lineas)
      cargarProveedor(orig.cab.proveedor_codigo)
    }
    setMode('consulta')
  }

  async function actualizar() {
    if (!cab || cab.numero == null || cab.stock_movido) return
    if (mode !== 'consulta') {
      setMensaje('Guarda el pedido antes de Actualizarlo.')
      return
    }
    if (!lineas.length) {
      setMensaje('El pedido no tiene líneas.')
      return
    }
    const sinPrecio = lineas.filter((l) => !(l.precio_compra > 0)).length
    if (sinPrecio && !cab.es_abono && !confirm(`Hay ${sinPrecio} líneas sin precio: el coste de esos artículos quedará a cero. ¿Seguir?`)) return
    const accion = cab.es_abono ? 'sacará del' : 'entrará en el'
    if (!confirm(`¿Actualizar el pedido ${cab.numero}? Se ${accion} almacén ${cab.almacen_codigo} el stock de sus ${lineas.length} líneas${cab.es_abono ? '' : ' y se recalcularán los costes de los artículos'}.`)) return
    // En un abono se elige si actualiza los costes de los artículos (pendiente de confirmar con Luis cómo lo pregunta GeminisWin).
    const costes = cab.es_abono ? confirm('¿Actualizar también los costes de los artículos con los precios de este abono?') : true
    setSaving(true)
    try {
      await actualizarCompra({ ...cab, numero: cab.numero }, lineas, empleado, costes)
      const c = { ...cab, estado: 'recepcionado', recibido: true, stock_movido: true, fecha_recepcion: hoy() }
      setCab(c)
      setOrig({ cab: c, lineas })
      setRefresco((r) => r + 1)
      setMensaje(costes ? 'Actualizado: stock y costes al día.' : 'Actualizado: stock al día, costes sin tocar.')
    } catch (e) {
      setMensaje((e as Error).message)
    }
    setSaving(false)
  }

  async function togglePagado() {
    if (!cab) return
    const v = !cab.pagado
    // Pagado deja el pedido Liquidado; al desmarcarlo vuelve a Recepcionado (o Pendiente si no se actualizó).
    const cambios = {
      pagado: v,
      proveedor_pagado: v,
      fecha_pago: v ? cab.fecha_pago ?? hoy() : cab.fecha_pago,
      estado: v ? 'liquidado' : cab.estado === 'liquidado' ? (cab.stock_movido ? 'recepcionado' : 'pendiente') : cab.estado,
    }
    if (editing) {
      patch(cambios)
      return
    }
    if (cab.numero == null) return
    const { error } = await supabase
      .from('pedido_proveedor')
      .update(cambios)
      .eq('tienda_terminal_codigo', cab.tienda_terminal_codigo)
      .eq('numero', cab.numero)
    if (error) {
      setMensaje(error.message)
      return
    }
    const c = { ...cab, ...cambios }
    setCab(c)
    setOrig((o) => (o ? { ...o, cab: c } : o))
  }

  // F1 guarda, Alt+Retroceso cancela, AvPág/RePág navegan…: las teclas las pone CompraBar (teclasFicha).

  const ir = (k?: { t: string; n: number }) => k && navigate(rutaDoc(k))
  const irNav = async (d: NavDir) => {
    const k = await nav.ir(d)
    if (k) ir({ t: k.tienda_terminal_codigo, n: Number(k.numero) })
  }
  const canNavigate = mode === 'consulta' && !!cab
  const nombreTransportista = transportistas.find((a) => a.codigo === cab?.transportista_codigo)?.nombre ?? ''
  const lineasBloqueadas = !!cab?.stock_movido
  const columnas = rapida ? 11 : 12
  const txt = rapida ? 'text-[17px]' : 'text-[15px]'

  const selectFormaPago = (key: 'forma_pago_codigo' | 'transporte_forma_pago_codigo', dlg: 'forma_pago' | 'forma_pago_t') => (
    <div className="flex min-w-0 flex-1 gap-1">
      <GwSelect disabled={ro} value={cab?.[key] ?? ''} onChange={(e) => patch({ [key]: e.target.value || null })}>
        <option value="" />
        {formasPago.map((f) => (
          <option key={f.codigo} value={f.codigo}>
            {f.nombre}
          </option>
        ))}
      </GwSelect>
      <GwLookupButton disabled={ro} onClick={() => setDialogo(dlg)} title="Buscar forma de pago" />
    </div>
  )

  const cabeceraTiendaNumero = (
    <fieldset className={`gw-group grid ${rapida ? 'w-[610px]' : 'w-[495px]'} grid-cols-[78px_minmax(0,1fr)_minmax(0,1.6fr)_96px] items-end gap-x-1 !pt-[2px]`}>
      <Campo label="Tienda" title="OFICINA">
        <GwSelect
          disabled={mode !== 'alta'}
          value={cab?.tienda_terminal_codigo ?? ''}
          onChange={(e) => {
            const t = tiendas.find((x) => x.codigo === e.target.value)
            patch({ tienda_terminal_codigo: e.target.value, almacen_codigo: t?.almacen_codigo ?? cab?.almacen_codigo ?? '' })
          }}
        >
          {tiendas.map((t) => (
            <option key={t.codigo} value={t.codigo}>
              {t.codigo}
            </option>
          ))}
        </GwSelect>
      </Campo>
      <Campo label={<u>N</u>} labelRest="úmero" title="Se asigna al guardar">
        <GwInput readOnly className="gw-num" value={cab?.numero != null ? String(cab.numero) : ''} />
      </Campo>
      <Campo label="Fecha y Hora">
        <GwInput readOnly value={fechaHoraEs(cab?.fecha_hora)} />
      </Campo>
      <button
        type="button"
        className="gw-btn !h-[48px] flex-col !gap-0 !text-[18px] !opacity-100 disabled:!text-black"
        disabled={ro || lineasBloqueadas}
        title="Abono: devolución al proveedor (el stock sale del almacén)"
        onClick={() => patch({ es_abono: !cab?.es_abono })}
      >
        <span>
          <u>A</u>bono
        </span>
        <Marca on={!!cab?.es_abono} />
      </button>
    </fieldset>
  )

  const grupoAlmacen = (
    <fieldset className="gw-group min-w-0 flex-1 !pt-0">
      <legend>Almacen</legend>
      <div className="flex gap-1">
        <GwInput readOnly className="!w-[52px]" value={cab?.almacen_codigo ?? ''} />
        <GwSelect disabled={ro || lineasBloqueadas} value={cab?.almacen_codigo ?? ''} onChange={(e) => patch({ almacen_codigo: e.target.value })}>
          {almacenes.map((a) => (
            <option key={a.codigo} value={a.codigo}>
              {a.nombre}
            </option>
          ))}
        </GwSelect>
        <GwLookupButton disabled={ro || lineasBloqueadas} onClick={() => setDialogo('almacen')} title="Buscar almacén" />
      </div>
    </fieldset>
  )

  const grupoProveedor = (
    <fieldset className="gw-group min-w-0 flex-1 !pt-0">
      <legend>Proveedor</legend>
      <div className="flex gap-1">
        <GwInput
          className="!w-[130px]"
          disabled={ro || lineas.length > 0}
          title={lineas.length > 0 ? 'Con líneas no se cambia el proveedor' : undefined}
          value={cab?.proveedor_codigo ?? ''}
          onChange={(e) => patch({ proveedor_codigo: e.target.value })}
          onBlur={(e) => editing && lineas.length === 0 && elegirProveedor(e.target.value)}
        />
        <GwInput readOnly className="!text-[17px]" value={proveedor?.nombre ?? ''} />
        <GwLookupButton disabled={ro || lineas.length > 0} onClick={() => setDialogo('proveedor')} title="Buscar proveedor" />
      </div>
    </fieldset>
  )

  const grupoFactura = (
    <fieldset className={`gw-group !pt-0 ${rapida ? 'min-w-0 flex-1' : 'w-[190px]'}`}>
      <legend>Número Factura</legend>
      <GwInput
        disabled={ro}
        title="Nº de factura o albarán del proveedor"
        value={cab?.numero_factura_proveedor_externo ?? ''}
        onChange={(e) => patch({ numero_factura_proveedor_externo: e.target.value || null })}
      />
    </fieldset>
  )

  const fecha = (key: 'fecha_solicitud' | 'fecha_prevista' | 'fecha_factura' | 'fecha_pago' | 'fecha_vencimiento_1') => (
    <GwDate disabled={ro} value={cab?.[key]} onChange={(v) => patch({ [key]: v })} />
  )

  return (
    <div
      className={`flex min-w-[1180px] flex-col gap-[3px] [&_.gw-input]:h-[25px] ${rapida ? '[&_.gw-input]:text-[17px]' : '[&_.gw-input]:text-[15px]'} [&_.gw-label]:text-[15px] [&_.gw-label]:leading-[17px] [&_legend]:text-[16px]`}
      title={rapida ? 'Creación rápida de pedidos' : undefined}
    >
      {rapida ? (
        <div className="flex gap-1.5">
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <div className="flex gap-1.5">
              {cabeceraTiendaNumero}
              {grupoAlmacen}
            </div>
            <div className="flex gap-1.5">
              {grupoProveedor}
              <div className="w-[300px]">{grupoFactura}</div>
            </div>
          </div>
          <fieldset className="gw-group grid w-[340px] grid-cols-2 gap-x-1 !pt-0">
            <legend>Fechas</legend>
            <span className="gw-label">F. Solicitud</span>
            <span className="gw-label">F. Llegada</span>
            {fecha('fecha_solicitud')}
            {fecha('fecha_prevista')}
            <span className="gw-label mt-2">F. Factura:</span>
            <span className="mt-1">{fecha('fecha_factura')}</span>
          </fieldset>
        </div>
      ) : (
        <>
          <div className="flex gap-1.5">
            {cabeceraTiendaNumero}
            {grupoAlmacen}
            {grupoProveedor}
          </div>
          <div className="flex gap-1.5">
            {grupoFactura}
            <fieldset className="gw-group grid min-w-0 flex-1 grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-1 !pt-0">
              <legend>Fechas</legend>
              <span className="gw-label">F. Solicitud:</span>
              {fecha('fecha_solicitud')}
              <span className="gw-label">F. Llegada:</span>
              {fecha('fecha_prevista')}
              <span className="gw-label">F. Factura:</span>
              {fecha('fecha_factura')}
              <span className="gw-label">F. Pago:</span>
              {fecha('fecha_pago')}
              <span className="gw-label">F. Vencim.:</span>
              {fecha('fecha_vencimiento_1')}
            </fieldset>
          </div>
          <fieldset className="gw-group grid grid-cols-[minmax(0,1.5fr)_minmax(0,0.65fr)_minmax(0,1.1fr)_minmax(0,0.6fr)_minmax(0,0.6fr)_minmax(0,0.33fr)_minmax(0,0.6fr)] items-end gap-x-1 !pt-0">
            <legend>Transporte</legend>
            <Campo label="Transportista">
              <div className="flex gap-1">
                <GwSelect className="!w-[96px]" disabled={ro} value={cab?.transportista_codigo ?? ''} onChange={(e) => patch({ transportista_codigo: e.target.value || null })}>
                  <option value="" />
                  {transportistas.map((t) => (
                    <option key={t.codigo} value={t.codigo}>
                      {t.codigo}
                    </option>
                  ))}
                </GwSelect>
                <GwInput readOnly value={nombreTransportista} />
                <GwLookupButton disabled={ro} onClick={() => setDialogo('transportista')} title="Buscar transportista" />
              </div>
            </Campo>
            <Campo label="Nº de Factura">
              <GwInput disabled={ro} value={cab?.transporte_numero_factura ?? ''} onChange={(e) => patch({ transporte_numero_factura: e.target.value || null })} />
            </Campo>
            <div className="flex min-w-0 flex-col">
              <label className="gw-label flex items-center gap-1 !text-[17px]">
                <input
                  type="checkbox"
                  disabled={ro}
                  checked={!!cab?.transporte_factura_pagada}
                  onChange={(e) => patch({ transporte_factura_pagada: e.target.checked })}
                />
                <span>
                  Fac<u>t</u>ura Pagada
                </span>
              </label>
              {selectFormaPago('transporte_forma_pago_codigo', 'forma_pago_t')}
            </div>
            <Campo label="Fecha pago">
              <GwDate disabled={ro} value={cab?.transporte_fecha_pago} onChange={(v) => patch({ transporte_fecha_pago: v })} />
            </Campo>
            <Campo label="Coste" right>
              <GwNumber decimals={2} disabled={ro} value={cab?.transporte_coste ?? 0} onChange={(v) => patch({ transporte_coste: v ?? 0 })} />
            </Campo>
            <Campo label="%IGIC">
              <GwNumber decimals={2} disabled={ro} value={cab?.transporte_igic_pct ?? 0} onChange={(v) => patch({ transporte_igic_pct: v ?? 0 })} />
            </Campo>
            <Campo label="Total" right>
              <GwNumber decimals={2} value={tot.totalTransporte} />
            </Campo>
          </fieldset>
        </>
      )}

      {/* Rejilla de líneas */}
      <div className={`${rapida ? 'h-[300px]' : 'h-[266px]'} overflow-y-auto overflow-x-hidden border border-[var(--gw-border)] bg-white`}>
        <table className={`gw-grid table-fixed ${txt} [&_td]:h-[22px] [&_td]:py-0 [&_th]:truncate ${rapida ? '[&_th]:text-[17px]' : '[&_th]:text-[15px]'}`}>
          <colgroup>
            <col style={{ width: rapida ? '9%' : '10.5%' }} />
            <col style={{ width: rapida ? '33%' : '23%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '5%' }} />
            {!rapida && <col style={{ width: '7%' }} />}
            <col style={{ width: '7%' }} />
            <col style={{ width: rapida ? '10%' : '11.5%' }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              <th>Código</th>
              <th>Descripción</th>
              <th className="!text-right">Bultos</th>
              <th className="!text-right">Cajas</th>
              <th className="!text-right">Cantidad</th>
              <th className="!text-right" title="Coste neto anterior: rojo si el nuevo es más caro, verde si es más barato">
                Cte. Neto Ant.
              </th>
              <th className="!text-center">Precio</th>
              <th className="!text-center">Dto.</th>
              <th className="!text-center">Igic</th>
              {!rapida && <th className="!text-center">Canon</th>}
              <th className="!text-center">Bonificac.</th>
              <th className="!text-center">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) =>
              editLinea && editLinea.idx === i ? (
                <FilaEdicion
                  key={i}
                  l={editLinea.l}
                  rapida={rapida}
                  onChange={(p) => setEditLinea((e) => tocarLinea(e, p))}
                  onCodigo={codigoLinea}
                  onOk={aceptarLinea}
                  onCancel={() => setEditLinea(null)}
                />
              ) : (
                <tr
                  key={i}
                  className={i === sel && !editLinea ? 'gw-selected' : ''}
                  onClick={() => !editLinea && setSel(i)}
                  onDoubleClick={() => editing && !editLinea && !lineasBloqueadas && setEditLinea({ idx: i, l: { ...l } })}
                >
                  <td className="truncate">{l.codigo_compra || l.articulo_codigo}</td>
                  <td className="truncate">{l.descripcion}</td>
                  <td className="text-right">{l.bultos ? formatGw(l.bultos, 2) : ''}</td>
                  <td className="text-right">{l.cajas ? formatGw(l.cajas, 2) : ''}</td>
                  <td className="text-right">{formatGw(l.cantidad, 3)}</td>
                  <td className={`text-right ${colorAnterior(l)}`}>{l.coste_anterior != null ? formatGw(l.coste_anterior, 3) : ''}</td>
                  <td className="text-right">{formatGw(l.precio_compra, 3)}</td>
                  <td className="text-right">{formatGw(l.descuento_pct, 2)}</td>
                  <td className="text-right">{formatGw(Number(cab?.igic_pie_pct ?? 0) > 0 ? cab?.igic_pie_pct : l.igic_pct, 2)}</td>
                  {!rapida && <td className="text-right">{l.canon ? formatGw(l.canon, 3) : ''}</td>}
                  <td className="text-right">{l.bonificacion ? formatGw(l.bonificacion, 2) : ''}</td>
                  <td className="text-right">{formatGw(subLinea(l), 2)}</td>
                </tr>
              ),
            )}
            {editLinea?.idx === 'nuevo' && (
              <FilaEdicion
                l={editLinea.l}
                rapida={rapida}
                onChange={(p) => setEditLinea((e) => tocarLinea(e, p))}
                onCodigo={codigoLinea}
                onOk={aceptarLinea}
                onCancel={() => setEditLinea(null)}
              />
            )}
            {Array.from({ length: Math.max(0, 11 - lineas.length - (editLinea?.idx === 'nuevo' ? 1 : 0)) }, (_, k) => (
              <tr key={`v${k}`}>
                {Array.from({ length: columnas }, (_, j) => (
                  <td key={j}>&nbsp;</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pie: líneas, observaciones, estado y Actualizado, gastos y totales */}
      <div className="grid grid-cols-[465px_minmax(0,1fr)_minmax(0,500px)] gap-x-1.5">
        <div className="flex flex-col gap-[3px]">
          <div className="flex border border-[var(--gw-border)] bg-[var(--gw-face)]">
            <MiniBtn title="Importar líneas (pegar «código;cantidad;precio;dto» desde Excel)" disabled={!editing || !!editLinea || !proveedor || lineasBloqueadas} onClick={() => setDialogo('importar')}>
              <Sheet size={15} />
            </MiniBtn>
            <MiniBtn title="Buscar artículo" disabled={!editLinea} onClick={() => setDialogo('articulo')}>
              <Binoculars size={15} />
            </MiniBtn>
            <MiniBtn title="Nueva línea" disabled={!editing || !!editLinea || lineasBloqueadas} onClick={nuevaLinea}>
              <FilePlus2 size={15} />
            </MiniBtn>
            <MiniBtn
              title="Modificar línea"
              disabled={!editing || !!editLinea || !lineas[sel] || lineasBloqueadas}
              onClick={() => lineas[sel] && setEditLinea({ idx: sel, l: { ...lineas[sel] } })}
            >
              <FilePen size={15} />
            </MiniBtn>
            <MiniBtn title="Borrar línea" disabled={!editing || !!editLinea || !lineas[sel] || lineasBloqueadas} onClick={borrarLinea}>
              <FileX2 size={15} />
            </MiniBtn>
          </div>
          <span className="gw-label !text-[17px]">Observaciones</span>
          <GwTextArea
            className={`${rapida ? '!h-[32px]' : '!h-[48px]'} resize-none !text-[16px]`}
            disabled={ro}
            value={cab?.observaciones ?? ''}
            onChange={(e) => patch({ observaciones: e.target.value || null })}
          />
          {!rapida && (
            <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-x-1.5">
              <div className="flex min-w-0 flex-col gap-[3px]">
                <label className="gw-label flex items-center gap-1 !text-[17px]">
                  <input type="checkbox" disabled={ro} checked={!!cab?.proveedor_pagado} onChange={(e) => patch({ proveedor_pagado: e.target.checked })} />
                  Factura proveedor pagada
                </label>
                {selectFormaPago('forma_pago_codigo', 'forma_pago')}
                <label className="gw-label flex items-center gap-1 !text-[17px]">
                  <input type="checkbox" disabled={ro} checked={!!cab?.no_pasar_contabilidad} onChange={(e) => patch({ no_pasar_contabilidad: e.target.checked })} />
                  No pasar a contabilidad
                </label>
              </div>
              <div className="flex flex-col gap-[3px]">
                <button
                  type="button"
                  className="gw-btn !h-[36px] gap-1 !text-[18px]"
                  disabled={!cab || cab.numero == null || saving}
                  title="Marca el pedido como pagado al proveedor"
                  onClick={togglePagado}
                >
                  <Marca on={!!cab?.pagado} />
                  Pagado
                </button>
                <button
                  type="button"
                  className="gw-btn !h-[36px] gap-1 !text-[18px]"
                  disabled={!cab || cab.numero == null}
                  title="Pagos al proveedor"
                  onClick={() => navigate('/pagos-proveedor')}
                >
                  <Wallet size={15} className="text-[#8a6d1d]" />
                  <span>
                    <u>P</u>agos
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-[3px]">
          <div className="flex h-[34px] items-center gap-4 px-1 text-[17px] text-[#1a4fd0]">
            <span>Nº Lineas: {lineas.length}</span>
            <span title="Stock del artículo de la línea seleccionada en el almacén del pedido">Stock: {stockSel != null ? formatGw(stockSel, 2) : ''}</span>
          </div>
          <div className="flex gap-1">
            <GwSelect className="!h-[36px] !text-[19px]" disabled={ro} value={cab?.estado ?? 'pendiente'} onChange={(e) => patch({ estado: e.target.value })}>
              {ESTADOS_COMPRA.map((s) => (
                <option key={s.v} value={s.v}>
                  {s.t}
                </option>
              ))}
            </GwSelect>
            <button
              type="button"
              className="gw-btn !h-[36px] w-[150px] shrink-0 gap-1 !text-[18px] !opacity-100 disabled:!text-black"
              disabled={!cab || cab.numero == null || cab.stock_movido || saving}
              title={cab?.stock_movido ? `Actualizado el ${cab.fecha_recepcion ?? ''}` : 'Actualizar: mueve el stock y recalcula los costes'}
              onClick={actualizar}
            >
              <Marca on={!!cab?.stock_movido} />
              {rapida ? 'Actualiz.' : 'Actualizado'}
            </button>
          </div>
          {!rapida && (
            <>
              <div className="grid grid-cols-[auto_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-1">
                <span className="gw-label !text-[16px]">Gastos proveed.:</span>
                <GwNumber decimals={2} disabled={ro} value={cab?.gastos_proveedor ?? 0} onChange={(v) => patch({ gastos_proveedor: v ?? 0 })} />
                <GwNumber decimals={2} value={r3(tot.gastos + tot.igicGastos)} />
              </div>
              <div className="grid grid-cols-[110px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-1">
                <button type="button" className="gw-btn !h-[28px] !text-[16px]" disabled title="Total canon de las líneas">
                  Canon
                </button>
                <span className="whitespace-nowrap text-right text-[16px]">Y Transporte:</span>
                <span className="pr-1 text-right text-[17px] font-bold">{formatGw(tot.transporte, 2)}</span>
              </div>
              <div className="grid grid-cols-[minmax(0,1fr)_110px] items-center gap-x-1">
                <span className="gw-label truncate !text-[16px]" title="Otros gastos que se reparten en el coste de las líneas al Actualizar">
                  <u>O</u>tros gastos adicionales:
                </span>
                <GwNumber decimals={2} disabled={ro || lineasBloqueadas} value={cab?.otros_gastos ?? 0} onChange={(v) => patch({ otros_gastos: v ?? 0 })} />
              </div>
            </>
          )}
        </div>

        <div className="flex flex-col gap-[3px] text-[17px] font-bold">
          <div className="grid grid-cols-[46px_88px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-1">
            <span />
            <span />
            <span />
            <span className="text-right text-[#1a4fd0]" title="Subtotal">
              {formatGw(tot.subtotal, 2)}
            </span>
            <span className="gw-label !text-[17px]">Dto.:</span>
            <GwNumber decimals={2} disabled={ro} value={cab?.descuento_pie_pct ?? 0} onChange={(v) => patch({ descuento_pie_pct: v ?? 0 })} />
            <GwNumber decimals={2} value={tot.totalDto} />
            <span className="text-right" title="Base tras el descuento de pie">
              {formatGw(tot.base, 2)}
            </span>
            <span className="gw-label !text-[17px]">Igic:</span>
            <GwNumber decimals={2} disabled={ro} value={cab?.igic_pie_pct ?? 0} onChange={(v) => patch({ igic_pie_pct: v ?? 0 })} />
            <span className="text-right" title="IGIC de las líneas">
              {formatGw(tot.igicLineas, 2)}
            </span>
            {rapida ? (
              <span className="text-right text-[#1a4fd0]" title="Total">
                {formatGw(tot.total, 2)}
              </span>
            ) : (
              <span className="border border-[var(--gw-border)] bg-white px-1 text-right" title="Base">
                {formatGw(tot.base, 2)}
              </span>
            )}
            {!rapida && (
              <>
                <span className="gw-label !text-[17px]">Igic:</span>
                <GwNumber decimals={2} disabled={ro} value={cab?.gastos_proveedor_igic_pct ?? 0} onChange={(v) => patch({ gastos_proveedor_igic_pct: v ?? 0 })} />
                <span className="text-right" title="IGIC de los gastos del proveedor">
                  {formatGw(tot.igicGastos, 2)}
                </span>
                <span className="text-right text-[#1a4fd0]" title="Base con gastos del proveedor">
                  {formatGw(tot.baseConGastos, 2)}
                </span>
                <span />
                <span className="text-right" title="Total canon">
                  {formatGw(tot.canon, 2)}
                </span>
                <span className="text-right" title="Total IGIC (líneas, gastos y transporte)">
                  {formatGw(tot.totalIgic, 2)}
                </span>
                <span className="text-right" title="Total del documento">
                  {formatGw(tot.total, 2)}
                </span>
                <span />
                <span className="text-right" title="Otros gastos adicionales">
                  {formatGw(tot.otros, 2)}
                </span>
                <span className="text-right" title="A pagar al proveedor (sin transporte)">
                  {formatGw(tot.aPagarProveedor, 2)}
                </span>
                <span className="text-right text-[#1a4fd0]" title="Total con otros gastos adicionales">
                  {formatGw(tot.totalConOtros, 2)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>

      <CompraBar
        mode={mode}
        canNavigate={canNavigate}
        saving={saving}
        onFirst={() => irNav('primero')}
        onPrev={() => irNav('anterior')}
        onNext={() => irNav('siguiente')}
        onLast={() => irNav('ultimo')}
        onSort={() => setOrden((o) => (o === 'numero' ? 'proveedor' : 'numero'))}
        onSearch={() => setDialogo('buscar')}
        onPrint={() => window.print()}
        onNew={() => navigate(rutaNuevo)}
        onEdit={() => cab && setMode('edicion')}
        onSave={guardar}
        onCancel={cancelar}
        onExit={() => navigate('/')}
      />
      <div className="flex justify-between gap-4 text-[12px] text-[#444]">
        <span>
          {cargando
            ? 'Cargando…'
            : !cab
              ? 'No hay pedidos a proveedor. Pulsa Nuevo para crear uno.'
              : mode === 'alta'
                ? 'Alta de pedido a proveedor · el número se asigna al guardar (F1)'
                : mode === 'edicion'
                  ? 'Modificando · F1 guarda'
                  : `Orden: ${orden === 'numero' ? 'por número' : 'por proveedor'}${textoRegistro(nav)}`}
        </span>
        {mensaje && <span className="font-bold text-[#c42b1c]">{mensaje}</span>}
      </div>

      {dialogo === 'proveedor' && (
        <GwLookupDialog
          title="Proveedores"
          table="proveedor"
          eq={{ tipo: 'proveedor' }}
          columns={LOOKUP_PROVEEDOR}
          searchColumns={['codigo', 'nombre', 'nif']}
          orderBy="codigo"
          keyColumn="codigo"
          onClose={() => setDialogo(null)}
          onPick={(r) => {
            setDialogo(null)
            elegirProveedor(String(r.codigo))
          }}
        />
      )}
      {(dialogo === 'almacen' || dialogo === 'transportista') && (
        <GwLookupDialog
          title={dialogo === 'almacen' ? 'Almacenes' : 'Transportistas'}
          table={dialogo}
          columns={LOOKUP_CODIGO}
          searchColumns={['codigo', 'nombre']}
          orderBy="codigo"
          keyColumn="codigo"
          onClose={() => setDialogo(null)}
          onPick={(r) => {
            const d = dialogo
            setDialogo(null)
            if (d === 'almacen') patch({ almacen_codigo: String(r.codigo) })
            else patch({ transportista_codigo: String(r.codigo) })
          }}
        />
      )}
      {(dialogo === 'forma_pago' || dialogo === 'forma_pago_t') && (
        <GwLookupDialog
          title="Formas de pago"
          table="forma_pago"
          columns={LOOKUP_FORMA_PAGO}
          searchColumns={['codigo', 'descripcion']}
          orderBy="descripcion"
          keyColumn="codigo"
          onClose={() => setDialogo(null)}
          onPick={(r) => {
            const d = dialogo
            setDialogo(null)
            patch(d === 'forma_pago' ? { forma_pago_codigo: String(r.codigo) } : { transporte_forma_pago_codigo: String(r.codigo) })
          }}
        />
      )}
      {dialogo === 'articulo' && (
        <GwLookupDialog
          title="Artículos"
          table="articulo"
          columns={LOOKUP_ARTICULO}
          searchColumns={['codigo_interno', 'codigo_compra_habitual', 'descripcion', 'codigo_barras_principal']}
          orderBy="descripcion"
          keyColumn="codigo_interno"
          onClose={() => setDialogo(null)}
          onPick={async (r) => {
            setDialogo(null)
            if (!editLinea) return
            const n = ++cargaArticulo.current
            const l = await lineaDesdeArticulo(String(r.codigo_interno), editLinea.l)
            if (l && n === cargaArticulo.current) setEditLinea((e) => aplicarArticulo(e, l, CANTIDADES_LINEA))
          }}
        />
      )}
      {dialogo === 'buscar' && (
        <GwLookupDialog
          title="Localizar pedidos a proveedor"
          table="pedido_proveedor"
          columns={LOOKUP_PEDIDO}
          searchColumns={['proveedor_codigo', 'numero_factura_proveedor_externo']}
          orderBy="numero"
          keyColumn="numero"
          onClose={() => setDialogo(null)}
          onPick={(r) => {
            setDialogo(null)
            ir({ t: String(r.tienda_terminal_codigo), n: Number(r.numero) })
          }}
        />
      )}
      {dialogo === 'importar' && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-28" onClick={() => setDialogo(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <GwWindow title="Importar líneas" onClose={() => setDialogo(null)} className="w-[520px]">
              <div className="flex flex-col gap-2 p-2">
                <span className="gw-label">Una línea por renglón: código;cantidad;precio;dto (precio y dto opcionales). Se puede pegar desde Excel.</span>
                <GwTextArea className="!h-[200px] font-mono" value={importTexto} onChange={(e) => setImportTexto(e.target.value)} />
                <div className="flex justify-end gap-2">
                  <button type="button" className="gw-btn w-[110px]" onClick={() => setDialogo(null)}>
                    Cancelar
                  </button>
                  <button type="button" className="gw-btn w-[110px]" disabled={!importTexto.trim()} onClick={importarLineas}>
                    Importar
                  </button>
                </div>
              </div>
            </GwWindow>
          </div>
        </div>
      )}
    </div>
  )
}

/** Cte. Neto Ant.: rojo si el coste neto nuevo sube, verde si baja, gris si se mantiene. */
function colorAnterior(l: LineaCompra) {
  if (l.coste_anterior == null) return 'text-[#808080]'
  const nuevo = netoLinea(l)
  const ant = r3(l.coste_anterior)
  if (nuevo > ant + 0.0005) return 'text-[#e00000]'
  if (nuevo < ant - 0.0005) return 'text-[#127a12]'
  return 'text-[#808080]'
}

function Marca({ on }: { on: boolean }) {
  return on ? <Check size={14} strokeWidth={3} className="text-[#127a12]" /> : <X size={14} strokeWidth={3} className="text-[#c42b1c]" />
}

function Campo({ label, labelRest, title, right, children }: { label: ReactNode; labelRest?: string; title?: string; right?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col" title={title}>
      <span className={`gw-label !text-[17px] ${right ? 'text-right' : ''}`}>
        {label}
        {labelRest}
      </span>
      {children}
    </div>
  )
}

function MiniBtn({ title, disabled, onClick, children }: { title: string; disabled?: boolean; onClick?: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className="flex h-[30px] flex-1 items-center justify-center gap-1 gw-boton-barra"
    >
      {children}
    </button>
  )
}

/** Al cambiar de artículo, la línea conserva sus cantidades. */
const CANTIDADES_LINEA = ['bultos', 'cajas', 'cantidad', 'bonificacion'] as const

function FilaEdicion({
  l,
  rapida,
  onChange,
  onCodigo,
  onOk,
  onCancel,
}: {
  l: LineaCompra
  rapida: boolean
  onChange: (p: Partial<LineaCompra>) => void
  onCodigo: (c: string) => void
  onOk: () => void
  onCancel: () => void
}) {
  const [codigo, setCodigo] = useState(l.codigo_compra ?? '')
  useEffect(() => setCodigo(l.codigo_compra ?? ''), [l.codigo_compra])
  // Código ya enviado a buscar con Intro: al salir del campo no se vuelve a cargar.
  const enviado = useRef<string | null>(null)
  const buscar = (c: string) => {
    enviado.current = c
    onCodigo(c)
  }
  const celda = '!h-[21px] !border-0 !px-1 !text-[15px]'
  // Bultos y cajas calculan la cantidad con las unidades por caja y cajas por bulto del artículo.
  const porCajas = (cajas: number) => (l.unidades_por_caja > 0 ? { cajas, cantidad: cajas * l.unidades_por_caja } : { cajas })
  const porBultos = (bultos: number) =>
    l.cajas_por_bulto > 0 ? { bultos, ...porCajas(bultos * l.cajas_por_bulto) } : { bultos }
  return (
    <tr className="bg-[#fff8dc]">
      <td className="!p-0">
        <GwInput
          autoFocus
          className={celda}
          placeholder="Código…"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') buscar(codigo)
            if (e.key === 'Escape') onCancel()
          }}
          onBlur={() => codigo && codigo !== l.codigo_compra && codigo !== enviado.current && buscar(codigo)}
        />
      </td>
      <td className="!p-0">
        <GwInput className={celda} value={l.descripcion ?? ''} onChange={(e) => onChange({ descripcion: e.target.value })} />
      </td>
      <td className="!p-0">
        <GwNumber className={celda} decimals={2} value={l.bultos} onChange={(v) => onChange(porBultos(v ?? 0))} />
      </td>
      <td className="!p-0">
        <GwNumber className={celda} decimals={2} value={l.cajas} onChange={(v) => onChange(porCajas(v ?? 0))} />
      </td>
      <td className="!p-0">
        <GwNumber className={celda} decimals={3} value={l.cantidad} onChange={(v) => onChange({ cantidad: v ?? 0 })} />
      </td>
      <td className={`text-right ${colorAnterior(l)}`}>{l.coste_anterior != null ? formatGw(l.coste_anterior, 3) : ''}</td>
      <td className="!p-0">
        <GwNumber className={celda} decimals={3} value={l.precio_compra} onChange={(v) => onChange({ precio_compra: v ?? 0 })} />
      </td>
      <td className="!p-0">
        <GwNumber className={celda} decimals={2} value={l.descuento_pct} onChange={(v) => onChange({ descuento_pct: v ?? 0 })} />
      </td>
      <td className="!p-0">
        <GwNumber className={celda} decimals={2} value={l.igic_pct} onChange={(v) => onChange({ igic_pct: v ?? 0 })} />
      </td>
      {!rapida && (
        <td className="!p-0">
          <GwNumber className={celda} decimals={3} value={l.canon} onChange={(v) => onChange({ canon: v ?? 0 })} />
        </td>
      )}
      <td className="!p-0">
        <GwNumber className={celda} decimals={2} value={l.bonificacion} onChange={(v) => onChange({ bonificacion: v ?? 0 })} />
      </td>
      <td className="!p-0">
        <div className="flex items-center">
          <span className="flex-1 truncate px-1 text-right">{formatGw(subLinea(l), 2)}</span>
          <button type="button" title="Aceptar línea" className="px-0.5 text-[#127a12]" onClick={onOk}>
            <Check size={15} strokeWidth={3} />
          </button>
          <button type="button" title="Cancelar línea" className="px-0.5 text-[#c42b1c]" onClick={onCancel}>
            <X size={15} strokeWidth={3} />
          </button>
        </div>
      </td>
    </tr>
  )
}
