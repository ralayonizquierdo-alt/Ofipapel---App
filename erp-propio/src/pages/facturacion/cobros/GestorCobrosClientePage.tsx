import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Binoculars, Check, ChevronFirst, ChevronLast, CircleDollarSign, FileText, HandCoins, Play, Printer, RotateCw, Settings2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { formatGw, GwDate } from '../../../components/gw'
import { FilasVacias } from '../../../components/gw/GwGridParts'
import { FORMA_PAGO_COLS, claseFormaPago, type ClaseFp, type FormaPago } from '../../compras/pagos/pagosModel'
import { FACTURA_COLS, VENTA_COLS, docDeFactura, docDeVenta, generarVencimientos, hoyISO, r3, todasLasFilas, type DocCobro } from './cobrosModel'

// «Gestor de Pagos de Clientes» de GeminisWin (Facturación → Gestor de Pagos de Clientes): la
// cartera de cobros — facturas de clientes (y ventas sin facturar con importe pendiente) y sus
// cobros/vencimientos (PAGOSCLI → cobro_cliente), con lo cobrado y lo pendiente por vencimiento.
// Sin captura todavía: gemelo del Gestor de Pagos a proveedores, con las tres pestañas del mapa
// funcional (Facturas · Pagos y Facturas sin Pagos · Pagos).

type Vista = 'f' | 'pfsp' | 'p'
type ModoFecha = 'fecha' | 'mov' | 'pago' | 'domic'

const VISTAS: { v: Vista; label: string }[] = [
  { v: 'f', label: 'Facturas' },
  { v: 'pfsp', label: 'Pagos y Facturas sin Pagos' },
  { v: 'p', label: 'Pagos' },
]
const MODOS: { v: ModoFecha; label: string }[] = [
  { v: 'fecha', label: 'Por Fecha Factura, de Pago o Vto.' },
  { v: 'mov', label: 'Por Fecha del Movimiento' },
  { v: 'pago', label: 'Por Fecha de Pago y/o Vto.' },
  { v: 'domic', label: 'Domiciliaciones por Fecha de Pago o Vto.' },
]
const CLASES: { v: ClaseFp; label: string }[] = [
  { v: 'credito', label: 'Crédito' },
  { v: 'efecto', label: 'Efecto' },
  { v: 'banco', label: 'Banco sin Dom.' },
  { v: 'domiciliacion', label: 'Domiciliación' },
  { v: 'efectivo', label: 'Efectivo' },
  { v: 'tarjeta', label: 'Tarjeta' },
  { v: 'cheque', label: 'Cheque' },
]
const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
// Colores de la columna Importe por forma de pago (GeminisWin pinta cada forma de pago de un color).
const PALETA = ['#8ec5d6', '#5a5f4f', '#6b2a24', '#2f8be0', '#4f4f9a', '#c9f0f0', '#3aa64a', '#a020e0', '#5d3a8a', '#b5652a', '#e3c96a', '#2e6b6b']

interface Doc extends DocCobro {
  fechaMov: string | null
  fechaPago: string | null
  fechaVto: string | null
}

interface CobroRow {
  tienda: string
  codigo: number
  fecha: string | null
  cliente: string | null
  nFactura: string | null
  fechaPago: string | null
  fechaVto: string | null
  nDoc: string | null
  cuota: number
  importe: number
  estado: string | null
  fp: string | null
  tipoPago: string | null
  concepto: string | null
  docKey: string | null
}

interface Fila {
  key: string
  nFactura: string
  pagado: boolean
  receptor: string
  nombre: string
  fecha: string | null
  fechaMov: string | null
  fechaPago: string | null
  fechaVto: string | null
  nDoc: string
  totalDoc: number
  importe: number
  aPagar: number
  fp: string | null
  clase: ClaseFp
  doc: Doc | null
  cobro: CobroRow | null
}

const docKeyOf = (clase: string, t: string, n: number) => `${clase}|${t}|${n}`
const fmtFecha = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : ' /  /')
const enRango = (d: string | null, desde: string, hasta: string) => !!d && d >= desde && d <= hasta
const sumaDias = (d: string | null, dias: number | null) => {
  if (!d || !dias) return d
  const f = new Date(`${d}T00:00:00`)
  f.setDate(f.getDate() + dias)
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, '0')}-${String(f.getDate()).padStart(2, '0')}`
}

function colorFp(fp: string | null) {
  if (!fp) return '#ffffff'
  let h = 0
  for (const c of fp) h = (h * 31 + c.charCodeAt(0)) % 997
  return PALETA[h % PALETA.length]
}
function textoSobre(bg: string) {
  const n = parseInt(bg.slice(1), 16)
  const l = 0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)
  return l < 140 ? '#ffffff' : '#000000'
}

/** «factura|01|9» a partir de ?factura=01-9 o ?venta=01-8. */
function docDeUrl(qs: URLSearchParams): string | null {
  for (const clase of ['factura', 'venta'] as const) {
    const v = qs.get(clase)
    const m = v?.match(/^(.+)-(\d+)$/)
    if (m) return docKeyOf(clase, m[1], Number(m[2]))
  }
  return null
}

export function GestorCobrosClientePage() {
  const navigate = useNavigate()
  const [qs, setQs] = useSearchParams()
  const docFiltro = docDeUrl(qs)
  const clienteUrl = qs.get('cliente')
  const [anio, setAnio] = useState(() => new Date().getFullYear())
  const [periodo, setPeriodo] = useState<number | 'anio' | 'filtro'>(() => new Date().getMonth())
  const [filtro, setFiltro] = useState({ desde: hoyISO().slice(0, 8) + '01', hasta: hoyISO() })
  const [verFiltro, setVerFiltro] = useState(false)
  const [vista, setVista] = useState<Vista>(docFiltro ? 'pfsp' : 'f')
  const [modo, setModo] = useState<ModoFecha>('fecha')
  // Filtros de estado y forma de pago: vacío = sin filtrar (todos con ✗, como abre GeminisWin).
  const [estados, setEstados] = useState<Set<'pagado' | 'pendiente'>>(new Set())
  const [clases, setClases] = useState<Set<ClaseFp>>(new Set())
  const [cliente, setCliente] = useState(clienteUrl ?? '')
  const [aplicado, setAplicado] = useState({ estados: new Set<string>(), clases: new Set<ClaseFp>(), cliente: clienteUrl ?? '' })
  const [formas, setFormas] = useState<FormaPago[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [cobros, setCobros] = useState<CobroRow[]>([])
  const [nombres, setNombres] = useState<Map<string, string>>(new Map())
  const [sel, setSel] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [busqueda, setBusqueda] = useState<string | null>(null)

  useEffect(() => {
    supabase
      .from('forma_pago')
      .select(FORMA_PAGO_COLS)
      .order('codigo')
      .then(({ data }) => setFormas((data ?? []) as FormaPago[]))
  }, [])

  const cargar = useCallback(async () => {
    setCargando(true)
    setMensaje(null)
    const d0 = `${anio}-01-01`
    const d1 = `${anio}-12-31`
    const rango = (cols: string[]) => cols.map((c) => `and(${c}.gte.${d0},${c}.lte.${d1})`).join(',')
    const [ft, fc, fn] = docFiltro ? docFiltro.split('|') : []
    const qFac = () => {
      const q = supabase.from('factura').select(`${FACTURA_COLS}, dias_pago, fecha_hora_huso_generacion_registro`)
      if (docFiltro) return ft === 'factura' ? q.eq('tienda_terminal_codigo', fc).eq('numero', Number(fn)) : q.eq('numero', -1)
      return q.or(rango(['fecha_factura', 'fecha_pago'])).order('tienda_terminal_codigo').order('numero')
    }
    const qVta = () => {
      const q = supabase.from('venta').select(VENTA_COLS)
      if (docFiltro) return ft === 'venta' ? q.eq('tienda_terminal_codigo', fc).eq('numero', Number(fn)) : q.eq('numero', -1)
      return q
        .is('factura_numero', null)
        .is('anulada_en', null)
        .eq('aplazada', false)
        .gt('total_pendiente', 0.005)
        .gte('fecha', d0)
        .lte('fecha', d1)
        .order('tienda_terminal_codigo')
        .order('numero')
    }
    const qCob = () => {
      const q = supabase
        .from('cobro_cliente')
        .select('tienda_terminal_codigo, codigo_pago, fecha, cliente_codigo, numero_factura_externo, fecha_pago, fecha_vencimiento, numero_documento_pago, cuota, importe_cobrado, estado_cobro, forma_pago_codigo, tipo_pago, concepto, factura_tienda_codigo, factura_numero, venta_relacionada_tienda_codigo, venta_relacionada_numero')
        .eq('activo', true)
      if (docFiltro)
        return ft === 'factura'
          ? q.eq('factura_tienda_codigo', fc).eq('factura_numero', Number(fn))
          : q.eq('venta_relacionada_tienda_codigo', fc).eq('venta_relacionada_numero', Number(fn))
      return q.or(rango(['fecha', 'fecha_pago', 'fecha_vencimiento'])).order('tienda_terminal_codigo').order('codigo_pago')
    }
    const [fac, vta, cob, anul] = await Promise.all([
      todasLasFilas<Record<string, unknown>>(qFac),
      todasLasFilas<Record<string, unknown>>(qVta),
      todasLasFilas<Record<string, unknown>>(qCob),
      supabase.from('registro_facturacion').select('origen_tienda_codigo, origen_numero').eq('origen_tipo', 'factura').eq('tipo_registro', 'anulacion'),
    ])
    const err = fac.error ?? vta.error ?? cob.error
    if (err) setMensaje(err)
    else if (fac.cortado || vta.cortado || cob.cortado) setMensaje('Hay demasiados movimientos en el año: se muestran los 20.000 primeros de cada tipo.')
    const anuladas = new Set((anul.data ?? []).map((r) => `${r.origen_tienda_codigo}|${r.origen_numero}`))
    const ps: CobroRow[] = cob.filas.map((r) => ({
      tienda: r.tienda_terminal_codigo as string,
      codigo: Number(r.codigo_pago),
      fecha: r.fecha as string | null,
      cliente: r.cliente_codigo as string | null,
      nFactura: r.numero_factura_externo as string | null,
      fechaPago: r.fecha_pago as string | null,
      fechaVto: r.fecha_vencimiento as string | null,
      nDoc: r.numero_documento_pago as string | null,
      cuota: Number(r.cuota ?? 0),
      importe: Number(r.importe_cobrado ?? 0),
      estado: r.estado_cobro as string | null,
      fp: r.forma_pago_codigo as string | null,
      tipoPago: r.tipo_pago as string | null,
      concepto: r.concepto as string | null,
      docKey:
        r.factura_numero != null
          ? docKeyOf('factura', r.factura_tienda_codigo as string, Number(r.factura_numero))
          : r.venta_relacionada_numero != null
            ? docKeyOf('venta', r.venta_relacionada_tienda_codigo as string, Number(r.venta_relacionada_numero))
            : null,
    }))
    // Primer vencimiento pendiente de cada documento (para la columna Fe. VTO. de la factura).
    const vtoPend = new Map<string, string>()
    for (const p of ps)
      if (p.docKey && p.estado === 'pendiente' && p.fechaVto && (!vtoPend.has(p.docKey) || p.fechaVto < (vtoPend.get(p.docKey) as string)))
        vtoPend.set(p.docKey, p.fechaVto)
    const ds: Doc[] = [
      ...fac.filas
        .filter((r) => !anuladas.has(`${r.tienda_terminal_codigo}|${r.numero}`))
        .map((r) => {
          const d = docDeFactura(r)
          return {
            ...d,
            fechaMov: ((r.fecha_hora_huso_generacion_registro as string | null) ?? null)?.slice(0, 10) ?? d.fecha,
            fechaPago: r.fecha_pago as string | null,
            fechaVto: vtoPend.get(docKeyOf('factura', d.tienda, d.numero)) ?? sumaDias(d.fecha, Number(r.dias_pago ?? 0)),
          }
        }),
      ...vta.filas.map((r) => {
        const d = docDeVenta(r)
        return { ...d, fechaMov: d.fecha, fechaPago: r.fecha_pago as string | null, fechaVto: vtoPend.get(docKeyOf('venta', d.tienda, d.numero)) ?? d.fecha }
      }),
    ]
    const codigos = [...new Set([...ds.map((x) => x.cliente_codigo), ...ps.map((p) => p.cliente)].filter(Boolean) as string[])]
    const mapa = new Map<string, string>()
    for (let i = 0; i < codigos.length; i += 200) {
      const { data } = await supabase.from('cliente').select('codigo, nombre').in('codigo', codigos.slice(i, i + 200))
      for (const r of data ?? []) mapa.set(r.codigo as string, r.nombre as string)
    }
    setNombres(mapa)
    setDocs(ds)
    setCobros(ps)
    setCargando(false)
  }, [anio, docFiltro])

  useEffect(() => {
    cargar()
  }, [cargar])

  const fpMap = useMemo(() => new Map(formas.map((f) => [f.codigo, f])), [formas])

  // Todas las filas posibles según la vista (sin filtrar por fecha ni estado).
  const filasVista = useMemo((): Fila[] => {
    const conCobros = new Set(cobros.map((p) => p.docKey).filter(Boolean))
    const docMap = new Map(docs.map((d) => [docKeyOf(d.clase, d.tienda, d.numero), d]))
    const clase = (fp: string | null, tipoPago: string | null, esDoc: boolean): ClaseFp =>
      fp && fpMap.get(fp) ? claseFormaPago(fpMap.get(fp)) : esDoc ? 'credito' : claseFormaPago(undefined, tipoPago)
    const filaDoc = (d: Doc): Fila => {
      const cobrado = d.total !== 0 && Math.abs(d.pendiente) <= 0.005
      return {
        key: `d|${d.clase}|${d.tienda}|${d.numero}`,
        nFactura: d.clase === 'factura' ? d.ref : `${d.tienda}-${d.numero}`,
        pagado: cobrado,
        receptor: d.cliente_codigo ?? '',
        nombre: nombres.get(d.cliente_codigo ?? '') ?? d.nombre ?? '',
        fecha: d.fecha,
        fechaMov: d.fechaMov,
        fechaPago: d.fechaPago,
        fechaVto: d.fechaVto,
        nDoc: '',
        totalDoc: d.total,
        importe: d.pagado,
        aPagar: cobrado ? 0 : d.pendiente,
        fp: d.forma_pago_codigo,
        clase: clase(d.forma_pago_codigo, null, true),
        doc: d,
        cobro: null,
      }
    }
    const filaCobro = (p: CobroRow): Fila => {
      const d = p.docKey ? (docMap.get(p.docKey) ?? null) : null
      const cobrado = p.estado === 'cobrado'
      return {
        key: `p|${p.tienda}|${p.codigo}`,
        nFactura: p.nFactura ?? (d ? (d.clase === 'factura' ? d.ref : `${d.tienda}-${d.numero}`) : (p.concepto ?? '')),
        pagado: cobrado,
        receptor: p.cliente ?? '',
        nombre: nombres.get(p.cliente ?? '') ?? '',
        fecha: d?.fecha ?? p.fecha,
        fechaMov: p.fecha,
        fechaPago: p.fechaPago,
        fechaVto: p.fechaVto,
        nDoc: p.nDoc ?? '',
        totalDoc: d?.total ?? (p.cuota || p.importe),
        importe: cobrado ? p.importe : 0,
        aPagar: cobrado ? 0 : r3(p.cuota - p.importe),
        fp: p.fp,
        clase: clase(p.fp, p.tipoPago, false),
        doc: d,
        cobro: p,
      }
    }
    const sinCobros = (d: Doc) => !conCobros.has(docKeyOf(d.clase, d.tienda, d.numero))
    switch (vista) {
      case 'f':
        return docs.map(filaDoc)
      case 'pfsp':
        return [...cobros.map(filaCobro), ...docs.filter(sinCobros).map(filaDoc)]
      case 'p':
        return cobros.map(filaCobro)
    }
  }, [docs, cobros, nombres, vista, fpMap])

  const [desde, hasta] = useMemo(() => {
    if (periodo === 'anio') return [`${anio}-01-01`, `${anio}-12-31`]
    if (periodo === 'filtro') return [filtro.desde, filtro.hasta]
    const m = String(periodo + 1).padStart(2, '0')
    const ult = new Date(anio, periodo + 1, 0).getDate()
    return [`${anio}-${m}-01`, `${anio}-${m}-${ult}`]
  }, [anio, periodo, filtro])

  const filas = useMemo(() => {
    const r = filasVista.filter((f) => {
      // Abierto desde una factura (?factura=…): se ven todos sus movimientos, sin mirar fechas.
      if (!docFiltro) {
        let ok: boolean
        if (modo === 'fecha') ok = enRango(f.fecha, desde, hasta) || enRango(f.fechaPago, desde, hasta) || enRango(f.fechaVto, desde, hasta)
        else if (modo === 'mov') ok = enRango(f.fechaMov, desde, hasta)
        else ok = enRango(f.fechaPago, desde, hasta) || enRango(f.fechaVto, desde, hasta)
        if (!ok) return false
      }
      if (modo === 'domic' && f.clase !== 'domiciliacion') return false
      if (aplicado.cliente && f.receptor !== aplicado.cliente) return false
      if (aplicado.estados.size && !aplicado.estados.has(f.pagado ? 'pagado' : 'pendiente')) return false
      if (aplicado.clases.size && !aplicado.clases.has(f.clase)) return false
      if (busqueda && !`${f.nFactura} ${f.receptor} ${f.nombre} ${f.nDoc}`.toLowerCase().includes(busqueda.toLowerCase())) return false
      return true
    })
    return r.sort((a, b) => (a.fechaVto ?? a.fecha ?? '').localeCompare(b.fechaVto ?? b.fecha ?? '') || a.nFactura.localeCompare(b.nFactura))
  }, [filasVista, modo, desde, hasta, aplicado, busqueda, docFiltro])

  const selIdx = filas.findIndex((f) => f.key === sel)
  const actual = selIdx >= 0 ? filas[selIdx] : null

  // Rejillas de la derecha: por día y forma de pago, y por día. Cobrado por fecha de cobro, a cobrar por vencimiento.
  const { porDiaFp, porDia, diasConMov } = useMemo(() => {
    const dia = (d: string | null) => (d ? (typeof periodo === 'number' && !docFiltro ? String(Number(d.slice(8, 10))) : `${d.slice(8, 10)}/${d.slice(5, 7)}`) : '')
    const a = new Map<string, { dia: string; fp: string; pagado: number; aPagar: number; orden: string }>()
    const b = new Map<string, { dia: string; pagado: number; aPagar: number; orden: string }>()
    const add = (fecha: string | null, fp: string, pagado: number, aPagar: number) => {
      if (!fecha || (!docFiltro && !enRango(fecha, desde, hasta))) return
      const k = dia(fecha)
      const ka = `${fecha}|${fp}`
      const x = a.get(ka) ?? { dia: k, fp, pagado: 0, aPagar: 0, orden: ka }
      x.pagado += pagado
      x.aPagar += aPagar
      a.set(ka, x)
      const y = b.get(fecha) ?? { dia: k, pagado: 0, aPagar: 0, orden: fecha }
      y.pagado += pagado
      y.aPagar += aPagar
      b.set(fecha, y)
    }
    for (const f of filas) {
      if (f.importe) add(f.fechaPago ?? f.fechaMov ?? f.fecha, f.fp ?? '', f.importe, 0)
      if (f.aPagar) add(f.fechaVto ?? f.fecha, f.fp ?? '', 0, f.aPagar)
    }
    const porDiaFp = [...a.values()].sort((x, y) => x.orden.localeCompare(y.orden))
    const porDia = [...b.values()].sort((x, y) => x.orden.localeCompare(y.orden))
    return { porDiaFp, porDia, diasConMov: porDia.length }
  }, [filas, desde, hasta, periodo, docFiltro])

  const totalDocs = filas.reduce((s, f) => s + f.totalDoc, 0)
  const totPagado = porDia.reduce((s, x) => s + x.pagado, 0)
  const totAPagar = porDia.reduce((s, x) => s + x.aPagar, 0)

  function irA(i: number) {
    const f = filas[Math.max(0, Math.min(filas.length - 1, i))]
    if (f) setSel(f.key)
  }

  function abrirFactura() {
    const d = actual?.doc
    if (!d) return setMensaje('La fila seleccionada no tiene factura ni venta.')
    navigate(d.clase === 'factura' ? `/facturacion/${encodeURIComponent(d.tienda)}/${d.numero}` : `/ventas/${encodeURIComponent(d.tienda)}/${d.numero}`)
  }

  function abrirCobro() {
    if (actual?.cobro) navigate(`/cobros-clientes/${encodeURIComponent(actual.cobro.tienda)}/${actual.cobro.codigo}`)
  }

  /** Cobrar el documento (o el vencimiento) de la fila: abre la ficha de cobro en alta. */
  function cobrarFila() {
    if (!actual) return
    const d = actual.doc
    if (!d) return setMensaje('El cobro seleccionado no está ligado a ninguna factura ni venta.')
    const venc = actual.cobro && actual.cobro.estado === 'pendiente' ? `&vencimiento=${encodeURIComponent(actual.cobro.tienda)}-${actual.cobro.codigo}` : ''
    navigate(`/cobros-clientes/nuevo?${d.clase}=${encodeURIComponent(d.tienda)}-${d.numero}${venc}`)
  }

  async function generar(lista: Doc[]) {
    setMensaje(null)
    let n = 0
    try {
      for (const d of lista) {
        if (d.clase !== 'factura' || Math.abs(d.pendiente) <= 0.005) continue
        n += await generarVencimientos(d.tienda, d.numero)
      }
      await cargar()
      setMensaje(n ? `Generados ${n} vencimiento(s) pendiente(s).` : 'No había vencimientos que generar (ya generados o sin importe pendiente).')
    } catch (e) {
      setMensaje((e as Error).message)
    }
  }

  function aplicar() {
    setAplicado({ estados: new Set(estados), clases: new Set(clases), cliente: cliente.trim() })
  }

  function quitarDoc() {
    const n = new URLSearchParams(qs)
    n.delete('factura')
    n.delete('venta')
    setQs(n, { replace: true })
  }

  const pendienteActual = actual?.doc && Math.abs(actual.doc.pendiente) > 0.005
  const pieSel = actual
    ? actual.doc
      ? `${actual.doc.clase === 'factura' ? `Factura ${actual.doc.tienda}-${actual.doc.numero} (${actual.doc.ref})` : `Venta ${actual.doc.tienda}-${actual.doc.numero}`}. F.P.: ${actual.doc.forma_pago_codigo ?? ''} Total: ${formatGw(actual.doc.total, 3)} Cob.: ${formatGw(actual.doc.pagado, 3)} Pend.: ${formatGw(actual.doc.pendiente, 3)}. F. Fact.: ${fmtFecha(actual.doc.fecha)}`
      : `Cobro ${actual.cobro?.tienda}-${actual.cobro?.codigo}. F.P.: ${actual.fp ?? ''} Cuota: ${formatGw(actual.cobro?.cuota ?? 0, 3)} Cob.: ${formatGw(actual.importe, 3)}`
    : ''

  return (
    <div className="flex h-full min-h-0 flex-col text-[15px]">
      {/* Pestañas de vista + año */}
      <div className="flex items-end gap-2">
        <Tabs items={VISTAS} value={vista} onChange={setVista} className="flex-1" />
        <div className="mb-[2px] flex h-[32px] w-[124px] items-stretch border border-[var(--gw-border)] bg-white">
          <span className="flex flex-1 items-center justify-end pr-1.5 text-[22px] font-bold">{anio}</span>
          <span className="flex w-[14px] flex-col border-l border-[var(--gw-border-light)] text-[8px]">
            <button type="button" className="flex-1 hover:bg-[#e5f1fb]" title="Año siguiente" onClick={() => setAnio(anio + 1)}>
              ▲
            </button>
            <button type="button" className="flex-1 hover:bg-[#e5f1fb]" title="Año anterior" onClick={() => setAnio(anio - 1)}>
              ▼
            </button>
          </span>
        </div>
      </div>
      <Tabs items={MODOS} value={modo} onChange={setModo} />

      {/* Filtros */}
      <div className="flex items-stretch gap-2 border-x border-b border-[var(--gw-border)] px-1.5 pb-1.5 pt-0.5">
        <fieldset className="border border-[var(--gw-border-light)] px-1 pb-1">
          <legend className="px-1 text-[16px]">Estado Documento</legend>
          <div className="flex">
            {(['pagado', 'pendiente'] as const).map((e) => (
              <Toggle key={e} on={estados.has(e)} onClick={() => setEstados(alternar(estados, e))} className="w-[100px]">
                {e === 'pagado' ? 'Pagado' : 'Pendiente'}
              </Toggle>
            ))}
          </div>
        </fieldset>
        <fieldset className="min-w-0 flex-1 border border-[var(--gw-border-light)] px-1 pb-1">
          <legend className="px-1 text-[16px]">Tipo de la forma de pago</legend>
          <div className="flex">
            {CLASES.map((c) => (
              <Toggle key={c.v} on={clases.has(c.v)} onClick={() => setClases(alternar(clases, c.v))} className="min-w-0 flex-1">
                {c.label}
              </Toggle>
            ))}
          </div>
        </fieldset>
        <fieldset className="w-[150px] shrink-0 border border-[var(--gw-border-light)] px-1 pb-1">
          <legend className="px-1 text-[16px]">Cliente</legend>
          {docFiltro ? (
            <button
              type="button"
              onClick={quitarDoc}
              title="Quitar el filtro de documento"
              className="flex h-[28px] w-full items-center justify-between gap-1 border border-[var(--gw-border)] bg-[#fff6c8] px-1 text-[14px] hover:bg-[#e5f1fb]"
            >
              <span className="truncate">{docFiltro.split('|').slice(1).join('-')}</span>
              <X size={13} strokeWidth={3} className="shrink-0 text-[#c42b1c]" />
            </button>
          ) : (
            <input
              className="gw-input h-[28px] w-full !text-[15px]"
              value={cliente}
              placeholder="Todos"
              title="Código de cliente (vacío = todos). Pulsa Aplicar."
              onChange={(e) => setCliente(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && aplicar()}
            />
          )}
        </fieldset>
        <button
          type="button"
          onClick={aplicar}
          className="my-1 flex w-[100px] shrink-0 items-center justify-center gap-1 border border-[var(--gw-border)] bg-[var(--gw-face)] text-[16px] hover:bg-[#e5f1fb]"
        >
          <Check size={16} strokeWidth={3} className="text-[#127a12]" /> Aplicar
        </button>
      </div>

      {/* Rejilla principal + totales por día */}
      <div className="mt-1 flex min-h-0 flex-1 gap-1">
        <div className="min-h-0 min-w-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid w-full table-fixed text-[14px]">
            <colgroup>
              <col className="w-[10%]" />
              <col className="w-[5%]" />
              <col className="w-[7%]" />
              <col className="w-[13%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[8%]" />
              <col className="w-[11%]" />
              <col className="w-[10%]" />
              <col className="w-[10%]" />
            </colgroup>
            <thead>
              <tr>
                <th>Nº Factura</th>
                <th>Pag.</th>
                <th>Cliente</th>
                <th>Nombre Cliente</th>
                <th>Fecha</th>
                <th>Fe. Pago</th>
                <th>Fe. VTO.</th>
                <th>Nº Doc. Pago</th>
                <th>Total Doc.</th>
                <th>Importe</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const vencido = !f.pagado && !!f.fechaVto && f.fechaVto < hoyISO()
                const bgPag = f.pagado ? '#9be3c4' : vencido ? '#e8336a' : '#d97a3a'
                const bgImp = f.pagado && f.importe ? '#22e04a' : colorFp(f.fp)
                return (
                  <tr
                    key={f.key}
                    className={sel === f.key ? 'gw-selected' : ''}
                    onClick={() => setSel(f.key)}
                    onDoubleClick={() => {
                      setSel(f.key)
                      if (f.cobro) navigate(`/cobros-clientes/${encodeURIComponent(f.cobro.tienda)}/${f.cobro.codigo}`)
                    }}
                    title={f.cobro ? `Cobro ${f.cobro.tienda}-${f.cobro.codigo}` : f.doc ? `${f.doc.clase === 'factura' ? 'Factura' : 'Venta'} ${f.doc.tienda}-${f.doc.numero}` : ''}
                  >
                    <td className="truncate">{f.nFactura}</td>
                    <td className="text-center" style={{ background: bgPag }}>
                      <input type="checkbox" readOnly checked={f.pagado} className="pointer-events-none h-[12px] w-[12px] align-middle" />
                    </td>
                    <td className="truncate">{f.receptor}</td>
                    <td className="truncate">{f.nombre}</td>
                    <td>{fmtFecha(f.fecha)}</td>
                    <td>{fmtFecha(f.fechaPago)}</td>
                    <td>{fmtFecha(f.fechaVto)}</td>
                    <td className="truncate">{f.nDoc}</td>
                    <td className="text-right">{formatGw(f.totalDoc, 3)}</td>
                    <td className="text-right" style={{ background: bgImp, color: textoSobre(bgImp) }}>
                      {formatGw(f.importe, 3)}
                    </td>
                  </tr>
                )
              })}
              <FilasVacias cols={10} ocupadas={filas.length} total={16} />
            </tbody>
          </table>
        </div>
        <div className="flex w-[372px] shrink-0 flex-col gap-1">
          <div className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid w-full table-fixed text-[14px]">
              <colgroup>
                <col className="w-[52px]" />
                <col className="w-[44px]" />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Fp</th>
                  <th>Cobrado</th>
                  <th>A Cobrar</th>
                </tr>
              </thead>
              <tbody>
                {porDiaFp.map((x) => (
                  <tr key={x.orden}>
                    <td className="text-right">{x.dia}</td>
                    <td className="truncate">{x.fp}</td>
                    <Celda v={x.pagado} bg="#5aa832" />
                    <Celda v={x.aPagar} bg="#5aa832" />
                  </tr>
                ))}
                <FilasVacias cols={4} ocupadas={porDiaFp.length} total={7} />
              </tbody>
            </table>
          </div>
          <div className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid w-full table-fixed text-[14px]">
              <colgroup>
                <col className="w-[96px]" />
                <col />
                <col />
              </colgroup>
              <thead>
                <tr>
                  <th>Día</th>
                  <th>Cobrado</th>
                  <th>A Cobrar</th>
                </tr>
              </thead>
              <tbody>
                {porDia.map((x) => (
                  <tr key={x.orden}>
                    <td className="text-right">{x.dia}</td>
                    <Celda v={x.pagado} bg="#3bd16f" />
                    <Celda v={x.aPagar} bg="#e3c96a" />
                  </tr>
                ))}
                <FilasVacias cols={3} ocupadas={porDia.length} total={7} />
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pie: datos de la fila seleccionada y totales */}
      <div className="flex h-[24px] items-center gap-2 text-[16px] text-[#1a4fd0]">
        <span className={`min-w-0 flex-1 truncate ${mensaje ? 'text-[#c42b1c]' : ''}`} title={mensaje ?? pieSel}>
          {cargando ? 'Cargando…' : (mensaje ?? pieSel)}
        </span>
        <span className="w-[130px] text-right font-bold text-black">{formatGw(totalDocs, 3)}</span>
        <span className="w-[52px]" />
        <span className="w-[372px] shrink-0 grid grid-cols-[96px_1fr_1fr] font-bold">
          <span className="font-normal text-[#1a4fd0]">Días: {diasConMov}</span>
          <span className="text-right text-black">{formatGw(totPagado, 3)}</span>
          <span className="text-right text-black">{formatGw(totAPagar, 3)}</span>
        </span>
      </div>

      {/* Botonera */}
      <div className="flex h-[38px] items-stretch gap-[2px] border-t border-[var(--gw-border)] pt-[2px]">
        <Ico title="Primero" onClick={() => irA(0)}>
          <ChevronFirst size={15} strokeWidth={2.5} />
        </Ico>
        <Ico title="Anterior" onClick={() => irA(selIdx - 1)}>
          <Play size={10} className="rotate-180" fill="currentColor" />
        </Ico>
        <Ico title="Siguiente" onClick={() => irA(selIdx + 1)}>
          <Play size={10} fill="currentColor" />
        </Ico>
        <Ico title="Último" onClick={() => irA(filas.length - 1)}>
          <ChevronLast size={15} strokeWidth={2.5} />
        </Ico>
        <Ico
          title="Buscar"
          onClick={() => {
            const q = prompt('Buscar por nº de factura, cliente o nº de documento (vacío = quitar búsqueda):', busqueda ?? '')
            if (q !== null) setBusqueda(q.trim() || null)
          }}
        >
          <Binoculars size={15} className={busqueda ? 'text-[#c42b1c]' : ''} />
        </Ico>
        <Ico title="Imprimir" onClick={() => window.print()}>
          <Printer size={15} />
        </Ico>
        <Ico title="Refrescar" onClick={() => cargar()}>
          <RotateCw size={15} className="text-[#127a12]" />
        </Ico>
        <BtnTxt onClick={abrirFactura} disabled={!actual?.doc} w="w-[110px]">
          <FileText size={15} className="text-[#127a12]" /> Factura
        </BtnTxt>
        <BtnTxt onClick={abrirCobro} disabled={!actual?.cobro} w="w-[96px]" title="Abrir la ficha del cobro">
          <CircleDollarSign size={15} className="text-[#8a6d1d]" /> Pago
        </BtnTxt>
        <BtnTxt onClick={cobrarFila} disabled={!pendienteActual || !!(actual?.cobro && actual.cobro.estado !== 'pendiente')} w="w-[104px]" title="Cobrar la factura o el vencimiento seleccionado (total o parcial)">
          <HandCoins size={15} className="text-[#127a12]" /> <span><u>C</u>obrar</span>
        </BtnTxt>
        <BtnTxt
          onClick={() => actual?.doc && generar([actual.doc])}
          disabled={actual?.doc?.clase !== 'factura' || !pendienteActual}
          w="w-[180px]"
          title="Generar los vencimientos pendientes de la factura según la forma de pago"
        >
          <Settings2 size={15} /> <span><u>G</u>. Pagos Factura</span>
        </BtnTxt>
        <span className="flex w-[80px] shrink-0 flex-col items-center justify-center text-[14px] leading-[15px] text-[#1a4fd0]">
          <span>Nº Mov.:</span>
          <span>{filas.length}</span>
        </span>
        <BtnTxt
          onClick={() => {
            const lista = filas.filter((f) => f.doc && !f.cobro && f.doc.clase === 'factura' && !f.pagado).map((f) => f.doc as Doc)
            if (lista.length && confirm(`¿Generar los vencimientos pendientes de ${lista.length} factura(s) de la vista?`)) generar(lista)
          }}
          w="min-w-0 flex-1"
        >
          <Settings2 size={15} /> <span className="truncate">Gen. <u>T</u>odos los Pagos</span>
        </BtnTxt>
      </div>

      {/* Meses / Año / Filtro */}
      <div className="relative flex h-[34px] items-stretch gap-[2px] pt-[2px]">
        {MESES.map((m, i) => (
          <PerTab key={m} on={periodo === i} onClick={() => setPeriodo(i)}>
            {m}
          </PerTab>
        ))}
        <PerTab on={periodo === 'anio'} onClick={() => setPeriodo('anio')}>
          Año {anio}
        </PerTab>
        <PerTab
          on={periodo === 'filtro'}
          onClick={() => {
            setPeriodo('filtro')
            setVerFiltro((v) => !v)
          }}
        >
          Filtro
        </PerTab>
        {verFiltro && periodo === 'filtro' && (
          <div className="absolute bottom-[36px] right-0 z-10 flex items-center gap-2 border border-[var(--gw-border)] bg-[var(--gw-face)] p-2 shadow">
            <span className="gw-label">Desde</span>
            <GwDate value={filtro.desde} onChange={(v) => setFiltro({ ...filtro, desde: v ?? '' })} />
            <span className="gw-label">Hasta</span>
            <GwDate value={filtro.hasta} onChange={(v) => setFiltro({ ...filtro, hasta: v ?? '' })} />
            <button type="button" className="gw-btn" onClick={() => setVerFiltro(false)}>
              Aceptar
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function alternar<T>(s: Set<T>, v: T) {
  const n = new Set(s)
  if (n.has(v)) n.delete(v)
  else n.add(v)
  return n
}

function Tabs<T extends string>({ items, value, onChange, className = '' }: { items: { v: T; label: string }[]; value: T; onChange: (v: T) => void; className?: string }) {
  return (
    <div className={`flex items-end border-b border-[var(--gw-border)] ${className}`}>
      {items.map((it) => (
        <button
          key={it.v}
          type="button"
          onClick={() => onChange(it.v)}
          className={`-mb-px whitespace-nowrap border border-[var(--gw-border)] px-2.5 text-[16px] ${
            value === it.v ? 'h-[34px] border-b-white bg-white font-bold' : 'h-[30px] bg-[var(--gw-face)] hover:bg-[#e5f1fb]'
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ on, onClick, className = '', children }: { on: boolean; onClick: () => void; className?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={on ? 'Incluido en el filtro (pulsa Aplicar)' : 'Sin filtrar'}
      className={`flex h-[28px] items-center justify-center gap-0.5 truncate border border-[var(--gw-border)] bg-[var(--gw-face)] px-0.5 text-[15px] hover:bg-[#e5f1fb] ${className}`}
    >
      {on ? <Check size={14} strokeWidth={3} className="shrink-0 text-[#127a12]" /> : <X size={14} strokeWidth={3} className="shrink-0 text-[#c42b1c]" />}
      <span className="truncate">{children}</span>
    </button>
  )
}

function Celda({ v, bg }: { v: number; bg: string }) {
  const b = v ? bg : '#ffffff'
  return (
    <td className="text-right" style={{ background: b, color: textoSobre(b) }}>
      {formatGw(v, 3)}
    </td>
  )
}

function Ico({ title, onClick, children }: { title: string; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex w-[64px] shrink-0 items-center justify-center border border-[var(--gw-border)] text-[#1d3a8a] hover:bg-[#e5f1fb]"
    >
      {children}
    </button>
  )
}

function BtnTxt({ onClick, disabled, w, title, children }: { onClick: () => void; disabled?: boolean; w: string; title?: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`flex ${w} shrink-0 items-center justify-center gap-1.5 whitespace-nowrap border border-[var(--gw-border)] text-[16px] hover:bg-[#e5f1fb] disabled:text-[#9a9a9a] disabled:hover:bg-transparent`}
    >
      {children}
    </button>
  )
}

function PerTab({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 whitespace-nowrap border border-[var(--gw-border)] px-1 text-[16px] ${on ? 'border-t-white bg-white font-bold text-[#1a4fd0]' : 'bg-[var(--gw-face)] hover:bg-[#e5f1fb]'}`}
    >
      {children}
    </button>
  )
}
