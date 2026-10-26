import { useEffect, useMemo, useState } from 'react'
import { Check, Eraser, ShoppingCart, Sparkles } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { formatGw } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import { BarButton, BIG_INPUT, chunks, fechaEs, LocalizarDialog } from '../../ventas/gestores/comun'
import { ordenar, Rejilla, type Col, type Orden } from '../../ventas/gestores/rejilla'
import { BarraGestor, buscarFila, Contador } from './barra'
import { colorProveedor, type OpcionesGestorCompras } from './opciones'

const TIENDA = '01' // única tienda sembrada por ahora, igual que ComprasPage

interface Propuesta {
  key: string
  marcado: boolean
  articulo: string
  descripcion: string
  proveedor: string | null
  codigoCompra: string | null
  precio: number | null
  aPedir: number
  stock: number
  pedido: number
  peticiones: number
  ultCompra: string | null
  cantUlt: number
}

interface FiltroPropuestas {
  proveedor: string
  almacen: string
  desde: string
  hasta: string
  bajoMinimo: boolean
  conPeticiones: boolean
  noMayorMaximo: boolean
}

const FILTRO_INICIAL: FiltroPropuestas = { proveedor: '', almacen: '', desde: '', hasta: '', bajoMinimo: true, conPeticiones: true, noMayorMaximo: true }
const ESTADOS_PET_ABIERTOS = ['pendiente', 'atendida', 'parcial_tramitada']

export function TabPropuestas({
  opciones,
  onError,
  onPedidosCreados,
}: {
  opciones: OpcionesGestorCompras
  onError: (m: string | null) => void
  onPedidosCreados: () => void
}) {
  const [filtro, setFiltro] = useState<FiltroPropuestas>(FILTRO_INICIAL)
  const [rows, setRows] = useState<Propuesta[]>([])
  const [sel, setSel] = useState(0)
  const [ord, setOrd] = useState<Orden | null>(null)
  const [cargando, setCargando] = useState(false)
  const [msg, setMsg] = useState('')
  const [almacenes, setAlmacenes] = useState<{ codigo: string; nombre: string }[]>([])
  const [lookup, setLookup] = useState(false)
  const [localizar, setLocalizar] = useState(false)
  const set = (p: Partial<FiltroPropuestas>) => setFiltro((f) => ({ ...f, ...p }))

  useEffect(() => {
    supabase
      .from('almacen')
      .select('codigo, nombre')
      .order('codigo')
      .then(({ data }) => setAlmacenes((data ?? []) as { codigo: string; nombre: string }[]))
  }, [])

  async function generar() {
    setCargando(true)
    setMsg('')
    onError(null)
    // Peticiones abiertas (lo que falta por tramitar) por artículo.
    const { data: pets, error: ePet } = await supabase
      .from('peticion')
      .select('articulo_codigo, cantidad, cantidad_tramitada, origen_almacen_codigo')
      .in('estado', ESTADOS_PET_ABIERTOS)
      .limit(5000)
    if (ePet) {
      onError(ePet.message)
      setCargando(false)
      return
    }
    const peticiones = new Map<string, number>()
    for (const p of pets ?? []) {
      if (filtro.almacen && p.origen_almacen_codigo && p.origen_almacen_codigo !== filtro.almacen) continue
      const falta = Number(p.cantidad ?? 0) - Number(p.cantidad_tramitada ?? 0)
      if (falta > 0) peticiones.set(p.articulo_codigo, (peticiones.get(p.articulo_codigo) ?? 0) + falta)
    }

    const sel = 'codigo_interno, descripcion, proveedor_habitual_codigo, codigo_compra_habitual, stock_minimo, stock_maximo, pedido_recomendado, coste_neto, ultima_compra_fecha, ultimas_unidades_compradas'
    type Art = {
      codigo_interno: string
      descripcion: string | null
      proveedor_habitual_codigo: string | null
      codigo_compra_habitual: string | null
      stock_minimo: number | null
      stock_maximo: number | null
      pedido_recomendado: number | null
      coste_neto: number | null
      ultima_compra_fecha: string | null
      ultimas_unidades_compradas: number | null
    }
    const base = () => {
      let q = supabase.from('articulo').select(sel).eq('activo', true).eq('sin_control_stock', false).eq('compuesto', false)
      if (filtro.proveedor) q = q.eq('proveedor_habitual_codigo', filtro.proveedor)
      if (filtro.desde) q = q.gte('codigo_interno', filtro.desde)
      if (filtro.hasta) q = q.lte('codigo_interno', filtro.hasta)
      return q
    }
    const arts = new Map<string, Art>()
    if (filtro.bajoMinimo) {
      const { data, error } = await base().gt('stock_minimo', 0).limit(5000)
      if (error) {
        onError(error.message)
        setCargando(false)
        return
      }
      for (const a of (data ?? []) as Art[]) arts.set(a.codigo_interno, a)
    }
    if (filtro.conPeticiones) {
      for (const trozo of chunks([...peticiones.keys()])) {
        const { data } = await base().in('codigo_interno', trozo)
        for (const a of (data ?? []) as Art[]) arts.set(a.codigo_interno, a)
      }
    }

    const codigos = [...arts.keys()]
    const stock = new Map<string, number>()
    const pedido = new Map<string, number>()
    const prov = new Map<string, { codigo: string | null; coste: number | null }>()
    for (const trozo of chunks(codigos)) {
      let qs = supabase.from('articulo_almacen_stock').select('articulo_codigo, cantidad_actual').in('articulo_codigo', trozo)
      if (filtro.almacen) qs = qs.eq('almacen_codigo', filtro.almacen)
      const [s, l, ap] = await Promise.all([
        qs,
        supabase.from('pedido_proveedor_linea').select('articulo_codigo, cantidad, unidades_recibidas').in('articulo_codigo', trozo).eq('recibido', false),
        supabase.from('articulo_proveedor').select('articulo_codigo, proveedor_codigo, codigo_compra, coste_neto').in('articulo_codigo', trozo),
      ])
      for (const r of s.data ?? []) stock.set(r.articulo_codigo, (stock.get(r.articulo_codigo) ?? 0) + Number(r.cantidad_actual ?? 0))
      for (const r of l.data ?? [])
        pedido.set(r.articulo_codigo, (pedido.get(r.articulo_codigo) ?? 0) + Math.max(0, Number(r.cantidad ?? 0) - Number(r.unidades_recibidas ?? 0)))
      for (const r of ap.data ?? []) {
        const a = arts.get(r.articulo_codigo)
        if (a && r.proveedor_codigo === a.proveedor_habitual_codigo) prov.set(r.articulo_codigo, { codigo: r.codigo_compra, coste: r.coste_neto })
      }
    }

    const out: Propuesta[] = []
    for (const a of arts.values()) {
      const st = stock.get(a.codigo_interno) ?? 0
      const ped = pedido.get(a.codigo_interno) ?? 0
      const pet = peticiones.get(a.codigo_interno) ?? 0
      const min = Number(a.stock_minimo ?? 0)
      const max = Number(a.stock_maximo ?? 0)
      const bajo = min > 0 && st + ped < min
      if (!bajo && pet <= 0) continue
      const objetivo = max > 0 ? max : Math.max(min, Number(a.pedido_recomendado ?? 0))
      let cantidad = (bajo ? Math.max(0, objetivo - st - ped) : 0) + pet
      if (filtro.noMayorMaximo && max > 0) cantidad = Math.min(cantidad, Math.max(0, max - st - ped) + pet)
      if (cantidad <= 0) continue
      const ap = prov.get(a.codigo_interno)
      out.push({
        key: a.codigo_interno,
        marcado: true,
        articulo: a.codigo_interno,
        descripcion: a.descripcion ?? '',
        proveedor: a.proveedor_habitual_codigo,
        codigoCompra: ap?.codigo ?? a.codigo_compra_habitual,
        precio: ap?.coste ?? a.coste_neto,
        aPedir: Math.ceil(cantidad),
        stock: st,
        pedido: ped,
        peticiones: pet,
        ultCompra: a.ultima_compra_fecha,
        cantUlt: Number(a.ultimas_unidades_compradas ?? 0),
      })
    }
    out.sort((x, y) => (x.proveedor ?? '').localeCompare(y.proveedor ?? '') || x.articulo.localeCompare(y.articulo, 'es', { numeric: true }))
    setRows(out)
    setSel(0)
    setMsg(out.length ? '' : 'No hay artículos que proponer con estos filtros.')
    setCargando(false)
  }

  async function generarPedidos() {
    const marcados = rows.filter((r) => r.marcado && r.aPedir > 0)
    const sinProv = marcados.filter((r) => !r.proveedor)
    const porProv = new Map<string, Propuesta[]>()
    for (const r of marcados) if (r.proveedor) porProv.set(r.proveedor, [...(porProv.get(r.proveedor) ?? []), r])
    if (!porProv.size) {
      setMsg(sinProv.length ? 'Los artículos marcados no tienen proveedor habitual.' : 'No hay artículos marcados.')
      return
    }
    if (!confirm(`Se van a crear ${porProv.size} pedido(s) a proveedor con ${marcados.length - sinProv.length} artículo(s). ¿Continuar?`)) return
    setCargando(true)
    onError(null)
    const { data: tienda } = await supabase.from('tienda_terminal').select('almacen_codigo').eq('codigo', TIENDA).maybeSingle()
    const almacen = filtro.almacen || tienda?.almacen_codigo
    if (!almacen) {
      onError('No se sabe en qué almacén recibir el pedido: elige uno en el filtro.')
      setCargando(false)
      return
    }
    const creados: string[] = []
    const hechos = new Set<string>()
    for (const [proveedor, lineas] of porProv) {
      const { data: numero, error: eNum } = await supabase.rpc('fn_siguiente_numero', { p_tienda: TIENDA, p_tipo_documento: 'pedido_proveedor', p_serie: '' })
      if (eNum) {
        onError(eNum.message)
        break
      }
      const { error: eCab } = await supabase.from('pedido_proveedor').insert({
        tienda_terminal_codigo: TIENDA,
        numero,
        proveedor_codigo: proveedor,
        almacen_codigo: almacen,
        estado: 'pendiente',
        observaciones: 'Generado desde Propuestas de pedido',
      })
      if (eCab) {
        onError(eCab.message)
        break
      }
      const { error: eLin } = await supabase.from('pedido_proveedor_linea').insert(
        lineas.map((l, i) => ({
          tienda_terminal_codigo: TIENDA,
          numero,
          linea: i + 1,
          articulo_codigo: l.articulo,
          codigo_compra: l.codigoCompra,
          descripcion: l.descripcion,
          cantidad: l.aPedir,
          precio_compra: l.precio,
        })),
      )
      if (eLin) {
        onError(`Pedido ${TIENDA}/${numero}: ${eLin.message}`)
        break
      }
      creados.push(`${TIENDA}/${numero}`)
      for (const l of lineas) hechos.add(l.key)
    }
    setRows((rs) => (opciones.eliminarPropuestas ? rs.filter((r) => !hechos.has(r.key)) : rs.map((r) => (hechos.has(r.key) ? { ...r, marcado: false } : r))))
    setMsg(creados.length ? `Pedidos creados: ${creados.join(', ')}${sinProv.length ? ` · ${sinProv.length} sin proveedor habitual` : ''}` : '')
    setCargando(false)
    if (creados.length) onPedidosCreados()
  }

  const marcar = (key: string, p: Partial<Propuesta>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)))

  const cols: Col<Propuesta>[] = useMemo(
    () => [
      {
        key: 'marcado',
        label: '',
        width: 34,
        align: 'center',
        value: (r) => (r.marcado ? 1 : 0),
        render: (r) => (
          <input
            type="checkbox"
            className="m-0 h-[14px] w-[14px] accent-[#0078d7]"
            checked={r.marcado}
            onChange={(e) => marcar(r.key, { marcado: e.target.checked })}
            title="Incluir en el pedido"
          />
        ),
      },
      { key: 'articulo', label: 'Cod. Artic.', width: 140, value: (r) => r.articulo },
      { key: 'descripcion', label: 'Descripción Artículo', width: 380, value: (r) => r.descripcion },
      {
        key: 'aPedir',
        label: 'Stock a Pedir',
        width: 130,
        align: 'right',
        value: (r) => r.aPedir,
        render: (r) => (
          <input
            type="number"
            min={0}
            className="h-[22px] w-full border border-[var(--gw-border-light)] bg-white px-1 text-right text-[16px] text-black"
            value={r.aPedir}
            onChange={(e) => marcar(r.key, { aPedir: Math.max(0, Number(e.target.value) || 0) })}
          />
        ),
      },
      { key: 'stock', label: 'Stock', width: 105, align: 'right', value: (r) => r.stock, render: (r) => formatGw(r.stock, 3) },
      { key: 'pedido', label: 'Stock Pedido', width: 120, align: 'right', value: (r) => r.pedido, render: (r) => formatGw(r.pedido, 3) },
      { key: 'peticiones', label: 'Peticiones', width: 110, align: 'right', value: (r) => r.peticiones, render: (r) => formatGw(r.peticiones, 3) },
      { key: 'proveedor', label: 'Prov.', width: 80, value: (r) => r.proveedor },
      { key: 'ultCompra', label: 'Ult.Compra', width: 115, value: (r) => r.ultCompra, render: (r) => fechaEs(r.ultCompra) || '  /  /' },
      { key: 'cantUlt', label: 'Cant.Ul.Comp.', width: 130, align: 'right', value: (r) => r.cantUlt, render: (r) => formatGw(r.cantUlt, 3) },
    ],
    [],
  )
  const filas = useMemo(() => ordenar(rows, cols, ord), [rows, cols, ord])
  const nMarcados = rows.filter((r) => r.marcado).length

  const chk = (label: string, v: boolean, on: (v: boolean) => void, title?: string) => (
    <label className="flex select-none items-center gap-1.5 whitespace-nowrap text-[17px]" title={title}>
      <input type="checkbox" className="m-0 h-[13px] w-[13px] accent-[#0078d7]" checked={v} onChange={(e) => on(e.target.checked)} />
      {label}
    </label>
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-1.5">
      <Rejilla
        rows={filas}
        cols={cols}
        rowKey={(r) => r.key}
        sel={sel}
        onSel={setSel}
        orden={ord}
        onOrden={setOrd}
        vacias={12}
        rowStyle={(r) => (opciones.colorearProveedorPropuestas ? { background: colorProveedor(r.proveedor) } : undefined)}
      />
      <div className="flex flex-none items-center gap-2">
        <BarButton title="Vaciar la lista de propuestas" className="w-[160px] text-[17px]! text-[#000]" onClick={() => (setRows([]), setMsg(''))} disabled={cargando}>
          <Eraser size={16} className="text-[#c42b1c]" /> Inicializar
        </BarButton>
        <BarButton title="Calcular las propuestas con los filtros de abajo" className="w-[160px] text-[17px]! text-[#000]" onClick={generar} disabled={cargando}>
          <Sparkles size={16} className="text-[#2a9d2a]" /> {cargando ? 'Calculando…' : 'Generar'}
        </BarButton>
        <BarButton title="Marcar / desmarcar todas" className="w-[150px] text-[17px]! text-[#000]" disabled={!rows.length} onClick={() => setRows((rs) => rs.map((r) => ({ ...r, marcado: nMarcados < rs.length })))}>
          <Check size={16} className="text-[#2a9d2a]" /> {nMarcados < rows.length ? 'Marcar' : 'Desmarcar'}
        </BarButton>
        <Contador texto={`Nº Artículos: ${rows.length}`} />
        {msg && <span className="min-w-0 truncate text-[15px] text-[#1d3a8a]" title={msg}>{msg}</span>}
      </div>

      <fieldset className="gw-group flex-none px-2 pb-2 pt-0.5">
        <legend className="text-[17px]!">Filtrar Propuestas</legend>
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)] gap-x-4 gap-y-1.5">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="w-[90px] flex-none text-[17px]">Proveedor:</span>
            <input className={`${BIG_INPUT} min-w-0`} value={filtro.proveedor} onChange={(e) => set({ proveedor: e.target.value.trim() })} title="Proveedor habitual (vacío = todos)" />
            <button type="button" className="gw-btn h-[30px]! w-[48px] flex-none font-bold" onClick={() => setLookup(true)} title="Buscar proveedor">
              ···
            </button>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="w-[80px] flex-none text-[17px]">Almacén:</span>
            <select className={`${BIG_INPUT} min-w-0`} value={filtro.almacen} onChange={(e) => set({ almacen: e.target.value })} title="Stock de este almacén (vacío = todos)">
              <option value="">Todos</option>
              {almacenes.map((a) => (
                <option key={a.codigo} value={a.codigo}>
                  {a.codigo} {a.nombre}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="flex-none text-[17px]">Artículos desde:</span>
            <input className={`${BIG_INPUT} min-w-0`} value={filtro.desde} onChange={(e) => set({ desde: e.target.value.trim() })} />
            <span className="flex-none text-[17px]">hasta:</span>
            <input className={`${BIG_INPUT} min-w-0`} value={filtro.hasta} onChange={(e) => set({ hasta: e.target.value.trim() })} />
          </div>
          {chk('Artículos con Stock bajo el Mínimo', filtro.bajoMinimo, (v) => set({ bajoMinimo: v }), 'Stock + pedido a proveedor por debajo del stock mínimo')}
          {chk('Artículos con Peticiones pendientes', filtro.conPeticiones, (v) => set({ conPeticiones: v }))}
          {chk('Stock no Mayor que el Stock Máximo', filtro.noMayorMaximo, (v) => set({ noMayorMaximo: v }), 'Lo propuesto, más el stock y lo ya pedido, no supera el stock máximo (salvo lo que piden las peticiones)')}
        </div>
      </fieldset>

      <BarraGestor
        grid={{ sel, set: setSel, n: filas.length, ord, setOrd, first: cols[1].key }}
        onLocalizar={() => setLocalizar(true)}
        derecha={
          <BarButton title="Crear un pedido a proveedor por cada proveedor con los artículos marcados" className="w-[230px] text-[#000]" disabled={cargando || !nMarcados} onClick={generarPedidos}>
            <ShoppingCart size={18} className="text-[#2a9d2a]" /> Generar Pedidos
          </BarButton>
        }
      />

      {lookup && (
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
          onClose={() => setLookup(false)}
          onPick={(r) => {
            set({ proveedor: r.codigo })
            setLookup(false)
          }}
        />
      )}
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
