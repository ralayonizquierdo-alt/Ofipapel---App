import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { Check, FileSpreadsheet, Monitor, Printer, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { fechaReferencia } from '../../lib/sesionTrabajo'
import { GwCheck, GwDate, GwGroup, GwInput, GwLookupButton, GwRadio, GwSelect, formatGw } from '../../components/gw'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { gwConCeros } from '../../components/gw/GwListaOrdenada'
import { FilasVacias } from '../../components/gw/GwGridParts'
import { descargarCsv, fechaEs, n, numSerie, r2, TIPOS_FIJOS } from './facturaModel'

// Facturación → Listados → List. Facturas. Mismo esquema que los informes de GeminisWin (captura
// 04-03, Informes de Caja): informe a procesar, orden de salida, rangos Desde/Hasta o Cualquiera y
// salida por Pantalla, Impresora o CSV. Totales con el desglose de IGIC por tipo
// (factura_impuesto_tramo).

type Informe = 'facturas' | 'clientes' | 'igic'
type Orden = 'numero' | 'fecha' | 'cliente'

interface Fila {
  tienda_terminal_codigo: string
  numero: number
  serie: string
  n_factura: number
  fecha_factura: string
  cliente_codigo: string
  nombre_cliente: string | null
  nif_cliente: string | null
  tipo_factura: string
  total_base: number
  total_igic: number
  total_retencion: number
  total: number
  forma_pago_codigo: string | null
  estado_envio_aeat: string
  anulada: boolean
  bases: Record<string, number>
  cuotas: Record<string, number>
}

const INFORMES: Record<Informe, string> = {
  facturas: 'Listado de facturas',
  clientes: 'Resumen de facturas por cliente',
  igic: 'Desglose de IGIC por tipo',
}

export function ListadoFacturasPage() {
  const navigate = useNavigate()
  const [informe, setInforme] = useState<Informe>('facturas')
  const [soloTotales, setSoloTotales] = useState(false)
  const [orden, setOrden] = useState<Orden>('numero')
  const [fModo, setFModo] = useState<'rango' | 'cualquiera'>('rango')
  // Mes en curso de la fecha de referencia (fecha de trabajo dentro del periodo seleccionado).
  const [fDesde, setFDesde] = useState<string | null>(() => {
    const d = fechaReferencia()
    return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString('sv-SE')
  })
  const [fHasta, setFHasta] = useState<string | null>(() => fechaReferencia().toLocaleDateString('sv-SE'))
  const [tModo, setTModo] = useState<'rango' | 'cualquiera'>('cualquiera')
  const [tDesde, setTDesde] = useState('')
  const [tHasta, setTHasta] = useState('')
  const [cModo, setCModo] = useState<'rango' | 'cualquiera'>('cualquiera')
  const [cDesde, setCDesde] = useState('')
  const [cHasta, setCHasta] = useState('')
  const [serie, setSerie] = useState('')
  const [tipos, setTipos] = useState({ F1: true, F2: true, R: true })
  const [anuladas, setAnuladas] = useState(false)

  const [tiendas, setTiendas] = useState<string[]>([])
  const [series, setSeries] = useState<string[]>([])
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lookup, setLookup] = useState<null | 'd' | 'h'>(null)
  const [imprimir, setImprimir] = useState(false)

  useEffect(() => {
    Promise.all([supabase.from('tienda_terminal').select('codigo').order('codigo'), supabase.from('serie_facturacion').select('serie').order('serie')]).then(([t, s]) => {
      setTiendas((t.data ?? []).map((r) => r.codigo as string))
      setSeries([...new Set((s.data ?? []).map((r) => r.serie as string))])
    })
  }, [])

  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key === 'F4') {
        e.preventDefault()
        navigate('/')
      }
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [navigate])

  async function procesar(): Promise<Fila[] | null> {
    setProcesando(true)
    setError(null)
    let q = supabase
      .from('factura')
      .select('tienda_terminal_codigo, numero, serie, n_factura, fecha_factura, cliente_codigo, nombre_cliente, nif_cliente, tipo_factura, total_base, total_igic, total_retencion, total, forma_pago_codigo, estado_envio_aeat')
    if (fModo === 'rango') {
      if (fDesde) q = q.gte('fecha_factura', fDesde)
      if (fHasta) q = q.lte('fecha_factura', fHasta)
    }
    if (tModo === 'rango') {
      if (tDesde) q = q.gte('tienda_terminal_codigo', tDesde)
      if (tHasta) q = q.lte('tienda_terminal_codigo', tHasta)
    }
    if (cModo === 'rango') {
      if (cDesde) q = q.gte('cliente_codigo', gwConCeros(cDesde))
      if (cHasta) q = q.lte('cliente_codigo', gwConCeros(cHasta))
    }
    if (serie) q = q.eq('serie', serie)
    const { data, error: e } = await q.order('fecha_factura').order('numero').limit(20000)
    if (e) {
      setProcesando(false)
      setError(e.message)
      return null
    }
    const base = (data ?? []) as Record<string, unknown>[]
    const claves = new Set(base.map((f) => `${f.tienda_terminal_codigo}-${f.numero}`))
    // Tramos de IGIC y anulaciones VeriFactu de las facturas
    const [tr, an] = await Promise.all([
      base.length
        ? supabase
            .from('factura_impuesto_tramo')
            .select('tienda_terminal_codigo, numero, tipo_pct, base_imponible, cuota_igic')
            .in('numero', [...new Set(base.map((f) => Number(f.numero)))].slice(0, 5000))
        : Promise.resolve({ data: [] as Record<string, unknown>[] }),
      supabase.from('registro_facturacion').select('origen_tienda_codigo, origen_numero').eq('origen_tipo', 'factura').eq('tipo_registro', 'anulacion'),
    ])
    const anul = new Set(((an.data ?? []) as Record<string, unknown>[]).map((r) => `${r.origen_tienda_codigo}-${r.origen_numero}`))
    const tramos = new Map<string, { bases: Record<string, number>; cuotas: Record<string, number> }>()
    for (const t of (tr.data ?? []) as Record<string, unknown>[]) {
      const k = `${t.tienda_terminal_codigo}-${t.numero}`
      if (!claves.has(k)) continue
      const x = tramos.get(k) ?? { bases: {}, cuotas: {} }
      const p = String(Number(t.tipo_pct ?? 0))
      x.bases[p] = r2((x.bases[p] ?? 0) + n(t.base_imponible as number))
      x.cuotas[p] = r2((x.cuotas[p] ?? 0) + n(t.cuota_igic as number))
      tramos.set(k, x)
    }
    let out: Fila[] = base.map((f) => {
      const k = `${f.tienda_terminal_codigo}-${f.numero}`
      const t = tramos.get(k) ?? { bases: { [String(0)]: n(f.total_base as number) }, cuotas: {} }
      return {
        tienda_terminal_codigo: f.tienda_terminal_codigo as string,
        numero: Number(f.numero),
        serie: f.serie as string,
        n_factura: Number(f.n_factura),
        fecha_factura: f.fecha_factura as string,
        cliente_codigo: f.cliente_codigo as string,
        nombre_cliente: (f.nombre_cliente as string | null) ?? null,
        nif_cliente: (f.nif_cliente as string | null) ?? null,
        tipo_factura: f.tipo_factura as string,
        total_base: n(f.total_base as number),
        total_igic: n(f.total_igic as number),
        total_retencion: n(f.total_retencion as number),
        total: n(f.total as number),
        forma_pago_codigo: (f.forma_pago_codigo as string | null) ?? null,
        estado_envio_aeat: f.estado_envio_aeat as string,
        anulada: anul.has(k),
        ...t,
      }
    })
    out = out.filter(
      (f) => (anuladas || !f.anulada) && (f.tipo_factura === 'F1' ? tipos.F1 : f.tipo_factura.startsWith('R') ? tipos.R : tipos.F2),
    )
    out.sort((a, b) =>
      orden === 'cliente'
        ? a.cliente_codigo.localeCompare(b.cliente_codigo) || a.fecha_factura.localeCompare(b.fecha_factura)
        : orden === 'fecha'
          ? a.fecha_factura.localeCompare(b.fecha_factura) || a.numero - b.numero
          : a.serie.localeCompare(b.serie) || a.n_factura - b.n_factura,
    )
    setFilas(out)
    setProcesando(false)
    return out
  }

  const tiposPct = useMemo(() => {
    const s = new Set<number>(TIPOS_FIJOS)
    for (const f of filas ?? []) for (const k of Object.keys(f.bases)) s.add(Number(k))
    return [...s].sort((a, b) => a - b)
  }, [filas])

  const totales = useMemo(() => {
    const fs = filas ?? []
    const bases: Record<string, number> = {}
    const cuotas: Record<string, number> = {}
    for (const f of fs) {
      for (const [k, v] of Object.entries(f.bases)) bases[k] = r2((bases[k] ?? 0) + v)
      for (const [k, v] of Object.entries(f.cuotas)) cuotas[k] = r2((cuotas[k] ?? 0) + v)
    }
    return {
      n: fs.length,
      base: r2(fs.reduce((s, f) => s + f.total_base, 0)),
      igic: r2(fs.reduce((s, f) => s + f.total_igic, 0)),
      total: r2(fs.reduce((s, f) => s + f.total, 0)),
      bases,
      cuotas,
    }
  }, [filas])

  const porCliente = useMemo(() => {
    const m = new Map<string, { cliente: string; nombre: string; nif: string; n: number; base: number; igic: number; total: number }>()
    for (const f of filas ?? []) {
      const x = m.get(f.cliente_codigo) ?? { cliente: f.cliente_codigo, nombre: f.nombre_cliente ?? '', nif: f.nif_cliente ?? '', n: 0, base: 0, igic: 0, total: 0 }
      x.n++
      x.base = r2(x.base + f.total_base)
      x.igic = r2(x.igic + f.total_igic)
      x.total = r2(x.total + f.total)
      m.set(f.cliente_codigo, x)
    }
    return [...m.values()].sort((a, b) => a.cliente.localeCompare(b.cliente))
  }, [filas])

  async function csv() {
    const fs = filas ?? (await procesar())
    if (!fs) return
    const nombre = `facturas_${fModo === 'rango' ? `${fDesde ?? ''}_${fHasta ?? ''}` : 'todas'}.csv`
    if (informe === 'clientes') {
      descargarCsv(nombre, ['Cliente', 'Nombre', 'NIF', 'Nº facturas', 'Base', 'IGIC', 'Total'], porCliente.map((c) => [c.cliente, c.nombre, c.nif, c.n, c.base, c.igic, c.total]))
    } else if (informe === 'igic') {
      descargarCsv(
        nombre,
        ['Tipo IGIC %', 'Base imponible', 'Cuota IGIC'],
        tiposPct.filter((p) => totales.bases[String(p)] != null).map((p) => [p, totales.bases[String(p)] ?? 0, totales.cuotas[String(p)] ?? 0]),
      )
    } else {
      descargarCsv(
        nombre,
        ['Tienda', 'Id', 'Nº factura', 'Fecha', 'Tipo', 'Cliente', 'Nombre', 'NIF', ...tiposPct.flatMap((p) => [`Base ${p}%`, `Cuota ${p}%`]), 'Base', 'IGIC', 'Total', 'Anulada', 'Estado AEAT'],
        fs.map((f) => [
          f.tienda_terminal_codigo,
          f.numero,
          numSerie(f),
          fechaEs(f.fecha_factura),
          f.tipo_factura,
          f.cliente_codigo,
          f.nombre_cliente,
          f.nif_cliente,
          ...tiposPct.flatMap((p) => [f.bases[String(p)] ?? 0, f.cuotas[String(p)] ?? 0]),
          f.total_base,
          f.total_igic,
          f.total,
          f.anulada ? 'Sí' : '',
          f.estado_envio_aeat,
        ]),
      )
    }
  }

  async function aImpresora() {
    if (!filas) await procesar()
    setImprimir(true)
    setTimeout(() => {
      window.print()
      setImprimir(false)
    }, 300)
  }

  const etq = (t: string) => <span className="text-[17px]">{t}</span>
  const num = 'text-right tabular-nums'
  const rango = (modo: 'rango' | 'cualquiera', set: (m: 'rango' | 'cualquiera') => void, name: string) => (
    <div className="flex w-[120px] flex-none flex-col gap-0.5 text-[15px]">
      <GwRadio name={name} label="Desde/Hasta" checked={modo === 'rango'} onChange={() => set('rango')} />
      <GwRadio name={name} label="Cualquiera" checked={modo === 'cualquiera'} onChange={() => set('cualquiera')} />
    </div>
  )

  const tablaResultado = (paraImprimir: boolean) => {
    const cab = paraImprimir ? '' : 'sticky top-0'
    if (informe === 'clientes')
      return (
        <table className={paraImprimir ? 'w-full text-[9pt]' : 'gw-grid'}>
          <thead className={cab}>
            <tr>
              <th className="text-left">Cliente</th>
              <th className="text-left">Nombre</th>
              <th className="text-left">NIF</th>
              <th className="text-right!">Nº Fras.</th>
              <th className="text-right!">Base</th>
              <th className="text-right!">IGIC</th>
              <th className="text-right!">Total</th>
            </tr>
          </thead>
          <tbody>
            {!soloTotales &&
              porCliente.map((c) => (
                <tr key={c.cliente}>
                  <td>{c.cliente}</td>
                  <td className="truncate">{c.nombre}</td>
                  <td>{c.nif}</td>
                  <td className={num}>{c.n}</td>
                  <td className={num}>{formatGw(c.base, 2)}</td>
                  <td className={num}>{formatGw(c.igic, 2)}</td>
                  <td className={num}>{formatGw(c.total, 2)}</td>
                </tr>
              ))}
            {!paraImprimir && <FilasVacias cols={7} ocupadas={soloTotales ? 0 : porCliente.length} total={8} />}
          </tbody>
        </table>
      )
    if (informe === 'igic')
      return (
        <table className={paraImprimir ? 'w-full text-[9pt]' : 'gw-grid'}>
          <thead className={cab}>
            <tr>
              <th className="text-left">Tipo IGIC</th>
              <th className="text-right!">Base imponible</th>
              <th className="text-right!">Cuota IGIC</th>
              <th className="text-right!">Total</th>
            </tr>
          </thead>
          <tbody>
            {tiposPct
              .filter((p) => totales.bases[String(p)] != null)
              .map((p) => (
                <tr key={p}>
                  <td>{formatGw(p, 1)} %</td>
                  <td className={num}>{formatGw(totales.bases[String(p)] ?? 0, 2)}</td>
                  <td className={num}>{formatGw(totales.cuotas[String(p)] ?? 0, 2)}</td>
                  <td className={num}>{formatGw((totales.bases[String(p)] ?? 0) + (totales.cuotas[String(p)] ?? 0), 2)}</td>
                </tr>
              ))}
            {!paraImprimir && <FilasVacias cols={4} ocupadas={Object.keys(totales.bases).length} total={8} />}
          </tbody>
        </table>
      )
    return (
      <table className={paraImprimir ? 'w-full text-[8.5pt]' : 'gw-grid'}>
        <thead className={cab}>
          <tr>
            <th className="text-left" style={{ width: 36 }}>Ti.</th>
            <th className="text-left" style={{ width: 100 }}>Nº Factura</th>
            <th className="text-left" style={{ width: 88 }}>Fecha</th>
            <th className="text-left" style={{ width: 34 }}>Tipo</th>
            <th className="text-left" style={{ width: 64 }}>Cliente</th>
            <th className="text-left">Nombre</th>
            {tiposPct.map((p) => (
              <th key={p} className="text-right!" style={{ width: 88 }}>
                Base {formatGw(p, 1)}%
              </th>
            ))}
            <th className="text-right!" style={{ width: 84 }}>IGIC</th>
            <th className="text-right!" style={{ width: 94 }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {!soloTotales &&
            (filas ?? []).map((f) => (
              <tr
                key={`${f.tienda_terminal_codigo}-${f.numero}`}
                className={f.anulada ? 'text-[#c42b1c] line-through' : ''}
                onDoubleClick={() => navigate(`/facturacion/${f.tienda_terminal_codigo}/${f.numero}`)}
                title={f.anulada ? 'Factura anulada' : 'Doble clic: abrir la factura'}
              >
                <td>{f.tienda_terminal_codigo}</td>
                <td>{numSerie(f)}</td>
                <td>{fechaEs(f.fecha_factura)}</td>
                <td>{f.tipo_factura}</td>
                <td>{f.cliente_codigo}</td>
                <td className="truncate">{f.nombre_cliente ?? ''}</td>
                {tiposPct.map((p) => (
                  <td key={p} className={num}>
                    {f.bases[String(p)] != null ? formatGw(f.bases[String(p)], 2) : ''}
                  </td>
                ))}
                <td className={num}>{formatGw(f.total_igic, 2)}</td>
                <td className={num}>{formatGw(f.total, 2)}</td>
              </tr>
            ))}
          {!paraImprimir && <FilasVacias cols={8 + tiposPct.length} ocupadas={soloTotales ? 0 : (filas ?? []).length} total={8} />}
        </tbody>
      </table>
    )
  }

  const lineaTotales = (
    <div className="flex flex-wrap items-center gap-x-4 text-[14px]">
      <span>
        Facturas: <b>{totales.n}</b>
      </span>
      {tiposPct
        .filter((p) => totales.bases[String(p)] != null)
        .map((p) => (
          <span key={p}>
            {formatGw(p, 1)}%: base <b>{formatGw(totales.bases[String(p)], 2)}</b> · cuota <b>{formatGw(totales.cuotas[String(p)] ?? 0, 2)}</b>
          </span>
        ))}
      <span className="ml-auto">
        Base <b>{formatGw(totales.base, 2)}</b> · IGIC <b>{formatGw(totales.igic, 2)}</b> · Total <b className="text-[16px]">{formatGw(totales.total, 2)}</b>
      </span>
    </div>
  )

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] gap-2">
        <div className="flex flex-col gap-0.5 border border-[var(--gw-border-light)] px-2 pb-1.5">
          <div className="flex items-end justify-between gap-2">
            <span className="text-[19px] font-bold">Informe a procesar</span>
            <GwCheck label={<span className="text-[17px] font-bold">Sólo Ver los Totales del informe</span>} checked={soloTotales} onChange={setSoloTotales} />
          </div>
          <GwSelect className="!h-[30px] !text-[17px]" value={informe} onChange={(e) => setInforme(e.target.value as Informe)}>
            {(Object.keys(INFORMES) as Informe[]).map((k) => (
              <option key={k} value={k}>
                {INFORMES[k]}
              </option>
            ))}
          </GwSelect>
          <GwCheck label={<span className="text-[15px]">Incluir las facturas anuladas</span>} checked={anuladas} onChange={setAnuladas} />
        </div>
        <div className="flex flex-col gap-0.5 border border-[var(--gw-border-light)] px-2 pb-1.5">
          <span className="text-[19px] font-bold">Orden de salida</span>
          <GwSelect className="!h-[30px] !text-[17px]" value={orden} onChange={(e) => setOrden(e.target.value as Orden)}>
            <option value="numero">Serie y Nº de Factura</option>
            <option value="fecha">Fecha de Factura</option>
            <option value="cliente">Cliente y Fecha</option>
          </GwSelect>
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <GwGroup title={etq('Fecha de Factura')}>
          <div className="flex items-center gap-2">
            {rango(fModo, setFModo, 'lf-f')}
            <GwDate value={fDesde} onChange={setFDesde} disabled={fModo !== 'rango'} />
            <GwDate value={fHasta} onChange={setFHasta} disabled={fModo !== 'rango'} />
          </div>
        </GwGroup>
        <GwGroup title={etq('Tienda')}>
          <div className="flex items-center gap-2">
            {rango(tModo, setTModo, 'lf-t')}
            <GwSelect className="!w-[80px]" disabled={tModo !== 'rango'} value={tDesde} onChange={(e) => setTDesde(e.target.value)}>
              <option value="" />
              {tiendas.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </GwSelect>
            <GwSelect className="!w-[80px]" disabled={tModo !== 'rango'} value={tHasta} onChange={(e) => setTHasta(e.target.value)}>
              <option value="" />
              {tiendas.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </GwSelect>
            <span className="ml-auto text-[15px]">D.C./Serie</span>
            <GwSelect className="!w-[90px]" value={serie} onChange={(e) => setSerie(e.target.value)}>
              <option value="">Todas</option>
              {series.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </GwSelect>
          </div>
        </GwGroup>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        <GwGroup title={etq('Cliente')}>
          <div className="flex items-center gap-1.5">
            {rango(cModo, setCModo, 'lf-c')}
            <GwInput className="!w-[100px]" disabled={cModo !== 'rango'} value={cDesde} onChange={(e) => setCDesde(e.target.value)} onBlur={() => cDesde && setCDesde(gwConCeros(cDesde))} />
            <GwLookupButton disabled={cModo !== 'rango'} onClick={() => setLookup('d')} />
            <GwInput className="!w-[100px]" disabled={cModo !== 'rango'} value={cHasta} onChange={(e) => setCHasta(e.target.value)} onBlur={() => cHasta && setCHasta(gwConCeros(cHasta))} />
            <GwLookupButton disabled={cModo !== 'rango'} onClick={() => setLookup('h')} />
          </div>
        </GwGroup>
        <GwGroup title={etq('Tipo de Factura')}>
          <div className="flex h-full items-center gap-1.5">
            {(['F1', 'F2', 'R'] as const).map((t) => (
              <button
                key={t}
                type="button"
                className="gw-btn h-[30px] flex-1 gap-1 text-[15px]"
                onClick={() => setTipos((x) => ({ ...x, [t]: !x[t] }))}
                title={t === 'F1' ? 'Facturas completas' : t === 'F2' ? 'Facturas simplificadas' : 'Rectificativas'}
              >
                {tipos[t] ? <Check size={15} className="text-[#127a12]" /> : <X size={15} className="text-[#c42b1c]" />}
                {t === 'F1' ? 'Completas' : t === 'F2' ? 'Simplific.' : 'Rectificat.'}
              </button>
            ))}
          </div>
        </GwGroup>
      </div>

      <div className="h-[200px] overflow-auto border border-[var(--gw-border)] bg-white">{tablaResultado(false)}</div>
      {lineaTotales}

      <div className="flex items-stretch gap-2">
        <div className="flex w-[180px] flex-none items-center border border-[var(--gw-border-light)] px-2 text-[15px] leading-tight">Pulse F4 para cerrar la ventana</div>
        <div className="grid flex-1 grid-cols-4 gap-0.5 border border-[var(--gw-border-light)] p-1">
          <button type="button" className="gw-btn h-[38px] gap-1.5 text-[16px]" onClick={procesar} disabled={procesando}>
            <Monitor size={15} /> Pantalla
          </button>
          <button type="button" className="gw-btn h-[38px] gap-1.5 text-[16px]" onClick={aImpresora} disabled={procesando}>
            <Printer size={15} /> Impresora
          </button>
          <button type="button" className="gw-btn h-[38px] gap-1.5 text-[16px]" onClick={csv} disabled={procesando}>
            <FileSpreadsheet size={15} className="text-[#127a12]" /> CSV
          </button>
          <button type="button" className="gw-btn h-[38px] gap-1.5 text-[16px]" disabled title="Doc. PDF: usa Impresora → Guardar como PDF">
            Doc. PDF
          </button>
        </div>
        <button type="button" className="gw-btn h-[46px] w-[170px] gap-1.5 text-[18px]" onClick={procesar} disabled={procesando}>
          <Check size={17} strokeWidth={3} className="text-[#127a12]" />
          {procesando ? 'Procesando…' : 'Procesar'}
        </button>
        <button type="button" className="gw-btn h-[46px] w-[170px] gap-1.5 text-[18px]" onClick={() => navigate('/')}>
          <X size={17} strokeWidth={3} className="text-[#c42b1c]" />
          Cerrar
        </button>
      </div>
      {error && <span className="text-[13px] text-[#c42b1c]">{error}</span>}

      {imprimir &&
        createPortal(
          <div className="solo-impresion text-black" style={{ width: '190mm', padding: '4mm' }}>
            <div className="mb-2 flex justify-between text-[11pt] font-bold">
              <span>{INFORMES[informe]}</span>
              <span>
                {fModo === 'rango' ? `${fechaEs(fDesde)} — ${fechaEs(fHasta)}` : 'Todas las fechas'}
                {serie ? ` · Serie ${serie}` : ''}
              </span>
            </div>
            {tablaResultado(true)}
            <div className="mt-2 border-t border-black pt-1">{lineaTotales}</div>
          </div>,
          document.body,
        )}

      {lookup && (
        <GwLookupDialog<Record<string, unknown>>
          title="Clientes"
          table="cliente"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'nombre', label: 'Nombre' },
            { key: 'nif', label: 'NIF', width: 110 },
          ]}
          searchColumns={['codigo', 'nombre', 'nif']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            if (lookup === 'd') setCDesde(r.codigo as string)
            else setCHasta(r.codigo as string)
            setLookup(null)
          }}
          onClose={() => setLookup(null)}
        />
      )}
    </div>
  )
}
