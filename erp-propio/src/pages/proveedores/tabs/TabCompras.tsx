import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Binoculars, ChevronFirst, ChevronLast, Play } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwGroup, GwInput, GwRadio, GwSelect, formatGw } from '../../../components/gw'
import { FilasVacias } from '../../../components/gw/GwGridParts'
import type { ProveedorTabProps } from '../types'

interface Compra {
  tienda_terminal_codigo: string
  numero: number
  fecha_hora: string | null
  numero_albaran_proveedor: string | null
  numero_factura_proveedor_externo: string | null
  estado: string | null
  recibido: boolean | null
  pagado: boolean | null
  total: number | null
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

const finDia = (d: string) => `${d}T23:59:59.999`

/** También la usa la ficha de Transportistas (campo='transportista_codigo'). */
export function TabCompras({ proveedor, campo = 'proveedor_codigo' }: ProveedorTabProps & { campo?: 'proveedor_codigo' | 'transportista_codigo' }) {
  const navigate = useNavigate()
  const proveedorCodigo = proveedor.codigo
  const [borrador, setBorrador] = useState<Filtro>(FILTRO_INICIAL)
  const [filtro, setFiltro] = useState<Filtro>(FILTRO_INICIAL)
  const [tiendas, setTiendas] = useState<{ codigo: string; descripcion: string }[]>([])
  const [rows, setRows] = useState<Compra[]>([])
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
    if (!proveedorCodigo) return
    let vivo = true
    setCargando(true)
    setError(null)
    setSel(null)
    ;(async () => {
      let q = supabase
        .from('pedido_proveedor')
        .select('tienda_terminal_codigo, numero, fecha_hora, numero_albaran_proveedor, numero_factura_proveedor_externo, estado, recibido, pagado, total')
        .eq(campo, proveedorCodigo)
        .order('fecha_hora', { ascending: false })
        .order('numero', { ascending: false })
        .limit(500)
      const f = filtro
      if (f.operador === 'igual' && f.fecha1) q = q.gte('fecha_hora', f.fecha1).lte('fecha_hora', finDia(f.fecha1))
      if (f.operador === 'entre') {
        if (f.fecha1) q = q.gte('fecha_hora', f.fecha1)
        if (f.fecha2) q = q.lte('fecha_hora', finDia(f.fecha2))
      }
      if (f.operador === 'desde' && f.fecha1) q = q.gte('fecha_hora', f.fecha1)
      if (f.operador === 'hasta' && f.fecha1) q = q.lte('fecha_hora', finDia(f.fecha1))
      if (f.modoTienda === 'seleccionar' && f.tienda) q = q.eq('tienda_terminal_codigo', f.tienda)
      if (f.modoTienda === 'rango') {
        if (f.tiendaDesde) q = q.gte('tienda_terminal_codigo', f.tiendaDesde)
        if (f.tiendaHasta) q = q.lte('tienda_terminal_codigo', f.tiendaHasta)
      }
      const { data, error: err } = await q
      if (!vivo) return
      if (err) setError(err.message)
      setRows((data ?? []) as Compra[])
      setCargando(false)
    })()
    return () => {
      vivo = false
    }
  }, [proveedorCodigo, filtro, campo])

  const claves = rows.map((r) => `${r.tienda_terminal_codigo}-${r.numero}`)
  const total = rows.reduce((acc, r) => acc + Number(r.total ?? 0), 0)
  const pendiente = rows.filter((r) => !r.pagado).reduce((acc, r) => acc + Number(r.total ?? 0), 0)

  return (
    <div className="flex flex-col gap-1" title="Historial de compras del proveedor">
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
            name="compras-tiendas"
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
            name="compras-tiendas"
            label="Cualquiera"
            checked={borrador.modoTienda === 'cualquiera'}
            onChange={() => setBorrador({ ...borrador, modoTienda: 'cualquiera' })}
          />
          <span />
          <GwRadio
            name="compras-tiendas"
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

      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
      <div className="h-[250px] overflow-y-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid" title="PEDIDCAB">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 60 }}>Tienda</th>
              <th style={{ width: 90 }}>Número</th>
              <th style={{ width: 90 }}>Fecha</th>
              <th>Nº Albarán Prov.</th>
              <th>Nº Factura Prov.</th>
              <th style={{ width: 110 }}>Estado</th>
              <th style={{ width: 70 }}>Recibido</th>
              <th style={{ width: 70 }}>Pagado</th>
              <th style={{ width: 100 }} className="text-right!">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const k = `${r.tienda_terminal_codigo}-${r.numero}`
              return (
                <tr key={k} className={sel === k ? 'gw-selected' : ''} onClick={() => setSel(k)} onDoubleClick={() => navigate('/compras')}>
                  <td>{r.tienda_terminal_codigo}</td>
                  <td>{r.numero}</td>
                  <td>{fecha(r.fecha_hora)}</td>
                  <td>{r.numero_albaran_proveedor ?? ''}</td>
                  <td>{r.numero_factura_proveedor_externo ?? ''}</td>
                  <td>{r.estado ?? ''}</td>
                  <td>{r.recibido ? 'Sí' : 'No'}</td>
                  <td>{r.pagado ? 'Sí' : 'No'}</td>
                  <td className="text-right">{eur(r.total)}</td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="text-center text-[#6d6d6d]">
                  Sin compras en el periodo.
                </td>
              </tr>
            )}
            <FilasVacias cols={9} ocupadas={Math.max(rows.length, 1)} total={9} />
          </tbody>
          <tfoot className="sticky bottom-0">
            <tr>
              <td className="bg-[#f0f0f0] font-bold" />
              <td className="bg-[#f0f0f0] font-bold" colSpan={2}>
                {rows.length} compras
              </td>
              <td className="bg-[#f0f0f0] font-bold text-right" colSpan={5}>
                Pendiente de pago: {eur(pendiente)}
              </td>
              <td className="bg-[#f0f0f0] font-bold text-right">{eur(total)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <NavRejilla claves={claves} sel={sel} setSel={setSel} />
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
