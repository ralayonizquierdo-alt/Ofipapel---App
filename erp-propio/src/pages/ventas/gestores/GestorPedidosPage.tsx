import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowDownAZ, Binoculars, Check, ChevronFirst, ChevronLast, DoorOpen, Link2, PackageCheck, Play, Printer, RefreshCw, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { avisoTope, todasLasFilas } from '../../../lib/todasLasFilas'
import { formatGw } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import {
  BarButton,
  BigTabs,
  BIG_INPUT,
  borrarOpciones,
  fechaEs,
  FiltroBar,
  filtroInicial,
  guardarOpciones,
  leerOpciones,
  LocalizarDialog,
  OptionButton,
  pitido,
  procesosIniciales,
  ProcesosGroup,
  chunks,
  conFiltro,
  nombreCliente,
  useRefresco,
  type Filtro,
  type Procesos,
} from './comun'
import { ordenar, Rejilla, type Col, type Orden } from './rejilla'

const CLAVE_OPCIONES = 'gw.gestorPedidos.opciones'

/** Máximo de pedidos (y de peticiones) que trae el gestor; si hay más, avisa de que se afine el filtro. */
const TOPE_PEDIDOS = 5000

interface Opciones {
  mostrarLiquidacion: boolean
  modal: boolean
  refrescoAuto: boolean
  segundos: number
  colorearChequeo: boolean
  colorearRuta: boolean
  procesos: Procesos
}

const OPCIONES_DEFECTO: Opciones = {
  mostrarLiquidacion: false,
  modal: false,
  refrescoAuto: false,
  segundos: 0,
  colorearChequeo: true,
  colorearRuta: true,
  procesos: procesosIniciales,
}

interface PedidoRow {
  key: string
  tienda: string
  numero: number
  web: number | null
  estado: string
  liquidado: number
  fecha: string | null
  hora: string | null
  ruta: string | null
  cliente: string | null
  nombre: string
  ptPd: boolean
  ptRs: boolean
  comprobado: boolean
}

interface LineaRow {
  key: string
  ruta: string | null
  codigoVenta: string | null
  descripcion: string
  ok: boolean
  ub1: string | null
  ub2: string | null
  cantidad: number
  liquidada: number
  liq: boolean
  tienda: string
  numero: number
  cliente: string | null
  nombre: string
  fecha: string | null
}

interface PeticionRow {
  key: string
  estado: string
  articulo: string | null
  descripcion: string
  cantidad: number
  tramitada: number
  prevista: string | null
  proveedor: string
  pedidoProveedor: string
  cliente: string
  tienda: string
  numero: number
  fecha: string | null
}

const PALETA_RUTAS = ['#a77cf2', '#7fd3c3', '#f2b37c', '#7cb6f2', '#f27cb0', '#c3d37f', '#f2e07c', '#b3a6e0', '#7cf2a5', '#e0a6a6']

function colorRuta(ruta: string | null) {
  if (!ruta) return undefined
  const n = Number.parseInt(ruta, 10)
  const i = Number.isNaN(n) ? [...ruta].reduce((s, c) => s + c.charCodeAt(0), 0) : n - 1
  return PALETA_RUTAS[((i % PALETA_RUTAS.length) + PALETA_RUTAS.length) % PALETA_RUTAS.length]
}

function colorEstadoPeticion(estado: string): { background: string; color: string } | undefined {
  const e = estado.toLowerCase()
  if (e.includes('parcial')) return { background: '#9a8be0', color: '#000' }
  if (e.includes('entregad')) return { background: '#8a4fd0', color: '#fff' }
  if (e.includes('pendiente')) return { background: '#b8f0d8', color: '#000' }
  if (e.includes('resuelt')) return { background: '#1f7fc2', color: '#fff' }
  if (e.includes('atendid')) return { background: '#12bcd4', color: '#fff' }
  if (e.includes('tramitad')) return { background: '#c23fc8', color: '#fff' }
  return undefined
}

const ESTADOS_PETICION = ['Pendiente', 'Atendida', 'Tramitada', 'Tramit. Parcial', 'Resuelta', 'Entregada']

function Marca({ ok }: { ok: boolean }) {
  return (
    <span className="mx-auto flex h-[22px] w-[40px] items-center justify-center border border-[var(--gw-border)] bg-[#f0f0f0]">
      {ok ? <Check size={14} strokeWidth={3} className="text-[#2a9d2a]" /> : <X size={14} strokeWidth={3} className="text-[#c42b1c]" />}
    </span>
  )
}

const CAMPOS_FECHA = [
  { value: 'fecha', label: 'Fecha' },
  { value: 'fecha_entrega', label: 'Fecha de Entrega' },
  { value: 'actualizado_en', label: 'Última Modificación' },
]

export function GestorPedidosPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('seguimiento')
  const [filtro, setFiltro] = useState<Filtro>(() => filtroInicial('fecha', 'El Mes pasado y actual'))
  const aplicado = useRef<Filtro>(filtro)
  const [opciones, setOpciones] = useState<Opciones>(() => leerOpciones(CLAVE_OPCIONES, OPCIONES_DEFECTO))
  const [msgOpciones, setMsgOpciones] = useState('')

  const [pedidos, setPedidos] = useState<PedidoRow[]>([])
  const [lineas, setLineas] = useState<LineaRow[]>([])
  const [peticiones, setPeticiones] = useState<PeticionRow[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [nuevos, setNuevos] = useState<string[]>([])
  const conocidos = useRef<Set<string> | null>(null)

  const [selP, setSelP] = useState(0)
  const [selL, setSelL] = useState(0)
  const [selT, setSelT] = useState(0)
  const [ordP, setOrdP] = useState<Orden | null>(null)
  const [ordL, setOrdL] = useState<Orden | null>(null)
  const [ordT, setOrdT] = useState<Orden | null>(null)
  const [localizar, setLocalizar] = useState(false)
  const [estadoPet, setEstadoPet] = useState('')
  const [proveedorPet, setProveedorPet] = useState('')
  const [buscarProveedor, setBuscarProveedor] = useState(false)

  const cargar = useCallback(async (f: Filtro) => {
    setCargando(true)
    setError(null)
    const conHora = f.campo === 'actualizado_en'
    const base = () =>
      supabase
        .from('pedido_cliente')
        .select('tienda_terminal_codigo, numero, web_pedido_id, liquidado, fecha, hora, ruta_codigo, cliente_codigo, nombre_cliente, almacen_codigo, cliente:cliente_codigo(nombre)')
        .eq('es_presupuesto', false)
        .eq('es_reparacion', false)
        .eq('anulado', false)
    // Supabase corta cada respuesta en 1000 filas: se pide por bloques, con tope y aviso.
    const { data: cabs, error: e1, cortado } = await todasLasFilas(
      () => conFiltro(base(), f, f.campo, conHora).order('fecha').order('hora').order('tienda_terminal_codigo').order('numero'),
      { tope: TOPE_PEDIDOS },
    )
    if (e1) {
      setError(e1)
      setCargando(false)
      return
    }
    setAviso(cortado ? avisoTope(TOPE_PEDIDOS) : null)
    const numeros = [...new Set(cabs.map((c) => c.numero))]
    const lin: {
      tienda_terminal_codigo: string
      numero: number
      numero_linea: number
      articulo_codigo: string | null
      codigo_venta: string | null
      descripcion: string | null
      cantidad: number | null
      unidades_liquidadas: number | null
      liquidacion_comprobada: boolean | null
      almacen_codigo: string | null
      ubicacion: string | null
    }[] = []
    for (const parte of chunks(numeros)) {
      const { data } = await todasLasFilas(() =>
        supabase
          .from('pedido_cliente_linea')
          .select('tienda_terminal_codigo, numero, numero_linea, articulo_codigo, codigo_venta, descripcion, cantidad, unidades_liquidadas, liquidacion_comprobada, almacen_codigo, ubicacion')
          .in('numero', parte)
          .order('tienda_terminal_codigo')
          .order('numero')
          .order('numero_linea'),
      )
      lin.push(...data)
    }
    const claves = new Set(cabs.map((c) => `${c.tienda_terminal_codigo}/${c.numero}`))
    const lineasPed = lin.filter((l) => claves.has(`${l.tienda_terminal_codigo}/${l.numero}`))

    const arts = [...new Set(lineasPed.map((l) => l.articulo_codigo).filter((a): a is string => !!a))]
    const stock = new Map<string, { disp: number; ub1: string | null; ub2: string | null }>()
    for (const parte of chunks(arts)) {
      const { data } = await todasLasFilas(() =>
        supabase
          .from('articulo_almacen_stock')
          .select('articulo_codigo, almacen_codigo, cantidad_actual, cantidad_reservada, cantidad_disponible, ubicacion_1, ubicacion_2')
          .in('articulo_codigo', parte)
          .order('articulo_codigo')
          .order('almacen_codigo'),
      )
      for (const s of data) {
        const disp = s.cantidad_disponible ?? Number(s.cantidad_actual ?? 0) - Number(s.cantidad_reservada ?? 0)
        stock.set(`${s.articulo_codigo}|${s.almacen_codigo}`, { disp: Number(disp), ub1: s.ubicacion_1, ub2: s.ubicacion_2 })
      }
    }

    const porPedido = new Map<string, typeof lineasPed>()
    for (const l of lineasPed) {
      const k = `${l.tienda_terminal_codigo}/${l.numero}`
      porPedido.set(k, [...(porPedido.get(k) ?? []), l])
    }

    const filasP: PedidoRow[] = cabs.map((c) => {
      const key = `${c.tienda_terminal_codigo}/${c.numero}`
      const ls = porPedido.get(key) ?? []
      let ptPd = false
      let ptRs = false
      let algunaLiq = false
      const liq = Number(c.liquidado ?? 0)
      for (const l of liq === 5 ? [] : ls) {
        const pendiente = Number(l.cantidad ?? 0) - Number(l.unidades_liquidadas ?? 0)
        if (Number(l.unidades_liquidadas ?? 0) > 0) algunaLiq = true
        if (!l.articulo_codigo || pendiente <= 0) continue
        const s = stock.get(`${l.articulo_codigo}|${l.almacen_codigo ?? c.almacen_codigo}`)
        if (!s || s.disp < pendiente) ptPd = true
        else ptRs = true
      }
      const estado = liq === 5 ? 'Liquidado' : liq > 0 || algunaLiq ? 'Liq. Frag. Pend.' : 'Pendiente'
      return {
        key,
        tienda: c.tienda_terminal_codigo,
        numero: c.numero,
        web: c.web_pedido_id,
        estado,
        liquidado: liq,
        fecha: c.fecha,
        hora: c.hora,
        ruta: c.ruta_codigo,
        cliente: c.cliente_codigo,
        nombre: nombreCliente(c),
        ptPd,
        ptRs,
        comprobado: ls.length > 0 && ls.every((l) => !!l.liquidacion_comprobada),
      }
    })

    const cabPorClave = new Map(filasP.map((p) => [p.key, p]))
    const filasL: LineaRow[] = lineasPed
      .filter((l) => Number(l.cantidad ?? 0) - Number(l.unidades_liquidadas ?? 0) > 0)
      .map((l) => {
        const p = cabPorClave.get(`${l.tienda_terminal_codigo}/${l.numero}`)
        const s = l.articulo_codigo ? stock.get(`${l.articulo_codigo}|${l.almacen_codigo ?? ''}`) : undefined
        return {
          key: `${l.tienda_terminal_codigo}/${l.numero}/${l.numero_linea}`,
          ruta: p?.ruta ?? null,
          codigoVenta: l.codigo_venta ?? l.articulo_codigo,
          descripcion: l.descripcion ?? '',
          ok: !!l.liquidacion_comprobada,
          ub1: s?.ub1 ?? l.ubicacion,
          ub2: s?.ub2 ?? null,
          cantidad: Number(l.cantidad ?? 0),
          liquidada: Number(l.unidades_liquidadas ?? 0),
          liq: Number(l.unidades_liquidadas ?? 0) >= Number(l.cantidad ?? 0),
          tienda: l.tienda_terminal_codigo,
          numero: l.numero,
          cliente: p?.cliente ?? null,
          nombre: p?.nombre ?? '',
          fecha: p?.fecha ?? null,
        }
      })

    // Artículos en peticiones
    const basePet = () =>
      supabase
        .from('peticion')
        .select('tienda_terminal_codigo, numero, estado, fecha_hora, articulo_codigo, descripcion, cantidad, cantidad_tramitada, fecha_prevista_entrega, proveedor_codigo, origen_nombre, origen_cliente_codigo')
    const { data: pets, cortado: petCortado } = await todasLasFilas(
      () =>
        conFiltro(basePet(), f, 'fecha_hora', true)
          .order('fecha_hora', { ascending: false })
          .order('tienda_terminal_codigo')
          .order('numero'),
      { tope: TOPE_PEDIDOS },
    )
    if (petCortado) setAviso(avisoTope(TOPE_PEDIDOS))
    const numerosPet = [...new Set((pets ?? []).map((p) => p.numero))]
    const tram = new Map<string, { ped: string; prov: string | null }>()
    for (const parte of chunks(numerosPet)) {
      const { data } = await todasLasFilas(() =>
        supabase
          .from('peticion_tramitacion')
          .select('tienda_terminal_codigo, numero, pedido_proveedor_tienda_codigo, pedido_proveedor_numero, proveedor_codigo, fecha_hora')
          .in('numero', parte)
          .order('fecha_hora')
          .order('tienda_terminal_codigo')
          .order('numero'),
      )
      for (const t of data) {
        if (t.pedido_proveedor_numero == null) continue
        tram.set(`${t.tienda_terminal_codigo}/${t.numero}`, {
          ped: `${t.pedido_proveedor_tienda_codigo ?? ''}/${t.pedido_proveedor_numero}`,
          prov: t.proveedor_codigo,
        })
      }
    }
    const provs = [...new Set([...(pets ?? []).map((p) => p.proveedor_codigo), ...[...tram.values()].map((t) => t.prov)].filter((x): x is string => !!x))]
    const nomProv = new Map<string, string>()
    for (const parte of chunks(provs)) {
      const { data } = await supabase.from('proveedor').select('codigo, nombre').in('codigo', parte)
      for (const p of data ?? []) nomProv.set(p.codigo, p.nombre)
    }
    const filasT: PeticionRow[] = (pets ?? []).map((p) => {
      const k = `${p.tienda_terminal_codigo}/${p.numero}`
      const t = tram.get(k)
      const prov = t?.prov ?? p.proveedor_codigo
      return {
        key: k,
        estado: p.estado ?? '',
        articulo: p.articulo_codigo,
        descripcion: p.descripcion ?? '',
        cantidad: Number(p.cantidad ?? 0),
        tramitada: Number(p.cantidad_tramitada ?? 0),
        prevista: p.fecha_prevista_entrega,
        proveedor: prov ? `${prov} ${nomProv.get(prov) ?? ''}`.trim() : '',
        pedidoProveedor: t?.ped ?? '',
        cliente: p.origen_nombre ?? p.origen_cliente_codigo ?? '',
        tienda: p.tienda_terminal_codigo,
        numero: p.numero,
        fecha: p.fecha_hora,
      }
    })

    // Detección de pedidos nuevos entre refrescos
    const ahora = new Set(filasP.map((p) => p.key))
    if (conocidos.current) {
      const llegados = [...ahora].filter((k) => !conocidos.current!.has(k))
      if (llegados.length) {
        setNuevos((n) => [...n, ...llegados.filter((k) => !n.includes(k))])
        pitido()
      }
      llegados.forEach((k) => conocidos.current!.add(k))
    } else conocidos.current = ahora

    setPedidos(filasP)
    setLineas(filasL)
    setPeticiones(filasT)
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar(aplicado.current)
  }, [cargar])

  useRefresco(opciones.refrescoAuto, opciones.segundos, () => cargar(aplicado.current))

  function aplicar() {
    aplicado.current = filtro
    conocidos.current = null
    setNuevos([])
    setSelP(0)
    setSelL(0)
    setSelT(0)
    cargar(filtro)
  }

  const colsP: Col<PedidoRow>[] = useMemo(
    () => [
      { key: 'tienda', label: 'Ti.', width: 68, value: (r) => r.tienda },
      { key: 'numero', label: 'Id Ped.', width: 112, align: 'right', value: (r) => r.numero, render: (r) => formatGw(r.numero, 0) },
      { key: 'web', label: 'Id Web', width: 95, align: 'right', value: (r) => r.web },
      { key: 'estado', label: 'Estado Liquidac.', width: 210, value: (r) => r.estado, title: 'Estado deducido de LIQUIDADO (5 = liquidado) y de las unidades liquidadas; confirmar textos con Luis' },
      { key: 'fecha', label: 'Fecha', width: 145, value: (r) => r.fecha, render: (r) => fechaEs(r.fecha) },
      { key: 'hora', label: 'Hora', width: 90, value: (r) => r.hora },
      { key: 'ruta', label: 'Ruta', width: 66, value: (r) => r.ruta },
      {
        key: 'ptpd',
        label: 'Pt.Pd.',
        width: 75,
        value: (r) => (r.ptPd ? 'Si' : 'No'),
        cellStyle: (r) => (r.ptPd ? { background: '#ff0000', color: '#000' } : undefined),
        title: 'Pendientes de pedir: alguna línea sin stock disponible suficiente en su almacén (confirmar criterio con Luis)',
      },
      { key: 'ptrs', label: 'Pt.Rs.', width: 78, value: (r) => (r.ptRs ? 'Si' : 'No'), title: 'Reservados: alguna línea pendiente cubierta por el stock disponible (confirmar criterio con Luis)' },
      { key: 'cliente', label: 'Id Cliente', width: 120, value: (r) => r.cliente },
      { key: 'nombre', label: 'Nombre Cliente', width: 330, value: (r) => r.nombre },
    ],
    [],
  )

  const colsL: Col<LineaRow>[] = useMemo(
    () => [
      { key: 'ruta', label: 'Ruta', width: 82, value: (r) => r.ruta },
      { key: 'codigoVenta', label: 'Cód. Venta', width: 165, value: (r) => r.codigoVenta },
      { key: 'descripcion', label: 'Descripción Articulo', width: 500, value: (r) => r.descripcion },
      { key: 'ok', label: 'Ok', width: 46, align: 'center', value: (r) => (r.ok ? 1 : 0), render: (r) => <Marca ok={r.ok} /> },
      { key: 'ub1', label: 'Ub.1', width: 68, value: (r) => r.ub1 },
      { key: 'ub2', label: 'Ub.2', width: 68, value: (r) => r.ub2 },
      { key: 'cantidad', label: 'Cant. Ped.', width: 158, align: 'right', value: (r) => r.cantidad, render: (r) => formatGw(r.cantidad, 3) },
      { key: 'liquidada', label: 'Cant. Liquid.', width: 158, align: 'right', value: (r) => r.liquidada, render: (r) => formatGw(r.liquidada, 3) },
      { key: 'liq', label: 'Liq.', width: 58, align: 'center', value: (r) => (r.liq ? 1 : 0), render: (r) => <Marca ok={r.liq} /> },
      { key: 'tienda', label: 'Ti.', width: 50, value: (r) => r.tienda },
      { key: 'numero', label: 'Id Ped.', width: 110, align: 'right', value: (r) => r.numero, render: (r) => formatGw(r.numero, 0) },
      { key: 'cliente', label: 'Id Cliente', width: 110, value: (r) => r.cliente },
      { key: 'nombre', label: 'Nombre Cliente', width: 300, value: (r) => r.nombre },
      { key: 'fecha', label: 'Fecha', width: 130, value: (r) => r.fecha, render: (r) => fechaEs(r.fecha) },
    ],
    [],
  )

  const colsT: Col<PeticionRow>[] = useMemo(
    () => [
      { key: 'estado', label: 'Estado', width: 190, value: (r) => r.estado },
      { key: 'articulo', label: 'Cod. Artículo', width: 165, value: (r) => r.articulo },
      { key: 'descripcion', label: 'Descripción', width: 665, value: (r) => r.descripcion },
      { key: 'cantidad', label: 'Cantidad', width: 125, align: 'right', value: (r) => r.cantidad, render: (r) => formatGw(r.cantidad, 2) },
      { key: 'tramitada', label: 'Cant. Tram.', width: 148, align: 'right', value: (r) => r.tramitada, render: (r) => formatGw(r.tramitada, 2) },
      { key: 'prevista', label: 'F. Prev.', width: 125, value: (r) => r.prevista, render: (r) => fechaEs(r.prevista) },
      { key: 'proveedor', label: 'Proveedor', width: 260, value: (r) => r.proveedor },
      { key: 'pedidoProveedor', label: 'Ped. Prov.', width: 130, value: (r) => r.pedidoProveedor },
      { key: 'cliente', label: 'Cliente', width: 260, value: (r) => r.cliente },
      { key: 'tienda', label: 'Ti.', width: 50, value: (r) => r.tienda },
      { key: 'numero', label: 'Nº Pet.', width: 100, align: 'right', value: (r) => r.numero, render: (r) => formatGw(r.numero, 0) },
    ],
    [],
  )

  const filasP = useMemo(() => ordenar(pedidos, colsP, ordP), [pedidos, colsP, ordP])
  const filasL = useMemo(() => ordenar(lineas, colsL, ordL), [lineas, colsL, ordL])
  const filasT = useMemo(
    () =>
      ordenar(
        peticiones.filter(
          (p) =>
            (!estadoPet || p.estado.toLowerCase() === estadoPet.toLowerCase()) &&
            (!proveedorPet || p.proveedor.startsWith(proveedorPet)),
        ),
        colsT,
        ordT,
      ),
    [peticiones, colsT, ordT, estadoPet, proveedorPet],
  )

  function editarPedido() {
    let t: string | undefined
    let n: number | undefined
    if (tab === 'articulos' && filasL[selL]) ({ tienda: t, numero: n } = filasL[selL])
    else if (filasP[selP]) ({ tienda: t, numero: n } = filasP[selP])
    if (t == null || n == null) return
    const k = `${t}/${n}`
    setNuevos((v) => v.filter((x) => x !== k))
    navigate(`/pedidos/${encodeURIComponent(t)}/${n}${opciones.mostrarLiquidacion ? '?liquidacion=1' : ''}`)
  }

  const grid = tab === 'articulos' ? { sel: selL, set: setSelL, n: filasL.length, ord: ordL, setOrd: setOrdL, first: colsL[0].key } : tab === 'peticiones' ? { sel: selT, set: setSelT, n: filasT.length, ord: ordT, setOrd: setOrdT, first: colsT[0].key } : { sel: selP, set: setSelP, n: filasP.length, ord: ordP, setOrd: setOrdP, first: colsP[0].key }

  function buscarEnRejilla(texto: string) {
    const t = texto.trim().toLowerCase()
    if (!t) return false
    const lista: { cols: Col<never>[]; rows: unknown[] } =
      tab === 'articulos'
        ? { cols: colsL as unknown as Col<never>[], rows: filasL }
        : tab === 'peticiones'
          ? { cols: colsT as unknown as Col<never>[], rows: filasT }
          : { cols: colsP as unknown as Col<never>[], rows: filasP }
    const n = lista.rows.length
    for (let k = 1; k <= n; k++) {
      const i = (grid.sel + k) % n
      const r = lista.rows[i] as never
      if (lista.cols.some((c) => String(c.value(r) ?? '').toLowerCase().includes(t))) {
        grid.set(i)
        return true
      }
    }
    return false
  }

  const nav = (
    <>
      <BarButton title="Primero" className="w-[105px]" disabled={!grid.n} onClick={() => grid.set(0)}>
        <ChevronFirst size={18} strokeWidth={3} />
      </BarButton>
      <BarButton title="Anterior" className="w-[105px]" disabled={!grid.n} onClick={() => grid.set(Math.max(grid.sel - 1, 0))}>
        <Play size={12} className="rotate-180" fill="currentColor" />
      </BarButton>
      <BarButton title="Siguiente" className="w-[105px]" disabled={!grid.n} onClick={() => grid.set(Math.min(grid.sel + 1, grid.n - 1))}>
        <Play size={12} fill="currentColor" />
      </BarButton>
      <BarButton title="Último" className="w-[105px]" disabled={!grid.n} onClick={() => grid.set(grid.n - 1)}>
        <ChevronLast size={18} strokeWidth={3} />
      </BarButton>
      <BarButton title="Buscar (Localizar registros)" className="w-[105px]" disabled={!grid.n} onClick={() => setLocalizar(true)}>
        <Binoculars size={17} />
      </BarButton>
      <BarButton
        title="Ordenar"
        className="w-[105px]"
        disabled={!grid.n}
        onClick={() => grid.setOrd(grid.ord ? { ...grid.ord, asc: !grid.ord.asc } : { key: grid.first, asc: true })}
      >
        <ArrowDownAZ size={17} />
      </BarButton>
      <BarButton title="Imprimir" className="w-[105px]" onClick={() => window.print()}>
        <Printer size={17} />
      </BarButton>
    </>
  )

  const salir = (
    <BarButton title="Salir" className="ml-auto w-[105px]" onClick={() => navigate('/')}>
      <DoorOpen size={18} />
    </BarButton>
  )

  const setOp = (p: Partial<Opciones>) => setOpciones((o) => ({ ...o, ...p }))

  return (
    <div className="flex h-full min-h-0 flex-col">
      <BigTabs
        tabs={[
          { key: 'seguimiento', label: 'Seguimiento de Pedidos' },
          { key: 'articulos', label: 'Artículos de los Pedidos' },
          { key: 'peticiones', label: 'Artículos en Peticiones' },
          { key: 'opciones', label: 'Opciones del Seguimiento' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 border border-[var(--gw-border)] bg-[var(--gw-face)] p-1.5">
        {nuevos.length > 0 && tab !== 'opciones' && (
          <div className="flex flex-none items-center gap-2 border border-[#c9a400] bg-[#fff3a0] px-2 py-1 text-[16px] font-bold">
            <span className="flex-1 truncate">
              Han entrado {nuevos.length} pedido{nuevos.length === 1 ? '' : 's'} nuevo{nuevos.length === 1 ? '' : 's'}: {nuevos.slice(0, 8).join(', ')}
              {nuevos.length > 8 ? '…' : ''}
            </span>
            <button type="button" className="gw-btn" onClick={() => setNuevos([])}>
              Visto
            </button>
          </div>
        )}
        {error && <div className="flex-none text-[14px] text-[#c42b1c]">{error}</div>}
        {aviso && !error && <div className="flex-none text-[14px] font-bold text-[#c42b1c]">{aviso}</div>}

        {tab === 'seguimiento' && (
          <>
            <FiltroBar filtro={filtro} onChange={setFiltro} campos={CAMPOS_FECHA}>
              <button type="button" className="gw-btn h-[62px]! w-full text-[20px]!" onClick={aplicar} disabled={cargando}>
                <Check size={16} strokeWidth={3} className="text-[#2a9d2a]" />
                {cargando ? 'Buscando…' : 'Aplicar'}
              </button>
              <button type="button" className="gw-btn h-[62px]! w-full text-[20px]! leading-[22px]" disabled={!filasP[selP]} onClick={editarPedido}>
                Editar
                <br />
                Pedido
              </button>
            </FiltroBar>
            <Rejilla
              rows={filasP}
              cols={colsP}
              rowKey={(r) => r.key}
              sel={selP}
              onSel={setSelP}
              onOpen={editarPedido}
              orden={ordP}
              onOrden={setOrdP}
              vacias={11}
              rowStyle={(r) =>
                nuevos.includes(r.key)
                  ? { background: '#fff3a0', fontWeight: 700 }
                  : opciones.colorearChequeo
                    ? r.liquidado === 5
                      ? { background: '#c8daf8' }
                      : r.comprobado
                        ? { background: '#d6f3cf' }
                        : undefined
                    : undefined
              }
            />
            <div className="flex flex-none gap-0">
              {nav}
              {salir}
            </div>
          </>
        )}

        {tab === 'articulos' && (
          <>
            <Rejilla
              rows={filasL}
              cols={colsL}
              rowKey={(r) => r.key}
              sel={selL}
              onSel={setSelL}
              onOpen={editarPedido}
              orden={ordL}
              onOrden={setOrdL}
              vacias={15}
              rowStyle={(r) => (opciones.colorearRuta ? { background: colorRuta(r.ruta) } : undefined)}
            />
            <div className="flex flex-none gap-0">
              {nav}
              <BarButton
                title="La liquidación de artículos se hace desde la ficha del pedido; aquí aún no está disponible"
                className="ml-[40px] w-[262px]"
                disabled
              >
                <PackageCheck size={18} /> Liquidar Artículos
              </BarButton>
              <BarButton title="Refrescar" className="w-[190px] text-[#000]" onClick={() => cargar(aplicado.current)} disabled={cargando}>
                <RefreshCw size={16} className="text-[#2a9d2a]" /> Refrescar
              </BarButton>
              {salir}
            </div>
          </>
        )}

        {tab === 'peticiones' && (
          <>
            <Rejilla
              rows={filasT}
              cols={colsT}
              rowKey={(r) => r.key}
              sel={selT}
              onSel={setSelT}
              onOpen={() => navigate('/compras')}
              orden={ordT}
              onOrden={setOrdT}
              vacias={15}
              rowStyle={(r) => (opciones.colorearRuta ? colorEstadoPeticion(r.estado) : undefined)}
            />
            <div className="flex flex-none items-center gap-0">
              {nav}
              <BarButton title="Ir a los pedidos a proveedor" className="w-[85px]" onClick={() => navigate('/compras')}>
                <Link2 size={20} />
              </BarButton>
              <div className="ml-1.5 flex min-w-0 items-center gap-1">
                <select className={`${BIG_INPUT} w-[230px]!`} value={estadoPet} onChange={(e) => setEstadoPet(e.target.value)} title="Filtrar por estado de la petición">
                  <option value="">Todos los estados</option>
                  {ESTADOS_PETICION.map((e) => (
                    <option key={e}>{e}</option>
                  ))}
                </select>
                <button
                  type="button"
                  className="gw-btn h-[30px]! w-[64px] flex-none text-[18px] font-bold tracking-[2px]"
                  title={proveedorPet ? `Proveedor ${proveedorPet} (pulsa para cambiar; vacío = todos)` : 'Filtrar por proveedor'}
                  onClick={() => (proveedorPet ? setProveedorPet('') : setBuscarProveedor(true))}
                >
                  {proveedorPet ? '×' : '···'}
                </button>
              </div>
              <BarButton title="Refrescar" className="ml-auto w-[90px] text-[#2a9d2a]" onClick={() => cargar(aplicado.current)} disabled={cargando}>
                <RefreshCw size={17} />
              </BarButton>
              <BarButton title="Salir" className="w-[105px]" onClick={() => navigate('/')}>
                <DoorOpen size={18} />
              </BarButton>
            </div>
          </>
        )}

        {tab === 'opciones' && (
          <div className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-auto">
            <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,0.6fr)] gap-x-1.5">
              <OptionButton label="Al Mostrar el formulario de Pedidos, Mostrar la Liquidación del pedido" value={opciones.mostrarLiquidacion} onChange={(v) => setOp({ mostrarLiquidacion: v })} />
              <OptionButton label="Ocultar Formulario de Pedidos" value={false} disabled title="No disponible en GeminisWin para este grupo de acceso" />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)] gap-x-1.5">
              <OptionButton
                label="Mostrar el Formulario de Pedidos de forma Modal"
                value={opciones.modal}
                onChange={(v) => setOp({ modal: v })}
                title="Se guarda la opción; en el ERP propio la ficha del pedido se abre siempre en la misma ventana"
              />
              <OptionButton label="Refrescar Consulta al Cerrar el Form. de Pedidos" value={false} disabled title="No disponible en GeminisWin para este grupo de acceso" />
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-1.5">
              <OptionButton label="Refrescar la Consulta de los Pedidos Automáticamente" value={opciones.refrescoAuto} onChange={(v) => setOp({ refrescoAuto: v })} />
              <div className="flex items-center justify-between gap-2 pl-2">
                <span className="text-[18px]">Segundos del intervalo del refresco:</span>
                <input
                  type="number"
                  min={0}
                  className={`${BIG_INPUT} h-[34px]! w-[140px]! text-right`}
                  value={opciones.segundos}
                  onChange={(e) => setOp({ segundos: Math.max(0, Number(e.target.value) || 0) })}
                />
              </div>
            </div>
            <div className="grid grid-cols-[minmax(0,0.78fr)_minmax(0,1fr)] gap-x-1.5">
              <OptionButton label="Colorear al Chequear o Liquidar un Pedido" value={opciones.colorearChequeo} onChange={(v) => setOp({ colorearChequeo: v })} />
              <OptionButton label="Colorear según la Ruta en Artíc. y el Estado en Peticiones" value={opciones.colorearRuta} onChange={(v) => setOp({ colorearRuta: v })} />
            </div>
            <ProcesosGroup
              value={opciones.procesos}
              onChange={(p) => setOp({ procesos: p })}
              nombre="Pedidos"
              textoCompleto="Imprimir informe del Pedido completo, de todos los pedidos nuevos Por"
            />
            <div className="flex flex-none items-center gap-[70px]">
              <button
                type="button"
                className="gw-btn h-[42px]! px-4! text-[19px]!"
                onClick={() => setMsgOpciones(guardarOpciones(CLAVE_OPCIONES, opciones) ? 'Valores guardados en este puesto.' : 'No se han podido guardar en este navegador.')}
              >
                💾 Guardar Valores
              </button>
              <button
                type="button"
                className="gw-btn h-[42px]! px-4! text-[19px]!"
                onClick={() => {
                  setOpciones(leerOpciones(CLAVE_OPCIONES, OPCIONES_DEFECTO))
                  setMsgOpciones('Valores cargados.')
                }}
              >
                ↶ Cargar Valores
              </button>
              <button
                type="button"
                className="gw-btn h-[42px]! px-4! text-[19px]!"
                onClick={() => {
                  borrarOpciones(CLAVE_OPCIONES)
                  setOpciones(OPCIONES_DEFECTO)
                  setMsgOpciones('Valores eliminados: se usan los predeterminados.')
                }}
              >
                ✖ Eliminar Valores
              </button>
              {msgOpciones && <span className="gw-label text-[15px]!">{msgOpciones}</span>}
            </div>
          </div>
        )}
      </div>

      {localizar && <LocalizarDialog onBuscar={buscarEnRejilla} onClose={() => setLocalizar(false)} />}
      {buscarProveedor && (
        <GwLookupDialog<{ codigo: string; nombre: string }>
          title="Proveedores"
          table="proveedor"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="nombre"
          keyColumn="codigo"
          onClose={() => setBuscarProveedor(false)}
          onPick={(r) => {
            setProveedorPet(r.codigo)
            setBuscarProveedor(false)
          }}
        />
      )}
    </div>
  )
}
