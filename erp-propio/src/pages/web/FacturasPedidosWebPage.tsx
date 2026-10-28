import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import type { WcPedido } from '../../lib/woocommerce'
import { descargarCsv, nombreDePedido } from '../../lib/webMapeo'
import { fechaEs } from '../ventas/gestores/comun'
import { BotonPendiente, ESTILO_FALTA, eur, fechaHoraEs, filtroWebInicial, FiltroFechas, Nota, Tabla, WebError, type Col, type PedidoErpWeb } from './comun'
import { cargarPedidosWeb } from './pedidosWeb'

interface Clave {
  t: string
  n: number
}

interface FacturaErp extends Clave {
  serie: string | null
  nFactura: string | null
  fecha: string | null
  total: number | null
  aeat: string | null
}

interface Fila {
  p: WcPedido
  erp: PedidoErpWeb | undefined
  venta: Clave | null
  factura: FacturaErp | null
  situacion: string
}

const SITUACIONES = ['Facturado', 'Vendido sin facturar', 'Importado sin vender', 'Anulado en el ERP', 'No importado']

function claveVenta(erp: PedidoErpWeb | undefined): Clave | null {
  if (!erp?.venta) return null
  const i = erp.venta.lastIndexOf('/')
  return { t: erp.venta.slice(0, i), n: Number(erp.venta.slice(i + 1)) }
}

/** Facturas del ERP de las ventas que salieron de pedidos web: pedido_cliente.web_pedido_id → venta → factura. */
async function cargarFacturas(ventas: Clave[]): Promise<Map<string, FacturaErp>> {
  const out = new Map<string, FacturaErp>()
  const vf: { t: string; n: number; ft: string; fn: number }[] = []
  for (let i = 0; i < ventas.length; i += 100) {
    const trozo = ventas.slice(i, i + 100)
    const or = trozo.map((v) => `and(tienda_terminal_codigo.eq.${v.t},numero.eq.${v.n})`).join(',')
    const { data, error } = await supabase.from('venta').select('tienda_terminal_codigo, numero, factura_tienda_codigo, factura_numero').or(or).not('factura_numero', 'is', null)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) vf.push({ t: r.tienda_terminal_codigo, n: r.numero, ft: r.factura_tienda_codigo, fn: r.factura_numero })
  }
  for (let i = 0; i < vf.length; i += 100) {
    const trozo = vf.slice(i, i + 100)
    const or = trozo.map((v) => `and(tienda_terminal_codigo.eq.${v.ft},numero.eq.${v.fn})`).join(',')
    const { data, error } = await supabase.from('factura').select('tienda_terminal_codigo, numero, serie, n_factura, fecha_factura, total, estado_envio_aeat').or(or)
    if (error) throw new Error(error.message)
    const porClave = new Map((data ?? []).map((f) => [`${f.tienda_terminal_codigo}/${f.numero}`, f]))
    for (const v of trozo) {
      const f = porClave.get(`${v.ft}/${v.fn}`)
      out.set(`${v.t}/${v.n}`, {
        t: v.ft,
        n: v.fn,
        serie: f?.serie ?? null,
        nFactura: f?.n_factura == null ? null : String(f.n_factura),
        fecha: f?.fecha_factura ?? null,
        total: f?.total == null ? null : Number(f.total),
        aeat: f?.estado_envio_aeat ?? null,
      })
    }
  }
  return out
}

/** Web → Facturas de Pedidos Web: pedidos web completados y su factura del ERP, si la tienen (solo lectura). */
export function FacturasPedidosWebPage() {
  const navigate = useNavigate()
  const [filtro, setFiltro] = useState(() => filtroWebInicial())
  const [datos, setDatos] = useState<{ pedidos: WcPedido[]; erp: Map<number, PedidoErpWeb>; facturas: Map<string, FacturaErp> } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [cargando, setCargando] = useState(false)
  const [situacion, setSituacion] = useState('')
  const [sel, setSel] = useState(0)

  async function buscar() {
    setCargando(true)
    setError(null)
    try {
      const r = await cargarPedidosWeb(filtro, 'completed')
      const ventas = [...r.erp.values()].map(claveVenta).filter((v): v is Clave => !!v)
      setDatos({ ...r, facturas: await cargarFacturas(ventas) })
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
          const venta = claveVenta(erp)
          const factura = venta ? (datos!.facturas.get(`${venta.t}/${venta.n}`) ?? null) : null
          const situacion = !erp ? 'No importado' : erp.anulado ? 'Anulado en el ERP' : factura ? 'Facturado' : venta ? 'Vendido sin facturar' : 'Importado sin vender'
          return { p, erp, venta, factura, situacion }
        })
        .filter((f) => !situacion || f.situacion === situacion),
    [datos, situacion],
  )
  const resumen = useMemo(() => {
    const m = new Map<string, number>()
    for (const p of datos?.pedidos ?? []) {
      const erp = datos!.erp.get(p.id)
      const v = claveVenta(erp)
      const s = !erp ? 'No importado' : erp.anulado ? 'Anulado en el ERP' : v && datos!.facturas.has(`${v.t}/${v.n}`) ? 'Facturado' : v ? 'Vendido sin facturar' : 'Importado sin vender'
      m.set(s, (m.get(s) ?? 0) + 1)
    }
    return SITUACIONES.filter((s) => m.get(s)).map((s) => `${s}: ${m.get(s)}`).join(' · ')
  }, [datos])

  const cols: Col<Fila>[] = [
    { key: 'num', label: 'Nº Web', width: 70, align: 'right', value: (r) => Number(r.p.number ?? r.p.id) },
    { key: 'fecha', label: 'Fecha', width: 115, value: (r) => r.p.date_created, render: (r) => fechaHoraEs(r.p.date_created) },
    { key: 'cli', label: 'Cliente', width: 210, value: (r) => nombreDePedido(r.p) },
    { key: 'total', label: 'Total web', width: 80, align: 'right', value: (r) => Number(r.p.total), render: (r) => eur(Number(r.p.total)) },
    { key: 'ped', label: 'Pedido ERP', width: 90, value: (r) => (r.erp ? `${r.erp.tienda}/${r.erp.numero}` : '') },
    { key: 'venta', label: 'Venta ERP', width: 85, value: (r) => r.erp?.venta ?? '' },
    { key: 'fac', label: 'Factura ERP', width: 105, value: (r) => (r.factura ? `${r.factura.serie ? `${r.factura.serie} ` : ''}${r.factura.nFactura ?? `${r.factura.t}/${r.factura.n}`}` : '') },
    { key: 'ffac', label: 'Fecha fact.', width: 85, value: (r) => r.factura?.fecha ?? null, render: (r) => fechaEs(r.factura?.fecha) },
    { key: 'tfac', label: 'Total fact.', width: 80, align: 'right', value: (r) => r.factura?.total ?? null, render: (r) => eur(r.factura?.total) },
    { key: 'sit', label: 'Situación', width: 145, value: (r) => r.situacion, cellStyle: (r) => (r.situacion === 'Facturado' ? undefined : ESTILO_FALTA) },
  ]
  const actual = filas[sel]
  const abrir = (r: Fila | undefined) => {
    if (!r) return
    if (r.factura) navigate(`/facturacion/${encodeURIComponent(r.factura.t)}/${r.factura.n}`)
    else if (r.venta) navigate(`/ventas/${encodeURIComponent(r.venta.t)}/${r.venta.n}`)
    else if (r.erp) navigate(`/pedidos/${encodeURIComponent(r.erp.tienda)}/${r.erp.numero}`)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <FiltroFechas filtro={filtro} onChange={setFiltro} conEstado={false}>
        <span className="gw-label">Situación:</span>
        <select className="gw-input w-[175px]! flex-none" value={situacion} onChange={(e) => setSituacion(e.target.value)}>
          <option value="">Todas</option>
          {SITUACIONES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <button type="button" className="gw-btn" onClick={buscar} disabled={cargando}>
          <Search size={14} /> {cargando ? 'Leyendo la web…' : 'Buscar'}
        </button>
        <button type="button" className="gw-btn" disabled={!filas.length} onClick={() => descargarCsv('facturas-pedidos-web.csv', cols.map((c) => c.label), filas.map((r) => cols.map((c) => c.value(r))))}>
          <FileDown size={14} /> CSV
        </button>
      </FiltroFechas>
      <WebError error={error} />
      <Nota>
        Pedidos web en estado «Completado» del periodo y su factura en el ERP (pedido importado → venta → factura). Doble clic abre la factura, o la venta o el
        pedido si aún no hay factura. {resumen}
      </Nota>
      <Tabla rows={filas} cols={cols} rowKey={(r) => String(r.p.id)} sel={sel} onSel={setSel} vacio={datos ? 'Sin pedidos completados en el periodo.' : error ? 'Sin datos de la web.' : 'Cargando…'} onOpen={abrir} />
      <div className="flex flex-none items-center gap-2">
        <button type="button" className="gw-btn" disabled={!actual?.factura} onClick={() => abrir(actual)}>
          Abrir factura
        </button>
        <button type="button" className="gw-btn" disabled={!actual?.venta} onClick={() => actual?.venta && navigate(`/ventas/${encodeURIComponent(actual.venta.t)}/${actual.venta.n}`)}>
          Abrir venta
        </button>
        <button type="button" className="gw-btn" disabled={!actual?.erp} onClick={() => actual?.erp && navigate(`/pedidos/${encodeURIComponent(actual.erp.tienda)}/${actual.erp.numero}`)}>
          Abrir pedido
        </button>
        <BotonPendiente>Adjuntar factura al pedido web</BotonPendiente>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}
