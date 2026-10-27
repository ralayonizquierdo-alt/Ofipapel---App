import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Ban, Check, Clock, FilePlus2, HandCoins, QrCode, Settings2, ShoppingBag, Undo2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { GwDate, GwField, GwGroup, GwInput, GwLookupButton, GwNumber, GwSelect, GwTextArea, GwWindow, GwCheck, formatGw } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { GwCampoBusqueda } from '../../components/gw/GwCampoBusqueda'
import { gwConCeros, useListaOrdenada, type GwListaOrdenadaDef } from '../../components/gw/GwListaOrdenada'
import { FilasVacias, GridMiniBar } from '../../components/gw/GwGridParts'
import { VerifactuQr } from '../../components/VerifactuQr'
import {
  ESTADO_AEAT,
  FACTURA_COLS,
  TIPOS_FIJOS,
  cargarAlbaranesFactura,
  cargarCobros,
  cargarRegistrosVf,
  clavePct,
  fechaEs,
  hoy,
  n,
  numSerie,
  r2,
  type AlbaranFactura,
  type CobroFactura,
  type FacturaCliente,
  type LineaAlbaran,
  type RegistroVf,
  type Tramo,
} from './facturaModel'
import { FacturaImpresa, type ClienteFactura, type EmpresaFactura } from './FacturaImpresa'

// Ficha «Facturas Clientes» (Facturación → Facturas en GeminisWin, captura 04-12): consulta de
// las facturas emitidas con sus albaranes desglosados por tipo de IGIC, los pagos (cobros) y el
// pie de totales. Las facturas NO se modifican (VeriFactu): se anulan o se rectifican.

type Clave = { t: string; n: number }
type Orden = 'numero' | 'n_factura' | 'fecha'

const ORDEN_TXT: Record<Orden, string> = { numero: 'por Id. factura', n_factura: 'por Nº de factura', fecha: 'por fecha' }

const defFactura = (campo: string, etiqueta: string): GwListaOrdenadaDef => ({
  fuente: 'factura',
  campo,
  etiqueta,
  que: 'Facturas',
  columnas: [
    { key: 'tienda_terminal_codigo', label: 'Ti.', width: 44 },
    { key: 'numero', label: 'Id. Factura', width: 100 },
    { key: 'serie', label: 'D.C./Serie', width: 90 },
    { key: 'n_factura', label: 'Nº de Factura', width: 120 },
    { key: 'fecha_factura', label: 'Fecha', width: 100 },
    { key: 'cliente_codigo', label: 'Cliente', width: 80 },
    { key: 'cliente_nombre', label: 'Nombre' },
    { key: 'total', label: 'Total', width: 110, decimales: 3 },
  ],
})
const ceros12 = (t: string | null) => (t && /^\d+$/.test(t.trim()) ? t.trim().padStart(12, '0') : t)

export function FacturaClienteFichaPage() {
  const params = useParams()
  const navigate = useNavigate()
  const [claveTienda, claveNum] = (params['*'] ?? '').split('/')
  const listaOrd = useListaOrdenada()

  const [claves, setClaves] = useState<Clave[]>([])
  const [orden, setOrden] = useState<Orden>('numero')
  const [fac, setFac] = useState<FacturaCliente | null>(null)
  const [cargando, setCargando] = useState(true)
  const [albaranes, setAlbaranes] = useState<AlbaranFactura[]>([])
  const [lineas, setLineas] = useState<LineaAlbaran[]>([])
  const [tramos, setTramos] = useState<Tramo[]>([])
  const [cobros, setCobros] = useState<CobroFactura[]>([])
  const [vf, setVf] = useState<{ alta: RegistroVf | null; anulacion: RegistroVf | null }>({ alta: null, anulacion: null })
  const [rectificativa, setRectificativa] = useState<{ t: string; numero: number; num: string } | null>(null)
  const [series, setSeries] = useState<{ tienda_terminal_codigo: string; serie: string; digito_control: string; descripcion: string | null }[]>([])
  const [tiendas, setTiendas] = useState<{ codigo: string; empresa_codigo: string | null }[]>([])
  const [formasPago, setFormasPago] = useState<{ codigo: string; descripcion: string }[]>([])
  const [cliente, setCliente] = useState<ClienteFactura | null>(null)
  const [nombreVendedor, setNombreVendedor] = useState('')
  const [empresa, setEmpresa] = useState<EmpresaFactura | null>(null)
  const [selAlb, setSelAlb] = useState(0)
  const [selPago, setSelPago] = useState(0)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [dialogo, setDialogo] = useState<null | 'buscar' | 'verifactu' | 'anular' | 'rectificar' | 'lineas'>(null)
  const [recarga, setRecarga] = useState(0)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('tienda_terminal').select('codigo, empresa_codigo').order('codigo'),
      supabase.from('forma_pago').select('codigo, descripcion').order('codigo'),
      supabase.from('serie_facturacion').select('tienda_terminal_codigo, serie, digito_control, descripcion').order('serie'),
    ]).then(([t, f, s]) => {
      setTiendas((t.data ?? []) as { codigo: string; empresa_codigo: string | null }[])
      setFormasPago((f.data ?? []) as { codigo: string; descripcion: string }[])
      setSeries((s.data ?? []) as never)
    })
  }, [])

  const cargarClaves = useCallback(async () => {
    let q = supabase.from('factura').select('tienda_terminal_codigo, numero')
    q =
      orden === 'numero'
        ? q.order('tienda_terminal_codigo').order('numero')
        : orden === 'n_factura'
          ? q.order('serie').order('n_factura')
          : q.order('fecha_factura').order('numero')
    const { data } = await q.limit(20000)
    setClaves((data ?? []).map((r) => ({ t: r.tienda_terminal_codigo as string, n: Number(r.numero) })))
  }, [orden])

  useEffect(() => {
    cargarClaves()
  }, [cargarClaves])

  // Carga: la factura de la URL o, si no hay, la última emitida.
  useEffect(() => {
    let cancel = false
    async function run() {
      setCargando(true)
      setSelAlb(0)
      setSelPago(0)
      let q = supabase.from('factura').select(FACTURA_COLS)
      if (claveTienda && claveNum) q = q.eq('tienda_terminal_codigo', claveTienda).eq('numero', Number(claveNum))
      else q = q.order('fecha_factura', { ascending: false }).order('secuencia_global', { ascending: false })
      const { data } = await q.limit(1)
      if (cancel) return
      const f = ((data ?? [])[0] as FacturaCliente | undefined) ?? null
      setFac(f)
      if (!f) {
        setAlbaranes([])
        setLineas([])
        setTramos([])
        setCobros([])
        setVf({ alta: null, anulacion: null })
        setRectificativa(null)
        setCargando(false)
        return
      }
      const [{ albaranes: al, lineas: ls }, tr, regs, rect] = await Promise.all([
        cargarAlbaranesFactura(f.tienda_terminal_codigo, f.numero),
        supabase
          .from('factura_impuesto_tramo')
          .select('tramo, tipo_pct, base_imponible, cuota_igic')
          .eq('tienda_terminal_codigo', f.tienda_terminal_codigo)
          .eq('numero', f.numero)
          .order('tramo'),
        cargarRegistrosVf(f.tienda_terminal_codigo, f.numero),
        supabase
          .from('factura')
          .select('tienda_terminal_codigo, numero, serie, n_factura')
          .eq('factura_rectificada_tienda_codigo', f.tienda_terminal_codigo)
          .eq('factura_rectificada_numero', f.numero)
          .limit(1),
      ])
      const cs = await cargarCobros(f, al)
      if (cancel) return
      setAlbaranes(al)
      setLineas(ls)
      setTramos(((tr.data ?? []) as Tramo[]).map((t) => ({ ...t, tipo_pct: n(t.tipo_pct), base_imponible: n(t.base_imponible), cuota_igic: n(t.cuota_igic) })))
      setVf(regs)
      const r = (rect.data ?? [])[0] as { tienda_terminal_codigo: string; numero: number; serie: string; n_factura: number } | undefined
      setRectificativa(r ? { t: r.tienda_terminal_codigo, numero: Number(r.numero), num: numSerie(r) } : null)
      setCobros(cs)
      setCargando(false)
    }
    run()
    return () => {
      cancel = true
    }
  }, [claveTienda, claveNum, recarga])

  useEffect(() => {
    if (!fac?.cliente_codigo) return setCliente(null)
    supabase
      .from('cliente')
      .select('codigo, nombre, razon_social, nif, direccion, codigo_postal, poblacion')
      .eq('codigo', fac.cliente_codigo)
      .maybeSingle()
      .then(({ data }) => setCliente((data as ClienteFactura | null) ?? null))
  }, [fac?.cliente_codigo])

  useEffect(() => {
    if (!fac?.vendedor_codigo) return setNombreVendedor('')
    supabase
      .from('vendedor')
      .select('nombre')
      .eq('codigo', fac.vendedor_codigo)
      .maybeSingle()
      .then(({ data }) => setNombreVendedor((data?.nombre as string | undefined) ?? ''))
  }, [fac?.vendedor_codigo])

  const empresaCodigo = tiendas.find((t) => t.codigo === fac?.tienda_terminal_codigo)?.empresa_codigo ?? tiendas[0]?.empresa_codigo ?? null
  useEffect(() => {
    if (!empresaCodigo) return
    supabase
      .from('empresa')
      .select('nombre, cif, direccion, codigo_postal, poblacion, telefono_fijo, email')
      .eq('codigo', empresaCodigo)
      .maybeSingle()
      .then(({ data }) => setEmpresa((data as EmpresaFactura | null) ?? null))
  }, [empresaCodigo])

  // Columnas de base: las fijas de GeminisWin (0, 3, 7 y 15 %) y cualquier otro tipo que aparezca.
  const tiposBase = useMemo(() => {
    const extra = new Set<number>()
    for (const a of albaranes) for (const k of Object.keys(a.bases)) if (!TIPOS_FIJOS.includes(Number(k))) extra.add(Number(k))
    return [...TIPOS_FIJOS, ...[...extra].sort((a, b) => a - b)]
  }, [albaranes])

  const cobrado = useMemo(() => r2(cobros.reduce((s, c) => s + n(c.importe_cobrado), 0)), [cobros])
  const pendienteCuotas = useMemo(
    () => r2(cobros.filter((c) => (c.estado_cobro ?? '').toLowerCase() !== 'cobrado').reduce((s, c) => s + n(c.cuota) - n(c.importe_cobrado), 0)),
    [cobros],
  )
  const pagadaEntera = !!fac && n(fac.total) !== 0 && r2(n(fac.total) - cobrado) <= 0.005
  const anulada = !!vf.anulacion
  const formaPagoNombre = formasPago.find((x) => x.codigo === fac?.forma_pago_codigo)?.descripcion ?? ''
  const serieInfo = series.find((s) => s.tienda_terminal_codigo === fac?.tienda_terminal_codigo && s.serie === fac?.serie)
  const baseTrasDto = r2(n(fac?.total_base))
  const sumaAlb = r2(albaranes.reduce((s, a) => s + a.subtotal_2, 0))

  const idx = fac ? claves.findIndex((k) => k.t === fac.tienda_terminal_codigo && k.n === fac.numero) : -1
  const ir = (k?: Clave) => k && navigate(`/facturacion/${k.t}/${k.n}`)

  // --- Búsquedas (Intro) y lista ordenada (Ctrl+Intro) ---
  async function buscarNumFactura(texto: string) {
    const t = texto.trim()
    const m = /^(.*)-(\d+)$/.exec(t)
    let q = supabase.from('factura').select('tienda_terminal_codigo, numero')
    q = m ? q.eq('serie', m[1]).eq('n_factura', Number(m[2])) : /^\d+$/.test(t) ? q.eq('n_factura', Number(t)) : q.eq('serie', t)
    const { data } = await q.order('numero').limit(1)
    const r = data?.[0]
    if (r) ir({ t: r.tienda_terminal_codigo as string, n: Number(r.numero) })
    else setMensaje(`No existe la factura ${t}`)
  }
  async function buscarId(texto: string) {
    if (!/^\d+$/.test(texto.trim())) return setMensaje('El Id. de factura es un número.')
    const { data } = await supabase.from('factura').select('tienda_terminal_codigo, numero').eq('numero', Number(texto)).order('tienda_terminal_codigo').limit(1)
    const r = data?.[0]
    if (r) ir({ t: r.tienda_terminal_codigo as string, n: Number(r.numero) })
    else setMensaje(`No existe la factura con Id. ${texto}`)
  }
  async function buscarCliente(texto: string) {
    const c = gwConCeros(texto.trim())
    const { data } = await supabase
      .from('factura')
      .select('tienda_terminal_codigo, numero')
      .eq('cliente_codigo', c)
      .order('fecha_factura', { ascending: false })
      .order('numero', { ascending: false })
      .limit(1)
    const r = data?.[0]
    if (r) ir({ t: r.tienda_terminal_codigo as string, n: Number(r.numero) })
    else setMensaje(`El cliente ${c} no tiene facturas`)
  }
  const ancla = fac ? `${fac.tienda_terminal_codigo}|${fac.numero}` : null
  const lista = (campo: string, etiqueta: string, transformar: (t: string | null) => string | null = (t) => t) => (texto: string | null) =>
    listaOrd.abrir(defFactura(campo, etiqueta), {
      texto: transformar(texto),
      ancla,
      onPick: (r) => ir({ t: String(r.tienda_terminal_codigo), n: Number(r.numero) }),
    })

  // --- Pagos (cobros) ---
  async function generarPagos() {
    if (!fac) return
    if (anulada) return setMensaje('La factura está anulada.')
    const pendiente = r2(n(fac.total) - cobrado - pendienteCuotas)
    if (pendiente <= 0) return setMensaje('No queda importe pendiente para generar pagos.')
    if (!fac.forma_pago_codigo) return setMensaje('La factura no tiene forma de pago.')
    const [{ data: fp }, { data: cli }] = await Promise.all([
      supabase.from('forma_pago').select('*').eq('codigo', fac.forma_pago_codigo).maybeSingle(),
      supabase.from('cliente').select('dias_pago_1, dias_pago_2').eq('codigo', fac.cliente_codigo).maybeSingle(),
    ])
    // Días: los de la ficha del cliente (días de pago 1 y 2) o, si no tiene, las cadencias de la forma de pago.
    const diasCli = [cli?.dias_pago_1, cli?.dias_pago_2].map((d) => Number(d ?? 0)).filter((d) => d > 0)
    const numPagos = diasCli.length || Math.max(1, Number(fp?.generador_num_pagos ?? 1))
    const plazos: number[] = []
    let acum = 0
    for (let i = 0; i < numPagos; i++) {
      if (diasCli.length) plazos.push(diasCli[i])
      else {
        acum += Number(fp?.[`cadencia_nivel${Math.min(i, 6)}`] ?? 0) || 0
        plazos.push(acum)
      }
    }
    setOcupado(true)
    try {
      let repartido = 0
      for (let i = 0; i < plazos.length; i++) {
        const cuota = i === plazos.length - 1 ? r2(pendiente - repartido) : r2(pendiente / plazos.length)
        repartido = r2(repartido + cuota)
        const { data: num, error: e1 } = await supabase.rpc('fn_siguiente_numero', { p_tienda: fac.tienda_terminal_codigo, p_tipo_documento: 'pago', p_serie: '' })
        if (e1) throw e1
        const venc = new Date(`${fac.fecha_factura}T00:00:00`)
        venc.setDate(venc.getDate() + plazos[i])
        const { error } = await supabase.from('cobro_cliente').insert({
          tienda_terminal_codigo: fac.tienda_terminal_codigo,
          codigo_pago: Number(num),
          cliente_codigo: fac.cliente_codigo,
          factura_tienda_codigo: fac.tienda_terminal_codigo,
          factura_numero: fac.numero,
          numero_factura_externo: numSerie(fac),
          id_pago: cobros.length + i + 1,
          fecha: hoy(),
          fecha_vencimiento: venc.toLocaleDateString('sv-SE'),
          cuota,
          importe_cobrado: 0,
          estado_cobro: 'pendiente',
          tipo_pago: fac.forma_pago_codigo,
          concepto: `Fra. ${numSerie(fac)} ${i + 1} de ${plazos.length}`,
        })
        if (error) throw error
      }
      setMensaje(`Generados ${plazos.length} vencimientos.`)
      setRecarga((x) => x + 1)
    } catch (e) {
      setMensaje((e as Error).message)
    } finally {
      setOcupado(false)
    }
  }

  async function marcarPagada() {
    if (!fac) return
    const pend = cobros.filter((c) => (c.estado_cobro ?? '').toLowerCase() !== 'cobrado' && n(c.cuota) > n(c.importe_cobrado))
    if (pend.length === 0) {
      return setMensaje(pagadaEntera ? 'La factura ya está pagada.' : 'No hay vencimientos pendientes: pulsa «Generar Pagos» primero.')
    }
    if (!confirm(`¿Dar por cobrados los ${pend.length} vencimientos pendientes (${formatGw(pendienteCuotas, 2)} €) con fecha de hoy?`)) return
    setOcupado(true)
    for (const c of pend) {
      const { error } = await supabase
        .from('cobro_cliente')
        .update({ estado_cobro: 'cobrado', importe_cobrado: n(c.cuota), fecha_pago: hoy() })
        .eq('tienda_terminal_codigo', c.tienda_terminal_codigo)
        .eq('codigo_pago', c.codigo_pago)
      if (error) {
        setOcupado(false)
        return setMensaje(error.message)
      }
    }
    setOcupado(false)
    setRecarga((x) => x + 1)
  }

  const th = 'whitespace-nowrap'
  const num = 'text-right tabular-nums'
  const etq = (t: string) => <span className="text-[15px]">{t}</span>
  const sinFactura = !fac

  return (
    <div className="flex flex-col gap-1">
      {/* Cabecera */}
      <div className="flex gap-2">
        <div className="grid flex-none grid-cols-[66px_108px_112px_84px_66px_118px] gap-x-1 border border-[var(--gw-border-light)] px-1.5 pb-1.5 pt-0.5">
          <GwField label={etq('Tienda')}>
            <GwSelect value={fac?.tienda_terminal_codigo ?? ''} disabled>
              <option>{fac?.tienda_terminal_codigo ?? ''}</option>
            </GwSelect>
          </GwField>
          <GwField label={etq('Id. Factura')}>
            <GwCampoBusqueda
              className="gw-num"
              value={fac ? String(fac.numero) : ''}
              title="IDFACTURA"
              onBuscar={buscarId}
              onLista={lista('id_ord', 'Id. Factura', ceros12)}
            />
          </GwField>
          <GwField label={etq('Fecha')}>
            <GwDate value={fac?.fecha_factura} readOnly title="FECHA" />
          </GwField>
          <GwField label={etq('Hora')}>
            <GwInput readOnly value={fac?.hora_factura ?? ''} title="HORA" />
          </GwField>
          <GwField label={etq('D.C.')}>
            <GwSelect value={fac?.serie ?? ''} disabled title={serieInfo ? `Serie ${serieInfo.serie}${serieInfo.descripcion ? ` · ${serieInfo.descripcion}` : ''}` : 'Dígito de control (serie)'}>
              <option value={fac?.serie ?? ''}>{serieInfo?.digito_control || fac?.serie || ''}</option>
            </GwSelect>
          </GwField>
          <GwField label={etq('Nº de Factura')}>
            <GwCampoBusqueda
              className="gw-num"
              value={fac ? String(fac.n_factura) : ''}
              title={fac ? `NUMFACTURA · ${numSerie(fac)}` : 'NUMFACTURA'}
              onBuscar={buscarNumFactura}
              onLista={lista('n_factura_ord', 'Nº de Factura', ceros12)}
            />
          </GwField>
        </div>
        <GwGroup title={etq('Tiendas Facturadas')} className="w-[290px] flex-none">
          <div className="flex items-center gap-1.5 text-[15px]">
            Desde:
            <GwSelect className="!w-[66px]" disabled value={fac?.oficina_desde_codigo ?? ''}>
              <option>{fac?.oficina_desde_codigo ?? ''}</option>
            </GwSelect>
            Hasta:
            <GwSelect className="!w-[66px]" disabled value={fac?.oficina_hasta_codigo ?? ''}>
              <option>{fac?.oficina_hasta_codigo ?? ''}</option>
            </GwSelect>
          </div>
        </GwGroup>
        <GwGroup title={etq('Periodo Facturado')} className="min-w-0 flex-1">
          <div className="flex items-center gap-1">
            <GwDate readOnly value={fac?.fecha_desde} />
            <span className="font-bold">—</span>
            <GwDate readOnly value={fac?.fecha_hasta} />
          </div>
        </GwGroup>
      </div>

      <div className="grid grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)_minmax(0,1.05fr)] gap-2">
        <GwGroup title={etq('Cliente')}>
          <div className="flex gap-1">
            <GwCampoBusqueda
              className="!w-[110px] flex-none"
              value={fac?.cliente_codigo ?? ''}
              title="CLIENTE"
              onBuscar={buscarCliente}
              onLista={lista('cliente_codigo', 'Cliente', (t) => (t ? gwConCeros(t) : t))}
            />
            <GwCampoBusqueda
              value={fac?.nombre_cliente ?? cliente?.nombre ?? ''}
              title="NOMBRE"
              onLista={lista('cliente_nombre', 'Nombre del cliente')}
            />
            <GwLookupButton disabled={!fac} onClick={() => fac && navigate(`/clientes/${encodeURIComponent(fac.cliente_codigo)}`)} title="Ir a la ficha del cliente" />
          </div>
        </GwGroup>
        <GwGroup title={etq('Vendedor')}>
          <div className="flex gap-1">
            <GwInput readOnly className="!w-[80px] flex-none" value={fac?.vendedor_codigo ?? ''} />
            <GwInput readOnly value={nombreVendedor} tabIndex={-1} />
            <GwLookupButton disabled={!fac?.vendedor_codigo} onClick={() => fac?.vendedor_codigo && navigate(`/vendedores/${fac.vendedor_codigo}`)} title="Ir a la ficha del vendedor" />
          </div>
        </GwGroup>
        <GwGroup title={etq('Forma de pago')}>
          <div className="flex gap-1">
            <GwInput readOnly className="!w-[60px] flex-none" value={fac?.forma_pago_codigo ?? ''} />
            <GwSelect disabled value={fac?.forma_pago_codigo ?? ''}>
              <option value={fac?.forma_pago_codigo ?? ''}>{formaPagoNombre}</option>
            </GwSelect>
            <GwLookupButton disabled title="Forma de pago" />
          </div>
        </GwGroup>
      </div>

      {/* Albaranes facturados */}
      <div className="h-[218px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th className={th} style={{ width: 40 }}>Ti.</th>
              <th className={`${th} text-center!`} style={{ width: 92 }}>Id. Venta</th>
              <th className={`${th} text-center!`} style={{ width: 92 }}>Fecha</th>
              <th className={`${th} text-center!`} style={{ width: 96 }}>Subtotal</th>
              <th className={`${th} text-center!`} style={{ width: 70 }}>Dto.</th>
              <th className={`${th} text-center!`} style={{ width: 100 }}>Tot. Base Imp.</th>
              {tiposBase.map((p) => (
                <th key={p} className={`${th} text-center!`} style={{ width: 96 }}>
                  Base {formatGw(p, 1)}%
                </th>
              ))}
              <th className={`${th} text-center!`} style={{ width: 92 }}>Total IGIC</th>
              <th className={`${th} text-center!`} style={{ width: 100 }}>Total Albaran</th>
            </tr>
          </thead>
          <tbody>
            {albaranes.map((a, i) => (
              <tr
                key={`${a.tienda_terminal_codigo}-${a.numero}`}
                className={i === selAlb ? 'gw-selected' : ''}
                onClick={() => setSelAlb(i)}
                onDoubleClick={() => setDialogo('lineas')}
                title="Doble clic: ver las líneas del albarán"
              >
                <td>{a.tienda_terminal_codigo}</td>
                <td className={num}>{a.numero}</td>
                <td>{fechaEs(a.fecha)}</td>
                <td className={num}>{formatGw(a.subtotal, 3)}</td>
                <td className={num}>{formatGw(a.total_descuento_pie, 2)}</td>
                <td className={num}>{formatGw(a.subtotal_2, 3)}</td>
                {tiposBase.map((p) => (
                  <td key={p} className={num}>
                    {formatGw(a.bases[clavePct(p)] ?? 0, 3)}
                  </td>
                ))}
                <td className={num}>{formatGw(Object.values(a.cuotas).reduce((s, x) => s + x, 0), 3)}</td>
                <td className={num}>{formatGw(a.total, 3)}</td>
              </tr>
            ))}
            <FilasVacias cols={8 + tiposBase.length} ocupadas={albaranes.length} total={8} />
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
        {/* Pie izquierdo: totales y observaciones */}
        <div className="flex flex-col gap-1">
          <GridMiniBar
            nuevo={false}
            borrar={false}
            modificar={!!albaranes[selAlb]}
            buscar={albaranes.length > 0}
            onModificar={() => {
              const a = albaranes[selAlb]
              if (a) navigate(`/ventas/${a.tienda_terminal_codigo}/${a.numero}`)
            }}
            onBuscar={() => setDialogo('lineas')}
          >
            <span className="flex-1 text-[15px] text-[#1a4fd0]">Nº Albaranes: {albaranes.length}</span>
            <span className="pr-2 text-[15px] font-bold tabular-nums" title="Suma de las bases de los albaranes">
              {formatGw(sumaAlb, 3)}
            </span>
          </GridMiniBar>
          <div className="grid grid-cols-[110px_96px_20px_minmax(0,1fr)_150px] items-center gap-x-1.5 gap-y-1 text-[15px]">
            <span className="text-right font-bold">Dto.:</span>
            <GwNumber decimals={2} value={n(fac?.descuento_pie_pct)} disabled />
            <span className="font-bold">%</span>
            <GwNumber decimals={3} value={n(fac?.total_descuento)} disabled />
            <span className="text-right font-bold tabular-nums">{formatGw(baseTrasDto, 3)}</span>

            <span />
            <span className="col-span-2 text-right font-bold">Total IGIC:</span>
            <span className="text-right font-bold tabular-nums">{formatGw(n(fac?.total_igic), 3)}</span>
            <GwNumber decimals={3} value={r2(n(fac?.total_base) + n(fac?.total_igic))} disabled className="font-bold" />

            <span className="text-right font-bold">% Retención:</span>
            <GwNumber decimals={2} value={n(fac?.retencion_pct)} disabled />
            <span />
            <span className="text-right font-bold">Total Retención:</span>
            <GwNumber decimals={3} value={n(fac?.total_retencion)} disabled />
          </div>
          <div className="grid grid-cols-[minmax(0,1fr)_150px] gap-x-1.5 gap-y-1 text-[15px]">
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <span className="text-[16px] font-bold">Observaciones</span>
                <span className="font-bold">Otros gastos:</span>
              </div>
              <GwTextArea rows={2} readOnly value={fac?.observaciones ?? ''} className="h-[44px]" />
            </div>
            <div className="flex flex-col justify-between gap-1">
              <GwNumber decimals={3} value={n(fac?.otros_gastos)} disabled />
              <div className="flex items-center gap-1">
                <span className="font-bold">Total:</span>
                <GwNumber decimals={3} value={n(fac?.total)} disabled className="text-[16px] font-bold" />
              </div>
            </div>
          </div>
          <div className="grid grid-cols-[120px_minmax(0,1fr)_230px] items-center gap-x-1.5">
            <GwDate readOnly value={fac?.fecha_hasta} title="Fecha de vencimiento (fin del periodo facturado)" />
            <span className="flex items-center gap-1 justify-self-end text-[15px] text-[#1a4fd0]">
              Fecha Pago:
              <GwDate readOnly value={cobros.filter((c) => c.fecha_pago).map((c) => c.fecha_pago!).sort().pop() ?? null} className="!w-[110px]" />
            </span>
            <div className="grid grid-cols-2 border border-[var(--gw-border)]">
              <button
                type="button"
                className={`gw-btn h-[32px] gap-1 text-[15px] ${pagadaEntera ? 'bg-white! font-bold' : ''}`}
                disabled={sinFactura || anulada || ocupado}
                onClick={marcarPagada}
                title="Factura pagada (según sus cobros). Si quedan vencimientos pendientes, los da por cobrados."
              >
                <Check size={15} className="text-[#127a12]" />
                Pagada
              </button>
              <button
                type="button"
                className={`gw-btn h-[32px] gap-1 text-[15px] ${!pagadaEntera && fac ? 'bg-white! font-bold' : ''}`}
                disabled={sinFactura}
                onClick={() => setMensaje(pagadaEntera ? 'La factura está pagada.' : `Pendiente de cobro: ${formatGw(r2(n(fac?.total) - cobrado), 2)} €`)}
                title="Factura pendiente de cobro"
              >
                <Clock size={14} className="text-[#a0522d]" />
                Pendiente
              </button>
            </div>
          </div>
        </div>

        {/* Pie derecho: pagos de la factura y botones */}
        <div className="flex flex-col gap-1">
          <div className="flex items-end justify-between">
            <span className="text-[15px] text-[#1a4fd0]">Pagos de la factura</span>
            <span className="text-[15px] text-[#1a4fd0]">Nº Pagos: {cobros.length}</span>
          </div>
          <div className="h-[132px] overflow-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid">
              <thead className="sticky top-0">
                <tr>
                  <th style={{ width: 44 }}>F. P.</th>
                  <th className="text-center!">Cuota Pago</th>
                  <th>Fech. Venc.</th>
                  <th>Estado</th>
                  <th className="text-center!">Pagado</th>
                  <th>Fech. Pago</th>
                  <th style={{ width: 30 }}>Nº</th>
                  <th>Concepto</th>
                </tr>
              </thead>
              <tbody>
                {cobros.map((c, i) => (
                  <tr key={`${c.tienda_terminal_codigo}-${c.codigo_pago}`} className={i === selPago ? 'gw-selected' : ''} onClick={() => setSelPago(i)}>
                    <td>{c.tipo_pago ?? ''}</td>
                    <td className={num}>{formatGw(n(c.cuota || c.importe_cobrado), 3)}</td>
                    <td>{fechaEs(c.fecha_vencimiento)}</td>
                    <td>{(c.estado_cobro ?? '').toLowerCase() === 'cobrado' ? 'Pagado' : 'Pendiente'}</td>
                    <td className={num}>{formatGw(n(c.importe_cobrado), 3)}</td>
                    <td>{fechaEs(c.fecha_pago)}</td>
                    <td className={num}>{c.id_pago ?? ''}</td>
                    <td className="whitespace-nowrap">{c.concepto ?? ''}</td>
                  </tr>
                ))}
                <FilasVacias cols={8} ocupadas={cobros.length} total={5} />
              </tbody>
            </table>
          </div>
          <GridMiniBar nuevo={false} modificar={false} borrar={false} buscar={false}>
            <span className="flex-1 text-right text-[16px] font-bold tabular-nums">Total Pagos: {formatGw(pendienteCuotas, 3)}</span>
            <span className="pr-2 text-[16px] font-bold tabular-nums">Pagado: {formatGw(cobrado, 3)}</span>
          </GridMiniBar>
          <div className="mt-auto grid grid-cols-4 gap-1">
            <BotonGrande onClick={() => navigate('/generar-facturas')} icono={<Settings2 size={16} />}>
              Generar Facturas
            </BotonGrande>
            <BotonGrande
              onClick={() => {
                const a = albaranes[selAlb]
                navigate(a ? `/ventas/${a.tienda_terminal_codigo}/${a.numero}` : '/ventas')
              }}
              icono={<ShoppingBag size={16} className="text-[#a0522d]" />}
            >
              Ir a Ventas
            </BotonGrande>
            {/* «Pagos de Clientes, Cobros» (menú Clientes) aún no existe: los cobros se ven y generan aquí. */}
            <BotonGrande onClick={() => undefined} disabled icono={<HandCoins size={16} className="text-[#127a12]" />}>
              Ir a Pagos
            </BotonGrande>
            <BotonGrande onClick={generarPagos} disabled={sinFactura || anulada || ocupado} icono={<FilePlus2 size={16} />}>
              Generar Pagos
            </BotonGrande>
          </div>
        </div>
      </div>

      <GwRecordBar
        mode="consulta"
        canNavigate={idx >= 0}
        onFirst={() => ir(claves[0])}
        onPrev={() => idx > 0 && ir(claves[idx - 1])}
        onNext={() => idx >= 0 && idx < claves.length - 1 && ir(claves[idx + 1])}
        onLast={() => ir(claves[claves.length - 1])}
        onSort={() => setOrden((o) => (o === 'numero' ? 'n_factura' : o === 'n_factura' ? 'fecha' : 'numero'))}
        onSearch={() => setDialogo('buscar')}
        onPrint={() => (fac ? window.print() : undefined)}
        onNew={() => navigate('/generar-facturas')}
        onEdit={() => setMensaje('Las facturas emitidas no se modifican (VeriFactu): para corregirla, anúlala o haz una rectificativa.')}
        onDelete={() => fac && !anulada && setDialogo('anular')}
        onExit={() => navigate('/')}
      />

      {/* Línea de estado: orden/registro y VeriFactu */}
      <div className="flex min-h-[24px] items-center gap-2 pr-[64px] text-[12px]" title="(a la derecha queda sitio para el asistente NEXA)">
        <span className="min-w-0 flex-1 truncate text-[#555]">
          {mensaje ??
            (cargando
              ? 'Cargando…'
              : `Orden: ${ORDEN_TXT[orden]} · ${idx >= 0 ? `Registro ${idx + 1} de ${claves.length}` : claves.length ? '' : 'No hay facturas emitidas. Pulsa «Generar Facturas» para facturar los albaranes.'}`)}
        </span>
        {fac && (
          <>
            <span className={`whitespace-nowrap font-bold ${anulada ? 'text-[#c42b1c]' : 'text-[#127a12]'}`} title={vf.alta?.huella ?? ''}>
              VERI*FACTU {fac.tipo_factura} · {anulada ? 'ANULADA' : (ESTADO_AEAT[fac.estado_envio_aeat] ?? fac.estado_envio_aeat)} · Huella {(vf.alta?.huella ?? fac.huella ?? '').slice(0, 10)}…
              {fac.factura_rectificada_numero ? ` · Rectifica a ${fac.factura_rectificada_tienda_codigo}-${fac.factura_rectificada_numero}` : ''}
              {rectificativa ? ` · Rectificada por ${rectificativa.num}` : ''}
            </span>
            <button type="button" className="gw-btn h-[22px] gap-1 px-2 text-[12px]" onClick={() => setDialogo('verifactu')}>
              <QrCode size={13} /> VeriFactu
            </button>
            <button
              type="button"
              className="gw-btn h-[22px] gap-1 px-2 text-[12px]"
              disabled={anulada}
              onClick={() => setDialogo('anular')}
              title="Registro de anulación VeriFactu"
            >
              <Ban size={13} className="text-[#c42b1c]" /> Anular
            </button>
            <button
              type="button"
              className="gw-btn h-[22px] gap-1 px-2 text-[12px]"
              disabled={anulada || !!rectificativa || fac.tipo_factura.startsWith('R')}
              onClick={() => setDialogo('rectificar')}
              title="Factura rectificativa que abona esta factura"
            >
              <Undo2 size={13} /> Rectificar
            </button>
          </>
        )}
      </div>

      {fac && (
        <FacturaImpresa
          empresa={empresa}
          cliente={cliente}
          factura={fac}
          albaranes={albaranes}
          lineas={lineas}
          tramos={tramos}
          cobros={cobros}
          alta={vf.alta}
          anulacion={vf.anulacion}
          formaPago={formaPagoNombre}
          rectificada={fac.factura_rectificada_numero ? `${fac.factura_rectificada_tienda_codigo}-${fac.factura_rectificada_numero}` : null}
        />
      )}

      {listaOrd.dialogo}
      {dialogo === 'buscar' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Localizar facturas de clientes"
          table="factura"
          columns={[
            { key: 'tienda_terminal_codigo', label: 'Ti.', width: 44 },
            { key: 'numero', label: 'Id. Factura', width: 100 },
            { key: 'serie', label: 'Serie', width: 70 },
            { key: 'n_factura', label: 'Nº de Factura', width: 110 },
            { key: 'fecha_factura', label: 'Fecha', width: 100 },
            { key: 'cliente_codigo', label: 'Cliente', width: 80 },
            { key: 'nombre_cliente', label: 'Nombre' },
          ]}
          searchColumns={['cliente_codigo', 'nombre_cliente', 'nif_cliente', 'serie']}
          orderBy="numero"
          keyColumn="numero"
          onPick={(r) => {
            setDialogo(null)
            ir({ t: r.tienda_terminal_codigo as string, n: Number(r.numero) })
          }}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'lineas' && albaranes[selAlb] && (
        <LineasAlbaranDialog
          albaran={albaranes[selAlb]}
          lineas={lineas.filter((l) => l.tienda_terminal_codigo === albaranes[selAlb].tienda_terminal_codigo && Number(l.numero) === albaranes[selAlb].numero)}
          onIr={() => navigate(`/ventas/${albaranes[selAlb].tienda_terminal_codigo}/${albaranes[selAlb].numero}`)}
          onClose={() => setDialogo(null)}
        />
      )}
      {dialogo === 'verifactu' && fac && <VerifactuDialog fac={fac} tramos={tramos} vf={vf} onClose={() => setDialogo(null)} />}
      {(dialogo === 'anular' || dialogo === 'rectificar') && fac && (
        <MotivoDialog
          tipo={dialogo}
          fac={fac}
          albaranes={albaranes.length}
          onClose={() => setDialogo(null)}
          onHecho={async (msg, destino) => {
            setDialogo(null)
            setMensaje(msg)
            await cargarClaves()
            if (destino) ir(destino)
            else setRecarga((x) => x + 1)
          }}
        />
      )}
    </div>
  )
}

function BotonGrande({ children, icono, onClick, disabled }: { children: string; icono: ReactNode; onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className="gw-btn h-[40px] gap-1.5 whitespace-nowrap px-1 text-[15px]" disabled={disabled} onClick={onClick}>
      {icono}
      {children}
    </button>
  )
}

function Modal({ title, children, onClose, width = 640 }: { title: string; children: ReactNode; onClose: () => void; width?: number }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-20" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title={title} onClose={onClose} className="max-w-[95vw]">
        <div style={{ width }} className="max-w-full">
          {children}
        </div>
      </GwWindow>
    </div>
  )
}

function LineasAlbaranDialog({ albaran, lineas, onIr, onClose }: { albaran: AlbaranFactura; lineas: LineaAlbaran[]; onIr: () => void; onClose: () => void }) {
  return (
    <Modal title={`Líneas del albarán ${albaran.tienda_terminal_codigo}-${albaran.numero} (${fechaEs(albaran.fecha)})`} onClose={onClose} width={860}>
      <div className="max-h-[380px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 110 }}>Código</th>
              <th>Descripción</th>
              <th className="text-right!" style={{ width: 80 }}>Cantidad</th>
              <th className="text-right!" style={{ width: 90 }}>Precio</th>
              <th className="text-right!" style={{ width: 60 }}>Dto.</th>
              <th className="text-right!" style={{ width: 60 }}>IGIC</th>
              <th className="text-right!" style={{ width: 100 }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l) => (
              <tr key={l.numero_linea}>
                <td>{l.articulo_codigo ?? ''}</td>
                <td className="truncate">{l.descripcion ?? ''}</td>
                <td className="text-right tabular-nums">{formatGw(n(l.cantidad), 2)}</td>
                <td className="text-right tabular-nums">{formatGw(n(l.precio), 3)}</td>
                <td className="text-right tabular-nums">{formatGw(n(l.descuento_pct), 2)}</td>
                <td className="text-right tabular-nums">{formatGw(n(l.igic_pct), 1)}</td>
                <td className="text-right tabular-nums">{formatGw(n(l.subtotal), 3)}</td>
              </tr>
            ))}
            <FilasVacias cols={7} ocupadas={lineas.length} total={8} />
          </tbody>
        </table>
      </div>
      <div className="mt-1.5 flex items-center justify-between gap-2 text-[13px]">
        <span>
          Base {formatGw(albaran.subtotal_2, 3)} · IGIC {formatGw(albaran.total_igic_pie, 3)} · <b>Total {formatGw(albaran.total, 3)}</b>
        </span>
        <span className="flex gap-1.5">
          <button type="button" className="gw-btn px-3" onClick={onIr}>
            Ir a la venta
          </button>
          <button type="button" className="gw-btn px-3" onClick={onClose}>
            Cerrar
          </button>
        </span>
      </div>
    </Modal>
  )
}

function VerifactuDialog({
  fac,
  tramos,
  vf,
  onClose,
}: {
  fac: FacturaCliente
  tramos: Tramo[]
  vf: { alta: RegistroVf | null; anulacion: RegistroVf | null }
  onClose: () => void
}) {
  const fila = (k: string, v: ReactNode) => (
    <div className="grid grid-cols-[170px_minmax(0,1fr)] gap-2 text-[13px]">
      <span className="gw-label">{k}</span>
      <span className="break-all">{v}</span>
    </div>
  )
  return (
    <Modal title={`VeriFactu · Factura ${numSerie(fac)}`} onClose={onClose} width={760}>
      <div className="flex gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          {fila('Nº serie (registro)', vf.alta?.num_serie_factura ?? numSerie(fac))}
          {fila('Tipo de factura', fac.tipo_factura)}
          {fila('Fecha de expedición', fechaEs(fac.fecha_factura))}
          {fila('Cuota / Importe total', `${formatGw(n(fac.total_igic), 2)} / ${formatGw(n(fac.total), 2)} €`)}
          {fila('Generado', vf.alta?.fecha_hora_huso_texto ?? '')}
          {fila('Huella (SHA-256)', <span className="font-mono text-[11px]">{vf.alta?.huella ?? fac.huella ?? ''}</span>)}
          {fila('Huella anterior', <span className="font-mono text-[11px]">{fac.huella_anterior ?? '(primer registro)'}</span>)}
          {fila('Estado envío AEAT', ESTADO_AEAT[vf.alta?.estado_envio_aeat ?? fac.estado_envio_aeat] ?? fac.estado_envio_aeat)}
          {fac.csv_aeat && fila('CSV AEAT', fac.csv_aeat)}
          {fac.codigo_error_aeat && fila('Error AEAT', fac.codigo_error_aeat)}
          {vf.anulacion &&
            fila(
              'ANULADA',
              <span className="font-bold text-[#c42b1c]">
                {vf.anulacion.fecha_hora_huso_texto} · {vf.anulacion.motivo ?? ''} · huella {vf.anulacion.huella.slice(0, 16)}…
              </span>,
            )}
          <div className="mt-1 border border-[var(--gw-border)] bg-white">
            <table className="gw-grid">
              <thead>
                <tr>
                  <th>Tipo IGIC</th>
                  <th className="text-right!">Base imponible</th>
                  <th className="text-right!">Cuota</th>
                </tr>
              </thead>
              <tbody>
                {tramos.map((t) => (
                  <tr key={t.tramo}>
                    <td>{formatGw(t.tipo_pct, 1)} %</td>
                    <td className="text-right tabular-nums">{formatGw(t.base_imponible, 2)}</td>
                    <td className="text-right tabular-nums">{formatGw(t.cuota_igic, 2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="flex w-[180px] flex-none flex-col items-center gap-1 text-center">
          <span className="text-[13px] font-bold">VERI*FACTU</span>
          {vf.alta?.codigo_qr_contenido ? <VerifactuQr contenido={vf.alta.codigo_qr_contenido} tamano="160px" /> : <span>Sin QR</span>}
          <span className="text-[11px] leading-tight">{fac.leyenda_verifactu ?? ''}</span>
        </div>
      </div>
      <div className="mt-2 flex justify-end">
        <button type="button" className="gw-btn px-4" onClick={onClose}>
          Cerrar
        </button>
      </div>
    </Modal>
  )
}

function MotivoDialog({
  tipo,
  fac,
  albaranes,
  onClose,
  onHecho,
}: {
  tipo: 'anular' | 'rectificar'
  fac: FacturaCliente
  albaranes: number
  onClose: () => void
  onHecho: (mensaje: string, destino?: Clave) => void
}) {
  const [motivo, setMotivo] = useState('')
  const [liberar, setLiberar] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [guardando, setGuardando] = useState(false)
  const anular = tipo === 'anular'

  async function aceptar() {
    if (!motivo.trim()) return setError('Indica el motivo.')
    setGuardando(true)
    setError(null)
    if (anular) {
      const { error: e } = await supabase.rpc('fn_anular_factura_cliente', {
        p_tienda: fac.tienda_terminal_codigo,
        p_numero: fac.numero,
        p_motivo: motivo.trim(),
        p_liberar_albaranes: liberar,
      })
      setGuardando(false)
      if (e) return setError(e.message)
      onHecho(`Factura ${numSerie(fac)} anulada (registro VeriFactu de anulación).${liberar ? ' Sus albaranes vuelven a estar pendientes de facturar.' : ''}`)
    } else {
      const { data, error: e } = await supabase.rpc('fn_rectificar_factura_cliente', {
        p_tienda: fac.tienda_terminal_codigo,
        p_numero: fac.numero,
        p_motivo: motivo.trim(),
      })
      setGuardando(false)
      if (e) return setError(e.message)
      const r = data as { t: string; numero: number; serie: string; n_factura: number }
      onHecho(`Emitida la rectificativa ${r.serie}-${r.n_factura}.`, { t: r.t, n: Number(r.numero) })
    }
  }

  return (
    <Modal title={anular ? `Anular la factura ${numSerie(fac)}` : `Rectificar la factura ${numSerie(fac)}`} onClose={onClose} width={560}>
      <div className="flex flex-col gap-2 text-[13px]">
        <p>
          {anular
            ? 'Se genera el registro VeriFactu de ANULACIÓN, encadenado. La factura no se borra: queda anulada. Úsalo solo para facturas expedidas por error.'
            : `Se emite una factura RECTIFICATIVA (${fac.tipo_factura === 'F2' ? 'R5' : 'R1'}, por diferencias) que abona íntegramente esta factura (${formatGw(n(fac.total), 2)} €), con su propio registro VeriFactu.`}
        </p>
        <GwField label="Motivo">
          <GwInput autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && aceptar()} />
        </GwField>
        {anular && albaranes > 0 && (
          <GwCheck label={`Liberar sus ${albaranes} albaranes para volver a facturarlos`} checked={liberar} onChange={setLiberar} />
        )}
        {error && <p className="text-[#c42b1c]">{error}</p>}
        <div className="flex justify-end gap-1.5">
          <button type="button" className="gw-btn w-[110px]" disabled={guardando} onClick={aceptar}>
            <Check size={14} strokeWidth={3} className="text-[#127a12]" />
            <u>A</u>ceptar
          </button>
          <button type="button" className="gw-btn w-[110px]" onClick={onClose}>
            <X size={14} strokeWidth={3} className="text-[#c42b1c]" />
            <u>C</u>ancelar
          </button>
        </div>
      </div>
    </Modal>
  )
}
