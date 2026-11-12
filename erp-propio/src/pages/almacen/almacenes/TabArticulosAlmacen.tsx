import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { todasLasFilas } from '../../../lib/todasLasFilas'
import { GwDate, GwSelect, formatGw } from '../../../components/gw'
import { FilasVacias } from '../../../components/gw/GwGridParts'
import { GwAnterior, GwBuscar, GwPrimero, GwSiguiente, GwUltimo } from '../../../components/gw/GwIconos'

// Pestaña «Artículos» de la ficha de Almacenes, calcada de la captura de GeminisWin (12/11/2026):
// «Filtrar Según Fecha» (qué fecha + cómo filtrar + dos fechas), «Artic. Genéricos» (Si / No),
// «Artic. Anulados» (No / Si), «Aplicar» y la rejilla Código · Descripción · Stock · Stock Inic. ·
// Fec. Stock Inic. con su barra de navegación. Como en GeminisWin, la rejilla está vacía hasta
// que se pulsa «Aplicar». Los datos salen de `articulo_almacen_stock` (el stock de cada artículo
// en este almacén) y de `articulo`. Solo consulta: aquí no se cambia ningún stock.

interface Fila {
  articulo_codigo: string
  cantidad_actual: number | null
  cantidad_inicial: number | null
  fecha_stock_inicial: string | null
  articulo: { descripcion: string | null } | null
}

// SUPUESTO: la captura solo deja ver «Fecha Última Compra»; el resto son las fechas que tiene
// el artículo y que cuadran con el rótulo.
const CAMPOS_FECHA = [
  { value: 'articulo.ultima_compra_fecha', label: 'Fecha Última Compra' },
  { value: 'articulo.ultima_venta_fecha', label: 'Fecha Última Venta' },
  { value: 'articulo.fecha_alta', label: 'Fecha de Alta' },
  { value: 'articulo.fecha_baja', label: 'Fecha de Baja' },
  { value: 'fecha_stock_inicial', label: 'Fecha Stock Inicial' },
]

// SUPUESTO: la captura solo deja ver «No Filtrar»; son los mismos modos que en el resto de
// pestañas con «Filtrar Según Fecha» del ERP (p. ej. Compras del transportista).
type Operador = 'no' | 'igual' | 'desde' | 'hasta' | 'entre'
const OPERADORES: { value: Operador; label: string }[] = [
  { value: 'no', label: 'No Filtrar' },
  { value: 'igual', label: 'Igual a' },
  { value: 'desde', label: 'Desde' },
  { value: 'hasta', label: 'Hasta' },
  { value: 'entre', label: 'Entre' },
]

interface Filtro {
  campo: string
  operador: Operador
  fecha1: string
  fecha2: string
  genericos: boolean
  anulados: boolean
}

const FILTRO_INICIAL: Filtro = { campo: CAMPOS_FECHA[0].value, operador: 'no', fecha1: '', fecha2: '', genericos: false, anulados: false }

const fechaHoraEs = (v: string | null) => {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

/** Pareja de botones de GeminisWin: el elegido lleva la marca verde y el otro el aspa roja. */
function ParSiNo({ orden, valor, onChange, que }: { orden: boolean[]; valor: boolean; onChange: (v: boolean) => void; que: string }) {
  return (
    <div className="flex flex-col gap-1">
      {orden.map((v) => (
        <button
          key={String(v)}
          type="button"
          className={`gw-btn h-[30px]! w-full text-[15px] ${v === valor ? 'bg-[#f6f6f6]!' : ''}`}
          aria-pressed={v === valor}
          title={`${v ? 'Sí' : 'No'}: ${v ? 'salen también' : 'no salen'} los artículos ${que}`}
          onClick={() => onChange(v)}
        >
          {v === valor ? <Check size={14} strokeWidth={3} className="text-[#127a12]" /> : <X size={14} strokeWidth={3} className="text-[#c42b1c]" />}
          {v ? 'Si' : 'No'}
        </button>
      ))}
    </div>
  )
}

export function TabArticulosAlmacen({ almacen }: { almacen: string }) {
  const navigate = useNavigate()
  const [borrador, setBorrador] = useState<Filtro>(FILTRO_INICIAL)
  // null = todavía no se ha pulsado «Aplicar»: rejilla vacía, como al abrir la pestaña en GeminisWin.
  const [filtro, setFiltro] = useState<Filtro | null>(null)
  const [rows, setRows] = useState<Fila[]>([])
  const [sel, setSel] = useState(-1)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Al cambiar de almacén la rejilla se vacía: hay que volver a pulsar «Aplicar».
  useEffect(() => {
    setFiltro(null)
    setRows([])
    setSel(-1)
    setError(null)
  }, [almacen])

  useEffect(() => {
    if (!almacen || !filtro) return
    let vivo = true
    const f = filtro
    setCargando(true)
    setError(null)
    const consulta = () => {
      let q = supabase
        .from('articulo_almacen_stock')
        .select('articulo_codigo, cantidad_actual, cantidad_inicial, fecha_stock_inicial, articulo!inner(descripcion)')
        .eq('almacen_codigo', almacen)
        .order('articulo_codigo')
      if (!f.genericos) q = q.eq('articulo.generico', false)
      if (!f.anulados) q = q.eq('articulo.activo', true)
      const c = f.campo
      // «Fecha Stock Inicial» lleva hora: el día entero llega hasta las 23:59:59.
      const fin = (d: string) => (c === 'fecha_stock_inicial' ? `${d}T23:59:59.999` : d)
      if (f.operador === 'igual' && f.fecha1) q = q.gte(c, f.fecha1).lte(c, fin(f.fecha1))
      if (f.operador === 'desde' && f.fecha1) q = q.gte(c, f.fecha1)
      if (f.operador === 'hasta' && f.fecha1) q = q.lte(c, fin(f.fecha1))
      if (f.operador === 'entre') {
        if (f.fecha1) q = q.gte(c, f.fecha1)
        if (f.fecha2) q = q.lte(c, fin(f.fecha2))
      }
      return q
    }
    todasLasFilas<Fila>(consulta).then((r) => {
      if (!vivo) return
      if (r.error) setError(`No se han podido leer los artículos del almacén (${r.error}). Vuelve a pulsar Aplicar.`)
      setRows(r.data)
      setSel(r.data.length ? 0 : -1)
      setCargando(false)
    })
    return () => {
      vivo = false
    }
  }, [almacen, filtro])

  const vacio = rows.length === 0
  const ir = (n: number) => {
    if (vacio) return
    const i = Math.max(0, Math.min(rows.length - 1, n))
    setSel(i)
    document.getElementById(`alm-art-${i}`)?.scrollIntoView({ block: 'nearest' })
  }
  const abrir = (r?: Fila) => r && navigate(`/articulos/${encodeURIComponent(r.articulo_codigo)}`)
  const b =
    'flex h-[34px] w-[100px] items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-transparent'
  const sinFecha = borrador.operador === 'no'

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-stretch gap-2">
        <fieldset className="gw-group grid min-w-0 flex-1 grid-cols-2 gap-x-2 gap-y-1.5">
          <legend className="text-[15px]">Filtrar Según Fecha</legend>
          <GwSelect value={borrador.campo} title="Qué fecha se mira" onChange={(e) => setBorrador({ ...borrador, campo: e.target.value })}>
            {CAMPOS_FECHA.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </GwSelect>
          <GwSelect value={borrador.operador} title="Cómo se filtra" onChange={(e) => setBorrador({ ...borrador, operador: e.target.value as Operador })}>
            {OPERADORES.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </GwSelect>
          <GwDate disabled={sinFecha} value={borrador.fecha1} title="Fecha (o primera fecha si es «Entre»)" onChange={(v) => setBorrador({ ...borrador, fecha1: v ?? '' })} />
          <GwDate disabled={borrador.operador !== 'entre'} value={borrador.fecha2} title="Segunda fecha (solo con «Entre»)" onChange={(v) => setBorrador({ ...borrador, fecha2: v ?? '' })} />
        </fieldset>
        <fieldset className="gw-group w-[236px] flex-none">
          <legend className="text-[15px]">Artic. Genéricos</legend>
          <ParSiNo orden={[true, false]} valor={borrador.genericos} que="genéricos" onChange={(v) => setBorrador({ ...borrador, genericos: v })} />
        </fieldset>
        <fieldset className="gw-group w-[210px] flex-none">
          <legend className="text-[15px]">Artic. Anulados</legend>
          <ParSiNo orden={[false, true]} valor={borrador.anulados} que="anulados (dados de baja)" onChange={(v) => setBorrador({ ...borrador, anulados: v })} />
        </fieldset>
        <div className="flex w-[150px] flex-none flex-col">
          <button
            type="button"
            className="gw-btn h-[46px]! w-full text-[16px]"
            title="Aplicar el filtro y rellenar la rejilla"
            disabled={!almacen || cargando}
            onClick={() => setFiltro({ ...borrador })}
          >
            <X size={14} strokeWidth={3} className="text-[#c42b1c]" />
            Aplicar
          </button>
        </div>
      </div>

      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[13px] text-[#a4262c]">{error}</div>}
      <div className="h-[190px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: '19%' }}>Código</th>
              <th>Descripción</th>
              <th style={{ width: '12%' }} className="text-center!">
                Stock
              </th>
              <th style={{ width: '11%' }} className="text-center!">
                Stock Inic.
              </th>
              <th style={{ width: '14%' }}>Fec. Stock Inic.</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.articulo_codigo} id={`alm-art-${i}`} className={i === sel ? 'gw-selected' : ''} onClick={() => setSel(i)} onDoubleClick={() => abrir(r)}>
                <td>{r.articulo_codigo}</td>
                <td>{r.articulo?.descripcion ?? ''}</td>
                <td className="text-right">{formatGw(r.cantidad_actual ?? 0, 3)}</td>
                <td className="text-right">{formatGw(r.cantidad_inicial ?? 0, 3)}</td>
                <td>{fechaHoraEs(r.fecha_stock_inicial)}</td>
              </tr>
            ))}
            <FilasVacias cols={5} ocupadas={rows.length} total={6} />
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-4">
        <div className="flex w-fit border border-[var(--gw-border)] bg-[var(--gw-face)]">
          <button type="button" className={b} title="Primero" disabled={vacio} onClick={() => ir(0)}>
            <GwPrimero />
          </button>
          <button type="button" className={b} title="Anterior" disabled={vacio} onClick={() => ir(sel - 1)}>
            <GwAnterior />
          </button>
          <button type="button" className={b} title="Siguiente" disabled={vacio} onClick={() => ir(sel + 1)}>
            <GwSiguiente />
          </button>
          <button type="button" className={b} title="Último" disabled={vacio} onClick={() => ir(rows.length - 1)}>
            <GwUltimo />
          </button>
          <button
            type="button"
            className={`${b} border-r-0`}
            title="Buscar un artículo de la rejilla por código o por descripción"
            disabled={vacio}
            onClick={() => {
              const q = window.prompt('Buscar artículo (código o parte de la descripción):')?.trim().toUpperCase()
              if (!q) return
              let i = rows.findIndex((r) => r.articulo_codigo.toUpperCase() === q)
              if (i < 0) i = rows.findIndex((r) => r.articulo_codigo.toUpperCase().startsWith(q) || (r.articulo?.descripcion ?? '').toUpperCase().includes(q))
              if (i >= 0) ir(i)
              else alert(`No hay ningún artículo en la rejilla que coincida con «${q}». Prueba con otro texto o cambia el filtro y pulsa Aplicar.`)
            }}
          >
            <GwBuscar />
          </button>
        </div>
        <span className="text-[13px] text-[#1a4fd0]">
          {cargando ? 'Cargando…' : filtro ? `Nº Artículos: ${rows.length.toLocaleString('es-ES')}` : almacen ? 'Pulsa Aplicar para ver los artículos de este almacén.' : ''}
        </span>
      </div>
    </div>
  )
}
