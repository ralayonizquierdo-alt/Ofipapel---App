import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Binoculars, Check, FilePen, FilePlus2, FileX2, PackageSearch, Tag, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { fechaTrabajo, horaTrabajo, tiendaDeTrabajo } from '../../../lib/sesionTrabajo'
import { useAuth } from '../../../lib/AuthContext'
import { useNexaContexto } from '../../../nexa/contexto'
import { GwDate, GwInput, GwLookupButton, GwNumber, GwSelect, GwWindow, formatGw } from '../../../components/gw'
import { GwLookupDialog, type GwLookupColumn } from '../../../components/gw/GwLookupDialog'
import { textoRegistro, useNavRegistro, type NavDir } from '../../../components/gw/useNavRegistro'
import { PedidoBar } from './PedidoBar'
import { entregarPedido } from './entregar'
import {
  ARTICULO_VENTA_COLS,
  CLIENTE_VENTA_COLS,
  buscarArticulo,
  precioParaCliente,
  round3,
  type ArticuloVenta,
  type ClienteVenta,
} from './precios'

// Ficha «Pedidos de clientes» (Ventas → Pedidos) y «Presupuestos de Clientes y/o Pactos de
// Tarifas» (Ventas → Presupuestos) de GeminisWin: el mismo documento pedido_cliente; la segunda
// solo recorre los que tienen es_presupuesto y no muestra el bloque de factura.

interface Cabecera {
  tienda_terminal_codigo: string
  numero: number | null
  fecha: string | null
  hora: string | null
  web_pedido_id: number | null
  es_presupuesto: boolean
  empleado_codigo: string | null
  cliente_codigo: string
  cliente_sucursal_codigo: string | null
  nombre_cliente: string | null
  nif_cliente: string | null
  vendedor_codigo: string | null
  fecha_inicio: string | null
  fecha_fin: string | null
  almacen_codigo: string | null
  tarifa_nivel: number | null
  forma_pago_codigo: string | null
  tipo_credito: string | null
  ruta_codigo: string | null
  descuento_pie_pct: number | null
  igic_pie_pct: number | null
  anulado: boolean
  aceptado: boolean
  preparado: boolean
  entregado: boolean
  liquidado: number | null
  venta_tienda_codigo: string | null
  venta_numero: number | null
  observaciones: string | null
}

interface Linea {
  numero_linea: number
  articulo_codigo: string
  codigo_venta: string | null
  codigo_compra: string | null
  descripcion: string | null
  cantidad: number
  precio: number
  descuento_pct: number
  igic_pct: number
  impuesto2_pct: number // canon por unidad
  garantia_meses: number | null
}

interface VentaInfo {
  fecha: string | null
  hora: string | null
  tipo_credito: string | null
  factura_tienda_codigo: string | null
  factura_numero: number | null
  reparto_tienda_codigo: string | null
  reparto_numero: number | null
}

interface FacturaInfo {
  tienda_terminal_codigo: string
  numero: number
  serie: string
  n_factura: number
  fecha_factura: string | null
  hora_factura: string | null
  total_pendiente: number | null
  fecha_pago: string | null
}

interface Tienda {
  codigo: string
  descripcion: string
  almacen_codigo: string | null
}

const CAB_COLS =
  'tienda_terminal_codigo, numero, fecha, hora, web_pedido_id, es_presupuesto, empleado_codigo, cliente_codigo, cliente_sucursal_codigo, nombre_cliente, nif_cliente, vendedor_codigo, fecha_inicio, fecha_fin, almacen_codigo, tarifa_nivel, forma_pago_codigo, tipo_credito, ruta_codigo, descuento_pie_pct, igic_pie_pct, anulado, aceptado, preparado, entregado, liquidado, venta_tienda_codigo, venta_numero, observaciones'

const NIVELES = ['General', 'MAYOR M-1', 'MAYOR M-2', 'MAYOR M-3', 'Tarifa Dto-4', 'Tarifa Dto-5', 'Tarifa Dto-6']

const LOOKUP_CLIENTE: GwLookupColumn[] = [
  { key: 'codigo', label: 'Código', width: 90 },
  { key: 'nombre', label: 'Nombre' },
  { key: 'nif', label: 'Dni/Nif', width: 110 },
  { key: 'poblacion', label: 'Población', width: 160 },
]
const LOOKUP_CLIENTE_BUSCA = ['codigo', 'nombre', 'nif', 'poblacion']
const LOOKUP_EMPLEADO: GwLookupColumn[] = [
  { key: 'codigo', label: 'Código', width: 90 },
  { key: 'nombre', label: 'Nombre' },
]
const LOOKUP_NOMBRE_BUSCA = ['codigo', 'nombre']
const LOOKUP_ARTICULO: GwLookupColumn[] = [
  { key: 'codigo_interno', label: 'Código Interno', width: 120 },
  { key: 'codigo_venta', label: 'Código Venta', width: 110 },
  { key: 'descripcion', label: 'Descripción' },
]
const LOOKUP_ARTICULO_BUSCA = ['codigo_interno', 'codigo_venta', 'descripcion', 'codigo_barras_principal']
const LOOKUP_PEDIDO: GwLookupColumn[] = [
  { key: 'tienda_terminal_codigo', label: 'Tienda', width: 60 },
  { key: 'numero', label: 'Número', width: 90 },
  { key: 'fecha', label: 'Fecha', width: 100 },
  { key: 'cliente_codigo', label: 'Cliente', width: 80 },
  { key: 'nombre_cliente', label: 'Nombre' },
]
const LOOKUP_PEDIDO_BUSCA = ['cliente_codigo', 'nombre_cliente']

// Fecha y hora de trabajo (Utilidades → Cambio de Fecha), por defecto las reales.
function hoy() {
  return fechaTrabajo()
}

function ahoraHora() {
  return horaTrabajo()
}

function fechaEs(v: string | null | undefined) {
  if (!v) return '  /  /'
  const [y, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

function vacia(tienda: Tienda | undefined, empleado: string | null, presupuesto: boolean): Cabecera {
  return {
    tienda_terminal_codigo: tienda?.codigo ?? '01',
    numero: null,
    fecha: hoy(),
    hora: ahoraHora(),
    web_pedido_id: null,
    es_presupuesto: presupuesto,
    empleado_codigo: empleado,
    cliente_codigo: '',
    cliente_sucursal_codigo: null,
    nombre_cliente: null,
    nif_cliente: null,
    vendedor_codigo: null,
    fecha_inicio: null,
    fecha_fin: null,
    almacen_codigo: tienda?.almacen_codigo ?? null,
    tarifa_nivel: null,
    forma_pago_codigo: null,
    tipo_credito: null,
    ruta_codigo: null,
    descuento_pie_pct: 0,
    igic_pie_pct: 0,
    anulado: false,
    aceptado: false,
    preparado: false,
    entregado: false,
    liquidado: null,
    venta_tienda_codigo: null,
    venta_numero: null,
    observaciones: null,
  }
}

/** Importes del documento: base por línea, descuento e IGIC de pie, canon y total (como GeminisWin). */
function calcular(lineas: Linea[], dtoPie: number, igicPie: number) {
  let subtotal = 0
  let canon = 0
  let igic = 0
  const porLinea = lineas.map((l) => {
    const sub = round3(l.cantidad * l.precio * (1 - (l.descuento_pct || 0) / 100))
    const canonLinea = round3((l.impuesto2_pct || 0) * l.cantidad)
    const base = round3(sub * (1 - dtoPie / 100) + canonLinea)
    const igicLinea = round3((base * (igicPie > 0 ? igicPie : l.igic_pct || 0)) / 100)
    subtotal += sub
    canon += canonLinea
    igic += igicLinea
    return { sub, canonLinea, base, igicLinea }
  })
  subtotal = round3(subtotal)
  const totalDto = round3((subtotal * dtoPie) / 100)
  const subtotal2 = round3(subtotal - totalDto)
  igic = round3(igic)
  const total = round3(subtotal2 + canon + igic)
  return { porLinea, subtotal, totalDto, subtotal2, canon: round3(canon), igic, total }
}

export function PedidoFichaPage({ presupuestos = false }: { presupuestos?: boolean }) {
  const params = useParams()
  const navigate = useNavigate()
  const { session } = useAuth()
  const base = presupuestos ? '/presupuestos' : '/pedidos'
  const resto = (params['*'] ?? '').split('/').filter(Boolean)
  const esNuevo = resto[0] === 'nuevo'
  const claveTienda = !esNuevo && resto.length >= 2 ? decodeURIComponent(resto[0]) : null
  const claveNumero = !esNuevo && resto.length >= 2 ? Number(resto[1]) : null

  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>(esNuevo ? 'alta' : 'consulta')
  const [tiendas, setTiendas] = useState<Tienda[]>([])
  const [empleadoActual, setEmpleadoActual] = useState<string | null>(null)
  const [cab, setCab] = useState<Cabecera | null>(null)
  const [orig, setOrig] = useState<{ cab: Cabecera; lineas: Linea[] } | null>(null)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [nombres, setNombres] = useState({ empleado: '', vendedor: '' })
  const [cliente, setCliente] = useState<ClienteVenta | null>(null)
  const [venta, setVenta] = useState<VentaInfo | null>(null)
  const [factura, setFactura] = useState<FacturaInfo | null>(null)
  const [orden, setOrden] = useState<'numero' | 'cliente'>('numero')
  const [sel, setSel] = useState(0)
  const [editLinea, setEditLinea] = useState<{ idx: number | 'nuevo'; l: Linea } | null>(null)
  const [infoLinea, setInfoLinea] = useState<{ cc: string; stk: number; upd: number } | null>(null)
  const [dialogo, setDialogo] = useState<null | 'cliente' | 'empleado' | 'vendedor' | 'articulo' | 'buscar' | 'tarifa'>(null)
  const [preciosNivel, setPreciosNivel] = useState<{ nivel: number; pvp: number }[]>([])
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [refresco, setRefresco] = useState(0)

  const editing = mode !== 'consulta'

  useEffect(() => {
    supabase
      .from('tienda_terminal')
      .select('codigo, descripcion, almacen_codigo')
      .order('codigo')
      .then(({ data }) => setTiendas((data ?? []) as Tienda[]))
    const uid = session?.user.id
    if (uid)
      supabase
        .from('empleado')
        .select('codigo')
        .eq('auth_user_id', uid)
        .maybeSingle()
        .then(({ data }) => setEmpleadoActual(data?.codigo ?? null))
  }, [session?.user.id])

  // En alta, el empleado de la sesión llega después de montar la ficha: se rellena al llegar.
  useEffect(() => {
    if (mode !== 'alta' || !empleadoActual) return
    setCab((c) => (c && !c.empleado_codigo ? { ...c, empleado_codigo: empleadoActual } : c))
    supabase
      .from('empleado')
      .select('nombre')
      .eq('codigo', empleadoActual)
      .maybeSingle()
      .then(({ data }) => setNombres((n) => (n.empleado ? n : { ...n, empleado: (data?.nombre as string | undefined) ?? '' })))
  }, [mode, empleadoActual])

  // Navegación contra el servidor: solo el vecino (gt/lt + limit 1) y el recuento, nunca la lista.
  const filtroNav = useCallback(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (q: any) => (presupuestos ? q.eq('es_reparacion', false).eq('es_presupuesto', true) : q.eq('es_reparacion', false)),
    [presupuestos],
  )
  const nav = useNavRegistro<{ tienda_terminal_codigo: string; numero: number }>({
    tabla: 'pedido_cliente',
    orden: orden === 'numero' ? ['tienda_terminal_codigo', 'numero'] : ['nombre_cliente', 'numero', 'tienda_terminal_codigo'],
    actual:
      mode !== 'consulta' || !cab || cab.numero == null
        ? null
        : orden === 'numero'
          ? [cab.tienda_terminal_codigo, cab.numero]
          : [cab.nombre_cliente, cab.numero, cab.tienda_terminal_codigo],
    select: 'tienda_terminal_codigo, numero',
    filtro: filtroNav,
    nulos: orden !== 'numero',
  })
  const cargarClaves = nav.refrescar

  const cargarCliente = useCallback(async (codigo: string) => {
    if (!codigo) {
      setCliente(null)
      return null
    }
    const { data } = await supabase.from('cliente').select(CLIENTE_VENTA_COLS).eq('codigo', codigo).maybeSingle()
    setCliente((data as ClienteVenta | null) ?? null)
    return (data as ClienteVenta | null) ?? null
  }, [])

  const cargarNombre = useCallback(async (tabla: 'empleado' | 'vendedor', codigo: string | null) => {
    if (!codigo) return ''
    const { data } = await supabase.from(tabla).select('nombre').eq('codigo', codigo).maybeSingle()
    return (data?.nombre as string | undefined) ?? ''
  }, [])

  const cargarEnlaces = useCallback(async (c: Cabecera) => {
    setVenta(null)
    setFactura(null)
    if (!c.venta_numero || !c.venta_tienda_codigo) return
    const { data: v } = await supabase
      .from('venta')
      .select('fecha, hora, tipo_credito, factura_tienda_codigo, factura_numero, reparto_tienda_codigo, reparto_numero')
      .eq('tienda_terminal_codigo', c.venta_tienda_codigo)
      .eq('numero', c.venta_numero)
      .maybeSingle()
    setVenta((v as VentaInfo | null) ?? null)
    if (v?.factura_numero && v.factura_tienda_codigo) {
      const { data: f } = await supabase
        .from('factura')
        .select('tienda_terminal_codigo, numero, serie, n_factura, fecha_factura, hora_factura, total_pendiente, fecha_pago')
        .eq('tienda_terminal_codigo', v.factura_tienda_codigo)
        .eq('numero', v.factura_numero)
        .maybeSingle()
      setFactura((f as FacturaInfo | null) ?? null)
    }
  }, [])

  // Carga del documento: el pedido de la URL, el último si no hay ninguno, o uno vacío en alta.
  useEffect(() => {
    let cancel = false
    async function run() {
      setCargando(true)
      setMensaje(null)
      setEditLinea(null)
      setSel(0)
      if (esNuevo) {
        const tienda = tiendas.find((t) => t.codigo === tiendaDeTrabajo(tiendas))
        const c = vacia(tienda, empleadoActual, presupuestos)
        setCab(c)
        setOrig(null)
        setLineas([])
        setCliente(null)
        setVenta(null)
        setFactura(null)
        setNombres({ empleado: await cargarNombre('empleado', empleadoActual), vendedor: '' })
        setMode('alta')
        setCargando(false)
        return
      }
      let q = supabase.from('pedido_cliente').select(CAB_COLS)
      if (claveTienda && claveNumero != null) q = q.eq('tienda_terminal_codigo', claveTienda).eq('numero', claveNumero)
      else {
        q = q.eq('es_reparacion', false)
        if (presupuestos) q = q.eq('es_presupuesto', true)
        q = q.order('fecha', { ascending: false }).order('numero', { ascending: false })
      }
      const { data } = await q.limit(1)
      if (cancel) return
      const c = ((data ?? [])[0] as Cabecera | undefined) ?? null
      if (!c) {
        setCab(null)
        setOrig(null)
        setLineas([])
        setMode('consulta')
        setCargando(false)
        return
      }
      const { data: ls } = await supabase
        .from('pedido_cliente_linea')
        .select('numero_linea, articulo_codigo, codigo_venta, codigo_compra, descripcion, cantidad, precio, descuento_pct, igic_pct, impuesto2_pct, garantia_meses')
        .eq('tienda_terminal_codigo', c.tienda_terminal_codigo)
        .eq('numero', c.numero)
        .order('numero_linea')
      if (cancel) return
      const lns = (ls ?? []).map((l) => ({
        ...l,
        cantidad: Number(l.cantidad),
        precio: Number(l.precio ?? 0),
        descuento_pct: Number(l.descuento_pct ?? 0),
        igic_pct: Number(l.igic_pct ?? 0),
        impuesto2_pct: Number(l.impuesto2_pct ?? 0),
      })) as Linea[]
      setCab(c)
      setOrig({ cab: c, lineas: lns })
      setLineas(lns)
      setMode('consulta')
      const [emp, ven] = await Promise.all([cargarNombre('empleado', c.empleado_codigo), cargarNombre('vendedor', c.vendedor_codigo)])
      if (cancel) return
      setNombres({ empleado: emp, vendedor: ven })
      await Promise.all([cargarCliente(c.cliente_codigo), cargarEnlaces(c)])
      if (!cancel) setCargando(false)
    }
    run()
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [esNuevo, claveTienda, claveNumero, presupuestos, tiendas.length])

  const lineaSel = editLinea?.l ?? lineas[sel]

  // «CC: … Stk: … UPd: …» de la línea seleccionada, como la barra roja/azul de GeminisWin.
  useEffect(() => {
    if (!lineaSel?.articulo_codigo) {
      setInfoLinea(null)
      return
    }
    let cancel = false
    Promise.all([
      supabase.from('articulo').select('codigo_compra_habitual, unidades_pedidas').eq('codigo_interno', lineaSel.articulo_codigo).maybeSingle(),
      cab?.almacen_codigo
        ? supabase
            .from('articulo_almacen_stock')
            .select('cantidad_actual')
            .eq('articulo_codigo', lineaSel.articulo_codigo)
            .eq('almacen_codigo', cab.almacen_codigo)
            .maybeSingle()
        : Promise.resolve({ data: null }),
    ]).then(([a, s]) => {
      if (cancel) return
      setInfoLinea({
        cc: (lineaSel.codigo_compra || (a.data?.codigo_compra_habitual as string | null)) ?? '',
        stk: Number((s.data as { cantidad_actual?: number } | null)?.cantidad_actual ?? 0),
        upd: Number(a.data?.unidades_pedidas ?? 0),
      })
    })
    return () => {
      cancel = true
    }
  }, [lineaSel?.articulo_codigo, lineaSel?.codigo_compra, cab?.almacen_codigo, refresco])

  const dtoPie = Number(cab?.descuento_pie_pct ?? 0)
  const igicPie = Number(cab?.igic_pie_pct ?? 0)
  const lineasCalculo = editLinea ? (editLinea.idx === 'nuevo' ? [...lineas, editLinea.l] : lineas.map((l, i) => (i === editLinea.idx ? editLinea.l : l))) : lineas
  const tot = useMemo(() => calcular(lineasCalculo, dtoPie, igicPie), [lineasCalculo, dtoPie, igicPie])

  const tipoDoc = cab?.es_presupuesto ? 'Presupuesto' : 'Pedido'
  const estado = (() => {
    if (!cab) return ''
    if (cab.anulado) return `${tipoDoc} Anulado`
    if (factura) {
      const pagada = Number(factura.total_pendiente ?? 0) <= 0
      return `${tipoDoc} Facturada.\n${pagada ? `Factura Pagada el ${fechaEs(factura.fecha_pago)}` : 'Factura Pendiente de Pago'}`
    }
    if (cab.venta_numero) return `${tipoDoc} Entregado.\nVenta ${cab.venta_tienda_codigo}-${cab.venta_numero}`
    if (cab.entregado) return `${tipoDoc} Entregado`
    if (cab.preparado) return `${tipoDoc} Preparado.\nPendiente de Entregar`
    return `${tipoDoc} Pendiente de Entregar`
  })()

  // Contexto para NEXA («¿qué le falta a este pedido?»): solo el documento guardado, en consulta.
  useNexaContexto(
    cab && cab.numero != null && mode === 'consulta'
      ? {
          documento: `${tipoDoc} de cliente ${cab.tienda_terminal_codigo}-${cab.numero}`,
          fecha: cab.fecha,
          cliente: cab.cliente_codigo,
          nombreCliente: cab.nombre_cliente,
          vendedor: cab.vendedor_codigo,
          ruta: cab.ruta_codigo,
          formaPago: cab.forma_pago_codigo,
          almacen: cab.almacen_codigo,
          fechaFin: cab.fecha_fin,
          estado: estado.replace(/\n/g, ' '),
          preparado: cab.preparado,
          entregado: cab.entregado,
          anulado: cab.anulado,
          venta: cab.venta_numero ? `${cab.venta_tienda_codigo}-${cab.venta_numero}` : null,
          numeroLineas: lineas.length,
          lineas: lineas.slice(0, 40).map((l) => ({ articulo: l.articulo_codigo, descripcion: l.descripcion, cantidad: l.cantidad })),
          total: tot.total,
        }
      : null,
  )

  function patch(p: Partial<Cabecera>) {
    setCab((c) => (c ? { ...c, ...p } : c))
  }

  async function elegirCliente(codigo: string) {
    const c = await cargarCliente(codigo.trim())
    if (!c) {
      patch({ cliente_codigo: codigo.trim(), nombre_cliente: null, nif_cliente: null })
      if (codigo.trim()) setMensaje(`No existe el cliente ${codigo.trim()}.`)
      return
    }
    setMensaje(null)
    patch({
      cliente_codigo: c.codigo,
      nombre_cliente: c.nombre,
      nif_cliente: c.nif,
      vendedor_codigo: c.vendedor_codigo ?? cab?.vendedor_codigo ?? null,
      tarifa_nivel: c.tarifa_nivel_defecto,
      forma_pago_codigo: c.forma_pago_codigo,
      tipo_credito: c.tipo_credito,
      ruta_codigo: c.ruta_codigo,
      descuento_pie_pct: c.descuento_en_pie ? Number(c.descuento_pct ?? 0) : cab?.descuento_pie_pct ?? 0,
    })
    if (c.vendedor_codigo) setNombres((n) => ({ ...n, vendedor: '' }))
    if (c.vendedor_codigo) cargarNombre('vendedor', c.vendedor_codigo).then((v) => setNombres((n) => ({ ...n, vendedor: v })))
  }

  async function elegirCodigo(tabla: 'empleado' | 'vendedor', codigo: string) {
    const nombre = await cargarNombre(tabla, codigo.trim() || null)
    if (tabla === 'empleado') {
      patch({ empleado_codigo: codigo.trim() || null })
      setNombres((n) => ({ ...n, empleado: nombre }))
    } else {
      patch({ vendedor_codigo: codigo.trim() || null })
      setNombres((n) => ({ ...n, vendedor: nombre }))
    }
  }

  async function lineaDesdeArticulo(a: ArticuloVenta, cantidad: number, previa?: Linea): Promise<Linea> {
    const { pvp } = await precioParaCliente(a, cliente, cantidad, cab?.tarifa_nivel ?? null)
    const dtoLinea = cliente && !cliente.descuento_en_pie ? Number(cliente.descuento_pct ?? 0) : 0
    return {
      numero_linea: previa?.numero_linea ?? 0,
      articulo_codigo: a.codigo_interno,
      codigo_venta: a.codigo_venta ?? a.codigo_interno,
      codigo_compra: a.codigo_compra_habitual,
      descripcion: a.descripcion,
      cantidad,
      precio: pvp,
      descuento_pct: dtoLinea,
      igic_pct: Number(a.igic_pct ?? 0),
      impuesto2_pct: cliente?.no_aplica_impuesto2 ? 0 : Number(a.impuesto2_pct ?? 0),
      garantia_meses: a.garantia_meses,
    }
  }

  async function codigoLinea(codigo: string) {
    if (!editLinea) return
    const a = await buscarArticulo(codigo)
    if (!a) {
      setMensaje(`No existe ningún artículo con el código ${codigo.trim()}.`)
      return
    }
    setMensaje(null)
    const l = await lineaDesdeArticulo(a, editLinea.l.cantidad || 1, editLinea.l)
    setEditLinea((e) => (e ? { ...e, l } : e))
  }

  function nuevaLinea() {
    if (!editing || !cab?.cliente_codigo) {
      if (editing) setMensaje('Indica primero el cliente.')
      return
    }
    setEditLinea({
      idx: 'nuevo',
      l: {
        numero_linea: 0,
        articulo_codigo: '',
        codigo_venta: '',
        codigo_compra: null,
        descripcion: '',
        cantidad: 1,
        precio: 0,
        descuento_pct: 0,
        igic_pct: 0,
        impuesto2_pct: 0,
        garantia_meses: null,
      },
    })
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
    if (!editing || !lineas[sel]) return
    if (!confirm(`¿Borrar la línea «${lineas[sel].descripcion ?? lineas[sel].articulo_codigo}»?`)) return
    setLineas((ls) => ls.filter((_, k) => k !== sel))
    setSel((s) => Math.max(0, s - 1))
  }

  async function abrirTarifa() {
    if (!lineaSel?.articulo_codigo) return
    const { data } = await supabase
      .from('articulo_precio_nivel')
      .select('nivel_tarifa, pvp')
      .eq('articulo_codigo', lineaSel.articulo_codigo)
      .order('nivel_tarifa')
    setPreciosNivel((data ?? []).map((r) => ({ nivel: Number(r.nivel_tarifa), pvp: Number(r.pvp) })))
    setDialogo('tarifa')
  }

  async function guardar() {
    if (!cab) return
    if (!cab.cliente_codigo || !cliente) {
      setMensaje('El cliente es obligatorio.')
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
          p_tipo_documento: 'pedido_cliente',
          p_serie: '',
        })
        if (error) throw new Error(error.message)
        numero = data as number
      }
      const t = calcular(lineas, dtoPie, igicPie)
      const fila = {
        ...cab,
        numero,
        subtotal: t.subtotal,
        total_descuento_pie: t.totalDto,
        subtotal_2: t.subtotal2,
        total_igic_pie: t.igic,
        total: t.total,
        total_pendiente: t.total,
      }
      if (mode === 'alta') {
        const { error } = await supabase.from('pedido_cliente').insert(fila)
        if (error) throw new Error(error.message)
      } else {
        const { tienda_terminal_codigo: _t, numero: _n, ...upd } = fila
        const { error } = await supabase
          .from('pedido_cliente')
          .update(upd)
          .eq('tienda_terminal_codigo', cab.tienda_terminal_codigo)
          .eq('numero', cab.numero)
        if (error) throw new Error(error.message)
      }
      const filasLinea = lineas.map((l, i) => ({
        tienda_terminal_codigo: cab.tienda_terminal_codigo,
        numero,
        numero_linea: i + 1,
        almacen_codigo: cab.almacen_codigo,
        fecha: cab.fecha,
        hora: cab.hora,
        articulo_codigo: l.articulo_codigo,
        codigo_venta: l.codigo_venta,
        codigo_compra: l.codigo_compra,
        descripcion: l.descripcion,
        cantidad: l.cantidad,
        precio: l.precio,
        descuento_pct: l.descuento_pct,
        subtotal: t.porLinea[i].sub,
        igic_pct: igicPie > 0 ? igicPie : l.igic_pct,
        total_igic: t.porLinea[i].igicLinea,
        total_base: t.porLinea[i].base,
        impuesto2_pct: l.impuesto2_pct,
        total_impuesto2: t.porLinea[i].canonLinea,
        garantia_meses: l.garantia_meses,
      }))
      if (filasLinea.length) {
        const { error } = await supabase
          .from('pedido_cliente_linea')
          .upsert(filasLinea, { onConflict: 'tienda_terminal_codigo,numero,numero_linea' })
        if (error) throw new Error(error.message)
      }
      if (mode !== 'alta') {
        const { error } = await supabase
          .from('pedido_cliente_linea')
          .delete()
          .eq('tienda_terminal_codigo', cab.tienda_terminal_codigo)
          .eq('numero', cab.numero)
          .gt('numero_linea', filasLinea.length)
        if (error) throw new Error(error.message)
      }
      setSaving(false)
      cargarClaves()
      if (mode === 'alta') navigate(`${base}/${encodeURIComponent(cab.tienda_terminal_codigo)}/${numero}`, { replace: true })
      else {
        const c = { ...cab }
        setOrig({ cab: c, lineas })
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
      cargarCliente(orig.cab.cliente_codigo)
    }
    setMode('consulta')
  }

  async function entregar() {
    if (!cab || cab.numero == null || mode !== 'consulta') return
    if (cab.entregado || cab.venta_numero) return
    if (cab.anulado) {
      setMensaje('Un documento anulado no se puede entregar.')
      return
    }
    if (cab.es_presupuesto && !cab.aceptado) {
      setMensaje('El presupuesto tiene que estar Aceptado antes de entregarlo.')
      return
    }
    if (!lineas.length) {
      setMensaje('El documento no tiene líneas.')
      return
    }
    if (!confirm(`¿Entregar el ${tipoDoc.toLowerCase()} ${cab.numero}? Se creará la venta y se descontará el stock del almacén ${cab.almacen_codigo ?? ''}.`)) return
    setSaving(true)
    try {
      const t = calcular(lineas, dtoPie, igicPie)
      const n = await entregarPedido({
        ...cab,
        numero: cab.numero,
        subtotal: t.subtotal,
        total_descuento_pie: t.totalDto,
        subtotal_2: t.subtotal2,
        total_igic_pie: t.igic,
        total: t.total,
      })
      const c = { ...cab, entregado: true, liquidado: 5, venta_tienda_codigo: cab.tienda_terminal_codigo, venta_numero: n }
      setCab(c)
      setOrig({ cab: c, lineas })
      await cargarEnlaces(c)
      setRefresco((r) => r + 1)
      setMensaje(`Entregado: venta ${c.venta_tienda_codigo}-${n}.`)
    } catch (e) {
      setMensaje((e as Error).message)
    }
    setSaving(false)
  }

  // F1 guarda en alta o modificación, como en GeminisWin.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'F1' && editing) {
        e.preventDefault()
        guardar()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const ir = async (d: NavDir) => {
    const k = await nav.ir(d)
    if (k) navigate(`${base}/${encodeURIComponent(k.tienda_terminal_codigo)}/${k.numero}`)
  }
  const canNavigate = mode === 'consulta' && !!cab

  const ro = !editing
  const nivelTarifa = cab?.tarifa_nivel ?? cliente?.tarifa_nivel_defecto ?? 0
  const colorInfo = infoLinea && infoLinea.stk <= 0 ? 'text-[#e00000]' : 'text-[#1a4fd0]'

  return (
    <div
      className="flex min-w-[1180px] flex-col gap-[3px] [&_.gw-input]:h-[25px] [&_.gw-input]:text-[15px] [&_.gw-label]:text-[15px] [&_.gw-label]:leading-[17px] [&_legend]:text-[16px]"
      title={presupuestos ? 'Presupuestos de Clientes y/o Pactos de Tarifas' : undefined}
    >
      {/* Fila 1: Tienda · Número · Fecha · Hora · Id Web · Tipo Documento | Empleado */}
      <div className="flex gap-1.5">
        <fieldset className="gw-group grid flex-1 grid-cols-[78px_minmax(110px,1fr)_150px_88px_110px_170px] gap-x-1 !pt-[2px]">
          <Campo label="Tienda" title="OFICINA">
            <GwSelect
              disabled={mode !== 'alta'}
              value={cab?.tienda_terminal_codigo ?? ''}
              onChange={(e) => {
                const t = tiendas.find((x) => x.codigo === e.target.value)
                patch({ tienda_terminal_codigo: e.target.value, almacen_codigo: t?.almacen_codigo ?? cab?.almacen_codigo ?? null })
              }}
            >
              {tiendas.map((t) => (
                <option key={t.codigo} value={t.codigo}>
                  {t.codigo}
                </option>
              ))}
            </GwSelect>
          </Campo>
          <Campo label={<u>N</u>} labelRest="úmero" title="IDPEDIDO — se asigna al guardar">
            <GwInput readOnly className="gw-num" value={cab?.numero != null ? String(cab.numero) : ''} />
          </Campo>
          <Campo label="Fecha">
            <GwDate disabled={ro} value={cab?.fecha} onChange={(v) => patch({ fecha: v })} />
          </Campo>
          <Campo label="Hora">
            <GwInput disabled={ro} value={cab?.hora ?? ''} onChange={(e) => patch({ hora: e.target.value || null })} />
          </Campo>
          <Campo label="Id Web" title="WEBIDPED — nº de pedido de WooCommerce">
            <GwInput
              disabled={ro}
              className="gw-num"
              value={cab?.web_pedido_id != null ? String(cab.web_pedido_id) : ''}
              onChange={(e) => patch({ web_pedido_id: e.target.value === '' ? null : Number(e.target.value.replace(/\D/g, '')) })}
            />
          </Campo>
          <Campo label="Tipo Documento">
            <GwSelect
              disabled={ro}
              value={(cab ? cab.es_presupuesto : presupuestos) ? 'P' : 'D'}
              onChange={(e) => patch({ es_presupuesto: e.target.value === 'P' })}
            >
              <option value="D">Pedido</option>
              <option value="P">Presupuesto</option>
            </GwSelect>
          </Campo>
        </fieldset>
        <fieldset className="gw-group w-[455px] !pt-0">
          <legend>
            <u>E</u>mpleado
          </legend>
          <div className="flex gap-1">
            <GwInput
              className="!w-[76px]"
              disabled={ro}
              value={cab?.empleado_codigo ?? ''}
              onChange={(e) => patch({ empleado_codigo: e.target.value })}
              onBlur={(e) => editing && elegirCodigo('empleado', e.target.value)}
            />
            <GwInput readOnly value={nombres.empleado} />
            <GwLookupButton disabled={ro} onClick={() => setDialogo('empleado')} />
          </div>
        </fieldset>
      </div>

      {/* Fila 2: Cliente – sucursal | Vendedor | Periodo de Validez */}
      <div className="flex gap-1.5">
        <fieldset className="gw-group flex-1 !pt-0">
          <legend>
            <u>C</u>liente
          </legend>
          <div className="flex items-center gap-1">
            <GwInput
              className="!w-[130px]"
              disabled={ro}
              value={cab?.cliente_codigo ?? ''}
              onChange={(e) => patch({ cliente_codigo: e.target.value })}
              onBlur={(e) => editing && elegirCliente(e.target.value)}
            />
            <GwInput readOnly className="!text-[17px]" value={cab?.nombre_cliente ?? cliente?.nombre ?? ''} />
            <GwLookupButton disabled={ro} onClick={() => setDialogo('cliente')} />
            <span className="px-0.5 text-[15px]">–</span>
            <GwInput
              className="gw-num !w-[42px]"
              disabled={ro}
              title="Nº de sucursal del cliente"
              value={cab?.cliente_sucursal_codigo ?? ''}
              onChange={(e) => patch({ cliente_sucursal_codigo: e.target.value || null })}
            />
          </div>
        </fieldset>
        <fieldset className="gw-group w-[245px] !pt-0">
          <legend>
            <u>V</u>endedor
          </legend>
          <div className="flex gap-1">
            <GwInput
              className="!w-[76px]"
              disabled={ro}
              value={cab?.vendedor_codigo ?? ''}
              onChange={(e) => patch({ vendedor_codigo: e.target.value })}
              onBlur={(e) => editing && elegirCodigo('vendedor', e.target.value)}
            />
            <GwInput readOnly value={nombres.vendedor} />
            <GwLookupButton disabled={ro} onClick={() => setDialogo('vendedor')} />
          </div>
        </fieldset>
        <fieldset className="gw-group w-[350px] !pt-0">
          <legend>Periodo de Validez</legend>
          <div className="flex items-center gap-1">
            <GwDate disabled={ro} value={cab?.fecha_inicio} onChange={(v) => patch({ fecha_inicio: v })} />
            <span className="text-[15px] font-bold">–</span>
            <GwDate disabled={ro} value={cab?.fecha_fin} onChange={(v) => patch({ fecha_fin: v })} />
          </div>
        </fieldset>
      </div>

      {/* Rejilla de líneas */}
      <div className="h-[288px] overflow-y-auto overflow-x-hidden border border-[var(--gw-border)] bg-white">
        <table className="gw-grid table-fixed text-[15px] [&_td]:h-[22px] [&_td]:py-0 [&_th]:text-[15px]">
          <colgroup>
            <col style={{ width: '14%' }} />
            <col style={{ width: '33%' }} />
            <col style={{ width: '8.5%' }} />
            <col style={{ width: '10.5%' }} />
            <col style={{ width: '5.5%' }} />
            <col style={{ width: '5.5%' }} />
            <col style={{ width: '8.5%' }} />
            <col style={{ width: '14.5%' }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr>
              <th>Cod. Venta</th>
              <th>Descripción</th>
              <th className="!text-right">Cantidad</th>
              <th className="!text-center">Pvp</th>
              <th className="!text-center">Dto</th>
              <th className="!text-center">igic</th>
              <th className="!text-center">Canon</th>
              <th className="!text-center">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) =>
              editLinea && editLinea.idx === i ? (
                <FilaEdicion
                  key={i}
                  l={editLinea.l}
                  sub={tot.porLinea[i]?.sub ?? 0}
                  onChange={(p) => setEditLinea((e) => (e ? { ...e, l: { ...e.l, ...p } } : e))}
                  onCodigo={codigoLinea}
                  onOk={aceptarLinea}
                  onCancel={() => setEditLinea(null)}
                />
              ) : (
                <tr
                  key={i}
                  className={i === sel && !editLinea ? 'gw-selected' : ''}
                  onClick={() => !editLinea && setSel(i)}
                  onDoubleClick={() => editing && !editLinea && setEditLinea({ idx: i, l: { ...l } })}
                >
                  <td className="truncate">{l.codigo_venta ?? l.articulo_codigo}</td>
                  <td className="truncate">{l.descripcion}</td>
                  <td className="text-right">{formatGw(l.cantidad, 2)}</td>
                  <td className="text-right">{formatGw(l.precio, 3)}</td>
                  <td className="text-right">{formatGw(l.descuento_pct, 2)}</td>
                  <td className="text-right">{formatGw(igicPie > 0 ? igicPie : l.igic_pct, 2)}</td>
                  <td className="text-right">{formatGw(l.impuesto2_pct, 3)}</td>
                  <td className="text-right">{formatGw(tot.porLinea[i]?.sub ?? 0, 3)}</td>
                </tr>
              ),
            )}
            {editLinea?.idx === 'nuevo' && (
              <FilaEdicion
                l={editLinea.l}
                sub={tot.porLinea[lineas.length]?.sub ?? 0}
                onChange={(p) => setEditLinea((e) => (e ? { ...e, l: { ...e.l, ...p } } : e))}
                onCodigo={codigoLinea}
                onOk={aceptarLinea}
                onCancel={() => setEditLinea(null)}
              />
            )}
            {Array.from({ length: Math.max(0, 12 - lineas.length - (editLinea?.idx === 'nuevo' ? 1 : 0)) }, (_, k) => (
              <tr key={`v${k}`}>
                {Array.from({ length: 8 }, (_, j) => (
                  <td key={j}>&nbsp;</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mini barra de líneas, estado, CC/Stk/UPd, descuento e IGIC de pie y totales */}
      <div className="grid grid-cols-[560px_minmax(0,1fr)_250px] gap-x-2">
        <div className="flex flex-col">
          <div className="flex border border-[var(--gw-border)] bg-[var(--gw-face)]">
            <MiniBtn title="Nueva línea" disabled={!editing || !!editLinea} onClick={nuevaLinea}>
              <FilePlus2 size={15} />
            </MiniBtn>
            <MiniBtn
              title="Modificar línea"
              disabled={!editing || !!editLinea || !lineas[sel]}
              onClick={() => lineas[sel] && setEditLinea({ idx: sel, l: { ...lineas[sel] } })}
            >
              <FilePen size={15} />
            </MiniBtn>
            <MiniBtn title="Borrar línea" disabled={!editing || !!editLinea || !lineas[sel]} onClick={borrarLinea}>
              <FileX2 size={15} />
            </MiniBtn>
            <MiniBtn title="Buscar artículo" disabled={!editLinea} onClick={() => setDialogo('articulo')}>
              <Binoculars size={15} />
            </MiniBtn>
            <MiniBtn title={`Tarifas del artículo — tarifa del cliente: ${NIVELES[nivelTarifa] ?? nivelTarifa}`} disabled={!lineaSel?.articulo_codigo} onClick={abrirTarifa}>
              <Tag size={14} className="text-[#8a6d1d]" />
              <span className="text-[16px] text-black">{cab?.cliente_codigo ? `Tarifa ${nivelTarifa}` : 'Tar.'}</span>
            </MiniBtn>
            <MiniBtn title="Petición de artículos — aún no disponible en el ERP propio" disabled>
              <PackageSearch size={15} className="text-[#8a6d1d]" />
            </MiniBtn>
          </div>
          <div className="mt-1 min-h-[40px] whitespace-pre-line text-[18px] leading-[20px] text-[#1a4fd0]">{estado}</div>
        </div>
        <div className="flex flex-col gap-[3px]">
          <div className={`h-[20px] truncate text-[16px] leading-[20px] ${colorInfo}`} title="CC = código de compra · Stk = stock en el almacén del pedido · UPd = unidades pedidas a proveedor">
            {infoLinea ? `CC: ${infoLinea.cc}  Stk: ${formatGw(infoLinea.stk, 3)}  UPd: ${formatGw(infoLinea.upd, 3)}` : ''}
          </div>
          <div className="grid grid-cols-[80px_110px_18px_minmax(0,1fr)] items-center gap-x-1">
            <span className="gw-label text-right !text-[17px] font-bold">Dto.:</span>
            <GwNumber decimals={2} disabled={ro} value={cab?.descuento_pie_pct ?? 0} onChange={(v) => patch({ descuento_pie_pct: v ?? 0 })} />
            <span className="text-[17px] font-bold">%</span>
            <GwNumber decimals={3} value={tot.totalDto} />
          </div>
          <div className="grid grid-cols-[80px_110px_18px_minmax(0,1fr)] items-center gap-x-1">
            <span className="gw-label text-right !text-[17px] font-bold">IGIC:</span>
            <GwNumber decimals={2} disabled={ro} value={cab?.igic_pie_pct ?? 0} onChange={(v) => patch({ igic_pie_pct: v ?? 0 })} />
            <span className="text-[17px] font-bold">%</span>
            <span className="pr-1 text-right text-[17px] font-bold">{formatGw(tot.igic, 3)}</span>
          </div>
        </div>
        <div className="flex flex-col items-end justify-between">
          <span className="text-[17px] font-bold leading-[20px]" title="Subtotal">{formatGw(tot.subtotal, 3)}</span>
          <span className="text-[17px] font-bold leading-[20px]" title="Subtotal tras el descuento de pie">{formatGw(tot.subtotal2, 3)}</span>
          <span className="w-full border border-[var(--gw-border)] bg-white px-2 text-right text-[19px] font-bold leading-[28px]" title="Total (con IGIC y canon)">
            {formatGw(tot.total, 3)}
          </span>
        </div>
      </div>

      {/* Estados y enlace con la venta */}
      <div className="flex gap-1.5 border-t border-[var(--gw-border-light)] pt-[3px]">
        <EstadoBtn label="Anulado" on={!!cab?.anulado} disabled={ro} onClick={() => patch({ anulado: !cab?.anulado })} tall />
        <EstadoBtn label="Aceptado" on={!!cab?.aceptado} disabled={ro} onClick={() => patch({ aceptado: !cab?.aceptado })} tall />
        <div className="flex w-[180px] flex-col">
          <EstadoBtn label="Preparado" inline on={!!cab?.preparado} disabled={ro} onClick={() => patch({ preparado: !cab?.preparado })} />
          <EstadoBtn
            label="Entregado"
            inline
            on={!!cab?.entregado}
            disabled={mode !== 'consulta' || !cab || cab.numero == null || cab.entregado || saving}
            title={cab?.entregado ? 'Entregado' : 'Entregar: crea la venta y descuenta el stock'}
            onClick={entregar}
          />
        </div>
        <fieldset className="gw-group grid flex-1 grid-cols-[minmax(0,1fr)_150px_88px_150px] gap-x-1 !pt-0">
          <span className="gw-label col-span-1">Tienda y Nº de venta</span>
          <span className="gw-label">Fecha</span>
          <span className="gw-label">Hora</span>
          <span className="gw-label">Tipo Venta</span>
          <div className="flex gap-1">
            <GwSelect disabled className="!w-[70px]" value={cab?.venta_tienda_codigo ?? ''}>
              <option value="">{cab?.venta_tienda_codigo ?? ''}</option>
            </GwSelect>
            <GwInput readOnly className="gw-num" value={cab?.venta_numero != null ? String(cab.venta_numero) : ''} />
            <GwLookupButton
              title="Ir a la venta"
              disabled={!cab?.venta_numero}
              onClick={() => cab?.venta_numero && navigate(`/ventas/${encodeURIComponent(cab.venta_tienda_codigo ?? '')}/${cab.venta_numero}`)}
            />
          </div>
          <GwInput readOnly value={venta ? fechaEs(venta.fecha) : '  /  /'} />
          <GwInput readOnly value={venta?.hora ?? ''} />
          <GwInput readOnly value={venta?.tipo_credito ?? ''} />
        </fieldset>
        <BigBtn
          disabled={!venta}
          on={!!venta?.reparto_numero}
          title={venta?.reparto_numero ? 'Ver el reparto' : 'Ver o asignar reparto'}
          onClick={() =>
            navigate(venta?.reparto_numero ? `/repartos/${encodeURIComponent(venta.reparto_tienda_codigo ?? '')}/${venta.reparto_numero}` : '/repartos')
          }
        >
          Reparto
        </BigBtn>
      </div>

      {/* Enlace con la factura (solo pedidos, como GeminisWin) */}
      {!presupuestos && (
        <div className="flex gap-1.5 border-t border-[var(--gw-border-light)] pt-[3px]">
          <button
            type="button"
            className="gw-btn !h-[50px] w-[140px] gap-1 !text-[18px]"
            disabled={!factura}
            title={factura ? 'Ir a la factura' : 'La factura se genera desde Facturación'}
            onClick={() => navigate('/facturacion')}
          >
            {factura ? <Check size={16} strokeWidth={3} className="text-[#127a12]" /> : <X size={16} strokeWidth={3} className="text-[#c42b1c]" />}
            <span>
              <u>F</u>actura
            </span>
          </button>
          <fieldset className="gw-group grid flex-1 grid-cols-[76px_160px_76px_140px_150px_110px_minmax(0,1fr)] gap-x-1 !pt-0">
            <span className="gw-label">Tie. F.</span>
            <span className="gw-label">Id. Factura</span>
            <span className="gw-label">D.C.</span>
            <span className="gw-label">Nº de Factura</span>
            <span className="gw-label">Fecha Fact.</span>
            <span className="gw-label">Hora Fact.</span>
            <span className="gw-label">Observaciones</span>
            <GwSelect disabled value="">
              <option value="">{factura?.tienda_terminal_codigo ?? ''}</option>
            </GwSelect>
            <GwInput readOnly className="gw-num" value={factura ? String(factura.numero) : ''} />
            <GwSelect disabled value="" title="D.C. = serie de facturación">
              <option value="">{factura?.serie ?? ''}</option>
            </GwSelect>
            <GwInput readOnly className="gw-num" value={factura ? String(factura.n_factura) : '0'} />
            <GwInput readOnly value={factura ? fechaEs(factura.fecha_factura) : '  /  /'} />
            <GwInput readOnly value={factura?.hora_factura ?? ''} />
            <GwInput disabled={ro} value={cab?.observaciones ?? ''} onChange={(e) => patch({ observaciones: e.target.value || null })} />
          </fieldset>
          <BigBtn disabled={!factura} title="Cobros de la factura" onClick={() => factura && navigate(`/gestor-cobros-clientes?factura=${encodeURIComponent(factura.tienda_terminal_codigo)}-${factura.numero}`)}>
            Pagos
          </BigBtn>
        </div>
      )}
      {presupuestos && (
        <div className="flex items-center gap-1.5">
          <span className="gw-label">Observaciones</span>
          <GwInput disabled={ro} value={cab?.observaciones ?? ''} onChange={(e) => patch({ observaciones: e.target.value || null })} />
        </div>
      )}

      <PedidoBar
        mode={mode}
        canNavigate={canNavigate}
        saving={saving}
        onFirst={() => ir('primero')}
        onPrev={() => ir('anterior')}
        onNext={() => ir('siguiente')}
        onLast={() => ir('ultimo')}
        onSort={() => setOrden((o) => (o === 'numero' ? 'cliente' : 'numero'))}
        onSearch={() => setDialogo('buscar')}
        onPrint={() => window.print()}
        onNew={() => navigate(`${base}/nuevo`)}
        onEdit={() => cab && setMode('edicion')}
        onSave={guardar}
        onCancel={cancelar}
        onExit={() => navigate('/')}
      />
      <div className="flex justify-between text-[12px] text-[#444]">
        <span>
          {cargando
            ? 'Cargando…'
            : !cab
              ? `No hay ${presupuestos ? 'presupuestos' : 'pedidos'}. Pulsa Nuevo para crear uno.`
              : mode === 'alta'
                ? `Alta de ${tipoDoc.toLowerCase()} · el número se asigna al guardar (F1)`
                : mode === 'edicion'
                  ? 'Modificando · F1 guarda'
                  : `Orden: ${orden === 'numero' ? 'por número' : 'por cliente'}${textoRegistro(nav)}`}
        </span>
        {mensaje && <span className="font-bold text-[#c42b1c]">{mensaje}</span>}
      </div>

      {dialogo === 'cliente' && (
        <GwLookupDialog
          title="Clientes"
          table="cliente"
          columns={LOOKUP_CLIENTE}
          searchColumns={LOOKUP_CLIENTE_BUSCA}
          orderBy="codigo"
          keyColumn="codigo"
          onClose={() => setDialogo(null)}
          onPick={(r) => {
            setDialogo(null)
            elegirCliente(String(r.codigo))
          }}
        />
      )}
      {(dialogo === 'empleado' || dialogo === 'vendedor') && (
        <GwLookupDialog
          title={dialogo === 'empleado' ? 'Empleados' : 'Vendedores'}
          table={dialogo}
          columns={LOOKUP_EMPLEADO}
          searchColumns={LOOKUP_NOMBRE_BUSCA}
          orderBy="codigo"
          keyColumn="codigo"
          onClose={() => setDialogo(null)}
          onPick={(r) => {
            const t = dialogo
            setDialogo(null)
            elegirCodigo(t, String(r.codigo))
          }}
        />
      )}
      {dialogo === 'articulo' && (
        <GwLookupDialog
          title="Artículos"
          table="articulo"
          columns={LOOKUP_ARTICULO}
          searchColumns={LOOKUP_ARTICULO_BUSCA}
          orderBy="descripcion"
          keyColumn="codigo_interno"
          onClose={() => setDialogo(null)}
          onPick={async (r) => {
            setDialogo(null)
            const { data } = await supabase.from('articulo').select(ARTICULO_VENTA_COLS).eq('codigo_interno', String(r.codigo_interno)).maybeSingle()
            if (data && editLinea) {
              const l = await lineaDesdeArticulo(data as ArticuloVenta, editLinea.l.cantidad || 1, editLinea.l)
              setEditLinea((e) => (e ? { ...e, l } : e))
            }
          }}
        />
      )}
      {dialogo === 'buscar' && (
        <GwLookupDialog
          title={presupuestos ? 'Localizar presupuestos' : 'Localizar pedidos'}
          table="pedido_cliente"
          columns={LOOKUP_PEDIDO}
          searchColumns={LOOKUP_PEDIDO_BUSCA}
          orderBy="numero"
          keyColumn="numero"
          onClose={() => setDialogo(null)}
          onPick={(r) => {
            setDialogo(null)
            navigate(`${base}/${encodeURIComponent(String(r.tienda_terminal_codigo))}/${Number(r.numero)}`)
          }}
        />
      )}
      {dialogo === 'tarifa' && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-32" onClick={() => setDialogo(null)}>
          <div onClick={(e) => e.stopPropagation()}>
            <GwWindow title={`Tarifas · ${lineaSel?.descripcion ?? ''}`} onClose={() => setDialogo(null)} className="w-[420px]">
              <table className="gw-grid">
                <thead>
                  <tr>
                    <th>Tarifa</th>
                    <th className="!text-right">Pvp</th>
                  </tr>
                </thead>
                <tbody>
                  {NIVELES.map((n, i) => {
                    const p = preciosNivel.find((x) => x.nivel === i)
                    return (
                      <tr
                        key={i}
                        className={i === nivelTarifa ? 'gw-selected' : ''}
                        title={editLinea ? 'Doble clic para aplicar este precio a la línea' : undefined}
                        onDoubleClick={() => {
                          if (editLinea && p) {
                            setEditLinea((e) => (e ? { ...e, l: { ...e.l, precio: p.pvp } } : e))
                            setDialogo(null)
                          }
                        }}
                      >
                        <td>{n}</td>
                        <td className="text-right">{p ? formatGw(p.pvp, 3) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </GwWindow>
          </div>
        </div>
      )}
    </div>
  )
}

function Campo({ label, labelRest, title, children }: { label: ReactNode; labelRest?: string; title?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col" title={title}>
      <span className="gw-label !text-[17px]">
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
      className="flex h-[34px] flex-1 items-center justify-center gap-1 border-r border-[var(--gw-border-light)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

function EstadoBtn({
  label,
  on,
  disabled,
  onClick,
  tall,
  inline,
  title,
}: {
  label: string
  on: boolean
  disabled?: boolean
  onClick?: () => void
  tall?: boolean
  inline?: boolean
  title?: string
}) {
  const marca = on ? <Check size={14} strokeWidth={3} className="text-[#127a12]" /> : <X size={14} strokeWidth={3} className="text-[#c42b1c]" />
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={`gw-btn !opacity-100 disabled:!text-black ${tall ? '!h-[50px] w-[112px] flex-col !gap-0 !text-[18px]' : '!h-[25px] w-full !text-[18px]'}`}
    >
      {inline ? (
        <>
          {marca}
          {label}
        </>
      ) : (
        <>
          <span>{label}</span>
          {marca}
        </>
      )}
    </button>
  )
}

function BigBtn({ children, disabled, on, title, onClick }: { children: ReactNode; disabled?: boolean; on?: boolean; title?: string; onClick?: () => void }) {
  return (
    <button type="button" className="gw-btn !h-[50px] w-[140px] gap-1 !text-[19px]" disabled={disabled} title={title} onClick={onClick}>
      {on ? <Check size={16} strokeWidth={3} className="text-[#127a12]" /> : <X size={16} strokeWidth={3} className="text-[#c42b1c]" />}
      {children}
    </button>
  )
}

function FilaEdicion({
  l,
  sub,
  onChange,
  onCodigo,
  onOk,
  onCancel,
}: {
  l: Linea
  sub: number
  onChange: (p: Partial<Linea>) => void
  onCodigo: (c: string) => void
  onOk: () => void
  onCancel: () => void
}) {
  const [codigo, setCodigo] = useState(l.codigo_venta ?? '')
  useEffect(() => setCodigo(l.codigo_venta ?? ''), [l.codigo_venta])
  const celda = '!h-[21px] !border-0 !px-1 !text-[15px]'
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
            if (e.key === 'Enter') onCodigo(codigo)
            if (e.key === 'Escape') onCancel()
          }}
          onBlur={() => codigo && codigo !== l.codigo_venta && onCodigo(codigo)}
        />
      </td>
      <td className="!p-0">
        <GwInput className={celda} value={l.descripcion ?? ''} onChange={(e) => onChange({ descripcion: e.target.value })} />
      </td>
      <td className="!p-0">
        <GwNumber className={celda} decimals={2} value={l.cantidad} onChange={(v) => onChange({ cantidad: v ?? 0 })} />
      </td>
      <td className="!p-0">
        <GwNumber className={celda} decimals={3} value={l.precio} onChange={(v) => onChange({ precio: v ?? 0 })} />
      </td>
      <td className="!p-0">
        <GwNumber className={celda} decimals={2} value={l.descuento_pct} onChange={(v) => onChange({ descuento_pct: v ?? 0 })} />
      </td>
      <td className="!p-0">
        <GwNumber className={celda} decimals={2} value={l.igic_pct} onChange={(v) => onChange({ igic_pct: v ?? 0 })} />
      </td>
      <td className="!p-0">
        <GwNumber className={celda} decimals={3} value={l.impuesto2_pct} onChange={(v) => onChange({ impuesto2_pct: v ?? 0 })} />
      </td>
      <td className="!p-0">
        <div className="flex items-center">
          <span className="flex-1 px-1 text-right">{formatGw(sub, 3)}</span>
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
