import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { Check, Minus, Plus, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { usePermisos } from '../../../lib/PermisosContext'
import { useProximoNumero } from '../../../lib/proximoNumero'
import { GwField, GwGroup, GwInput, GwLookupButton, GwNumber, GwSelect, GwTextArea, GwWindow, formatGw } from '../../../components/gw'
import { GwDateTime } from '../../../components/gw/GwDateTime'
import { GwCampoBusqueda } from '../../../components/gw/GwCampoBusqueda'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import { GwOperativa } from '../../../components/gw/GwOperativa'
import { gwConCeros, useListaOrdenada, type GwListaOrdenadaDef } from '../../../components/gw/GwListaOrdenada'
import { defTercero } from '../../../components/gw/listasTerceros'
import { GwAceptar, GwAnterior, GwBuscar, GwCancelar, GwImprimir, GwOrdenar, GwPrimero, GwSalir, GwSiguiente, GwUltimo } from '../../../components/gw/GwIconos'
import { buscarArticulo } from '../../ventas/pedidos/precios'
import { crearPeticion, empleadoActual, etiquetaEstadoPeticion, TIENDA_PETICION, TIPOS_PETICION } from './peticiones'

// Compras → «Generar Petición» (CTRL+P desde cualquier pantalla), calcada de la captura de
// GeminisWin (04/11, ZIP 7): ventana «Generando Peticiones de Artículos» encima de la pantalla
// abierta, con Artículo, Cant. Solicitada, Tipo, Observaciones Petición, Concepto, Fecha y Hora,
// Tienda y Número, Cliente, Proveedor Preferido y Fe. Prev. Entrega; la barra «Mostrar
// Peticiones» (despliega la lista de peticiones con sus Datos de Entrega) con «Mostrar sólo Mis
// Peticiones», «Sólo Pedidos» y «Sólo Devoluciones»; y «Pulse F4 para Aceptar…» con Aceptar /
// Cancelar. Si la ventana abierta es la ficha de un artículo, viene con ese artículo.

/** Evento con el que el menú abre el alta rápida (el atajo CTRL+P lo recoge el propio host). */
export const EVENTO_GENERAR_PETICION = 'gw:generar-peticion'
/** Evento que se lanza al crear una petición, para refrescar las listas abiertas. */
export const EVENTO_PETICION_CREADA = 'gw:peticion-creada'

export function defArticuloPeticion(campo: 'codigo_interno' | 'descripcion'): GwListaOrdenadaDef {
  return {
    fuente: 'articulo',
    campo,
    etiqueta: campo === 'descripcion' ? 'Descripción' : 'Código Interno',
    que: 'Artículos',
    columnas: [
      { key: 'codigo_interno', label: 'Código Interno', width: 120 },
      { key: 'descripcion', label: 'Descripción' },
      { key: 'pvp', label: 'PVP General', width: 100, decimales: 3 },
      { key: 'stock', label: 'Stock', width: 80, decimales: 2 },
      { key: 'familia_codigo', label: 'Familia', width: 80 },
    ],
  }
}

interface ArticuloPet {
  codigo: string
  descripcion: string
  proveedor: string | null
  stock: number
}

export async function datosArticuloPeticion(codigoInterno: string): Promise<ArticuloPet | null> {
  const [{ data: a }, { data: s }] = await Promise.all([
    supabase.from('articulo').select('codigo_interno, descripcion, proveedor_habitual_codigo').eq('codigo_interno', codigoInterno).maybeSingle(),
    supabase.from('articulo_almacen_stock').select('cantidad_actual').eq('articulo_codigo', codigoInterno),
  ])
  if (!a) return null
  return {
    codigo: a.codigo_interno as string,
    descripcion: (a.descripcion as string) ?? '',
    proveedor: a.proveedor_habitual_codigo as string | null,
    stock: (s ?? []).reduce((t, r) => t + Number(r.cantidad_actual ?? 0), 0),
  }
}

/** Fecha prevista de entrega por defecto: dentro de 15 días a las 0:00 (como GeminisWin). */
export function previstaPorDefecto() {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  d.setDate(d.getDate() + 15)
  return d.toISOString()
}

const fechaHoraSeg = (v: string | null) => {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}
const fechaCorta = (v: string | null) => (v ? fechaHoraSeg(v).slice(0, 10) : '')

interface FilaPet {
  t: string
  n: number
  empleado: string | null
  estado: string
  articulo: string
  vendedor: string | null
  fecha: string | null
  prevista: string | null
  cantidad: number
  tramitada: number
  pedidas: number
  cliente: string | null
  nombreCliente: string | null
}

interface Entrega {
  estado: string
  prevista: string | null
  recepcion: string | null
  entrega: string | null
  observ: string | null
}

/** Botón de filtro de la barra: ✓ verde activo, ✗ rojo apagado (como GeminisWin). */
function Interruptor({ on, label, onClick, title }: { on: boolean; label: string; onClick: () => void; title: string }) {
  return (
    <button type="button" className="gw-btn h-[24px] w-full text-[14px]" onClick={onClick} title={title} aria-pressed={on}>
      {on ? <Check size={14} strokeWidth={3} className="text-[#127a12]" /> : <X size={14} strokeWidth={3} className="text-[#c42b1c]" />}
      {label}
    </button>
  )
}

function GenerarPeticionDialog({ articuloInicial, onClose }: { articuloInicial: string | null; onClose: (creada?: { t: string; n: number }) => void }) {
  const listaOrd = useListaOrdenada()
  const [codigo, setCodigo] = useState(articuloInicial ?? '')
  const [art, setArt] = useState<ArticuloPet | null>(null)
  const [cantidad, setCantidad] = useState<number | null>(1)
  const [tipo, setTipo] = useState(0)
  const [concepto, setConcepto] = useState('')
  const [fecha] = useState(() => new Date().toISOString())
  const [tienda, setTienda] = useState(TIENDA_PETICION)
  const [tiendas, setTiendas] = useState<string[]>([TIENDA_PETICION])
  const [cliente, setCliente] = useState('')
  const [nombreCliente, setNombreCliente] = useState('')
  const [proveedor, setProveedor] = useState('')
  const [nombreProveedor, setNombreProveedor] = useState('')
  const [prevista, setPrevista] = useState<string | null>(previstaPorDefecto)
  const [obs, setObs] = useState('')
  const [empleado, setEmpleado] = useState<string | null>(null)
  const [mostrar, setMostrar] = useState(false)
  const [soloMias, setSoloMias] = useState(true)
  const [soloPedidos, setSoloPedidos] = useState(false)
  const [soloDevoluciones, setSoloDevoluciones] = useState(false)
  const [filas, setFilas] = useState<FilaPet[]>([])
  const [sel, setSel] = useState<string>('nueva')
  const [entregas, setEntregas] = useState<Entrega[]>([])
  const [selEntrega, setSelEntrega] = useState(0)
  const [buscarProv, setBuscarProv] = useState(false)
  const [verOperativa, setVerOperativa] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const cantidadRef = useRef<HTMLDivElement>(null)
  const proximo = useProximoNumero(true, tienda, 'peticion')

  useEffect(() => {
    supabase
      .from('tienda_terminal')
      .select('codigo')
      .order('codigo')
      .then(({ data }) => data?.length && setTiendas(data.map((t) => t.codigo as string)))
    empleadoActual().then(setEmpleado)
  }, [])

  async function fijarArticulo(codigoInterno: string) {
    const a = await datosArticuloPeticion(codigoInterno)
    setArt(a)
    setCodigo(a?.codigo ?? codigoInterno)
    setError(a ? null : `No existe el artículo ${codigoInterno}.`)
    if (a) setTimeout(() => cantidadRef.current?.querySelector('input')?.focus(), 0)
  }

  async function resolverArticulo(texto: string) {
    const t = texto.trim()
    if (!t) {
      setArt(null)
      return
    }
    if (art && t === art.codigo) return
    const a = await buscarArticulo(t)
    if (a) await fijarArticulo(a.codigo_interno)
    else {
      setArt(null)
      setError(`No existe el artículo ${t}. Ctrl+Intro o «···»: lista de artículos.`)
    }
  }

  useEffect(() => {
    if (articuloInicial) fijarArticulo(articuloInicial)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function resolverCliente(texto: string) {
    const t = texto.trim()
    if (!t) {
      setCliente('')
      setNombreCliente('')
      return
    }
    const { data } = await supabase.from('cliente').select('codigo, nombre').in('codigo', [t, gwConCeros(t)]).limit(1)
    if (data?.[0]) {
      setCliente(data[0].codigo as string)
      setNombreCliente((data[0].nombre as string) ?? '')
      setError(null)
    } else {
      setNombreCliente('')
      setError(`No existe el cliente ${t}. Ctrl+Intro o «···»: lista de clientes.`)
    }
  }

  async function resolverProveedor(texto: string) {
    const t = texto.trim()
    if (!t) {
      setProveedor('')
      setNombreProveedor('')
      return
    }
    const { data } = await supabase.from('proveedor').select('codigo, nombre').in('codigo', [t, gwConCeros(t)]).limit(1)
    if (data?.[0]) {
      setProveedor(data[0].codigo as string)
      setNombreProveedor((data[0].nombre as string) ?? '')
      setError(null)
    } else {
      setNombreProveedor('')
      setError(`No existe el proveedor ${t}. Pulsa «···» para elegirlo de la lista.`)
    }
  }

  // «Mostrar Peticiones»: las últimas peticiones según los filtros de la barra.
  useEffect(() => {
    if (!mostrar) return
    let cancel = false
    ;(async () => {
      let q = supabase
        .from('peticion')
        .select('tienda_terminal_codigo, numero, empleado_peticion_codigo, estado, articulo_codigo, vendedor_codigo, fecha_hora, fecha_prevista_entrega, cantidad, cantidad_tramitada, origen_cliente_codigo, origen_nombre, tipo')
        .order('fecha_hora', { ascending: false })
        .limit(200)
      if (soloMias && empleado) q = q.eq('empleado_peticion_codigo', empleado)
      if (soloPedidos && !soloDevoluciones) q = q.or('tipo.is.null,tipo.eq.0')
      if (soloDevoluciones && !soloPedidos) q = q.eq('tipo', 1)
      const { data, error: e } = await q
      if (cancel) return
      if (e) return setError(e.message)
      const arts = [...new Set((data ?? []).map((r) => r.articulo_codigo as string))]
      const pedidas = new Map<string, number>()
      if (arts.length) {
        const { data: l } = await supabase.from('pedido_proveedor_linea').select('articulo_codigo, cantidad, unidades_recibidas').in('articulo_codigo', arts).eq('recibido', false)
        for (const r of l ?? []) pedidas.set(r.articulo_codigo as string, (pedidas.get(r.articulo_codigo as string) ?? 0) + Math.max(0, Number(r.cantidad ?? 0) - Number(r.unidades_recibidas ?? 0)))
      }
      if (cancel) return
      setFilas(
        (data ?? []).map((r) => ({
          t: r.tienda_terminal_codigo as string,
          n: Number(r.numero),
          empleado: r.empleado_peticion_codigo as string | null,
          estado: r.estado as string,
          articulo: r.articulo_codigo as string,
          vendedor: r.vendedor_codigo as string | null,
          fecha: r.fecha_hora as string | null,
          prevista: r.fecha_prevista_entrega as string | null,
          cantidad: Number(r.cantidad ?? 0),
          tramitada: Number(r.cantidad_tramitada ?? 0),
          pedidas: pedidas.get(r.articulo_codigo as string) ?? 0,
          cliente: r.origen_cliente_codigo as string | null,
          nombreCliente: r.origen_nombre as string | null,
        })),
      )
    })()
    return () => {
      cancel = true
    }
  }, [mostrar, soloMias, soloPedidos, soloDevoluciones, empleado])

  // Datos de Entrega de la petición elegida en la lista.
  useEffect(() => {
    setSelEntrega(0)
    if (!mostrar || sel === 'nueva') {
      setEntregas([])
      return
    }
    const [t, n] = sel.split('/')
    let cancel = false
    supabase
      .from('peticion_tramitacion')
      .select('fecha_prevista_entrega, fecha_recepcion, fecha_entrega_cliente, observaciones_entrega')
      .eq('tienda_terminal_codigo', t)
      .eq('numero', Number(n))
      .then(({ data }) => {
        if (cancel) return
        setEntregas(
          (data ?? []).map((r) => ({
            estado: r.fecha_entrega_cliente ? 'Entregada' : r.fecha_recepcion ? 'Recibida' : 'Pedida',
            prevista: r.fecha_prevista_entrega as string | null,
            recepcion: r.fecha_recepcion as string | null,
            entrega: r.fecha_entrega_cliente as string | null,
            observ: r.observaciones_entrega as string | null,
          })),
        )
      })
    return () => {
      cancel = true
    }
  }, [sel, mostrar])

  async function aceptar() {
    if (saving) return
    if (!art) return setError('Indica el artículo de la petición (Ctrl+Intro o «···»: lista de artículos).')
    if (!cantidad || cantidad <= 0) return setError('La cantidad solicitada tiene que ser mayor que cero: escribe cuántas unidades se piden.')
    if (cliente && !nombreCliente) return setError(`No existe el cliente ${cliente}: corrígelo o déjalo en blanco.`)
    if (proveedor && !nombreProveedor) return setError(`No existe el proveedor ${proveedor}: corrígelo o déjalo en blanco (se usará el habitual del artículo).`)
    setSaving(true)
    setError(null)
    try {
      const n = await crearPeticion({
        tienda_terminal_codigo: tienda,
        tipo,
        estado: 'pendiente',
        fecha_hora: fecha,
        articulo_codigo: art.codigo,
        descripcion: art.descripcion,
        cantidad,
        cantidad_tramitada: 0,
        empleado_peticion_codigo: empleado,
        vendedor_codigo: null,
        empleado_atencion_codigo: null,
        concepto: concepto.trim() || null,
        origen_tipo: null,
        origen_tienda_terminal_codigo: null,
        origen_movimiento_numero: null,
        origen_almacen_codigo: null,
        origen_cliente_codigo: cliente || null,
        origen_nombre: nombreCliente || null,
        proveedor_codigo: proveedor || null,
        fecha_prevista_entrega: prevista,
        observaciones: obs.trim() || null,
      })
      window.dispatchEvent(new Event(EVENTO_PETICION_CREADA))
      onClose({ t: tienda, n })
    } catch (e) {
      setError((e as Error).message)
      setSaving(false)
    }
  }

  const leg = 'text-[15px]'
  const entregaSel = entregas[selEntrega] ?? null
  const bb = 'flex h-[28px] flex-1 items-center justify-center border-r border-[var(--gw-border-light)] hover:bg-[#e5f1fb] disabled:opacity-40 disabled:hover:bg-transparent'
  const proxInfo = 'Se pasa a la siguiente con la barra de la ficha de Peticiones de Artículos'

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-3"
      onKeyDown={(e) => {
        if (e.key === 'Escape' && !e.defaultPrevented) onClose()
        if (e.key === 'F4') {
          e.preventDefault()
          e.stopPropagation()
          aceptar()
        }
      }}
    >
      <GwWindow title="Generando Peticiones de Artículos" onClose={() => onClose()} className="w-[1200px] max-w-[98vw]">
        <div className="flex flex-col gap-1 text-[13px]">
          <div className="-mb-1 flex justify-end">
            <button type="button" className="gw-btn h-[20px] px-2 text-[12px]" onClick={() => setVerOperativa((v) => !v)} title="Cómo se usa esta ventana">
              {verOperativa ? 'Volver' : 'Operativa'}
            </button>
          </div>
          {verOperativa && (
            <div className="border border-[var(--gw-border)] bg-white p-2">
              <GwOperativa
                bloques={[
                  {
                    titulo: 'Generar una petición',
                    pasos: [
                      'CTRL+P desde cualquier pantalla (o Compras → Generar Petición). En la ficha de un artículo viene con ese artículo.',
                      'Artículo (Intro busca por código o código de barras; Ctrl+Intro o «···», la lista), Cant. Solicitada y Tipo (Pedido o Devolución).',
                      'Si es para un cliente, ponlo en Cliente. Proveedor Preferido: vacío = el habitual del artículo. Fe. Prev. Entrega: a 15 días por defecto.',
                      'F4 o Aceptar graba la petición (Pendiente) y cierra; Cancelar cierra sin grabar.',
                    ],
                  },
                  {
                    titulo: 'Bueno es saber',
                    notas: [
                      '«Mostrar Peticiones» despliega las últimas peticiones (por defecto solo las tuyas) con sus Datos de Entrega; «Sólo Pedidos» y «Sólo Devoluciones» filtran por tipo.',
                      'Para cambiar o tramitar una petición ya grabada, ve a Compras → Peticiones de Artículos.',
                    ],
                  },
                ]}
              />
            </div>
          )}
          {/* Fila 1: Artículo · Cant. Solicitada · Tipo · Observaciones Petición */}
          <div className="grid grid-cols-[minmax(0,1fr)_200px] gap-x-1.5">
            <div className="flex flex-col gap-1">
              <div className="grid grid-cols-[minmax(0,1fr)_150px_200px] items-end gap-x-1.5">
                <GwGroup title={<span className={leg}>Artículo</span>} className="grid grid-cols-[170px_minmax(0,1fr)] items-center gap-x-1">
                  <GwCampoBusqueda
                    editable
                    autoFocus={!articuloInicial}
                    value={codigo}
                    title="PETICION.ARTICULO — Intro busca; Ctrl+Intro: lista de artículos"
                    onChange={setCodigo}
                    onBlur={() => resolverArticulo(codigo)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
                        e.preventDefault()
                        resolverArticulo(codigo)
                      }
                    }}
                    onLista={(t) => listaOrd.abrir(defArticuloPeticion('codigo_interno'), { texto: t, ancla: art?.codigo, onPick: (f) => fijarArticulo(String(f.codigo_interno)) })}
                  />
                  <div className="flex gap-1">
                    <GwInput readOnly tabIndex={-1} value={art?.descripcion ?? ''} title={art ? `Stock (todos los almacenes): ${formatGw(art.stock, 3)} · Proveedor habitual: ${art.proveedor ?? '—'}` : undefined} />
                    <GwLookupButton
                      title="Lista de artículos por descripción"
                      onClick={() => listaOrd.abrir(defArticuloPeticion('descripcion'), { texto: null, ancla: art?.codigo, onPick: (f) => fijarArticulo(String(f.codigo_interno)) })}
                    />
                  </div>
                </GwGroup>
                <GwField label={<span className={`${leg} font-bold`}>Cant. Solicitada</span>}>
                  <div ref={cantidadRef}>
                    <GwNumber value={cantidad} decimals={3} onChange={setCantidad} />
                  </div>
                </GwField>
                <GwField label={<span className={`${leg} font-bold`}>Tipo</span>}>
                  <GwSelect value={String(tipo)} title="PETICION.TIPO" onChange={(e) => setTipo(Number(e.target.value))}>
                    {TIPOS_PETICION.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </GwSelect>
                </GwField>
              </div>
              {/* Fila 2: Concepto · Fecha y Hora · Tienda y Número */}
              <div className="grid grid-cols-[minmax(0,1fr)_150px_200px] items-end gap-x-1.5">
                <GwField label={<span className={leg}>Concepto</span>}>
                  <GwInput value={concepto} title="PETICION.CONCEPTO" onChange={(e) => setConcepto(e.target.value)} />
                </GwField>
                <GwField label={<span className={leg}>Fecha y Hora</span>}>
                  <GwInput value={fechaHoraSeg(fecha)} disabled title="PETICION.FECHA" />
                </GwField>
                <div className="grid grid-cols-[64px_minmax(0,1fr)] items-end gap-x-1 border border-[var(--gw-border-light)] px-1 pb-0.5">
                  <GwField label={<span className={leg}>Tienda</span>}>
                    <GwSelect value={tienda} title="PETICION.TIENDA" onChange={(e) => setTienda(e.target.value)}>
                      {tiendas.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </GwSelect>
                  </GwField>
                  <GwField label={<span className={`${leg} underline`}>Número</span>}>
                    <GwInput className="gw-num" disabled value={proximo == null ? '' : String(proximo)} title="El próximo número libre de la tienda; se confirma al aceptar" />
                  </GwField>
                </div>
              </div>
            </div>
            <div className="flex flex-col">
              <span className={`${leg} font-bold`}>Observaciones Petición</span>
              <GwTextArea className="h-full min-h-[80px] resize-none" value={obs} title="PETICION.OBSERV" onChange={(e) => setObs(e.target.value)} />
            </div>
          </div>

          {/* Fila 3: Cliente · Proveedor Preferido · Fe. Prev. Entrega */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.68fr)_150px] items-end gap-x-1.5">
            <GwGroup title={<span className={leg}>Cliente</span>} className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-x-1">
              <GwCampoBusqueda
                editable
                value={cliente}
                title="PETICION.CLIENTE — Ctrl+Intro: lista de clientes"
                onChange={(v) => {
                  setCliente(v)
                  setNombreCliente('')
                }}
                onBlur={() => resolverCliente(cliente)}
                onLista={(t) =>
                  listaOrd.abrir(defTercero('cliente', 'codigo'), {
                    texto: t,
                    ancla: cliente || null,
                    onPick: (f) => {
                      setCliente(String(f.codigo))
                      setNombreCliente(String(f.nombre ?? ''))
                      setError(null)
                    },
                  })
                }
              />
              <div className="flex gap-1">
                <GwInput readOnly tabIndex={-1} value={nombreCliente} />
                <GwLookupButton
                  title="Lista de clientes por nombre"
                  onClick={() =>
                    listaOrd.abrir(defTercero('cliente', 'nombre'), {
                      texto: null,
                      ancla: cliente || null,
                      onPick: (f) => {
                        setCliente(String(f.codigo))
                        setNombreCliente(String(f.nombre ?? ''))
                        setError(null)
                      },
                    })
                  }
                />
              </div>
            </GwGroup>
            <GwGroup title={<span className={leg}>Proveedor Preferido para Atender la Petición</span>} className="grid grid-cols-[90px_minmax(0,1fr)] items-center gap-x-1">
              <GwInput
                value={proveedor}
                title="PETICION.PROVEEDOR — vacío: se pedirá al proveedor habitual del artículo"
                onChange={(e) => {
                  setProveedor(e.target.value)
                  setNombreProveedor('')
                }}
                onBlur={() => resolverProveedor(proveedor)}
              />
              <div className="flex gap-1">
                <GwInput readOnly tabIndex={-1} value={nombreProveedor || (!proveedor && art?.proveedor ? `(habitual: ${art.proveedor})` : '')} />
                <GwLookupButton title="Buscar proveedor" onClick={() => setBuscarProv(true)} />
              </div>
            </GwGroup>
            <GwField label={<span className={leg}>Fe. Prev.&nbsp; Entrega</span>}>
              <GwDateTime value={prevista} onChange={setPrevista} title="PETICION.FECPREVEN" />
            </GwField>
          </div>

          {/* Barra «Mostrar Peticiones» */}
          <div className="grid grid-cols-[minmax(0,1fr)_210px_120px_160px] items-center gap-x-0.5 border border-[var(--gw-border)] bg-[var(--gw-face)] px-1 py-0.5">
            <button type="button" className="flex items-center gap-2 text-left text-[15px] text-[#1a4fd0]" onClick={() => setMostrar((m) => !m)} title="Ver u ocultar la lista de peticiones">
              <span className="flex h-[14px] w-[14px] items-center justify-center border border-[#555] bg-white text-[#1d3a8a]">{mostrar ? <Minus size={11} strokeWidth={3} /> : <Plus size={11} strokeWidth={3} />}</span>
              Mostrar Peticiones
            </button>
            {mostrar ? (
              <Interruptor on={soloMias} label="Mostrar sólo Mis Peticiones" title="Solo las peticiones que has hecho tú" onClick={() => setSoloMias((v) => !v)} />
            ) : (
              <span />
            )}
            <Interruptor on={soloPedidos} label="Sólo Pedidos" title="Solo las peticiones de tipo Pedido" onClick={() => setSoloPedidos((v) => !v)} />
            <Interruptor on={soloDevoluciones} label="Sólo Devoluciones" title="Solo las peticiones de tipo Devolución" onClick={() => setSoloDevoluciones((v) => !v)} />
          </div>

          {mostrar && (
            <>
              <div className="h-[150px] overflow-auto border border-[var(--gw-border)] bg-white">
                <table className="gw-grid min-w-[1100px]" title="PETICION">
                  <thead className="sticky top-0">
                    <tr>
                      <th style={{ width: 50 }}>Emp.</th>
                      <th style={{ width: 100 }}>Estado</th>
                      <th style={{ width: 95 }}>Cod. Artículo</th>
                      <th style={{ width: 40 }}>Vend.</th>
                      <th style={{ width: 125 }}>Fecha y Hora</th>
                      <th style={{ width: 125 }}>Fec. Prev. Entrega</th>
                      <th style={{ width: 90 }}>Cant. Solicit.</th>
                      <th style={{ width: 90 }}>Cant. Tramit.</th>
                      <th style={{ width: 90 }}>Unids. Ped.</th>
                      <th style={{ width: 80 }}>Id. Cliente</th>
                      <th>Nombre Cliente</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className={sel === 'nueva' ? 'gw-selected' : ''} onClick={() => setSel('nueva')} title="La petición que estás generando">
                      <td>{empleado ?? ''}</td>
                      <td />
                      <td>{art?.codigo ?? ''}</td>
                      <td />
                      <td>{fechaHoraSeg(fecha)}</td>
                      <td>{fechaHoraSeg(prevista)}</td>
                      <td className="text-right">{formatGw(cantidad ?? 0, 3)}</td>
                      <td className="text-right">{formatGw(0, 3)}</td>
                      <td className="text-right">{formatGw(0, 3)}</td>
                      <td>{cliente}</td>
                      <td>{nombreCliente}</td>
                    </tr>
                    {filas.map((f) => {
                      const k = `${f.t}/${f.n}`
                      return (
                        <tr key={k} className={sel === k ? 'gw-selected' : ''} onClick={() => setSel(k)} title={`Petición ${k}`}>
                          <td>{f.empleado ?? ''}</td>
                          <td>{etiquetaEstadoPeticion(f.estado)}</td>
                          <td>{f.articulo}</td>
                          <td>{f.vendedor ?? ''}</td>
                          <td>{fechaHoraSeg(f.fecha)}</td>
                          <td>{fechaHoraSeg(f.prevista)}</td>
                          <td className="text-right">{formatGw(f.cantidad, 3)}</td>
                          <td className="text-right">{formatGw(f.tramitada, 3)}</td>
                          <td className="text-right">{formatGw(f.pedidas, 3)}</td>
                          <td>{f.cliente ?? ''}</td>
                          <td className="truncate">{f.nombreCliente ?? ''}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <GwGroup title={<span className={leg}>Datos de Entrega</span>} className="grid grid-cols-[minmax(0,1fr)_210px] gap-x-2">
                <div className="h-[90px] overflow-auto border border-[var(--gw-border)] bg-white">
                  <table className="gw-grid" title="PETIDETA">
                    <thead className="sticky top-0">
                      <tr>
                        <th>Estado</th>
                        <th>Fec. Prevista</th>
                        <th>Fec. Recep.</th>
                        <th>Fec. Entrega</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entregas.map((e, i) => (
                        <tr key={i} className={i === selEntrega ? 'gw-selected' : ''} onClick={() => setSelEntrega(i)}>
                          <td>{e.estado}</td>
                          <td>{fechaCorta(e.prevista)}</td>
                          <td>{fechaCorta(e.recepcion)}</td>
                          <td>{fechaCorta(e.entrega)}</td>
                        </tr>
                      ))}
                      {Array.from({ length: Math.max(0, 3 - entregas.length) }).map((_, i) => (
                        <tr key={`v${i}`}>
                          <td colSpan={4}>&nbsp;</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex flex-col">
                  <span className={leg}>Observ. de la entrega</span>
                  <GwTextArea className="h-full resize-none" disabled value={entregaSel?.observ ?? ''} />
                </div>
              </GwGroup>
            </>
          )}

          {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[13px] text-[#a4262c]">{error}</div>}

          {mostrar ? (
            // Desplegada, GeminisWin enseña la barra de ficha: aquí solo Aceptar (guardar) y Cancelar.
            <div className="flex border border-[var(--gw-border)] bg-[var(--gw-face)]">
              {[GwPrimero, GwAnterior, GwSiguiente, GwUltimo, GwOrdenar, GwBuscar].map((Icono, i) => (
                <button key={i} type="button" className={bb} disabled title={proxInfo}>
                  <Icono />
                </button>
              ))}
              <button type="button" className={bb} disabled title="Para imprimir peticiones usa el listado de la ficha de Peticiones de Artículos">
                <GwImprimir />
              </button>
              <button type="button" className={bb} disabled={saving} onClick={aceptar} title="Aceptar (F4): graba la petición y cierra la ventana">
                <GwAceptar />
              </button>
              <button type="button" className={bb} disabled={saving} onClick={() => onClose()} title="Cancelar: cierra sin grabar">
                <GwCancelar />
              </button>
              <button type="button" className={`${bb} border-r-0`} onClick={() => onClose()} title="Salir sin grabar">
                <GwSalir />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 border border-[var(--gw-border)] bg-[var(--gw-face)] px-1 py-0.5">
              <span className="flex-1 text-[15px]">Pulse F4 para Aceptar los cambios y Cerrar la ventana</span>
              <button type="button" className="gw-btn h-[30px] w-[105px] text-[15px]" disabled={saving} onClick={aceptar}>
                <Check size={15} strokeWidth={3} className="text-[#127a12]" /> {saving ? 'Grabando…' : 'Aceptar'}
              </button>
              <button type="button" className="gw-btn h-[30px] w-[105px] text-[15px]" disabled={saving} onClick={() => onClose()}>
                <X size={15} strokeWidth={3} className="text-[#c42b1c]" /> Cancelar
              </button>
            </div>
          )}
        </div>
      </GwWindow>
      {buscarProv && (
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
            setProveedor(String(r.codigo))
            setNombreProveedor(String(r.nombre ?? ''))
            setBuscarProv(false)
            setError(null)
          }}
          onClose={() => setBuscarProv(false)}
        />
      )}
      {listaOrd.dialogo}
    </div>
  )
}

/**
 * Host global del alta rápida: CTRL+P desde cualquier pantalla (o el menú Compras → Generar
 * Petición) abre el diálogo; en la ficha de un artículo viene con ese artículo.
 */
export function GenerarPeticionHost() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [abierto, setAbierto] = useState<{ articulo: string | null } | null>(null)
  const [aviso, setAviso] = useState<{ t: string; n: number } | null>(null)
  const ruta = useRef(pathname)
  ruta.current = pathname
  // Permiso de grupo «Generar Petición» (CTRL+P y menú Compras).
  const { tiene } = usePermisos()
  const puedeGenerar = tiene('accion:generar-peticion')
  const permitido = useRef(false)
  useEffect(() => {
    permitido.current = puedeGenerar
  }, [puedeGenerar])

  useEffect(() => {
    const abrir = () => {
      if (!permitido.current) return
      const m = ruta.current.match(/^\/articulos\/([^/]+)$/)
      const codigo = m && m[1] !== 'lista' && m[1] !== 'nuevo' ? decodeURIComponent(m[1]) : null
      setAbierto((a) => a ?? { articulo: codigo })
    }
    const tecla = (ev: KeyboardEvent) => {
      if ((ev.ctrlKey || ev.metaKey) && !ev.altKey && !ev.shiftKey && ev.key.toLowerCase() === 'p') {
        ev.preventDefault()
        abrir()
      }
    }
    window.addEventListener('keydown', tecla)
    window.addEventListener(EVENTO_GENERAR_PETICION, abrir)
    return () => {
      window.removeEventListener('keydown', tecla)
      window.removeEventListener(EVENTO_GENERAR_PETICION, abrir)
    }
  }, [])

  useEffect(() => {
    if (!aviso) return
    const t = setTimeout(() => setAviso(null), 6000)
    return () => clearTimeout(t)
  }, [aviso])

  return (
    <>
      {abierto && (
        <GenerarPeticionDialog
          articuloInicial={abierto.articulo}
          onClose={(creada) => {
            setAbierto(null)
            if (creada) setAviso(creada)
          }}
        />
      )}
      {aviso && (
        <div className="fixed bottom-8 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 border border-[#2a9d2a] bg-[#e7f6e7] px-3 py-1.5 text-[13px] shadow">
          Petición {aviso.t}/{aviso.n} creada (Pendiente).
          <button type="button" className="text-[#1a4fd0] underline" onClick={() => navigate(`/peticiones/${encodeURIComponent(aviso.t)}/${aviso.n}`)}>
            Ver petición
          </button>
        </div>
      )}
    </>
  )
}
