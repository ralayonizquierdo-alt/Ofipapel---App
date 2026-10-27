import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwDate, GwInput, GwLookupButton, GwNumber, GwRadio, GwSelect, formatGw } from '../../../components/gw'
import { GwLookupDialog, type GwLookupColumn } from '../../../components/gw/GwLookupDialog'
import { PagosBar } from './PagosBar'
import {
  ESTADOS_PAGO,
  FORMA_PAGO_COLS,
  PAGO_COLS,
  RECEPTORES,
  cargarDoc,
  eliminarPago,
  guardarPago,
  totalPagadoDoc,
  vacio,
  type DocPago,
  type FormaPago,
  type Pago,
} from './pagosModel'

// Ficha «Pagos de Gastos, pagos a proveedores, pagos a transportistas, etc» (Compras → Pagos,
// o botón Pagos del pedido a proveedor en GeminisWin). Tabla PAGOSGST → pago_proveedor.

const L = 'text-[18px] leading-[20px] whitespace-nowrap'
const I = '!h-[30px] !text-[16px]'

type Lookup = 'receptor' | 'pedido' | 'factura' | 'nfactura' | 'formapago' | null

interface Pendiente {
  key: string
  texto: string
}

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

export function PagoProveedorFichaPage() {
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const ruta = (params['*'] ?? '').split('/').filter(Boolean)
  const esNuevo = ruta[0] === 'nuevo'
  const claveTienda = !esNuevo && ruta.length >= 2 ? decodeURIComponent(ruta[0]) : null
  const claveCodigo = !esNuevo && ruta.length >= 2 ? Number(ruta[1]) : null

  const [tiendas, setTiendas] = useState<string[]>([])
  const [formas, setFormas] = useState<FormaPago[]>([])
  const [empleado, setEmpleado] = useState<string | null>(null)
  const [claves, setClaves] = useState<{ t: string; n: number }[]>([])
  const [pago, setPago] = useState<Pago | null>(null)
  const [orig, setOrig] = useState<Pago | null>(null)
  const [mode, setMode] = useState<'consulta' | 'edicion' | 'alta'>('consulta')
  const [cargando, setCargando] = useState(true)
  const [saving, setSaving] = useState(false)
  const [mensaje, setMensaje] = useState<string | null>(null)
  const [doc, setDoc] = useState<DocPago | null>(null)
  const [pagadoDoc, setPagadoDoc] = useState<number | null>(null)
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [lookup, setLookup] = useState<Lookup>(null)

  const editable = mode !== 'consulta'
  const fp = formas.find((f) => f.codigo === pago?.forma_pago_codigo)

  useEffect(() => {
    Promise.all([
      supabase.from('tienda_terminal').select('codigo').order('codigo'),
      supabase.from('forma_pago').select(FORMA_PAGO_COLS).order('codigo'),
      supabase.rpc('fn_empleado_actual'),
    ]).then(([t, f, e]) => {
      setTiendas((t.data ?? []).map((r) => r.codigo as string))
      setFormas((f.data ?? []) as FormaPago[])
      setEmpleado((e.data as string | null) ?? null)
    })
  }, [])

  const cargarClaves = useCallback(async () => {
    const { data } = await supabase
      .from('pago_proveedor')
      .select('tienda_terminal_codigo, codigo_pago')
      .eq('activo', true)
      .order('tienda_terminal_codigo')
      .order('codigo_pago')
      .limit(10000)
    setClaves((data ?? []).map((r) => ({ t: r.tienda_terminal_codigo as string, n: Number(r.codigo_pago) })))
  }, [])

  useEffect(() => {
    cargarClaves()
  }, [cargarClaves])

  const cargarInfoDoc = useCallback(async (p: Pago | null) => {
    setDoc(null)
    setPagadoDoc(null)
    if (!p) return
    let d: DocPago | null = null
    if (p.factura_relacionada_tienda_codigo && p.factura_relacionada_id != null)
      d = await cargarDoc('factura', p.factura_relacionada_tienda_codigo, p.factura_relacionada_id)
    else if (p.pedido_relacionado_tienda_codigo && p.pedido_relacionado_numero != null)
      d = await cargarDoc('pedido', p.pedido_relacionado_tienda_codigo, p.pedido_relacionado_numero)
    setDoc(d)
    if (d) setPagadoDoc((await totalPagadoDoc(d.clase, d.tienda, d.numero)).total)
  }, [])

  const cargarPendientes = useCallback(async (receptor: string | null, tipo: number | null) => {
    if (!receptor || tipo !== 1) {
      setPendientes([])
      return
    }
    const [{ data: peds }, { data: facts }] = await Promise.all([
      supabase
        .from('pedido_proveedor')
        .select('tienda_terminal_codigo, numero, numero_factura_proveedor_externo, total, total_a_pagar_proveedor')
        .eq('proveedor_codigo', receptor)
        .eq('pagado', false)
        .order('numero', { ascending: false })
        .limit(100),
      supabase
        .from('factura_proveedor')
        .select('tienda_terminal_codigo, id, numero_factura_externo, total, total_a_pagar_proveedor')
        .eq('proveedor_codigo', receptor)
        .eq('pagado', false)
        .order('id', { ascending: false })
        .limit(100),
    ])
    setPendientes([
      ...(facts ?? []).map((f) => ({
        key: `factura|${f.tienda_terminal_codigo}|${f.id}`,
        texto: `Fact. prov. ${f.tienda_terminal_codigo}-${f.id} ${f.numero_factura_externo ?? ''} · ${formatGw(Number(f.total_a_pagar_proveedor ?? f.total ?? 0), 3)}`,
      })),
      ...(peds ?? []).map((p) => ({
        key: `pedido|${p.tienda_terminal_codigo}|${p.numero}`,
        texto: `Pedido ${p.tienda_terminal_codigo}-${p.numero} ${p.numero_factura_proveedor_externo ?? ''} · ${formatGw(Number(p.total_a_pagar_proveedor ?? p.total ?? 0), 3)}`,
      })),
    ])
  }, [])

  /** Aplica un documento (pedido o factura de proveedor) al pago: receptor, factura, importes. */
  const aplicarDoc = useCallback(
    async (clase: 'pedido' | 'factura', tienda: string, numero: number, base: Pago) => {
      const d = await cargarDoc(clase, tienda, numero)
      if (!d) return base
      const { total: ya } = await totalPagadoDoc(clase, tienda, numero)
      const { data: prov } = await supabase
        .from('proveedor')
        .select('nombre, nif, forma_pago_codigo, cuenta_contable_400, cuenta_contable_572')
        .eq('codigo', d.proveedor_codigo)
        .maybeSingle()
      const resto = Math.max(0, Math.round((d.total - ya) * 1000) / 1000)
      setDoc(d)
      setPagadoDoc(ya)
      return {
        ...base,
        tipo_receptor: 1,
        receptor_codigo: d.proveedor_codigo,
        receptor_nombre: (prov?.nombre as string | undefined) ?? base.receptor_nombre,
        receptor_dni: (prov?.nif as string | undefined) ?? base.receptor_dni,
        numero_factura_externa: d.numero_factura,
        fecha_factura: d.fecha_factura,
        fecha_vencimiento: d.fecha_vencimiento ?? base.fecha_vencimiento,
        forma_pago_codigo: d.forma_pago_codigo ?? (prov?.forma_pago_codigo as string | null) ?? base.forma_pago_codigo,
        cuota: resto,
        importe_pagado: resto,
        cuenta_contable: (prov?.cuenta_contable_400 as string | null) ?? base.cuenta_contable,
        cuenta_contrapartida: (prov?.cuenta_contable_572 as string | null) ?? base.cuenta_contrapartida,
        concepto: base.concepto ?? `Pago ${clase === 'pedido' ? 'Pedido' : 'Factura'} ${tienda}-${numero}${d.numero_factura ? ` Fact. ${d.numero_factura}` : ''}`,
        pedido_relacionado_tienda_codigo: clase === 'pedido' ? tienda : null,
        pedido_relacionado_numero: clase === 'pedido' ? numero : null,
        factura_relacionada_tienda_codigo: clase === 'factura' ? tienda : null,
        factura_relacionada_id: clase === 'factura' ? numero : null,
      }
    },
    [],
  )

  // Carga: el pago de la URL, el último si no hay ninguno, o uno vacío en alta (?pedido=TT-N / ?factura=TT-ID).
  useEffect(() => {
    let cancel = false
    async function run() {
      setCargando(true)
      setMensaje(null)
      if (esNuevo) {
        const qs = new URLSearchParams(location.search)
        let p = vacio(tiendas[0] ?? '01')
        const ped = qs.get('pedido')
        const fac = qs.get('factura')
        const [ct, cn] = (ped ?? fac ?? '').split('-')
        if (ct && cn) p = await aplicarDoc(ped ? 'pedido' : 'factura', ct, Number(cn), p)
        else {
          setDoc(null)
          setPagadoDoc(null)
        }
        if (cancel) return
        setPago(p)
        setOrig(null)
        setMode('alta')
        cargarPendientes(p.receptor_codigo, p.tipo_receptor)
        setCargando(false)
        return
      }
      let q = supabase.from('pago_proveedor').select(PAGO_COLS)
      if (claveTienda && claveCodigo != null) q = q.eq('tienda_terminal_codigo', claveTienda).eq('codigo_pago', claveCodigo)
      else q = q.eq('activo', true).order('fecha', { ascending: false }).order('codigo_pago', { ascending: false })
      const { data } = await q.limit(1)
      if (cancel) return
      const p = ((data ?? [])[0] as Pago | undefined) ?? null
      setPago(p)
      setOrig(p)
      setMode('consulta')
      await cargarInfoDoc(p)
      cargarPendientes(p?.receptor_codigo ?? null, p?.tipo_receptor ?? null)
      setCargando(false)
    }
    run()
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params['*'], location.search, tiendas.length])

  function patch(c: Partial<Pago>) {
    setPago((p) => (p ? { ...p, ...c } : p))
  }

  const idx = pago && pago.codigo_pago != null ? claves.findIndex((k) => k.t === pago.tienda_terminal_codigo && k.n === pago.codigo_pago) : -1
  const ir = (k?: { t: string; n: number }) => k && navigate(`/pagos-proveedor/${encodeURIComponent(k.t)}/${k.n}`)

  async function guardar() {
    if (!pago) return
    if (!pago.receptor_nombre && !pago.concepto) {
      setMensaje('Indica el receptor del pago o el concepto.')
      return
    }
    if (pago.estado_pago === 'pagado' && !(Number(pago.importe_pagado ?? 0) > 0)) {
      setMensaje('Un pago en estado «Pagado» necesita un importe pagado.')
      return
    }
    setSaving(true)
    setMensaje(null)
    try {
      const codigo = await guardarPago(pago, fp, empleado, orig)
      await cargarClaves()
      setSaving(false)
      navigate(`/pagos-proveedor/${encodeURIComponent(pago.tienda_terminal_codigo)}/${codigo}`, { replace: true })
      if (mode === 'edicion') {
        const { data } = await supabase
          .from('pago_proveedor')
          .select(PAGO_COLS)
          .eq('tienda_terminal_codigo', pago.tienda_terminal_codigo)
          .eq('codigo_pago', codigo)
          .maybeSingle()
        const p = (data as Pago | null) ?? pago
        setPago(p)
        setOrig(p)
        setMode('consulta')
        await cargarInfoDoc(p)
      }
    } catch (e) {
      setSaving(false)
      setMensaje((e as Error).message)
    }
  }

  async function eliminar() {
    if (!pago || pago.codigo_pago == null) return
    if (!confirm(`¿Eliminar el pago ${pago.tienda_terminal_codigo}-${pago.codigo_pago}? Queda anulado y, si generó un gasto de caja, ese gasto pasa a 0.`)) return
    try {
      await eliminarPago(pago)
      await cargarClaves()
      navigate('/pagos-proveedor', { replace: true })
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
    if (lookup === 'receptor') {
      const tabla = pago?.tipo_receptor === 2 ? 'transportista' : 'proveedor'
      return {
        title: pago?.tipo_receptor === 2 ? 'Transportistas' : 'Proveedores',
        table: tabla,
        columns: [
          { key: 'codigo', label: 'Código', width: 90 },
          { key: 'nombre', label: 'Nombre' },
          { key: 'nif', label: 'NIF', width: 110 },
        ],
        searchColumns: ['codigo', 'nombre', 'nif'],
        orderBy: 'nombre',
        keyColumn: 'codigo',
      }
    }
    if (lookup === 'pedido' || lookup === 'nfactura')
      return {
        title: 'Pedidos y albaranes de proveedor',
        table: 'pedido_proveedor',
        columns: [
          { key: 'tienda_terminal_codigo', label: 'Tienda', width: 60 },
          { key: 'numero', label: 'Número', width: 90 },
          { key: 'numero_factura_proveedor_externo', label: 'Nº Factura', width: 130 },
          { key: 'proveedor_codigo', label: 'Proveedor', width: 90 },
          { key: 'total', label: 'Total', width: 100 },
        ],
        searchColumns: ['numero_factura_proveedor_externo', 'proveedor_codigo', 'numero_albaran_proveedor'],
        orderBy: 'numero',
        keyColumn: 'numero',
      }
    if (lookup === 'factura')
      return {
        title: 'Facturas de proveedor',
        table: 'factura_proveedor',
        columns: [
          { key: 'tienda_terminal_codigo', label: 'Tienda', width: 60 },
          { key: 'id', label: 'Id', width: 80 },
          { key: 'numero_factura_externo', label: 'Nº Factura', width: 130 },
          { key: 'proveedor_codigo', label: 'Proveedor', width: 90 },
          { key: 'total', label: 'Total', width: 100 },
        ],
        searchColumns: ['numero_factura_externo', 'proveedor_codigo'],
        orderBy: 'id',
        keyColumn: 'id',
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
  }, [lookup, pago?.tipo_receptor])

  async function onPick(r: Record<string, unknown>) {
    if (!pago) return
    const l = lookup
    setLookup(null)
    if (l === 'receptor') {
      const p = { ...pago, receptor_codigo: String(r.codigo), receptor_nombre: String(r.nombre ?? ''), receptor_dni: (r.nif as string | null) ?? null }
      setPago(p)
      cargarPendientes(p.receptor_codigo, p.tipo_receptor)
    } else if (l === 'pedido' || l === 'nfactura') {
      const p = await aplicarDoc('pedido', String(r.tienda_terminal_codigo), Number(r.numero), pago)
      setPago(p)
      cargarPendientes(p.receptor_codigo, p.tipo_receptor)
    } else if (l === 'factura') {
      const p = await aplicarDoc('factura', String(r.tienda_terminal_codigo), Number(r.id), pago)
      setPago(p)
      cargarPendientes(p.receptor_codigo, p.tipo_receptor)
    } else if (l === 'formapago') patch({ forma_pago_codigo: String(r.codigo) })
  }

  async function elegirPendiente(key: string) {
    if (!pago || !key) return
    const [clase, t, n] = key.split('|')
    setPago(await aplicarDoc(clase as 'pedido' | 'factura', t, Number(n), pago))
  }

  if (cargando) return <div className="gw-label p-2">Cargando…</div>

  const p = pago
  const docKey = p?.factura_relacionada_id != null
    ? `factura|${p.factura_relacionada_tienda_codigo}|${p.factura_relacionada_id}`
    : p?.pedido_relacionado_numero != null
      ? `pedido|${p.pedido_relacionado_tienda_codigo}|${p.pedido_relacionado_numero}`
      : ''
  const totalPagadoMostrado = pagadoDoc != null ? pagadoDoc : null

  return (
    <div className="flex h-full min-h-[560px] flex-col gap-1.5 text-[16px]">
      {!p ? (
        <div className="flex-1 p-2">
          <p className="gw-label">No hay pagos registrados. Pulsa «Agregar» para dar de alta el primero.</p>
        </div>
      ) : (
        <div className="flex flex-1 flex-col gap-2 px-1.5" title="PAGOSGST">
          {/* Fila 1 */}
          <div className="grid grid-cols-[minmax(0,470px)_minmax(0,360px)_minmax(0,1fr)] items-end gap-3">
            <Grupo className="grid grid-cols-[96px_minmax(0,1fr)_minmax(0,170px)] gap-x-1.5">
              <Campo label={<u>T</u>}>
                <span className="hidden">Tienda</span>
                <GwSelect
                  className={I}
                  value={p.tienda_terminal_codigo}
                  disabled={mode !== 'alta'}
                  onChange={(e) => patch({ tienda_terminal_codigo: e.target.value })}
                >
                  {(tiendas.length ? tiendas : [p.tienda_terminal_codigo]).map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </GwSelect>
              </Campo>
              <Campo label={<><u>N</u>úmero</>}>
                <GwInput className={`${I} gw-num`} readOnly value={p.codigo_pago ?? ''} title="CODPAGO — se asigna al guardar" />
              </Campo>
              <Campo label="Fecha">
                <GwDate className={I} value={p.fecha} disabled={!editable} onChange={(v) => patch({ fecha: v })} />
              </Campo>
            </Grupo>
            <Grupo title="Tienda y Nº Fact. proveedor" apagado={!editable} className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-1.5">
              <GwInput className={I} readOnly value={p.factura_relacionada_tienda_codigo ?? ''} />
              <span className="flex">
                <GwInput className={`${I} gw-num`} readOnly value={p.factura_relacionada_id ?? ''} />
                <GwLookupButton disabled={!editable} onClick={() => setLookup('factura')} title="Buscar factura de proveedor" />
              </span>
            </Grupo>
            <span />
          </div>

          {/* Fila 2 */}
          <div className="grid grid-cols-[minmax(0,370px)_minmax(0,330px)_minmax(0,250px)_minmax(0,1fr)] items-end gap-3">
            <Grupo title="Tienda y Nº de Pedido" apagado={!editable} className="grid grid-cols-[96px_minmax(0,1fr)] gap-x-1.5">
              <GwInput className={I} readOnly value={p.pedido_relacionado_tienda_codigo ?? ''} />
              <span className="flex">
                <GwInput className={`${I} gw-num`} readOnly value={p.pedido_relacionado_numero ?? ''} />
                <GwLookupButton disabled={!editable} onClick={() => setLookup('pedido')} title="Buscar pedido de proveedor" />
              </span>
            </Grupo>
            <Campo label="Factura a Pagar">
              <GwSelect className={I} value={docKey} disabled={!editable || pendientes.length === 0} onChange={(e) => elegirPendiente(e.target.value)} title="Documentos pendientes de pago del proveedor">
                <option value="">{doc ? '' : ''}</option>
                {docKey && !pendientes.some((x) => x.key === docKey) && <option value={docKey}>{docKey.replaceAll('|', ' ')}</option>}
                {pendientes.map((x) => (
                  <option key={x.key} value={x.key}>
                    {x.texto}
                  </option>
                ))}
              </GwSelect>
            </Campo>
            <Campo label="Nº Factura">
              <span className="flex">
                <GwInput
                  className={I}
                  value={p.numero_factura_externa ?? ''}
                  disabled={!editable}
                  onChange={(e) => patch({ numero_factura_externa: e.target.value || null })}
                />
                <GwLookupButton disabled={!editable} onClick={() => setLookup('nfactura')} title="Buscar por nº de factura" />
              </span>
            </Campo>
            <Campo label="Total Factura" alinear="right">
              <GwNumber className={I} value={doc ? doc.total : null} decimals={3} />
            </Campo>
          </div>

          {/* Fila 3 */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,290px)] items-end gap-3">
            <Grupo
              title={
                <span className="flex items-center gap-6">
                  <span>
                    <u>R</u>eceptor:
                  </span>
                  {RECEPTORES.map((r) => (
                    <span key={r.value} className="text-[18px]">
                      <GwRadio
                        name="receptor"
                        label={<span className="text-[18px]"><u>{r.label[0]}</u>{r.label.slice(1)}</span>}
                        checked={p.tipo_receptor === r.value}
                        disabled={!editable}
                        onChange={() => {
                          patch({ tipo_receptor: r.value })
                          cargarPendientes(p.receptor_codigo, r.value)
                        }}
                      />
                    </span>
                  ))}
                </span>
              }
              className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-1.5"
            >
              <GwInput
                className={I}
                value={p.receptor_codigo ?? ''}
                disabled={!editable || p.tipo_receptor === 3 || p.tipo_receptor === 4}
                title="Código del receptor"
                onChange={(e) => patch({ receptor_codigo: e.target.value || null })}
                onBlur={async (e) => {
                  const c = e.target.value.trim()
                  if (!editable || !c || (p.tipo_receptor !== 1 && p.tipo_receptor !== 2)) return
                  const { data } = await supabase.from(p.tipo_receptor === 2 ? 'transportista' : 'proveedor').select('nombre, nif').eq('codigo', c).maybeSingle()
                  if (data) {
                    patch({ receptor_nombre: data.nombre as string, receptor_dni: (data.nif as string | null) ?? p.receptor_dni })
                    cargarPendientes(c, p.tipo_receptor)
                  }
                }}
              />
              <span className="flex">
                <GwInput
                  className={I}
                  value={p.receptor_nombre ?? ''}
                  disabled={!editable}
                  onChange={(e) => patch({ receptor_nombre: e.target.value || null })}
                />
                <GwLookupButton
                  disabled={!editable || p.tipo_receptor === 3 || p.tipo_receptor === 4}
                  onClick={() => setLookup('receptor')}
                  title="Buscar receptor"
                />
              </span>
            </Grupo>
            <Campo label="Total Pagado" alinear="right">
              <GwNumber className={I} value={totalPagadoMostrado} decimals={3} />
            </Campo>
          </div>

          {/* Fila 4 */}
          <div className="grid grid-cols-[minmax(0,420px)_minmax(0,220px)_minmax(0,165px)_minmax(0,165px)_minmax(0,1fr)] items-end gap-3">
            <Campo label="Forma de pago">
              <span className="flex">
                <GwSelect
                  className={I}
                  value={p.forma_pago_codigo ?? ''}
                  disabled={!editable}
                  onChange={(e) => patch({ forma_pago_codigo: e.target.value || null })}
                  title="FORMAPAGO — si es de contado, el pago genera un gasto en caja"
                >
                  <option value="" />
                  {formas.map((f) => (
                    <option key={f.codigo} value={f.codigo}>
                      {f.descripcion.toUpperCase()}
                    </option>
                  ))}
                </GwSelect>
                <GwLookupButton disabled={!editable} onClick={() => setLookup('formapago')} title="Buscar forma de pago" />
              </span>
            </Campo>
            <Campo label="Cuota del pago">
              <GwNumber className={I} value={p.cuota} decimals={3} disabled={!editable} onChange={(v) => patch({ cuota: v })} />
            </Campo>
            <Campo label="Fecha venc.">
              <GwDate className={I} value={p.fecha_vencimiento} disabled={!editable} onChange={(v) => patch({ fecha_vencimiento: v })} />
            </Campo>
            <Campo label="Fecha pago">
              <GwDate className={I} value={p.fecha_pago} disabled={!editable} onChange={(v) => patch({ fecha_pago: v })} />
            </Campo>
            <Campo label="Pagado" alinear="right">
              <GwNumber className={I} value={p.importe_pagado} decimals={3} disabled={!editable} onChange={(v) => patch({ importe_pagado: v })} />
            </Campo>
          </div>

          {/* Fila 5 */}
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,210px)] items-end gap-3">
            <Campo label="Concepto">
              <GwInput className={I} value={p.concepto ?? ''} disabled={!editable} onChange={(e) => patch({ concepto: e.target.value || null })} />
            </Campo>
            <Campo label="Estado del pago">
              <GwSelect className={I} value={p.estado_pago ?? ''} disabled={!editable} onChange={(e) => patch({ estado_pago: e.target.value || null })}>
                {ESTADOS_PAGO.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </GwSelect>
            </Campo>
          </div>

          {/* Fila 6 */}
          <div className="grid grid-cols-[minmax(0,260px)_minmax(0,180px)_minmax(0,275px)_minmax(0,1fr)] items-end gap-3">
            <Campo label="DNI / CIF">
              <GwInput className={I} value={p.receptor_dni ?? ''} disabled={!editable} onChange={(e) => patch({ receptor_dni: e.target.value || null })} />
            </Campo>
            <Campo label="Fecha Factura">
              <GwDate className={I} value={p.fecha_factura} disabled={!editable} onChange={(v) => patch({ fecha_factura: v })} />
            </Campo>
            <Campo label="Nº Talón, Cheque,etc.">
              <GwInput className={I} value={p.numero_documento_pago ?? ''} disabled={!editable} onChange={(e) => patch({ numero_documento_pago: e.target.value || null })} />
            </Campo>
            <Grupo title="Cuentas Contables, Partida y Contra" className="grid grid-cols-2 gap-x-3 pt-1">
              <GwInput className={I} value={p.cuenta_contable ?? ''} disabled={!editable} onChange={(e) => patch({ cuenta_contable: e.target.value || null })} title="Cuenta (partida)" />
              <GwInput className={I} value={p.cuenta_contrapartida ?? ''} disabled={!editable} onChange={(e) => patch({ cuenta_contrapartida: e.target.value || null })} title="Contrapartida" />
            </Grupo>
          </div>

          <GwCheck
            className="!text-[18px]"
            label={<span className="text-[18px]">No pasar a contabilidad este Pago</span>}
            checked={!p.contabilizado}
            disabled={!editable}
            onChange={(v) => patch({ contabilizado: !v })}
          />
          {p.movimiento_numero != null && (
            <span className="gw-label text-[#1a4fd0]">
              Movimiento de caja {p.movimiento_tienda_codigo}-{p.movimiento_numero}
            </span>
          )}
        </div>
      )}

      {mensaje && <p className="gw-label px-1.5 text-[#c42b1c]">{mensaje}</p>}

      <PagosBar
        mode={mode}
        canNavigate={mode === 'consulta' && idx >= 0}
        saving={saving}
        onFirst={() => ir(claves[0])}
        onPrev={() => idx > 0 && ir(claves[idx - 1])}
        onNext={() => idx >= 0 && idx < claves.length - 1 && ir(claves[idx + 1])}
        onLast={() => ir(claves[claves.length - 1])}
        onPrint={() => window.print()}
        onNew={() => navigate('/pagos-proveedor/nuevo')}
        onEdit={() => p && setMode('edicion')}
        onDelete={eliminar}
        onSave={guardar}
        onCancel={() => {
          setMensaje(null)
          if (mode === 'alta') navigate('/pagos-proveedor', { replace: true })
          else {
            setPago(orig)
            setMode('consulta')
            cargarInfoDoc(orig)
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
