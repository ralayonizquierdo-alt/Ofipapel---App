import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, Search } from 'lucide-react'
import { nombreEstadoWeb, wc, type WcNotaPedido, type WcPedido } from '../../lib/woocommerce'
import { descargarCsv, nombreDePedido } from '../../lib/webMapeo'
import { BotonPendiente, ESTILO_FALTA, estadoErp, eur, fechaHoraEs, filtroWebInicial, FiltroFechas, Nota, Tabla, WebError, type Col, type PedidoErpWeb } from './comun'
import { cargarPedidosWeb } from './pedidosWeb'
import { quitarHtml, seguimientosDe, type Seguimiento } from './textos'

interface Fila {
  p: WcPedido
  erp: PedidoErpWeb | undefined
  metodo: string
  destino: string
  seguimiento: Seguimiento[]
}

const metodoDe = (p: WcPedido) => (p.shipping_lines ?? []).map((s) => s.method_title).join(' + ') || 'Sin envío'
function destinoDe(p: WcPedido) {
  const d = p.shipping?.address_1 || p.shipping?.city ? p.shipping! : p.billing
  return [d.postcode, d.city, d.state].filter(Boolean).join(' ')
}

/** Web → Envíos y Seguimiento: método de envío, destino, seguimiento y notas de cada pedido web (solo lectura). */
export function EnviosWebPage() {
  const navigate = useNavigate()
  const [filtro, setFiltro] = useState(() => filtroWebInicial())
  const [datos, setDatos] = useState<{ pedidos: WcPedido[]; erp: Map<number, PedidoErpWeb> } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [cargando, setCargando] = useState(false)
  const [metodo, setMetodo] = useState('')
  const [soloSin, setSoloSin] = useState(false)
  const [sel, setSel] = useState(0)
  const [notas, setNotas] = useState<Map<number, WcNotaPedido[]>>(new Map())
  const [errorNotas, setErrorNotas] = useState<unknown>(null)

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

  const todas: Fila[] = useMemo(
    () => (datos?.pedidos ?? []).map((p) => ({ p, erp: datos!.erp.get(p.id), metodo: metodoDe(p), destino: destinoDe(p), seguimiento: seguimientosDe(p) })),
    [datos],
  )
  const metodos = useMemo(() => [...new Set(todas.map((f) => f.metodo))].sort(), [todas])
  const filas = useMemo(() => todas.filter((f) => (!metodo || f.metodo === metodo) && (!soloSin || !f.seguimiento.length)), [todas, metodo, soloSin])
  const actual = filas[sel]

  // Notas del pedido seleccionado: se leen al elegirlo y se guardan mientras la ventana esté abierta.
  useEffect(() => {
    if (!actual || notas.has(actual.p.id)) return
    let vivo = true
    setErrorNotas(null)
    wc.get<WcNotaPedido[]>(`orders/${actual.p.id}/notes`, { type: 'any' })
      .then((r) => vivo && setNotas((m) => new Map(m).set(actual.p.id, r.data ?? [])))
      .catch((e) => vivo && setErrorNotas(e))
    return () => {
      vivo = false
    }
  }, [actual, notas])

  const cols: Col<Fila>[] = [
    { key: 'num', label: 'Nº Web', width: 70, align: 'right', value: (r) => Number(r.p.number ?? r.p.id) },
    { key: 'fecha', label: 'Fecha', width: 115, value: (r) => r.p.date_created, render: (r) => fechaHoraEs(r.p.date_created) },
    { key: 'cli', label: 'Cliente', width: 190, value: (r) => nombreDePedido(r.p) },
    { key: 'ew', label: 'Estado web', width: 105, value: (r) => nombreEstadoWeb(r.p.status) },
    { key: 'met', label: 'Método de envío', width: 160, value: (r) => r.metodo },
    { key: 'coste', label: 'Portes', width: 65, align: 'right', value: (r) => Number(r.p.shipping_total || 0), render: (r) => eur(Number(r.p.shipping_total || 0)) },
    { key: 'dest', label: 'Destino', width: 170, value: (r) => r.destino },
    {
      key: 'seg',
      label: 'Seguimiento',
      width: 170,
      value: (r) => r.seguimiento.map((s) => `${s.empresa} ${s.numero}`.trim()).join(' · '),
      cellStyle: (r) => (!r.seguimiento.length && r.p.status === 'completed' && r.metodo !== 'Sin envío' ? ESTILO_FALTA : undefined),
    },
    { key: 'ee', label: 'Estado ERP', width: 130, value: (r) => estadoErp(r.erp) },
  ]
  const colsN: Col<WcNotaPedido>[] = [
    { key: 'fecha', label: 'Fecha', width: 115, value: (n) => n.date_created, render: (n) => fechaHoraEs(n.date_created) },
    { key: 'tipo', label: 'Tipo', width: 105, value: (n) => (n.customer_note ? 'Al cliente' : 'Privada') },
    { key: 'autor', label: 'Autor', width: 120, value: (n) => n.author ?? '' },
    { key: 'nota', label: 'Nota', width: 680, value: (n) => quitarHtml(n.note) },
  ]
  const notasActual = actual ? (notas.get(actual.p.id) ?? null) : null

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <FiltroFechas filtro={filtro} onChange={setFiltro}>
        <button type="button" className="gw-btn" onClick={buscar} disabled={cargando}>
          <Search size={14} /> {cargando ? 'Leyendo la web…' : 'Buscar'}
        </button>
      </FiltroFechas>
      <div className="flex flex-none flex-wrap items-center gap-2">
        <span className="gw-label">Método:</span>
        <select className="gw-input w-[220px]! flex-none" value={metodo} onChange={(e) => setMetodo(e.target.value)}>
          <option value="">Todos</option>
          {metodos.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={soloSin} onChange={(e) => setSoloSin(e.target.checked)} /> Solo sin número de seguimiento
        </label>
        <button type="button" className="gw-btn" disabled={!filas.length} onClick={() => descargarCsv('envios-web.csv', cols.map((c) => c.label), filas.map((r) => cols.map((c) => c.value(r))))}>
          <FileDown size={14} /> CSV
        </button>
      </div>
      <WebError error={error} />
      <Nota>
        Seguimiento: el que guardan en el pedido los plugins de envío (Shipment Tracking y similares). Las notas del pedido (privadas y al cliente) se leen al
        seleccionarlo; ahí suele apuntarse la agencia y el número cuando no hay plugin.
      </Nota>
      <Tabla rows={filas} cols={cols} rowKey={(r) => String(r.p.id)} sel={sel} onSel={setSel} vacio={datos ? 'Sin pedidos en el periodo.' : error ? 'Sin datos de la web.' : 'Cargando…'} onOpen={(r) => r.erp && navigate(`/pedidos/${encodeURIComponent(r.erp.tienda)}/${r.erp.numero}`)} />
      <WebError error={errorNotas} />
      <div className="flex h-[160px] flex-none flex-col gap-1">
        <span className="gw-label">{actual ? `Notas del pedido nº ${actual.p.number ?? actual.p.id}:` : 'Notas del pedido:'}</span>
        <Tabla rows={notasActual ?? []} cols={colsN} rowKey={(n) => String(n.id)} vacio={!actual ? 'Selecciona un pedido.' : notasActual ? 'El pedido no tiene notas.' : 'Cargando…'} className="min-h-0!" />
      </div>
      <div className="flex flex-none items-center gap-2">
        <button type="button" className="gw-btn" disabled={!actual?.erp} onClick={() => actual?.erp && navigate(`/pedidos/${encodeURIComponent(actual.erp.tienda)}/${actual.erp.numero}`)}>
          Abrir pedido del ERP
        </button>
        <BotonPendiente>Enviar número de seguimiento a la web</BotonPendiente>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}
