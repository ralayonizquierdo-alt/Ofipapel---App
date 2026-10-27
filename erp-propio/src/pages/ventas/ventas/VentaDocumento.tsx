import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowDownAZ,
  Binoculars,
  ChevronFirst,
  ChevronLast,
  DoorOpen,
  FilePen,
  FilePlus2,
  FileMinus2,
  FileX2,
  Hand,
  Play,
  Printer,
  Save,
  ScrollText,
  Tag,
  Triangle,
  Undo2,
  X,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useAuth } from '../../../lib/AuthContext'
import { formatGw } from '../../../components/gw'
import { GwLookupDialog, type GwLookupColumn } from '../../../components/gw/GwLookupDialog'
import {
  NIVELES,
  anularVenta,
  baseLinea,
  cajaAbierta,
  calcularPie,
  canonLinea,
  cargarVenta,
  cobrarVenta,
  guardarVenta,
  horaActual,
  hoyISO,
  lineaDesdeArticulo,
  lineaVacia,
  precioArticulo,
  subtotalLinea,
  type CabeceraVenta,
  type Cobro,
  nuevaClave,
  type LineaVenta,
  type VerifactuVenta,
} from './ventaModel'
import {
  AnularVentaDialog,
  AplazadasDialog,
  AvisoDialog,
  EmpleadoDialog,
  PagoDialog,
  StockDialog,
  TarifaDialog,
  VerifactuDialog,
} from './VentaDialogs'
import { VentaTicket, type EmpresaTicket } from './VentaTicket'

type Modo = 'consulta' | 'alta' | 'edicion'

interface Tienda {
  codigo: string
  descripcion: string
  almacen_codigo: string | null
  cliente_contado_codigo: string | null
  empresa_codigo: string | null
}

interface Empleado {
  codigo: string
  nombre: string
  imagen_url: string | null
}

const COLS_VENTA: GwLookupColumn[] = [
  { key: 'numero', label: 'Número', width: 90 },
  { key: 'fecha', label: 'Fecha', width: 100 },
  { key: 'cliente_codigo', label: 'Cliente', width: 80 },
  { key: 'nombre_cliente', label: 'Nombre' },
  { key: 'total', label: 'Total', width: 90 },
]
const BUSCA_VENTA = ['nombre_cliente', 'cliente_codigo']
const COLS_CLIENTE: GwLookupColumn[] = [
  { key: 'codigo', label: 'Código', width: 80 },
  { key: 'nombre', label: 'Nombre' },
  { key: 'nif', label: 'Dni/Nif', width: 110 },
  { key: 'poblacion', label: 'Población', width: 160 },
]
const BUSCA_CLIENTE = ['codigo', 'nombre', 'nif']
const COLS_ARTICULO: GwLookupColumn[] = [
  { key: 'codigo_interno', label: 'Código Interno', width: 110 },
  { key: 'codigo_venta', label: 'Cod. Venta', width: 110 },
  { key: 'descripcion', label: 'Descripción' },
]
const BUSCA_ARTICULO = ['codigo_interno', 'codigo_venta', 'descripcion', 'codigo_barras_principal']

function cabeceraNueva(tienda: string): CabeceraVenta {
  return {
    tienda,
    numero: null,
    fecha: hoyISO(),
    hora: horaActual(),
    cliente_codigo: '',
    cliente_nombre: '',
    cliente_nif: null,
    sucursal: null,
    tarifa_nivel: 0,
    empleado_codigo: null,
    descuento_pie_pct: 0,
    igic_pie_pct: 0,
    factura_tienda: null,
    factura_numero: null,
    total_pagado: 0,
    total_pendiente: 0,
    total_efectivo: 0,
    total_tarjeta: 0,
    tipo_credito: null,
    aplazada: false,
    observaciones: null,
    rectifica_tienda: null,
    rectifica_numero: null,
    anulada: false,
  }
}

const fechaES = (iso: string) => (iso ? new Date(`${iso}T00:00:00`).toLocaleDateString('es-ES') : '')

/**
 * Ventana «Ventas» de GeminisWin. La usan el TPV (abre en alta y pide el empleado) y la ficha
 * Ventas / Facturas (abre en consulta). El número se asigna al guardar, nunca al abrir.
 */
export function VentaDocumento({
  modoInicial,
  tiendaParam,
  numeroParam,
  pedirEmpleado = false,
}: {
  modoInicial: 'alta' | 'consulta'
  tiendaParam?: string
  numeroParam?: number
  pedirEmpleado?: boolean
}) {
  const navigate = useNavigate()
  const { session, signOut } = useAuth()
  const [tiendas, setTiendas] = useState<Tienda[]>([])
  const [tienda, setTienda] = useState<string>(tiendaParam ?? '')
  const [empleado, setEmpleado] = useState<Empleado | null>(null)
  const [empleadoVenta, setEmpleadoVenta] = useState<Empleado | null>(null)
  const [modo, setModo] = useState<Modo>(modoInicial)
  const [cab, setCab] = useState<CabeceraVenta>(cabeceraNueva(tiendaParam ?? ''))
  const [lineas, setLineas] = useState<LineaVenta[]>([])
  const [guardadas, setGuardadas] = useState<{ cab: CabeceraVenta; lineas: LineaVenta[] } | null>(null)
  const [verifactu, setVerifactu] = useState<VerifactuVenta | null>(null)
  const [empresa, setEmpresa] = useState<EmpresaTicket | null>(null)
  const [sel, setSel] = useState(0)
  const [orden, setOrden] = useState<'numero' | 'fecha'>('numero')
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [pidiendoEmpleado, setPidiendoEmpleado] = useState(pedirEmpleado)
  const [dialogo, setDialogo] = useState<
    | null
    | { tipo: 'pago'; aplazar: false }
    | { tipo: 'cobrar' }
    | { tipo: 'aplazadas' }
    | { tipo: 'stock' }
    | { tipo: 'tarifa' }
    | { tipo: 'buscarVenta' }
    | { tipo: 'buscarCliente' }
    | { tipo: 'buscarArticulo' }
    | { tipo: 'aviso'; texto: string }
    | { tipo: 'verifactu' }
    | { tipo: 'anular' }
  >(null)
  const codRefs = useRef<Map<string, HTMLInputElement>>(new Map())
  const [foco, setFoco] = useState<number | null>(null)

  const tiendaActual = tiendas.find((t) => t.codigo === tienda) ?? null
  const almacen = tiendaActual?.almacen_codigo ?? null
  const editable = modo !== 'consulta'
  const pie = useMemo(() => calcularPie(lineas, cab), [lineas, cab])
  const lineaSel = lineas[sel] ?? null

  // Tiendas y empleado de la sesión
  useEffect(() => {
    Promise.all([
      supabase.from('tienda_terminal').select('codigo, descripcion, almacen_codigo, cliente_contado_codigo, empresa_codigo').order('codigo'),
      supabase.rpc('fn_empleado_actual'),
    ]).then(async ([t, e]) => {
      const lista = (t.data ?? []) as Tienda[]
      setTiendas(lista)
      if (!tiendaParam) {
        let guardada: string | null = null
        try {
          guardada = localStorage.getItem('tpv.tienda')
        } catch {
          guardada = null
        }
        setTienda(lista.find((x) => x.codigo === guardada)?.codigo ?? lista[0]?.codigo ?? '')
      }
      if (e.data) {
        const { data: emp } = await supabase.from('empleado').select('codigo, nombre, imagen_url').eq('codigo', e.data).maybeSingle()
        setEmpleado((emp as Empleado) ?? null)
      }
    })
  }, [tiendaParam])

  // Empresa emisora (cabecera del ticket impreso)
  const empresaCodigo = tiendas.find((t) => t.codigo === tienda)?.empresa_codigo ?? null
  useEffect(() => {
    if (!empresaCodigo) return
    supabase
      .from('empresa')
      .select('nombre, cif, direccion, poblacion')
      .eq('codigo', empresaCodigo)
      .maybeSingle()
      .then(({ data }) => setEmpresa((data as EmpresaTicket) ?? null))
  }, [empresaCodigo])

  const cargarEmpleadoVenta = useCallback(async (codigo: string | null) => {
    if (!codigo) return setEmpleadoVenta(null)
    const { data } = await supabase.from('empleado').select('codigo, nombre, imagen_url').eq('codigo', codigo).maybeSingle()
    setEmpleadoVenta((data as Empleado) ?? null)
  }, [])

  const aplicarCliente = useCallback(
    async (codigo: string, base: CabeceraVenta, lineasActuales: LineaVenta[], avisar: boolean) => {
      const c = codigo.trim()
      if (!c) return { cab: { ...base, cliente_codigo: '', cliente_nombre: '', cliente_nif: null }, lineas: lineasActuales }
      const { data: cli } = await supabase
        .from('cliente')
        .select('codigo, nombre, nif, tarifa_nivel_defecto, bloqueado, activo, mensaje_aviso_venta')
        .eq('codigo', c)
        .maybeSingle()
      if (!cli) {
        setMensaje({ texto: `No existe el cliente ${c}.`, error: true })
        return null
      }
      if (cli.bloqueado) {
        setMensaje({ texto: `El cliente ${c} está bloqueado: no se le puede vender.`, error: true })
        return null
      }
      const tarifa = cli.tarifa_nivel_defecto ?? 0
      const nuevaCab: CabeceraVenta = { ...base, cliente_codigo: cli.codigo, cliente_nombre: cli.nombre, cliente_nif: cli.nif, tarifa_nivel: tarifa, sucursal: null }
      // Cambiar de cliente recalcula los precios de las líneas con su tarifa y sus precios fijos
      const repreciadas = await Promise.all(
        lineasActuales.map(async (l) => {
          if (!l.articulo_codigo) return l
          const { data: art } = await supabase.from('articulo').select('pvp').eq('codigo_interno', l.articulo_codigo).maybeSingle()
          const { precio } = await precioArticulo(l.articulo_codigo, cli.codigo, tarifa, l.cantidad, art?.pvp ?? null)
          return { ...l, tarifa_nivel: tarifa, precio }
        }),
      )
      if (avisar && cli.mensaje_aviso_venta) setDialogo({ tipo: 'aviso', texto: cli.mensaje_aviso_venta })
      return { cab: nuevaCab, lineas: repreciadas }
    },
    [],
  )

  const empezarAlta = useCallback(
    async (t: string) => {
      setMensaje(null)
      const base = { ...cabeceraNueva(t), empleado_codigo: empleado?.codigo ?? null }
      const contado = tiendas.find((x) => x.codigo === t)?.cliente_contado_codigo
      let nueva = { cab: base, lineas: [lineaVacia(0)] }
      if (contado) {
        const r = await aplicarCliente(contado, base, [], false)
        if (r) nueva = { cab: r.cab, lineas: [lineaVacia(r.cab.tarifa_nivel)] }
      }
      setCab(nueva.cab)
      setLineas(nueva.lineas)
      setGuardadas(null)
      setVerifactu(null)
      setSel(0)
      setModo('alta')
      setEmpleadoVenta(empleado)
      setCargando(false)
    },
    [aplicarCliente, empleado, tiendas],
  )

  const abrirVenta = useCallback(
    async (t: string, numero: number | null) => {
      setCargando(true)
      let n = numero
      if (n == null) {
        const { data } = await supabase
          .from('venta')
          .select('numero')
          .eq('tienda_terminal_codigo', t)
          .order('numero', { ascending: false })
          .limit(1)
          .maybeSingle()
        n = data ? Number(data.numero) : null
      }
      if (n == null) {
        setCab(cabeceraNueva(t))
        setLineas([])
        setGuardadas(null)
        setVerifactu(null)
        setModo('consulta')
        setEmpleadoVenta(null)
        setCargando(false)
        return
      }
      const r = await cargarVenta(t, n, tiendas.find((x) => x.codigo === t)?.almacen_codigo ?? null)
      if (!r) {
        setMensaje({ texto: `No existe la venta ${t}-${n}.`, error: true })
        setCargando(false)
        return
      }
      setCab(r.cab)
      setLineas(r.lineas)
      setGuardadas({ cab: r.cab, lineas: r.lineas })
      setVerifactu(r.verifactu)
      setSel(0)
      setModo('consulta')
      cargarEmpleadoVenta(r.cab.empleado_codigo)
      setCargando(false)
    },
    [cargarEmpleadoVenta, tiendas],
  )

  // Carga inicial cuando ya se conocen las tiendas
  const iniciado = useRef(false)
  useEffect(() => {
    if (iniciado.current || !tienda || tiendas.length === 0) return
    iniciado.current = true
    if (modoInicial === 'alta') empezarAlta(tienda)
    else abrirVenta(tienda, numeroParam ?? null)
  }, [tienda, tiendas, modoInicial, numeroParam, empezarAlta, abrirVenta])

  // El empleado de la sesión puede llegar después de abrir el alta
  useEffect(() => {
    if (modo === 'alta' && empleado && !cab.empleado_codigo) {
      setCab((c) => ({ ...c, empleado_codigo: empleado.codigo }))
      setEmpleadoVenta(empleado)
    }
  }, [empleado, modo, cab.empleado_codigo])

  // ---------------- Líneas ----------------

  useEffect(() => {
    if (foco == null) return
    const k = lineas[foco]?.key
    if (k) {
      codRefs.current.get(k)?.focus()
      setSel(foco)
    }
    setFoco(null)
  }, [foco, lineas])

  function setLinea(i: number, patch: Partial<LineaVenta>) {
    setLineas((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function resolverCodigo(i: number, codigo: string) {
    const l = lineas[i]
    if (!l) return
    const c = codigo.trim()
    if (!c) {
      setLinea(i, { codigo_venta: '', articulo_codigo: null })
      return
    }
    if (l.articulo_codigo && (c === l.codigo_venta || c === l.articulo_codigo)) return
    const nueva = await lineaDesdeArticulo({ ...l, codigo_venta: c, tarifa_nivel: l.tarifa_nivel ?? cab.tarifa_nivel }, c, cab.cliente_codigo, almacen)
    if (!nueva) {
      setMensaje({ texto: `No existe ningún artículo con el código ${c}. Si es una línea de texto, deja el código vacío.`, error: true })
      return
    }
    setMensaje(null)
    setLineas((ls) => {
      const copia = ls.map((x, idx) => (idx === i ? nueva : x))
      // Como en GeminisWin: al completar la última línea se abre otra para seguir tecleando
      if (i === copia.length - 1) copia.push(lineaVacia(cab.tarifa_nivel))
      return copia
    })
    setFoco(i + 1)
  }

  function agregarLinea() {
    if (!editable) return entrarEdicion(() => agregarLinea())
    const nueva = lineaVacia(cab.tarifa_nivel)
    setLineas((ls) => {
      const copia = [...ls]
      copia.splice(sel + 1, 0, nueva)
      return copia
    })
    setSel(sel + 1)
    setTimeout(() => codRefs.current.get(nueva.key)?.focus(), 50)
  }

  function eliminarLinea() {
    if (!editable || !lineaSel) return
    setLineas((ls) => {
      const copia = ls.filter((_, i) => i !== sel)
      return copia.length ? copia : [lineaVacia(cab.tarifa_nivel)]
    })
    setSel((s) => Math.max(0, Math.min(s, lineas.length - 2)))
  }

  async function aplicarArticuloBuscado(codigo: string) {
    setDialogo(null)
    let i = sel
    if (lineaSel?.articulo_codigo || lineaSel?.descripcion) {
      const nueva = lineaVacia(cab.tarifa_nivel)
      i = lineas.length
      setLineas((ls) => [...ls, nueva])
    }
    setSel(i)
    const base = lineas[i] ?? lineaVacia(cab.tarifa_nivel)
    const nueva = await lineaDesdeArticulo(base, codigo, cab.cliente_codigo, almacen)
    if (nueva) setLineas((ls) => ls.map((x, idx) => (idx === i ? nueva : x)))
  }

  async function cambiarTarifaLinea(nivel: number) {
    setDialogo(null)
    const l = lineaSel
    if (!l) return
    if (!l.articulo_codigo) return setLinea(sel, { tarifa_nivel: nivel })
    const { data: art } = await supabase.from('articulo').select('pvp').eq('codigo_interno', l.articulo_codigo).maybeSingle()
    const { precio } = await precioArticulo(l.articulo_codigo, cab.cliente_codigo, nivel, l.cantidad, art?.pvp ?? null)
    setLinea(sel, { tarifa_nivel: nivel, precio })
  }

  // ---------------- Modo ----------------

  function entrarEdicion(despues?: () => void) {
    if (modo !== 'consulta' || cab.numero == null) return
    if (cab.factura_numero != null) {
      setMensaje({ texto: 'Venta facturada: no se puede modificar (la factura es inalterable).', error: true })
      return
    }
    if (verifactu?.alta) {
      setMensaje({
        texto: 'Venta emitida (VeriFactu): no se puede modificar. Para corregirla usa «Rectificar»; si se expidió por error, «Eliminar» la anula.',
        error: true,
      })
      return
    }
    setModo('edicion')
    if (lineas.length === 0) setLineas([lineaVacia(cab.tarifa_nivel)])
    setMensaje(null)
    if (despues) setTimeout(despues, 0)
  }

  function cancelar() {
    if (modo === 'alta') {
      // Como GeminisWin: se descarta la venta vacía y se ve la última venta de la tienda
      if (modoInicial === 'alta') navigate('/ventas')
      else abrirVenta(tienda, null)
      return
    }
    if (guardadas) {
      setCab(guardadas.cab)
      setLineas(guardadas.lineas)
    }
    setModo('consulta')
    setMensaje(null)
  }

  function deshacer() {
    if (modo === 'alta') return empezarAlta(tienda)
    if (guardadas) {
      setCab(guardadas.cab)
      setLineas(guardadas.lineas.length ? guardadas.lineas : [lineaVacia(cab.tarifa_nivel)])
    }
  }

  const lineasUtiles = () => lineas.filter((l) => l.articulo_codigo || l.descripcion.trim())

  async function prepararGuardado(aplazar: boolean) {
    console.log('DBG prepararGuardado', editable, guardando, cab.cliente_codigo, almacen, lineasUtiles().length)
    if (!editable || guardando) return
    if (!cab.cliente_codigo) return setMensaje({ texto: 'Indica el cliente de la venta.', error: true })
    const utiles = lineasUtiles()
    if (utiles.length === 0) return setMensaje({ texto: 'La venta no tiene líneas.', error: true })
    if (utiles.some((l) => l.articulo_codigo && l.cantidad === 0)) return setMensaje({ texto: 'Hay líneas con cantidad 0.', error: true })
    if (!almacen) return setMensaje({ texto: 'La tienda no tiene almacén asignado.', error: true })
    if (aplazar) return guardar(true, { efectivo: 0, tarjeta: 0 })
    if (!(await cajaAbierta(tienda)))
      return setMensaje({ texto: 'No hay caja abierta en esta tienda: ábrela en Caja → Apertura de Caja antes de vender.', error: true })
    const pendiente = Math.max(Math.round((pie.total - cab.total_pagado) * 100) / 100, 0)
    if (pendiente <= 0) return guardar(false, { efectivo: 0, tarjeta: 0 })
    setDialogo({ tipo: 'pago', aplazar: false })
  }

  async function guardar(aplazar: boolean, cobro: Cobro) {
    setDialogo(null)
    setGuardando(true)
    setMensaje(null)
    try {
      const previaAplazada = guardadas?.cab.aplazada ?? false
      const numero = await guardarVenta({
        cab: { ...cab, hora: cab.hora || horaActual() },
        lineas: lineasUtiles(),
        almacen: almacen!,
        empleado: empleado?.codigo ?? null,
        aplazar,
        cobro,
        lineasPrevias: modo === 'edicion' ? (guardadas?.lineas ?? []).filter((l) => l.articulo_codigo || l.descripcion) : null,
        previaAplazada,
      })
      const texto = aplazar ? `Venta Nº ${numero} aplazada.` : `Venta Nº ${numero} guardada.`
      if (modoInicial === 'alta' && modo === 'alta') {
        await empezarAlta(tienda)
        setMensaje({ texto, error: false })
      } else {
        await abrirVenta(tienda, numero)
        setMensaje({ texto, error: false })
        if (modoInicial === 'consulta') navigate(`/ventas/${tienda}/${numero}`, { replace: true })
      }
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : String(e), error: true })
    } finally {
      setGuardando(false)
    }
  }

  async function cobrar(cobro: Cobro) {
    setDialogo(null)
    if (!(await cajaAbierta(tienda)))
      return setMensaje({ texto: 'No hay caja abierta en esta tienda: ábrela en Caja → Apertura de Caja antes de cobrar.', error: true })
    try {
      await cobrarVenta(cab, pie.total, cobro, empleado?.codigo ?? null)
      await abrirVenta(tienda, cab.numero)
      setMensaje({ texto: 'Cobro registrado.', error: false })
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : String(e), error: true })
    }
  }

  // ---------------- VeriFactu: anular y rectificar ----------------

  async function anular(motivo: string) {
    setDialogo(null)
    if (cab.numero == null) return
    try {
      await anularVenta(tienda, cab.numero, motivo)
      await abrirVenta(tienda, cab.numero)
      setMensaje({ texto: `Venta Nº ${cab.numero} anulada (registro VeriFactu de anulación generado).`, error: false })
    } catch (e) {
      setMensaje({ texto: e instanceof Error ? e.message : String(e), error: true })
    }
  }

  /** Abono que referencia la venta actual: mismas líneas en negativo, editables antes de guardar. */
  function empezarRectificativa() {
    if (!consulta || cab.numero == null || !verifactu?.alta || verifactu.anulacion) return
    const original = cab.numero
    setCab({
      ...cabeceraNueva(tienda),
      cliente_codigo: cab.cliente_codigo,
      cliente_nombre: cab.cliente_nombre,
      cliente_nif: cab.cliente_nif,
      sucursal: cab.sucursal,
      tarifa_nivel: cab.tarifa_nivel,
      empleado_codigo: empleado?.codigo ?? cab.empleado_codigo,
      descuento_pie_pct: cab.descuento_pie_pct,
      igic_pie_pct: cab.igic_pie_pct,
      observaciones: `Rectificativa de ${verifactu.alta.num_serie_factura}`,
      rectifica_tienda: tienda,
      rectifica_numero: original,
    })
    setLineas(lineas.filter((l) => l.articulo_codigo || l.descripcion.trim()).map((l) => ({ ...l, key: nuevaClave(), cantidad: -l.cantidad })))
    setGuardadas(null)
    setVerifactu(null)
    setSel(0)
    setModo('alta')
    setEmpleadoVenta(empleado)
    setMensaje({
      texto: `Rectificativa de la venta ${tienda}-${original}: deja solo las líneas a devolver o corregir (en negativo) y guarda.`,
      error: false,
    })
  }

  // ---------------- Navegación ----------------

  async function navegar(dir: 'primero' | 'anterior' | 'siguiente' | 'ultimo') {
    if (modo !== 'consulta') return
    const col = orden
    let q = supabase.from('venta').select('numero').eq('tienda_terminal_codigo', tienda)
    const asc = dir === 'primero' || dir === 'siguiente'
    if ((dir === 'anterior' || dir === 'siguiente') && cab.numero != null) {
      if (col === 'numero') q = dir === 'siguiente' ? q.gt('numero', cab.numero) : q.lt('numero', cab.numero)
      else
        q =
          dir === 'siguiente'
            ? q.or(`fecha.gt.${cab.fecha},and(fecha.eq.${cab.fecha},numero.gt.${cab.numero})`)
            : q.or(`fecha.lt.${cab.fecha},and(fecha.eq.${cab.fecha},numero.lt.${cab.numero})`)
    }
    if (col === 'fecha') q = q.order('fecha', { ascending: asc })
    const { data } = await q.order('numero', { ascending: asc }).limit(1).maybeSingle()
    if (data) {
      await abrirVenta(tienda, Number(data.numero))
      if (modoInicial === 'consulta') navigate(`/ventas/${tienda}/${data.numero}`, { replace: true })
    }
  }

  // ---------------- Teclado (como GeminisWin) ----------------

  const teclas = useRef<(e: KeyboardEvent) => void>(() => {})
  teclas.current = (e: KeyboardEvent) => {
    if (dialogo || pidiendoEmpleado) return
    // Dentro de la ventana de ventas estas teclas son suyas (Ctrl+F11 = aplazadas, no Reparaciones)
    const mia = () => {
      e.preventDefault()
      e.stopImmediatePropagation()
    }
    if (e.altKey && e.key === 'Backspace' && editable) {
      mia()
      cancelar()
    } else if (e.key === 'F1') {
      mia()
      if (editable) prepararGuardado(false)
    } else if (e.key === 'F2') {
      mia()
      window.print()
    } else if (e.key === 'F11' && e.ctrlKey) {
      mia()
      setDialogo({ tipo: 'aplazadas' })
    } else if (e.key === 'F11') {
      mia()
      if (editable) prepararGuardado(true)
    } else if (e.key === 'F12' && !e.ctrlKey) {
      mia()
      if (lineaSel?.articulo_codigo) setDialogo({ tipo: 'stock' })
    }
  }
  useEffect(() => {
    const h = (e: KeyboardEvent) => teclas.current(e)
    window.addEventListener('keydown', h, true)
    return () => window.removeEventListener('keydown', h, true)
  }, [])

  async function recuperarAplazada(numero: number) {
    setDialogo(null)
    await abrirVenta(tienda, numero)
    setModo('edicion')
    setLineas((ls) => [...ls, lineaVacia(cab.tarifa_nivel)])
  }

  async function cambiarCliente(codigo: string) {
    const r = await aplicarCliente(codigo, cab, lineas, true)
    if (r) {
      setCab(r.cab)
      setLineas(r.lineas)
      setMensaje(null)
    }
  }

  async function cambiarEmpleado() {
    await signOut()
    navigate('/login')
  }

  // ---------------- Estado ----------------

  const facturada = cab.factura_numero != null
  const emitida = verifactu?.alta != null
  const anulada = cab.anulada || verifactu?.anulacion != null
  const bloqueada = facturada || emitida
  const pendiente = cab.numero == null ? 0 : cab.total_pendiente
  const textoEstado = anulada
    ? 'Venta ANULADA.'
    : cab.rectifica_numero != null
      ? `Rectificativa de ${cab.rectifica_tienda}-${cab.rectifica_numero}.`
      : facturada
    ? 'Venta Facturada.'
    : cab.aplazada
      ? 'Venta Aplazada.'
      : cab.tipo_credito === 'Crédito'
        ? 'Venta a Crédito.'
        : 'Venta de Contado.'
  const colorEstado = facturada || cab.aplazada || anulada ? 'text-[#d01c1c]' : 'text-[#1a3fd0]'
  const avisoLinea = lineaSel?.articulo_codigo
    ? {
        texto: `${lineaSel.codigo_compra ? `CC: ${lineaSel.codigo_compra}` : '<<No tiene Cod. Compra>>'}  ${
          lineaSel.sin_control_stock ? '' : lineaSel.stock == null ? '<<Sin Stock>>' : `Stk: ${formatGw(lineaSel.stock, 3)}`
        }  UPd: ${formatGw(lineaSel.unidades_pendientes, 3)}`,
        rojo: !lineaSel.sin_control_stock && (lineaSel.stock ?? 0) - lineaSel.cantidad < 0,
      }
    : null

  if (cargando && tiendas.length === 0) return <div className="gw-label p-2">Cargando…</div>

  const filasVacias = Math.max(0, 10 - lineas.length)
  const consulta = modo === 'consulta'

  return (
    <div className="flex min-w-[1180px] flex-col gap-1 text-[16px]">
      {/* ---------- Cabecera ---------- */}
      <div className="flex gap-2">
        <div className="flex flex-col gap-1">
          <fieldset className="gw-group flex gap-1 px-1 pb-1 pt-0">
            <Campo label="Tienda" ancho={88}>
              <select
                className="gw-input !h-[30px] !text-[22px]"
                value={tienda}
                disabled={!(modo === 'alta' || (consulta && modoInicial === 'consulta'))}
                onChange={(e) => {
                  const t = e.target.value
                  setTienda(t)
                  try {
                    localStorage.setItem('tpv.tienda', t)
                  } catch {
                    /* sin almacenamiento local */
                  }
                  if (modo === 'alta') empezarAlta(t)
                  else abrirVenta(t, null)
                }}
              >
                {tiendas.map((t) => (
                  <option key={t.codigo} value={t.codigo} title={t.descripcion}>
                    {t.codigo}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label={<><u>N</u>úmero</>} ancho={172}>
              <input
                className="gw-input !h-[30px] text-right !text-[22px]"
                readOnly
                value={cab.numero ?? ''}
                placeholder={modo === 'alta' ? 'al guardar' : ''}
                title="El número se asigna al guardar la venta"
              />
            </Campo>
            <Campo label="Fecha" ancho={148}>
              <input className="gw-input !h-[30px] !text-[22px]" readOnly value={fechaES(cab.fecha)} />
            </Campo>
            <Campo label="Hora" ancho={112}>
              <input className="gw-input !h-[30px] !text-[22px]" readOnly value={cab.hora} />
            </Campo>
          </fieldset>
          <fieldset className="gw-group flex items-center gap-1 px-1 pb-1 pt-0">
            <legend className="text-[19px] font-bold leading-[18px]">Cliente</legend>
            <input
              className="gw-input !h-[30px] !w-[92px] !text-[21px]"
              value={cab.cliente_codigo}
              readOnly={!editable}
              onChange={(e) => setCab((c) => ({ ...c, cliente_codigo: e.target.value }))}
              onBlur={(e) => editable && e.target.value !== guardadas?.cab.cliente_codigo && cambiarCliente(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
            <input className="gw-input !h-[42px] !w-[408px] !text-[34px]" readOnly value={cab.cliente_nombre} title={cab.cliente_nombre} />
            <button
              type="button"
              className="gw-btn !h-[42px] !w-[94px] !text-[26px] !font-bold"
              disabled={!editable}
              title="Buscar cliente"
              onClick={() => setDialogo({ tipo: 'buscarCliente' })}
            >
              ···
            </button>
            <span className="text-[16px]">▪</span>
            <input
              className="gw-input !h-[30px] !w-[30px] text-center !text-[19px]"
              readOnly={!editable}
              value={cab.sucursal ?? '0'}
              title="Sucursal del cliente"
              onChange={(e) => setCab((c) => ({ ...c, sucursal: e.target.value === '0' || e.target.value === '' ? null : e.target.value }))}
            />
          </fieldset>
        </div>
        <fieldset className="gw-group flex flex-1 gap-2 px-1.5 pb-1.5 pt-0">
          <legend className="text-[20px] leading-[20px]">
            <u>E</u>mpleado
          </legend>
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="flex gap-1.5">
              <input className="gw-input !h-[42px] !w-[150px] !text-[30px]" readOnly value={empleadoVenta?.codigo ?? ''} />
              <button type="button" className="gw-btn !h-[52px] !flex-1 !text-[30px] !font-bold" onClick={cambiarEmpleado} title="Cerrar la sesión y entrar con otro empleado">
                Cambiar Empleado
              </button>
            </div>
            <input className="gw-input !h-[38px] !text-[28px]" readOnly value={empleadoVenta?.nombre ?? ''} />
          </div>
          <div className="relative h-[96px] w-[136px] flex-none border border-[var(--gw-border)] bg-[var(--gw-face)]">
            {empleadoVenta?.imagen_url ? (
              <img src={empleadoVenta.imagen_url} alt="" className="h-full w-full object-contain" />
            ) : (
              <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100">
                <line x1="0" y1="0" x2="100" y2="100" stroke="#8a8a8a" strokeWidth="0.6" />
                <line x1="100" y1="0" x2="0" y2="100" stroke="#8a8a8a" strokeWidth="0.6" />
              </svg>
            )}
          </div>
        </fieldset>
      </div>

      {/* ---------- Líneas ---------- */}
      <div className="h-[302px] overflow-y-auto border border-[var(--gw-border)] bg-white" title="VENTDETA">
        <table className="w-full table-fixed border-collapse text-[17px]">
          <colgroup>
            <col style={{ width: 8 }} />
            <col style={{ width: '15.5%' }} />
            <col style={{ width: '27%' }} />
            <col style={{ width: '8.5%' }} />
            <col style={{ width: '11%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '5%' }} />
            <col style={{ width: '8.5%' }} />
            <col style={{ width: '12.5%' }} />
          </colgroup>
          <thead className="sticky top-0 z-10">
            <tr className="h-[56px] bg-[var(--gw-face)] text-[19px]">
              <th className="border border-[var(--gw-border-light)]" />
              <th className="border border-[var(--gw-border-light)] px-1 text-left font-normal">Cod. Venta</th>
              <th className="border border-[var(--gw-border-light)] px-1 text-left font-normal">Descripción</th>
              <th className="border border-[var(--gw-border-light)] px-1 font-normal">Cantidad</th>
              <th className="border border-[var(--gw-border-light)] px-1 font-normal">Pvp</th>
              <th className="border border-[var(--gw-border-light)] px-1 font-normal">Dto.</th>
              <th className="border border-[var(--gw-border-light)] px-1 font-normal">Igic</th>
              <th className="border border-[var(--gw-border-light)] px-1 font-normal">Canon</th>
              <th className="border border-[var(--gw-border-light)] px-1 font-normal">Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <FilaLinea
                key={l.key}
                l={l}
                activa={i === sel}
                editable={editable}
                onSelect={() => setSel(i)}
                onChange={(p) => setLinea(i, p)}
                onCodigo={(c) => resolverCodigo(i, c)}
                codRef={(el) => {
                  if (el) codRefs.current.set(l.key, el)
                  else codRefs.current.delete(l.key)
                }}
              />
            ))}
            {Array.from({ length: filasVacias }, (_, i) => (
              <tr key={`v${i}`} className="h-[24px]">
                {Array.from({ length: 9 }, (_, j) => (
                  <td key={j} className="border border-[#e6e6e6]" />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ---------- Mini barra, aviso de línea y pie ---------- */}
      <div className="flex gap-1">
        <div className="flex w-[560px] flex-none flex-col">
          <div className="flex border border-[var(--gw-border)]">
            <MiniBtn label="Anterior" icon={<Triangle size={10} fill="currentColor" />} onClick={() => setSel((s) => Math.max(0, s - 1))} disabled={sel <= 0} />
            <MiniBtn
              label="Siguiente"
              icon={<Triangle size={10} fill="currentColor" className="rotate-180" />}
              onClick={() => setSel((s) => Math.min(lineas.length - 1, s + 1))}
              disabled={sel >= lineas.length - 1}
            />
            <MiniBtn label="Agregar" icon={<FilePlus2 size={14} />} onClick={agregarLinea} disabled={consulta && bloqueada} />
            <MiniBtn
              label="Editar"
              icon={<FilePen size={14} />}
              onClick={() => (editable ? lineaSel && codRefs.current.get(lineaSel.key)?.focus() : entrarEdicion())}
              disabled={(consulta && bloqueada) || (cab.numero == null && consulta)}
            />
            <MiniBtn label="Eliminar" icon={<FileX2 size={14} className="text-[#c42b1c]" />} onClick={eliminarLinea} disabled={!editable || !lineaSel} />
            <MiniBtn
              label="Buscar"
              icon={<Binoculars size={14} />}
              onClick={() => (editable ? setDialogo({ tipo: 'buscarArticulo' }) : setDialogo({ tipo: 'buscarVenta' }))}
            />
            <MiniBtn
              label={
                <span className="leading-[13px]">
                  Tarifa
                  <br />
                  {NIVELES[lineaSel?.tarifa_nivel ?? cab.tarifa_nivel] ?? ''}
                </span>
              }
              icon={<Tag size={14} className="text-[#2f8f3a]" />}
              onClick={() => setDialogo({ tipo: 'tarifa' })}
              disabled={!editable || !lineaSel}
            />
            <MiniBtn label="Petic." icon={<Hand size={14} className="text-[#b08a1c]" />} disabled title="Peticiones: aún no disponible en el ERP propio" />
          </div>
          <div className="mt-0.5 flex items-start gap-1">
            <button
              type="button"
              disabled={!consulta || cab.numero == null || pendiente <= 0}
              onClick={() => setDialogo({ tipo: 'cobrar' })}
              title={consulta && pendiente > 0 ? 'Pagar: cobrar lo pendiente de esta venta' : undefined}
              className={`min-w-0 flex-1 text-left text-[14px] leading-[16px] ${colorEstado} enabled:cursor-pointer enabled:hover:underline`}
            >
              {textoEstado}
              <br />
              &nbsp;Pagado: {formatGw(cab.total_pagado, 3)}. Pendiente: {formatGw(pendiente, 3)}
            </button>
            {consulta && verifactu?.alta && (
              <button
                type="button"
                className={`flex-none border px-1.5 text-[12px] leading-[15px] hover:bg-[#e5f1fb] ${
                  anulada ? 'border-[#d01c1c] text-[#d01c1c]' : 'border-[#127a12] text-[#127a12]'
                }`}
                onClick={() => setDialogo({ tipo: 'verifactu' })}
                title="Ver el registro VeriFactu: QR, huella y estado del envío a la AEAT"
              >
                <b>VERI*FACTU</b> {verifactu.alta.tipo_factura}
                <br />
                {anulada ? 'anulada' : verifactu.alta.num_serie_factura}
              </button>
            )}
          </div>
        </div>
        <div className="flex w-[368px] flex-none flex-col gap-1">
          <span className={`h-[16px] truncate text-[13px] leading-[16px] ${avisoLinea?.rojo ? 'text-[#d01c1c]' : 'text-[#1a3fd0]'}`}>{avisoLinea?.texto ?? ''}</span>
          <div className="flex items-center gap-1">
            <span className="w-[64px] text-[20px] font-bold">Dto.:</span>
            <PieNum value={cab.descuento_pie_pct} editable={editable} onChange={(v) => setCab((c) => ({ ...c, descuento_pie_pct: v }))} ancho={96} decimales={2} punto />
            <span className="text-[20px] font-bold">%</span>
            <input className="gw-input !h-[28px] !flex-1 text-right !text-[20px]" readOnly value={pie.descuento.toFixed(3)} />
          </div>
          <div className="flex items-center gap-1">
            <span className="w-[64px] text-[20px] font-bold">Igic:</span>
            <PieNum value={cab.igic_pie_pct} editable={editable} onChange={(v) => setCab((c) => ({ ...c, igic_pie_pct: v }))} ancho={96} decimales={2} punto />
            <span className="text-[20px] font-bold">%</span>
            <span className="flex-1 pr-1 text-right text-[20px] font-bold">{formatGw(pie.igic, 3)}</span>
          </div>
        </div>
        <div className="flex flex-1 flex-col items-end justify-between">
          <span className="text-[20px] font-bold" title="Suma de las líneas">
            {formatGw(pie.suma, 3)}
          </span>
          <div className="flex h-[66px] w-full items-center justify-end border border-[var(--gw-border-light)] px-3">
            <span className="text-[56px] font-bold leading-none text-[#1a3fd0]">{formatGw(pie.total, 3)} €</span>
          </div>
        </div>
      </div>

      {mensaje && (
        <p className={`text-[13px] ${mensaje.error ? 'text-[#c42b1c]' : 'text-[#127a12]'}`} role={mensaje.error ? 'alert' : 'status'}>
          {mensaje.texto}
        </p>
      )}

      {/* ---------- Barra inferior ---------- */}
      <div className="flex border border-[var(--gw-border)] bg-[var(--gw-face)] p-[2px]">
        <BarBtn label="Primero" icon={<ChevronFirst size={15} strokeWidth={3} />} onClick={() => navegar('primero')} disabled={!consulta} />
        <BarBtn label="Anterior" icon={<Play size={11} className="rotate-180" fill="currentColor" />} onClick={() => navegar('anterior')} disabled={!consulta} />
        <BarBtn label="Siguiente" icon={<Play size={11} fill="currentColor" />} onClick={() => navegar('siguiente')} disabled={!consulta} />
        <BarBtn label="Último" icon={<ChevronLast size={15} strokeWidth={3} />} onClick={() => navegar('ultimo')} disabled={!consulta} />
        <BarBtn
          label="Ordenar"
          icon={<ArrowDownAZ size={15} />}
          onClick={() => setOrden((o) => (o === 'numero' ? 'fecha' : 'numero'))}
          disabled={!consulta}
          title={`Orden actual: por ${orden === 'numero' ? 'número' : 'fecha'}`}
        />
        <BarBtn label="Buscar" icon={<Binoculars size={15} />} onClick={() => setDialogo({ tipo: 'buscarVenta' })} disabled={!consulta} />
        <BarBtn label="Listados" icon={<ScrollText size={15} className="text-[#7a6a1c]" />} disabled title="Listados de ventas: aún no disponibles en el ERP propio" />
        <BarBtn label="Imprimir" icon={<Printer size={15} />} onClick={() => window.print()} />
        {consulta ? (
          <>
            <BarBtn label="Agregar" icon={<FilePlus2 size={15} />} onClick={() => empezarAlta(tienda)} />
            <BarBtn
              label="Editar"
              icon={<FilePen size={15} />}
              onClick={() => entrarEdicion()}
              disabled={cab.numero == null || bloqueada}
              title={emitida ? 'Venta emitida (VeriFactu): no se modifica; usa «Rectificar»' : undefined}
            />
            <BarBtn
              label="Eliminar"
              icon={<FileX2 size={15} />}
              onClick={() => setDialogo({ tipo: 'anular' })}
              disabled={!emitida || anulada}
              title={
                emitida
                  ? anulada
                    ? 'La venta ya está anulada'
                    : 'Anular la venta: registro VeriFactu de anulación (no se borra)'
                  : 'Una venta no se elimina: se anula con una devolución'
              }
            />
            <BarBtn
              label="Rectificar"
              icon={<FileMinus2 size={15} />}
              onClick={empezarRectificativa}
              disabled={!emitida || anulada}
              title="Factura rectificativa (abono) que referencia esta venta"
            />
          </>
        ) : (
          <>
            <BarBtn label="Guardar" icon={<Save size={15} />} onClick={() => prepararGuardado(false)} disabled={guardando} />
            <BarBtn label="Cancelar" icon={<X size={15} />} onClick={cancelar} disabled={guardando} />
            <BarBtn label="Deshacer" icon={<Undo2 size={15} />} onClick={deshacer} disabled={guardando} />
          </>
        )}
        <BarBtn label="Cerrar" icon={<DoorOpen size={15} />} onClick={() => navigate('/')} />
      </div>
      <div className="truncate text-[11px] text-[#333]">
        {editable
          ? 'ALT+RETROCESO=>Cancelar, F1=>Guardar, F2=>Imprimir, F11=>Aplazar, CTRL+F11=>Aplazadas, F12=>Ver Stock'
          : 'F2=>Imprimir, CTRL+F11=>Aplazadas, F12=>Ver Stock'}
      </div>

      <VentaTicket empresa={empresa} cab={cab} lineas={lineas} pie={pie} verifactu={verifactu} />

      {/* ---------- Diálogos ---------- */}
      {pidiendoEmpleado && (
        <EmpleadoDialog
          empleado={empleado}
          email={session?.user.email ?? null}
          onOk={() => setPidiendoEmpleado(false)}
          onCancel={() => {
            setPidiendoEmpleado(false)
            navigate('/ventas')
          }}
          onCambiarEmpleado={cambiarEmpleado}
        />
      )}
      {dialogo?.tipo === 'pago' && (
        <PagoDialog
          titulo="Pagar"
          pendiente={Math.max(Math.round((pie.total - cab.total_pagado) * 100) / 100, 0)}
          onOk={(c) => guardar(false, c)}
          onCancel={() => setDialogo(null)}
        />
      )}
      {dialogo?.tipo === 'cobrar' && <PagoDialog titulo={`Pagos de la venta ${cab.tienda}-${cab.numero}`} pendiente={pendiente} onOk={cobrar} onCancel={() => setDialogo(null)} />}
      {dialogo?.tipo === 'aplazadas' && <AplazadasDialog tienda={tienda} onPick={recuperarAplazada} onClose={() => setDialogo(null)} />}
      {dialogo?.tipo === 'stock' && lineaSel?.articulo_codigo && (
        <StockDialog articulo={lineaSel.articulo_codigo} descripcion={lineaSel.descripcion} onClose={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === 'tarifa' && <TarifaDialog actual={lineaSel?.tarifa_nivel ?? cab.tarifa_nivel} onPick={cambiarTarifaLinea} onClose={() => setDialogo(null)} />}
      {dialogo?.tipo === 'verifactu' && verifactu && <VerifactuDialog verifactu={verifactu} onClose={() => setDialogo(null)} />}
      {dialogo?.tipo === 'anular' && cab.numero != null && (
        <AnularVentaDialog venta={`${tienda}-${cab.numero}`} onOk={anular} onCancel={() => setDialogo(null)} />
      )}
      {dialogo?.tipo === 'aviso' && <AvisoDialog titulo="Aviso al vender a este cliente" texto={dialogo.texto} onClose={() => setDialogo(null)} />}
      {dialogo?.tipo === 'buscarVenta' && (
        <GwLookupDialog<{ numero: number }>
          title="Buscar venta"
          table="venta"
          columns={COLS_VENTA}
          searchColumns={BUSCA_VENTA}
          orderBy="numero"
          keyColumn="numero"
          onClose={() => setDialogo(null)}
          onPick={async (r) => {
            setDialogo(null)
            await abrirVenta(tienda, Number(r.numero))
            if (modoInicial === 'consulta') navigate(`/ventas/${tienda}/${r.numero}`, { replace: true })
          }}
        />
      )}
      {dialogo?.tipo === 'buscarCliente' && (
        <GwLookupDialog<{ codigo: string }>
          title="Buscar cliente"
          table="cliente"
          columns={COLS_CLIENTE}
          searchColumns={BUSCA_CLIENTE}
          orderBy="nombre"
          keyColumn="codigo"
          onClose={() => setDialogo(null)}
          onPick={(r) => {
            setDialogo(null)
            cambiarCliente(r.codigo)
          }}
        />
      )}
      {dialogo?.tipo === 'buscarArticulo' && (
        <GwLookupDialog<{ codigo_interno: string }>
          title="Buscar artículo"
          table="articulo"
          columns={COLS_ARTICULO}
          searchColumns={BUSCA_ARTICULO}
          orderBy="descripcion"
          keyColumn="codigo_interno"
          onClose={() => setDialogo(null)}
          onPick={(r) => aplicarArticuloBuscado(r.codigo_interno)}
        />
      )}
    </div>
  )
}

function Campo({ label, ancho, children }: { label: ReactNode; ancho: number; children: ReactNode }) {
  return (
    <div className="flex flex-col" style={{ width: ancho }}>
      <span className="pl-0.5 text-[20px] leading-[22px]">{label}</span>
      {children}
    </div>
  )
}

function PieNum({
  value,
  editable,
  onChange,
  ancho,
  decimales,
  punto,
}: {
  value: number
  editable: boolean
  onChange: (v: number) => void
  ancho: number
  decimales: number
  punto?: boolean
}) {
  const [txt, setTxt] = useState<string | null>(null)
  const mostrado = txt ?? (punto ? value.toFixed(decimales) : formatGw(value, decimales))
  return (
    <input
      className="gw-input !h-[28px] text-right !text-[20px]"
      style={{ width: ancho }}
      readOnly={!editable}
      value={mostrado}
      onFocus={() => editable && setTxt(String(value))}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        if (txt == null) return
        const n = Number(txt.replace(',', '.'))
        setTxt(null)
        if (!Number.isNaN(n)) onChange(n)
      }}
    />
  )
}

function FilaLinea({
  l,
  activa,
  editable,
  onSelect,
  onChange,
  onCodigo,
  codRef,
}: {
  l: LineaVenta
  activa: boolean
  editable: boolean
  onSelect: () => void
  onChange: (p: Partial<LineaVenta>) => void
  onCodigo: (c: string) => void
  codRef: (el: HTMLInputElement | null) => void
}) {
  const td = 'border border-[#e6e6e6] px-1 h-[24px] overflow-hidden whitespace-nowrap'
  const inp = 'h-[22px] w-full bg-transparent px-0.5 text-[17px] outline-none focus:bg-[#fffbe0]'
  const num = (campo: 'cantidad' | 'precio' | 'descuento_pct' | 'igic_pct', dec: number) =>
    editable ? (
      <NumCelda value={l[campo]} dec={dec} onChange={(v) => onChange({ [campo]: v } as Partial<LineaVenta>)} />
    ) : (
      formatGw(l[campo], dec)
    )
  return (
    <tr className={`h-[24px] ${activa ? 'bg-[#dbe8f7]' : ''}`} onClick={onSelect} onFocus={onSelect}>
      <td className="border border-[#e6e6e6] text-center text-[10px]">{activa ? '▸' : ''}</td>
      <td className={td}>
        {editable ? (
          <input
            ref={codRef}
            className={inp}
            value={l.codigo_venta}
            onChange={(e) => onChange({ codigo_venta: e.target.value })}
            onBlur={(e) => onCodigo(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onCodigo((e.target as HTMLInputElement).value)}
          />
        ) : (
          l.codigo_venta
        )}
      </td>
      <td className={td} title={l.descripcion}>
        {editable ? <input className={inp} value={l.descripcion} onChange={(e) => onChange({ descripcion: e.target.value })} /> : l.descripcion}
      </td>
      <td className={`${td} text-right`}>{num('cantidad', 2)}</td>
      <td className={`${td} text-right`}>{num('precio', 3)}</td>
      <td className={`${td} text-right`}>{num('descuento_pct', 2)}</td>
      <td className={`${td} text-right`}>{num('igic_pct', 1)}</td>
      <td className={`${td} text-right`}>{formatGw(canonLinea(l), 3)}</td>
      <td className={`${td} text-right`} title={`Base ${formatGw(baseLinea(l), 3)}`}>
        {formatGw(subtotalLinea(l), 3)}
      </td>
    </tr>
  )
}

function NumCelda({ value, dec, onChange }: { value: number; dec: number; onChange: (v: number) => void }) {
  const [txt, setTxt] = useState<string | null>(null)
  return (
    <input
      className="h-[22px] w-full bg-transparent px-0.5 text-right text-[17px] outline-none focus:bg-[#fffbe0]"
      value={txt ?? formatGw(value, dec)}
      onFocus={() => setTxt(String(value).replace('.', ','))}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        if (txt == null) return
        const n = Number(txt.replace(/\./g, '').replace(',', '.'))
        setTxt(null)
        if (!Number.isNaN(n)) onChange(n)
      }}
      onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
    />
  )
}

function MiniBtn({ label, icon, onClick, disabled, title }: { label: ReactNode; icon: ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex h-[52px] flex-1 flex-col items-center justify-end gap-1 border-r border-[var(--gw-border-light)] pb-0.5 text-[13px] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#9a9a9a] disabled:hover:bg-transparent [&>span]:text-[#222] disabled:[&>span]:text-[#9a9a9a]"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function BarBtn({ label, icon, onClick, disabled, title }: { label: string; icon: ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title ?? label}
      className="flex h-[58px] flex-1 flex-col items-center justify-center gap-2 border-r border-[var(--gw-border-light)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent [&>span]:text-[14px] [&>span]:text-[#222] disabled:[&>span]:text-[#a8a8a8]"
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}
