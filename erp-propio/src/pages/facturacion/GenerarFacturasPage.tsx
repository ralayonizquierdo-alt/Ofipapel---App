import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Binoculars, Check, CheckSquare, HelpCircle, LogOut, Pencil, Printer, Settings2, Square, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { avisoTope, filasPorTrozos, todasLasFilas } from '../../lib/todasLasFilas'
import { tiendaDeTrabajo } from '../../lib/sesionTrabajo'
import { GwCheck, GwDate, GwField, GwInput, GwLookupButton, GwSelect, GwWindow, formatGw } from '../../components/gw'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { gwConCeros } from '../../components/gw/GwListaOrdenada'
import { FilasVacias } from '../../components/gw/GwGridParts'
import { Conmutador } from '../../components/gw/GwInformeArticulos'
import { GwOperativa } from '../../components/gw/GwOperativa'
import { GwVentanaFlotante } from '../../components/gw/GwVentanaFlotante'
import { cargarLineas, desgloseAlbaran, fechaEs, hoy, n, r2 } from './facturaModel'

// «Generar Facturas» (Facturación → Generar Facturas), calcada del «Generador de facturas» de
// GeminisWin (capturas ZIP 7, 04/11/2026): Proceso a Generar (4 agrupaciones), Orden de los albaranes,
// Filtros por Ventas (fecha, estado de la venta, tiendas, tienda y número de venta), Filtros por
// Clientes (clientes, Filtrar Según…, Agenda Cliente, tipo de venta / factura / bloqueados), Datos a
// introducir al generar las facturas, y abajo el destino (Pantalla · Impresora · Examinar · Generar)
// con Procesar y Cerrar. Busca los ALBARANES pendientes (ventas sin factura ni anular) y factura en
// una sola transacción con fn_facturar_albaranes_proceso: cada factura lleva su registro VeriFactu y
// sus albaranes quedan bloqueados.

type Proceso = 'cliente' | 'cliente_tienda' | 'sucursal' | 'sucursal_tienda'
type Modo3 = 'rango' | 'cualquiera' | 'seleccionar'
type Destino = 'pantalla' | 'impresora' | 'examinar' | 'generar'

const PROCESOS: [Proceso, string][] = [
  ['cliente', 'Crear facturas agrupando albaranes por cliente'],
  ['cliente_tienda', 'Crear facturas agrupando albaranes por  cliente y tienda'],
  ['sucursal', 'Crear facturas agrupando albaranes por cada sucursal del cliente'],
  ['sucursal_tienda', 'Crear facturas agrupando los albaranes por cada sucursal del cliente y por tienda'],
]

const FILTRAR_SEGUN: [string, string][] = [
  ['tipo_cliente_codigo', 'Tipo Cliente'],
  ['zona_territorial_codigo', 'Zona Territorial'],
  ['vendedor_codigo', 'Vendedor'],
  ['ruta_codigo', 'Ruta'],
]

interface Pendiente {
  tienda_terminal_codigo: string
  numero: number
  fecha: string
  cliente_codigo: string
  cliente_sucursal_codigo: string | null
  nombre_cliente: string | null
  subtotal_2: number
  total_igic_pie: number
  total: number
  observaciones: string | null
  marcado: boolean
}

interface ClienteInfo {
  codigo: string
  nombre: string
  nif: string | null
  tipo_factura_global: number | null
  bloqueado: boolean | null
  tipo_cliente_codigo: string | null
  zona_territorial_codigo: string | null
  vendedor_codigo: string | null
  ruta_codigo: string | null
}

interface Grupo {
  clave: string
  cliente: string
  nombre: string
  nif: string | null
  sucursal: string | null
  tienda: string
  albaranes: Pendiente[]
}

const TOPE_ALBARANES = 20000

const primeroDeMesAnterior = () => {
  const d = new Date()
  return new Date(d.getFullYear(), d.getMonth() - 1, d.getDate()).toLocaleDateString('sv-SE')
}

/** Título de grupo en negrita, como los «Filtros por Ventas» de GeminisWin. */
function Bloque({ titulo, children, className = '' }: { titulo: string; children: ReactNode; className?: string }) {
  return (
    <fieldset className={`min-w-0 border border-[var(--gw-border-light)] px-1.5 pb-1.5 pt-0 ${className}`}>
      <legend className="px-0.5 text-[16px] font-bold">{titulo}</legend>
      {children}
    </fieldset>
  )
}

function Marco({ titulo, children, className = '' }: { titulo: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={`min-w-0 border border-[var(--gw-border-light)] px-1.5 pb-1 pt-0 ${className}`}>
      <legend className="px-0.5 text-[15px]">{titulo}</legend>
      {children}
    </fieldset>
  )
}

function Radio({ name, label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex h-[23px] cursor-pointer select-none items-center gap-1 whitespace-nowrap text-[15px]">
      <input type="radio" name={name} className="m-0 h-[11px] w-[11px] accent-[#0078d7]" checked={checked} onChange={onChange} />
      {label}
    </label>
  )
}

/** Código con su botón «···» (como los campos Desde/Hasta de GeminisWin). */
function Codigo({ value, onChange, onBuscar, disabled, ancho = '!w-[50px]', title }: { value: string; onChange?: (v: string) => void; onBuscar?: () => void; disabled?: boolean; ancho?: string; title?: string }) {
  return (
    <span className="flex min-w-0">
      <GwInput className={`${ancho} !h-[25px] !text-[15px]`} value={value} disabled={disabled} title={title} onChange={(e) => onChange?.(e.target.value)} />
      <GwLookupButton disabled={disabled || !onBuscar} onClick={onBuscar} title={title ?? 'Buscar'} />
    </span>
  )
}

const SIN_AGENDA = 'La agenda de clientes todavía no está en el ERP: este filtro llegará con ella.'

export function GenerarFacturasPage() {
  const navigate = useNavigate()
  const [tiendas, setTiendas] = useState<{ codigo: string; descripcion: string | null }[]>([])
  const [series, setSeries] = useState<{ tienda_terminal_codigo: string; serie: string; digito_control: string; descripcion: string | null; es_serie_rectificativas: boolean }[]>([])

  // Cabecera
  const [proceso, setProceso] = useState<Proceso>('cliente')
  const [orden, setOrden] = useState<'idventa' | 'fecha'>('idventa')
  // Filtros por Ventas
  const [fModo, setFModo] = useState<'rango' | 'cualquiera'>('rango')
  const [fDesde, setFDesde] = useState<string | null>(primeroDeMesAnterior())
  const [fHasta, setFHasta] = useState<string | null>(hoy())
  const [estado, setEstado] = useState({ contado: false, credito: true, pagada: false, noPagada: false, aplazada: false, noAplazada: false })
  const [tModo, setTModo] = useState<Modo3>('cualquiera')
  const [tDesde, setTDesde] = useState('')
  const [tHasta, setTHasta] = useState('')
  const [tSel, setTSel] = useState('')
  const [vModo, setVModo] = useState<Modo3>('cualquiera')
  const [vtDesde, setVtDesde] = useState('')
  const [vnDesde, setVnDesde] = useState('')
  const [vtHasta, setVtHasta] = useState('')
  const [vnHasta, setVnHasta] = useState('')
  const [vSel, setVSel] = useState('')
  // Filtros por Clientes
  const [cModo, setCModo] = useState<Modo3>('cualquiera')
  const [cDesde, setCDesde] = useState('')
  const [cHasta, setCHasta] = useState('')
  const [cSel, setCSel] = useState('')
  const [segun, setSegun] = useState('tipo_cliente_codigo')
  const [segunModo, setSegunModo] = useState<'no' | 'rango'>('no')
  const [segunDesde, setSegunDesde] = useState('')
  const [segunHasta, setSegunHasta] = useState('')
  const [tipoVenta, setTipoVenta] = useState('')
  const [tipoGener, setTipoGener] = useState('')
  const [bloqueados, setBloqueados] = useState(false)
  // Datos a introducir al generar las facturas
  const [fechaFactura, setFechaFactura] = useState<string | null>(null)
  const [tiendaFactura, setTiendaFactura] = useState('')
  const [conSerie, setConSerie] = useState(false)
  const [serie, setSerie] = useState('')
  const [tipoFactura, setTipoFactura] = useState<'predeterminada' | 'albaran'>('predeterminada')
  // Abajo
  const [destino, setDestino] = useState<Destino>('pantalla')

  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [clientes, setClientes] = useState<Map<string, ClienteInfo>>(new Map())
  const [ventana, setVentana] = useState<null | 'lista' | 'examinar'>(null)
  const [buscando, setBuscando] = useState(false)
  const [generando, setGenerando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [creadas, setCreadas] = useState<{ t: string; numero: number; serie: string; n_factura: number; cliente: string; total: number; tipo: string; albaranes: number }[]>([])
  const [lookup, setLookup] = useState<null | { tabla: 'cliente' | 'tienda_terminal'; poner: (c: string) => void }>(null)
  const [nuevaSerie, setNuevaSerie] = useState(false)
  const [ayuda, setAyuda] = useState(false)

  async function cargarSeries() {
    const { data } = await supabase.from('serie_facturacion').select('tienda_terminal_codigo, serie, digito_control, descripcion, es_serie_rectificativas').order('serie')
    setSeries((data ?? []) as never)
  }

  useEffect(() => {
    supabase
      .from('tienda_terminal')
      .select('codigo, descripcion')
      .order('codigo')
      .then(({ data }) => {
        const ts = (data ?? []) as { codigo: string; descripcion: string | null }[]
        setTiendas(ts)
        const t = tiendaDeTrabajo(ts)
        setTDesde(t)
        setTHasta(t)
        setVtDesde(t)
        setVtHasta(t)
      })
    cargarSeries()
  }, [])

  // F4 cierra la ventana, como en GeminisWin.
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'F4' && !e.altKey) {
        e.preventDefault()
        navigate('/facturacion')
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [navigate])

  const seriesTienda = series.filter((s) => s.tienda_terminal_codigo === tiendaFactura && !s.es_serie_rectificativas)
  const porAlbaran = tipoFactura === 'albaran'
  const lista = (t: string) =>
    t
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean)

  async function buscar(): Promise<Pendiente[] | null> {
    setBuscando(true)
    setError(null)
    setMensaje(null)
    setCreadas([])
    const par = (a: boolean, b: boolean) => (a === b ? null : a)
    const contado = par(estado.contado, estado.credito)
    const pagada = par(estado.pagada, estado.noPagada)
    const aplazada = par(estado.aplazada, estado.noAplazada)
    const consulta = () => {
      let q = supabase
        .from('venta')
        .select('tienda_terminal_codigo, numero, fecha, cliente_codigo, cliente_sucursal_codigo, nombre_cliente, subtotal_2, total_igic_pie, total, observaciones, es_reparto')
        .is('factura_numero', null)
        .is('anulada_en', null)
      if (contado != null) q = q.ilike('tipo_credito', contado ? 'co%' : 'cr%')
      if (pagada != null) q = pagada ? q.lte('total_pendiente', 0) : q.gt('total_pendiente', 0)
      if (aplazada != null) q = q.eq('aplazada', aplazada)
      if (fModo === 'rango' && fDesde) q = q.gte('fecha', fDesde)
      if (fModo === 'rango' && fHasta) q = q.lte('fecha', fHasta)
      if (tModo === 'rango') {
        if (tDesde) q = q.gte('tienda_terminal_codigo', tDesde)
        if (tHasta) q = q.lte('tienda_terminal_codigo', tHasta)
      } else if (tModo === 'seleccionar' && lista(tSel).length) q = q.in('tienda_terminal_codigo', lista(tSel))
      if (vModo === 'rango') {
        if (vtDesde) q = q.gte('tienda_terminal_codigo', vtDesde)
        if (vtHasta) q = q.lte('tienda_terminal_codigo', vtHasta)
        if (vnDesde) q = q.gte('numero', Number(vnDesde))
        if (vnHasta) q = q.lte('numero', Number(vnHasta))
      }
      if (cModo === 'rango') {
        if (cDesde) q = q.gte('cliente_codigo', gwConCeros(cDesde))
        if (cHasta) q = q.lte('cliente_codigo', gwConCeros(cHasta))
      } else if (cModo === 'seleccionar' && lista(cSel).length) q = q.in('cliente_codigo', lista(cSel).map(gwConCeros))
      if (tipoVenta === 'normal') q = q.eq('es_reparto', false)
      if (tipoVenta === 'reparto') q = q.eq('es_reparto', true)
      return q.order('cliente_codigo').order(orden === 'fecha' ? 'fecha' : 'tienda_terminal_codigo').order('numero')
    }
    // Supabase corta cada respuesta en 1000 filas: los albaranes se piden por bloques (si se
    // quedaran a medias, un cliente se facturaría sin todos sus albaranes).
    const { data, error: e, cortado } = await todasLasFilas<Record<string, unknown>>(consulta, { tope: TOPE_ALBARANES })
    if (e) {
      setBuscando(false)
      setError(e)
      return null
    }
    if (cortado) setMensaje(avisoTope(TOPE_ALBARANES))
    const ventasSel = vModo === 'seleccionar' ? new Set(lista(vSel).map((x) => x.replace(/\s/g, ''))) : null
    let filas: Pendiente[] = data
      .map((v) => ({
        tienda_terminal_codigo: v.tienda_terminal_codigo as string,
        numero: Number(v.numero),
        fecha: v.fecha as string,
        cliente_codigo: v.cliente_codigo as string,
        cliente_sucursal_codigo: (v.cliente_sucursal_codigo as string | null) ?? null,
        nombre_cliente: (v.nombre_cliente as string | null) ?? null,
        subtotal_2: n(v.subtotal_2 as number),
        total_igic_pie: n(v.total_igic_pie as number),
        total: n(v.total as number),
        observaciones: (v.observaciones as string | null) ?? null,
        marcado: true,
      }))
      .filter((p) => !ventasSel || ventasSel.has(`${p.tienda_terminal_codigo}-${p.numero}`))
    const codigos = [...new Set(filas.map((f) => f.cliente_codigo))]
    const mapa = new Map<string, ClienteInfo>()
    const { data: cs } = await filasPorTrozos<ClienteInfo, string>(codigos, (t) =>
      supabase.from('cliente').select('codigo, nombre, nif, tipo_factura_global, bloqueado, tipo_cliente_codigo, zona_territorial_codigo, vendedor_codigo, ruta_codigo').in('codigo', t).order('codigo'),
    )
    for (const c of cs) mapa.set(c.codigo, c)
    filas = filas.filter((f) => {
      const c = mapa.get(f.cliente_codigo)
      if (!bloqueados && c?.bloqueado) return false
      if (tipoGener !== '' && String(c?.tipo_factura_global ?? '') !== tipoGener) return false
      if (segunModo === 'rango') {
        const v = String((c as unknown as Record<string, unknown> | undefined)?.[segun] ?? '')
        if (segunDesde && v < segunDesde) return false
        if (segunHasta && v > segunHasta) return false
      }
      return true
    })
    setClientes(mapa)
    setPendientes(filas)
    setBuscando(false)
    return filas
  }

  const grupos = useMemo<Grupo[]>(() => {
    const m = new Map<string, Grupo>()
    const conTienda = proceso === 'cliente_tienda' || proceso === 'sucursal_tienda'
    const conSucursal = proceso === 'sucursal' || proceso === 'sucursal_tienda'
    for (const p of pendientes) {
      const tienda = tiendaFactura || (conTienda ? p.tienda_terminal_codigo : '')
      const clave = porAlbaran ? `${p.tienda_terminal_codigo}-${p.numero}` : `${tienda}|${p.cliente_codigo}|${conSucursal ? (p.cliente_sucursal_codigo ?? '') : ''}`
      const c = clientes.get(p.cliente_codigo)
      const g = m.get(clave) ?? {
        clave,
        cliente: p.cliente_codigo,
        nombre: c?.nombre ?? p.nombre_cliente ?? '',
        nif: c?.nif ?? null,
        sucursal: conSucursal || porAlbaran ? p.cliente_sucursal_codigo : null,
        tienda: tienda || p.tienda_terminal_codigo,
        albaranes: [],
      }
      g.albaranes.push(p)
      m.set(clave, g)
    }
    return [...m.values()]
  }, [pendientes, clientes, proceso, tiendaFactura, porAlbaran])

  const tot = (ps: Pendiente[]) => ({
    base: r2(ps.reduce((s, p) => s + p.subtotal_2, 0)),
    igic: r2(ps.reduce((s, p) => s + p.total_igic_pie, 0)),
    total: r2(ps.reduce((s, p) => s + p.total, 0)),
  })

  function marcar(pred: (p: Pendiente) => boolean, valor: boolean) {
    setPendientes((ps) => ps.map((p) => (pred(p) ? { ...p, marcado: valor } : p)))
  }

  async function generar(marcados: Pendiente[]) {
    if (marcados.length === 0) return setError('No hay albaranes que facturar con esos filtros. Cambia los filtros y vuelve a pulsar Procesar.')
    const fecha = fechaFactura ?? hoy()
    const nFact = new Set(grupos.filter((g) => g.albaranes.some((a) => a.marcado)).map((g) => g.clave)).size
    if (
      !confirm(
        `Se van a emitir ${nFact} factura(s) con ${marcados.length} albarán(es), por ${formatGw(tot(marcados).total, 2)} €, con fecha ${fechaEs(fecha)}.\n\nCada factura genera su registro VeriFactu y sus albaranes quedan bloqueados. ¿Continuar?`,
      )
    )
      return
    setGenerando(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_facturar_albaranes_proceso', {
      p_albaranes: marcados.map((p) => ({ t: p.tienda_terminal_codigo, n: p.numero })),
      p_fecha_factura: fecha,
      p_tienda_factura: tiendaFactura || null,
      p_serie: conSerie && serie ? serie : null,
      p_fecha_desde: fModo === 'rango' ? fDesde : null,
      p_fecha_hasta: fModo === 'rango' ? fHasta : null,
      p_por_albaran: porAlbaran,
      p_observaciones: null,
      p_agrupar: proceso,
    })
    setGenerando(false)
    if (e) return setError(`No se ha facturado nada: ${e.message}`)
    const res = (data ?? []) as typeof creadas
    setCreadas(res)
    setMensaje(`Generadas ${res.length} factura(s).`)
    setVentana(null)
    setPendientes((ps) => ps.filter((p) => !p.marcado))
  }

  async function procesar() {
    const filas = await buscar()
    if (!filas) return
    if (destino === 'generar') return generar(filas)
    if (!filas.length) return setError('No hay albaranes pendientes de facturar con esos filtros. Cambia los filtros (fechas, estado de la venta, tiendas o clientes) y pulsa Procesar.')
    setVentana(destino === 'examinar' ? 'examinar' : 'lista')
    if (destino === 'impresora') setTimeout(() => window.print(), 300)
  }

  const nombreTienda = (c: string) => tiendas.find((t) => t.codigo === c)?.descripcion ?? ''
  const buscarCliente = (poner: (c: string) => void) => setLookup({ tabla: 'cliente', poner })
  const buscarTienda = (poner: (c: string) => void) => setLookup({ tabla: 'tienda_terminal', poner })
  const fila = 'flex items-center gap-1'
  const sel = '!h-[25px] !text-[15px]'
  const destinoBtn = (d: Destino, icono: ReactNode, texto: ReactNode) => (
    <button
      type="button"
      aria-pressed={destino === d}
      className={`gw-btn !h-[44px] !gap-1 !text-[16px] ${destino === d ? '!border-[#7a7a7a] !bg-[#f4f4f4] shadow-[inset_1px_1px_2px_rgba(0,0,0,0.25)]' : ''}`}
      onClick={() => setDestino(d)}
    >
      {icono}
      {texto}
    </button>
  )

  return (
    <div className="flex flex-col gap-1 text-[15px]">
      {/* Proceso a Generar · Orden de los albaranes en la factura */}
      <div className="grid grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)] gap-2">
        <Bloque titulo="Proceso a Generar">
          <GwSelect className="!h-[27px] !text-[16px]" value={proceso} onChange={(e) => setProceso(e.target.value as Proceso)}>
            {PROCESOS.map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </GwSelect>
        </Bloque>
        <Bloque titulo="Orden de los albaranes en la factura">
          <span className="flex">
            <GwSelect className="!h-[27px] !text-[16px]" value={orden} onChange={(e) => setOrden(e.target.value as 'idventa' | 'fecha')} title="Orden en que se listan los albaranes al examinar y en la vista previa">
              <option value="idventa">Idventa</option>
              <option value="fecha">Fecha</option>
            </GwSelect>
            <GwLookupButton disabled title="Las dos ordenaciones están en el desplegable" />
          </span>
        </Bloque>
      </div>

      {/* Filtros por Ventas */}
      <Bloque titulo="Filtros por Ventas">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-1">
          <Marco titulo="Fecha">
            <div className="grid grid-cols-[130px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-1.5">
              <Radio name="gf-fecha" label="Desde/Hasta" checked={fModo === 'rango'} onChange={() => setFModo('rango')} />
              <GwDate className={sel} value={fDesde} onChange={setFDesde} disabled={fModo !== 'rango'} />
              <GwDate className={sel} value={fHasta} onChange={setFHasta} disabled={fModo !== 'rango'} />
              <Radio name="gf-fecha" label="Cualquiera" checked={fModo === 'cualquiera'} onChange={() => setFModo('cualquiera')} />
            </div>
          </Marco>
          <Marco titulo="Estado de la venta">
            <div className="grid grid-cols-3 gap-0.5">
              <Conmutador on={estado.contado} onChange={(v) => setEstado({ ...estado, contado: v })} className="!justify-center">
                Contado
              </Conmutador>
              <Conmutador on={estado.pagada} onChange={(v) => setEstado({ ...estado, pagada: v })} className="!justify-center">
                Pagada
              </Conmutador>
              <Conmutador on={estado.aplazada} onChange={(v) => setEstado({ ...estado, aplazada: v })} className="!justify-center">
                Aplazada
              </Conmutador>
              <Conmutador on={estado.credito} onChange={(v) => setEstado({ ...estado, credito: v })} className="!justify-center">
                Crédito
              </Conmutador>
              <Conmutador on={estado.noPagada} onChange={(v) => setEstado({ ...estado, noPagada: v })} className="!justify-center">
                No Pagada
              </Conmutador>
              <Conmutador on={estado.noAplazada} onChange={(v) => setEstado({ ...estado, noAplazada: v })} className="!justify-center">
                No Aplazada
              </Conmutador>
            </div>
          </Marco>
          <Marco titulo="Tiendas">
            <div className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-x-1.5">
              <Radio name="gf-tiendas" label="Desde/Hasta" checked={tModo === 'rango'} onChange={() => setTModo('rango')} />
              <span className={fila}>
                <Codigo value={tDesde} onChange={setTDesde} disabled={tModo !== 'rango'} onBuscar={() => buscarTienda(setTDesde)} title="Tienda desde" />
                <Codigo value={tHasta} onChange={setTHasta} disabled={tModo !== 'rango'} onBuscar={() => buscarTienda(setTHasta)} title="Tienda hasta" />
              </span>
              <Radio name="gf-tiendas" label="Cualquiera" checked={tModo === 'cualquiera'} onChange={() => setTModo('cualquiera')} />
              <span />
              <Radio name="gf-tiendas" label="Seleccionar" checked={tModo === 'seleccionar'} onChange={() => setTModo('seleccionar')} />
              <Codigo
                value={tSel}
                onChange={setTSel}
                ancho="!w-[160px]"
                disabled={tModo !== 'seleccionar'}
                onBuscar={() => buscarTienda((c) => setTSel((s) => (lista(s).includes(c) ? s : [...lista(s), c].join(', '))))}
                title="Tiendas elegidas, separadas por comas"
              />
            </div>
          </Marco>
          <Marco titulo="Tienda y Número de Venta">
            <div className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-x-1.5">
              <Radio name="gf-venta" label="Desde/Hasta" checked={vModo === 'rango'} onChange={() => setVModo('rango')} />
              <span className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] gap-1">
                <Codigo value={vtDesde} onChange={setVtDesde} disabled={vModo !== 'rango'} onBuscar={() => buscarTienda(setVtDesde)} title="Tienda de la venta desde" />
                <GwInput className={`${sel} gw-num`} value={vnDesde} disabled={vModo !== 'rango'} onChange={(e) => setVnDesde(e.target.value.replace(/\D/g, ''))} title="Número de venta desde" />
                <Codigo value={vtHasta} onChange={setVtHasta} disabled={vModo !== 'rango'} onBuscar={() => buscarTienda(setVtHasta)} title="Tienda de la venta hasta" />
                <GwInput className={`${sel} gw-num`} value={vnHasta} disabled={vModo !== 'rango'} onChange={(e) => setVnHasta(e.target.value.replace(/\D/g, ''))} title="Número de venta hasta" />
              </span>
              <Radio name="gf-venta" label="Cualquiera" checked={vModo === 'cualquiera'} onChange={() => setVModo('cualquiera')} />
              <span />
              <Radio name="gf-venta" label="Seleccionar" checked={vModo === 'seleccionar'} onChange={() => setVModo('seleccionar')} />
              <GwInput className={sel} value={vSel} disabled={vModo !== 'seleccionar'} onChange={(e) => setVSel(e.target.value)} title="Ventas elegidas como tienda-número, separadas por comas (por ejemplo 01-1234, 01-1240)" />
            </div>
          </Marco>
        </div>
      </Bloque>

      {/* Filtros por Clientes */}
      <Bloque titulo="Filtros por Clientes">
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-1">
          <Marco titulo="Clientes">
            <div className="grid grid-cols-[130px_minmax(0,1fr)] items-center gap-x-1.5">
              <Radio name="gf-cli" label="Desde/Hasta" checked={cModo === 'rango'} onChange={() => setCModo('rango')} />
              <span className="grid grid-cols-2 gap-1">
                <Codigo value={cDesde} onChange={setCDesde} ancho="w-full" disabled={cModo !== 'rango'} onBuscar={() => buscarCliente(setCDesde)} title="Cliente desde" />
                <Codigo value={cHasta} onChange={setCHasta} ancho="w-full" disabled={cModo !== 'rango'} onBuscar={() => buscarCliente(setCHasta)} title="Cliente hasta" />
              </span>
              <Radio name="gf-cli" label="Cualquiera" checked={cModo === 'cualquiera'} onChange={() => setCModo('cualquiera')} />
              <span />
              <Radio name="gf-cli" label="Seleccionar" checked={cModo === 'seleccionar'} onChange={() => setCModo('seleccionar')} />
              <Codigo
                value={cSel}
                onChange={setCSel}
                ancho="w-full"
                disabled={cModo !== 'seleccionar'}
                onBuscar={() => buscarCliente((c) => setCSel((s) => (lista(s).includes(c) ? s : [...lista(s), c].join(', '))))}
                title="Clientes elegidos, separados por comas"
              />
            </div>
          </Marco>
          <Marco titulo="Filtrar Segun ...">
            <div className="grid grid-cols-2 gap-x-1.5 gap-y-1.5 pt-0.5">
              <GwSelect className={sel} value={segun} onChange={(e) => setSegun(e.target.value)}>
                {FILTRAR_SEGUN.map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
              </GwSelect>
              <GwSelect className={sel} value={segunModo} onChange={(e) => setSegunModo(e.target.value as 'no' | 'rango')}>
                <option value="no">No Filtrar</option>
                <option value="rango">Desde / Hasta</option>
              </GwSelect>
              <Codigo value={segunDesde} onChange={setSegunDesde} ancho="w-full" disabled={segunModo === 'no'} title="Código desde" />
              <Codigo value={segunHasta} onChange={setSegunHasta} ancho="w-full" disabled={segunModo === 'no'} title="Código hasta" />
            </div>
          </Marco>
          <Marco
            titulo={
              <span className="flex items-center gap-6">
                Agenda Cliente
                <GwCheck label={<span className="text-[15px]">Excluir Existentes</span>} checked={false} disabled />
                <span className="text-[#1a1adb]" title={SIN_AGENDA}>
                  Múltiple
                </span>
              </span>
            }
          >
            <div className="grid grid-cols-2 gap-x-1.5 gap-y-1.5 pt-0.5" title={SIN_AGENDA}>
              <GwSelect className={sel} disabled value="nombre">
                <option value="nombre">Nombre</option>
              </GwSelect>
              <GwSelect className={sel} disabled value="no">
                <option value="no">No Filtrar</option>
              </GwSelect>
              <Codigo value="" ancho="w-full" disabled title={SIN_AGENDA} />
              <Codigo value="" ancho="w-full" disabled title={SIN_AGENDA} />
            </div>
          </Marco>
          <Marco titulo="Tipo de Venta, Factura e incluir clientes bloqueados">
            <div className="grid grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_minmax(0,0.85fr)] items-end gap-x-1.5">
              <GwField label={<span className="text-[15px]">Tipo De Venta</span>}>
                <GwSelect className={sel} value={tipoVenta} onChange={(e) => setTipoVenta(e.target.value)}>
                  <option value="" />
                  <option value="normal">Normal</option>
                  <option value="reparto">Reparto</option>
                </GwSelect>
              </GwField>
              <GwField label={<span className="text-[15px]">Tipo Gener. Factura</span>}>
                <GwSelect className={sel} value={tipoGener} onChange={(e) => setTipoGener(e.target.value)} title="Tipo de factura global de la ficha del cliente">
                  <option value="" />
                  {[0, 1, 2, 3, 4].map((t) => (
                    <option key={t} value={String(t)}>
                      Tipo {t}
                    </option>
                  ))}
                </GwSelect>
              </GwField>
              <Conmutador on={bloqueados} onChange={setBloqueados} className="!h-[44px] !whitespace-normal !leading-[18px]">
                Clientes Bloqueados
              </Conmutador>
            </div>
          </Marco>
        </div>
      </Bloque>

      {/* Datos a introducir al generar las facturas */}
      <Bloque titulo="Datos a introducir al generar las facturas">
        <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,1.05fr)_minmax(0,0.85fr)] gap-x-2">
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.65fr)_minmax(0,1.6fr)] items-end gap-x-1.5 gap-y-1">
            <GwField label={<span className="text-[15px]">Fecha</span>}>
              <GwDate className={sel} value={fechaFactura} onChange={setFechaFactura} title="Fecha de las facturas (vacía: hoy)" />
            </GwField>
            <GwField label={<span className="text-[15px]">Hora</span>}>
              <GwInput className={sel} disabled value="" title="La hora de la factura la pone el servidor al generarla" />
            </GwField>
            <GwField label={<span className="text-[15px]">Forma de pago</span>}>
              <span className="flex">
                <GwSelect className={sel} disabled value="" title="Cada factura toma la forma de pago de la ficha del cliente">
                  <option value="" />
                </GwSelect>
                <GwLookupButton disabled title="Cada factura toma la forma de pago de la ficha del cliente" />
              </span>
            </GwField>
            <GwField label={<span className="text-[15px]">% Dto.:</span>}>
              <GwInput className={`${sel} gw-num`} disabled value="0" title="El descuento va en cada albarán: la factura suma los de sus albaranes" />
            </GwField>
            <GwField label={<span className="text-[15px]">% Ret.</span>}>
              <GwInput className={`${sel} gw-num`} disabled value="0,00" title="La retención se pone después en la ficha de la factura" />
            </GwField>
            <GwField label={<span className="text-[15px]">Otros gastos:</span>}>
              <GwInput className={`${sel} gw-num`} disabled value="0,000" title="Los otros gastos se ponen después en la ficha de la factura" />
            </GwField>
          </div>
          <div className="flex flex-col gap-1">
            <Marco titulo="Vendedor">
              <span className="grid grid-cols-[70px_minmax(0,1fr)] gap-1">
                <GwInput className={sel} disabled value="" title="Cada factura toma el vendedor de la ficha del cliente" />
                <Codigo value="" ancho="w-full" disabled title="Cada factura toma el vendedor de la ficha del cliente" />
              </span>
            </Marco>
            <Marco titulo="Opciones">
              <span className="grid grid-cols-[minmax(0,1fr)_70px_minmax(0,1fr)] gap-1">
                <Conmutador on={conSerie} onChange={setConSerie} className="!justify-center">
                  D.C. Factura
                </Conmutador>
                <span className="flex">
                  <GwSelect
                    className={sel}
                    value={serie}
                    disabled={!conSerie || !tiendaFactura}
                    onChange={(e) => setSerie(e.target.value)}
                    title={tiendaFactura ? 'Serie (D.C.) de facturación de la tienda elegida' : 'Elige antes la Tienda de las facturas'}
                  >
                    <option value="" />
                    {seriesTienda.map((s) => (
                      <option key={s.serie} value={s.serie}>
                        {s.digito_control} · {s.serie}
                      </option>
                    ))}
                  </GwSelect>
                </span>
                <span title="Las facturas se cobran después en Facturación → Gestor de Cobros">
                  <Conmutador on={false} onChange={() => undefined} className="pointer-events-none w-full !justify-center opacity-60">
                    Pagarlas
                  </Conmutador>
                </span>
              </span>
            </Marco>
          </div>
          <div className="flex flex-col gap-1">
            <Marco titulo="Tienda">
              <span className="grid grid-cols-[70px_minmax(0,1fr)_auto] gap-1">
                <GwSelect
                  className={sel}
                  value={tiendaFactura}
                  onChange={(e) => {
                    setTiendaFactura(e.target.value)
                    setSerie('')
                  }}
                  title="Tienda en la que se numeran las facturas (vacía: la de los albaranes)"
                >
                  <option value="" />
                  {tiendas.map((t) => (
                    <option key={t.codigo}>{t.codigo}</option>
                  ))}
                </GwSelect>
                <GwInput className={sel} readOnly value={nombreTienda(tiendaFactura)} />
                <button type="button" className="gw-btn w-[26px] flex-none px-0 font-bold" title="Nueva serie de facturación" onClick={() => setNuevaSerie(true)}>
                  +
                </button>
              </span>
            </Marco>
            <GwField label={<span className="text-[15px]">Tipo de factura a generar</span>}>
              <GwSelect className={sel} value={tipoFactura} onChange={(e) => setTipoFactura(e.target.value as 'predeterminada' | 'albaran')} title="Predeterminada: F1 si el cliente tiene NIF; F2 (simplificada) si no, hasta 3.000 €">
                <option value="predeterminada">Predeterminada</option>
                <option value="albaran">Una factura por albarán</option>
              </GwSelect>
            </GwField>
          </div>
        </div>
      </Bloque>

      {/* Pie: F4 · destino · Procesar · Cerrar */}
      <div className="grid grid-cols-[minmax(0,180px)_minmax(0,1fr)_minmax(0,330px)] items-stretch gap-2">
        <div className="flex flex-col justify-center border border-[var(--gw-border-light)] px-1.5 text-[15px] leading-[18px]">
          Pulse F4 para cerrar la ventana
          <button type="button" className="mt-0.5 flex items-center gap-1 self-start text-[13px] text-[#1a4fd0] underline" onClick={() => setAyuda(true)}>
            <HelpCircle size={13} /> Operativa
          </button>
        </div>
        <div className="grid grid-cols-4 gap-0.5 border border-[var(--gw-border-light)] p-0.5">
          {destinoBtn('pantalla', <Pencil size={14} />, 'Pantalla')}
          {destinoBtn('impresora', <Printer size={15} />, 'Impresora')}
          {destinoBtn('examinar', <Binoculars size={15} />, 'Examinar')}
          {destinoBtn('generar', <Settings2 size={15} />, <span><u>G</u>enerar</span>)}
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button type="button" className="gw-btn !h-[48px] gap-1 !text-[17px]" disabled={buscando || generando} onClick={procesar}>
            <Check size={17} strokeWidth={3} className="text-[#127a12]" />
            {buscando ? 'Buscando…' : generando ? 'Generando…' : 'Procesar'}
          </button>
          <button type="button" className="gw-btn !h-[48px] gap-1 !text-[17px]" onClick={() => navigate('/facturacion')}>
            <LogOut size={16} />
            <span>
              <u>C</u>errar
            </span>
          </button>
        </div>
      </div>

      <div className="min-h-[22px] text-[13px]">
        {error && <span className="text-[#c42b1c]">{error}</span>}
        {!error && mensaje && (
          <span className="text-[#127a12]">
            {mensaje}{' '}
            {creadas.map((c) => (
              <button
                key={`${c.t}-${c.numero}`}
                type="button"
                className="mx-0.5 underline"
                onClick={() => navigate(`/facturacion/${c.t}/${c.numero}`)}
                title={`Cliente ${c.cliente} · ${c.albaranes} albarán(es) · ${c.tipo}`}
              >
                {c.serie}-{c.n_factura} ({formatGw(n(c.total), 2)})
              </button>
            ))}
          </span>
        )}
      </div>

      {ventana && (
        <ResultadosVentana
          modo={ventana}
          grupos={grupos}
          proceso={proceso}
          generando={generando}
          tot={tot}
          marcar={marcar}
          onGenerar={() => generar(pendientes.filter((p) => p.marcado))}
          onCerrar={() => setVentana(null)}
        />
      )}
      {lookup && (
        <GwLookupDialog<Record<string, unknown>>
          title={lookup.tabla === 'cliente' ? 'Clientes' : 'Tiendas / Terminales'}
          table={lookup.tabla}
          columns={
            lookup.tabla === 'cliente'
              ? [
                  { key: 'codigo', label: 'Código', width: 90 },
                  { key: 'nombre', label: 'Nombre' },
                  { key: 'nif', label: 'NIF', width: 110 },
                ]
              : [
                  { key: 'codigo', label: 'Código', width: 80 },
                  { key: 'descripcion', label: 'Descripción' },
                ]
          }
          searchColumns={lookup.tabla === 'cliente' ? ['codigo', 'nombre', 'nif'] : ['codigo', 'descripcion']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            lookup.poner(String(r.codigo))
            setLookup(null)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {nuevaSerie && (
        <NuevaSerieDialog
          tiendas={tiendas.map((t) => t.codigo)}
          tienda={tiendaFactura}
          onClose={() => setNuevaSerie(false)}
          onHecho={async (t, s) => {
            setNuevaSerie(false)
            await cargarSeries()
            setTiendaFactura(t)
            setConSerie(!!s)
            setSerie(s)
          }}
        />
      )}
      {ayuda && (
        <GwVentanaFlotante titulo="Operativa — Generar Facturas" onCerrar={() => setAyuda(false)} ancho={600}>
          <GwOperativa
            bloques={[
              {
                titulo: 'Generar las facturas del mes',
                pasos: [
                  'Elige el «Proceso a Generar»: una factura por cliente, por cliente y tienda, por cada sucursal del cliente, o por sucursal y tienda.',
                  'Filtros por Ventas: las fechas de los albaranes, el estado de la venta (por defecto solo Crédito, que son los albaranes), las tiendas o unas ventas concretas.',
                  'Filtros por Clientes: unos clientes, un tipo de cliente, zona, vendedor o ruta, el tipo de venta y el tipo de factura global. Los clientes bloqueados se dejan fuera salvo que marques «Clientes Bloqueados».',
                  'Datos a introducir: la fecha de las facturas (vacía = hoy), la tienda en que se numeran (vacía = la de los albaranes) y, con «D.C. Factura», la serie.',
                  'Elige abajo qué hacer y pulsa Procesar: Pantalla (ver las facturas que saldrían), Impresora (lo mismo, impreso), Examinar (ver y desmarcar albaranes antes de generar) o Generar (emitirlas ya).',
                ],
              },
              {
                titulo: 'A tener en cuenta',
                notas: [
                  'Solo se facturan albaranes: ventas a crédito, sin factura, sin anular y sin aplazar. Si marcas Contado o Aplazada, el programa avisa y no factura nada.',
                  'Todo se genera de una vez: si una factura falla, no se emite ninguna y el aviso dice cuál y por qué.',
                  'Cada factura genera su registro VeriFactu y bloquea sus albaranes. F1 si el cliente tiene NIF; si no, simplificada (F2) hasta 3.000 €.',
                  'Hora, forma de pago, vendedor, % Dto., % Ret., Otros gastos y Pagarlas salen en gris: la factura los toma de la ficha del cliente y de sus albaranes, y se cambian después en la ficha de la factura o en el Gestor de Cobros.',
                  'F4 cierra la ventana.',
                ],
              },
            ]}
          />
        </GwVentanaFlotante>
      )}
    </div>
  )
}

/** Resultado de Procesar: Pantalla / Impresora (lista de facturas) o Examinar (marcar albaranes). */
function ResultadosVentana({
  modo,
  grupos,
  proceso,
  generando,
  tot,
  marcar,
  onGenerar,
  onCerrar,
}: {
  modo: 'lista' | 'examinar'
  grupos: Grupo[]
  proceso: Proceso
  generando: boolean
  tot: (ps: Pendiente[]) => { base: number; igic: number; total: number }
  marcar: (pred: (p: Pendiente) => boolean, valor: boolean) => void
  onGenerar: () => void
  onCerrar: () => void
}) {
  const navigate = useNavigate()
  const [selGrupo, setSelGrupo] = useState(0)
  const grupo = grupos[selGrupo] ?? null
  const num = 'text-right tabular-nums'
  const marcados = grupos.flatMap((g) => g.albaranes.filter((a) => a.marcado))
  const totM = tot(marcados)
  const nFact = grupos.filter((g) => g.albaranes.some((a) => a.marcado)).length

  // Desglose de IGIC del grupo seleccionado, sobre sus líneas (como lo hará la factura).
  const [desglose, setDesglose] = useState<{ pct: number; base: number; cuota: number }[] | null>(null)
  useEffect(() => {
    setDesglose(null)
    if (!grupo || modo !== 'examinar') return
    let vivo = true
    const albs = grupo.albaranes.filter((a) => a.marcado)
    cargarLineas(albs.map((a) => ({ t: a.tienda_terminal_codigo, n: a.numero }))).then(async (ls) => {
      const { data } = await filasPorTrozos<Record<string, unknown>, number>(
        albs.map((a) => a.numero),
        (t) =>
          supabase
            .from('venta')
            .select('tienda_terminal_codigo, numero, descuento_pie_pct, igic_pie_pct, subtotal_2, total_igic_pie')
            .eq('cliente_codigo', grupo.cliente)
            .is('factura_numero', null)
            .in('numero', t)
            .order('tienda_terminal_codigo')
            .order('numero'),
      )
      const acc = new Map<number, { base: number; cuota: number }>()
      for (const v of data) {
        if (!albs.some((a) => a.tienda_terminal_codigo === v.tienda_terminal_codigo && a.numero === Number(v.numero))) continue
        const d = desgloseAlbaran(v as never, ls.filter((l) => l.tienda_terminal_codigo === v.tienda_terminal_codigo && Number(l.numero) === Number(v.numero)))
        for (const [k, b] of Object.entries(d.bases)) {
          const x = acc.get(Number(k)) ?? { base: 0, cuota: 0 }
          acc.set(Number(k), { base: r2(x.base + b), cuota: r2(x.cuota + (d.cuotas[k] ?? 0)) })
        }
      }
      if (vivo) setDesglose([...acc.entries()].sort((a, b) => a[0] - b[0]).map(([pct, x]) => ({ pct, ...x })))
    })
    return () => {
      vivo = false
    }
  }, [grupo, modo])

  const titulo = PROCESOS.find(([k]) => k === proceso)?.[1] ?? ''
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-10">
      <GwWindow title={modo === 'examinar' ? 'Examinar albaranes a facturar' : 'Facturas a generar'} onClose={onCerrar} className="w-[1180px] max-w-[96vw]">
        <div className="flex flex-col gap-1 text-[14px]">
          <span className="text-[#1a4fd0]">{titulo.replace(/\s+/g, ' ')}</span>
          <div className={modo === 'examinar' ? 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2' : ''}>
            <div className="h-[380px] overflow-auto border border-[var(--gw-border)] bg-white">
              <table className="gw-grid">
                <thead className="sticky top-0">
                  <tr>
                    {modo === 'examinar' && <th style={{ width: 28 }} />}
                    <th style={{ width: 70 }}>Cliente</th>
                    <th>Nombre</th>
                    <th style={{ width: 60 }}>Suc.</th>
                    <th style={{ width: 50 }}>Ti.</th>
                    <th className="text-center!" style={{ width: 50 }}>
                      Alb.
                    </th>
                    <th className="text-center!" style={{ width: 92 }}>
                      Base
                    </th>
                    <th className="text-center!" style={{ width: 84 }}>
                      IGIC
                    </th>
                    <th className="text-center!" style={{ width: 92 }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {grupos.map((g, i) => {
                    const m = g.albaranes.filter((a) => a.marcado)
                    const t = tot(m)
                    const todos = m.length === g.albaranes.length
                    return (
                      <tr key={g.clave} className={i === selGrupo ? 'gw-selected' : ''} onClick={() => setSelGrupo(i)}>
                        {modo === 'examinar' && (
                          <td className="text-center">
                            <input
                              type="checkbox"
                              className="m-0 h-[13px] w-[13px] accent-[#0078d7]"
                              checked={m.length > 0}
                              ref={(el) => {
                                if (el) el.indeterminate = m.length > 0 && !todos
                              }}
                              onChange={(e) => marcar((p) => g.albaranes.includes(p), e.target.checked)}
                            />
                          </td>
                        )}
                        <td>{g.cliente}</td>
                        <td className="truncate" title={g.nif ? `NIF ${g.nif}` : 'Sin NIF: factura simplificada (F2)'}>
                          {g.nombre}
                          {!g.nif && <span className={i === selGrupo ? '' : 'text-[#c42b1c]'}> (sin NIF)</span>}
                        </td>
                        <td>{g.sucursal ?? ''}</td>
                        <td>{g.tienda}</td>
                        <td className={num}>{modo === 'examinar' ? `${m.length}/${g.albaranes.length}` : g.albaranes.length}</td>
                        <td className={num}>{formatGw(t.base, 2)}</td>
                        <td className={num}>{formatGw(t.igic, 2)}</td>
                        <td className={num}>{formatGw(t.total, 2)}</td>
                      </tr>
                    )
                  })}
                  <FilasVacias cols={modo === 'examinar' ? 9 : 8} ocupadas={grupos.length} total={15} />
                </tbody>
              </table>
            </div>
            {modo === 'examinar' && (
              <div className="flex min-w-0 flex-col gap-1">
                <div className="h-[290px] overflow-auto border border-[var(--gw-border)] bg-white">
                  <table className="gw-grid">
                    <thead className="sticky top-0">
                      <tr>
                        <th style={{ width: 28 }} />
                        <th style={{ width: 36 }}>Ti.</th>
                        <th className="text-center!" style={{ width: 82 }}>
                          Id. Venta
                        </th>
                        <th style={{ width: 92 }}>Fecha</th>
                        <th className="text-center!" style={{ width: 86 }}>
                          Base
                        </th>
                        <th className="text-center!" style={{ width: 76 }}>
                          IGIC
                        </th>
                        <th className="text-center!" style={{ width: 86 }}>
                          Total
                        </th>
                        <th>Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(grupo?.albaranes ?? []).map((a) => (
                        <tr key={`${a.tienda_terminal_codigo}-${a.numero}`} onDoubleClick={() => navigate(`/ventas/${a.tienda_terminal_codigo}/${a.numero}`)} title="Doble clic: abrir la venta">
                          <td className="text-center">
                            <input type="checkbox" className="m-0 h-[13px] w-[13px] accent-[#0078d7]" checked={a.marcado} onChange={(e) => marcar((p) => p === a, e.target.checked)} />
                          </td>
                          <td>{a.tienda_terminal_codigo}</td>
                          <td className={num}>{a.numero}</td>
                          <td>{fechaEs(a.fecha)}</td>
                          <td className={num}>{formatGw(a.subtotal_2, 2)}</td>
                          <td className={num}>{formatGw(a.total_igic_pie, 2)}</td>
                          <td className={num}>{formatGw(a.total, 2)}</td>
                          <td className="truncate">{a.observaciones ?? ''}</td>
                        </tr>
                      ))}
                      <FilasVacias cols={8} ocupadas={grupo?.albaranes.length ?? 0} total={11} />
                    </tbody>
                  </table>
                </div>
                <div className="min-h-[84px] border border-[var(--gw-border-light)] p-1 text-[13px]">
                  <div className="gw-label">Desglose de IGIC de esta factura</div>
                  {desglose && desglose.length > 0 ? (
                    <table className="w-full">
                      <tbody>
                        {desglose.map((d) => (
                          <tr key={d.pct}>
                            <td>IGIC {formatGw(d.pct, 1)} %</td>
                            <td className={num}>Base {formatGw(d.base, 2)}</td>
                            <td className={num}>Cuota {formatGw(d.cuota, 2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  ) : (
                    <span className="text-[#6d6d6d]">{grupo ? 'Calculando…' : 'Selecciona una factura.'}</span>
                  )}
                </div>
              </div>
            )}
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[15px]">
              Facturas: <b>{nFact}</b> · Albaranes: <b>{marcados.length}</b> · Base: <b>{formatGw(totM.base, 2)}</b> · IGIC: <b>{formatGw(totM.igic, 2)}</b> · Total: <b>{formatGw(totM.total, 2)}</b>
            </span>
            <span className="flex gap-1">
              {modo === 'examinar' && (
                <>
                  <button type="button" className="gw-btn !h-[34px] gap-1" onClick={() => marcar(() => true, true)}>
                    <CheckSquare size={15} /> Marcar
                  </button>
                  <button type="button" className="gw-btn !h-[34px] gap-1" onClick={() => marcar(() => true, false)}>
                    <Square size={15} /> Desmarcar
                  </button>
                </>
              )}
              {modo === 'lista' && (
                <button type="button" className="gw-btn !h-[34px] gap-1" onClick={() => window.print()}>
                  <Printer size={15} /> Imprimir
                </button>
              )}
              <button type="button" className="gw-btn !h-[34px] gap-1 font-bold" disabled={generando || !marcados.length} onClick={onGenerar}>
                <Settings2 size={15} />
                {generando ? 'Generando…' : 'Generar'}
              </button>
              <button type="button" className="gw-btn !h-[34px] gap-1" onClick={onCerrar}>
                <X size={15} className="text-[#c42b1c]" /> Cerrar
              </button>
            </span>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}

function NuevaSerieDialog({
  tiendas,
  tienda: tiendaIni,
  onClose,
  onHecho,
}: {
  tiendas: string[]
  tienda: string
  onClose: () => void
  onHecho: (tienda: string, serie: string) => void
}) {
  const [tienda, setTienda] = useState(tiendaIni || tiendas[0] || '')
  const [serie, setSerie] = useState('')
  const [dc, setDc] = useState('')
  const [descripcion, setDescripcion] = useState('')
  const [rect, setRect] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function aceptar() {
    if (!tienda || !serie.trim() || !dc.trim()) return setError('Tienda, serie y D.C. son obligatorios.')
    const { error: e } = await supabase.from('serie_facturacion').insert({
      tienda_terminal_codigo: tienda,
      serie: serie.trim().toUpperCase(),
      digito_control: dc.trim(),
      descripcion: descripcion.trim() || null,
      tipo_factura_defecto: 'F1',
      es_serie_rectificativas: rect,
      activa_verifactu: true,
    })
    if (e) return setError(e.message)
    onHecho(tienda, rect ? '' : serie.trim().toUpperCase())
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title="Nueva serie de facturación" onClose={onClose} className="w-[460px]">
        <div className="grid grid-cols-[80px_110px_80px_minmax(0,1fr)] gap-x-1.5 gap-y-1">
          <GwField label="Tienda">
            <GwSelect value={tienda} onChange={(e) => setTienda(e.target.value)}>
              {tiendas.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </GwSelect>
          </GwField>
          <GwField label="Serie">
            <GwInput autoFocus value={serie} maxLength={10} onChange={(e) => setSerie(e.target.value)} />
          </GwField>
          <GwField label="D.C.">
            <GwInput value={dc} maxLength={4} onChange={(e) => setDc(e.target.value)} />
          </GwField>
          <GwField label="Descripción">
            <GwInput value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          </GwField>
          <GwCheck className="col-span-4" label="Serie de rectificativas" checked={rect} onChange={setRect} />
        </div>
        {error && <p className="mt-1 text-[13px] text-[#c42b1c]">{error}</p>}
        <div className="mt-2 flex justify-end gap-1.5">
          <button type="button" className="gw-btn w-[110px]" onClick={aceptar}>
            <Check size={14} strokeWidth={3} className="text-[#127a12]" />
            <u>A</u>ceptar
          </button>
          <button type="button" className="gw-btn w-[110px]" onClick={onClose}>
            <X size={14} strokeWidth={3} className="text-[#c42b1c]" />
            <u>C</u>ancelar
          </button>
        </div>
      </GwWindow>
    </div>
  )
}
