import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Binoculars,
  ChevronFirst,
  ChevronLast,
  FilePen,
  FilePlus2,
  FileX2,
  ListOrdered,
  ReceiptText,
  Play,
  Truck,
} from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { todasLasFilas } from '../../../lib/todasLasFilas'
import { useNexaContexto } from '../../../nexa/contexto'
import { formatGw, GwDate } from '../../../components/gw'
import { GwRecordBar } from '../../../components/gw/GwRecordBar'
import { GwCampoBusqueda } from '../../../components/gw/GwCampoBusqueda'
import { textoRegistro, useNavRegistro, type NavDir } from '../../../components/gw/useNavRegistro'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'

// Ficha de Repartos (Ventas → Repartos en GeminisWin): REPARTOS + REPARLIN.
// Estados de línea según REPARLIN.ESTADO; los del reparto según REPARTOS.ESTADO.

const ESTADOS_LINEA: { value: string; label: string; codigo: number }[] = [
  { value: 'anulado', label: 'Anulado', codigo: 1 },
  { value: 'pendiente', label: 'Pendiente', codigo: 2 },
  { value: 'viene_anterior', label: 'Viene de rep. anterior', codigo: 3 },
  { value: 'entregado', label: 'Entregado', codigo: 4 },
  { value: 'liquidado', label: 'Liquidado', codigo: 5 },
  { value: 'devuelto', label: 'Devuelto', codigo: 6 },
  { value: 'no_entregado', label: 'No Entregado', codigo: 7 },
]

const ESTADOS_REPARTO: { value: number; label: string }[] = [
  { value: 2, label: 'Generado' },
  { value: 4, label: 'Entregado' },
]

interface Reparto {
  tienda_terminal_codigo: string
  numero: number | null
  fecha: string | null
  ruta_codigo: string | null
  repartidor_codigo: string | null
  estado: number | null
  fecha_hora_reparto: string | null
  total_ventas: number | null
  total_pagado: number | null
  observaciones: string | null
}

interface Linea {
  venta_tienda_codigo: string
  venta_numero: number
  orden: number | null
  estado: string
  zona_territorial_codigo: string | null
  contacto: string | null
  direccion: string | null
  codigo_postal: string | null
  poblacion: string | null
  provincia_codigo: string | null
  pais_codigo: string | null
  telefono_fijo: string | null
  telefono_movil: string | null
  email: string | null
  estado_observaciones: string | null
  observaciones: string | null
  reparto_anterior_tienda_codigo: string | null
  reparto_anterior_numero: number | null
  // De la venta (solo lectura)
  venta_fecha: string | null
  venta_total: number | null
  venta_pagado: number | null
  cliente_codigo: string | null
  nombre_cliente: string | null
  factura_numero: number | null
  factura_texto: string | null
}

interface Clave {
  tienda_terminal_codigo: string
  numero: number
}

const CAMPOS_LINEA = [
  'orden',
  'estado',
  'zona_territorial_codigo',
  'contacto',
  'direccion',
  'codigo_postal',
  'poblacion',
  'provincia_codigo',
  'pais_codigo',
  'telefono_fijo',
  'telefono_movil',
  'email',
  'estado_observaciones',
  'observaciones',
  'reparto_anterior_tienda_codigo',
  'reparto_anterior_numero',
] as const

const hoy = () => new Date().toISOString().slice(0, 10)

function fechaEs(v: string | null) {
  if (!v) return ''
  const [a, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

function fechaHoraEs(v: string | null) {
  if (!v) return ' /  /        :  :'
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-ES', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })}`
}

function vacio(tienda: string): Reparto {
  return {
    tienda_terminal_codigo: tienda,
    numero: null,
    fecha: hoy(),
    ruta_codigo: null,
    repartidor_codigo: null,
    estado: 2,
    fecha_hora_reparto: null,
    total_ventas: null,
    total_pagado: null,
    observaciones: null,
  }
}

function lineaDb(l: Linea, cab: Clave) {
  const fila: Record<string, unknown> = {
    tienda_terminal_codigo: cab.tienda_terminal_codigo,
    numero: cab.numero,
    venta_tienda_codigo: l.venta_tienda_codigo,
    venta_numero: l.venta_numero,
  }
  for (const k of CAMPOS_LINEA) fila[k] = l[k]
  return fila
}

const claveLinea = (l: Pick<Linea, 'venta_tienda_codigo' | 'venta_numero'>) => `${l.venta_tienda_codigo}-${l.venta_numero}`

async function cargarLineas(tienda: string, numero: number): Promise<Linea[]> {
  const { data } = await supabase
    .from('reparto_linea')
    .select('*')
    .eq('tienda_terminal_codigo', tienda)
    .eq('numero', numero)
    .order('orden', { ascending: true, nullsFirst: false })
  const filas = (data ?? []) as Record<string, unknown>[]
  if (filas.length === 0) return []
  const numeros = [...new Set(filas.map((f) => Number(f.venta_numero)))]
  const { data: ventas } = await supabase
    .from('venta')
    .select('tienda_terminal_codigo, numero, fecha, total, total_pagado, cliente_codigo, nombre_cliente, factura_tienda_codigo, factura_numero')
    .in('numero', numeros)
  const vs = (ventas ?? []) as Record<string, unknown>[]
  const facturas = vs.filter((v) => v.factura_numero != null)
  const fmap = new Map<string, string>()
  if (facturas.length) {
    const { data: fs } = await supabase
      .from('factura')
      .select('tienda_terminal_codigo, numero, serie, n_factura')
      .in('numero', [...new Set(facturas.map((v) => Number(v.factura_numero)))])
    for (const f of (fs ?? []) as Record<string, unknown>[])
      fmap.set(`${f.tienda_terminal_codigo}-${f.numero}`, `${f.n_factura ?? ''} ${f.serie ?? ''}`.trim())
  }
  const vmap = new Map(vs.map((v) => [`${v.tienda_terminal_codigo}-${v.numero}`, v]))
  let clientes = new Map<string, string>()
  const sinNombre = vs.filter((v) => !v.nombre_cliente && v.cliente_codigo).map((v) => String(v.cliente_codigo))
  if (sinNombre.length) {
    const { data: cs } = await supabase.from('cliente').select('codigo, nombre').in('codigo', [...new Set(sinNombre)])
    clientes = new Map(((cs ?? []) as { codigo: string; nombre: string }[]).map((c) => [c.codigo, c.nombre]))
  }
  return filas.map((f) => {
    const v = vmap.get(`${f.venta_tienda_codigo}-${f.venta_numero}`)
    const fk = v?.factura_numero != null ? `${v.factura_tienda_codigo}-${v.factura_numero}` : null
    return {
      ...(Object.fromEntries(CAMPOS_LINEA.map((k) => [k, f[k] ?? null])) as Pick<Linea, (typeof CAMPOS_LINEA)[number]>),
      estado: String(f.estado ?? 'pendiente'),
      venta_tienda_codigo: String(f.venta_tienda_codigo),
      venta_numero: Number(f.venta_numero),
      venta_fecha: (v?.fecha as string) ?? null,
      venta_total: v?.total != null ? Number(v.total) : null,
      venta_pagado: v?.total_pagado != null ? Number(v.total_pagado) : null,
      cliente_codigo: (v?.cliente_codigo as string) ?? null,
      nombre_cliente: ((v?.nombre_cliente as string) || clientes.get(String(v?.cliente_codigo)) || null) ?? null,
      factura_numero: v?.factura_numero != null ? Number(v.factura_numero) : null,
      factura_texto: fk ? (fmap.get(fk) ?? null) : null,
    }
  })
}

/** Datos de entrega de una venta: los de la sucursal o, si no, los del cliente. */
async function lineaDesdeVenta(v: Record<string, unknown>, orden: number | null, estado = 'pendiente'): Promise<Linea> {
  let datos: Record<string, unknown> = {}
  if (v.cliente_codigo) {
    const { data } = await supabase
      .from('cliente')
      .select('nombre, contacto, direccion, codigo_postal, poblacion, provincia_codigo, pais_codigo, telefono_fijo, telefono_movil, email, zona_territorial_codigo, orden_en_ruta')
      .eq('codigo', v.cliente_codigo as string)
      .maybeSingle()
    datos = (data ?? {}) as Record<string, unknown>
  }
  const s = (k: string) => (datos[k] as string) ?? null
  return {
    venta_tienda_codigo: String(v.tienda_terminal_codigo),
    venta_numero: Number(v.numero),
    orden: orden ?? (datos.orden_en_ruta != null ? Number(datos.orden_en_ruta) : null),
    estado,
    zona_territorial_codigo: s('zona_territorial_codigo'),
    contacto: s('contacto'),
    direccion: s('direccion'),
    codigo_postal: s('codigo_postal'),
    poblacion: s('poblacion'),
    provincia_codigo: s('provincia_codigo'),
    pais_codigo: s('pais_codigo'),
    telefono_fijo: s('telefono_fijo'),
    telefono_movil: s('telefono_movil'),
    email: s('email'),
    estado_observaciones: null,
    observaciones: null,
    reparto_anterior_tienda_codigo: null,
    reparto_anterior_numero: null,
    venta_fecha: (v.fecha as string) ?? null,
    venta_total: v.total != null ? Number(v.total) : null,
    venta_pagado: v.total_pagado != null ? Number(v.total_pagado) : null,
    cliente_codigo: (v.cliente_codigo as string) ?? null,
    nombre_cliente: ((v.nombre_cliente as string) || s('nombre')) ?? null,
    factura_numero: v.factura_numero != null ? Number(v.factura_numero) : null,
    factura_texto: null,
  }
}

async function siguienteNumero(tienda: string) {
  const { data, error } = await supabase.rpc('fn_siguiente_numero', { p_tienda: tienda, p_tipo_documento: 'reparto', p_serie: '' })
  if (error) throw new Error(error.message)
  return Number(data)
}

// Estilo propio de esta ficha: GeminisWin la dibuja con letra grande.
const lbl = 'text-[19px] leading-[22px] whitespace-nowrap'
const inp =
  'h-[30px]! text-[19px]! px-1.5! bg-white border border-[var(--gw-border)] outline-none focus:border-[var(--gw-select)] disabled:bg-white disabled:text-black'

function Grupo({ titulo, children, className = '' }: { titulo: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={`border border-[var(--gw-border-light)] px-1.5 pb-1.5 pt-0 ${className}`}>
      <legend className={`${lbl} px-0.5`}>{titulo}</legend>
      {children}
    </fieldset>
  )
}

function Puntos({ onClick, disabled }: { onClick?: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title="Buscar"
      style={{ opacity: 1, color: '#000' }}
      className="gw-btn h-[30px]! w-[56px] flex-none text-[20px] font-bold leading-[10px] tracking-[2px] pb-[8px]!"
    >
      ···
    </button>
  )
}

function BotonGrande({ icon, children, onClick, disabled, title }: { icon: ReactNode; children: ReactNode; onClick?: () => void; disabled?: boolean; title?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="gw-btn h-[44px]! flex-1 gap-2 text-[20px]! disabled:opacity-60"
    >
      <span className="text-[#1d3a8a]">{icon}</span>
      {children}
    </button>
  )
}

function MiniBtn({ title, onClick, disabled, children }: { title: string; onClick?: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className="flex h-[40px] w-[99px] items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent"
    >
      {children}
    </button>
  )
}

export function RepartoFichaPage() {
  const params = useParams()
  const navigate = useNavigate()
  const ruta = (params['*'] ?? '').split('/').filter(Boolean)
  const isNew = ruta[0] === 'nuevo'
  const claveRuta: Clave | null =
    ruta.length >= 2 && !isNew ? { tienda_terminal_codigo: decodeURIComponent(ruta[0]), numero: Number(ruta[1]) } : null

  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>(isNew ? 'alta' : 'consulta')
  const [cab, setCab] = useState<Reparto>(vacio(''))
  const [draft, setDraft] = useState<Reparto>(vacio(''))
  const [lineas, setLineas] = useState<Linea[]>([])
  const [lineasDraft, setLineasDraft] = useState<Linea[]>([])
  const [sel, setSel] = useState(0)
  const [tab, setTab] = useState<'repartos' | 'adicionales'>('repartos')
  const [subTab, setSubTab] = useState<'todos' | 'actual'>('todos')
  const [tiendas, setTiendas] = useState<string[]>([])
  const [orden, setOrden] = useState<'numero' | 'fecha'>('numero')
  const [nombreRuta, setNombreRuta] = useState('')
  const [nombreRepartidor, setNombreRepartidor] = useState('')
  const [loading, setLoading] = useState(true)
  const [sinRepartos, setSinRepartos] = useState(false)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [buscar, setBuscar] = useState<null | 'reparto' | 'ruta' | 'repartidor' | 'venta'>(null)

  const editing = mode !== 'consulta'
  const lineasVista = editing ? lineasDraft : lineas
  const actual = lineasVista[sel] ?? null

  useEffect(() => {
    supabase
      .from('tienda_terminal')
      .select('codigo')
      .order('codigo')
      .then(({ data }) => setTiendas(((data ?? []) as { codigo: string }[]).map((t) => t.codigo)))
  }, [])

  /** Último reparto (por tienda y número): al abrir sin clave, al cancelar un alta y tras eliminar. */
  async function ultimoReparto(): Promise<Clave | null> {
    const { data } = await supabase
      .from('reparto')
      .select('tienda_terminal_codigo, numero')
      .order('tienda_terminal_codigo', { ascending: false })
      .order('numero', { ascending: false })
      .limit(1)
    const r = (data ?? [])[0] as Clave | undefined
    return r ? { tienda_terminal_codigo: r.tienda_terminal_codigo, numero: Number(r.numero) } : null
  }

  useEffect(() => {
    let cancel = false
    async function run() {
      setError(null)
      setMensaje(null)
      setLoading(true)
      if (isNew) {
        const t = tiendas[0] ?? ''
        setCab(vacio(t))
        setDraft(vacio(t))
        setLineas([])
        setLineasDraft([])
        setMode('alta')
        setSinRepartos(false)
        setLoading(false)
        return
      }
      const clave = claveRuta ?? (await ultimoReparto())
      if (cancel) return
      if (!clave) {
        setSinRepartos(true)
        setCab(vacio(tiendas[0] ?? ''))
        setLineas([])
        setLoading(false)
        return
      }
      if (!claveRuta) {
        navigate(`/repartos/${encodeURIComponent(clave.tienda_terminal_codigo)}/${clave.numero}`, { replace: true })
        return
      }
      const { data } = await supabase
        .from('reparto')
        .select('*')
        .eq('tienda_terminal_codigo', clave.tienda_terminal_codigo)
        .eq('numero', clave.numero)
        .maybeSingle()
      if (cancel) return
      if (!data) {
        setError('No se ha encontrado el reparto.')
        setLoading(false)
        return
      }
      const r = data as Reparto
      const ls = await cargarLineas(clave.tienda_terminal_codigo, clave.numero)
      if (cancel) return
      setCab(r)
      setDraft(r)
      setLineas(ls)
      setLineasDraft(ls)
      setSel(0)
      setMode('consulta')
      setSinRepartos(false)
      setLoading(false)
    }
    run()
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params['*'], tiendas.length])

  const vista = editing ? draft : cab

  useEffect(() => {
    if (!vista.ruta_codigo) return setNombreRuta('')
    supabase
      .from('ruta_reparto')
      .select('descripcion')
      .eq('codigo', vista.ruta_codigo)
      .maybeSingle()
      .then(({ data }) => setNombreRuta((data as { descripcion: string } | null)?.descripcion ?? ''))
  }, [vista.ruta_codigo])

  useEffect(() => {
    if (!vista.repartidor_codigo) return setNombreRepartidor('')
    supabase
      .from('repartidor')
      .select('nombre')
      .eq('codigo', vista.repartidor_codigo)
      .maybeSingle()
      .then(({ data }) => setNombreRepartidor((data as { nombre: string } | null)?.nombre ?? ''))
  }, [vista.repartidor_codigo])

  const totales = useMemo(() => {
    let importe = 0
    let cobrado = 0
    for (const l of lineasVista) {
      importe += l.venta_total ?? 0
      cobrado += l.venta_pagado ?? 0
    }
    return { importe, cobrado }
  }, [lineasVista])

  // Contexto para NEXA: el reparto guardado que se está consultando.
  useNexaContexto(
    !editing && cab.numero != null && !sinRepartos
      ? {
          documento: `Reparto ${cab.tienda_terminal_codigo}-${cab.numero}`,
          fecha: cab.fecha,
          ruta: cab.ruta_codigo,
          nombreRuta,
          repartidor: cab.repartidor_codigo,
          nombreRepartidor,
          estado: ESTADOS_REPARTO.find((e) => e.value === cab.estado)?.label ?? cab.estado,
          numeroVentas: lineas.length,
          ventas: lineas.slice(0, 40).map((l) => ({
            venta: `${l.venta_tienda_codigo}-${l.venta_numero}`,
            cliente: l.cliente_codigo,
            nombre: l.nombre_cliente,
            estado: ESTADOS_LINEA.find((e) => e.value === l.estado)?.label ?? l.estado,
            poblacion: l.poblacion,
          })),
          importeVentas: totales.importe,
          cobrado: totales.cobrado,
        }
      : null,
  )

  // Navegación contra el servidor: solo el registro vecino (gt/lt + limit 1) y el recuento, nunca la
  // lista de claves. Orden por número (tienda, número) o por fecha (fecha, número, tienda).
  const nav = useNavRegistro<Clave>({
    tabla: 'reparto',
    orden: orden === 'numero' ? ['tienda_terminal_codigo', 'numero'] : ['fecha', 'numero', 'tienda_terminal_codigo'],
    actual:
      mode !== 'consulta' || sinRepartos || cab.numero == null
        ? null
        : orden === 'numero'
          ? [cab.tienda_terminal_codigo, cab.numero]
          : [cab.fecha, cab.numero, cab.tienda_terminal_codigo],
    select: 'tienda_terminal_codigo, numero',
    nulos: orden === 'fecha',
  })
  const ir = (c?: Clave | null) => c && navigate(`/repartos/${encodeURIComponent(c.tienda_terminal_codigo)}/${c.numero}`)
  const irNav = async (d: NavDir) => {
    setError(null)
    const k = await nav.ir(d)
    if (k) ir({ tienda_terminal_codigo: k.tienda_terminal_codigo, numero: Number(k.numero) })
  }
  // En consulta, escribir un número en «Número» salta a ese reparto de la tienda que se ve.
  async function buscarNumero(texto: string) {
    const num = Number(texto.replace(/\D/g, ''))
    if (!num) return setError(`«${texto}» no es un número de reparto.`)
    const { data } = await supabase.from('reparto').select('numero').eq('tienda_terminal_codigo', cab.tienda_terminal_codigo).eq('numero', num).maybeSingle()
    if (data) {
      setError(null)
      ir({ tienda_terminal_codigo: cab.tienda_terminal_codigo, numero: num })
    } else setError(`No existe el reparto ${num} en la tienda ${cab.tienda_terminal_codigo}.`)
  }

  function patch(p: Partial<Reparto>) {
    setDraft((d) => ({ ...d, ...p }))
  }

  function patchLinea(i: number, p: Partial<Linea>) {
    setLineasDraft((ls) => ls.map((l, j) => (j === i ? { ...l, ...p } : l)))
  }

  function empezarEdicion() {
    setDraft(cab)
    setLineasDraft(lineas)
    setMode('edicion')
  }

  function cancelar() {
    setError(null)
    if (mode === 'alta') {
      ultimoReparto().then((ult) => (ult ? ir(ult) : navigate('/repartos')))
      return
    }
    setDraft(cab)
    setLineasDraft(lineas)
    setMode('consulta')
  }

  /** Busca (o crea) el reparto abierto siguiente de la misma ruta para arrastrar lo no entregado. */
  async function repartoSiguiente(r: Reparto, numero: number): Promise<Clave> {
    let q = supabase
      .from('reparto')
      .select('tienda_terminal_codigo, numero')
      .eq('estado', 2)
      .gt('numero', numero)
      .eq('tienda_terminal_codigo', r.tienda_terminal_codigo)
      .order('numero')
      .limit(1)
    q = r.ruta_codigo ? q.eq('ruta_codigo', r.ruta_codigo) : q.is('ruta_codigo', null)
    const { data } = await q
    const existe = (data ?? [])[0] as Clave | undefined
    if (existe) return { tienda_terminal_codigo: existe.tienda_terminal_codigo, numero: Number(existe.numero) }
    const nuevo = await siguienteNumero(r.tienda_terminal_codigo)
    const { error: err } = await supabase.from('reparto').insert({
      tienda_terminal_codigo: r.tienda_terminal_codigo,
      numero: nuevo,
      fecha: hoy(),
      ruta_codigo: r.ruta_codigo,
      repartidor_codigo: r.repartidor_codigo,
      estado: 2,
    })
    if (err) throw new Error(err.message)
    return { tienda_terminal_codigo: r.tienda_terminal_codigo, numero: nuevo }
  }

  async function guardar() {
    setError(null)
    setMensaje(null)
    if (!draft.tienda_terminal_codigo) return setError('Indica la tienda.')
    setSaving(true)
    try {
      let numero = draft.numero
      const cerrando = draft.estado === 4 && cab.estado !== 4
      let ls = lineasDraft
      if (cerrando) {
        // Cierre en bloque, como GeminisWin: lo que no se ha tocado pasa a Entregado.
        ls = ls.map((l) => (l.estado === 'pendiente' || l.estado === 'viene_anterior' ? { ...l, estado: 'entregado' } : l))
      }
      const cabecera = {
        fecha: draft.fecha,
        ruta_codigo: draft.ruta_codigo,
        repartidor_codigo: draft.repartidor_codigo,
        estado: draft.estado,
        fecha_hora_reparto: cerrando ? (draft.fecha_hora_reparto ?? new Date().toISOString()) : draft.fecha_hora_reparto,
        observaciones: draft.observaciones,
        total_ventas: ls.reduce((s, l) => s + (l.venta_total ?? 0), 0),
        total_pagado: ls.reduce((s, l) => s + (l.venta_pagado ?? 0), 0),
      }
      if (mode === 'alta') {
        numero = await siguienteNumero(draft.tienda_terminal_codigo)
        const { error: err } = await supabase.from('reparto').insert({ tienda_terminal_codigo: draft.tienda_terminal_codigo, numero, ...cabecera })
        if (err) throw new Error(err.message)
      } else {
        const { error: err } = await supabase
          .from('reparto')
          .update(cabecera)
          .eq('tienda_terminal_codigo', cab.tienda_terminal_codigo)
          .eq('numero', cab.numero!)
        if (err) throw new Error(err.message)
      }
      const clave: Clave = { tienda_terminal_codigo: draft.tienda_terminal_codigo, numero: numero! }

      const antes = new Set(lineas.map(claveLinea))
      const ahora = new Set(ls.map(claveLinea))
      const quitadas = mode === 'alta' ? [] : lineas.filter((l) => !ahora.has(claveLinea(l)))
      for (const l of quitadas) {
        await supabase
          .from('reparto_linea')
          .delete()
          .eq('tienda_terminal_codigo', clave.tienda_terminal_codigo)
          .eq('numero', clave.numero)
          .eq('venta_tienda_codigo', l.venta_tienda_codigo)
          .eq('venta_numero', l.venta_numero)
        await supabase
          .from('venta')
          .update({ reparto_tienda_codigo: null, reparto_numero: null })
          .eq('tienda_terminal_codigo', l.venta_tienda_codigo)
          .eq('numero', l.venta_numero)
          .eq('reparto_numero', clave.numero)
      }
      if (ls.length) {
        const { error: err } = await supabase
          .from('reparto_linea')
          .upsert(ls.map((l) => lineaDb(l, clave)), { onConflict: 'tienda_terminal_codigo,numero,venta_tienda_codigo,venta_numero' })
        if (err) throw new Error(err.message)
      }
      for (const l of ls.filter((x) => !antes.has(claveLinea(x)) || mode === 'alta')) {
        await supabase
          .from('venta')
          .update({ reparto_tienda_codigo: clave.tienda_terminal_codigo, reparto_numero: clave.numero, es_reparto: true })
          .eq('tienda_terminal_codigo', l.venta_tienda_codigo)
          .eq('numero', l.venta_numero)
      }

      let arrastradas = 0
      if (cerrando) {
        const noEntregadas = ls.filter((l) => l.estado === 'no_entregado')
        if (noEntregadas.length) {
          const sig = await repartoSiguiente({ ...draft, tienda_terminal_codigo: clave.tienda_terminal_codigo }, clave.numero)
          const filas = noEntregadas.map((l) =>
            lineaDb(
              {
                ...l,
                estado: 'viene_anterior',
                estado_observaciones: null,
                reparto_anterior_tienda_codigo: clave.tienda_terminal_codigo,
                reparto_anterior_numero: clave.numero,
              },
              sig,
            ),
          )
          const { error: err } = await supabase
            .from('reparto_linea')
            .upsert(filas, { onConflict: 'tienda_terminal_codigo,numero,venta_tienda_codigo,venta_numero' })
          if (err) throw new Error(err.message)
          for (const l of noEntregadas)
            await supabase
              .from('venta')
              .update({ reparto_tienda_codigo: sig.tienda_terminal_codigo, reparto_numero: sig.numero })
              .eq('tienda_terminal_codigo', l.venta_tienda_codigo)
              .eq('numero', l.venta_numero)
          arrastradas = noEntregadas.length
          setMensaje(`Reparto cerrado. ${arrastradas} venta(s) no entregada(s) pasan al reparto ${sig.tienda_terminal_codigo}-${sig.numero}.`)
        } else setMensaje('Reparto cerrado: todas las líneas pendientes pasan a Entregado.')
      }

      setMode('consulta')
      if (mode === 'alta' || arrastradas) nav.refrescar()
      const nuevas = await cargarLineas(clave.tienda_terminal_codigo, clave.numero)
      const r = { ...draft, ...cabecera, numero: clave.numero, tienda_terminal_codigo: clave.tienda_terminal_codigo }
      setCab(r)
      setDraft(r)
      setLineas(nuevas)
      setLineasDraft(nuevas)
      if (mode === 'alta') navigate(`/repartos/${encodeURIComponent(clave.tienda_terminal_codigo)}/${clave.numero}`, { replace: true })
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function eliminar() {
    if (!cab.numero) return
    if (cab.estado === 4) return setError('No se puede eliminar un reparto entregado.')
    if (lineas.some((l) => l.estado === 'liquidado')) return setError('El reparto tiene líneas liquidadas (cobradas): no se puede eliminar.')
    if (!confirm(`¿Eliminar el reparto ${cab.tienda_terminal_codigo}-${cab.numero}? Sus ventas quedarán pendientes de reparto.`)) return
    for (const l of lineas)
      await supabase
        .from('venta')
        .update({ reparto_tienda_codigo: null, reparto_numero: null })
        .eq('tienda_terminal_codigo', l.venta_tienda_codigo)
        .eq('numero', l.venta_numero)
        .eq('reparto_numero', cab.numero)
    const { error: err } = await supabase
      .from('reparto')
      .delete()
      .eq('tienda_terminal_codigo', cab.tienda_terminal_codigo)
      .eq('numero', cab.numero)
    if (err) return setError(err.message)
    nav.refrescar()
    const ult = await ultimoReparto()
    if (ult) ir(ult)
    else navigate('/repartos')
  }

  /** Crea los repartos del día a partir de las ventas pendientes de reparto, agrupadas por ruta. */
  async function generarRepartos() {
    setError(null)
    setMensaje(null)
    const tienda = cab.tienda_terminal_codigo || tiendas[0]
    if (!tienda) return setError('No hay tiendas dadas de alta.')
    if (!confirm('¿Generar los repartos del día con las ventas pendientes de reparto, agrupadas por ruta?')) return
    setSaving(true)
    try {
      // Supabase corta cada respuesta en 1000 filas: por bloques, para no dejar ventas sin reparto.
      const { data: ventas } = await todasLasFilas<Record<string, unknown>>(() =>
        supabase
          .from('venta')
          .select('tienda_terminal_codigo, numero, fecha, total, total_pagado, cliente_codigo, nombre_cliente, factura_numero, ruta_codigo')
          .eq('es_reparto', true)
          .is('reparto_numero', null)
          .lte('fecha', hoy())
          .order('tienda_terminal_codigo')
          .order('numero'),
      )
      if (!ventas.length) {
        setMensaje('No hay ventas pendientes de reparto.')
        return
      }
      const sinRuta: Record<string, unknown>[] = []
      const porRuta = new Map<string, Record<string, unknown>[]>()
      const rutasCliente = new Map<string, string | null>()
      const codigosCliente = [...new Set(ventas.filter((v) => !v.ruta_codigo && v.cliente_codigo).map((v) => String(v.cliente_codigo)))]
      if (codigosCliente.length) {
        const { data: cs } = await supabase.from('cliente').select('codigo, ruta_codigo').in('codigo', codigosCliente)
        for (const c of (cs ?? []) as { codigo: string; ruta_codigo: string | null }[]) rutasCliente.set(c.codigo, c.ruta_codigo)
      }
      for (const v of ventas) {
        const r = (v.ruta_codigo as string) || rutasCliente.get(String(v.cliente_codigo)) || null
        if (!r) {
          sinRuta.push(v)
          continue
        }
        porRuta.set(r, [...(porRuta.get(r) ?? []), v])
      }
      let creados = 0
      for (const [rutaCodigo, vs] of porRuta) {
        const { data: abierto } = await supabase
          .from('reparto')
          .select('tienda_terminal_codigo, numero')
          .eq('tienda_terminal_codigo', tienda)
          .eq('ruta_codigo', rutaCodigo)
          .eq('fecha', hoy())
          .eq('estado', 2)
          .limit(1)
        let clave = ((abierto ?? [])[0] as Clave | undefined) ?? null
        if (!clave) {
          const numero = await siguienteNumero(tienda)
          const { error: err } = await supabase
            .from('reparto')
            .insert({ tienda_terminal_codigo: tienda, numero, fecha: hoy(), ruta_codigo: rutaCodigo, estado: 2 })
          if (err) throw new Error(err.message)
          clave = { tienda_terminal_codigo: tienda, numero }
          creados++
        }
        const nuevas = await Promise.all(vs.map((v) => lineaDesdeVenta(v, null)))
        const { error: err } = await supabase
          .from('reparto_linea')
          .upsert(nuevas.map((l) => lineaDb(l, clave!)), { onConflict: 'tienda_terminal_codigo,numero,venta_tienda_codigo,venta_numero' })
        if (err) throw new Error(err.message)
        for (const v of vs)
          await supabase
            .from('venta')
            .update({ reparto_tienda_codigo: clave.tienda_terminal_codigo, reparto_numero: clave.numero })
            .eq('tienda_terminal_codigo', v.tienda_terminal_codigo as string)
            .eq('numero', v.numero as number)
      }
      nav.refrescar()
      setMensaje(
        `Repartos generados: ${creados} nuevo(s), ${ventas.length - sinRuta.length} venta(s) asignada(s).` +
          (sinRuta.length ? ` ${sinRuta.length} venta(s) sin ruta (ni en la venta ni en el cliente) se quedan pendientes.` : ''),
      )
      if (cab.numero) {
        const ls = await cargarLineas(cab.tienda_terminal_codigo, cab.numero)
        setLineas(ls)
        setLineasDraft(ls)
      }
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  /** Renumera el orden de entrega: primero el orden actual, después el orden del cliente en la ruta. */
  function renumerar() {
    setLineasDraft((ls) =>
      [...ls]
        .sort((a, b) => (a.orden ?? 1e9) - (b.orden ?? 1e9) || a.venta_numero - b.venta_numero)
        .map((l, i) => ({ ...l, orden: i + 1 })),
    )
    setSel(0)
  }

  async function anadirVenta(v: Record<string, unknown>) {
    setBuscar(null)
    const k = `${v.tienda_terminal_codigo}-${v.numero}`
    if (lineasDraft.some((l) => claveLinea(l) === k)) return setError(`La venta ${k} ya está en este reparto.`)
    if (v.reparto_numero != null && Number(v.reparto_numero) !== cab.numero)
      return setError(`La venta ${k} ya está en el reparto ${v.reparto_tienda_codigo}-${v.reparto_numero}.`)
    const maxOrden = lineasDraft.reduce((m, l) => Math.max(m, l.orden ?? 0), 0)
    const l = await lineaDesdeVenta(v, maxOrden + 1)
    setLineasDraft((ls) => [...ls, l])
    setSel(lineasDraft.length)
    setSubTab('actual')
  }

  function quitarLinea() {
    if (!actual) return
    if (actual.estado === 'liquidado') return setError('La línea está liquidada (cobrada): no se puede quitar del reparto.')
    if (!confirm(`¿Quitar la venta ${actual.venta_tienda_codigo}-${actual.venta_numero} del reparto?`)) return
    setLineasDraft((ls) => ls.filter((_, i) => i !== sel))
    setSel((s) => Math.max(0, s - 1))
  }

  const estadoReparto = ESTADOS_REPARTO.find((e) => e.value === vista.estado)?.label ?? ''

  if (loading) return <div className="gw-label p-2">Cargando…</div>

  return (
    <div className="flex min-w-[1180px] flex-col gap-1" style={{ fontFamily: 'Tahoma, Segoe UI, Arial, sans-serif' }}>
      {/* Cabecera */}
      <div className="grid grid-cols-[478px_minmax(0,1fr)_262px] items-start gap-x-5">
        <div className="flex flex-col">
          <Grupo titulo={null} className="pt-1.5">
            <div className="flex gap-2">
              <div className="flex w-[90px] flex-col">
                <span className={lbl}>Tienda</span>
                <select
                  className={`${inp} w-full`}
                  disabled={mode !== 'alta'}
                  value={vista.tienda_terminal_codigo}
                  onChange={(e) => patch({ tienda_terminal_codigo: e.target.value })}
                  title="TIENDA"
                >
                  {!tiendas.includes(vista.tienda_terminal_codigo) && <option value={vista.tienda_terminal_codigo}>{vista.tienda_terminal_codigo}</option>}
                  {tiendas.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex w-[180px] flex-col">
                <span className={lbl}>
                  <u>N</u>úmero
                </span>
                {mode === 'consulta' && !sinRepartos ? (
                  <GwCampoBusqueda className={`${inp} w-full text-right`} value={vista.numero != null ? String(vista.numero) : ''} onBuscar={buscarNumero} title="Número de reparto" />
                ) : (
                  <input className={`${inp} w-full text-right`} disabled value={vista.numero ?? ''} title="Se asigna al guardar" readOnly />
                )}
              </div>
              <div className="flex w-[160px] flex-col">
                <span className={lbl}>Fecha</span>
                <GwDate className={`${inp} w-full`} disabled={!editing} value={vista.fecha} onChange={(v) => patch({ fecha: v })} />
              </div>
            </div>
          </Grupo>
          <div className="mt-[30px] flex items-end">
            {(['repartos', 'adicionales'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`-mb-px border border-[var(--gw-border)] px-3 text-[20px] ${
                  tab === t ? 'z-10 h-[44px] border-b-transparent bg-[var(--gw-face)] font-bold' : 'h-[40px] bg-[#f6f6f6] hover:bg-[#e5f1fb]'
                }`}
              >
                {t === 'repartos' ? 'Repartos' : 'Datos Adicionales'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Grupo titulo="Ruta de Reparto">
            <div className="flex gap-1">
              <input
                className={`${inp} w-[90px]`}
                disabled={!editing}
                value={vista.ruta_codigo ?? ''}
                onChange={(e) => patch({ ruta_codigo: e.target.value || null })}
                title="RUTA"
              />
              <input className={`${inp} min-w-0 flex-1`} disabled readOnly value={nombreRuta} />
              <Puntos disabled={!editing} onClick={() => setBuscar('ruta')} />
            </div>
          </Grupo>
          <Grupo titulo="Repartidor">
            <div className="flex gap-1">
              <input
                className={`${inp} w-[90px]`}
                disabled={!editing}
                value={vista.repartidor_codigo ?? ''}
                onChange={(e) => patch({ repartidor_codigo: e.target.value || null })}
                title="REPARTIDOR"
              />
              <input className={`${inp} min-w-0 flex-1`} disabled readOnly value={nombreRepartidor} />
              <Puntos disabled={!editing} onClick={() => setBuscar('repartidor')} />
            </div>
          </Grupo>
        </div>

        <div className="flex flex-col">
          <span className="text-[21px] leading-[24px]">Estado del Reparto</span>
          <select
            className={`${inp} h-[40px]! w-full text-[28px]! font-bold text-[#1a4fd0]! disabled:text-[#1a4fd0]!`}
            style={{ WebkitTextFillColor: '#1a4fd0' }}
            disabled={!editing}
            value={vista.estado ?? 2}
            onChange={(e) => patch({ estado: Number(e.target.value) })}
            title="REPARTOS.ESTADO (2 Generado, 4 Entregado). Al pasar a Entregado y guardar se cierra el reparto."
          >
            {ESTADOS_REPARTO.map((e) => (
              <option key={e.value} value={e.value}>
                {e.label}
              </option>
            ))}
          </select>
          <span className={`${lbl} mt-2.5`}>Fecha y Hora Reparto</span>
          <input className={`${inp} w-full`} disabled readOnly value={fechaHoraEs(vista.fecha_hora_reparto)} title={estadoReparto} />
        </div>
      </div>

      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-0.5 text-[13px] text-[#c42b1c]">{error}</div>}
      {mensaje && <div className="border border-[var(--gw-border)] bg-white px-2 py-0.5 text-[13px] text-[#1a4fd0]">{mensaje}</div>}
      {sinRepartos && !editing && (
        <div className="px-1 text-[13px] text-[#1a4fd0]">Todavía no hay repartos. Pulsa «Nuevo» o «Generar Repartos».</div>
      )}

      {/* Contenido de pestaña */}
      <div className="border border-[var(--gw-border)] bg-[var(--gw-face)] p-1">
        {tab === 'adicionales' ? (
          <div className="flex flex-col">
            <span className={lbl}>Observaciones</span>
            <textarea
              className="h-[300px] w-full resize-none border border-[var(--gw-border)] bg-white p-1 text-[17px] outline-none disabled:text-black"
              disabled={!editing}
              value={vista.observaciones ?? ''}
              onChange={(e) => patch({ observaciones: e.target.value || null })}
              title="REPARTOS.OBSERV"
            />
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {subTab === 'todos' ? (
              <RejillaLineas
                lineas={lineasVista}
                sel={sel}
                setSel={setSel}
                editing={editing}
                onEstado={(i, estado) => patchLinea(i, { estado })}
                onAbrir={(i) => {
                  setSel(i)
                  setSubTab('actual')
                }}
              />
            ) : (
              <EditarActual linea={actual} editing={editing} onChange={(p) => patchLinea(sel, p)} />
            )}
            <div className="flex items-center justify-between px-1 text-[20px]">
              <span className="text-[#1a4fd0]">Nº de Repartos: {lineasVista.length}</span>
              <span className="flex gap-12 font-bold tabular-nums">
                <span title="Importe de las ventas del reparto">{formatGw(totales.importe, 3)}</span>
                <span title="Cobrado de las ventas del reparto" className="w-[110px] text-right">
                  {formatGw(totales.cobrado, 3)}
                </span>
              </span>
            </div>
            <div className="flex gap-3">
              <BotonGrande icon={<Truck size={18} />} onClick={generarRepartos} disabled={editing || saving}>
                <span>
                  <u>G</u>enerar Repartos
                </span>
              </BotonGrande>
              <BotonGrande icon={<ListOrdered size={18} />} onClick={renumerar} disabled={!editing || lineasVista.length === 0}>
                Renumerar orden de Entrega
              </BotonGrande>
              <BotonGrande
                icon={<ReceiptText size={18} />}
                onClick={() => actual && navigate(`/ventas/${encodeURIComponent(actual.venta_tienda_codigo)}/${actual.venta_numero}`)}
                disabled={!actual || editing}
              >
                <span>
                  <u>I</u>r a la venta Actual
                </span>
              </BotonGrande>
              <BotonGrande
                icon={<ReceiptText size={18} />}
                disabled
                title="Cobros del repartidor: pendiente de la pantalla de cobros de clientes (Facturación → Gestor de Pagos). Mientras, marca la línea como Liquidado."
              >
                <span>
                  <u>P</u>agos Factura
                </span>
              </BotonGrande>
            </div>
            <div className="mt-1 flex items-end justify-between border-t border-[var(--gw-border)] pt-1">
              <div className="flex">
                {(['todos', 'actual'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setSubTab(t)}
                    className={`border border-[var(--gw-border)] px-3 text-[20px] ${
                      subTab === t ? 'h-[42px] border-t-transparent bg-[var(--gw-face)]' : 'h-[40px] bg-[#f6f6f6] hover:bg-[#e5f1fb]'
                    }`}
                  >
                    {t === 'todos' ? 'Ver todos' : 'Editar Actual'}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <div className="flex border border-[var(--gw-border)] bg-[var(--gw-face)]">
                  <MiniBtn title="Primera línea" disabled={!lineasVista.length} onClick={() => setSel(0)}>
                    <ChevronFirst size={16} strokeWidth={3} />
                  </MiniBtn>
                  <MiniBtn title="Línea anterior" disabled={sel <= 0} onClick={() => setSel((s) => Math.max(0, s - 1))}>
                    <Play size={11} className="rotate-180" fill="currentColor" />
                  </MiniBtn>
                  <MiniBtn title="Línea siguiente" disabled={sel >= lineasVista.length - 1} onClick={() => setSel((s) => Math.min(lineasVista.length - 1, s + 1))}>
                    <Play size={11} fill="currentColor" />
                  </MiniBtn>
                  <MiniBtn title="Última línea" disabled={!lineasVista.length} onClick={() => setSel(lineasVista.length - 1)}>
                    <ChevronLast size={16} strokeWidth={3} />
                  </MiniBtn>
                  <MiniBtn title="Buscar venta en el reparto" disabled={!lineasVista.length} onClick={() => {
                    const n = prompt('Nº de venta a localizar en el reparto:')
                    if (!n) return
                    const i = lineasVista.findIndex((l) => String(l.venta_numero) === n.trim())
                    if (i >= 0) setSel(i)
                    else setError(`La venta ${n} no está en este reparto.`)
                  }}>
                    <Binoculars size={16} />
                  </MiniBtn>
                </div>
                <div className="flex border border-[var(--gw-border)] bg-[var(--gw-face)]">
                  <MiniBtn title="Añadir una venta al reparto" disabled={!editing} onClick={() => setBuscar('venta')}>
                    <FilePlus2 size={16} />
                  </MiniBtn>
                  <MiniBtn title="Editar la línea actual" disabled={!actual} onClick={() => setSubTab('actual')}>
                    <FilePen size={16} />
                  </MiniBtn>
                  <MiniBtn title="Quitar la venta del reparto" disabled={!editing || !actual} onClick={quitarLinea}>
                    <FileX2 size={16} className="text-[#c42b1c]" />
                  </MiniBtn>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      <GwRecordBar
        mode={mode}
        canNavigate={mode === 'consulta' && !sinRepartos && cab.numero != null}
        saving={saving}
        onFirst={() => irNav('primero')}
        onPrev={() => irNav('anterior')}
        onNext={() => irNav('siguiente')}
        onLast={() => irNav('ultimo')}
        onSort={() => (setError(null), setOrden((o) => (o === 'numero' ? 'fecha' : 'numero')))}
        onSearch={() => setBuscar('reparto')}
        onPrint={() => window.print()}
        onNew={() => navigate('/repartos/nuevo')}
        onEdit={empezarEdicion}
        onDelete={eliminar}
        onSave={guardar}
        onCancel={cancelar}
        onExit={() => navigate('/')}
      />
      <div className="px-1 text-[11px] text-[#555]">
        Orden: por {orden === 'numero' ? 'número' : 'fecha'}
        {textoRegistro(nav)}
        {mode === 'alta' ? ' · Alta de reparto (el número se asigna al guardar)' : ''}
      </div>

      {buscar === 'reparto' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Localizar reparto"
          table="reparto"
          columns={[
            { key: 'tienda_terminal_codigo', label: 'Tienda', width: 60 },
            { key: 'numero', label: 'Número', width: 90 },
            { key: 'fecha', label: 'Fecha', width: 100 },
            { key: 'ruta_codigo', label: 'Ruta', width: 60 },
            { key: 'repartidor_codigo', label: 'Repartidor' },
          ]}
          searchColumns={['ruta_codigo', 'repartidor_codigo', 'tienda_terminal_codigo']}
          orderBy="numero"
          keyColumn="numero"
          onPick={(r) => {
            setBuscar(null)
            ir({ tienda_terminal_codigo: String(r.tienda_terminal_codigo), numero: Number(r.numero) })
          }}
          onClose={() => setBuscar(null)}
        />
      )}
      {buscar === 'ruta' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Rutas de reparto"
          table="ruta_reparto"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo', 'descripcion']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            patch({ ruta_codigo: String(r.codigo) })
            setBuscar(null)
          }}
          onClose={() => setBuscar(null)}
        />
      )}
      {buscar === 'repartidor' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Repartidores"
          table="repartidor"
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="nombre"
          keyColumn="codigo"
          onPick={(r) => {
            patch({ repartidor_codigo: String(r.codigo) })
            setBuscar(null)
          }}
          onClose={() => setBuscar(null)}
        />
      )}
      {buscar === 'venta' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Añadir venta al reparto"
          table="venta"
          columns={[
            { key: 'tienda_terminal_codigo', label: 'Tie.', width: 50 },
            { key: 'numero', label: 'Nº Venta', width: 90 },
            { key: 'fecha', label: 'Fecha', width: 100 },
            { key: 'cliente_codigo', label: 'Cliente', width: 70 },
            { key: 'nombre_cliente', label: 'Nombre' },
            { key: 'total', label: 'Total', width: 80 },
            { key: 'reparto_numero', label: 'En reparto', width: 80 },
            { key: 'factura_numero', label: 'Factura', width: 70 },
            { key: 'total_pagado', label: 'Pagado', width: 70 },
          ]}
          searchColumns={['nombre_cliente', 'cliente_codigo']}
          orderBy="numero"
          keyColumn="numero"
          onPick={anadirVenta}
          onClose={() => setBuscar(null)}
        />
      )}
    </div>
  )
}

function RejillaLineas({
  lineas,
  sel,
  setSel,
  editing,
  onEstado,
  onAbrir,
}: {
  lineas: Linea[]
  sel: number
  setSel: (i: number) => void
  editing: boolean
  onEstado: (i: number, estado: string) => void
  onAbrir: (i: number) => void
}) {
  const vacias = Math.max(0, 9 - lineas.length)
  const td = 'h-[27px] border-r border-b border-[var(--gw-border-light)] px-1 whitespace-nowrap overflow-hidden'
  return (
    <div className="h-[276px] overflow-auto border border-[var(--gw-border)] bg-white">
      <table className="w-full min-w-[1280px] table-fixed border-collapse text-[19px]">
        <colgroup>
          <col style={{ width: 82 }} />
          <col style={{ width: 216 }} />
          <col style={{ width: 90 }} />
          <col style={{ width: 162 }} />
          <col style={{ width: 172 }} />
          <col style={{ width: 152 }} />
          <col style={{ width: 182 }} />
          <col style={{ width: 156 }} />
          <col style={{ width: 260 }} />
          <col style={{ width: 120 }} />
          <col style={{ width: 120 }} />
        </colgroup>
        <thead className="sticky top-0 z-10 bg-[var(--gw-face)]">
          <tr className="text-[20px]">
            {['Ord.', 'Estado', 'Tie.', 'Nº Venta', 'Fecha', 'Id Factura', 'Nº factura', 'Cliente', 'Nombre Cliente', 'Importe', 'Cobrado'].map((h, i) => (
              <th
                key={h}
                className={`h-[30px] border-r border-b border-[var(--gw-border)] px-1 font-normal ${
                  [3, 4, 5, 6, 7, 9, 10].includes(i) ? 'text-center' : 'text-left'
                }`}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {lineas.map((l, i) => {
            const s = i === sel
            return (
              <tr key={claveLinea(l)} onClick={() => setSel(i)} onDoubleClick={() => onAbrir(i)} className={s ? 'bg-[#cce4f7]' : ''}>
                <td className={`${td} text-right`}>
                  {s && <span className="float-left text-[10px] leading-[27px]">▸</span>}
                  {l.orden ?? ''}
                </td>
                <td className={`${td} p-0`}>
                  <select
                    className="h-[26px] w-full border-0 bg-transparent text-[19px] outline-none disabled:text-black"
                    style={{ WebkitTextFillColor: '#000' }}
                    disabled={!editing}
                    value={l.estado}
                    onChange={(e) => onEstado(i, e.target.value)}
                    title={`REPARLIN.ESTADO ${ESTADOS_LINEA.find((x) => x.value === l.estado)?.codigo ?? ''}`}
                  >
                    {ESTADOS_LINEA.map((e) => (
                      <option key={e.value} value={e.value}>
                        {e.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td className={td}>{l.venta_tienda_codigo}</td>
                <td className={`${td} text-right`}>{l.venta_numero}</td>
                <td className={td}>{fechaEs(l.venta_fecha)}</td>
                <td className={`${td} text-right`}>{l.factura_numero ?? ''}</td>
                <td className={`${td} text-right`}>{l.factura_texto ?? ''}</td>
                <td className={td}>{l.cliente_codigo ?? ''}</td>
                <td className={td}>{l.nombre_cliente ?? ''}</td>
                <td className={`${td} text-right tabular-nums`}>{formatGw(l.venta_total ?? 0, 3)}</td>
                <td className={`${td} text-right tabular-nums`}>{formatGw(l.venta_pagado ?? 0, 3)}</td>
              </tr>
            )
          })}
          {Array.from({ length: vacias }, (_, i) => (
            <tr key={`v${i}`}>
              {Array.from({ length: 11 }, (_, j) => (
                <td key={j} className={td}>
                  &nbsp;
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function EditarActual({ linea, editing, onChange }: { linea: Linea | null; editing: boolean; onChange: (p: Partial<Linea>) => void }) {
  if (!linea) return <div className="flex h-[276px] items-center justify-center text-[17px] text-[#6d6d6d]">No hay ninguna línea seleccionada.</div>
  const campo = (k: keyof Linea, label: string, className = '', title?: string) => (
    <label className={`flex min-w-0 flex-col ${className}`} title={title}>
      <span className="text-[16px] leading-[19px]">{label}</span>
      <input
        className="h-[27px] w-full border border-[var(--gw-border)] bg-white px-1 text-[16px] outline-none disabled:text-black"
        disabled={!editing}
        value={(linea[k] as string | number | null) ?? ''}
        onChange={(e) => onChange({ [k]: e.target.value === '' ? null : e.target.value } as Partial<Linea>)}
      />
    </label>
  )
  return (
    <div className="flex h-[276px] flex-col gap-1.5 overflow-auto p-1">
      <div className="grid grid-cols-[110px_110px_160px_minmax(0,1fr)] gap-2">
        <label className="flex flex-col">
          <span className="text-[16px] leading-[19px]">Nº de Orden</span>
          <input
            type="number"
            className="h-[27px] w-full border border-[var(--gw-border)] bg-white px-1 text-right text-[16px] outline-none disabled:text-black"
            disabled={!editing}
            value={linea.orden ?? ''}
            onChange={(e) => onChange({ orden: e.target.value === '' ? null : Number(e.target.value) })}
          />
        </label>
        <label className="flex flex-col">
          <span className="text-[16px] leading-[19px]">Tienda</span>
          <input className="h-[27px] border border-[var(--gw-border)] bg-white px-1 text-[16px] disabled:text-black" disabled value={linea.venta_tienda_codigo} readOnly />
        </label>
        <label className="flex flex-col">
          <span className="text-[16px] leading-[19px]">Nº de Venta</span>
          <input className="h-[27px] border border-[var(--gw-border)] bg-white px-1 text-right text-[16px] disabled:text-black" disabled value={linea.venta_numero} readOnly />
        </label>
        <label className="flex flex-col">
          <span className="text-[16px] leading-[19px]">Cliente</span>
          <input
            className="h-[27px] border border-[var(--gw-border)] bg-white px-1 text-[16px] disabled:text-black"
            disabled
            readOnly
            value={`${linea.cliente_codigo ?? ''}  ${linea.nombre_cliente ?? ''}`}
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col" title="REPARLIN.OBSERV">
          <span className="text-[16px] leading-[19px]">Observaciones</span>
          <textarea
            className="h-[52px] resize-none border border-[var(--gw-border)] bg-white p-1 text-[16px] outline-none disabled:text-black"
            disabled={!editing}
            value={linea.observaciones ?? ''}
            onChange={(e) => onChange({ observaciones: e.target.value || null })}
          />
        </label>
        <label className="flex flex-col" title="Motivo del estado (p. ej. por qué no se entregó)">
          <span className="text-[16px] leading-[19px]">Observaciones sobre el Estado</span>
          <textarea
            className="h-[52px] resize-none border border-[var(--gw-border)] bg-white p-1 text-[16px] outline-none disabled:text-black"
            disabled={!editing}
            value={linea.estado_observaciones ?? ''}
            onChange={(e) => onChange({ estado_observaciones: e.target.value || null })}
          />
        </label>
      </div>
      <fieldset className="border border-[var(--gw-border-light)] px-1.5 pb-1.5">
        <legend className="px-0.5 text-[16px]">Datos de Entrega</legend>
        <div className="grid grid-cols-[110px_minmax(0,2fr)_minmax(0,1fr)_120px_100px] gap-2">
          {campo('codigo_postal', 'Cód. Postal')}
          {campo('direccion', 'Dirección')}
          {campo('poblacion', 'Población')}
          {campo('provincia_codigo', 'Provincia')}
          {campo('pais_codigo', 'País')}
        </div>
        <div className="mt-1 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_160px_160px] gap-2">
          {campo('email', 'E-mail')}
          {campo('contacto', 'Contacto')}
          {campo('telefono_fijo', 'Tlf. Fijo')}
          {campo('telefono_movil', 'Tlf. Móvil')}
        </div>
        {linea.reparto_anterior_numero != null && (
          <div className="mt-1 text-[14px] text-[#1a4fd0]">
            Viene del reparto anterior {linea.reparto_anterior_tienda_codigo}-{linea.reparto_anterior_numero}
          </div>
        )}
      </fieldset>
    </div>
  )
}
