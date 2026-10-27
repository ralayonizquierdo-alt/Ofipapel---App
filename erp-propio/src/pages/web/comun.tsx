import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { Lock, TriangleAlert } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { PENDIENTE_AUTORIZACION, SECRETOS_WOOCOMMERCE, WcError, ESTADOS_PEDIDO_WEB } from '../../lib/woocommerce'
import { ordenar, type Col, type Orden } from '../ventas/gestores/rejilla'
import { PERIODOS, rangoPeriodo, type Periodo } from '../ventas/gestores/comun'
import type { ArticuloCruce, ClienteCruce, ConfigImportacion, FamiliaCruce } from '../../lib/webMapeo'

// Piezas comunes de las ventanas del menú «Web» (no existe en GeminisWin: estilo GW del
// resto del ERP, rejillas gw-grid compactas, Tahoma 13 px, sin solapes a 1366×768).

export type { Col, Orden }

/* ---------- Avisos ---------- */

export function WebError({ error }: { error: unknown }) {
  if (!error) return null
  const e = error as WcError
  if (e.codigo === 'sin_claves') {
    return (
      <div role="alert" className="flex flex-none gap-2 border border-[#c9a400] bg-[#fff8c4] p-2 text-[13px]">
        <TriangleAlert size={18} className="flex-none text-[#b07d00]" />
        <div className="min-w-0">
          <b>Faltan las claves de WooCommerce en Supabase.</b> Hasta que Rober las cree no se puede leer nada de la web.
          <div className="mt-0.5 text-[12px] text-[#444]">
            Supabase → proyecto del ERP → Edge Functions → Secrets:{' '}
            {SECRETOS_WOOCOMMERCE.map((s, i) => (
              <span key={s.nombre}>
                {i ? ', ' : ''}
                <code className="font-bold">{s.nombre}</code>
                {s.obligatorio ? '' : ' (opcional)'}
              </span>
            ))}
            . <Link to="/web/configuracion" className="text-[#1d3a8a] underline">Configuración de la Conexión</Link>
          </div>
        </div>
      </div>
    )
  }
  const texto = error instanceof Error ? error.message : String(error)
  return (
    <div role="alert" className="flex flex-none items-start gap-2 border border-[#d9a0a0] bg-[#fde8e8] p-1.5 text-[13px] text-[#8a1c1c]">
      <TriangleAlert size={16} className="mt-px flex-none" />
      <span className="min-w-0 break-words">{texto}</span>
    </div>
  )
}

/** Botón de una acción que escribiría en la web: siempre desactivado hasta que Rober lo autorice. */
export function BotonPendiente({ children }: { children: ReactNode }) {
  return (
    <span className="flex items-center gap-1.5" title={`La web la gestiona una empresa externa. ${PENDIENTE_AUTORIZACION}.`}>
      <button type="button" className="gw-btn" disabled>
        <Lock size={13} /> {children}
      </button>
      <span className="whitespace-nowrap text-[12px] font-bold text-[#b05a00]">{PENDIENTE_AUTORIZACION}</span>
    </span>
  )
}

export function Nota({ children }: { children: ReactNode }) {
  return <div className="flex-none text-[12px] text-[#555]">{children}</div>
}

/* ---------- Rejilla compacta con orden y selección ---------- */

export function Tabla<T>({
  rows,
  cols,
  rowKey,
  sel,
  onSel,
  onOpen,
  rowStyle,
  vacio = 'Sin datos.',
  className = '',
}: {
  rows: T[]
  cols: Col<T>[]
  rowKey: (r: T) => string
  sel?: number
  onSel?: (i: number) => void
  onOpen?: (r: T) => void
  rowStyle?: (r: T) => CSSProperties | undefined
  vacio?: string
  className?: string
}) {
  const [orden, setOrden] = useState<Orden | null>(null)
  const filas = useMemo(() => ordenar(rows, cols, orden), [rows, cols, orden])
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    ref.current?.querySelector('tr.gw-selected')?.scrollIntoView({ block: 'nearest' })
  }, [sel])
  const ancho = cols.reduce((s, c) => s + c.width, 0)
  return (
    <div ref={ref} className={`min-h-[120px] flex-1 overflow-auto border border-[var(--gw-border)] bg-white ${className}`}>
      <table className="gw-grid" style={{ tableLayout: 'fixed', width: ancho, minWidth: '100%' }}>
        <colgroup>
          {cols.map((c) => (
            <col key={c.key} style={{ width: c.width }} />
          ))}
        </colgroup>
        <thead className="sticky top-0 z-[1]">
          <tr>
            {cols.map((c) => (
              <th
                key={c.key}
                title={c.title ?? 'Pulsa para ordenar por esta columna'}
                onClick={() => setOrden((o) => ({ key: c.key, asc: o?.key === c.key ? !o.asc : true }))}
                className="cursor-default select-none truncate hover:bg-[#e5f1fb]"
                style={{ textAlign: c.align ?? 'left' }}
              >
                {c.label}
                {orden?.key === c.key && <span className="ml-1 text-[10px] text-[#1d3a8a]">{orden.asc ? '▲' : '▼'}</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length === 0 && (
            <tr>
              <td colSpan={cols.length} className="text-[#666]">
                {vacio}
              </td>
            </tr>
          )}
          {filas.map((r) => {
            const i = rows.indexOf(r)
            return (
              <tr
                key={rowKey(r)}
                className={sel === i ? 'gw-selected' : ''}
                style={sel === i ? undefined : rowStyle?.(r)}
                onClick={() => onSel?.(i)}
                onDoubleClick={() => onOpen?.(r)}
              >
                {cols.map((c) => (
                  <td key={c.key} className="truncate" style={{ textAlign: c.align ?? 'left', ...(sel === i ? {} : c.cellStyle?.(r)) }} title={String(c.value(r) ?? '')}>
                    {c.render ? c.render(r) : c.value(r)}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

export const eur = (n: number | null | undefined) =>
  n == null || Number.isNaN(Number(n)) ? '' : new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(Number(n))

export function fechaHoraEs(v: string | null | undefined) {
  if (!v) return ''
  const [d, t] = v.replace(' ', 'T').split('T')
  const [y, m, dd] = d.split('-')
  return `${dd}/${m}/${y}${t ? ` ${t.slice(0, 5)}` : ''}`
}

/** Marca de diferencia en una celda (rojo claro). */
export const DIF: CSSProperties = { background: '#ffd6d6', color: '#8a1c1c', fontWeight: 700 }

/* ---------- Filtro de fechas y estado ---------- */

export interface FiltroWeb {
  periodo: Periodo
  desde: string
  hasta: string
  estado: string
}

export function filtroWebInicial(periodo: Periodo = 'El Mes pasado y actual', estado = ''): FiltroWeb {
  const [desde, hasta] = rangoPeriodo(periodo)
  return { periodo, desde, hasta, estado }
}

export function FiltroFechas({
  filtro,
  onChange,
  conEstado = true,
  children,
}: {
  filtro: FiltroWeb
  onChange: (f: FiltroWeb) => void
  conEstado?: boolean
  children?: ReactNode
}) {
  return (
    <div className="flex flex-none flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
      <span className="gw-label">Periodo:</span>
      <select
        className="gw-input w-[170px]! flex-none"
        value={filtro.periodo}
        onChange={(e) => {
          const p = e.target.value as Periodo
          if (p === 'Personalizado') onChange({ ...filtro, periodo: p })
          else {
            const [desde, hasta] = rangoPeriodo(p)
            onChange({ ...filtro, periodo: p, desde, hasta })
          }
        }}
      >
        {PERIODOS.map((p) => (
          <option key={p}>{p}</option>
        ))}
      </select>
      <span className="gw-label">Desde:</span>
      <input type="date" className="gw-input w-[130px]! flex-none" value={filtro.desde} onChange={(e) => onChange({ ...filtro, periodo: 'Personalizado', desde: e.target.value })} />
      <span className="gw-label">Hasta:</span>
      <input type="date" className="gw-input w-[130px]! flex-none" value={filtro.hasta} onChange={(e) => onChange({ ...filtro, periodo: 'Personalizado', hasta: e.target.value })} />
      {conEstado && (
        <>
          <span className="gw-label">Estado en la web:</span>
          <select className="gw-input w-[160px]! flex-none" value={filtro.estado} onChange={(e) => onChange({ ...filtro, estado: e.target.value })}>
            <option value="">Todos</option>
            {ESTADOS_PEDIDO_WEB.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </>
      )}
      {children}
    </div>
  )
}

/* ---------- Datos del ERP para cruzar ---------- */

async function todasLasFilas<T>(tabla: string, columnas: string, noNulo?: string): Promise<T[]> {
  const out: T[] = []
  for (let desde = 0; ; desde += 1000) {
    let q = supabase.from(tabla).select(columnas)
    if (noNulo) q = q.not(noNulo, 'is', null)
    const { data, error } = await q.range(desde, desde + 999)
    if (error) throw new Error(error.message)
    out.push(...((data ?? []) as T[]))
    if (!data || data.length < 1000) break
  }
  return out
}

export const COLS_ARTICULO_CRUCE =
  'codigo_interno, codigo_venta, codigo_compra_habitual, codigo_barras_principal, descripcion, pvp, igic_pct, impuesto2_pct, web_id_link, web_publicado, web_descripcion, web_categoria, imagen_url, familia_codigo, observaciones, web_observaciones, garantia_meses, precio_oferta, oferta_fecha_desde, oferta_fecha_hasta, sin_control_stock, web_sin_imagen, web_sin_observaciones, activo'

export type ArticuloWeb = ArticuloCruce & {
  precio_oferta: number | null
  oferta_fecha_desde: string | null
  oferta_fecha_hasta: string | null
  sin_control_stock: boolean | null
  web_sin_imagen: boolean | null
  web_sin_observaciones: boolean | null
  activo: boolean | null
}

export async function cargarArticulos() {
  const [arts, barras] = await Promise.all([
    todasLasFilas<ArticuloWeb>('articulo', COLS_ARTICULO_CRUCE),
    todasLasFilas<{ articulo_codigo: string; codigo_barras: string }>('articulo_codigo_barras', 'articulo_codigo, codigo_barras'),
  ])
  return { arts, barras }
}

export const COLS_CLIENTE_CRUCE =
  'codigo, nombre, nif, email, telefono_movil, telefono_fijo, web_id_cliente, vendedor_codigo, forma_pago_codigo, tipo_credito, ruta_codigo, tarifa_nivel_defecto'

export function cargarClientes() {
  return todasLasFilas<ClienteCruce>('cliente', COLS_CLIENTE_CRUCE)
}

export async function cargarFamilias() {
  const fams = await todasLasFilas<FamiliaCruce & { web_publicada: boolean | null }>('familia', 'codigo, descripcion, web_descripcion, web_codigo, web_publicada')
  return fams
}

/** Stock por artículo: un almacén o la suma de todos. */
export async function cargarStock(almacen: string | null) {
  const filas = await todasLasFilas<{ articulo_codigo: string; almacen_codigo: string; cantidad_actual: number | null; cantidad_disponible: number | null; cantidad_reservada: number | null }>(
    'articulo_almacen_stock',
    'articulo_codigo, almacen_codigo, cantidad_actual, cantidad_disponible, cantidad_reservada',
  )
  const m = new Map<string, number>()
  for (const s of filas) {
    if (almacen && s.almacen_codigo !== almacen) continue
    const d = s.cantidad_disponible ?? Number(s.cantidad_actual ?? 0) - Number(s.cantidad_reservada ?? 0)
    m.set(s.articulo_codigo, (m.get(s.articulo_codigo) ?? 0) + Number(d ?? 0))
  }
  return m
}

export interface PedidoErpWeb {
  tienda: string
  numero: number
  webId: number
  fecha: string | null
  cliente: string | null
  nombre: string | null
  total: number | null
  anulado: boolean
  entregado: boolean
  preparado: boolean
  liquidado: number | null
  venta: string | null
  almacen: string | null
}

/** Pedidos del ERP que vienen de la web, por id de pedido web. */
export async function cargarPedidosErpWeb(webIds?: number[]) {
  const cols = 'tienda_terminal_codigo, numero, web_pedido_id, fecha, cliente_codigo, nombre_cliente, total, anulado, entregado, preparado, liquidado, venta_tienda_codigo, venta_numero, almacen_codigo'
  type Fila = {
    tienda_terminal_codigo: string
    numero: number
    web_pedido_id: number
    fecha: string | null
    cliente_codigo: string | null
    nombre_cliente: string | null
    total: number | null
    anulado: boolean
    entregado: boolean
    preparado: boolean
    liquidado: number | null
    venta_tienda_codigo: string | null
    venta_numero: number | null
    almacen_codigo: string | null
  }
  let filas: Fila[] = []
  if (webIds) {
    for (let i = 0; i < webIds.length; i += 200) {
      const { data, error } = await supabase.from('pedido_cliente').select(cols).in('web_pedido_id', webIds.slice(i, i + 200))
      if (error) throw new Error(error.message)
      filas.push(...((data ?? []) as Fila[]))
    }
  } else filas = await todasLasFilas<Fila>('pedido_cliente', cols, 'web_pedido_id')
  const m = new Map<number, PedidoErpWeb>()
  for (const f of filas)
    m.set(Number(f.web_pedido_id), {
      tienda: f.tienda_terminal_codigo,
      numero: f.numero,
      webId: Number(f.web_pedido_id),
      fecha: f.fecha,
      cliente: f.cliente_codigo,
      nombre: f.nombre_cliente,
      total: f.total == null ? null : Number(f.total),
      anulado: f.anulado,
      entregado: f.entregado,
      preparado: f.preparado,
      liquidado: f.liquidado,
      venta: f.venta_numero != null ? `${f.venta_tienda_codigo ?? ''}/${f.venta_numero}` : null,
      almacen: f.almacen_codigo,
    })
  return m
}

export function estadoErp(p: PedidoErpWeb | undefined) {
  if (!p) return 'No importado'
  if (p.anulado) return 'Anulado'
  if (p.entregado || p.venta) return 'Entregado'
  if (p.liquidado === 5) return 'Liquidado'
  if (p.preparado) return 'Preparado'
  return 'Pendiente de servir'
}

export const CONFIG_DEFECTO: ConfigImportacion = {
  cliente_generico_codigo: null,
  tienda_terminal_codigo: '01',
  almacen_codigo: '01',
  articulo_portes_codigo: null,
  articulo_generico_codigo: null,
  estados_importables: ['processing', 'on-hold', 'completed'],
}

export async function cargarConfigWeb(): Promise<ConfigImportacion> {
  const { data } = await supabase.from('web_configuracion').select('*').eq('id', 1).maybeSingle()
  return { ...CONFIG_DEFECTO, ...(data ?? {}) }
}

/** Código del empleado de la sesión (para el campo empleado de los pedidos importados). */
export function useEmpleadoActual() {
  const [codigo, setCodigo] = useState<string | null>(null)
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const uid = data.user?.id
      if (!uid) return
      supabase
        .from('empleado')
        .select('codigo')
        .eq('auth_user_id', uid)
        .maybeSingle()
        .then(({ data: e }) => setCodigo((e?.codigo as string | undefined) ?? null))
    })
  }, [])
  return codigo
}

export const ESTILO_FALTA: CSSProperties = { background: '#ffe3b3' }
