import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, Search } from 'lucide-react'
import type { WcPedido } from '../../lib/woocommerce'
import { descargarCsv, r2 } from '../../lib/webMapeo'
import { eur, filtroWebInicial, FiltroFechas, Nota, Tabla, WebError, type Col } from './comun'
import { cargarPedidosWeb } from './pedidosWeb'

const VENDIDOS = ['processing', 'on-hold', 'completed']

interface Periodo {
  clave: string
  pedidos: number
  unidades: number
  total: number
  medio: number
}
interface Producto {
  clave: string
  sku: string
  nombre: string
  unidades: number
  total: number
  pedidos: number
}

/** Ventas web agrupadas por día o mes y productos más vendidos (pedidos pagados/en curso). */
export function estadisticas(pedidos: WcPedido[], porMes: boolean) {
  const per = new Map<string, Periodo>()
  const prod = new Map<string, Producto>()
  for (const p of pedidos) {
    if (!VENDIDOS.includes(p.status)) continue
    const k = (p.date_created ?? '').slice(0, porMes ? 7 : 10)
    const f = per.get(k) ?? { clave: k, pedidos: 0, unidades: 0, total: 0, medio: 0 }
    f.pedidos += 1
    f.total = r2(f.total + Number(p.total || 0))
    for (const l of p.line_items ?? []) {
      f.unidades += Number(l.quantity || 0)
      const kp = l.sku || `#${l.product_id}`
      const x = prod.get(kp) ?? { clave: kp, sku: l.sku ?? '', nombre: l.name, unidades: 0, total: 0, pedidos: 0 }
      x.unidades += Number(l.quantity || 0)
      x.total = r2(x.total + Number(l.total || 0) + Number(l.total_tax || 0))
      x.pedidos += 1
      prod.set(kp, x)
    }
    per.set(k, f)
  }
  const periodos = [...per.values()].map((f) => ({ ...f, medio: f.pedidos ? r2(f.total / f.pedidos) : 0 })).sort((a, b) => a.clave.localeCompare(b.clave))
  const productos = [...prod.values()].sort((a, b) => b.unidades - a.unidades)
  return { periodos, productos }
}

function etiqueta(clave: string) {
  const [y, m, d] = clave.split('-')
  return d ? `${d}/${m}/${y}` : `${m}/${y}`
}

/** Web → Estadísticas Web (consulta). */
export function EstadisticasWebPage() {
  const navigate = useNavigate()
  const [filtro, setFiltro] = useState(() => filtroWebInicial('Este año'))
  const [pedidos, setPedidos] = useState<WcPedido[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [cargando, setCargando] = useState(false)
  const [porMes, setPorMes] = useState(true)

  async function buscar() {
    setCargando(true)
    setError(null)
    try {
      setPedidos((await cargarPedidosWeb(filtro, 'any')).pedidos)
    } catch (e) {
      setError(e)
    }
    setCargando(false)
  }
  useEffect(() => {
    buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const st = useMemo(() => estadisticas(pedidos ?? [], porMes), [pedidos, porMes])
  const max = Math.max(1, ...st.periodos.map((p) => p.total))
  const totalVentas = r2(st.periodos.reduce((s, p) => s + p.total, 0))
  const numPedidos = st.periodos.reduce((s, p) => s + p.pedidos, 0)

  const colsP: Col<Periodo>[] = [
    { key: 'clave', label: porMes ? 'Mes' : 'Día', width: 85, value: (p) => p.clave, render: (p) => etiqueta(p.clave) },
    { key: 'ped', label: 'Pedidos', width: 65, align: 'right', value: (p) => p.pedidos },
    { key: 'uds', label: 'Unidades', width: 70, align: 'right', value: (p) => p.unidades },
    { key: 'total', label: 'Ventas (IGIC incl.)', width: 115, align: 'right', value: (p) => p.total, render: (p) => eur(p.total) },
    { key: 'medio', label: 'Ticket medio', width: 85, align: 'right', value: (p) => p.medio, render: (p) => eur(p.medio) },
    {
      key: 'barra',
      label: '',
      width: 150,
      value: (p) => p.total,
      render: (p) => <span className="inline-block h-[12px] bg-[#1f4e9c] align-middle" style={{ width: `${Math.max(2, (p.total / max) * 140)}px` }} />,
    },
  ]
  const colsT: Col<Producto>[] = [
    { key: 'sku', label: 'SKU', width: 95, value: (p) => p.sku },
    { key: 'nombre', label: 'Producto', width: 230, value: (p) => p.nombre },
    { key: 'uds', label: 'Unidades', width: 70, align: 'right', value: (p) => p.unidades },
    { key: 'ped', label: 'Pedidos', width: 60, align: 'right', value: (p) => p.pedidos },
    { key: 'total', label: 'Importe', width: 85, align: 'right', value: (p) => p.total, render: (p) => eur(p.total) },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <FiltroFechas filtro={filtro} onChange={setFiltro} conEstado={false}>
        <span className="gw-label">Agrupar por:</span>
        <select className="gw-input w-[80px]! flex-none" value={porMes ? 'mes' : 'dia'} onChange={(e) => setPorMes(e.target.value === 'mes')}>
          <option value="mes">Mes</option>
          <option value="dia">Día</option>
        </select>
        <button type="button" className="gw-btn" onClick={buscar} disabled={cargando}>
          <Search size={14} /> {cargando ? 'Leyendo la web…' : 'Calcular'}
        </button>
        <button type="button" className="gw-btn" disabled={!st.productos.length} onClick={() => descargarCsv('productos-mas-vendidos-web.csv', colsT.map((c) => c.label), st.productos.map((r) => colsT.map((c) => c.value(r))))}>
          <FileDown size={14} /> CSV productos
        </button>
      </FiltroFechas>
      <WebError error={error} />
      <Nota>
        Pedidos en estado Procesando, En espera o Completado. Total: <b>{eur(totalVentas)} €</b> en <b>{numPedidos}</b> pedidos
        {numPedidos ? ` (ticket medio ${eur(r2(totalVentas / numPedidos))} €)` : ''}.
      </Nota>
      <div className="flex min-h-0 flex-1 gap-1.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="gw-label">Ventas web por {porMes ? 'mes' : 'día'}:</span>
          <Tabla rows={st.periodos} cols={colsP} rowKey={(p) => p.clave} vacio={pedidos ? 'Sin ventas en el periodo.' : 'Cargando…'} />
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="gw-label">Productos más vendidos:</span>
          <Tabla rows={st.productos} cols={colsT} rowKey={(p) => p.clave} vacio={pedidos ? 'Sin ventas en el periodo.' : 'Cargando…'} />
        </div>
      </div>
      <div className="flex flex-none items-center gap-2">
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}
