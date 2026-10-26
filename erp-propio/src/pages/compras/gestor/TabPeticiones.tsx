import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, Link2, Package, ShoppingCart } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { formatGw } from '../../../components/gw'
import { BarButton, chunks, fechaEs, LocalizarDialog, OptionButton } from '../../ventas/gestores/comun'
import { ordenar, Rejilla, type Col, type Orden } from '../../ventas/gestores/rejilla'
import { BarraGestor, buscarFila } from './barra'
import { ESTADOS_PETICION, fechaHoraEs, type OpcionesGestorCompras } from './opciones'

interface PeticionRow {
  key: string
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

const etiquetaEstado = (v: string) => ESTADOS_PETICION.find((e) => e.value === v)?.label ?? v

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

  const cargar = useCallback(
    async (est: Set<string>) => {
      setCargando(true)
      onError(null)
      let q = supabase
        .from('peticion')
        .select(
          'tienda_terminal_codigo, numero, tipo, estado, fecha_hora, articulo_codigo, descripcion, cantidad, cantidad_tramitada, empleado_peticion_codigo, vendedor_codigo, concepto, origen_tipo, origen_tienda_terminal_codigo, origen_movimiento_numero, origen_almacen_codigo, origen_cliente_codigo, proveedor_codigo, fecha_prevista_entrega',
        )
        .order('fecha_hora', { ascending: false })
        .limit(2000)
      if (est.size) q = q.in('estado', [...est])
      const { data, error } = await q
      if (error) {
        onError(error.message)
        setCargando(false)
        return
      }
      const lista = data ?? []
      const arts = [...new Set(lista.map((r) => r.articulo_codigo as string))]
      const stock = new Map<string, number>()
      const pedido = new Map<string, number>()
      const ultCompra = new Map<string, string | null>()
      for (const trozo of chunks(arts)) {
        const [s, l, a] = await Promise.all([
          supabase.from('articulo_almacen_stock').select('articulo_codigo, cantidad_actual').in('articulo_codigo', trozo),
          supabase.from('pedido_proveedor_linea').select('articulo_codigo, cantidad, unidades_recibidas, recibido').in('articulo_codigo', trozo).eq('recibido', false),
          supabase.from('articulo').select('codigo_interno, ultima_compra_fecha').in('codigo_interno', trozo),
        ])
        for (const r of s.data ?? []) stock.set(r.articulo_codigo, (stock.get(r.articulo_codigo) ?? 0) + Number(r.cantidad_actual ?? 0))
        for (const r of l.data ?? [])
          pedido.set(r.articulo_codigo, (pedido.get(r.articulo_codigo) ?? 0) + Math.max(0, Number(r.cantidad ?? 0) - Number(r.unidades_recibidas ?? 0)))
        for (const r of a.data ?? []) ultCompra.set(r.codigo_interno, r.ultima_compra_fecha as string | null)
      }
      setRows(
        lista.map((r) => ({
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
          udsPed: pedido.get(r.articulo_codigo) ?? 0,
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
        })),
      )
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
    const pendientes = rows.filter((r) => r.estado === 'pendiente')
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
              <OptionButton
                key={e.value}
                label={e.boton}
                value={estados.has(e.value)}
                onChange={() => toggle(e.value)}
                className="h-[34px]! text-[16px]!"
                title="Marcados: estados que se muestran (ninguno marcado = todos)"
              />
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
          disabled={!rows.some((r) => r.estado === 'pendiente')}
          className="h-[34px]! w-[560px] text-[16px]!"
          title="Cambia a «Atendida» todas las peticiones pendientes de la lista"
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
              onOpen={(r) => navigate(`/pedidos-proveedor/${encodeURIComponent(r.of)}/${r.numPed}`)}
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
              onClick={() => filasT[selT] && navigate(`/pedidos-proveedor/${encodeURIComponent(filasT[selT].of)}/${filasT[selT].numPed}`)}
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
        <BarButton title="La ficha de Peticiones aún no está disponible en el ERP propio" className="w-[160px] text-[17px]! text-[#000]" disabled>
          <Link2 size={16} /> Peticiones
        </BarButton>
      </BarraGestor>

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
