import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, Search } from 'lucide-react'
import { wc, wcDesde, wcHasta, type WcEstadoTotal, type WcLinea, type WcPedido } from '../../lib/woocommerce'
import { descargarCsv, nombreDePedido } from '../../lib/webMapeo'
import { BotonPendiente, eur, fechaHoraEs, filtroWebInicial, FiltroFechas, Nota, Tabla, WebError, type Col } from './comun'

/**
 * Estados de pedido que usan los plugins de presupuestos de WooCommerce. YITH Request a Quote
 * registra «ywraq-new», «ywraq-pending», «ywraq-accepted»…; otros usan «quote», «quote-request»
 * o un estado traducido («presupuesto»). Se detectan por el nombre en reports/orders/totals,
 * que lista todos los estados que hay registrados en la web, también los de plugins.
 */
const ES_PRESUPUESTO = /quote|ywraq|presupuest|cotiza/i

interface Datos {
  estados: WcEstadoTotal[]
  deQuote: WcEstadoTotal[]
  pedidos: WcPedido[]
}

/** Web → Solicitudes de Presupuesto Web: pedidos en estado de presupuesto si la web tiene un plugin que los crea (solo lectura). */
export function PresupuestosWebPage() {
  const navigate = useNavigate()
  const [filtro, setFiltro] = useState(() => filtroWebInicial('Este año'))
  const [datos, setDatos] = useState<Datos | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [cargando, setCargando] = useState(false)
  const [sel, setSel] = useState(0)

  async function buscar() {
    setCargando(true)
    setError(null)
    try {
      const estados = (await wc.get<WcEstadoTotal[]>('reports/orders/totals')).data ?? []
      const deQuote = estados.filter((e) => ES_PRESUPUESTO.test(e.slug) || ES_PRESUPUESTO.test(e.name))
      let pedidos: WcPedido[] = []
      if (deQuote.length) {
        const r = await wc.todos<WcPedido>(
          'orders',
          { after: wcDesde(filtro.desde), before: wcHasta(filtro.hasta), status: deQuote.map((e) => e.slug.replace(/^wc-/, '')).join(','), orderby: 'date', order: 'desc' },
          10,
        )
        pedidos = r.data ?? []
      }
      setDatos({ estados, deQuote, pedidos })
    } catch (e) {
      setError(e)
    }
    setCargando(false)
  }
  useEffect(() => {
    buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const nombreEstado = useMemo(() => new Map((datos?.estados ?? []).map((e) => [e.slug.replace(/^wc-/, ''), e.name])), [datos])
  const filas = datos?.pedidos ?? []
  const actual = filas[sel]
  const cols: Col<WcPedido>[] = [
    { key: 'num', label: 'Nº Web', width: 70, align: 'right', value: (p) => Number(p.number ?? p.id) },
    { key: 'fecha', label: 'Fecha', width: 115, value: (p) => p.date_created, render: (p) => fechaHoraEs(p.date_created) },
    { key: 'estado', label: 'Estado', width: 140, value: (p) => nombreEstado.get(p.status) ?? p.status },
    { key: 'cli', label: 'Cliente', width: 200, value: (p) => nombreDePedido(p) },
    { key: 'email', label: 'Email', width: 190, value: (p) => p.billing.email ?? '' },
    { key: 'tel', label: 'Teléfono', width: 95, value: (p) => p.billing.phone ?? '' },
    { key: 'lin', label: 'Líneas', width: 55, align: 'right', value: (p) => p.line_items.length },
    { key: 'total', label: 'Total', width: 80, align: 'right', value: (p) => Number(p.total), render: (p) => eur(Number(p.total)) },
    { key: 'nota', label: 'Nota del cliente', width: 250, value: (p) => p.customer_note ?? '' },
  ]
  const colsL: Col<WcLinea>[] = [
    { key: 'sku', label: 'SKU', width: 110, value: (l) => l.sku ?? '' },
    { key: 'name', label: 'Producto', width: 380, value: (l) => l.name },
    { key: 'q', label: 'Cant.', width: 60, align: 'right', value: (l) => Number(l.quantity) },
    { key: 't', label: 'Importe', width: 85, align: 'right', value: (l) => Number(l.total), render: (l) => eur(Number(l.total)) },
  ]

  let explicacion: string
  if (!datos) explicacion = 'Busca en la web los estados de pedido de presupuesto que crean los plugins de solicitud de presupuesto.'
  else if (datos.deQuote.length)
    explicacion = `La web tiene estados de presupuesto: ${datos.deQuote.map((e) => `«${e.name}» (${e.total})`).join(', ')}. Se listan los del periodo.`
  else
    explicacion =
      `La web no tiene ningún estado de pedido de presupuesto (estados registrados: ${datos.estados.map((e) => e.name).join(', ') || 'ninguno'}), así que hoy no ` +
      'recibe solicitudes de presupuesto como pedidos. Si se instala un plugin que las guarde como estado de pedido (p. ej. YITH Request a Quote) aparecerán aquí ' +
      'solas; si las guarda aparte con su propia API, habrá que añadir ese recurso a la lista blanca de la función «woocommerce-erp».'

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <FiltroFechas filtro={filtro} onChange={setFiltro} conEstado={false}>
        <button type="button" className="gw-btn" onClick={buscar} disabled={cargando}>
          <Search size={14} /> {cargando ? 'Leyendo la web…' : 'Buscar'}
        </button>
        <button type="button" className="gw-btn" disabled={!filas.length} onClick={() => descargarCsv('presupuestos-web.csv', cols.map((c) => c.label), filas.map((r) => cols.map((c) => c.value(r))))}>
          <FileDown size={14} /> CSV
        </button>
      </FiltroFechas>
      <WebError error={error} />
      <Nota>{explicacion}</Nota>
      <Tabla
        rows={filas}
        cols={cols}
        rowKey={(p) => String(p.id)}
        sel={sel}
        onSel={setSel}
        vacio={!datos ? (error ? 'Sin datos de la web.' : 'Cargando…') : datos.deQuote.length ? 'Sin solicitudes de presupuesto en el periodo.' : 'La web no tiene solicitudes de presupuesto.'}
      />
      <div className="flex h-[150px] flex-none flex-col gap-1">
        <span className="gw-label">Artículos solicitados:</span>
        <Tabla rows={actual?.line_items ?? []} cols={colsL} rowKey={(l) => String(l.id)} vacio={actual ? 'Sin líneas.' : 'Selecciona una solicitud.'} className="min-h-0!" />
      </div>
      <div className="flex flex-none items-center gap-2">
        <BotonPendiente>Responder el presupuesto en la web</BotonPendiente>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}
