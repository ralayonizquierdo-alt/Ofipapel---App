import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, Globe, RefreshCw } from 'lucide-react'
import { nombreEstadoWeb, wc, type WcPedido } from '../../lib/woocommerce'
import { descargarCsv } from '../../lib/webMapeo'
import { fechaEs } from '../ventas/gestores/comun'
import { DIF, eur, Nota, Tabla, WebError, type Col } from './comun'
import { cargarPendientesWeb, type LineaPendiente, type PedidoPendiente } from './pendientes'

interface Fila extends PedidoPendiente {
  dias: number
  faltan: number
  estadoWeb: string
}

/** Web → Pedidos Web Pendientes de Servir: pedidos importados de la web aún sin entregar en el ERP. */
export function PendientesServirPage() {
  const navigate = useNavigate()
  const [datos, setDatos] = useState<{ pedidos: PedidoPendiente[]; stock: Map<string, number> } | null>(null)
  const [web, setWeb] = useState<Map<number, string>>(new Map())
  const [error, setError] = useState<unknown>(null)
  const [cargando, setCargando] = useState(false)
  const [sel, setSel] = useState(0)

  async function cargar() {
    setCargando(true)
    setError(null)
    try {
      setDatos(await cargarPendientesWeb())
    } catch (e) {
      setError(e)
    }
    setCargando(false)
  }

  async function estadosWeb() {
    if (!datos?.pedidos.length) return
    setError(null)
    try {
      const ids = datos.pedidos.map((p) => p.webId)
      const m = new Map<number, string>()
      for (let i = 0; i < ids.length; i += 100) {
        const r = await wc.get<WcPedido[]>('orders', { include: ids.slice(i, i + 100).join(','), per_page: 100, status: 'any' })
        for (const p of r.data ?? []) m.set(p.id, p.status)
      }
      setWeb(m)
    } catch (e) {
      setError(e)
    }
  }

  useEffect(() => {
    cargar()
  }, [])

  const hoy = Date.now()
  const filas: Fila[] = useMemo(
    () =>
      (datos?.pedidos ?? []).map((p) => ({
        ...p,
        dias: p.fecha ? Math.floor((hoy - new Date(`${p.fecha}T00:00:00`).getTime()) / 86400000) : 0,
        faltan: p.lineas.filter((l) => l.pendiente > (datos?.stock.get(`${l.articulo}|${l.almacen}`) ?? 0)).length,
        estadoWeb: web.has(p.webId) ? nombreEstadoWeb(web.get(p.webId)!) : '',
      })),
    [datos, web, hoy],
  )

  const cols: Col<Fila>[] = useMemo(
    () => [
      { key: 'ped', label: 'Pedido ERP', width: 95, value: (r) => `${r.tienda}/${r.numero}` },
      { key: 'web', label: 'Nº Web', width: 75, align: 'right', value: (r) => r.webId },
      { key: 'fecha', label: 'Fecha', width: 90, value: (r) => r.fecha, render: (r) => fechaEs(r.fecha) },
      { key: 'dias', label: 'Días', width: 50, align: 'right', value: (r) => r.dias, cellStyle: (r) => (r.dias > 3 ? DIF : undefined) },
      { key: 'cli', label: 'Cliente', width: 80, value: (r) => r.cliente },
      { key: 'nombre', label: 'Nombre', width: 250, value: (r) => r.nombre },
      { key: 'total', label: 'Total', width: 85, align: 'right', value: (r) => r.total, render: (r) => eur(r.total) },
      { key: 'lin', label: 'Líneas pend.', width: 85, align: 'right', value: (r) => r.lineas.filter((l) => l.pendiente > 0).length },
      { key: 'faltan', label: 'Sin stock', width: 75, align: 'right', value: (r) => r.faltan, cellStyle: (r) => (r.faltan ? DIF : undefined) },
      { key: 'prep', label: 'Preparado', width: 75, value: (r) => (r.preparado ? 'Sí' : 'No') },
      { key: 'ew', label: 'Estado en la web', width: 130, value: (r) => r.estadoWeb },
    ],
    [],
  )

  const actual = filas[sel]
  const colsL: Col<LineaPendiente>[] = [
    { key: 'art', label: 'Artículo', width: 110, value: (l) => l.articulo },
    { key: 'desc', label: 'Descripción', width: 380, value: (l) => l.descripcion },
    { key: 'cant', label: 'Pedida', width: 75, align: 'right', value: (l) => l.cantidad },
    { key: 'serv', label: 'Servida', width: 75, align: 'right', value: (l) => l.servida },
    { key: 'pend', label: 'Pendiente', width: 80, align: 'right', value: (l) => l.pendiente },
    {
      key: 'stock',
      label: `Disponible`,
      width: 85,
      align: 'right',
      value: (l) => datos?.stock.get(`${l.articulo}|${l.almacen}`) ?? 0,
      cellStyle: (l) => (l.pendiente > (datos?.stock.get(`${l.articulo}|${l.almacen}`) ?? 0) ? DIF : undefined),
    },
    { key: 'alm', label: 'Almacén', width: 70, value: (l) => l.almacen },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-none flex-wrap items-center gap-2">
        <button type="button" className="gw-btn" onClick={cargar} disabled={cargando}>
          <RefreshCw size={14} /> {cargando ? 'Cargando…' : 'Actualizar'}
        </button>
        <button type="button" className="gw-btn" onClick={estadosWeb} disabled={!filas.length}>
          <Globe size={14} /> Ver su estado en la web
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!filas.length}
          onClick={() => descargarCsv('pedidos-web-pendientes.csv', cols.map((c) => c.label), filas.map((r) => cols.map((c) => c.value(r))))}
        >
          <FileDown size={14} /> Exportar CSV
        </button>
        <Nota>Pedidos del ERP con nº de pedido web, sin entregar ni anular. «Sin stock»: líneas cuyo pendiente supera el disponible del almacén.</Nota>
      </div>
      <WebError error={error} />
      <Tabla rows={filas} cols={cols} rowKey={(r) => `${r.tienda}/${r.numero}`} sel={sel} onSel={setSel} vacio={datos ? 'No hay pedidos web pendientes de servir.' : 'Cargando…'} onOpen={(r) => navigate(`/pedidos/${encodeURIComponent(r.tienda)}/${r.numero}`)} />
      <div className="flex h-[200px] flex-none flex-col gap-1">
        <span className="gw-label">Líneas del pedido{actual ? ` ${actual.tienda}/${actual.numero}` : ''}:</span>
        <Tabla rows={actual?.lineas ?? []} cols={colsL} rowKey={(l) => String(l.linea)} vacio="Selecciona un pedido." className="min-h-0!" />
      </div>
      <div className="flex flex-none items-center gap-2">
        <button type="button" className="gw-btn" disabled={!actual} onClick={() => actual && navigate(`/pedidos/${encodeURIComponent(actual.tienda)}/${actual.numero}`)}>
          Abrir pedido
        </button>
        <button type="button" className="gw-btn" onClick={() => navigate('/gestor-pedidos')}>
          Gestor de Pedidos
        </button>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}
