import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Ban, ShoppingCart } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { avisoNumero, dejarAvisoNumero, tomarAvisoNumero, useProximoNumero } from '../../../lib/proximoNumero'
import { GwField, GwGroup, GwInput, GwLookupButton, GwNumber, GwSelect, GwTextArea, formatGw } from '../../../components/gw'
import { GwDateTime } from '../../../components/gw/GwDateTime'
import { GwCampoBusqueda } from '../../../components/gw/GwCampoBusqueda'
import { GwLookupDialog, type GwLookupColumn } from '../../../components/gw/GwLookupDialog'
import { GwRecordBar } from '../../../components/gw/GwRecordBar'
import { GwOperativa } from '../../../components/gw/GwOperativa'
import { useNavRegistro, type NavDir } from '../../../components/gw/useNavRegistro'
import { gwConCeros, useListaOrdenada } from '../../../components/gw/GwListaOrdenada'
import { defTercero } from '../../../components/gw/listasTerceros'
import { GwAnterior, GwBuscar, GwModificar, GwPrimero, GwSiguiente, GwUltimo } from '../../../components/gw/GwIconos'
import { useNexaContexto } from '../../../nexa/contexto'
import { buscarArticulo } from '../../ventas/pedidos/precios'
import { ESTADOS_PETICION } from '../gestor/opciones'
import { BarButton, fechaEs } from '../../ventas/gestores/comun'
import {
  COLS_PETICION,
  crearPeticion,
  empleadoActual,
  ESTADOS_PETICION_GW,
  ESTADOS_TRAMITABLES,
  etiquetaEstadoPeticion,
  etiquetaTipoPeticion,
  TIENDA_PETICION,
  TIPOS_PETICION,
  type Peticion,
} from './peticiones'
import { datosArticuloPeticion, defArticuloPeticion, EVENTO_PETICION_CREADA, previstaPorDefecto } from './GenerarPeticionDialog'
import { TramitarPeticionesDialog } from './TramitarPeticionesDialog'

// Compras → «Peticiones de Artículos», calcada de la captura de GeminisWin (04/11, ZIP 7):
// cabecera Tienda / Número / Fechahora / Tipo / Estado / «Tipo Origen, Oficina y Número»;
// Artículo con Cantidad Ped. y Cant. Tramit.; Concepto, Empleado Atendida y Empleado Petición;
// Vendedor, Cliente y Observaciones Petición; Almacén Origen Petición, Proveedor por Defecto y
// Fe. Prev. Entrega; y «Datos de Entrega» (PETIDETA, peticion_tramitacion) con su barra y el
// botón «Pedido», más «Observ. de la entrega» a la derecha. Desplegables Tipo y Estado con las
// opciones exactas de GeminisWin (peticiones.ts).

interface Tram {
  of: string
  numPed: number
  linea: number
  fecha: string | null
  cantidad: number
  proveedor: string | null
  almacen: string | null
  prevista: string | null
  recepcion: string | null
  entrega: string | null
  observ: string | null
}

const LOOKUP_PETICION: GwLookupColumn[] = [
  { key: 'tienda_terminal_codigo', label: 'Tienda', width: 60 },
  { key: 'numero', label: 'Número', width: 80 },
  { key: 'articulo_codigo', label: 'Artículo', width: 120 },
  { key: 'descripcion', label: 'Descripción' },
  { key: 'estado', label: 'Estado', width: 120 },
]

/** Tipos de origen conocidos («PEC» = pedido de cliente). */
const ORIGENES = [
  { value: '', label: '' },
  { value: 'PEC', label: 'PEC' },
]

type Dialogo = null | 'buscar' | 'proveedor' | 'tramitar' | 'empleado_atencion' | 'empleado_peticion' | 'vendedor' | 'almacen'
type Nombres = { empAt: string; empPet: string; vendedor: string; almacen: string; proveedor: string; cliente: string }
const SIN_NOMBRES: Nombres = { empAt: '', empPet: '', vendedor: '', almacen: '', proveedor: '', cliente: '' }

function vacia(): Peticion {
  return {
    tienda_terminal_codigo: TIENDA_PETICION,
    numero: null,
    tipo: 0,
    estado: 'pendiente',
    fecha_hora: new Date().toISOString(),
    articulo_codigo: '',
    descripcion: '',
    cantidad: 1,
    cantidad_tramitada: 0,
    empleado_peticion_codigo: null,
    vendedor_codigo: null,
    empleado_atencion_codigo: null,
    concepto: null,
    origen_tipo: null,
    origen_tienda_terminal_codigo: null,
    origen_movimiento_numero: null,
    origen_almacen_codigo: null,
    origen_cliente_codigo: null,
    origen_nombre: null,
    proveedor_codigo: null,
    fecha_prevista_entrega: previstaPorDefecto(),
    observaciones: null,
  }
}

const fechaHoraSeg = (v: string | null) => {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Estado de una entrega según sus fechas (PETIDETA.ESTADO no venía documentado). */
const estadoEntrega = (t: Tram) => (t.entrega ? 'Entregada' : t.recepcion ? 'Recibida' : 'Pedida')

const OPERATIVA = [
  {
    titulo: 'Apuntar una petición',
    pasos: [
      'Pulsa Nuevo (o CTRL+P desde cualquier pantalla para el alta rápida «Generar Petición»).',
      'Elige Tienda, Tipo (Pedido o Devolución) y el Artículo (Intro busca por código o código de barras; Ctrl+Intro o «···», la lista).',
      'Pon la Cantidad Ped., el Cliente si es para un cliente, el Proveedor por Defecto si no quieres el habitual del artículo y la Fe. Prev. Entrega.',
      'Pulsa Aceptar (F4). El número se da al grabar.',
    ],
  },
  {
    titulo: 'Bueno es saber',
    notas: [
      'Estados: Pendiente → Tramitada cuando se acepta el pedido a proveedor → Resuelta al liquidarlo → Entregada al entregarla al cliente. «Tramit. Parcial» y «Resuelta Parcial» cuando solo se ha pedido o recibido una parte.',
      '«Tramitar» crea el pedido a proveedor con lo que falta por pedir (un pedido por proveedor). «Pedido» abre el pedido de la entrega elegida.',
      'Datos de Entrega: un renglón por cada pedido a proveedor con esta petición; a la derecha, sus observaciones.',
      'Una petición ya tramitada no se puede eliminar: anúlala.',
    ],
  },
]

export function PeticionFichaPage() {
  const params = useParams()
  const navigate = useNavigate()
  const resto = (params['*'] ?? '').split('/').filter(Boolean)
  const esNuevo = resto[0] === 'nueva'
  const claveT = !esNuevo && resto.length >= 2 ? decodeURIComponent(resto[0]) : null
  const claveN = !esNuevo && resto.length >= 2 ? Number(resto[1]) : null

  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>(esNuevo ? 'alta' : 'consulta')
  const [reg, setReg] = useState<Peticion | null>(null)
  const [draft, setDraft] = useState<Peticion | null>(null)
  const [orden, setOrden] = useState<'numero' | 'articulo'>('numero')
  const [tram, setTram] = useState<Tram[]>([])
  const [selTram, setSelTram] = useState(0)
  const [nombres, setNombres] = useState<Nombres>(SIN_NOMBRES)
  const [provHabitual, setProvHabitual] = useState<string | null>(null)
  const [tiendas, setTiendas] = useState<string[]>([])
  const [dialogo, setDialogo] = useState<Dialogo>(null)
  const [verOperativa, setVerOperativa] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [refresco, setRefresco] = useState(0)
  const listaOrd = useListaOrdenada()

  const editing = mode !== 'consulta'
  const d = draft ?? reg
  // En alta, el número que tendrá la petición (se asigna de verdad al guardar).
  const proximo = useProximoNumero(mode === 'alta', d?.tienda_terminal_codigo, 'peticion')
  const patch = (p: Partial<Peticion>) => setDraft((x) => (x ? { ...x, ...p } : x))

  useEffect(() => {
    supabase
      .from('tienda_terminal')
      .select('codigo')
      .order('codigo')
      .then(({ data }) => setTiendas((data ?? []).map((t) => t.codigo as string)))
  }, [])

  // Navegación contra el servidor: solo el registro vecino (gt/lt + limit 1) y el recuento.
  const nav = useNavRegistro<{ tienda_terminal_codigo: string; numero: number }>({
    tabla: 'peticion',
    orden: orden === 'numero' ? ['tienda_terminal_codigo', 'numero'] : ['articulo_codigo', 'numero', 'tienda_terminal_codigo'],
    actual:
      mode !== 'consulta' || !reg || reg.numero == null
        ? null
        : orden === 'numero'
          ? [reg.tienda_terminal_codigo, reg.numero]
          : [reg.articulo_codigo, reg.numero, reg.tienda_terminal_codigo],
    select: 'tienda_terminal_codigo, numero',
  })
  const refrescarNav = nav.refrescar

  useEffect(() => {
    window.addEventListener(EVENTO_PETICION_CREADA, refrescarNav)
    return () => window.removeEventListener(EVENTO_PETICION_CREADA, refrescarNav)
  }, [refrescarNav])

  // Documento de la URL, el último si no hay ninguno, o uno vacío en alta.
  useEffect(() => {
    let cancel = false
    async function run() {
      setCargando(true)
      setError(tomarAvisoNumero())
      if (esNuevo) {
        const v = vacia()
        v.empleado_peticion_codigo = await empleadoActual()
        if (cancel) return
        setReg(null)
        setDraft(v)
        setMode('alta')
        setCargando(false)
        return
      }
      let q = supabase.from('peticion').select(COLS_PETICION)
      if (claveT && claveN != null) q = q.eq('tienda_terminal_codigo', claveT).eq('numero', claveN)
      else q = q.order('fecha_hora', { ascending: false }).order('numero', { ascending: false })
      const { data, error: e } = await q.limit(1)
      if (cancel) return
      if (e) setError(e.message)
      const r = ((data ?? [])[0] as Peticion | undefined) ?? null
      setReg(r ? { ...r, cantidad: Number(r.cantidad ?? 0), cantidad_tramitada: Number(r.cantidad_tramitada ?? 0) } : null)
      setDraft(null)
      setMode('consulta')
      setCargando(false)
    }
    run()
    return () => {
      cancel = true
    }
  }, [esNuevo, claveT, claveN, refresco])

  // Nombres de los códigos (empleados, vendedor, almacén, proveedor, cliente) y proveedor habitual.
  const kEmpAt = d?.empleado_atencion_codigo ?? ''
  const kEmpPet = d?.empleado_peticion_codigo ?? ''
  const kVend = d?.vendedor_codigo ?? ''
  const kAlm = d?.origen_almacen_codigo ?? ''
  const kProv = d?.proveedor_codigo ?? ''
  const kCli = d?.origen_cliente_codigo ?? ''
  const kNomCli = d?.origen_nombre ?? ''
  const articulo = d?.articulo_codigo ?? ''
  useEffect(() => {
    let cancel = false
    const nombre = async (tabla: string, codigo: string) => {
      if (!codigo) return ''
      const { data } = await supabase.from(tabla).select('nombre').eq('codigo', codigo).maybeSingle()
      return ((data as { nombre?: string } | null)?.nombre as string | undefined) ?? ''
    }
    Promise.all([
      nombre('empleado', kEmpAt),
      nombre('empleado', kEmpPet),
      nombre('vendedor', kVend),
      nombre('almacen', kAlm),
      nombre('proveedor', kProv),
      kNomCli ? Promise.resolve(kNomCli) : nombre('cliente', kCli),
      articulo ? supabase.from('articulo').select('proveedor_habitual_codigo').eq('codigo_interno', articulo).maybeSingle() : Promise.resolve({ data: null }),
    ]).then(([empAt, empPet, vendedor, almacen, proveedor, cliente, art]) => {
      if (cancel) return
      setNombres({ empAt, empPet, vendedor, almacen, proveedor, cliente })
      setProvHabitual(((art.data as { proveedor_habitual_codigo?: string | null } | null)?.proveedor_habitual_codigo as string | null) ?? null)
    })
    return () => {
      cancel = true
    }
  }, [kEmpAt, kEmpPet, kVend, kAlm, kProv, kCli, kNomCli, articulo])

  // Datos de entrega: pedidos a proveedor con la petición (PETIDETA).
  useEffect(() => {
    setSelTram(0)
    if (!reg?.numero) {
      setTram([])
      return
    }
    let cancel = false
    supabase
      .from('peticion_tramitacion')
      .select(
        'pedido_proveedor_tienda_codigo, pedido_proveedor_numero, pedido_proveedor_linea, fecha_hora, cantidad, proveedor_codigo, almacen_codigo, fecha_prevista_entrega, fecha_recepcion, fecha_entrega_cliente, observaciones_entrega',
      )
      .eq('tienda_terminal_codigo', reg.tienda_terminal_codigo)
      .eq('numero', reg.numero)
      .then(({ data }) => {
        if (cancel) return
        setTram(
          (data ?? []).map((t) => ({
            of: t.pedido_proveedor_tienda_codigo as string,
            numPed: Number(t.pedido_proveedor_numero),
            linea: Number(t.pedido_proveedor_linea),
            fecha: t.fecha_hora as string | null,
            cantidad: Number(t.cantidad ?? 0),
            proveedor: t.proveedor_codigo as string | null,
            almacen: t.almacen_codigo as string | null,
            prevista: t.fecha_prevista_entrega as string | null,
            recepcion: t.fecha_recepcion as string | null,
            entrega: t.fecha_entrega_cliente as string | null,
            observ: t.observaciones_entrega as string | null,
          })),
        )
      })
    return () => {
      cancel = true
    }
  }, [reg])

  useNexaContexto(
    reg && mode === 'consulta'
      ? {
          documento: `Petición de artículo ${reg.tienda_terminal_codigo}/${reg.numero}`,
          tipo: etiquetaTipoPeticion(reg.tipo),
          estado: etiquetaEstadoPeticion(reg.estado),
          articulo: reg.articulo_codigo,
          descripcion: reg.descripcion,
          cantidad: reg.cantidad,
          cantidadTramitada: reg.cantidad_tramitada,
          cliente: reg.origen_cliente_codigo,
          proveedor: reg.proveedor_codigo ?? provHabitual,
          tramitadaEnPedido: tram[0] ? `${tram[0].of}/${tram[0].numPed}` : null,
        }
      : null,
  )

  const ir = (k: { t: string; n: number } | undefined) => k && navigate(`/peticiones/${encodeURIComponent(k.t)}/${k.n}`)
  const irNav = async (dir: NavDir) => {
    const k = await nav.ir(dir)
    if (k) ir({ t: k.tienda_terminal_codigo, n: Number(k.numero) })
    return k
  }

  async function fijarArticulo(codigo: string) {
    const a = await datosArticuloPeticion(codigo)
    if (!a) {
      setError(`No existe el artículo ${codigo}.`)
      return
    }
    setError(null)
    patch({ articulo_codigo: a.codigo, descripcion: a.descripcion })
  }

  async function resolverArticulo(texto: string) {
    const t = texto.trim()
    if (!t || t === reg?.articulo_codigo) return
    const a = await buscarArticulo(t)
    if (a) await fijarArticulo(a.codigo_interno)
    else setError(`No existe el artículo ${t}. Ctrl+Intro: lista de artículos.`)
  }

  async function resolverCliente(texto: string) {
    const t = texto.trim()
    if (!t) return patch({ origen_cliente_codigo: null, origen_nombre: null })
    const { data } = await supabase.from('cliente').select('codigo, nombre').in('codigo', [t, gwConCeros(t)]).limit(1)
    if (data?.[0]) patch({ origen_cliente_codigo: data[0].codigo as string, origen_nombre: (data[0].nombre as string) ?? null })
    else setError(`No existe el cliente ${t}. Ctrl+Intro o «···»: lista de clientes.`)
  }

  async function guardar() {
    if (!draft) return
    if (!draft.articulo_codigo) return setError('Indica el artículo de la petición (Ctrl+Intro o «···»: lista de artículos).')
    if (!draft.cantidad || draft.cantidad <= 0) return setError('La cantidad tiene que ser mayor que cero: escribe cuántas unidades se piden.')
    setSaving(true)
    setError(null)
    try {
      if (mode === 'alta') {
        const n = await crearPeticion({ ...draft })
        window.dispatchEvent(new Event(EVENTO_PETICION_CREADA))
        dejarAvisoNumero(avisoNumero(n, proximo))
        navigate(`/peticiones/${encodeURIComponent(draft.tienda_terminal_codigo)}/${n}`, { replace: true })
      } else {
        const { tienda_terminal_codigo, numero, ...resto } = draft
        const { error: e } = await supabase
          .from('peticion')
          .update({ ...resto, actualizado_en: new Date().toISOString() })
          .eq('tienda_terminal_codigo', tienda_terminal_codigo)
          .eq('numero', numero)
        if (e) throw new Error(e.message)
        setRefresco((r) => r + 1)
      }
    } catch (e) {
      setError((e as Error).message)
    }
    setSaving(false)
  }

  async function borrar() {
    if (!reg?.numero) return
    if (tram.length) return setError('No se puede eliminar: la petición ya está tramitada en un pedido a proveedor. Puedes anularla con «Anular».')
    if (!confirm(`¿Eliminar la petición ${reg.tienda_terminal_codigo}/${reg.numero} (${reg.articulo_codigo} ${reg.descripcion ?? ''})?`)) return
    const vecina = (await nav.ir('siguiente')) ?? (await nav.ir('anterior'))
    const { error: e } = await supabase.from('peticion').delete().eq('tienda_terminal_codigo', reg.tienda_terminal_codigo).eq('numero', reg.numero)
    if (e) return setError(e.message)
    nav.refrescar()
    if (vecina) ir({ t: vecina.tienda_terminal_codigo, n: Number(vecina.numero) })
    else navigate('/peticiones', { replace: true })
  }

  async function anular() {
    if (!reg?.numero || reg.estado === 'anulada') return
    if (!confirm(`¿Anular la petición ${reg.tienda_terminal_codigo}/${reg.numero}?`)) return
    const { error: e } = await supabase
      .from('peticion')
      .update({ estado: 'anulada', actualizado_en: new Date().toISOString() })
      .eq('tienda_terminal_codigo', reg.tienda_terminal_codigo)
      .eq('numero', reg.numero)
    if (e) return setError(e.message)
    setRefresco((r) => r + 1)
  }

  if (cargando && !d) return <div className="p-4 text-[13px]">Cargando…</div>

  const ro = !editing
  const tramitable = !!reg && ESTADOS_TRAMITABLES.includes(reg.estado) && Number(reg.cantidad) > Number(reg.cantidad_tramitada ?? 0)
  const est = ESTADOS_PETICION.find((e) => e.value === d?.estado)
  const pedidoCliente = !!d?.origen_tienda_terminal_codigo && d.origen_movimiento_numero != null && (d.origen_tipo ?? '').toUpperCase().startsWith('PE')
  const entrega = tram[selTram] ?? null
  const origenes = d?.origen_tipo && !ORIGENES.some((o) => o.value === d.origen_tipo) ? [...ORIGENES, { value: d.origen_tipo, label: d.origen_tipo }] : ORIGENES
  const leg = 'text-[15px]'

  /** Código + nombre + «···», como los grupos con marco de GeminisWin. */
  const codigoNombre = (o: { titulo: string; codigo: string; nombre: string; ancho?: number; title: string; editable: boolean; onCodigo?: (v: string) => void; onBlur?: () => void; onLista: () => void }) => (
    <GwGroup title={<span className={leg}>{o.titulo}</span>} className="grid items-center gap-x-1" >
      <div className="grid items-center gap-x-1" style={{ gridTemplateColumns: `${o.ancho ?? 58}px minmax(0,1fr)` }}>
        <GwInput value={o.codigo} disabled={!o.editable} title={o.title} onChange={(e) => o.onCodigo?.(e.target.value)} onBlur={o.onBlur} />
        <div className="flex gap-1">
          <GwInput value={o.nombre} disabled tabIndex={-1} />
          <GwLookupButton disabled={!o.editable} title={`Buscar ${o.titulo.toLowerCase()}`} onClick={o.onLista} />
        </div>
      </div>
    </GwGroup>
  )

  const nb = 'flex h-[28px] w-[72px] items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent'

  return (
    <div className="flex min-h-full flex-col gap-1 text-[13px]">
      <div className="flex justify-end">
        <button type="button" className="gw-btn h-[22px] px-2 text-[12px]" onClick={() => setVerOperativa((v) => !v)} title="Cómo se usa esta pantalla">
          {verOperativa ? 'Volver a la ficha' : 'Operativa'}
        </button>
      </div>
      {verOperativa ? (
        <div className="border border-[var(--gw-border)] bg-white p-2">
          <GwOperativa bloques={OPERATIVA} />
        </div>
      ) : !d ? (
        <div className="p-3">No hay ninguna petición de artículo. Pulsa Nuevo (o CTRL+P desde cualquier pantalla) para dar de alta la primera.</div>
      ) : (
        <>
          {/* Fila 1: Tienda · Número · Fechahora · Tipo · Estado · Tipo Origen, Oficina y Número */}
          <div className="grid grid-cols-[70px_130px_165px_150px_150px_minmax(0,1fr)] items-end gap-x-1.5">
            <GwField label={<span className={leg}>Tienda</span>}>
              <GwSelect value={d.tienda_terminal_codigo} disabled={mode !== 'alta'} onChange={(e) => patch({ tienda_terminal_codigo: e.target.value })} title="PETICION.TIENDA">
                {(tiendas.includes(d.tienda_terminal_codigo) ? tiendas : [d.tienda_terminal_codigo, ...tiendas]).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </GwSelect>
            </GwField>
            <GwField label={<span className={leg}>Número</span>}>
              <GwCampoBusqueda
                value={String(d.numero ?? (mode === 'alta' ? (proximo ?? '') : ''))}
                disabled={editing}
                className="gw-num"
                title={mode === 'alta' ? 'PETICION.NUMERO — el próximo libre; se confirma al guardar' : 'PETICION.NUMERO'}
                onBuscar={async (t) => {
                  const n = Number(t.replace(/\D/g, ''))
                  const { data } = n
                    ? await supabase.from('peticion').select('numero').eq('tienda_terminal_codigo', d.tienda_terminal_codigo).eq('numero', n).maybeSingle()
                    : { data: null }
                  if (data) ir({ t: d.tienda_terminal_codigo, n })
                  else setError(`No existe la petición ${d.tienda_terminal_codigo}/${t}.`)
                }}
              />
            </GwField>
            <GwField label={<span className={leg}>Fechahora</span>}>
              <GwInput value={fechaHoraSeg(d.fecha_hora)} disabled title="PETICION.FECHA" />
            </GwField>
            <GwField label={<span className={leg}>Tipo</span>}>
              <GwSelect value={String(d.tipo === 1 ? 1 : 0)} disabled={ro} title="PETICION.TIPO" onChange={(e) => patch({ tipo: Number(e.target.value) })}>
                {TIPOS_PETICION.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </GwSelect>
            </GwField>
            <GwField label={<span className={leg}>Estado</span>}>
              <GwSelect
                value={d.estado}
                disabled={ro}
                title="PETICION.ESTADO"
                style={est?.bg ? { background: est.bg, color: est.fg, WebkitTextFillColor: est.fg } : undefined}
                onChange={(e) => patch({ estado: e.target.value })}
              >
                {ESTADOS_PETICION_GW.map((e) => (
                  <option key={e.value} value={e.value} style={{ background: '#fff', color: '#000' }}>
                    {e.label}
                  </option>
                ))}
              </GwSelect>
            </GwField>
            <GwGroup title={<span className={leg}>Tipo Origen, Oficina y Número</span>} className="grid grid-cols-[70px_64px_minmax(0,1fr)] items-center gap-x-1">
              <GwSelect value={d.origen_tipo ?? ''} disabled={ro} title="PETICION.ORIGEN — PEC = pedido de cliente" onChange={(e) => patch({ origen_tipo: e.target.value || null })}>
                {origenes.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </GwSelect>
              <GwSelect
                value={d.origen_tienda_terminal_codigo ?? ''}
                disabled={ro}
                title="Oficina (tienda) del documento de origen"
                onChange={(e) => patch({ origen_tienda_terminal_codigo: e.target.value || null })}
              >
                <option value="" />
                {tiendas.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </GwSelect>
              <div className="flex gap-1">
                <GwInput
                  className="gw-num"
                  value={d.origen_movimiento_numero == null ? '' : String(d.origen_movimiento_numero)}
                  disabled={ro}
                  title="Número del documento de origen"
                  onChange={(e) => {
                    const n = e.target.value.replace(/\D/g, '')
                    patch({ origen_movimiento_numero: n ? Number(n) : null })
                  }}
                />
                <GwLookupButton
                  disabled={!pedidoCliente || editing}
                  title={pedidoCliente ? 'Abrir el pedido de cliente que originó la petición' : 'Solo se abre cuando el origen es un pedido de cliente (PEC) con oficina y número'}
                  onClick={() => pedidoCliente && navigate(`/pedidos/${encodeURIComponent(d.origen_tienda_terminal_codigo!)}/${d.origen_movimiento_numero}`)}
                />
              </div>
            </GwGroup>
          </div>

          {/* Fila 2: Artículo · Cantidad Ped. · Cant. Tramit. */}
          <div className="grid grid-cols-[minmax(0,1fr)_125px_125px] items-end gap-x-1.5">
            <GwGroup title={<span className={leg}>Artículo</span>} className="grid grid-cols-[190px_minmax(0,1fr)] items-center gap-x-1">
              <GwCampoBusqueda
                editable={editing && !tram.length}
                disabled={!editing || tram.length > 0}
                value={d.articulo_codigo}
                title="PETICION.ARTICULO"
                onChange={(v) => patch({ articulo_codigo: v, descripcion: '' })}
                onBlur={() => editing && resolverArticulo(d.articulo_codigo)}
                onLista={(t) =>
                  listaOrd.abrir(defArticuloPeticion('codigo_interno'), { texto: t, ancla: d.articulo_codigo || null, onPick: (f) => fijarArticulo(String(f.codigo_interno)) })
                }
              />
              <div className="flex gap-1">
                <GwInput value={d.descripcion ?? ''} disabled={ro} title="PETICION.DESCRIP" onChange={(e) => patch({ descripcion: e.target.value })} />
                <GwLookupButton
                  disabled={!editing || tram.length > 0}
                  title={tram.length ? 'El artículo no se cambia: la petición ya está en un pedido a proveedor' : 'Lista de artículos por descripción'}
                  onClick={() => listaOrd.abrir(defArticuloPeticion('descripcion'), { texto: null, ancla: d.articulo_codigo || null, onPick: (f) => fijarArticulo(String(f.codigo_interno)) })}
                />
              </div>
            </GwGroup>
            <GwField label={<span className={leg}>Cantidad Ped.</span>}>
              <GwNumber value={d.cantidad} decimals={2} disabled={ro} onChange={ro ? undefined : (v) => patch({ cantidad: v ?? 0 })} />
            </GwField>
            <GwField label={<span className={leg}>Cant. Tramit.</span>}>
              <GwNumber value={d.cantidad_tramitada ?? 0} decimals={2} disabled />
            </GwField>
          </div>

          {/* Fila 3: Concepto · Empleado Atendida · Empleado Petición */}
          <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1.2fr)_minmax(0,1fr)] items-end gap-x-1.5">
            <GwField label={<span className={`${leg} font-bold`}>Concepto</span>}>
              <GwInput value={d.concepto ?? ''} disabled={ro} title="PETICION.CONCEPTO" onChange={(e) => patch({ concepto: e.target.value || null })} />
            </GwField>
            {codigoNombre({
              titulo: 'Empleado Atendida',
              codigo: kEmpAt,
              nombre: nombres.empAt,
              title: 'PETICION.EMPATIENDE',
              editable: editing,
              onCodigo: (v) => patch({ empleado_atencion_codigo: v || null }),
              onLista: () => setDialogo('empleado_atencion'),
            })}
            {codigoNombre({
              titulo: 'Empleado Petición',
              codigo: kEmpPet,
              nombre: nombres.empPet,
              title: 'PETICION.EMPLEADO',
              editable: editing,
              onCodigo: (v) => patch({ empleado_peticion_codigo: v || null }),
              onLista: () => setDialogo('empleado_peticion'),
            })}
          </div>

          {/* Filas 4 y 5: Vendedor, Cliente / Almacén, Proveedor, Fe. Prev. Entrega · Observaciones Petición */}
          <div className="grid grid-cols-[minmax(0,1fr)_200px] gap-x-1.5">
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] gap-x-1.5">
                {codigoNombre({
                  titulo: 'Vendedor',
                  codigo: kVend,
                  nombre: nombres.vendedor,
                  title: 'PETICION.VENDEDOR',
                  editable: editing,
                  onCodigo: (v) => patch({ vendedor_codigo: v || null }),
                  onLista: () => setDialogo('vendedor'),
                })}
                <GwGroup title={<span className={leg}>Cliente</span>} className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-x-1">
                  <GwCampoBusqueda
                    editable={editing}
                    disabled={!editing}
                    value={kCli}
                    title="PETICION.CLIENTE"
                    onChange={(v) => patch({ origen_cliente_codigo: v || null, origen_nombre: null })}
                    onBlur={() => editing && d.origen_cliente_codigo && !d.origen_nombre && resolverCliente(d.origen_cliente_codigo)}
                    onLista={(t) =>
                      listaOrd.abrir(defTercero('cliente', 'codigo'), {
                        texto: t,
                        ancla: d.origen_cliente_codigo,
                        onPick: (f) => patch({ origen_cliente_codigo: String(f.codigo), origen_nombre: String(f.nombre ?? '') }),
                      })
                    }
                  />
                  <div className="flex gap-1">
                    <GwInput value={nombres.cliente} disabled tabIndex={-1} />
                    <GwLookupButton
                      disabled={!editing}
                      title="Lista de clientes por nombre"
                      onClick={() =>
                        listaOrd.abrir(defTercero('cliente', 'nombre'), {
                          texto: null,
                          ancla: d.origen_cliente_codigo,
                          onPick: (f) => patch({ origen_cliente_codigo: String(f.codigo), origen_nombre: String(f.nombre ?? '') }),
                        })
                      }
                    />
                  </div>
                </GwGroup>
              </div>
              <div className="grid grid-cols-[minmax(0,0.75fr)_minmax(0,1.1fr)_150px] items-end gap-x-1.5">
                {codigoNombre({
                  titulo: 'Almacén Origen Petición',
                  codigo: kAlm,
                  nombre: nombres.almacen,
                  ancho: 50,
                  title: 'PETICION.ALMACEN',
                  editable: editing,
                  onCodigo: (v) => patch({ origen_almacen_codigo: v || null }),
                  onLista: () => setDialogo('almacen'),
                })}
                {codigoNombre({
                  titulo: 'Proveedor por Defecto para la Petición',
                  codigo: kProv,
                  nombre: kProv ? nombres.proveedor : provHabitual ? `(habitual del artículo: ${provHabitual})` : '',
                  ancho: 80,
                  title: 'PETICION.PROVEEDOR — vacío: se pedirá al proveedor habitual del artículo',
                  editable: editing,
                  onCodigo: (v) => patch({ proveedor_codigo: v || null }),
                  onLista: () => setDialogo('proveedor'),
                })}
                <GwField label={<span className={leg}>Fe. Prev.&nbsp; Entrega</span>}>
                  <GwDateTime
                    value={d.fecha_prevista_entrega}
                    disabled={ro}
                    title="PETICION.FECPREVEN"
                    onChange={(v: string | null) => patch({ fecha_prevista_entrega: v })}
                  />
                </GwField>
              </div>
            </div>
            <div className="flex flex-col">
              <span className={`${leg} font-bold`}>Observaciones Petición</span>
              <GwTextArea className="h-full! min-h-[96px] resize-none!" value={d.observaciones ?? ''} disabled={ro} title="PETICION.OBSERV" onChange={(e) => patch({ observaciones: e.target.value || null })} />
            </div>
          </div>

          {/* Datos de Entrega (PETIDETA) + Observ. de la entrega */}
          <GwGroup title={<span className={leg}>Datos de Entrega</span>} className="grid grid-cols-[minmax(0,1fr)_230px] gap-x-2">
            <div className="flex flex-col gap-1">
              <div className="h-[140px] overflow-auto border border-[var(--gw-border)] bg-white">
                <table className="gw-grid min-w-[900px] whitespace-nowrap" title="PETIDETA">
                  <thead className="sticky top-0">
                    <tr>
                      <th style={{ width: 45 }}>Of.P.</th>
                      <th style={{ width: 90 }}>Num. Ped.</th>
                      <th style={{ width: 45 }}>Nº Lin.</th>
                      <th style={{ width: 110 }} title="Según las fechas de la entrega">
                        Estado
                      </th>
                      <th style={{ width: 90 }}>Fecha</th>
                      <th style={{ width: 80 }}>Cantidad</th>
                      <th style={{ width: 110 }}>Fec. Prevista</th>
                      <th style={{ width: 110 }}>Fec. Recep.</th>
                      <th style={{ width: 110 }}>Fec. Entrega</th>
                      <th style={{ width: 80 }}>Proveedor</th>
                      <th style={{ width: 45 }}>Alm.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tram.map((t, i) => (
                      <tr
                        key={`${t.of}/${t.numPed}/${t.linea}`}
                        className={i === selTram ? 'gw-selected' : ''}
                        onClick={() => setSelTram(i)}
                        onDoubleClick={() => navigate(`/pedidos-proveedor/${encodeURIComponent(t.of)}/${t.numPed}`)}
                      >
                        <td>{t.of}</td>
                        <td className="text-right">{t.numPed}</td>
                        <td className="text-right">{t.linea}</td>
                        <td>{estadoEntrega(t)}</td>
                        <td>{fechaEs(t.fecha)}</td>
                        <td className="text-right">{formatGw(t.cantidad, 2)}</td>
                        <td>{fechaEs(t.prevista)}</td>
                        <td>{fechaEs(t.recepcion)}</td>
                        <td>{fechaEs(t.entrega)}</td>
                        <td>{t.proveedor}</td>
                        <td>{t.almacen}</td>
                      </tr>
                    ))}
                    {Array.from({ length: Math.max(0, 5 - tram.length) }).map((_, i) => (
                      <tr key={`v${i}`}>
                        <td colSpan={11}>&nbsp;</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="flex border border-[var(--gw-border)] bg-[var(--gw-face)]">
                  <button type="button" className={nb} title="Primera entrega" disabled={!tram.length} onClick={() => setSelTram(0)}>
                    <GwPrimero />
                  </button>
                  <button type="button" className={nb} title="Entrega anterior" disabled={!tram.length} onClick={() => setSelTram((i) => Math.max(0, i - 1))}>
                    <GwAnterior />
                  </button>
                  <button type="button" className={nb} title="Entrega siguiente" disabled={!tram.length} onClick={() => setSelTram((i) => Math.min(tram.length - 1, i + 1))}>
                    <GwSiguiente />
                  </button>
                  <button type="button" className={nb} title="Última entrega" disabled={!tram.length} onClick={() => setSelTram(tram.length - 1)}>
                    <GwUltimo />
                  </button>
                  <button
                    type="button"
                    className={nb}
                    title="Buscar entrega por número de pedido"
                    disabled={!tram.length}
                    onClick={() => {
                      const q = window.prompt('Número de pedido a proveedor:')?.trim()
                      const i = q ? tram.findIndex((t) => String(t.numPed) === q) : -1
                      if (i >= 0) setSelTram(i)
                    }}
                  >
                    <GwBuscar />
                  </button>
                  <button
                    type="button"
                    className={`${nb} border-r-0`}
                    disabled
                    title="Las fechas y observaciones de la entrega se cambian desde el pedido a proveedor (recepción) o al entregar al cliente"
                  >
                    <GwModificar />
                  </button>
                </div>
                <BarButton
                  title="Abrir el pedido a proveedor de la entrega elegida"
                  className="h-[30px]! w-[100px] text-[15px]! text-[#000]"
                  disabled={!entrega}
                  onClick={() => entrega && navigate(`/pedidos-proveedor/${encodeURIComponent(entrega.of)}/${entrega.numPed}`)}
                >
                  <ShoppingCart size={14} className="text-[#2a9d2a]" /> Pedido
                </BarButton>
                <span className="flex-1" />
                <BarButton
                  title={tramitable ? 'Crear el pedido a proveedor con lo que falta por pedir de esta petición' : 'Solo se tramitan peticiones Pendientes o Atendidas con algo por pedir'}
                  className="h-[30px]! w-[110px] text-[14px]! text-[#000]"
                  disabled={editing || !tramitable}
                  onClick={() => setDialogo('tramitar')}
                >
                  <ShoppingCart size={14} className="text-[#1d3a8a]" /> Tramitar
                </BarButton>
                <BarButton
                  title="Anular la petición (no se borra)"
                  className="h-[30px]! w-[100px] text-[14px]! text-[#000]"
                  disabled={editing || !reg || reg.estado === 'anulada'}
                  onClick={anular}
                >
                  <Ban size={14} className="text-[#c42b1c]" /> Anular
                </BarButton>
              </div>
            </div>
            <div className="flex flex-col">
              <span className={leg}>Observ. de la entrega</span>
              <GwTextArea className="h-full! min-h-[150px] resize-none!" disabled value={entrega?.observ ?? ''} title="PETIDETA.OBSERV — de la entrega elegida en la rejilla" />
            </div>
          </GwGroup>
        </>
      )}

      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
      <div className="flex-1" />
      <GwRecordBar
        mode={mode}
        canNavigate={!editing && !!nav.total}
        saving={saving}
        onFirst={() => irNav('primero')}
        onPrev={() => irNav('anterior')}
        onNext={() => irNav('siguiente')}
        onLast={() => irNav('ultimo')}
        onSort={() => setOrden((o) => (o === 'numero' ? 'articulo' : 'numero'))}
        onSearch={() => setDialogo('buscar')}
        onNew={() => navigate('/peticiones/nueva')}
        onEdit={() => {
          if (!reg) return
          setDraft({ ...reg })
          setMode('edicion')
        }}
        onDelete={borrar}
        onSave={guardar}
        onCancel={() => {
          setError(null)
          if (mode === 'alta') {
            irNav('ultimo').then((k) => !k && navigate('/peticiones', { replace: true }))
          } else {
            setDraft(null)
            setMode('consulta')
          }
        }}
        onExit={() => navigate('/')}
      />
      <div className="text-[11px] text-[#444]">
        {nav.posicion != null && nav.total != null ? `Petición ${nav.posicion} de ${nav.total}` : nav.total != null ? `${nav.total} peticiones` : ''} · orden por{' '}
        {orden === 'numero' ? 'número' : 'artículo'}
        {mode === 'alta' ? ' · Alta de petición' : mode === 'edicion' ? ' · Modificando' : ''}
      </div>

      {dialogo === 'buscar' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Buscar Petición de Artículo"
          table="peticion"
          columns={LOOKUP_PETICION}
          searchColumns={['articulo_codigo', 'descripcion', 'estado']}
          orderBy="numero"
          keyColumn="numero"
          onPick={(r) => {
            setDialogo(null)
            ir({ t: String(r.tienda_terminal_codigo), n: Number(r.numero) })
          }}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'proveedor' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Buscar Proveedor"
          table="proveedor"
          eq={{ tipo: 'proveedor' }}
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="nombre"
          keyColumn="codigo"
          onPick={(r) => {
            setDialogo(null)
            patch({ proveedor_codigo: String(r.codigo) })
          }}
          onClose={() => setDialogo(null)}
        />
      )}
      {(dialogo === 'empleado_atencion' || dialogo === 'empleado_peticion' || dialogo === 'vendedor' || dialogo === 'almacen') && (
        <GwLookupDialog<Record<string, unknown>>
          title={dialogo === 'vendedor' ? 'Buscar Vendedor' : dialogo === 'almacen' ? 'Buscar Almacén' : 'Buscar Empleado'}
          table={dialogo === 'vendedor' ? 'vendedor' : dialogo === 'almacen' ? 'almacen' : 'empleado'}
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            const c = String(r.codigo)
            if (dialogo === 'empleado_atencion') patch({ empleado_atencion_codigo: c })
            if (dialogo === 'empleado_peticion') patch({ empleado_peticion_codigo: c })
            if (dialogo === 'vendedor') patch({ vendedor_codigo: c })
            if (dialogo === 'almacen') patch({ origen_almacen_codigo: c })
            setDialogo(null)
          }}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'tramitar' && reg?.numero != null && (
        <TramitarPeticionesDialog
          claves={[{ t: reg.tienda_terminal_codigo, n: reg.numero }]}
          onClose={() => setDialogo(null)}
          onHecho={() => setRefresco((r) => r + 1)}
        />
      )}
      {listaOrd.dialogo}
    </div>
  )
}
