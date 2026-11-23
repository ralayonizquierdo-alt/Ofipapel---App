import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Link2, Package, Printer, ShoppingCart } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { avisoTope, todasLasFilas } from '../../../lib/todasLasFilas'
import { formatGw } from '../../../components/gw'
import { BarButton, chunks, fechaEs, LocalizarDialog, OptionButton } from '../../ventas/gestores/comun'
import { ordenar, Rejilla, type Col, type Orden } from '../../ventas/gestores/rejilla'
import { BarraGestor, buscarFila } from './barra'
import { ESTADOS_PETICION, fechaHoraEs, type OpcionesGestorCompras } from './opciones'
import { TramitarPeticionesDialog } from '../peticiones/TramitarPeticionesDialog'
import { ESTADOS_TRAMITABLES } from '../peticiones/peticiones'
import { Globo, ImprimirResueltasDialog } from '../peticiones/ImprimirResueltasDialog'
import { useResueltasNuevas } from '../peticiones/resueltas'

interface PeticionRow {
  key: string
  /** De GeminisWin (espejo, solo consulta) o del ERP. */
  gw: boolean
  tienda: string
  numero: number
  articulo: string
  descripcion: string
  estado: string
  proveedor: string | null
  ultCompra: string | null
  fecha: string | null
  cantidad: number
  tramitada: number
  stock: number
  udsPed: number
  tipo: number | null
  prevista: string | null
  origenTipo: string | null
  concepto: string | null
  almacen: string | null
  cliente: string | null
  empleado: string | null
  vendedor: string | null
  origenTienda: string | null
  origenNumero: number | null
}

interface TramRow {
  key: string
  gw: boolean
  of: string
  numPed: number
  linea: number
  estado: number | null
  fecha: string | null
  cantidad: number
  prevista: string | null
  recepcion: string | null
  entrega: string | null
  proveedor: string | null
  almacen: string | null
  empleado: string | null
  observ: string | null
}

// Peticiones de GeminisWin (espejo gw_peticion, Rober 22/11/2026): salen junto a las del ERP, marcadas «GeminisWin», solo
// para consultar (no se tramitan ni se cambian desde aquí: siguen llevándose en GeminisWin). PETICION.ESTADO va en el
// mismo orden que los botones: 1 Pendiente, 2 Atendida, 3 Parcial Tr., 4 Parc. Res., 5 Tramitada, 6 Resuelta,
// 7 Entregada, 8 Anulada (deducido de los datos: las 1-2 sin seguimiento, las 4 y 6 con recepción, la 7 la mayoría).
const ESTADO_GW = ['pendiente', 'atendida', 'parcial_tramitada', 'parcial_resuelta', 'tramitada', 'resuelta', 'entregada', 'anulada']
const estadoGw = (n: number | null) => (n != null && n >= 1 && n <= 8 ? ESTADO_GW[n - 1] : String(n ?? ''))

const etiquetaEstado = (v: string) => ESTADOS_PETICION.find((e) => e.value === v)?.label ?? v

/** Máximo de peticiones de la pestaña; si hay más, avisa de que se afine el filtro. */
const TOPE_PETICIONES = 5000

export function TabPeticiones({ opciones, onError }: { opciones: OpcionesGestorCompras; onError: (m: string | null) => void }) {
  const navigate = useNavigate()
  const [estados, setEstados] = useState<Set<string>>(() => new Set(['pendiente']))
  const [rows, setRows] = useState<PeticionRow[]>([])
  const [tram, setTram] = useState<TramRow[]>([])
  const [sel, setSel] = useState(0)
  const [selT, setSelT] = useState(0)
  const [ord, setOrd] = useState<Orden | null>(null)
  const [ordT, setOrdT] = useState<Orden | null>(null)
  const [cargando, setCargando] = useState(false)
  const [localizar, setLocalizar] = useState(false)
  const [tramitar, setTramitar] = useState(false)
  const [imprimirResueltas, setImprimirResueltas] = useState(false)
  const resueltasNuevas = useResueltasNuevas()

  const cargar = useCallback(
    async (est: Set<string>) => {
      setCargando(true)
      onError(null)
      const q = () => {
        const b = supabase
          .from('peticion')
          .select(
            'tienda_terminal_codigo, numero, tipo, estado, fecha_hora, articulo_codigo, descripcion, cantidad, cantidad_tramitada, empleado_peticion_codigo, vendedor_codigo, concepto, origen_tipo, origen_tienda_terminal_codigo, origen_movimiento_numero, origen_almacen_codigo, origen_cliente_codigo, proveedor_codigo, fecha_prevista_entrega',
          )
          .order('fecha_hora', { ascending: false })
          .order('tienda_terminal_codigo')
          .order('numero')
        return est.size ? b.in('estado', [...est]) : b
      }
      // Supabase corta cada respuesta en 1000 filas: por bloques, con tope y aviso.
      const { data: lista, error, cortado } = await todasLasFilas(q, { tope: TOPE_PETICIONES })
      if (error) {
        onError(error)
        setCargando(false)
        return
      }
      const qGw = () => {
        const b = supabase
          .from('gw_peticion')
          .select('oficina, numero, tipo, estado, fecha_hora, articulo_codigo, descripcion, cantidad, cantidad_tramitada, cliente_codigo, nombre_origen, proveedor_codigo, fecha_prevista, concepto')
          .order('fecha_hora', { ascending: false })
          .order('oficina')
          .order('numero')
        return est.size ? b.in('estado', [...est].map((e) => ESTADO_GW.indexOf(e) + 1).filter((n) => n > 0)) : b
      }
      const gw = await todasLasFilas(qGw, { tope: TOPE_PETICIONES })
      if (gw.error) {
        onError(gw.error)
        setCargando(false)
        return
      }
      if (cortado || gw.cortado) onError(avisoTope(TOPE_PETICIONES))
      // Lo pedido y sin recibir, contando también los pedidos de GeminisWin (el mayor de los dos, como el Gestor 2.0).
      const enCamino = new Map<string, number>()
      const { data: ec } = await supabase.rpc('fn_compras_en_camino')
      for (const r of (ec ?? []) as { articulo_codigo: string; uds: number }[]) enCamino.set(r.articulo_codigo, Number(r.uds ?? 0))
      const arts = [...new Set([...lista.map((r) => r.articulo_codigo as string), ...gw.data.map((r) => r.articulo_codigo as string)].filter(Boolean))]
      const stock = new Map<string, number>()
      const pedido = new Map<string, number>()
      const ultCompra = new Map<string, string | null>()
      for (const trozo of chunks(arts)) {
        const [s, l, a] = await Promise.all([
          todasLasFilas(() => supabase.from('articulo_almacen_stock').select('articulo_codigo, cantidad_actual').in('articulo_codigo', trozo).order('articulo_codigo').order('almacen_codigo')),
          todasLasFilas(() =>
            supabase
              .from('pedido_proveedor_linea')
              .select('articulo_codigo, cantidad, unidades_recibidas, recibido')
              .in('articulo_codigo', trozo)
              .eq('recibido', false)
              .order('tienda_terminal_codigo')
              .order('numero')
              .order('linea'),
          ),
          supabase.from('articulo').select('codigo_interno, ultima_compra_fecha').in('codigo_interno', trozo),
        ])
        for (const r of s.data) stock.set(r.articulo_codigo, (stock.get(r.articulo_codigo) ?? 0) + Number(r.cantidad_actual ?? 0))
        for (const r of l.data)
          pedido.set(r.articulo_codigo, (pedido.get(r.articulo_codigo) ?? 0) + Math.max(0, Number(r.cantidad ?? 0) - Number(r.unidades_recibidas ?? 0)))
        for (const r of a.data ?? []) ultCompra.set(r.codigo_interno, r.ultima_compra_fecha as string | null)
      }
      const udsPed = (a: string) => Math.max(pedido.get(a) ?? 0, enCamino.get(a) ?? 0)
      const filasErp: PeticionRow[] = lista.map((r) => ({
          gw: false,
          key: `${r.tienda_terminal_codigo}/${r.numero}`,
          tienda: r.tienda_terminal_codigo,
          numero: Number(r.numero),
          articulo: r.articulo_codigo,
          descripcion: r.descripcion ?? '',
          estado: r.estado ?? '',
          proveedor: r.proveedor_codigo,
          ultCompra: ultCompra.get(r.articulo_codigo) ?? null,
          fecha: r.fecha_hora,
          cantidad: Number(r.cantidad ?? 0),
          tramitada: Number(r.cantidad_tramitada ?? 0),
          stock: stock.get(r.articulo_codigo) ?? 0,
          udsPed: udsPed(r.articulo_codigo),
          tipo: r.tipo,
          prevista: r.fecha_prevista_entrega,
          origenTipo: r.origen_tipo,
          concepto: r.concepto,
          almacen: r.origen_almacen_codigo,
          cliente: r.origen_cliente_codigo,
          empleado: r.empleado_peticion_codigo,
          vendedor: r.vendedor_codigo,
          origenTienda: r.origen_tienda_terminal_codigo,
          origenNumero: r.origen_movimiento_numero == null ? null : Number(r.origen_movimiento_numero),
        }))
      const filasGw: PeticionRow[] = gw.data.map((r) => ({
        gw: true,
        key: `GW/${r.oficina}/${r.numero}`,
        tienda: r.oficina,
        numero: Number(r.numero),
        articulo: r.articulo_codigo ?? '',
        descripcion: r.descripcion ?? '',
        estado: estadoGw(r.estado),
        proveedor: r.proveedor_codigo,
        ultCompra: ultCompra.get(r.articulo_codigo) ?? null,
        fecha: r.fecha_hora,
        cantidad: Number(r.cantidad ?? 0),
        tramitada: Number(r.cantidad_tramitada ?? 0),
        stock: stock.get(r.articulo_codigo) ?? 0,
        udsPed: udsPed(r.articulo_codigo),
        tipo: r.tipo,
        prevista: r.fecha_prevista,
        origenTipo: null,
        concepto: r.concepto,
        almacen: null,
        cliente: [r.cliente_codigo, r.nombre_origen].filter(Boolean).join(' · ') || null,
        empleado: null,
        vendedor: null,
        origenTienda: null,
        origenNumero: null,
      }))
      setRows([...filasErp, ...filasGw].sort((a, b) => String(b.fecha ?? '').localeCompare(String(a.fecha ?? ''))))
      setSel(0)
      setCargando(false)
    },
    [onError],
  )

  useEffect(() => {
    cargar(new Set(['pendiente']))
  }, [cargar])

  const cols: Col<PeticionRow>[] = useMemo(
    () => [
      { key: 'articulo', label: 'Código', width: 140, value: (r) => r.articulo },
      { key: 'descripcion', label: 'Descripción', width: 360, value: (r) => r.descripcion },
      { key: 'estado', label: 'Estado', width: 120, value: (r) => etiquetaEstado(r.estado) },
      { key: 'proveedor', label: 'Prov. Pet.', width: 95, value: (r) => r.proveedor },
      { key: 'ultCompra', label: 'Ult. Compra', width: 120, value: (r) => r.ultCompra, render: (r) => fechaEs(r.ultCompra) || '  /  /' },
      { key: 'fecha', label: 'Fecha Petic.', width: 160, value: (r) => r.fecha, render: (r) => fechaHoraEs(r.fecha) },
      { key: 'cantidad', label: 'Cant. Petic.', width: 120, align: 'right', value: (r) => r.cantidad, render: (r) => formatGw(r.cantidad, 3) },
      { key: 'tramitada', label: 'Cant. Tram.', width: 120, align: 'right', value: (r) => r.tramitada, render: (r) => formatGw(r.tramitada, 3) },
      { key: 'stock', label: 'Stock', width: 110, align: 'right', value: (r) => r.stock, render: (r) => formatGw(r.stock, 3) },
      { key: 'udsPed', label: 'Uds. Ped.', width: 110, align: 'right', value: (r) => r.udsPed, render: (r) => formatGw(r.udsPed, 3) },
      { key: 'origen', label: 'Origen', width: 110, value: (r) => (r.gw ? 'GeminisWin' : 'ERP'), title: 'Dónde se hizo la petición. Las de GeminisWin solo se consultan aquí.' },
    ],
    [],
  )
  const colsT: Col<TramRow>[] = useMemo(
    () => [
      { key: 'of', label: 'Of.', width: 45, value: (r) => r.of },
      { key: 'numPed', label: 'Num. Ped', width: 95, align: 'right', value: (r) => r.numPed },
      { key: 'linea', label: 'Nº L', width: 50, align: 'right', value: (r) => r.linea },
      { key: 'estado', label: 'Estado', width: 70, align: 'right', value: (r) => r.estado, title: 'PETIDETA.ESTADO (código de GeminisWin, confirmar significado con Luis)' },
      { key: 'fecha', label: 'Fecha', width: 105, value: (r) => r.fecha, render: (r) => fechaEs(r.fecha) },
      { key: 'cantidad', label: 'Cantidad', width: 95, align: 'right', value: (r) => r.cantidad, render: (r) => formatGw(r.cantidad, 3) },
      { key: 'prevista', label: 'Fec. Previst', width: 110, value: (r) => r.prevista, render: (r) => fechaEs(r.prevista) },
      { key: 'recepcion', label: 'Fec. Recep.', width: 110, value: (r) => r.recepcion, render: (r) => fechaEs(r.recepcion) },
      { key: 'entrega', label: 'Fec. Entrega', width: 110, value: (r) => r.entrega, render: (r) => fechaEs(r.entrega) },
      { key: 'proveedor', label: 'Proveedor', width: 95, value: (r) => r.proveedor },
      { key: 'almacen', label: 'Alm.', width: 50, value: (r) => r.almacen },
      { key: 'empleado', label: 'Empl.', width: 60, value: (r) => r.empleado },
      { key: 'observ', label: 'Observ.', width: 200, value: (r) => r.observ },
    ],
    [],
  )

  const filas = useMemo(() => ordenar(rows, cols, ord), [rows, cols, ord])
  const filasT = useMemo(() => ordenar(tram, colsT, ordT), [tram, colsT, ordT])
  const actual = filas[sel]

  useEffect(() => {
    if (!actual) {
      setTram([])
      return
    }
    let cancel = false
    if (actual.gw) {
      supabase
        .from('gw_peticion_seguimiento')
        .select('clave, oficina_pedido, numero_pedido, linea_pedido, estado, fecha_hora, cantidad, proveedor_codigo, almacen_codigo, fecha_prevista, fecha_recepcion, fecha_entrega')
        .eq('oficina', actual.tienda)
        .eq('numero', actual.numero)
        .then(({ data }) => {
          if (cancel) return
          setTram(
            (data ?? []).map((t) => ({
              gw: true,
              key: String(t.clave),
              of: t.oficina_pedido ?? '',
              numPed: Number(t.numero_pedido ?? 0),
              linea: Number(t.linea_pedido ?? 0),
              estado: t.estado,
              fecha: t.fecha_hora,
              cantidad: Number(t.cantidad ?? 0),
              prevista: t.fecha_prevista,
              recepcion: t.fecha_recepcion,
              entrega: t.fecha_entrega,
              proveedor: t.proveedor_codigo,
              almacen: t.almacen_codigo,
              empleado: null,
              observ: null,
            })),
          )
          setSelT(0)
        })
      return () => {
        cancel = true
      }
    }
    supabase
      .from('peticion_tramitacion')
      .select(
        'pedido_proveedor_tienda_codigo, pedido_proveedor_numero, pedido_proveedor_linea, estado, fecha_hora, cantidad, proveedor_codigo, almacen_codigo, fecha_prevista_entrega, fecha_recepcion, fecha_entrega_cliente, empleado_entrega_codigo, observaciones_entrega',
      )
      .eq('tienda_terminal_codigo', actual.tienda)
      .eq('numero', actual.numero)
      .then(({ data }) => {
        if (cancel) return
        setTram(
          (data ?? []).map((t) => ({
            gw: false,
            key: `${t.pedido_proveedor_tienda_codigo}/${t.pedido_proveedor_numero}/${t.pedido_proveedor_linea}`,
            of: t.pedido_proveedor_tienda_codigo,
            numPed: Number(t.pedido_proveedor_numero),
            linea: Number(t.pedido_proveedor_linea),
            estado: t.estado,
            fecha: t.fecha_hora,
            cantidad: Number(t.cantidad ?? 0),
            prevista: t.fecha_prevista_entrega,
            recepcion: t.fecha_recepcion,
            entrega: t.fecha_entrega_cliente,
            proveedor: t.proveedor_codigo,
            almacen: t.almacen_codigo,
            empleado: t.empleado_entrega_codigo,
            observ: t.observaciones_entrega,
          })),
        )
        setSelT(0)
      })
    return () => {
      cancel = true
    }
  }, [actual])

  async function notificarAtendidas() {
    const pendientes = rows.filter((r) => !r.gw && r.estado === 'pendiente')
    if (!pendientes.length) return
    if (!confirm(`¿Marcar como Atendidas las ${pendientes.length} peticiones pendientes de la lista?`)) return
    onError(null)
    for (const r of pendientes) {
      const { error } = await supabase.from('peticion').update({ estado: 'atendida' }).eq('tienda_terminal_codigo', r.tienda).eq('numero', r.numero).eq('estado', 'pendiente')
      if (error) {
        onError(error.message)
        break
      }
    }
    cargar(estados)
  }

  const toggle = (v: string) =>
    setEstados((s) => {
      const n = new Set(s)
      if (n.has(v)) n.delete(v)
      else n.add(v)
      return n
    })

  const pedidoCliente = actual && actual.origenTienda && actual.origenNumero != null && (actual.origenTipo ?? '').toUpperCase().startsWith('PE')
  const dato = (label: string, valor: string, className = '') => (
    <div className={`flex min-w-0 flex-col ${className}`}>
      <span className="text-[15px] leading-[17px]">{label}</span>
      <input className="gw-input h-[26px]! text-[15px]!" readOnly value={valor} tabIndex={-1} />
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <div className="flex flex-none gap-2">
        <fieldset className="gw-group min-w-0 flex-1 px-2 pb-1.5 pt-0.5">
          <legend className="text-[17px]!">Estado Petición</legend>
          <div className="grid grid-cols-8 gap-1">
            {ESTADOS_PETICION.map((e) => (
              <div key={e.value} className="relative flex min-w-0 flex-col">
                <OptionButton
                  label={e.boton}
                  value={estados.has(e.value)}
                  onChange={() => toggle(e.value)}
                  className="h-[34px]! text-[16px]!"
                  title="Marcados: estados que se muestran (ninguno marcado = todos)"
                />
              </div>
            ))}
          </div>
        </fieldset>
        <button type="button" className="gw-btn h-[62px]! w-[170px] flex-none self-end text-[18px]!" disabled={cargando} onClick={() => cargar(estados)}>
          <Check size={16} strokeWidth={3} className="text-[#2a9d2a]" />
          {cargando ? 'Buscando…' : 'Aplicar Filtros'}
        </button>
      </div>

      <Rejilla
        rows={filas}
        cols={cols}
        rowKey={(r) => r.key}
        sel={sel}
        onSel={setSel}
        onOpen={(r) => navigate(`/articulos/${encodeURIComponent(r.articulo)}`)}
        orden={ord}
        onOrden={setOrd}
        vacias={9}
        rowStyle={(r) => {
          if (!opciones.colorearEstadoPeticiones) return undefined
          const e = ESTADOS_PETICION.find((x) => x.value === r.estado)
          return e?.bg ? { background: e.bg, color: e.fg } : undefined
        }}
      />

      <div className="flex flex-none items-center gap-2">
        <OptionButton
          label="Notificar todas las peticiones Pendientes como Atendidas"
          value={false}
          onChange={notificarAtendidas}
          disabled={!rows.some((r) => !r.gw && r.estado === 'pendiente')}
          className="h-[34px]! w-[560px] text-[16px]!"
          title="Cambia a «Atendida» todas las peticiones pendientes de la lista hechas en el ERP (las de GeminisWin se cambian en GeminisWin)"
        />
      </div>

      <div className="grid min-h-0 flex-none grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] gap-2">
        <fieldset className="gw-group flex min-w-0 flex-col gap-1 px-1.5 pb-1.5 pt-0.5">
          <legend className="flex w-full items-center justify-between text-[17px]!">
            <span>Datos de Entrega, Pedidos con las Peticiones</span>
          </legend>
          <div className="flex h-[150px] min-h-0 flex-col">
            <Rejilla
              rows={filasT}
              cols={colsT}
              rowKey={(r) => r.key}
              sel={selT}
              onSel={setSelT}
              onOpen={(r) => navigate(`/${r.gw ? 'pedidos-geminiswin' : 'pedidos-proveedor'}/${encodeURIComponent(r.of)}/${r.numPed}`)}
              orden={ordT}
              onOrden={setOrdT}
              vacias={4}
            />
          </div>
          <div className="flex justify-end">
            <BarButton
              title="Abrir el pedido a proveedor de la línea seleccionada"
              className="h-[34px]! w-[150px] text-[16px]! text-[#000]"
              disabled={!filasT[selT]}
              onClick={() => filasT[selT] && navigate(`/${filasT[selT].gw ? 'pedidos-geminiswin' : 'pedidos-proveedor'}/${encodeURIComponent(filasT[selT].of)}/${filasT[selT].numPed}`)}
            >
              <ShoppingCart size={16} className="text-[#2a9d2a]" /> Pedidos
            </BarButton>
          </div>
        </fieldset>
        <fieldset className="gw-group grid min-w-0 grid-cols-[1.3fr_1fr_1.2fr] gap-x-2 gap-y-1 px-1.5 pb-1.5 pt-0.5">
          <legend className="text-[17px]!">Datos de la Petición</legend>
          {dato('Fecha y Hora', fechaHoraEs(actual?.fecha))}
          {dato('Tipo', actual?.tipo == null ? '' : String(actual.tipo))}
          {dato('Fe. Prev. Entrega', fechaHoraEs(actual?.prevista))}
          <div className="col-span-3 grid grid-cols-[70px_minmax(0,1fr)_60px] gap-x-2">
            {dato('Orig.', actual?.origenTipo ?? '')}
            {dato('Concepto', actual?.concepto ?? '')}
            {dato('Alm.', actual?.almacen ?? '')}
          </div>
          <div className="col-span-3 grid grid-cols-[1fr_1fr_1fr_1.4fr] gap-x-2">
            {dato('Cliente', actual?.cliente ?? '')}
            {dato('Empl.', actual?.empleado ?? '')}
            {dato('Vend.', actual?.vendedor ?? '')}
            {dato('Ti. y Nº', actual?.origenTienda ? `${actual.origenTienda} ${actual.origenNumero ?? ''}` : '')}
          </div>
        </fieldset>
      </div>

      <BarraGestor grid={{ sel, set: setSel, n: filas.length, ord, setOrd, first: cols[0].key }} onLocalizar={() => setLocalizar(true)} ancho="w-[78px]">
        <BarButton
          title="Abrir el pedido de cliente o la venta que originó la petición"
          className="ml-3 w-[190px] text-[17px]! text-[#000]"
          disabled={!pedidoCliente}
          onClick={() => actual && navigate(`/pedidos/${encodeURIComponent(actual.origenTienda!)}/${actual.origenNumero}`)}
        >
          <Link2 size={16} className="text-[#2a9d2a]" /> Ped. Cli. / Vta.
        </BarButton>
        <BarButton
          title="Abrir la ficha del artículo"
          className="w-[150px] text-[17px]! text-[#000]"
          disabled={!actual}
          onClick={() => actual && navigate(`/articulos/${encodeURIComponent(actual.articulo)}`)}
        >
          <Package size={16} className="text-[#2a9d2a]" /> Artículos
        </BarButton>
        <BarButton
          title="Abrir la ficha de la petición (Compras → Peticiones de Artículos)"
          className="w-[160px] text-[17px]! text-[#000]"
          disabled={!actual || actual.gw}
          onClick={() => actual && !actual.gw && navigate(`/peticiones/${encodeURIComponent(actual.tienda)}/${actual.numero}`)}
        >
          <Link2 size={16} className="text-[#2a9d2a]" /> Peticiones
        </BarButton>
        <BarButton
          title="Peticiones resueltas (la mercancía ya llegó) separadas por proveedor, para imprimirlas y que el almacén las prepare para reparto"
          className="relative w-[150px] text-[17px]! text-[#000]"
          onClick={() => setImprimirResueltas(true)}
        >
          <Printer size={16} className="text-[#2a9d2a]" /> Resueltas
          <Globo n={resueltasNuevas} className="absolute -right-2 -top-2" />
        </BarButton>
        <BarButton
          title="Tramitar las peticiones pendientes o atendidas de la lista a pedidos de proveedor (uno por proveedor)"
          className="w-[150px] text-[17px]! text-[#000]"
          disabled={!rows.some((r) => !r.gw && ESTADOS_TRAMITABLES.includes(r.estado))}
          onClick={() => setTramitar(true)}
        >
          <ShoppingCart size={16} className="text-[#2a9d2a]" /> Tramitar
        </BarButton>
      </BarraGestor>

      {tramitar && (
        <TramitarPeticionesDialog
          claves={rows.filter((r) => !r.gw && ESTADOS_TRAMITABLES.includes(r.estado)).map((r) => ({ t: r.tienda, n: r.numero }))}
          onClose={() => setTramitar(false)}
          onHecho={() => cargar(estados)}
        />
      )}
      {imprimirResueltas && <ImprimirResueltasDialog onClose={() => setImprimirResueltas(false)} />}
      {localizar && (
        <LocalizarDialog
          onBuscar={(t) => {
            const i = buscarFila(filas, cols, sel, t)
            if (i >= 0) setSel(i)
            return i >= 0
          }}
          onClose={() => setLocalizar(false)}
        />
      )}
    </div>
  )
}
