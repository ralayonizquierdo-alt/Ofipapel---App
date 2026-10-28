import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Ban, Link2, Package, ShoppingCart } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwDate, GwField, GwGroup, GwInput, GwLookupButton, GwNumber, GwSelect, GwTextArea, formatGw } from '../../../components/gw'
import { GwCampoBusqueda } from '../../../components/gw/GwCampoBusqueda'
import { GwLookupDialog, type GwLookupColumn } from '../../../components/gw/GwLookupDialog'
import { GwRecordBar } from '../../../components/gw/GwRecordBar'
import { useNavRegistro, type NavDir } from '../../../components/gw/useNavRegistro'
import { gwConCeros, useListaOrdenada } from '../../../components/gw/GwListaOrdenada'
import { defTercero } from '../../../components/gw/listasTerceros'
import { useNexaContexto } from '../../../nexa/contexto'
import { buscarArticulo } from '../../ventas/pedidos/precios'
import { ESTADOS_PETICION, fechaHoraEs } from '../gestor/opciones'
import { BarButton, fechaEs } from '../../ventas/gestores/comun'
import { COLS_PETICION, crearPeticion, empleadoActual, ESTADOS_TRAMITABLES, TIENDA_PETICION, type Peticion } from './peticiones'
import { datosArticuloPeticion, defArticuloPeticion, EVENTO_PETICION_CREADA } from './GenerarPeticionDialog'
import { TramitarPeticionesDialog } from './TramitarPeticionesDialog'

// Compras → «Peticiones de Artículos». SIN CAPTURA de GeminisWin: ficha montada sobre PETICION
// (peticion) y PETIDETA (peticion_tramitacion) con el estilo de las fichas de Compras, los datos
// que enseña el Gestor de pedidos a proveedores (pestaña Peticiones) y los estados confirmados por
// Luis: Pendiente, Atendida, Parcial tramitada, Parcial resuelta, Tramitada, Resuelta, Entregada, Anulada.

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

function vacia(): Peticion {
  return {
    tienda_terminal_codigo: TIENDA_PETICION,
    numero: null,
    tipo: null,
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
    fecha_prevista_entrega: null,
    observaciones: null,
  }
}

const etiquetaEstado = (v: string) => ESTADOS_PETICION.find((e) => e.value === v)?.label ?? v

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
  const [info, setInfo] = useState<{ stock: number; pedido: number; provHabitual: string | null; nombreProv: string }>({ stock: 0, pedido: 0, provHabitual: null, nombreProv: '' })
  const [tiendas, setTiendas] = useState<string[]>([])
  const [almacenes, setAlmacenes] = useState<{ codigo: string; nombre: string }[]>([])
  const [dialogo, setDialogo] = useState<null | 'buscar' | 'proveedor' | 'tramitar'>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [cargando, setCargando] = useState(true)
  const [refresco, setRefresco] = useState(0)
  const listaOrd = useListaOrdenada()

  const editing = mode !== 'consulta'
  const d = draft ?? reg
  const patch = (p: Partial<Peticion>) => setDraft((x) => (x ? { ...x, ...p } : x))

  useEffect(() => {
    supabase
      .from('tienda_terminal')
      .select('codigo')
      .order('codigo')
      .then(({ data }) => setTiendas((data ?? []).map((t) => t.codigo as string)))
    supabase
      .from('almacen')
      .select('codigo, nombre')
      .order('codigo')
      .then(({ data }) => setAlmacenes((data ?? []) as { codigo: string; nombre: string }[]))
  }, [])

  // Navegación contra el servidor: solo el registro vecino (gt/lt + limit 1) y el recuento, nunca la
  // lista de claves (que se cortaba en 1000 y había que bajar entera al abrir).
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
      setError(null)
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

  // Stock, unidades pedidas a proveedor y proveedor habitual del artículo.
  const articulo = d?.articulo_codigo ?? ''
  const provPet = d?.proveedor_codigo ?? ''
  useEffect(() => {
    if (!articulo) {
      setInfo({ stock: 0, pedido: 0, provHabitual: null, nombreProv: '' })
      return
    }
    let cancel = false
    Promise.all([
      supabase.from('articulo_almacen_stock').select('cantidad_actual').eq('articulo_codigo', articulo),
      supabase.from('pedido_proveedor_linea').select('cantidad, unidades_recibidas').eq('articulo_codigo', articulo).eq('recibido', false),
      supabase.from('articulo').select('proveedor_habitual_codigo').eq('codigo_interno', articulo).maybeSingle(),
    ]).then(async ([s, l, a]) => {
      const prov = provPet || (a.data?.proveedor_habitual_codigo as string | null) || null
      const { data: p } = prov ? await supabase.from('proveedor').select('nombre').eq('codigo', prov).maybeSingle() : { data: null }
      if (cancel) return
      setInfo({
        stock: (s.data ?? []).reduce((t, r) => t + Number(r.cantidad_actual ?? 0), 0),
        pedido: (l.data ?? []).reduce((t, r) => t + Math.max(0, Number(r.cantidad ?? 0) - Number(r.unidades_recibidas ?? 0)), 0),
        provHabitual: (a.data?.proveedor_habitual_codigo as string | null) ?? null,
        nombreProv: (p?.nombre as string | undefined) ?? '',
      })
    })
    return () => {
      cancel = true
    }
  }, [articulo, provPet])

  // Datos de entrega: pedidos a proveedor con la petición (PETIDETA).
  useEffect(() => {
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
          estado: etiquetaEstado(reg.estado),
          articulo: reg.articulo_codigo,
          descripcion: reg.descripcion,
          cantidad: reg.cantidad,
          cantidadTramitada: reg.cantidad_tramitada,
          cliente: reg.origen_cliente_codigo,
          proveedor: reg.proveedor_codigo ?? info.provHabitual,
          tramitadaEnPedido: tram[0] ? `${tram[0].of}/${tram[0].numPed}` : null,
        }
      : null,
  )

  const ir = (k: { t: string; n: number } | undefined) => k && navigate(`/peticiones/${encodeURIComponent(k.t)}/${k.n}`)
  const irNav = async (d: NavDir) => {
    const k = await nav.ir(d)
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
    else setError(`No existe el cliente ${t}.`)
  }

  async function guardar() {
    if (!draft) return
    if (!draft.articulo_codigo) return setError('Indica el artículo de la petición.')
    if (!draft.cantidad || draft.cantidad <= 0) return setError('La cantidad tiene que ser mayor que cero.')
    setSaving(true)
    setError(null)
    try {
      if (mode === 'alta') {
        const n = await crearPeticion({ ...draft })
        window.dispatchEvent(new Event(EVENTO_PETICION_CREADA))
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
    if (tram.length) return setError('No se puede eliminar: la petición ya está tramitada en un pedido a proveedor. Puedes anularla.')
    if (!confirm(`¿Eliminar la petición ${reg.tienda_terminal_codigo}/${reg.numero} (${reg.articulo_codigo} ${reg.descripcion ?? ''})?`)) return
    // La vecina se pide antes de borrar (después ya no hay registro actual desde el que buscarla).
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
  const pedidoCliente = d?.origen_tienda_terminal_codigo && d.origen_movimiento_numero != null && (d.origen_tipo ?? '').toUpperCase().startsWith('PE')

  return (
    <div className="flex min-h-full flex-col gap-1 text-[13px]">
      {!d ? (
        <div className="p-3">No hay ninguna petición de artículo. Pulsa Nuevo (o CTRL+P desde cualquier pantalla) para dar de alta la primera.</div>
      ) : (
        <>
          <div className="grid grid-cols-[90px_110px_170px_170px_70px_150px_minmax(0,1fr)] items-end gap-x-2">
            <GwField label="Tienda">
              {mode === 'alta' ? (
                <GwSelect value={d.tienda_terminal_codigo} onChange={(e) => patch({ tienda_terminal_codigo: e.target.value })} title="PETICION.TIENDA">
                  {tiendas.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </GwSelect>
              ) : (
                <GwInput value={d.tienda_terminal_codigo} disabled title="PETICION.TIENDA" />
              )}
            </GwField>
            <GwField label="Número">
              <GwCampoBusqueda
                value={d.numero == null ? '' : String(d.numero)}
                disabled={editing}
                className="gw-num"
                title="PETICION.NUMERO"
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
            <GwField label="Fecha y Hora">
              <GwInput value={fechaHoraEs(d.fecha_hora)} disabled title="PETICION.FECHA" />
            </GwField>
            <GwField label="Estado">
              <GwSelect
                value={d.estado}
                disabled={ro}
                title="PETICION.ESTADO"
                style={est?.bg ? { background: est.bg, color: est.fg, WebkitTextFillColor: est.fg } : undefined}
                onChange={(e) => patch({ estado: e.target.value })}
              >
                {ESTADOS_PETICION.map((e) => (
                  <option key={e.value} value={e.value} style={{ background: '#fff', color: '#000' }}>
                    {e.label}
                  </option>
                ))}
              </GwSelect>
            </GwField>
            <GwField label="Tipo">
              <GwInput value={d.tipo == null ? '' : String(d.tipo)} disabled title="PETICION.TIPO (código de GeminisWin sin documentar)" />
            </GwField>
            <GwField label="Fe. Prev. Entrega">
              <GwDate
                value={d.fecha_prevista_entrega?.slice(0, 10) ?? null}
                disabled={ro}
                onChange={ro ? undefined : (v) => patch({ fecha_prevista_entrega: v })}
                title="PETICION.FECPREVEN"
              />
            </GwField>
            <span className="self-center text-right text-[12px] text-[#1a4fd0]" title="Orden de Primero / Anterior / Siguiente / Último (botón Ordenar)">
              {nav.posicion != null && nav.total != null ? `Petición ${nav.posicion} de ${nav.total}` : nav.total != null ? `${nav.total} peticiones` : ''} · orden por{' '}
              {orden === 'numero' ? 'número' : 'artículo'}
            </span>
          </div>

          <GwGroup title="Artículo Solicitado" className="grid grid-cols-[170px_minmax(0,1fr)_120px_120px_120px_120px] items-end gap-x-2">
            <GwField label="Código">
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
            </GwField>
            <GwField label="Descripción">
              <div className="flex gap-1">
                <GwInput value={d.descripcion ?? ''} disabled={ro} title="PETICION.DESCRIP" onChange={(e) => patch({ descripcion: e.target.value })} />
                <GwLookupButton
                  disabled={!editing || tram.length > 0}
                  title="Lista de artículos por descripción"
                  onClick={() => listaOrd.abrir(defArticuloPeticion('descripcion'), { texto: null, ancla: d.articulo_codigo || null, onPick: (f) => fijarArticulo(String(f.codigo_interno)) })}
                />
              </div>
            </GwField>
            <GwField label="Cant. Petic.">
              <GwNumber value={d.cantidad} decimals={3} disabled={ro} onChange={ro ? undefined : (v) => patch({ cantidad: v ?? 0 })} />
            </GwField>
            <GwField label="Cant. Tram.">
              <GwNumber value={d.cantidad_tramitada ?? 0} decimals={3} disabled />
            </GwField>
            <GwField label="Stock">
              <GwNumber value={info.stock} decimals={3} disabled />
            </GwField>
            <GwField label="Uds. Ped.">
              <GwNumber value={info.pedido} decimals={3} disabled />
            </GwField>
          </GwGroup>

          <GwGroup title="Origen de la Petición" className="flex flex-col gap-1">
            <div className="grid grid-cols-[120px_minmax(0,1fr)_70px_minmax(0,1fr)_150px_120px] items-end gap-x-2">
              <GwField label="Cliente">
                <GwCampoBusqueda
                  editable={editing}
                  disabled={!editing}
                  value={d.origen_cliente_codigo ?? ''}
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
              </GwField>
              <GwField label="Nombre">
                <GwInput value={d.origen_nombre ?? ''} disabled={ro} onChange={(e) => patch({ origen_nombre: e.target.value })} />
              </GwField>
              <GwField label="Orig.">
                <GwInput value={d.origen_tipo ?? ''} disabled title="PETICION.ORIGEN" />
              </GwField>
              <GwField label="Concepto">
                <GwInput value={d.concepto ?? ''} disabled={ro} title="PETICION.CONCEPTO" onChange={(e) => patch({ concepto: e.target.value || null })} />
              </GwField>
              <GwField label="Almacén">
                <GwSelect value={d.origen_almacen_codigo ?? ''} disabled={ro} onChange={(e) => patch({ origen_almacen_codigo: e.target.value || null })}>
                  <option value="" />
                  {almacenes.map((a) => (
                    <option key={a.codigo} value={a.codigo}>
                      {a.codigo} {a.nombre}
                    </option>
                  ))}
                </GwSelect>
              </GwField>
              <GwField label="Ti. y Nº">
                <GwInput value={d.origen_tienda_terminal_codigo ? `${d.origen_tienda_terminal_codigo} ${d.origen_movimiento_numero ?? ''}` : ''} disabled />
              </GwField>
            </div>
            <div className="grid grid-cols-[120px_120px_120px_120px_minmax(0,1fr)] items-end gap-x-2">
              <GwField label="Empl. Petición">
                <GwInput value={d.empleado_peticion_codigo ?? ''} disabled />
              </GwField>
              <GwField label="Vendedor">
                <GwInput value={d.vendedor_codigo ?? ''} disabled />
              </GwField>
              <GwField label="Empl. Atención">
                <GwInput value={d.empleado_atencion_codigo ?? ''} disabled />
              </GwField>
              <GwField label="Prov. Pet.">
                <div className="flex gap-1">
                  <GwInput value={d.proveedor_codigo ?? ''} disabled={ro} title="Vacío: se pedirá al proveedor habitual del artículo" onChange={(e) => patch({ proveedor_codigo: e.target.value || null })} />
                  <GwLookupButton disabled={ro} onClick={() => setDialogo('proveedor')} title="Buscar proveedor" />
                </div>
              </GwField>
              <GwField label={d.proveedor_codigo ? 'Proveedor' : 'Proveedor Habitual del Artículo'}>
                <GwInput value={`${d.proveedor_codigo ? '' : (info.provHabitual ?? '') + ' '}${info.nombreProv}`.trim()} disabled />
              </GwField>
            </div>
          </GwGroup>

          <GwGroup title="Observaciones">
            <GwTextArea rows={2} value={d.observaciones ?? ''} disabled={ro} title="PETICION.OBSERV" onChange={(e) => patch({ observaciones: e.target.value || null })} />
          </GwGroup>

          <GwGroup title="Datos de Entrega, Pedidos con la Petición" className="flex flex-col gap-1">
            <div className="h-[86px] overflow-y-auto border border-[var(--gw-border)] bg-white">
              <table className="gw-grid" title="PETIDETA">
                <thead className="sticky top-0">
                  <tr>
                    <th style={{ width: 45 }}>Of.</th>
                    <th style={{ width: 90 }}>Num. Ped</th>
                    <th style={{ width: 50 }}>Nº L</th>
                    <th style={{ width: 150 }}>Fecha</th>
                    <th style={{ width: 100 }}>Cantidad</th>
                    <th style={{ width: 90 }}>Proveedor</th>
                    <th style={{ width: 50 }}>Alm.</th>
                    <th style={{ width: 100 }}>Fec. Previst</th>
                    <th style={{ width: 100 }}>Fec. Recep.</th>
                    <th style={{ width: 100 }}>Fec. Entrega</th>
                    <th>Observ.</th>
                  </tr>
                </thead>
                <tbody>
                  {tram.map((t) => (
                    <tr key={`${t.of}/${t.numPed}/${t.linea}`} className="gw-selected" onDoubleClick={() => navigate(`/pedidos-proveedor/${encodeURIComponent(t.of)}/${t.numPed}`)}>
                      <td>{t.of}</td>
                      <td className="text-right">{t.numPed}</td>
                      <td className="text-right">{t.linea}</td>
                      <td>{fechaHoraEs(t.fecha)}</td>
                      <td className="text-right">{formatGw(t.cantidad, 3)}</td>
                      <td>{t.proveedor}</td>
                      <td>{t.almacen}</td>
                      <td>{fechaEs(t.prevista)}</td>
                      <td>{fechaEs(t.recepcion)}</td>
                      <td>{fechaEs(t.entrega)}</td>
                      <td className="truncate">{t.observ}</td>
                    </tr>
                  ))}
                  {!tram.length && (
                    <tr>
                      <td colSpan={11} className="text-[#6d6d6d]">
                        {reg ? 'La petición no está tramitada en ningún pedido a proveedor.' : ''}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="flex gap-1.5">
              <BarButton
                title="Crear el pedido a proveedor con esta petición (o con todas las pendientes)"
                className="h-[32px]! w-[200px] text-[15px]! text-[#000]"
                disabled={editing || !tramitable}
                onClick={() => setDialogo('tramitar')}
              >
                <ShoppingCart size={15} className="text-[#2a9d2a]" /> Tramitar a Pedido
              </BarButton>
              <BarButton
                title="Abrir el pedido a proveedor de la petición"
                className="h-[32px]! w-[150px] text-[15px]! text-[#000]"
                disabled={!tram[0]}
                onClick={() => tram[0] && navigate(`/pedidos-proveedor/${encodeURIComponent(tram[0].of)}/${tram[0].numPed}`)}
              >
                <ShoppingCart size={15} className="text-[#1d3a8a]" /> Pedido Prov.
              </BarButton>
              <BarButton
                title="Abrir la ficha del artículo"
                className="h-[32px]! w-[130px] text-[15px]! text-[#000]"
                disabled={!d.articulo_codigo}
                onClick={() => navigate(`/articulos/${encodeURIComponent(d.articulo_codigo)}`)}
              >
                <Package size={15} className="text-[#2a9d2a]" /> Artículo
              </BarButton>
              <BarButton
                title="Abrir el pedido de cliente que originó la petición"
                className="h-[32px]! w-[150px] text-[15px]! text-[#000]"
                disabled={!pedidoCliente}
                onClick={() => navigate(`/pedidos/${encodeURIComponent(d.origen_tienda_terminal_codigo!)}/${d.origen_movimiento_numero}`)}
              >
                <Link2 size={15} className="text-[#2a9d2a]" /> Ped. Cliente
              </BarButton>
              <span className="flex-1" />
              <BarButton
                title="Anular la petición (no se borra)"
                className="h-[32px]! w-[120px] text-[15px]! text-[#000]"
                disabled={editing || !reg || reg.estado === 'anulada'}
                onClick={anular}
              >
                <Ban size={15} className="text-[#c42b1c]" /> Anular
              </BarButton>
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
