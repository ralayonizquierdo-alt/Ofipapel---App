import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { GwField, GwInput, GwSelect, formatGw } from '../../../components/gw'
import type { ClienteTabProps } from '../types'

type Sub = 'ventas' | 'facturas' | 'pedidos' | 'presupuestos' | 'reparaciones'

const SUBTABS: { key: Sub; label: string; disabled?: boolean }[] = [
  { key: 'ventas', label: 'Ventas' },
  { key: 'facturas', label: 'Facturas' },
  { key: 'pedidos', label: 'Pedidos' },
  { key: 'presupuestos', label: 'Presupuestos' },
  { key: 'reparaciones', label: 'Reparaciones', disabled: true },
]

interface Venta {
  tienda_terminal_codigo: string
  numero: number
  fecha: string | null
  hora: string | null
  tipo_credito: string | null
  total: number | null
  total_pagado: number | null
  total_pendiente: number | null
  factura_numero: number | null
}

interface Factura {
  tienda_terminal_codigo: string
  numero: number
  serie: string
  n_factura: number
  fecha_factura: string | null
  total_base: number | null
  total_igic: number | null
  total: number
  total_pendiente: number | null
  estado: string | null
}

interface Pedido {
  tienda_terminal_codigo: string
  numero: number
  fecha: string | null
  total: number | null
  anulado: boolean | null
  aceptado: boolean | null
  preparado: boolean | null
  entregado: boolean | null
  liquidado: number | null
  venta_numero: number | null
  web_pedido_id: number | null
}

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

function haceUnAno() {
  const d = new Date()
  d.setFullYear(d.getFullYear() - 1)
  return d.toISOString().slice(0, 10)
}

function fecha(v: string | null) {
  if (!v) return ''
  const [a, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const eur = (v: number | null | undefined) => formatGw(v ?? 0, 2)
const sum = <T,>(rows: T[], f: (r: T) => number | null | undefined) => rows.reduce((acc, r) => acc + Number(f(r) ?? 0), 0)

function estadoPedido(p: Pedido) {
  if (p.anulado) return 'Anulado'
  if (p.liquidado === 5) return 'Liquidado'
  if (p.entregado) return 'Entregado'
  if (p.preparado) return 'Preparado'
  if (p.aceptado) return 'Aceptado'
  return 'Pendiente'
}

export function TabConsultas({ cliente }: ClienteTabProps) {
  const navigate = useNavigate()
  const clienteCodigo = cliente.codigo
  const [sub, setSub] = useState<Sub>('ventas')
  const [desde, setDesde] = useState(haceUnAno())
  const [hasta, setHasta] = useState(hoy())
  const [tienda, setTienda] = useState('')
  const [tiendas, setTiendas] = useState<{ codigo: string; descripcion: string }[]>([])
  const [ventas, setVentas] = useState<Venta[]>([])
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [pedidos, setPedidos] = useState<Pedido[]>([])
  const [sel, setSel] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('tienda_terminal')
      .select('codigo, descripcion')
      .order('codigo')
      .then(({ data }) => setTiendas(data ?? []))
  }, [])

  useEffect(() => {
    if (!clienteCodigo || sub === 'reparaciones') return
    let vivo = true
    setCargando(true)
    setError(null)
    setSel(null)
    ;(async () => {
      if (sub === 'ventas') {
        let q = supabase
          .from('venta')
          .select('tienda_terminal_codigo, numero, fecha, hora, tipo_credito, total, total_pagado, total_pendiente, factura_numero')
          .eq('cliente_codigo', clienteCodigo)
          .order('fecha', { ascending: false })
          .order('numero', { ascending: false })
          .limit(500)
        if (desde) q = q.gte('fecha', desde)
        if (hasta) q = q.lte('fecha', hasta)
        if (tienda) q = q.eq('tienda_terminal_codigo', tienda)
        const { data, error: err } = await q
        if (!vivo) return
        if (err) setError(err.message)
        setVentas((data ?? []) as Venta[])
      } else if (sub === 'facturas') {
        let q = supabase
          .from('factura')
          .select('tienda_terminal_codigo, numero, serie, n_factura, fecha_factura, total_base, total_igic, total, total_pendiente, estado')
          .eq('cliente_codigo', clienteCodigo)
          .order('fecha_factura', { ascending: false })
          .limit(500)
        if (desde) q = q.gte('fecha_factura', desde)
        if (hasta) q = q.lte('fecha_factura', hasta)
        if (tienda) q = q.eq('tienda_terminal_codigo', tienda)
        const { data, error: err } = await q
        if (!vivo) return
        if (err) setError(err.message)
        setFacturas((data ?? []) as Factura[])
      } else {
        let q = supabase
          .from('pedido_cliente')
          .select('tienda_terminal_codigo, numero, fecha, total, anulado, aceptado, preparado, entregado, liquidado, venta_numero, web_pedido_id')
          .eq('cliente_codigo', clienteCodigo)
          .order('fecha', { ascending: false })
          .order('numero', { ascending: false })
          .limit(500)
        q = sub === 'presupuestos' ? q.eq('es_presupuesto', true) : q.or('es_presupuesto.is.null,es_presupuesto.eq.false')
        if (desde) q = q.gte('fecha', desde)
        if (hasta) q = q.lte('fecha', hasta)
        if (tienda) q = q.eq('tienda_terminal_codigo', tienda)
        const { data, error: err } = await q
        if (!vivo) return
        if (err) setError(err.message)
        setPedidos((data ?? []) as Pedido[])
      }
      setCargando(false)
    })()
    return () => {
      vivo = false
    }
  }, [clienteCodigo, sub, desde, hasta, tienda])

  return (
    <div className="flex flex-col gap-1.5" title="Historial del cliente">
      <div className="flex items-end gap-2">
        <GwField label="Desde" className="w-[140px]">
          <GwInput type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </GwField>
        <GwField label="Hasta" className="w-[140px]">
          <GwInput type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </GwField>
        <GwField label="Tienda" className="w-[260px]">
          <GwSelect value={tienda} onChange={(e) => setTienda(e.target.value)}>
            <option value="">Todas</option>
            {tiendas.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.codigo} — {t.descripcion}
              </option>
            ))}
          </GwSelect>
        </GwField>
        <span className="gw-label pb-1 text-[#6d6d6d]">{cargando ? 'Buscando…' : ''}</span>
      </div>

      <div className="flex">
        {SUBTABS.map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={t.disabled}
            title={t.disabled ? 'Aún no disponible' : undefined}
            onClick={() => setSub(t.key)}
            className={`-mb-px flex-auto whitespace-nowrap border border-[var(--gw-border)] px-2 text-[14px] disabled:text-[#9a9a9a] ${
              sub === t.key ? 'z-10 h-[28px] border-b-transparent bg-[var(--gw-face)] font-bold' : 'mt-[2px] h-[26px] bg-[#f6f6f6] enabled:hover:bg-[#e5f1fb]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="-mt-1.5 border border-[var(--gw-border)] bg-[var(--gw-face)] p-1.5">
        {error && <div className="mb-1 border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}

        {sub === 'ventas' && (
          <Rejilla
            cabecera={['Tienda', 'Nº Venta', 'Fecha', 'Hora', 'Tipo', 'Nº Factura', 'Total', 'Pagado', 'Pendiente']}
            derecha={[6, 7, 8]}
            vacio="Sin ventas en el periodo."
            pie={['', `${ventas.length} ventas`, '', '', '', '', eur(sum(ventas, (v) => v.total)), eur(sum(ventas, (v) => v.total_pagado)), eur(sum(ventas, (v) => v.total_pendiente))]}
          >
            {ventas.map((v) => {
              const k = `${v.tienda_terminal_codigo}-${v.numero}`
              return (
                <tr key={k} className={sel === k ? 'gw-selected' : ''} onClick={() => setSel(k)}>
                  <td>{v.tienda_terminal_codigo}</td>
                  <td>{v.numero}</td>
                  <td>{fecha(v.fecha)}</td>
                  <td>{v.hora ?? ''}</td>
                  <td>{v.tipo_credito ?? ''}</td>
                  <td>{v.factura_numero ?? ''}</td>
                  <td className="text-right">{eur(v.total)}</td>
                  <td className="text-right">{eur(v.total_pagado)}</td>
                  <td className="text-right">{eur(v.total_pendiente)}</td>
                </tr>
              )
            })}
          </Rejilla>
        )}

        {sub === 'facturas' && (
          <Rejilla
            cabecera={['Tienda', 'Id Factura', 'D.C.', 'Nº Factura', 'Fecha', 'Estado', 'Base', 'IGIC', 'Total', 'Pendiente']}
            derecha={[6, 7, 8, 9]}
            vacio="Sin facturas en el periodo."
            pie={[
              '',
              `${facturas.length} facturas`,
              '',
              '',
              '',
              '',
              eur(sum(facturas, (f) => f.total_base)),
              eur(sum(facturas, (f) => f.total_igic)),
              eur(sum(facturas, (f) => f.total)),
              eur(sum(facturas, (f) => f.total_pendiente)),
            ]}
          >
            {facturas.map((f) => {
              const k = `${f.tienda_terminal_codigo}-${f.numero}`
              return (
                <tr key={k} className={sel === k ? 'gw-selected' : ''} onClick={() => setSel(k)}>
                  <td>{f.tienda_terminal_codigo}</td>
                  <td>{f.numero}</td>
                  <td>{f.serie}</td>
                  <td>{f.n_factura}</td>
                  <td>{fecha(f.fecha_factura)}</td>
                  <td>{f.estado ?? ''}</td>
                  <td className="text-right">{eur(f.total_base)}</td>
                  <td className="text-right">{eur(f.total_igic)}</td>
                  <td className="text-right">{eur(f.total)}</td>
                  <td className="text-right">{eur(f.total_pendiente)}</td>
                </tr>
              )
            })}
          </Rejilla>
        )}

        {(sub === 'pedidos' || sub === 'presupuestos') && (
          <Rejilla
            cabecera={['Tienda', sub === 'pedidos' ? 'Nº Pedido' : 'Nº Presupuesto', 'Fecha', 'Id Web', 'Estado', 'Nº Venta', 'Total']}
            derecha={[6]}
            vacio={sub === 'pedidos' ? 'Sin pedidos en el periodo.' : 'Sin presupuestos en el periodo.'}
            pie={['', `${pedidos.length} ${sub}`, '', '', '', '', eur(sum(pedidos, (p) => p.total))]}
          >
            {pedidos.map((p) => {
              const k = `${p.tienda_terminal_codigo}-${p.numero}`
              return (
                <tr
                  key={k}
                  className={sel === k ? 'gw-selected' : p.anulado ? 'text-[#8a8a8a]' : ''}
                  onClick={() => setSel(k)}
                  onDoubleClick={() => navigate('/pedidos')}
                >
                  <td>{p.tienda_terminal_codigo}</td>
                  <td>{p.numero}</td>
                  <td>{fecha(p.fecha)}</td>
                  <td>{p.web_pedido_id ?? ''}</td>
                  <td>{estadoPedido(p)}</td>
                  <td>{p.venta_numero ?? ''}</td>
                  <td className="text-right">{eur(p.total)}</td>
                </tr>
              )
            })}
          </Rejilla>
        )}
      </div>
    </div>
  )
}

function Rejilla({
  cabecera,
  derecha,
  vacio,
  pie,
  children,
}: {
  cabecera: string[]
  derecha: number[]
  vacio: string
  pie: string[]
  children: ReactNode[]
}) {
  return (
    <div className="h-[340px] overflow-y-auto border border-[var(--gw-border)] bg-white">
      <table className="gw-grid">
        <thead className="sticky top-0">
          <tr>
            {cabecera.map((c, i) => (
              <th key={c} className={derecha.includes(i) ? 'text-right!' : ''}>
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {children.length === 0 ? (
            <tr>
              <td colSpan={cabecera.length} className="text-center text-[#6d6d6d]">
                {vacio}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
        <tfoot className="sticky bottom-0">
          <tr>
            {pie.map((p, i) => (
              <td key={i} className={`bg-[#f0f0f0] font-bold ${derecha.includes(i) ? 'text-right' : ''}`}>
                {p}
              </td>
            ))}
          </tr>
        </tfoot>
      </table>
    </div>
  )
}
