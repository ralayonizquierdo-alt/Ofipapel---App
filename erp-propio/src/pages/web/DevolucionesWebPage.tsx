import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, Search } from 'lucide-react'
import { nombreEstadoWeb, wc, type WcLinea, type WcPedido, type WcReembolso } from '../../lib/woocommerce'
import { descargarCsv, nombreDePedido } from '../../lib/webMapeo'
import { BotonPendiente, eur, fechaHoraEs, filtroWebInicial, FiltroFechas, Nota, Tabla, WebError, type Col, type PedidoErpWeb } from './comun'
import { cargarPedidosWeb } from './pedidosWeb'

interface Fila {
  clave: string
  p: WcPedido
  id: number | null
  importe: number
  motivo: string
  erp: PedidoErpWeb | undefined
}

/** Web → Devoluciones y Reembolsos Web (consulta). */
export function DevolucionesWebPage() {
  const navigate = useNavigate()
  const [filtro, setFiltro] = useState(() => filtroWebInicial('Este año'))
  const [datos, setDatos] = useState<{ pedidos: WcPedido[]; erp: Map<number, PedidoErpWeb> } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [cargando, setCargando] = useState(false)
  const [sel, setSel] = useState(0)
  const [detalle, setDetalle] = useState<WcReembolso[] | null>(null)

  async function buscar() {
    setCargando(true)
    setError(null)
    try {
      setDatos(await cargarPedidosWeb(filtro, 'any'))
    } catch (e) {
      setError(e)
    }
    setCargando(false)
  }
  useEffect(() => {
    buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filas: Fila[] = useMemo(() => {
    const out: Fila[] = []
    for (const p of datos?.pedidos ?? []) {
      const erp = datos!.erp.get(p.id)
      if (p.refunds?.length) for (const r of p.refunds) out.push({ clave: `${p.id}/${r.id}`, p, id: r.id, importe: Math.abs(Number(r.total)), motivo: r.reason ?? '', erp })
      else if (p.status === 'refunded' || p.status === 'cancelled') out.push({ clave: `${p.id}`, p, id: null, importe: p.status === 'refunded' ? Number(p.total) : 0, motivo: '', erp })
    }
    return out
  }, [datos])
  const actual = filas[sel]

  useEffect(() => {
    setDetalle(null)
    if (!actual?.id) return
    let vivo = true
    wc.get<WcReembolso[]>(`orders/${actual.p.id}/refunds`)
      .then((r) => vivo && setDetalle(r.data ?? []))
      .catch(() => vivo && setDetalle([]))
    return () => {
      vivo = false
    }
  }, [actual?.p.id, actual?.id])

  const cols: Col<Fila>[] = [
    { key: 'num', label: 'Nº Web', width: 75, align: 'right', value: (r) => Number(r.p.number ?? r.p.id) },
    { key: 'fecha', label: 'Fecha pedido', width: 120, value: (r) => r.p.date_created, render: (r) => fechaHoraEs(r.p.date_created) },
    { key: 'cli', label: 'Cliente', width: 220, value: (r) => nombreDePedido(r.p) },
    { key: 'estado', label: 'Estado web', width: 120, value: (r) => nombreEstadoWeb(r.p.status) },
    { key: 'total', label: 'Total pedido', width: 90, align: 'right', value: (r) => Number(r.p.total), render: (r) => eur(Number(r.p.total)) },
    { key: 'imp', label: 'Reembolsado', width: 90, align: 'right', value: (r) => r.importe, render: (r) => eur(r.importe) },
    { key: 'mot', label: 'Motivo', width: 240, value: (r) => r.motivo },
    { key: 'erp', label: 'Pedido ERP', width: 95, value: (r) => (r.erp ? `${r.erp.tienda}/${r.erp.numero}` : '') },
    { key: 'venta', label: 'Venta ERP', width: 90, value: (r) => r.erp?.venta ?? '' },
  ]
  const colsD: Col<WcLinea & { fecha: string }>[] = [
    { key: 'fecha', label: 'Fecha reembolso', width: 125, value: (l) => l.fecha, render: (l) => fechaHoraEs(l.fecha) },
    { key: 'sku', label: 'SKU', width: 110, value: (l) => l.sku ?? '' },
    { key: 'name', label: 'Producto', width: 330, value: (l) => l.name },
    { key: 'q', label: 'Cant.', width: 60, align: 'right', value: (l) => Math.abs(Number(l.quantity)) },
    { key: 't', label: 'Importe', width: 85, align: 'right', value: (l) => Math.abs(Number(l.total)), render: (l) => eur(Math.abs(Number(l.total))) },
  ]
  const lineasDetalle = (detalle ?? []).flatMap((r) => (r.line_items ?? []).map((l) => ({ ...l, fecha: r.date_created })))

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <FiltroFechas filtro={filtro} onChange={setFiltro} conEstado={false}>
        <button type="button" className="gw-btn" onClick={buscar} disabled={cargando}>
          <Search size={14} /> {cargando ? 'Leyendo la web…' : 'Buscar'}
        </button>
        <button type="button" className="gw-btn" disabled={!filas.length} onClick={() => descargarCsv('reembolsos-web.csv', cols.map((c) => c.label), filas.map((r) => cols.map((c) => c.value(r))))}>
          <FileDown size={14} /> CSV
        </button>
      </FiltroFechas>
      <WebError error={error} />
      <Nota>Reembolsos y pedidos reembolsados o cancelados de la web en el periodo (por fecha del pedido). En el ERP la devolución se hace desde la venta.</Nota>
      <Tabla rows={filas} cols={cols} rowKey={(r) => r.clave} sel={sel} onSel={setSel} vacio={datos ? 'Sin reembolsos en el periodo.' : 'Cargando…'} />
      <div className="flex h-[170px] flex-none flex-col gap-1">
        <span className="gw-label">Artículos reembolsados:</span>
        <Tabla rows={lineasDetalle} cols={colsD} rowKey={(l) => `${l.id}${l.fecha}`} vacio={actual?.id ? (detalle ? 'Reembolso sin líneas (solo importe).' : 'Cargando…') : 'Selecciona un reembolso.'} className="min-h-0!" />
      </div>
      <div className="flex flex-none items-center gap-2">
        <button type="button" className="gw-btn" disabled={!actual?.erp} onClick={() => actual?.erp && navigate(`/pedidos/${encodeURIComponent(actual.erp.tienda)}/${actual.erp.numero}`)}>
          Abrir pedido del ERP
        </button>
        <BotonPendiente>Registrar reembolso en la web</BotonPendiente>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}
