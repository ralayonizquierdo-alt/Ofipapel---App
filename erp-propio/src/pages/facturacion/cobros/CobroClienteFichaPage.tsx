import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { HandCoins } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { avisoNumero, useProximoNumero } from '../../../lib/proximoNumero'
import { navIndice, useNavRegistro, type NavDir, type NavFiltro } from '../../../components/gw/useNavRegistro'
import { GwCheck, GwDate, GwInput, GwLookupButton, GwNumber, GwSelect, formatGw } from '../../../components/gw'
import { GwLookupDialog, type GwLookupColumn } from '../../../components/gw/GwLookupDialog'
import { PagosBar } from '../../compras/pagos/PagosBar'
import { FORMA_PAGO_COLS, type FormaPago } from '../../compras/pagos/pagosModel'
import {
  COBRO_COLS,
  ESTADOS_COBRO,
  FACTURA_COLS,
  VENTA_COLS,
  anularCobro,
  cargarDoc,
  cobrar,
  docDeFactura,
  docDeVenta,
  docKeyCobro,
  guardarDatosCobro,
  vacio,
  type Cobro,
  type DocCobro,
} from './cobrosModel'

/** Los cobros anulados no se recorren con la barra. */
const soloActivos: NavFiltro = (q) => q.eq('activo', true)

// Ficha «Pagos de Clientes, Cobros» (Clientes → Pagos de Clientes, Cobros · Alt+F7, y botón Pago /
// Cobrar del Gestor de Pagos de Clientes en GeminisWin). Tabla PAGOSCLI → cobro_cliente.
// Sin captura todavía: gemela de la ficha de Pagos a proveedores. Agregar = cobrar (total o
// parcial) una factura o venta; Editar solo cambia datos que no son importes; Eliminar anula.

const L = 'text-[18px] leading-[20px] whitespace-nowrap'
const I = '!h-[30px] !text-[16px]'

type Lookup = 'cliente' | 'factura' | 'venta' | 'formapago' | null

function Grupo({ title, children, className = '', apagado }: { title?: ReactNode; children: ReactNode; className?: string; apagado?: boolean }) {
  return (
    <fieldset className={`min-w-0 border border-[var(--gw-border-light)] px-1.5 pb-1.5 pt-0 ${className}`}>
      {title != null && <legend className={`${L} px-1 ${apagado ? 'text-[#8a8a8a]' : ''}`}>{title}</legend>}
      {children}
    </fieldset>
  )
}

function Campo({ label, children, className = '', alinear }: { label: ReactNode; children: ReactNode; className?: string; alinear?: 'right' }) {
  return (
    <div className={`flex min-w-0 flex-col ${className}`}>
      <span className={`${L} ${alinear === 'right' ? 'text-right' : ''}`}>{label}</span>
      {children}
    </div>
  )
}

const claveDoc = (d: DocCobro) => `${d.clase}|${d.tienda}|${d.numero}`

export function CobroClienteFichaPage() {
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const ruta = (params['*'] ?? '').split('/').filter(Boolean)
  const esNuevo = ruta[0] === 'nuevo'
  const claveTienda = !esNuevo && ruta.length >= 2 ? decodeURIComponent(ruta[0]) : null
  const claveCodigo = !esNuevo && ruta.length >= 2 ? Number(ruta[1]) : null

  const [tiendas, setTiendas] = useState<string[]>([])
  const [formas, setFormas] = useState<FormaPago[]>([])
  const [cobro, setCobro] = useState<Cobro | null>(null)
  const [orig, setOrig] = useState<Cobro | null>(null)
  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>('consulta')
  const [cargando, setCargando] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)
  const [doc, setDoc] = useState<DocCobro | null>(null)
  const [nombreCliente, setNombreCliente] = useState<string>('')
  const [pendientes, setPendientes] = useState<DocCobro[]>([])
  /** Vencimiento pendiente que se cobra (alta desde un vencimiento del gestor). */
  const [vencimiento, setVencimiento] = useState<{ tienda: string; codigo: number } | null>(null)
  const [lookup, setLookup] = useState<Lookup>(null)

  const editable = mode !== 'consulta'
  const alta = mode === 'alta'
  // En alta, el número que tendrá el cobro (se asigna de verdad al guardar).
  const proximo = useProximoNumero(alta, cobro?.tienda_terminal_codigo, 'pago')

  useEffect(() => {
    Promise.all([
      supabase.from('tienda_terminal').select('codigo').order('codigo'),
      supabase.from('forma_pago').select(FORMA_PAGO_COLS).order('codigo'),
    ]).then(([t, f]) => {
      setTiendas((t.data ?? []).map((r) => r.codigo as string))
      setFormas((f.data ?? []) as FormaPago[])
    })
  }, [])

  // Navegación contra el servidor: solo el vecino (gt/lt + limit 1) y el recuento, nunca la lista.
  const nav = useNavRegistro<{ tienda_terminal_codigo: string; codigo_pago: number }>({
    tabla: 'cobro_cliente',
    orden: ['tienda_terminal_codigo', 'codigo_pago'],
    actual: cobro && cobro.codigo_pago != null && cobro.activo !== false ? [cobro.tienda_terminal_codigo, cobro.codigo_pago] : null,
    filtro: soloActivos,
  })
  const cargarClaves = nav.refrescar

  const nombreDe = useCallback(async (codigo: string | null) => {
    if (!codigo) return ''
    const { data } = await supabase.from('cliente').select('nombre').eq('codigo', codigo).maybeSingle()
    return (data?.nombre as string | undefined) ?? ''
  }, [])

  /** Facturas y ventas del cliente con importe pendiente de cobro. */
  const cargarPendientes = useCallback(async (cliente: string | null) => {
    if (!cliente) return setPendientes([])
    const [{ data: facts }, { data: vtas }, { data: anul }] = await Promise.all([
      supabase.from('factura').select(FACTURA_COLS).eq('cliente_codigo', cliente).neq('total_pendiente', 0).order('fecha_factura', { ascending: false }).limit(200),
      supabase
        .from('venta')
        .select(VENTA_COLS)
        .eq('cliente_codigo', cliente)
        .is('factura_numero', null)
        .is('anulada_en', null)
        .eq('aplazada', false)
        .gt('total_pendiente', 0.005)
        .order('fecha', { ascending: false })
        .limit(200),
      supabase.from('registro_facturacion').select('origen_tienda_codigo, origen_numero').eq('origen_tipo', 'factura').eq('tipo_registro', 'anulacion'),
    ])
    const anuladas = new Set((anul ?? []).map((r) => `${r.origen_tienda_codigo}|${r.origen_numero}`))
    setPendientes([
      ...(facts ?? []).filter((f) => !anuladas.has(`${f.tienda_terminal_codigo}|${f.numero}`)).map((f) => docDeFactura(f)),
      ...(vtas ?? []).map((v) => docDeVenta(v)),
    ])
  }, [])

  const cargarInfoDoc = useCallback(async (c: Cobro | null) => {
    setDoc(null)
    if (!c) return
    const k = docKeyCobro(c)
    if (!k) return
    const [clase, t, n] = k.split('|')
    setDoc(await cargarDoc(clase as 'factura' | 'venta', t, Number(n)))
  }, [])

  /** Aplica un documento al cobro en alta: cliente, nº de factura, importe pendiente, forma de pago. */
  const aplicarDoc = useCallback(
    (d: DocCobro, base: Cobro, importe?: number | null): Cobro => {
      setDoc(d)
      const pend = Math.max(0, d.pendiente)
      return {
        ...base,
        cliente_codigo: d.cliente_codigo,
        factura_tienda_codigo: d.clase === 'factura' ? d.tienda : null,
        factura_numero: d.clase === 'factura' ? d.numero : null,
        venta_relacionada_tienda_codigo: d.clase === 'venta' ? d.tienda : null,
        venta_relacionada_numero: d.clase === 'venta' ? d.numero : null,
        numero_factura_externo: d.clase === 'factura' ? d.ref : null,
        cuota: importe ?? pend,
        importe_cobrado: importe ?? pend,
        forma_pago_codigo: base.forma_pago_codigo ?? d.forma_pago_codigo,
        concepto: `Cobro ${d.clase === 'factura' ? `Fra. ${d.ref}` : d.ref}`,
      }
    },
    [],
  )

  // Carga: el cobro de la URL, el último si no hay ninguno, o uno nuevo (?factura=TT-N / ?venta=TT-N / &vencimiento=TT-C).
  useEffect(() => {
    let cancel = false
    async function run() {
      setCargando(true)
      setMensaje(null)
      setAviso((location.state as { aviso?: string } | null)?.aviso ?? null)
      if (esNuevo) {
        const qs = new URLSearchParams(location.search)
        let c = vacio(tiendas[0] ?? '01')
        setDoc(null)
        const fac = qs.get('factura')
        const vta = qs.get('venta')
        const [ct, cn] = (fac ?? vta ?? '').split('-')
        let venc: { tienda: string; codigo: number } | null = null
        const mv = qs.get('vencimiento')?.match(/^(.+)-(\d+)$/)
        if (mv) venc = { tienda: mv[1], codigo: Number(mv[2]) }
        if (ct && cn) {
          const d = await cargarDoc(fac ? 'factura' : 'venta', ct, Number(cn))
          if (d) {
            let importe: number | null = null
            if (venc) {
              const { data: v } = await supabase
                .from('cobro_cliente')
                .select('cuota, importe_cobrado, fecha_vencimiento')
                .eq('tienda_terminal_codigo', venc.tienda)
                .eq('codigo_pago', venc.codigo)
                .maybeSingle()
              if (v) {
                importe = Math.round((Number(v.cuota ?? 0) - Number(v.importe_cobrado ?? 0)) * 1000) / 1000
                c = { ...c, fecha_vencimiento: v.fecha_vencimiento as string | null }
              }
            }
            c = aplicarDoc(d, { ...c, tienda_terminal_codigo: d.tienda }, importe)
          }
        }
        const nombre = await nombreDe(c.cliente_codigo)
        if (cancel) return
        setVencimiento(venc)
        setCobro(c)
        setOrig(null)
        setMode('alta')
        setNombreCliente(nombre)
        cargarPendientes(c.cliente_codigo)
        setCargando(false)
        return
      }
      let q = supabase.from('cobro_cliente').select(COBRO_COLS)
      if (claveTienda && claveCodigo != null) q = q.eq('tienda_terminal_codigo', claveTienda).eq('codigo_pago', claveCodigo)
      else q = q.eq('activo', true).order('fecha', { ascending: false }).order('codigo_pago', { ascending: false })
      const { data } = await q.limit(1)
      if (cancel) return
      const c = ((data ?? [])[0] as Cobro | undefined) ?? null
      const nombre = await nombreDe(c?.cliente_codigo ?? null)
      if (cancel) return
      setVencimiento(null)
      setCobro(c)
      setOrig(c)
      setMode('consulta')
      setNombreCliente(nombre)
      await cargarInfoDoc(c)
      setPendientes([])
      setCargando(false)
    }
    run()
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params['*'], location.search, tiendas.length])

  function patch(c: Partial<Cobro>) {
    setCobro((p) => (p ? { ...p, ...c } : p))
  }

  const idx = navIndice(nav)
  const totalClaves = nav.total ?? 0
  const irNav = async (d: NavDir) => {
    const k = await nav.ir(d)
    if (k) navigate(`/cobros-clientes/${encodeURIComponent(k.tienda_terminal_codigo)}/${k.codigo_pago}`)
  }

  async function guardar() {
    if (!cobro) return
    setMensaje(null)
    if (mode === 'edicion') {
      setSaving(true)
      try {
        await guardarDatosCobro(cobro)
        setOrig(cobro)
        setMode('consulta')
      } catch (e) {
        setMensaje((e as Error).message)
      }
      setSaving(false)
      return
    }
    if (!doc) return setMensaje('Elige la factura o la venta que se cobra.')
    const importe = Number(cobro.importe_cobrado ?? 0)
    if (!(importe > 0)) return setMensaje('Indica el importe cobrado.')
    if (!cobro.forma_pago_codigo) return setMensaje('Indica la forma de pago.')
    if (importe > doc.pendiente + 0.005) return setMensaje(`El importe supera lo pendiente (${formatGw(doc.pendiente, 2)}).`)
    setSaving(true)
    try {
      const r = await cobrar({
        tienda: cobro.tienda_terminal_codigo,
        clase: doc.clase,
        docTienda: doc.tienda,
        docNumero: doc.numero,
        importe,
        fechaPago: cobro.fecha_pago,
        formaPago: cobro.forma_pago_codigo,
        numeroDocumentoPago: cobro.numero_documento_pago,
        concepto: cobro.concepto,
        cuentaContable: cobro.cuenta_contable,
        vencimiento,
      })
      cargarClaves()
      setSaving(false)
      const codigo = r.codigos[r.codigos.length - 1]
      // Un cobro que salda un vencimiento ya creado se queda con su número (menor): eso no es que
      // otro puesto haya cogido el que se enseñaba.
      const otroPuesto = codigo != null && proximo != null && codigo > proximo ? avisoNumero(codigo, proximo) : null
      const texto = `${otroPuesto ? `${otroPuesto}. ` : ''}Cobrado ${formatGw(r.importe, 2)} €.${r.movimiento != null ? ` Ingreso en caja ${r.tienda}-${r.movimiento}.` : ''} ${r.pendiente > 0.005 ? `Queda pendiente ${formatGw(r.pendiente, 2)} €.` : 'Documento cobrado.'}`
      if (codigo != null) navigate(`/cobros-clientes/${encodeURIComponent(r.tienda)}/${codigo}`, { replace: true, state: { aviso: texto } })
      else setAviso(texto)
    } catch (e) {
      setSaving(false)
      setMensaje((e as Error).message)
    }
  }

  async function eliminar() {
    if (!cobro || cobro.codigo_pago == null) return
    if (cobro.estado_cobro !== 'cobrado') return setMensaje('Solo se anulan cobros cobrados. Un vencimiento pendiente se cobra o se deja.')
    const motivo = prompt(
      `¿Anular el cobro ${cobro.tienda_terminal_codigo}-${cobro.codigo_pago} de ${formatGw(cobro.importe_cobrado ?? 0, 2)} €?\nEl importe vuelve a quedar pendiente en la factura y, si entró en caja, se descuenta.\n\nMotivo:`,
      '',
    )
    if (motivo === null) return
    try {
      const r = await anularCobro(cobro.tienda_terminal_codigo, cobro.codigo_pago, motivo.trim() || null)
      cargarClaves()
      setAviso(`Cobro anulado (${formatGw(r.importe, 2)} €).${r.movimiento_salida != null ? ` Salida de caja ${r.movimiento_salida}.` : ''}`)
      const { data } = await supabase
        .from('cobro_cliente')
        .select(COBRO_COLS)
        .eq('tienda_terminal_codigo', cobro.tienda_terminal_codigo)
        .eq('codigo_pago', cobro.codigo_pago)
        .maybeSingle()
      const c = (data as Cobro | null) ?? null
      setCobro(c)
      setOrig(c)
      await cargarInfoDoc(c)
    } catch (e) {
      setMensaje((e as Error).message)
    }
  }

  const lookupDef = useMemo((): {
    title: string
    table: string
    columns: GwLookupColumn[]
    searchColumns: string[]
    orderBy: string
    keyColumn: string
  } | null => {
    if (lookup === 'cliente')
      return {
        title: 'Clientes',
        table: 'cliente',
        columns: [
          { key: 'codigo', label: 'Código', width: 90 },
          { key: 'nombre', label: 'Nombre' },
          { key: 'nif', label: 'NIF', width: 110 },
        ],
        searchColumns: ['codigo', 'nombre', 'nif'],
        orderBy: 'nombre',
        keyColumn: 'codigo',
      }
    if (lookup === 'factura')
      return {
        title: 'Facturas de clientes',
        table: 'factura',
        columns: [
          { key: 'tienda_terminal_codigo', label: 'Tienda', width: 60 },
          { key: 'numero', label: 'Id.', width: 80 },
          { key: 'serie', label: 'Serie', width: 70 },
          { key: 'n_factura', label: 'Nº Factura', width: 90 },
          { key: 'cliente_codigo', label: 'Cliente', width: 80 },
          { key: 'nombre_cliente', label: 'Nombre' },
          { key: 'total', label: 'Total', width: 90 },
          { key: 'total_pendiente', label: 'Pendiente', width: 90 },
        ],
        searchColumns: ['cliente_codigo', 'nombre_cliente', 'serie'],
        orderBy: 'numero',
        keyColumn: 'numero',
      }
    if (lookup === 'venta')
      return {
        title: 'Ventas',
        table: 'venta',
        columns: [
          { key: 'tienda_terminal_codigo', label: 'Tienda', width: 60 },
          { key: 'numero', label: 'Número', width: 90 },
          { key: 'fecha', label: 'Fecha', width: 100 },
          { key: 'cliente_codigo', label: 'Cliente', width: 80 },
          { key: 'nombre_cliente', label: 'Nombre' },
          { key: 'total', label: 'Total', width: 90 },
          { key: 'total_pendiente', label: 'Pendiente', width: 90 },
        ],
        searchColumns: ['cliente_codigo', 'nombre_cliente'],
        orderBy: 'numero',
        keyColumn: 'numero',
      }
    if (lookup === 'formapago')
      return {
        title: 'Formas de pago',
        table: 'forma_pago',
        columns: [
          { key: 'codigo', label: 'Código', width: 80 },
          { key: 'descripcion', label: 'Descripción' },
        ],
        searchColumns: ['codigo', 'descripcion'],
        orderBy: 'codigo',
        keyColumn: 'codigo',
      }
    return null
  }, [lookup])

  async function elegirDoc(clase: 'factura' | 'venta', tienda: string, numero: number) {
    if (!cobro) return
    const d = await cargarDoc(clase, tienda, numero)
    if (!d) return
    if (d.anulada) return setMensaje(`${d.ref} está anulada: no se puede cobrar.`)
    setMensaje(d.pendiente <= 0.005 ? `${d.clase === 'factura' ? `La factura ${d.ref}` : d.ref} no tiene importe pendiente.` : null)
    setVencimiento(null)
    const c = aplicarDoc(d, cobro)
    setCobro(c)
    setNombreCliente(await nombreDe(c.cliente_codigo))
    cargarPendientes(c.cliente_codigo)
  }

  async function onPick(r: Record<string, unknown>) {
    if (!cobro) return
    const l = lookup
    setLookup(null)
    if (l === 'cliente') {
      const codigo = String(r.codigo)
      setDoc(null)
      setVencimiento(null)
      patch({ cliente_codigo: codigo, factura_tienda_codigo: null, factura_numero: null, venta_relacionada_tienda_codigo: null, venta_relacionada_numero: null })
      setNombreCliente(String(r.nombre ?? ''))
      cargarPendientes(codigo)
    } else if (l === 'factura') await elegirDoc('factura', String(r.tienda_terminal_codigo), Number(r.numero))
    else if (l === 'venta') await elegirDoc('venta', String(r.tienda_terminal_codigo), Number(r.numero))
    else if (l === 'formapago') patch({ forma_pago_codigo: String(r.codigo) })
  }

  if (cargando) return <div className="gw-label p-2">Cargando…</div>

  const c = cobro
  const fp = formas.find((f) => f.codigo === c?.forma_pago_codigo)
  const esContado = fp?.tipo === 4
  const docKey = doc ? claveDoc(doc) : ''
  const pendienteTras = doc && alta ? Math.max(0, Math.round((doc.pendiente - Number(c?.importe_cobrado ?? 0)) * 1000) / 1000) : null
  const anulado = c ? !c.activo || c.estado_cobro === 'anulado' : false

  return (
    <div className="flex h-full min-h-[560px] flex-col gap-1.5 text-[16px]">
      {!c ? (
        <div className="flex-1 p-2">
          <p className="gw-label">No hay cobros registrados. Pulsa «Agregar» para cobrar una factura.</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2 px-1.5" title="PAGOSCLI">
          {/* Fila 1 */}
          <div className="grid grid-cols-[minmax(0,470px)_minmax(0,360px)_minmax(0,1fr)] items-end gap-3">
            <Grupo className="grid grid-cols-[96px_minmax(0,1fr)_minmax(0,170px)] gap-x-1.5">
              <Campo label={<u>T</u>}>
                <span className="hidden">Tienda</span>
                <GwSelect className={I} value={c.tienda_terminal_codigo} disabled={!alta} onChange={(e) => patch({ tienda_terminal_codigo: e.target.value })} title="Tienda donde se registra el cobro (y su caja)">
                  {(tiendas.length ? tiendas : [c.tienda_terminal_codigo]).map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </GwSelect>
              </Campo>
              <Campo label={<><u>N</u>úmero</>}>
                <GwInput
                  className={`${I} gw-num`}
                  readOnly
                  value={c.codigo_pago ?? (alta ? (proximo ?? '') : '')}
                  title="CODPAGO — en alta, el próximo libre; se confirma al guardar (si el cobro salda un vencimiento ya creado, queda con el número de ese vencimiento)"
                />
              </Campo>
              <Campo label="Fecha">
                <GwDate className={I} value={c.fecha} disabled />
              </Campo>
            </Grupo>
            <Grupo title="Tienda y Nº de Factura" apagado={!alta} className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-1.5">
              <GwInput className={I} readOnly value={c.factura_tienda_codigo ?? ''} />
              <span className="flex">
                <GwInput className={`${I} gw-num`} readOnly value={c.factura_numero ?? ''} title="Id. de la factura" />
                <GwLookupButton disabled={!alta} onClick={() => setLookup('factura')} title="Buscar factura de cliente" />
              </span>
            </Grupo>
            <span />
          </div>

          {/* Fila 2 */}
          <div className="grid grid-cols-[minmax(0,370px)_minmax(0,330px)_minmax(0,250px)_minmax(0,1fr)] items-end gap-3">
            <Grupo title="Tienda y Nº de Venta" apagado={!alta} className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-1.5">
              <GwInput className={I} readOnly value={c.venta_relacionada_tienda_codigo ?? ''} />
              <span className="flex">
                <GwInput className={`${I} gw-num`} readOnly value={c.venta_relacionada_numero ?? ''} />
                <GwLookupButton disabled={!alta} onClick={() => setLookup('venta')} title="Buscar venta" />
              </span>
            </Grupo>
            <Campo label="Factura a Cobrar">
              <GwSelect
                className={I}
                value={docKey}
                disabled={!alta || pendientes.length === 0}
                onChange={(e) => {
                  const [clase, t, n] = e.target.value.split('|')
                  if (clase) elegirDoc(clase as 'factura' | 'venta', t, Number(n))
                }}
                title="Facturas y ventas del cliente pendientes de cobro"
              >
                <option value="" />
                {docKey && !pendientes.some((x) => claveDoc(x) === docKey) && doc && <option value={docKey}>{doc.ref}</option>}
                {pendientes.map((x) => (
                  <option key={claveDoc(x)} value={claveDoc(x)}>
                    {x.clase === 'factura' ? `Fra. ${x.ref}` : x.ref} · {formatGw(x.pendiente, 2)}
                  </option>
                ))}
              </GwSelect>
            </Campo>
            <Campo label="Nº Factura">
              <GwInput className={I} readOnly value={c.numero_factura_externo ?? (doc?.clase === 'venta' ? doc.ref : '')} />
            </Campo>
            <Campo label="Total Factura" alinear="right">
              <GwNumber className={I} value={doc ? doc.total : null} decimals={3} />
            </Campo>
          </div>

          {/* Fila 3 */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,290px)] items-end gap-3">
            <Grupo
              title={
                <span>
                  <u>C</u>liente
                </span>
              }
              apagado={!alta}
              className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-1.5"
            >
              <GwInput
                className={I}
                value={c.cliente_codigo ?? ''}
                disabled={!alta}
                title="Código del cliente"
                onChange={(e) => patch({ cliente_codigo: e.target.value || null })}
                onBlur={async (e) => {
                  const v = e.target.value.trim()
                  if (!alta || !v) return
                  const { data } = await supabase.from('cliente').select('nombre').eq('codigo', v).maybeSingle()
                  if (data) {
                    setNombreCliente(data.nombre as string)
                    cargarPendientes(v)
                  }
                }}
              />
              <span className="flex">
                <GwInput className={I} readOnly value={nombreCliente} />
                <GwLookupButton disabled={!alta} onClick={() => setLookup('cliente')} title="Buscar cliente" />
              </span>
            </Grupo>
            <Campo label="Total Cobrado" alinear="right">
              <GwNumber className={I} value={doc ? doc.pagado : null} decimals={3} />
            </Campo>
          </div>

          {/* Fila 4 */}
          <div className="grid grid-cols-[minmax(0,420px)_minmax(0,220px)_minmax(0,165px)_minmax(0,165px)_minmax(0,1fr)] items-end gap-3">
            <Campo label="Forma de pago">
              <span className="flex">
                <GwSelect
                  className={I}
                  value={c.forma_pago_codigo ?? ''}
                  disabled={!alta}
                  onChange={(e) => patch({ forma_pago_codigo: e.target.value || null })}
                  title="FORMAPAGO — si es de contado, el cobro entra como ingreso en la caja abierta"
                >
                  <option value="" />
                  {formas.map((f) => (
                    <option key={f.codigo} value={f.codigo}>
                      {f.descripcion.toUpperCase()}
                    </option>
                  ))}
                </GwSelect>
                <GwLookupButton disabled={!alta} onClick={() => setLookup('formapago')} title="Buscar forma de pago" />
              </span>
            </Campo>
            <Campo label={alta ? 'Pendiente' : 'Cuota del pago'}>
              <GwNumber className={I} value={alta ? (doc ? doc.pendiente : null) : c.cuota} decimals={3} />
            </Campo>
            <Campo label="Fecha venc.">
              <GwDate className={I} value={c.fecha_vencimiento} disabled={!(mode === 'edicion' && c.estado_cobro === 'pendiente')} onChange={(v) => patch({ fecha_vencimiento: v })} />
            </Campo>
            <Campo label="Fecha pago">
              <GwDate className={I} value={c.fecha_pago} disabled={!alta} onChange={(v) => patch({ fecha_pago: v })} />
            </Campo>
            <Campo label="Cobrado" alinear="right">
              <GwNumber className={I} value={c.importe_cobrado} decimals={3} disabled={!alta} onChange={(v) => patch({ importe_cobrado: v })} />
            </Campo>
          </div>

          {/* Fila 5 */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,210px)] items-end gap-3">
            <Campo label="Concepto">
              <GwInput className={I} value={c.concepto ?? ''} disabled={!editable} onChange={(e) => patch({ concepto: e.target.value || null })} />
            </Campo>
            <Campo label="Estado del pago">
              <GwSelect className={I} value={anulado ? 'anulado' : (c.estado_cobro ?? '')} disabled title="Lo pone el sistema al cobrar o anular">
                {ESTADOS_COBRO.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </GwSelect>
            </Campo>
          </div>

          {/* Fila 6 */}
          <div className="grid grid-cols-[minmax(0,260px)_minmax(0,180px)_minmax(0,275px)_minmax(0,1fr)] items-end gap-3">
            <Campo label="Pendiente tras el cobro">
              <GwNumber className={I} value={pendienteTras ?? (doc ? doc.pendiente : null)} decimals={3} />
            </Campo>
            <Campo label="Fecha Factura">
              <GwDate className={I} value={doc?.fecha ?? null} disabled />
            </Campo>
            <Campo label="Nº Talón, Cheque,etc.">
              <GwInput className={I} value={c.numero_documento_pago ?? ''} disabled={!editable} onChange={(e) => patch({ numero_documento_pago: e.target.value || null })} />
            </Campo>
            <Grupo title="Cuenta Contable" className="grid grid-cols-2 gap-x-3 pt-1">
              <GwInput className={I} value={c.cuenta_contable ?? ''} disabled={!editable} onChange={(e) => patch({ cuenta_contable: e.target.value || null })} title="Cuenta de cobro (vacío = la de la configuración contable)" />
              <span className="self-center truncate text-[14px] text-[#1a4fd0]">{c.tipo_pago ?? ''}</span>
            </Grupo>
          </div>

          <div className="flex items-center gap-6">
            <GwCheck
              className="!text-[18px]"
              label={<span className="text-[18px]">No pasar a contabilidad este Pago</span>}
              checked={!c.contabilizado}
              disabled={!editable}
              onChange={(v) => patch({ contabilizado: !v })}
            />
            {alta && esContado && <span className="gw-label text-[#1a4fd0]">Forma de pago de contado: el cobro entra como ingreso en la caja abierta de la tienda {c.tienda_terminal_codigo}.</span>}
            {c.movimiento_numero != null && (
              <span className="gw-label text-[#1a4fd0]">
                Movimiento de caja {c.movimiento_tienda_codigo}-{c.movimiento_numero}
              </span>
            )}
            {mode === 'consulta' && c.estado_cobro === 'pendiente' && c.activo && doc && (
              <button
                type="button"
                className="gw-btn flex items-center gap-1.5 !text-[16px]"
                onClick={() => navigate(`/cobros-clientes/nuevo?${doc.clase}=${encodeURIComponent(doc.tienda)}-${doc.numero}&vencimiento=${encodeURIComponent(c.tienda_terminal_codigo)}-${c.codigo_pago}`)}
              >
                <HandCoins size={16} className="text-[#127a12]" /> Cobrar este vencimiento
              </button>
            )}
            {anulado && <span className="gw-label font-bold text-[#c42b1c]">COBRO ANULADO</span>}
          </div>
        </div>
      )}

      {aviso && !mensaje && <p className="gw-label px-1.5 text-[#127a12]">{aviso}</p>}
      {mensaje && <p className="gw-label px-1.5 text-[#c42b1c]">{mensaje}</p>}

      <PagosBar
        mode={mode}
        canNavigate={mode === 'consulta' && idx >= 0}
        saving={saving}
        onFirst={() => irNav('primero')}
        onPrev={() => idx > 0 && irNav('anterior')}
        onNext={() => idx >= 0 && idx < totalClaves - 1 && irNav('siguiente')}
        onLast={() => irNav('ultimo')}
        onPrint={() => window.print()}
        onNew={() => navigate('/cobros-clientes/nuevo')}
        onEdit={() => c && !anulado && setMode('edicion')}
        onDelete={eliminar}
        onSave={guardar}
        onCancel={() => {
          setMensaje(null)
          if (mode === 'alta') navigate(-1)
          else {
            setCobro(orig)
            setMode('consulta')
          }
        }}
        onExit={() => navigate('/')}
      />

      {lookupDef && (
        <GwLookupDialog<Record<string, unknown>>
          title={lookupDef.title}
          table={lookupDef.table}
          columns={lookupDef.columns}
          searchColumns={lookupDef.searchColumns}
          orderBy={lookupDef.orderBy}
          keyColumn={lookupDef.keyColumn}
          onPick={onPick}
          onClose={() => setLookup(null)}
        />
      )}
    </div>
  )
}
