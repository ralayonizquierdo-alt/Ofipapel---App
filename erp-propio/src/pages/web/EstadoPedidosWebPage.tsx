import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, Search } from 'lucide-react'
import { nombreEstadoWeb, type WcPedido } from '../../lib/woocommerce'
import { descargarCsv, nombreDePedido } from '../../lib/webMapeo'
import { BotonPendiente, DIF, estadoErp, eur, fechaHoraEs, filtroWebInicial, FiltroFechas, Nota, Tabla, WebError, type Col, type PedidoErpWeb } from './comun'
import { cargarPedidosWeb } from './pedidosWeb'

interface Fila {
  p: WcPedido
  erp: PedidoErpWeb | undefined
  estadoErp: string
  propuesto: string | null
}

/** Estado que habría que poner en la web según el pedido del ERP (solo se muestra, no se envía). */
export function estadoPropuesto(p: WcPedido, erp: PedidoErpWeb | undefined): string | null {
  if (!erp) return null
  if (erp.anulado) return p.status === 'cancelled' || p.status === 'refunded' ? null : 'cancelled'
  if (erp.entregado || erp.venta) return p.status === 'completed' ? null : 'completed'
  if (p.status === 'pending' || p.status === 'on-hold') return 'processing'
  return null
}

/** Web → Estado de Pedidos Web: estado en la web frente al estado en el ERP. */
export function EstadoPedidosWebPage() {
  const navigate = useNavigate()
  const [filtro, setFiltro] = useState(() => filtroWebInicial())
  const [datos, setDatos] = useState<{ pedidos: WcPedido[]; erp: Map<number, PedidoErpWeb> } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [cargando, setCargando] = useState(false)
  const [soloDistintos, setSoloDistintos] = useState(false)
  const [sel, setSel] = useState(0)

  async function buscar() {
    setCargando(true)
    setError(null)
    try {
      setDatos(await cargarPedidosWeb(filtro))
    } catch (e) {
      setError(e)
    }
    setCargando(false)
  }
  useEffect(() => {
    buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filas: Fila[] = useMemo(
    () =>
      (datos?.pedidos ?? [])
        .map((p) => {
          const erp = datos!.erp.get(p.id)
          return { p, erp, estadoErp: estadoErp(erp), propuesto: estadoPropuesto(p, erp) }
        })
        .filter((f) => !soloDistintos || f.propuesto),
    [datos, soloDistintos],
  )

  const cols: Col<Fila>[] = [
    { key: 'num', label: 'Nº Web', width: 75, align: 'right', value: (r) => Number(r.p.number ?? r.p.id) },
    { key: 'fecha', label: 'Fecha', width: 120, value: (r) => r.p.date_created, render: (r) => fechaHoraEs(r.p.date_created) },
    { key: 'cli', label: 'Cliente', width: 230, value: (r) => nombreDePedido(r.p) },
    { key: 'total', label: 'Total', width: 85, align: 'right', value: (r) => Number(r.p.total), render: (r) => eur(Number(r.p.total)) },
    { key: 'ew', label: 'Estado en la web', width: 140, value: (r) => nombreEstadoWeb(r.p.status) },
    { key: 'ped', label: 'Pedido ERP', width: 95, value: (r) => (r.erp ? `${r.erp.tienda}/${r.erp.numero}` : '') },
    { key: 'ee', label: 'Estado en el ERP', width: 150, value: (r) => r.estadoErp },
    { key: 'venta', label: 'Venta ERP', width: 90, value: (r) => r.erp?.venta ?? '' },
    { key: 'prop', label: 'Se enviaría a la web', width: 150, value: (r) => (r.propuesto ? nombreEstadoWeb(r.propuesto) : ''), cellStyle: (r) => (r.propuesto ? DIF : undefined) },
  ]
  const actual = filas[sel]

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <FiltroFechas filtro={filtro} onChange={setFiltro}>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={soloDistintos} onChange={(e) => setSoloDistintos(e.target.checked)} /> Solo los que habría que actualizar
        </label>
        <button type="button" className="gw-btn" onClick={buscar} disabled={cargando}>
          <Search size={14} /> {cargando ? 'Leyendo la web…' : 'Buscar'}
        </button>
        <button type="button" className="gw-btn" disabled={!filas.length} onClick={() => descargarCsv('estado-pedidos-web.csv', cols.map((c) => c.label), filas.map((r) => cols.map((c) => c.value(r))))}>
          <FileDown size={14} /> CSV
        </button>
      </FiltroFechas>
      <WebError error={error} />
      <Nota>«Se enviaría a la web»: el estado que correspondería según el ERP (entregado → Completado, anulado → Cancelado, importado → Procesando). Es solo una vista previa.</Nota>
      <Tabla rows={filas} cols={cols} rowKey={(r) => String(r.p.id)} sel={sel} onSel={setSel} vacio={datos ? 'Sin pedidos.' : 'Cargando…'} onOpen={(r) => r.erp && navigate(`/pedidos/${encodeURIComponent(r.erp.tienda)}/${r.erp.numero}`)} />
      <div className="flex flex-none items-center gap-2">
        <button type="button" className="gw-btn" disabled={!actual?.erp} onClick={() => actual?.erp && navigate(`/pedidos/${encodeURIComponent(actual.erp.tienda)}/${actual.erp.numero}`)}>
          Abrir pedido del ERP
        </button>
        <BotonPendiente>Enviar estado a la web</BotonPendiente>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}
