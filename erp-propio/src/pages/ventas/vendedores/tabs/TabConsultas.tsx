import { useEffect, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../../lib/supabase'
import { Binoculars, ChevronFirst, ChevronLast, Play } from 'lucide-react'
import { GwGroup, GwInput, GwRadio, GwSelect, formatGw } from '../../../../components/gw'
import { FilasVacias } from '../../../../components/gw/GwGridParts'

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

type Operador = 'cualquiera' | 'igual' | 'entre' | 'desde' | 'hasta'
type ModoTienda = 'rango' | 'cualquiera' | 'seleccionar'

interface Filtro {
  operador: Operador
  fecha1: string
  fecha2: string
  modoTienda: ModoTienda
  tiendaDesde: string
  tiendaHasta: string
  tienda: string
}

const FILTRO_INICIAL: Filtro = {
  operador: 'entre',
  fecha1: haceUnAno(),
  fecha2: hoy(),
  modoTienda: 'cualquiera',
  tiendaDesde: '',
  tiendaHasta: '',
  tienda: '',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function aplicarFiltro(q: any, campo: string, f: Filtro) {
  if (f.operador === 'igual' && f.fecha1) q = q.eq(campo, f.fecha1)
  if (f.operador === 'entre') {
    if (f.fecha1) q = q.gte(campo, f.fecha1)
    if (f.fecha2) q = q.lte(campo, f.fecha2)
  }
  if (f.operador === 'desde' && f.fecha1) q = q.gte(campo, f.fecha1)
  if (f.operador === 'hasta' && f.fecha1) q = q.lte(campo, f.fecha1)
  if (f.modoTienda === 'seleccionar' && f.tienda) q = q.eq('tienda_terminal_codigo', f.tienda)
  if (f.modoTienda === 'rango') {
    if (f.tiendaDesde) q = q.gte('tienda_terminal_codigo', f.tiendaDesde)
    if (f.tiendaHasta) q = q.lte('tienda_terminal_codigo', f.tiendaHasta)
  }
  return q
}

function estadoPedido(p: Pedido) {
  if (p.anulado) return 'Anulado'
  if (p.liquidado === 5) return 'Liquidado'
  if (p.entregado) return 'Entregado'
  if (p.preparado) return 'Preparado'
  if (p.aceptado) return 'Aceptado'
  return 'Pendiente'
}

export function TabConsultas({ codigo: clienteCodigo, campo }: { codigo: string; campo: 'vendedor_codigo' | 'tecnico_codigo' }) {
  const navigate = useNavigate()
  const subtabs = SUBTABS.map((t) => (t.key === 'facturas' && campo === 'tecnico_codigo' ? { ...t, disabled: true } : t))
  const [sub, setSub] = useState<Sub>('ventas')
  const [borrador, setBorrador] = useState<Filtro>(FILTRO_INICIAL)
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_INICIAL)
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
          .eq(campo, clienteCodigo)
          .order('fecha', { ascending: false })
          .order('numero', { ascending: false })
          .limit(500)
        q = aplicarFiltro(q, 'fecha', filtro)
        const { data, error: err } = await q
        if (!vivo) return
        if (err) setError(err.message)
        setVentas((data ?? []) as Venta[])
      } else if (sub === 'facturas') {
        let q = supabase
          .from('factura')
          .select('tienda_terminal_codigo, numero, serie, n_factura, fecha_factura, total_base, total_igic, total, total_pendiente, estado')
          .eq(campo, clienteCodigo)
          .order('fecha_factura', { ascending: false })
          .limit(500)
        q = aplicarFiltro(q, 'fecha_factura', filtro)
        const { data, error: err } = await q
        if (!vivo) return
        if (err) setError(err.message)
        setFacturas((data ?? []) as Factura[])
      } else {
        let q = supabase
          .from('pedido_cliente')
          .select('tienda_terminal_codigo, numero, fecha, total, anulado, aceptado, preparado, entregado, liquidado, venta_numero, web_pedido_id')
          .eq(campo, clienteCodigo)
          .order('fecha', { ascending: false })
          .order('numero', { ascending: false })
          .limit(500)
        q = sub === 'presupuestos' ? q.eq('es_presupuesto', true) : q.or('es_presupuesto.is.null,es_presupuesto.eq.false')
        q = aplicarFiltro(q, 'fecha', filtro)
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
  }, [clienteCodigo, campo, sub, filtro])

  const claves =
    sub === 'ventas'
      ? ventas.map((v) => `${v.tienda_terminal_codigo}-${v.numero}`)
      : sub === 'facturas'
        ? facturas.map((f) => `${f.tienda_terminal_codigo}-${f.numero}`)
        : pedidos.map((p) => `${p.tienda_terminal_codigo}-${p.numero}`)

  return (
    <div className="flex flex-col gap-1" title="Historial de ventas, facturas, pedidos y presupuestos">
      <div className="flex items-stretch gap-2">
        <GwGroup title="Filtrar Según Fecha" className="grid w-[420px] grid-cols-2 gap-x-2 gap-y-1">
          <GwSelect value="fecha" disabled title="Campo de fecha">
            <option value="fecha">Fecha</option>
          </GwSelect>
          <GwSelect value={borrador.operador} onChange={(e) => setBorrador({ ...borrador, operador: e.target.value as Operador })}>
            <option value="cualquiera">Cualquiera</option>
            <option value="igual">Igual que</option>
            <option value="entre">Entre</option>
            <option value="desde">Desde</option>
            <option value="hasta">Hasta</option>
          </GwSelect>
          <GwInput
            type="date"
            disabled={borrador.operador === 'cualquiera'}
            value={borrador.fecha1}
            onChange={(e) => setBorrador({ ...borrador, fecha1: e.target.value })}
          />
          <GwInput
            type="date"
            disabled={borrador.operador !== 'entre'}
            value={borrador.fecha2}
            onChange={(e) => setBorrador({ ...borrador, fecha2: e.target.value })}
          />
        </GwGroup>
        <GwGroup title="Tiendas" className="grid w-[320px] grid-cols-[110px_minmax(0,1fr)] items-center gap-x-2 gap-y-0.5">
          <GwRadio
            name="vend-consultas-tiendas"
            label="Desde/Hasta"
            checked={borrador.modoTienda === 'rango'}
            onChange={() => setBorrador({ ...borrador, modoTienda: 'rango' })}
          />
          <div className="grid grid-cols-2 gap-1">
            {(['tiendaDesde', 'tiendaHasta'] as const).map((k) => (
              <GwSelect
                key={k}
                disabled={borrador.modoTienda !== 'rango'}
                value={borrador[k]}
                onChange={(e) => setBorrador({ ...borrador, [k]: e.target.value })}
              >
                <option value="" />
                {tiendas.map((t) => (
                  <option key={t.codigo} value={t.codigo} title={t.descripcion}>
                    {t.codigo}
                  </option>
                ))}
              </GwSelect>
            ))}
          </div>
          <GwRadio
            name="vend-consultas-tiendas"
            label="Cualquiera"
            checked={borrador.modoTienda === 'cualquiera'}
            onChange={() => setBorrador({ ...borrador, modoTienda: 'cualquiera' })}
          />
          <span />
          <GwRadio
            name="vend-consultas-tiendas"
            label="Seleccionar"
            checked={borrador.modoTienda === 'seleccionar'}
            onChange={() => setBorrador({ ...borrador, modoTienda: 'seleccionar' })}
          />
          <GwSelect
            disabled={borrador.modoTienda !== 'seleccionar'}
            value={borrador.tienda}
            onChange={(e) => setBorrador({ ...borrador, tienda: e.target.value })}
          >
            <option value="" />
            {tiendas.map((t) => (
              <option key={t.codigo} value={t.codigo}>
                {t.codigo} — {t.descripcion}
              </option>
            ))}
          </GwSelect>
        </GwGroup>
        <div className="ml-auto flex flex-col justify-start pt-2">
          <button type="button" className="gw-btn h-[30px] w-[90px]" onClick={() => setFiltro({ ...borrador })}>
            <span className="text-[#c42b1c]">×</span>Aplicar
          </button>
          <span className="gw-label mt-1 text-[#6d6d6d]">{cargando ? 'Buscando…' : ''}</span>
        </div>
      </div>

      <div className="flex flex-col gap-1">
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
        <NavRejilla claves={claves} sel={sel} setSel={setSel} />
      </div>
      <div className="-mt-px flex">
        {subtabs.map((t) => (
          <button
            key={t.key}
            type="button"
            disabled={t.disabled}
            title={t.disabled ? 'Aún no disponible' : undefined}
            onClick={() => setSub(t.key)}
            className={`whitespace-nowrap border border-[var(--gw-border)] px-2.5 text-[14px] disabled:text-[#9a9a9a] ${
              sub === t.key ? 'z-10 h-[28px] border-t-transparent bg-[var(--gw-face)] font-bold' : 'h-[26px] bg-[#f6f6f6] enabled:hover:bg-[#e5f1fb]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>
    </div>
  )
}

function NavRejilla({ claves, sel, setSel }: { claves: string[]; sel: string | null; setSel: (k: string) => void }) {
  const i = sel ? claves.indexOf(sel) : -1
  const ir = (n: number) => {
    if (claves.length) setSel(claves[Math.max(0, Math.min(claves.length - 1, n))])
  }
  const b =
    'flex h-[22px] w-[64px] items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent'
  const vacio = claves.length === 0
  return (
    <div className="flex w-fit border border-[var(--gw-border)] bg-[var(--gw-face)]">
      <button type="button" className={b} title="Primero" disabled={vacio} onClick={() => ir(0)}>
        <ChevronFirst size={13} strokeWidth={3} />
      </button>
      <button type="button" className={b} title="Anterior" disabled={vacio} onClick={() => ir(i - 1)}>
        <Play size={9} className="rotate-180" fill="currentColor" />
      </button>
      <button type="button" className={b} title="Siguiente" disabled={vacio} onClick={() => ir(i + 1)}>
        <Play size={9} fill="currentColor" />
      </button>
      <button type="button" className={b} title="Último" disabled={vacio} onClick={() => ir(claves.length - 1)}>
        <ChevronLast size={13} strokeWidth={3} />
      </button>
      <button
        type="button"
        className={`${b} border-r-0`}
        title="Buscar por número"
        disabled={vacio}
        onClick={() => {
          const q = window.prompt('Buscar por número:')?.trim()
          const k = q ? claves.find((c) => c.endsWith(`-${q}`)) : undefined
          if (k) setSel(k)
        }}
      >
        <Binoculars size={13} />
      </button>
    </div>
  )
}

function Rejilla(
{
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
    <div className="h-[250px] overflow-y-auto border border-[var(--gw-border)] bg-white">
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
          {children}
          {children.length === 0 && (
            <tr>
              <td colSpan={cabecera.length} className="text-center text-[#6d6d6d]">
                {vacio}
              </td>
            </tr>
          )}
          <FilasVacias cols={cabecera.length} ocupadas={Math.max(children.length, 1)} total={9} />
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
