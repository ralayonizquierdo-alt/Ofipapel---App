import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Binoculars, Check, ChevronFirst, ChevronLast, CircleDollarSign, FileText, Play, Printer, RotateCw, Settings2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { formatGw } from '../../../components/gw'
import { FilasVacias } from '../../../components/gw/GwGridParts'
import { FORMA_PAGO_COLS, cargarDoc, claseFormaPago, generarPagosDoc, hoyISO, type ClaseFp, type FormaPago } from './pagosModel'

// «Gestor de Pagos» de GeminisWin (Compras → Gestor de pagos): cartera de pagos a proveedores —
// facturas/pedidos de proveedor y sus pagos (PAGOSGST), con vencimientos, pagado y pendiente.

type Vista = 'fp' | 'fpsf' | 'f' | 'pfsp' | 'p'
type ModoFecha = 'fecha' | 'mov' | 'pago' | 'domic'

const VISTAS: { v: Vista; label: string }[] = [
  { v: 'fp', label: 'Facturas y Pagos' },
  { v: 'fpsf', label: 'Facturas y Pagos sin Fact.' },
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

interface Doc {
  clase: 'pedido' | 'factura'
  tienda: string
  numero: number
  proveedor: string
  nFactura: string | null
  fecha: string | null
  fechaMov: string | null
  fechaPago: string | null
  fechaVto: string | null
  fp: string | null
  total: number
  pagado: boolean
}

interface PagoRow {
  tienda: string
  codigo: number
  fecha: string | null
  receptor: string | null
  nombre: string | null
  nFactura: string | null
  fechaFactura: string | null
  fechaPago: string | null
  fechaVto: string | null
  nDoc: string | null
  cuota: number
  importe: number
  estado: string | null
  fp: string | null
  tipoPago: string | null
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
  pago: PagoRow | null
}

const docKeyOf = (clase: string, t: string, n: number) => `${clase}|${t}|${n}`
const fmtFecha = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(2, 4)}` : ' /  /')
const enRango = (d: string | null, desde: string, hasta: string) => !!d && d >= desde && d <= hasta

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

export function GestorPagosProveedorPage() {
  const navigate = useNavigate()
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [periodo, setPeriodo] = useState<number | 'anio' | 'filtro'>(new Date().getMonth())
  const [filtro, setFiltro] = useState({ desde: hoyISO().slice(0, 8) + '01', hasta: hoyISO() })
  const [verFiltro, setVerFiltro] = useState(false)
  const [vista, setVista] = useState<Vista>('fp')
  const [modo, setModo] = useState<ModoFecha>('fecha')
  // Filtros de estado y forma de pago: vacío = sin filtrar (todos con ✗, como abre GeminisWin).
  const [estados, setEstados] = useState<Set<'pagado' | 'pendiente'>>(new Set())
  const [clases, setClases] = useState<Set<ClaseFp>>(new Set())
  const [aplicado, setAplicado] = useState({ estados: new Set<string>(), clases: new Set<ClaseFp>() })
  const [formas, setFormas] = useState<FormaPago[]>([])
  const [docs, setDocs] = useState<Doc[]>([])
  const [pagos, setPagos] = useState<PagoRow[]>([])
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
    const [ped, fac, pag] = await Promise.all([
      supabase
        .from('pedido_proveedor')
        .select('tienda_terminal_codigo, numero, proveedor_codigo, numero_factura_proveedor_externo, fecha_factura, fecha_hora, fecha_pago, fecha_vencimiento_1, forma_pago_codigo, total, total_a_pagar_proveedor, pagado')
        .not('numero_factura_proveedor_externo', 'is', null)
        .or(rango(['fecha_factura', 'fecha_pago', 'fecha_vencimiento_1']))
        .limit(5000),
      supabase
        .from('factura_proveedor')
        .select('tienda_terminal_codigo, id, proveedor_codigo, numero_factura_externo, fecha_factura, fecha_hora, fecha_pago, fecha_vencimiento, forma_pago_codigo, total, total_a_pagar_proveedor, pagado')
        .or(rango(['fecha_factura', 'fecha_pago', 'fecha_vencimiento']))
        .limit(5000),
      supabase
        .from('pago_proveedor')
        .select('tienda_terminal_codigo, codigo_pago, fecha, receptor_codigo, receptor_nombre, numero_factura_externa, fecha_factura, fecha_pago, fecha_vencimiento, numero_documento_pago, cuota, importe_pagado, estado_pago, forma_pago_codigo, tipo_pago, pedido_relacionado_tienda_codigo, pedido_relacionado_numero, factura_relacionada_tienda_codigo, factura_relacionada_id')
        .eq('activo', true)
        .or(rango(['fecha', 'fecha_pago', 'fecha_vencimiento', 'fecha_factura']))
        .limit(5000),
    ])
    const err = ped.error ?? fac.error ?? pag.error
    if (err) setMensaje(err.message)
    const ds: Doc[] = [
      ...(ped.data ?? []).map((r) => ({
        clase: 'pedido' as const,
        tienda: r.tienda_terminal_codigo as string,
        numero: Number(r.numero),
        proveedor: r.proveedor_codigo as string,
        nFactura: r.numero_factura_proveedor_externo as string | null,
        fecha: r.fecha_factura as string | null,
        fechaMov: (r.fecha_hora as string | null)?.slice(0, 10) ?? null,
        fechaPago: r.fecha_pago as string | null,
        fechaVto: r.fecha_vencimiento_1 as string | null,
        fp: r.forma_pago_codigo as string | null,
        total: Number(r.total_a_pagar_proveedor ?? r.total ?? 0),
        pagado: Boolean(r.pagado),
      })),
      ...(fac.data ?? []).map((r) => ({
        clase: 'factura' as const,
        tienda: r.tienda_terminal_codigo as string,
        numero: Number(r.id),
        proveedor: r.proveedor_codigo as string,
        nFactura: r.numero_factura_externo as string | null,
        fecha: r.fecha_factura as string | null,
        fechaMov: (r.fecha_hora as string | null)?.slice(0, 10) ?? null,
        fechaPago: r.fecha_pago as string | null,
        fechaVto: r.fecha_vencimiento as string | null,
        fp: r.forma_pago_codigo as string | null,
        total: Number(r.total_a_pagar_proveedor ?? r.total ?? 0),
        pagado: Boolean(r.pagado),
      })),
    ]
    const ps: PagoRow[] = (pag.data ?? []).map((r) => ({
      tienda: r.tienda_terminal_codigo as string,
      codigo: Number(r.codigo_pago),
      fecha: r.fecha as string | null,
      receptor: r.receptor_codigo as string | null,
      nombre: r.receptor_nombre as string | null,
      nFactura: r.numero_factura_externa as string | null,
      fechaFactura: r.fecha_factura as string | null,
      fechaPago: r.fecha_pago as string | null,
      fechaVto: r.fecha_vencimiento as string | null,
      nDoc: r.numero_documento_pago as string | null,
      cuota: Number(r.cuota ?? 0),
      importe: Number(r.importe_pagado ?? 0),
      estado: r.estado_pago as string | null,
      fp: r.forma_pago_codigo as string | null,
      tipoPago: r.tipo_pago as string | null,
      docKey:
        r.factura_relacionada_id != null
          ? docKeyOf('factura', r.factura_relacionada_tienda_codigo as string, Number(r.factura_relacionada_id))
          : r.pedido_relacionado_numero != null
            ? docKeyOf('pedido', r.pedido_relacionado_tienda_codigo as string, Number(r.pedido_relacionado_numero))
            : null,
    }))
    const codigos = [...new Set(ds.map((x) => x.proveedor).filter(Boolean))]
    const mapa = new Map<string, string>()
    for (let i = 0; i < codigos.length; i += 200) {
      const { data } = await supabase.from('proveedor').select('codigo, nombre').in('codigo', codigos.slice(i, i + 200))
      for (const r of data ?? []) mapa.set(r.codigo as string, r.nombre as string)
    }
    setNombres(mapa)
    setDocs(ds)
    setPagos(ps)
    setCargando(false)
  }, [anio])

  useEffect(() => {
    cargar()
  }, [cargar])

  const fpMap = useMemo(() => new Map(formas.map((f) => [f.codigo, f])), [formas])

  // Todas las filas posibles según la vista (sin filtrar por fecha ni estado).
  const filasVista = useMemo((): Fila[] => {
    const porDoc = new Map<string, PagoRow[]>()
    for (const p of pagos) if (p.docKey) porDoc.set(p.docKey, [...(porDoc.get(p.docKey) ?? []), p])
    const docMap = new Map(docs.map((d) => [docKeyOf(d.clase, d.tienda, d.numero), d]))
    const clase = (fp: string | null, tipoPago: string | null, esDoc: boolean): ClaseFp =>
      fp && fpMap.get(fp) ? claseFormaPago(fpMap.get(fp)) : esDoc ? 'credito' : claseFormaPago(undefined, tipoPago)
    const filaDoc = (d: Doc): Fila => {
      const ps = porDoc.get(docKeyOf(d.clase, d.tienda, d.numero)) ?? []
      const pagado = ps.filter((p) => p.estado === 'pagado').reduce((s, p) => s + p.importe, 0)
      return {
        key: `d|${d.clase}|${d.tienda}|${d.numero}`,
        nFactura: d.nFactura ?? '',
        pagado: d.pagado,
        receptor: d.proveedor,
        nombre: nombres.get(d.proveedor) ?? '',
        fecha: d.fecha,
        fechaMov: d.fechaMov,
        fechaPago: d.fechaPago,
        fechaVto: d.fechaVto,
        nDoc: '',
        totalDoc: d.total,
        importe: d.pagado ? Math.max(pagado, ps.length ? pagado : d.total) : pagado,
        aPagar: d.pagado ? 0 : Math.max(0, d.total - pagado),
        fp: d.fp,
        clase: clase(d.fp, null, true),
        doc: d,
        pago: null,
      }
    }
    const filaPago = (p: PagoRow): Fila => {
      const d = p.docKey ? (docMap.get(p.docKey) ?? null) : null
      const pagado = p.estado === 'pagado'
      return {
        key: `p|${p.tienda}|${p.codigo}`,
        nFactura: p.nFactura ?? d?.nFactura ?? '',
        pagado,
        receptor: p.receptor ?? '',
        nombre: p.nombre ?? '',
        fecha: p.fechaFactura ?? d?.fecha ?? p.fecha,
        fechaMov: p.fecha,
        fechaPago: p.fechaPago,
        fechaVto: p.fechaVto,
        nDoc: p.nDoc ?? '',
        totalDoc: d?.total ?? p.cuota,
        importe: pagado ? p.importe : 0,
        aPagar: pagado ? 0 : p.cuota || p.importe,
        fp: p.fp,
        clase: clase(p.fp, p.tipoPago, false),
        doc: d,
        pago: p,
      }
    }
    const conPagos = (d: Doc) => porDoc.has(docKeyOf(d.clase, d.tienda, d.numero))
    const pagosConDoc = pagos.filter((p) => p.docKey)
    const pagosSinDoc = pagos.filter((p) => !p.docKey)
    switch (vista) {
      case 'fp':
        return [...pagosConDoc.map(filaPago), ...docs.filter((d) => !conPagos(d)).map(filaDoc)]
      case 'fpsf':
        return [...docs.map(filaDoc), ...pagosSinDoc.map(filaPago)]
      case 'f':
        return docs.map(filaDoc)
      case 'pfsp':
        return [...pagos.map(filaPago), ...docs.filter((d) => !conPagos(d)).map(filaDoc)]
      case 'p':
        return pagos.map(filaPago)
    }
  }, [docs, pagos, nombres, vista, fpMap])

  const [desde, hasta] = useMemo(() => {
    if (periodo === 'anio') return [`${anio}-01-01`, `${anio}-12-31`]
    if (periodo === 'filtro') return [filtro.desde, filtro.hasta]
    const m = String(periodo + 1).padStart(2, '0')
    const ult = new Date(anio, periodo + 1, 0).getDate()
    return [`${anio}-${m}-01`, `${anio}-${m}-${ult}`]
  }, [anio, periodo, filtro])

  const filas = useMemo(() => {
    const r = filasVista.filter((f) => {
      let ok: boolean
      if (modo === 'fecha') ok = enRango(f.fecha, desde, hasta) || enRango(f.fechaPago, desde, hasta) || enRango(f.fechaVto, desde, hasta)
      else if (modo === 'mov') ok = enRango(f.fechaMov, desde, hasta)
      else ok = enRango(f.fechaPago, desde, hasta) || enRango(f.fechaVto, desde, hasta)
      if (!ok) return false
      if (modo === 'domic' && f.clase !== 'domiciliacion') return false
      if (aplicado.estados.size && !aplicado.estados.has(f.pagado ? 'pagado' : 'pendiente')) return false
      if (aplicado.clases.size && !aplicado.clases.has(f.clase)) return false
      if (busqueda && !`${f.nFactura} ${f.receptor} ${f.nombre} ${f.nDoc}`.toLowerCase().includes(busqueda.toLowerCase())) return false
      return true
    })
    return r.sort((a, b) => (a.fechaVto ?? a.fecha ?? '').localeCompare(b.fechaVto ?? b.fecha ?? '') || a.nFactura.localeCompare(b.nFactura))
  }, [filasVista, modo, desde, hasta, aplicado, busqueda])

  const selIdx = filas.findIndex((f) => f.key === sel)
  const actual = selIdx >= 0 ? filas[selIdx] : null

  // Rejillas de la derecha: por día y forma de pago, y por día. Pagado por fecha de pago, a pagar por vencimiento.
  const { porDiaFp, porDia, diasConMov } = useMemo(() => {
    const dia = (d: string | null) => (d ? (typeof periodo === 'number' ? String(Number(d.slice(8, 10))) : `${d.slice(8, 10)}/${d.slice(5, 7)}`) : '')
    const a = new Map<string, { dia: string; fp: string; pagado: number; aPagar: number; orden: string }>()
    const b = new Map<string, { dia: string; pagado: number; aPagar: number; orden: string }>()
    const add = (fecha: string | null, fp: string, pagado: number, aPagar: number) => {
      if (!fecha || !enRango(fecha, desde, hasta)) return
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
  }, [filas, desde, hasta, periodo])

  const totalDocs = filas.reduce((s, f) => s + f.totalDoc, 0)
  const totPagado = porDia.reduce((s, x) => s + x.pagado, 0)
  const totAPagar = porDia.reduce((s, x) => s + x.aPagar, 0)

  function irA(i: number) {
    const f = filas[Math.max(0, Math.min(filas.length - 1, i))]
    if (f) setSel(f.key)
  }

  function abrirFactura() {
    const d = actual?.doc
    if (!d) return setMensaje('La fila seleccionada no tiene factura ni pedido de proveedor.')
    navigate(d.clase === 'pedido' ? `/pedidos-proveedor/${encodeURIComponent(d.tienda)}/${d.numero}` : `/facturas-proveedor/${encodeURIComponent(d.tienda)}/${d.numero}`)
  }

  function abrirPago() {
    if (!actual) return
    if (actual.pago) return navigate(`/pagos-proveedor/${encodeURIComponent(actual.pago.tienda)}/${actual.pago.codigo}`)
    const d = actual.doc
    if (d) navigate(`/pagos-proveedor/nuevo?${d.clase}=${encodeURIComponent(d.tienda)}-${d.numero}`)
  }

  async function generar(lista: Doc[]) {
    setMensaje(null)
    let n = 0
    try {
      for (const d of lista) {
        if (d.pagado) continue
        const dp = await cargarDoc(d.clase, d.tienda, d.numero)
        if (!dp) continue
        n += await generarPagosDoc(dp, dp.forma_pago_codigo ? fpMap.get(dp.forma_pago_codigo) : undefined, nombres.get(dp.proveedor_codigo) ?? null)
      }
      setMensaje(n ? `Generados ${n} pago(s) pendiente(s).` : 'No había vencimientos que generar (ya generados o sin importe pendiente).')
      await cargar()
    } catch (e) {
      setMensaje((e as Error).message)
    }
  }

  function aplicar() {
    setAplicado({ estados: new Set(estados), clases: new Set(clases) })
  }

  const fpDesc = (c: string | null) => (c ? (fpMap.get(c)?.codigo ?? c) : '')
  const pieSel = actual
    ? actual.doc
      ? `Fact. ${actual.doc.clase === 'pedido' ? 'Pedido' : 'Factura'} Proveedor: ${actual.doc.tienda}-${actual.doc.numero}. F.P.: ${fpDesc(actual.doc.fp)} Total: ${formatGw(actual.doc.total, 3)} Pag.: ${formatGw(actual.importe, 3)}. F. Fact.: ${fmtFecha(actual.doc.fecha)}`
      : `Pago ${actual.pago?.tienda}-${actual.pago?.codigo}. F.P.: ${fpDesc(actual.fp)} Cuota: ${formatGw(actual.pago?.cuota ?? 0, 3)} Pag.: ${formatGw(actual.importe, 3)}`
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
              <Toggle key={e} on={estados.has(e)} onClick={() => setEstados(alternar(estados, e))} className="w-[122px]">
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
        <button
          type="button"
          onClick={aplicar}
          className="my-1 flex w-[124px] items-center justify-center gap-1 border border-[var(--gw-border)] bg-[var(--gw-face)] text-[16px] hover:bg-[#e5f1fb]"
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
                <th>Receptor</th>
                <th>Nombre Receptor</th>
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
                      if (f.pago) navigate(`/pagos-proveedor/${encodeURIComponent(f.pago.tienda)}/${f.pago.codigo}`)
                    }}
                    title={f.pago ? `Pago ${f.pago.tienda}-${f.pago.codigo}` : f.doc ? `${f.doc.clase === 'pedido' ? 'Pedido' : 'Factura'} ${f.doc.tienda}-${f.doc.numero}` : ''}
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
              <FilasVacias cols={10} ocupadas={filas.length} total={18} />
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
                  <th>Pagado</th>
                  <th>A Pagar</th>
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
                <FilasVacias cols={4} ocupadas={porDiaFp.length} total={8} />
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
                  <th>Pagado</th>
                  <th>A Pagar</th>
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
                <FilasVacias cols={3} ocupadas={porDia.length} total={8} />
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Pie: datos de la fila seleccionada y totales */}
      <div className="flex h-[24px] items-center gap-2 text-[16px] text-[#1a4fd0]">
        <span className="min-w-0 flex-1 truncate" title={pieSel}>
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
            const q = prompt('Buscar por nº de factura, receptor o nº de documento (vacío = quitar búsqueda):', busqueda ?? '')
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
        <BtnTxt onClick={abrirFactura} disabled={!actual?.doc} w="w-[116px]">
          <FileText size={15} className="text-[#127a12]" /> Factura
        </BtnTxt>
        <BtnTxt onClick={abrirPago} disabled={!actual} w="w-[100px]">
          <CircleDollarSign size={15} className="text-[#8a6d1d]" /> Pago
        </BtnTxt>
        <BtnTxt onClick={() => actual?.doc && generar([actual.doc])} disabled={!actual?.doc || actual.doc.pagado} w="w-[200px]">
          <Settings2 size={15} /> <span><u>G</u>. Pagos Factura</span>
        </BtnTxt>
        <span className="flex w-[96px] flex-col items-center justify-center text-[14px] leading-[15px] text-[#1a4fd0]">
          <span>Nº Mov.:</span>
          <span>{filas.length}</span>
        </span>
        <BtnTxt
          onClick={() => {
            const lista = filas.filter((f) => f.doc && !f.pago && !f.doc.pagado).map((f) => f.doc as Doc)
            if (lista.length && confirm(`¿Generar los vencimientos pendientes de ${lista.length} documento(s) de la vista?`)) generar(lista)
          }}
          w="flex-1"
        >
          <Settings2 size={15} /> Gen. <u>T</u>odos los Pagos
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
            <input type="date" className="gw-input" value={filtro.desde} onChange={(e) => setFiltro({ ...filtro, desde: e.target.value })} />
            <span className="gw-label">Hasta</span>
            <input type="date" className="gw-input" value={filtro.hasta} onChange={(e) => setFiltro({ ...filtro, hasta: e.target.value })} />
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
      className={`flex h-[28px] items-center justify-center gap-0.5 truncate border border-[var(--gw-border)] bg-[var(--gw-face)] px-1 text-[16px] hover:bg-[#e5f1fb] ${className}`}
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
      className="flex w-[80px] items-center justify-center border border-[var(--gw-border)] text-[#1d3a8a] hover:bg-[#e5f1fb]"
    >
      {children}
    </button>
  )
}

function BtnTxt({ onClick, disabled, w, children }: { onClick: () => void; disabled?: boolean; w: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex ${w} items-center justify-center gap-1.5 border border-[var(--gw-border)] text-[16px] hover:bg-[#e5f1fb] disabled:text-[#9a9a9a] disabled:hover:bg-transparent`}
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
