import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Check, RefreshCw, ShoppingCart } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { formatGw, GwDate } from '../../../components/gw'
import { BarButton, BigTabs, BIG_INPUT, chunks, fechaEs, leerOpciones, LocalizarDialog, OptionButton, PERIODOS, pitido, rangoPeriodo, useRefresco, type Periodo } from '../../ventas/gestores/comun'
import { ordenar, Rejilla, type Col, type Orden } from '../../ventas/gestores/rejilla'
import { BarraGestor, buscarFila, Contador } from './barra'
import { CLAVE_OPCIONES, ESTADOS_PEDIDO, fechaHoraEs, OPCIONES_DEFECTO, type OpcionesGestorCompras } from './opciones'
import { TabArticulos } from './TabArticulos'
import { TabOpciones } from './TabOpciones'
import { TabPeticiones } from './TabPeticiones'
import { TabPropuestas } from './TabPropuestas'

// Gestor de pedidos a proveedores (GeminisWin, Compras): tablero con los pedidos a proveedor,
// sus artículos, las propuestas de pedido, el coste por proveedor, las peticiones y las opciones del puesto.

interface FiltroPedidos {
  estados: string[]
  campo: 'fecha_hora' | 'fecha_prevista' | 'fecha_recepcion'
  periodo: Periodo
  desde: string
  hasta: string
  filtrarPorArticulo: boolean
  articuloModo: 'interno' | 'compra'
  articulo: string
  lineas: 'todas' | 'pendientes' | 'recibidas'
  actualizadosNo: boolean
  actualizadosSi: boolean
  devolucionesNo: boolean
  devolucionesSi: boolean
}

function filtroInicial(): FiltroPedidos {
  const [desde, hasta] = rangoPeriodo('Este año')
  return {
    estados: [],
    campo: 'fecha_hora',
    periodo: 'Este año',
    desde,
    hasta,
    filtrarPorArticulo: false,
    articuloModo: 'interno',
    articulo: '',
    lineas: 'todas',
    actualizadosNo: true,
    actualizadosSi: false,
    devolucionesNo: true,
    devolucionesSi: false,
  }
}

const CAMPOS_FECHA = [
  { value: 'fecha_hora', label: 'Fecha Pedido' },
  { value: 'fecha_prevista', label: 'Fecha Llegada' },
  { value: 'fecha_recepcion', label: 'Fecha Recepción' },
] as const

interface PedidoRow {
  key: string
  tienda: string
  numero: number
  almacen: string
  proveedor: string
  nombre: string
  alta: string | null
  solicitud: string | null
  llegada: string | null
  estado: string
  total: number
  actualizado: boolean
}

interface LineaRow {
  key: string
  tienda: string
  numero: number
  articulo: string
  descripcion: string
  familia: string
  bonif: number
  cantidad: number
  precio: number | null
  recibido: boolean
  cantRecep: number
  bonifRecep: number
}

const dia = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00`)
  d.setDate(d.getDate() + n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function GestorPedidosProveedorPage() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('pedidos')
  const [filtro, setFiltro] = useState<FiltroPedidos>(filtroInicial)
  const aplicado = useRef<FiltroPedidos>(filtro)
  const [opciones, setOpciones] = useState<OpcionesGestorCompras>(() => leerOpciones(CLAVE_OPCIONES, OPCIONES_DEFECTO))
  const [pedidos, setPedidos] = useState<PedidoRow[]>([])
  const [lineas, setLineas] = useState<LineaRow[]>([])
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [nuevos, setNuevos] = useState<string[]>([])
  const conocidos = useRef<Set<string> | null>(null)
  const [selP, setSelP] = useState(0)
  const [selL, setSelL] = useState(0)
  const [ordP, setOrdP] = useState<Orden | null>(null)
  const [ordL, setOrdL] = useState<Orden | null>(null)
  const [localizar, setLocalizar] = useState(false)
  const set = (p: Partial<FiltroPedidos>) => setFiltro((f) => ({ ...f, ...p }))

  const cargar = useCallback(async (f: FiltroPedidos) => {
    setCargando(true)
    setError(null)
    // Pedidos que llevan el artículo pedido (por código interno o de compra).
    let soloNumeros: Set<string> | null = null
    if (f.filtrarPorArticulo && f.articulo.trim()) {
      const { data, error: e } = await supabase
        .from('pedido_proveedor_linea')
        .select('tienda_terminal_codigo, numero')
        .eq(f.articuloModo === 'interno' ? 'articulo_codigo' : 'codigo_compra', f.articulo.trim())
        .limit(2000)
      if (e) {
        setError(e.message)
        setCargando(false)
        return
      }
      soloNumeros = new Set((data ?? []).map((l) => `${l.tienda_terminal_codigo}/${l.numero}`))
    }

    let q = supabase
      .from('pedido_proveedor')
      .select('tienda_terminal_codigo, numero, almacen_codigo, proveedor_codigo, fecha_hora, fecha_solicitud, fecha_prevista, estado, total, stock_movido, es_abono, proveedor:proveedor_codigo(nombre)')
    if (f.estados.length) q = q.in('estado', f.estados)
    if (f.campo === 'fecha_hora') q = q.gte('fecha_hora', f.desde).lt('fecha_hora', dia(f.hasta, 1))
    else q = q.gte(f.campo, f.desde).lte(f.campo, f.hasta)
    if (f.actualizadosNo !== f.actualizadosSi) q = q.eq('stock_movido', f.actualizadosSi)
    if (f.devolucionesNo !== f.devolucionesSi) q = q.eq('es_abono', f.devolucionesSi)
    const { data: cab, error: e1 } = await q.order('fecha_hora').limit(2000)
    if (e1) {
      setError(e1.message)
      setCargando(false)
      return
    }
    // Ninguna de las dos casillas marcada: no se muestra nada de ese grupo, como en GeminisWin.
    const vacio = (!f.actualizadosNo && !f.actualizadosSi) || (!f.devolucionesNo && !f.devolucionesSi)
    const cabs = vacio ? [] : (cab ?? []).filter((c) => !soloNumeros || soloNumeros.has(`${c.tienda_terminal_codigo}/${c.numero}`))
    const filasP: PedidoRow[] = cabs.map((c) => {
      const p = (Array.isArray(c.proveedor) ? c.proveedor[0] : c.proveedor) as { nombre: string | null } | null
      return {
        key: `${c.tienda_terminal_codigo}/${c.numero}`,
        tienda: c.tienda_terminal_codigo,
        numero: Number(c.numero),
        almacen: c.almacen_codigo,
        proveedor: c.proveedor_codigo,
        nombre: p?.nombre ?? '',
        alta: c.fecha_hora,
        solicitud: c.fecha_solicitud,
        llegada: c.fecha_prevista,
        estado: c.estado ?? '',
        total: Number(c.total ?? 0),
        actualizado: !!c.stock_movido,
      }
    })

    const claves = new Set(filasP.map((p) => p.key))
    const lin: {
      tienda_terminal_codigo: string
      numero: number
      linea: number
      articulo_codigo: string
      descripcion: string | null
      bonificacion: number | null
      cantidad: number | null
      precio_compra: number | null
      recibido: boolean | null
      unidades_recibidas: number | null
      bonificacion_recibida: number | null
    }[] = []
    for (const parte of chunks([...new Set(filasP.map((p) => p.numero))])) {
      const { data } = await supabase
        .from('pedido_proveedor_linea')
        .select('tienda_terminal_codigo, numero, linea, articulo_codigo, descripcion, bonificacion, cantidad, precio_compra, recibido, unidades_recibidas, bonificacion_recibida')
        .in('numero', parte)
      lin.push(...(data ?? []).filter((l) => claves.has(`${l.tienda_terminal_codigo}/${l.numero}`)))
    }
    const familias = new Map<string, string>()
    for (const parte of chunks([...new Set(lin.map((l) => l.articulo_codigo))])) {
      const { data } = await supabase.from('articulo').select('codigo_interno, familia_codigo').in('codigo_interno', parte)
      for (const a of data ?? []) familias.set(a.codigo_interno, a.familia_codigo ?? '')
    }
    const filasL: LineaRow[] = lin
      .filter((l) => (f.lineas === 'pendientes' ? !l.recibido : f.lineas === 'recibidas' ? !!l.recibido : true))
      .filter((l) => !f.filtrarPorArticulo || !f.articulo.trim() || f.articuloModo !== 'interno' || l.articulo_codigo === f.articulo.trim())
      .sort((a, b) => a.numero - b.numero || a.linea - b.linea)
      .map((l) => ({
        key: `${l.tienda_terminal_codigo}/${l.numero}/${l.linea}`,
        tienda: l.tienda_terminal_codigo,
        numero: Number(l.numero),
        articulo: l.articulo_codigo,
        descripcion: l.descripcion ?? '',
        familia: familias.get(l.articulo_codigo) ?? '',
        bonif: Number(l.bonificacion ?? 0),
        cantidad: Number(l.cantidad ?? 0),
        precio: l.precio_compra,
        recibido: !!l.recibido,
        cantRecep: Number(l.unidades_recibidas ?? 0),
        bonifRecep: Number(l.bonificacion_recibida ?? 0),
      }))

    // Aviso de pedidos nuevos desde la última consulta (solo en los refrescos, no en la primera carga).
    if (conocidos.current) {
      const nuevosAhora = filasP.filter((p) => !conocidos.current!.has(p.key)).map((p) => p.key)
      if (nuevosAhora.length) {
        setNuevos((n) => [...new Set([...n, ...nuevosAhora])])
        pitido()
      }
    }
    conocidos.current = new Set(filasP.map((p) => p.key))
    setPedidos(filasP)
    setLineas(filasL)
    setCargando(false)
  }, [])

  useEffect(() => {
    cargar(aplicado.current)
  }, [cargar])

  useRefresco(opciones.refrescoAuto, opciones.segundos, () => cargar(aplicado.current))

  useEffect(() => {
    if (!opciones.refrescarAlCerrar) return
    const alVolver = () => document.visibilityState === 'visible' && cargar(aplicado.current)
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [opciones.refrescarAlCerrar, cargar])

  function aplicar() {
    aplicado.current = filtro
    conocidos.current = null
    setNuevos([])
    setSelP(0)
    setSelL(0)
    cargar(filtro)
  }

  const colsP: Col<PedidoRow>[] = useMemo(
    () => [
      { key: 'tienda', label: 'Ti.', width: 45, value: (r) => r.tienda },
      { key: 'numero', label: 'Numero', width: 100, align: 'right', value: (r) => r.numero },
      { key: 'almacen', label: 'Alm.', width: 55, value: (r) => r.almacen },
      { key: 'proveedor', label: 'Prov.', width: 80, value: (r) => r.proveedor },
      { key: 'nombre', label: 'Nombre Proveedor', width: 330, value: (r) => r.nombre },
      { key: 'alta', label: 'Fecha Alta', width: 165, value: (r) => r.alta, render: (r) => fechaHoraEs(r.alta) },
      { key: 'solicitud', label: 'Fe. Pedido', width: 115, value: (r) => r.solicitud, render: (r) => fechaEs(r.solicitud) },
      { key: 'llegada', label: 'Fe. Llegada', width: 115, value: (r) => r.llegada, render: (r) => fechaEs(r.llegada) },
      { key: 'estado', label: 'Estado', width: 150, value: (r) => ESTADOS_PEDIDO.find((e) => e.value === r.estado)?.label ?? r.estado },
      { key: 'total', label: 'Total', width: 120, align: 'right', value: (r) => r.total, render: (r) => formatGw(r.total, 2) },
      { key: 'actualizado', label: 'Act.', width: 50, align: 'center', value: (r) => (r.actualizado ? 1 : 0), render: (r) => (r.actualizado ? '✓' : ''), title: 'Stock actualizado' },
    ],
    [],
  )
  const colsL: Col<LineaRow>[] = useMemo(
    () => [
      { key: 'tienda', label: 'Ti.', width: 45, value: (r) => r.tienda },
      { key: 'numero', label: 'Numero', width: 95, align: 'right', value: (r) => r.numero },
      { key: 'articulo', label: 'Cod_intern', width: 130, value: (r) => r.articulo },
      { key: 'descripcion', label: 'Descrip', width: 330, value: (r) => r.descripcion },
      { key: 'familia', label: 'Familia', width: 95, value: (r) => r.familia },
      { key: 'bonif', label: 'Bonif.', width: 90, align: 'right', value: (r) => r.bonif, render: (r) => formatGw(r.bonif, 3) },
      { key: 'cantidad', label: 'Cantidad', width: 105, align: 'right', value: (r) => r.cantidad, render: (r) => formatGw(r.cantidad, 3) },
      { key: 'precio', label: 'Precio', width: 105, align: 'right', value: (r) => r.precio, render: (r) => (r.precio == null ? '' : formatGw(r.precio, 3)) },
      { key: 'recibido', label: 'Chk.', width: 50, align: 'center', value: (r) => (r.recibido ? 1 : 0), render: (r) => (r.recibido ? '✓' : ''), title: 'Línea recibida' },
      { key: 'cantRecep', label: 'Cant. Recep.', width: 120, align: 'right', value: (r) => r.cantRecep, render: (r) => formatGw(r.cantRecep, 3) },
      { key: 'bonifRecep', label: 'Bonif. Recep.', width: 120, align: 'right', value: (r) => r.bonifRecep, render: (r) => formatGw(r.bonifRecep, 3) },
    ],
    [],
  )
  const filasP = useMemo(() => ordenar(pedidos, colsP, ordP), [pedidos, colsP, ordP])
  const filasL = useMemo(() => ordenar(lineas, colsL, ordL), [lineas, colsL, ordL])

  function editarPedido(r?: { tienda: string; numero: number }) {
    if (!r) return
    const qs = opciones.mostrarLiquidacion ? '?liquidacion=1' : opciones.mostrarConfirmacion ? '?confirmacion=1' : ''
    navigate(`/pedidos-proveedor/${encodeURIComponent(r.tienda)}/${r.numero}${qs}`)
  }

  const toggleEstado = (v: string) => set({ estados: filtro.estados.includes(v) ? filtro.estados.filter((e) => e !== v) : [...filtro.estados, v] })
  const personal = filtro.periodo === 'Personalizado'
  const par = (titulo: string, no: boolean, si: boolean, on: (p: { no?: boolean; si?: boolean }) => void, title: string) => (
    <fieldset className="gw-group min-w-0 px-1.5 pb-1.5 pt-0.5" title={title}>
      <legend className="text-[17px]!">{titulo}</legend>
      <div className="grid grid-cols-2 gap-1">
        <OptionButton label="No" value={no} onChange={(v) => on({ no: v })} className="h-[32px]! text-[16px]!" />
        <OptionButton label="Si" value={si} onChange={(v) => on({ si: v })} className="h-[32px]! text-[16px]!" />
      </div>
    </fieldset>
  )

  return (
    <div className="flex h-full min-h-0 flex-col">
      <BigTabs
        tabs={[
          { key: 'pedidos', label: 'Pedidos' },
          { key: 'articulosPedidos', label: 'Artículos Pedidos' },
          { key: 'propuestas', label: 'Propuestas Pedidos' },
          { key: 'articulos', label: 'Artículos' },
          { key: 'peticiones', label: 'Peticiones' },
          { key: 'opciones', label: 'Opciones' },
        ]}
        active={tab}
        onChange={setTab}
      />
      <div className="flex min-h-0 flex-1 flex-col gap-1.5 border border-[var(--gw-border)] bg-[var(--gw-face)] p-1.5">
        {nuevos.length > 0 && (tab === 'pedidos' || tab === 'articulosPedidos') && (
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

        {tab === 'pedidos' && (
          <>
            <div className="flex flex-none gap-2">
              <fieldset className="gw-group min-w-0 flex-1 px-2 pb-1.5 pt-0.5">
                <legend className="text-[17px]!">Filtrar Según el Estado</legend>
                <div className="grid grid-cols-7 gap-1">
                  {ESTADOS_PEDIDO.map((e) => (
                    <OptionButton
                      key={e.value}
                      label={e.boton}
                      value={filtro.estados.includes(e.value)}
                      onChange={() => toggleEstado(e.value)}
                      className="h-[34px]! text-[16px]!"
                      title="Marcados: estados que se muestran (ninguno marcado = todos)"
                    />
                  ))}
                </div>
              </fieldset>
              <button type="button" className="gw-btn h-[62px]! w-[170px] flex-none self-end text-[18px]!" onClick={aplicar} disabled={cargando}>
                <Check size={16} strokeWidth={3} className="text-[#2a9d2a]" />
                {cargando ? 'Buscando…' : 'Aplicar Filtros'}
              </button>
            </div>
            <div className="grid flex-none grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,0.55fr)_minmax(0,0.55fr)] gap-2">
              <fieldset className="gw-group min-w-0 px-2 pb-1.5 pt-0.5">
                <legend className="text-[17px]!">Filtrar Según Fecha</legend>
                <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                  <select className={BIG_INPUT} value={filtro.campo} onChange={(e) => set({ campo: e.target.value as FiltroPedidos['campo'] })} title="Campo de fecha por el que se filtra">
                    {CAMPOS_FECHA.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <select
                    className={BIG_INPUT}
                    value={filtro.periodo}
                    onChange={(e) => {
                      const p = e.target.value as Periodo
                      if (p === 'Personalizado') set({ periodo: p })
                      else {
                        const [desde, hasta] = rangoPeriodo(p)
                        set({ periodo: p, desde, hasta })
                      }
                    }}
                  >
                    {PERIODOS.map((p) => (
                      <option key={p} value={p}>
                        {p === 'Este año' ? 'El Año actual' : p}
                      </option>
                    ))}
                  </select>
                  <GwDate className={BIG_INPUT} value={filtro.desde} disabled={!personal} onChange={(v) => set({ desde: v ?? '' })} title="Desde" />
                  <GwDate className={BIG_INPUT} value={filtro.hasta} disabled={!personal} onChange={(v) => set({ hasta: v ?? '' })} title="Hasta" />
                </div>
              </fieldset>
              <fieldset className="gw-group min-w-0 px-2 pb-1.5 pt-0.5">
                <legend className="flex items-center gap-1.5 text-[17px]!">
                  <input
                    type="checkbox"
                    className="m-0 h-[13px] w-[13px] accent-[#0078d7]"
                    checked={filtro.filtrarPorArticulo}
                    onChange={(e) => set({ filtrarPorArticulo: e.target.checked })}
                  />
                  Artículos — Filtrar Pedidos
                </legend>
                <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-2 gap-y-1">
                  <select
                    className={BIG_INPUT}
                    value={filtro.articuloModo}
                    disabled={!filtro.filtrarPorArticulo}
                    onChange={(e) => set({ articuloModo: e.target.value as FiltroPedidos['articuloModo'] })}
                  >
                    <option value="interno">Cod. Interno</option>
                    <option value="compra">Cod. Compra</option>
                  </select>
                  <input
                    className={BIG_INPUT}
                    value={filtro.articulo}
                    disabled={!filtro.filtrarPorArticulo}
                    onChange={(e) => set({ articulo: e.target.value })}
                    onKeyDown={(e) => e.key === 'Enter' && aplicar()}
                    title="Solo los pedidos que llevan este artículo"
                  />
                  <span className="self-center text-[17px]">Filtrar Artículos:</span>
                  <select className={BIG_INPUT} value={filtro.lineas} onChange={(e) => set({ lineas: e.target.value as FiltroPedidos['lineas'] })} title="Qué líneas se ven en «Artículos Pedidos»">
                    <option value="todas">No Filtrar</option>
                    <option value="pendientes">Pendientes</option>
                    <option value="recibidas">Recibidos</option>
                  </select>
                </div>
              </fieldset>
              {par(
                'Actualizados',
                filtro.actualizadosNo,
                filtro.actualizadosSi,
                (p) => set({ actualizadosNo: p.no ?? filtro.actualizadosNo, actualizadosSi: p.si ?? filtro.actualizadosSi }),
                'Pedidos con el stock ya actualizado (recepcionados en almacén)',
              )}
              {par(
                'Devoluciones',
                filtro.devolucionesNo,
                filtro.devolucionesSi,
                (p) => set({ devolucionesNo: p.no ?? filtro.devolucionesNo, devolucionesSi: p.si ?? filtro.devolucionesSi }),
                'Pedidos de devolución (abono) al proveedor',
              )}
            </div>
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
              rowStyle={(r) => {
                if (nuevos.includes(r.key)) return { background: '#fff3a0', fontWeight: 700 }
                if (!opciones.colorearEstadoPedido) return undefined
                const e = ESTADOS_PEDIDO.find((x) => x.value === r.estado)
                return e ? { background: e.bg, color: e.fg } : undefined
              }}
            />
            <BarraGestor grid={{ sel: selP, set: setSelP, n: filasP.length, ord: ordP, setOrd: setOrdP, first: colsP[1].key }} onLocalizar={() => setLocalizar(true)}>
              <BarButton title="Editar el pedido seleccionado" className="ml-3 w-[150px] text-[17px]! text-[#000]" disabled={!filasP[selP]} onClick={() => editarPedido(filasP[selP])}>
                <ShoppingCart size={16} className="text-[#2a9d2a]" /> Pedidos
              </BarButton>
              <Contador texto={`Nº Mov.: ${filasP.length}`} />
            </BarraGestor>
          </>
        )}

        {tab === 'articulosPedidos' && (
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
              vacias={16}
              rowStyle={(r) => (r.recibido ? { background: '#d6f3cf' } : undefined)}
            />
            <BarraGestor grid={{ sel: selL, set: setSelL, n: filasL.length, ord: ordL, setOrd: setOrdL, first: colsL[1].key }} onLocalizar={() => setLocalizar(true)}>
              <BarButton title="Refrescar" className="ml-3 w-[150px] text-[17px]! text-[#000]" onClick={() => cargar(aplicado.current)} disabled={cargando}>
                <RefreshCw size={16} className="text-[#2a9d2a]" /> Refrescar
              </BarButton>
              <BarButton title="Editar el pedido de la línea seleccionada" className="w-[150px] text-[17px]! text-[#000]" disabled={!filasL[selL]} onClick={() => editarPedido(filasL[selL])}>
                <ShoppingCart size={16} className="text-[#2a9d2a]" /> Pedidos
              </BarButton>
              <Contador texto={`Nº Artic.: ${filasL.length}`} />
            </BarraGestor>
          </>
        )}

        {tab === 'propuestas' && <TabPropuestas opciones={opciones} onError={setError} onPedidosCreados={() => {
              conocidos.current = null // los acabamos de crear aquí: no avisar como «nuevos»
              cargar(aplicado.current)
            }} />}
        {tab === 'articulos' && <TabArticulos opciones={opciones} onError={setError} />}
        {tab === 'peticiones' && <TabPeticiones opciones={opciones} onError={setError} />}
        {tab === 'opciones' && <TabOpciones opciones={opciones} onChange={setOpciones} />}
      </div>

      {localizar && (
        <LocalizarDialog
          onBuscar={(t) => {
            if (tab === 'articulosPedidos') {
              const i = buscarFila(filasL, colsL, selL, t)
              if (i >= 0) setSelL(i)
              return i >= 0
            }
            const i = buscarFila(filasP, colsP, selP, t)
            if (i >= 0) setSelP(i)
            return i >= 0
          }}
          onClose={() => setLocalizar(false)}
        />
      )}
    </div>
  )
}
