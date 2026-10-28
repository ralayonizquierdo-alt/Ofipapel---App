import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { ahoraTrabajo } from '../../lib/sesionTrabajo'
import { GwInput, GwLookupButton, GwNumber, GwSelect, formatGw } from '../../components/gw'
import { GwRecordBar } from '../../components/gw/GwRecordBar'
import { useNavRegistro, type NavDir } from '../../components/gw/useNavRegistro'
import { todasLasFilas } from '../../lib/todasLasFilas'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { GwCampoBusqueda } from '../../components/gw/GwCampoBusqueda'
import { useListaOrdenada, type GwListaOrdenadaDef } from '../../components/gw/GwListaOrdenada'
import { Campo, Grupo, I, L } from './piezasCaja'
import {
  MOV_COLS,
  cajaAbiertaDe,
  cargarMaestrosCaja,
  errorTexto,
  fechaGw,
  fechaHoraGw,
  nombreEmpleado,
  r3,
  recordarTiendaPuesto,
  textoDocumento,
  tiendaPuesto,
  totalesCaja,
  totalesGuardados,
  type CajaApertura,
  type FormaPagoCaja,
  type MovimientoCaja,
  type TiendaCaja,
  type TotalesCaja,
} from './cajaModel'

// Caja → Aperturas y Cierres (y Apertura de Caja / Cierre de Caja), calcada de la ventana
// «Aperturas y Cierres de Caja» de GeminisWin (CAJACIER → caja_apertura_cierre).
// - Nuevo = Apertura de Caja: fondo inicial; el Número se asigna al guardar (fn_caja_abrir).
//   Solo puede haber una caja abierta por tienda/terminal (índice único en BD).
// - Cierre de Caja (?cerrar=1): se teclea el Total Arqueo (efectivo contado) y el Fondo al
//   Cierre; Sobrante = arqueo − (fondo de apertura + efectivo neto); Efectivo Retirado =
//   arqueo − fondo al cierre. Aceptar cierra la caja con los totales (fn_caja_cerrar).
// - Con la caja abierta los totales se calculan en vivo (fn_caja_totales), como en GeminisWin.

type Modo = 'consulta' | 'edicion' | 'alta' | 'cierre'

const COLS = 'tienda_terminal_codigo, ejercicio, fecha_apertura, fecha_cierre, cerrado, empleado_apertura_codigo, empleado_cierre_codigo, fondo_inicial, total_ingreso, total_gasto, total_contado, total_bancos, total_efectos, total_credito, total_efectivo, total_tarjeta, total_cheque, total_ejercicio, total_arqueo, sobrante, total_a_retirar, fondo_final, gasto_bancos, gasto_efectos, gasto_credito, gasto_contado, gasto_efectivo, gasto_tarjeta, gasto_cheque, efectos_pend_cobros_ejercicio, efectos_pend_pagos_ejercicio, efectos_pend_cobros_cierre, efectos_pend_pagos_cierre'

const LISTA_CAJAS: GwListaOrdenadaDef = {
  fuente: 'caja_apertura_cierre',
  campo: 'ejercicio',
  etiqueta: 'Número',
  que: 'Aperturas y cierres de caja',
  rpc: 'gw_lista_ordenada_caja',
  numerico: true,
  columnas: [
    { key: 'tienda_terminal_codigo', label: 'Tienda', width: 70 },
    { key: 'ejercicio', label: 'Número', width: 90 },
    { key: 'fecha_apertura', label: 'Fecha Apertura', width: 160 },
    { key: 'fecha_cierre', label: 'Fecha Cierre', width: 160 },
    { key: 'estado', label: 'Estado', width: 90 },
    { key: 'fondo_inicial', label: 'Fondo Apertura', decimales: 3 },
  ],
}

const LISTA_EMPLEADO: GwListaOrdenadaDef = {
  fuente: 'empleado',
  campo: 'codigo',
  etiqueta: 'Empleado',
  que: 'Empleados',
  rpc: 'gw_lista_ordenada_caja',
  columnas: [
    { key: 'codigo', label: 'Código', width: 120 },
    { key: 'nombre', label: 'Nombre' },
  ],
}

const CERO: TotalesCaja = {
  movimientos: 0,
  ing_bancos: 0,
  ing_efectos: 0,
  ing_credito: 0,
  ing_contado: 0,
  ing_total: 0,
  gas_bancos: 0,
  gas_efectos: 0,
  gas_credito: 0,
  gas_contado: 0,
  gas_total: 0,
  ing_efectivo: 0,
  ing_tarjeta: 0,
  ing_cheque: 0,
  gas_efectivo: 0,
  gas_tarjeta: 0,
  gas_cheque: 0,
  ventas_credito: 0,
  efp_cobros_ejercicio: 0,
  efp_pagos_ejercicio: 0,
  efp_cobros_cierre: 0,
  efp_pagos_cierre: 0,
  fondo_inicial: 0,
  efectivo_teorico: 0,
}

function Num({ v, editar, className = '' }: { v: number | null; editar?: (v: number | null) => void; className?: string }) {
  return <GwNumber className={`!h-[30px] !text-[18px] ${className}`} value={v} decimals={3} emptyAsZero disabled={!editar} onChange={editar} />
}

function Cab({ children }: { children: ReactNode }) {
  return <span className={`${L} text-center`}>{children}</span>
}

function Fila({ children }: { children: ReactNode }) {
  return <span className={`${L} self-center text-right`}>{children}</span>
}

export function AperturasCierresPage() {
  const params = useParams()
  const location = useLocation()
  const navigate = useNavigate()
  const ruta = (params['*'] ?? '').split('/').filter(Boolean).map(decodeURIComponent)
  const esNuevo = ruta[0] === 'nuevo'
  const claveTienda = !esNuevo && ruta.length >= 2 ? ruta[0] : null
  const claveNum = !esNuevo && ruta.length >= 2 ? Number(ruta[1]) : null
  const pedirCierre = new URLSearchParams(location.search).get('cerrar') === '1'

  const [tiendas, setTiendas] = useState<TiendaCaja[]>([])
  const [formas, setFormas] = useState<FormaPagoCaja[]>([])
  const [empleadoActual, setEmpleadoActual] = useState<string | null>(null)
  const [maestros, setMaestros] = useState(false)
  const [caja, setCaja] = useState<CajaApertura | null>(null)
  const [orig, setOrig] = useState<CajaApertura | null>(null)
  const [tot, setTot] = useState<TotalesCaja>(CERO)
  const [nombres, setNombres] = useState({ apertura: '', cierre: '' })
  const [arqueo, setArqueo] = useState<number | null>(null)
  const [fondoCierre, setFondoCierre] = useState<number | null>(null)
  const [modo, setModo] = useState<Modo>('consulta')
  const [pestana, setPestana] = useState<'datos' | 'movs'>('datos')
  const [movs, setMovs] = useState<MovimientoCaja[] | null>(null)
  const [cargando, setCargando] = useState(true)
  const [guardando, setGuardando] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; error: boolean } | null>(null)
  const [buscar, setBuscar] = useState<'emp_apertura' | null>(null)
  const lista = useListaOrdenada()

  useEffect(() => {
    cargarMaestrosCaja().then(({ tiendas: t, formas: f, empleado }) => {
      setTiendas(t)
      setFormas(f)
      setEmpleadoActual(empleado)
      setMaestros(true)
    })
  }, [])

  const leerNombres = useCallback(async (c: CajaApertura | null) => {
    const [a, b] = await Promise.all([nombreEmpleado(c?.empleado_apertura_codigo ?? null), nombreEmpleado(c?.empleado_cierre_codigo ?? null)])
    setNombres({ apertura: a, cierre: b })
  }, [])

  const leerTotales = useCallback(async (c: CajaApertura | null) => {
    if (!c) return setTot(CERO)
    if (c.cerrado) return setTot(totalesGuardados(c))
    try {
      setTot(await totalesCaja(c.tienda_terminal_codigo, c.ejercicio))
    } catch (e) {
      setMensaje({ texto: errorTexto(e), error: true })
    }
  }, [])

  // Carga: alta (Apertura de Caja), la caja de la URL, o la abierta / última del puesto.
  useEffect(() => {
    if (!maestros) return
    let cancel = false
    async function run() {
      setCargando(true)
      setMensaje(null)
      setMovs(null)
      if (esNuevo) {
        const t = tiendaPuesto(tiendas)
        const nueva = await cajaNueva(t)
        if (cancel) return
        setCaja(nueva)
        setOrig(null)
        setTot(CERO)
        setModo('alta')
        setPestana('datos')
        setNombres({ apertura: await nombreEmpleado(empleadoActual), cierre: '' })
        await avisarAbierta(t)
        setCargando(false)
        return
      }
      let c: CajaApertura | null = null
      if (claveTienda && claveNum != null) {
        const { data } = await supabase.from('caja_apertura_cierre').select(COLS).eq('tienda_terminal_codigo', claveTienda).eq('ejercicio', claveNum).maybeSingle()
        c = (data as CajaApertura | null) ?? null
      } else {
        const { data } = await supabase
          .from('caja_apertura_cierre')
          .select(COLS)
          .eq('tienda_terminal_codigo', tiendaPuesto(tiendas))
          .order('cerrado')
          .order('ejercicio', { ascending: false })
          .limit(1)
        c = ((data ?? [])[0] as CajaApertura | undefined) ?? null
      }
      if (cancel) return
      setCaja(c)
      setOrig(c)
      await Promise.all([leerNombres(c), leerTotales(c)])
      if (cancel) return
      if (pedirCierre && c && !c.cerrado) {
        await empezarCierre(c)
      } else {
        setModo('consulta')
        if (pedirCierre && (!c || c.cerrado)) setMensaje({ texto: `No hay ninguna caja abierta en la tienda ${c?.tienda_terminal_codigo ?? tiendaPuesto(tiendas)}: no hay nada que cerrar.`, error: true })
      }
      setCargando(false)
    }
    run()
    return () => {
      cancel = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params['*'], location.search, maestros])

  async function avisarAbierta(t: string) {
    const n = await cajaAbiertaDe(t)
    setMensaje(n != null ? { texto: `La caja de la tienda ${t} ya está abierta (apertura Nº ${n}): ciérrala antes de abrir otra.`, error: true } : null)
  }

  async function cajaNueva(t: string): Promise<CajaApertura> {
    // Fondo de apertura propuesto: el fondo con que se cerró la última caja de la tienda o,
    // si no hay, el fondo de caja inicial de la ficha de la tienda.
    const { data } = await supabase
      .from('caja_apertura_cierre')
      .select('fondo_final')
      .eq('tienda_terminal_codigo', t)
      .eq('cerrado', true)
      .order('ejercicio', { ascending: false })
      .limit(1)
    const previo = (data ?? [])[0]?.fondo_final
    const fondo = previo != null ? Number(previo) : Number(tiendas.find((x) => x.codigo === t)?.fondo_caja_inicial ?? 0)
    return {
      tienda_terminal_codigo: t,
      ejercicio: 0,
      fecha_apertura: ahoraTrabajo().toISOString(),
      fecha_cierre: null,
      cerrado: false,
      empleado_apertura_codigo: empleadoActual,
      empleado_cierre_codigo: null,
      fondo_inicial: fondo,
      total_ingreso: null,
      total_gasto: null,
      total_contado: null,
      total_bancos: null,
      total_efectos: null,
      total_credito: null,
      total_efectivo: null,
      total_tarjeta: null,
      total_cheque: null,
      total_ejercicio: null,
      total_arqueo: null,
      sobrante: null,
      total_a_retirar: null,
      fondo_final: null,
      gasto_bancos: null,
      gasto_efectos: null,
      gasto_credito: null,
      gasto_contado: null,
      gasto_efectivo: null,
      gasto_tarjeta: null,
      gasto_cheque: null,
      efectos_pend_cobros_ejercicio: null,
      efectos_pend_pagos_ejercicio: null,
      efectos_pend_cobros_cierre: null,
      efectos_pend_pagos_cierre: null,
    }
  }

  async function empezarCierre(c: CajaApertura) {
    const t = await totalesCaja(c.tienda_terminal_codigo, c.ejercicio)
    setTot(t)
    setArqueo(r3(t.efectivo_teorico))
    setFondoCierre(Number(tiendas.find((x) => x.codigo === c.tienda_terminal_codigo)?.fondo_caja_inicial ?? 0))
    setNombres((n) => ({ ...n, cierre: '' }))
    nombreEmpleado(empleadoActual).then((nom) => setNombres((n) => ({ ...n, cierre: nom })))
    setModo('cierre')
    setPestana('datos')
    setMensaje({
      texto: 'Cierre de caja: cuenta el efectivo del cajón, escribe el Total Arqueo y el Fondo al Cierre y pulsa Aceptar.',
      error: false,
    })
  }

  // Movimientos de la caja (pestaña «Consultas Movimientos de Caja»).
  useEffect(() => {
    if (pestana !== 'movs' || !caja || modo === 'alta') return
    let cancel = false
    // Todos los movimientos del turno, por bloques (Supabase corta cada respuesta en 1000 filas).
    todasLasFilas<MovimientoCaja>(() =>
      supabase
        .from('movimiento_caja')
        .select(MOV_COLS)
        .eq('turno_tienda_codigo', caja.tienda_terminal_codigo)
        .eq('turno_numero', caja.ejercicio)
        .order('numero'),
    ).then(({ data }) => !cancel && setMovs(data))
    return () => {
      cancel = true
    }
  }, [pestana, caja, modo])

  function patch(c: Partial<CajaApertura>) {
    setCaja((x) => (x ? { ...x, ...c } : x))
  }

  // Navegación contra el servidor: solo el registro vecino (gt/lt + limit 1), nunca la lista de claves.
  const nav = useNavRegistro<{ tienda_terminal_codigo: string; ejercicio: number }>({
    tabla: 'caja_apertura_cierre',
    orden: ['tienda_terminal_codigo', 'ejercicio'],
    actual: modo === 'consulta' && caja ? [caja.tienda_terminal_codigo, caja.ejercicio] : null,
    select: 'tienda_terminal_codigo, ejercicio',
  })
  const ir = (k?: { t: string; n: number }) => k && navigate(`/caja/aperturas/${encodeURIComponent(k.t)}/${k.n}`)
  const irNav = async (d: NavDir) => {
    const k = await nav.ir(d)
    if (k) ir({ t: k.tienda_terminal_codigo, n: Number(k.ejercicio) })
  }

  async function cambiarTienda(t: string) {
    if (modo === 'alta') {
      setCaja(await cajaNueva(t))
      await avisarAbierta(t)
      return
    }
    const { data } = await supabase
      .from('caja_apertura_cierre')
      .select('ejercicio')
      .eq('tienda_terminal_codigo', t)
      .order('ejercicio', { ascending: false })
      .limit(1)
    const ultima = (data ?? [])[0]
    if (ultima) ir({ t, n: Number(ultima.ejercicio) })
    else setMensaje({ texto: `La tienda ${t} no tiene aperturas de caja. Pulsa «Nuevo» para abrir su caja.`, error: true })
  }

  async function buscarNumero(texto: string) {
    const n = Number(texto.replace(/\D/g, ''))
    if (!n || !caja) return
    const { data } = await supabase
      .from('caja_apertura_cierre')
      .select('ejercicio')
      .eq('tienda_terminal_codigo', caja.tienda_terminal_codigo)
      .eq('ejercicio', n)
      .maybeSingle()
    if (data) ir({ t: caja.tienda_terminal_codigo, n })
    else setMensaje({ texto: `No existe la apertura de caja ${n} en la tienda ${caja.tienda_terminal_codigo}.`, error: true })
  }

  async function aplicarEmpleadoApertura(codigo: string) {
    const c = codigo.trim().toUpperCase()
    if (!c) return patch({ empleado_apertura_codigo: null })
    const { data } = await supabase.from('empleado').select('codigo, nombre').eq('codigo', c).maybeSingle()
    if (data) {
      patch({ empleado_apertura_codigo: data.codigo as string })
      setNombres((n) => ({ ...n, apertura: (data.nombre as string) ?? '' }))
    } else setMensaje({ texto: `No existe el empleado ${c}.`, error: true })
  }

  async function guardar() {
    if (!caja) return
    setGuardando(true)
    setMensaje(null)
    try {
      if (modo === 'alta') {
        const { data, error } = await supabase.rpc('fn_caja_abrir', { p_tienda: caja.tienda_terminal_codigo, p_fondo: r3(Number(caja.fondo_inicial ?? 0)) })
        if (error) throw new Error(error.message)
        if (caja.empleado_apertura_codigo && caja.empleado_apertura_codigo !== empleadoActual)
          await supabase
            .from('caja_apertura_cierre')
            .update({ empleado_apertura_codigo: caja.empleado_apertura_codigo })
            .eq('tienda_terminal_codigo', caja.tienda_terminal_codigo)
            .eq('ejercicio', Number(data))
        recordarTiendaPuesto(caja.tienda_terminal_codigo)
        nav.refrescar()
        setGuardando(false)
        navigate(`/caja/aperturas/${encodeURIComponent(caja.tienda_terminal_codigo)}/${data}`, { replace: true })
        return
      }
      if (modo === 'cierre') {
        const teorico = tot.efectivo_teorico
        const desc = r3(Number(arqueo ?? 0) - teorico)
        if (
          !confirm(
            `¿Cerrar la caja Nº ${caja.ejercicio} de la tienda ${caja.tienda_terminal_codigo}?\n\nTotal arqueo: ${formatGw(arqueo ?? 0, 3)}\nEfectivo según caja: ${formatGw(teorico, 3)}\nSobrante / descuadre: ${formatGw(desc, 3)}\nEfectivo retirado: ${formatGw(r3(Number(arqueo ?? 0) - Number(fondoCierre ?? 0)), 3)}`,
          )
        ) {
          setGuardando(false)
          return
        }
        const { error } = await supabase.rpc('fn_caja_cerrar', {
          p_tienda: caja.tienda_terminal_codigo,
          p_ejercicio: caja.ejercicio,
          p_arqueo: r3(Number(arqueo ?? 0)),
          p_fondo_cierre: r3(Number(fondoCierre ?? 0)),
        })
        if (error) throw new Error(error.message)
        setGuardando(false)
        navigate(`/caja/aperturas/${encodeURIComponent(caja.tienda_terminal_codigo)}/${caja.ejercicio}`, { replace: true })
        return
      }
      // Modificar (solo con la caja abierta): fondo de apertura y empleado de apertura.
      const { error } = await supabase
        .from('caja_apertura_cierre')
        .update({ fondo_inicial: r3(Number(caja.fondo_inicial ?? 0)), empleado_apertura_codigo: caja.empleado_apertura_codigo, actualizado_en: new Date().toISOString() })
        .eq('tienda_terminal_codigo', caja.tienda_terminal_codigo)
        .eq('ejercicio', caja.ejercicio)
      if (error) throw new Error(error.message)
      setOrig(caja)
      setModo('consulta')
      await leerTotales(caja)
    } catch (e) {
      setMensaje({ texto: errorTexto(e), error: true })
    } finally {
      setGuardando(false)
    }
  }

  async function eliminar() {
    if (!caja) return
    if (caja.cerrado) return setMensaje({ texto: 'Una caja cerrada no se puede eliminar.', error: true })
    const { count } = await supabase
      .from('movimiento_caja')
      .select('numero', { count: 'exact', head: true })
      .eq('turno_tienda_codigo', caja.tienda_terminal_codigo)
      .eq('turno_numero', caja.ejercicio)
    if (count) return setMensaje({ texto: `La caja tiene ${count} movimiento(s): no se puede eliminar, hay que cerrarla.`, error: true })
    if (!confirm(`¿Eliminar la apertura de caja Nº ${caja.ejercicio} de la tienda ${caja.tienda_terminal_codigo}? No tiene movimientos.`)) return
    const { error } = await supabase.from('caja_apertura_cierre').delete().eq('tienda_terminal_codigo', caja.tienda_terminal_codigo).eq('ejercicio', caja.ejercicio)
    if (error) return setMensaje({ texto: error.message, error: true })
    nav.refrescar()
    navigate('/caja/aperturas', { replace: true })
  }

  const cierreVals = useMemo(() => {
    if (!caja) return { arqueo: 0, sobrante: 0, retirado: 0, fondo: 0 }
    if (modo === 'cierre') {
      const a = Number(arqueo ?? 0)
      const f = Number(fondoCierre ?? 0)
      return { arqueo: a, sobrante: r3(a - tot.efectivo_teorico), retirado: r3(a - f), fondo: f }
    }
    if (caja.cerrado)
      return {
        arqueo: Number(caja.total_arqueo ?? 0),
        sobrante: Number(caja.sobrante ?? 0),
        retirado: Number(caja.total_a_retirar ?? 0),
        fondo: Number(caja.fondo_final ?? 0),
      }
    // Caja abierta: el arqueo es el efectivo que debería haber en el cajón.
    return { arqueo: r3(tot.efectivo_teorico), sobrante: 0, retirado: r3(tot.efectivo_teorico), fondo: 0 }
  }, [caja, modo, arqueo, fondoCierre, tot])

  if (cargando) return <div className="gw-label p-2">Cargando…</div>

  const c = caja
  const editarApertura = modo === 'alta' || modo === 'edicion'
  const tiendasOpc = tiendas.length ? tiendas.map((t) => t.codigo) : c ? [c.tienda_terminal_codigo] : []
  const ancla = c && modo !== 'alta' ? `${c.tienda_terminal_codigo}|${c.ejercicio}` : null
  const nombreFp = (cod: string | null) => formas.find((f) => f.codigo === cod)?.descripcion ?? cod ?? ''

  return (
    <div className="flex flex-col gap-1 px-1 text-[18px]">
      {/* Cabecera: Tienda · Número · Fecha Apertura · Fecha Cierre · Ejercicio · Empleado del Cierre */}
      <div className="grid grid-cols-[84px_minmax(0,170px)_minmax(0,222px)_minmax(0,222px)_112px_minmax(0,1fr)] items-end gap-x-2" title="CAJACIER">
        <Campo label="Tienda">
          <GwSelect className={I} value={c?.tienda_terminal_codigo ?? ''} disabled={modo === 'edicion' || modo === 'cierre'} title="TIENDA" onChange={(e) => cambiarTienda(e.target.value)}>
            {tiendasOpc.map((t) => (
              <option key={t}>{t}</option>
            ))}
          </GwSelect>
        </Campo>
        <Campo label={<><u>N</u>úmero</>}>
          <GwCampoBusqueda
            className={`${I} gw-num`}
            value={c && modo !== 'alta' ? String(c.ejercicio) : ''}
            disabled={modo !== 'consulta'}
            title="NUMERO — se asigna al abrir la caja"
            onBuscar={buscarNumero}
            onLista={(texto) =>
              lista.abrir(LISTA_CAJAS, { texto, ancla, onPick: (f) => ir({ t: String(f.tienda_terminal_codigo), n: Number(f.ejercicio) }) })
            }
          />
        </Campo>
        <Campo label="Fecha Apertura">
          <GwInput className={I} readOnly value={c ? fechaHoraGw(c.fecha_apertura) : ''} title="FECHAAPER" />
        </Campo>
        <Campo label="Fecha Cierre">
          <GwInput className={I} readOnly value={fechaHoraGw(c?.fecha_cierre)} title="FECHACIER" />
        </Campo>
        <button
          type="button"
          title="Recalcular los totales del ejercicio (caja abierta)"
          disabled={!c || modo === 'alta' || !!c?.cerrado}
          onClick={() => c && leerTotales(c)}
          className="flex h-[52px] flex-col items-center justify-center border border-[var(--gw-border)] bg-[var(--gw-face)] text-[18px] hover:bg-[#e5f1fb]"
        >
          Ejercicio
          <RefreshCw size={14} strokeWidth={3} className="text-[#2a9d2a]" />
        </button>
        <Grupo title={<><u>E</u>mpleado del Cierre</>} className="grid grid-cols-[84px_minmax(0,1fr)] gap-x-1.5">
          <GwInput className={I} readOnly value={modo === 'cierre' ? (empleadoActual ?? '') : (c?.empleado_cierre_codigo ?? '')} title="EMPLCIER" />
          <span className="flex">
            <GwInput className={I} readOnly value={nombres.cierre} />
            <GwLookupButton disabled title="El empleado del cierre es el que cierra la caja" />
          </span>
        </Grupo>
      </div>

      {/* Pestañas */}
      <div className="mt-1 flex">
        {(
          [
            ['datos', 'Datos Generales'],
            ['movs', 'Consultas Movimientos de Caja'],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            onClick={() => setPestana(k)}
            disabled={k === 'movs' && modo === 'alta'}
            className={`-mb-px h-[38px] flex-1 border border-[var(--gw-border-light)] text-[20px] ${pestana === k ? 'z-10 border-b-transparent bg-[var(--gw-face)] font-bold' : 'bg-[var(--gw-face)] hover:bg-[#e5f1fb] disabled:text-[#9a9a9a]'}`}
          >
            {l}
          </button>
        ))}
      </div>

      <div className="flex flex-col gap-1 border border-[var(--gw-border-light)] p-1.5">
        {!c ? (
          <p className={`${L} p-2`}>No hay aperturas de caja en esta tienda. Pulsa «Nuevo» para abrir la caja.</p>
        ) : pestana === 'datos' ? (
          <>
            {/* Fondo Apertura · Empleado Apertura */}
            <div className="grid grid-cols-[200px_186px_minmax(0,580px)_minmax(0,1fr)] items-end gap-x-3">
              <span className={`${L} self-center pl-2 text-[20px]`}>Fondo Apertura:</span>
              <Num v={c.fondo_inicial} editar={editarApertura ? (v) => patch({ fondo_inicial: v }) : undefined} />
              <Grupo title={<><u>E</u>mpleado Apertura</>} className="grid grid-cols-[92px_minmax(0,1fr)] gap-x-1.5">
                <GwCampoBusqueda
                  className={I}
                  value={c.empleado_apertura_codigo ?? ''}
                  editable={editarApertura}
                  title="EMPLAPER"
                  maxLength={10}
                  onChange={(v) => patch({ empleado_apertura_codigo: v.toUpperCase() || null })}
                  onBlur={(e) => editarApertura && aplicarEmpleadoApertura(e.target.value)}
                  onLista={
                    editarApertura
                      ? (texto) => lista.abrir(LISTA_EMPLEADO, { texto, ancla: c.empleado_apertura_codigo, onPick: (f) => aplicarEmpleadoApertura(String(f.codigo)) })
                      : undefined
                  }
                />
                <span className="flex">
                  <GwInput className={I} readOnly value={nombres.apertura} />
                  <GwLookupButton disabled={!editarApertura} onClick={() => setBuscar('emp_apertura')} title="Buscar empleado" />
                </span>
              </Grupo>
              <span className="self-center text-right">
                {!c.cerrado && modo !== 'alta' && <span className={`${L} font-bold text-[#127a12]`}>CAJA ABIERTA</span>}
                {c.cerrado && <span className={`${L} font-bold text-[#6d6d6d]`}>CAJA CERRADA</span>}
              </span>
            </div>

            {/* Totales del Cierre */}
            <Grupo title="Totales del Cierre" className="pb-1">
              <div className="grid grid-cols-[150px_repeat(5,minmax(0,1fr))] items-center gap-x-1.5 gap-y-[3px] pr-6">
                <span />
                <Cab>Bancos</Cab>
                <Cab>Efectos</Cab>
                <Cab>Crédito</Cab>
                <Cab>Contado</Cab>
                <Cab>Totales</Cab>
                <Fila>Ingresos:</Fila>
                <Num v={tot.ing_bancos} />
                <Num v={tot.ing_efectos} />
                <Num v={tot.ing_credito} />
                <Num v={tot.ing_contado} />
                <Num v={tot.ing_total} />
                <Fila>Gastos:</Fila>
                <Num v={tot.gas_bancos} />
                <Num v={tot.gas_efectos} />
                <Num v={tot.gas_credito} />
                <Num v={tot.gas_contado} />
                <Num v={tot.gas_total} />
                <span className="col-span-6 my-0.5 border-t border-[var(--gw-border)]" />
                <Fila>Total Ejerc.:</Fila>
                <Num v={r3(tot.ing_bancos - tot.gas_bancos)} />
                <Num v={r3(tot.ing_efectos - tot.gas_efectos)} />
                <Num v={r3(tot.ing_credito - tot.gas_credito)} />
                <Num v={r3(tot.ing_contado - tot.gas_contado)} />
                <Num v={r3(tot.ing_total - tot.gas_total)} />
              </div>
            </Grupo>

            {/* Desglose de los Pagos de Contado y Cierre de Caja */}
            <Grupo title="Desglose de los Pagos de Contado y Cierre de Caja" className="pb-1">
              <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,470px)] gap-x-3">
                <div className="grid grid-cols-[150px_repeat(3,minmax(0,1fr))] items-center gap-x-1.5 gap-y-[3px] border-r border-[var(--gw-border-light)] pr-3">
                  <span />
                  <Cab>Total Cheques</Cab>
                  <Cab>Total Tarjetas</Cab>
                  <Cab>Total Efectivo</Cab>
                  <Fila>Ingresos:</Fila>
                  <Num v={tot.ing_cheque} />
                  <Num v={tot.ing_tarjeta} />
                  <Num v={tot.ing_efectivo} />
                  <Fila>Gastos:</Fila>
                  <Num v={tot.gas_cheque} />
                  <Num v={tot.gas_tarjeta} />
                  <Num v={tot.gas_efectivo} />
                  <span className="col-span-4 my-0.5 border-t border-[var(--gw-border)]" />
                  <Fila>Total Ejerc.:</Fila>
                  <Num v={r3(tot.ing_cheque - tot.gas_cheque)} />
                  <Num v={r3(tot.ing_tarjeta - tot.gas_tarjeta)} />
                  <Num v={r3(tot.ing_efectivo - tot.gas_efectivo)} />
                </div>
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,210px)] items-center gap-x-2 gap-y-[3px]">
                  <span className="grid grid-cols-[minmax(0,1fr)] items-end">
                    <span className={`${L} pl-3`}>Sobrante</span>
                  </span>
                  <span className={`${L} pl-1`}>Total Arqueo</span>
                  <span title="Sobrante / descuadre: arqueo − (fondo de apertura + efectivo del ejercicio)">
                    <Num v={cierreVals.sobrante} className={cierreVals.sobrante ? '!text-[#c42b1c]' : ''} />
                  </span>
                  <span title="Efectivo contado en el cajón">
                    <Num v={cierreVals.arqueo} editar={modo === 'cierre' ? (v) => setArqueo(v) : undefined} className={modo === 'cierre' ? '!bg-[#fffbe0]' : ''} />
                  </span>
                  <Fila>Efectivo Retirado:</Fila>
                  <Num v={cierreVals.retirado} />
                  <span className="col-span-2 my-0.5 border-t border-[var(--gw-border)]" />
                  <Fila>Fondo al Cierre:</Fila>
                  <Num v={cierreVals.fondo} editar={modo === 'cierre' ? (v) => setFondoCierre(v) : undefined} className={modo === 'cierre' ? '!bg-[#fffbe0]' : ''} />
                </div>
              </div>
            </Grupo>

            {/* Efectos pendientes */}
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-5">
              <Grupo title="Efectos Pendientes Generados en el Ejercicio" className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2">
                <span className={L}>Cobros:</span>
                <Num v={tot.efp_cobros_ejercicio} />
                <span className={L}>Pagos:</span>
                <Num v={tot.efp_pagos_ejercicio} />
              </Grupo>
              <Grupo title="Totales Efectos Pendientes de esta oficina al cierre" className="grid grid-cols-[auto_minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-2">
                <span className={L}>Cobros:</span>
                <Num v={tot.efp_cobros_cierre} />
                <span className={L}>Pagos:</span>
                <Num v={tot.efp_pagos_cierre} />
              </Grupo>
            </div>
          </>
        ) : (
          <div className="flex min-h-0 flex-col gap-1">
            <div className="h-[420px] overflow-auto border border-[var(--gw-border)] bg-white">
              <table className="gw-grid table-fixed">
                <thead className="sticky top-0 z-10">
                  <tr>
                    <th style={{ width: 90 }}>Número</th>
                    <th style={{ width: 92 }}>Fecha</th>
                    <th style={{ width: 70 }}>Hora</th>
                    <th style={{ width: 48 }}>Tipo</th>
                    <th style={{ width: 160 }}>Forma de pago</th>
                    <th style={{ width: 150 }}>Documento</th>
                    <th className="text-right!" style={{ width: 100 }}>
                      Ingreso
                    </th>
                    <th className="text-right!" style={{ width: 100 }}>
                      Gasto
                    </th>
                    <th>Concepto</th>
                    <th style={{ width: 70 }}>Empl.</th>
                  </tr>
                </thead>
                <tbody>
                  {movs == null && (
                    <tr>
                      <td colSpan={10}>Cargando…</td>
                    </tr>
                  )}
                  {movs?.length === 0 && (
                    <tr>
                      <td colSpan={10} className="text-center text-[#6d6d6d]">
                        La caja no tiene movimientos.
                      </td>
                    </tr>
                  )}
                  {movs?.map((m) => (
                    <tr
                      key={m.numero}
                      className={m.activo ? '' : 'text-[#8a8a8a] line-through'}
                      onDoubleClick={() => navigate(`/caja/movimientos/${encodeURIComponent(m.tienda_terminal_codigo)}/${m.numero}`)}
                      title="Doble clic: abrir el movimiento"
                    >
                      <td className="text-right tabular-nums">{m.numero}</td>
                      <td>{fechaGw(m.fecha)}</td>
                      <td>{m.hora}</td>
                      <td>{m.tipo_movimiento}</td>
                      <td className="truncate">{nombreFp(m.forma_pago_codigo)}</td>
                      <td className="truncate">{textoDocumento(m)}</td>
                      <td className="text-right tabular-nums">{Number(m.ingreso ?? 0) ? formatGw(m.ingreso, 3) : ''}</td>
                      <td className="text-right tabular-nums">{Number(m.gasto ?? 0) ? formatGw(m.gasto, 3) : ''}</td>
                      <td className="truncate">{m.concepto}</td>
                      <td>{m.empleado_codigo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end gap-6 pr-2 text-[16px]">
              <span>{movs?.length ?? 0} movimientos</span>
              <span>
                Ingresos: <b className="tabular-nums">{formatGw((movs ?? []).reduce((s, m) => s + Number(m.ingreso ?? 0), 0), 3)}</b>
              </span>
              <span>
                Gastos: <b className="tabular-nums">{formatGw((movs ?? []).reduce((s, m) => s + Number(m.gasto ?? 0), 0), 3)}</b>
              </span>
            </div>
          </div>
        )}
      </div>

      {mensaje && <p className={`gw-label px-1 ${mensaje.error ? '!text-[#c42b1c]' : '!text-[#1a4fd0]'}`}>{mensaje.texto}</p>}

      <GwRecordBar
        grande
        mode={modo === 'cierre' ? 'edicion' : modo}
        canNavigate={modo === 'consulta' && !!caja}
        saving={guardando}
        onFirst={() => irNav('primero')}
        onPrev={() => irNav('anterior')}
        onNext={() => irNav('siguiente')}
        onLast={() => irNav('ultimo')}
        onSort={() => lista.abrir(LISTA_CAJAS, { ancla, onPick: (f) => ir({ t: String(f.tienda_terminal_codigo), n: Number(f.ejercicio) }) })}
        onSearch={() => lista.abrir(LISTA_CAJAS, { ancla, onPick: (f) => ir({ t: String(f.tienda_terminal_codigo), n: Number(f.ejercicio) }) })}
        onPrint={() => window.print()}
        onNew={() => navigate('/caja/aperturas/nuevo')}
        onEdit={() => {
          if (!c) return
          if (c.cerrado) return setMensaje({ texto: 'La caja está cerrada: no se puede modificar.', error: true })
          setMensaje({ texto: 'Modificar: se puede cambiar el fondo y el empleado de la apertura. Para cerrar la caja: Caja → Cierre de Caja.', error: false })
          setModo('edicion')
        }}
        onDelete={eliminar}
        onSave={guardar}
        onCancel={() => {
          setMensaje(null)
          if (modo === 'alta') navigate('/caja/aperturas', { replace: true })
          else if (modo === 'cierre') navigate(`/caja/aperturas/${encodeURIComponent(c!.tienda_terminal_codigo)}/${c!.ejercicio}`, { replace: true })
          else {
            setCaja(orig)
            setModo('consulta')
            leerNombres(orig)
          }
        }}
        onExit={() => navigate('/')}
      />

      {buscar === 'emp_apertura' && (
        <GwLookupDialog<Record<string, unknown>>
          title="Empleados"
          table="empleado"
          columns={[
            { key: 'codigo', label: 'Código', width: 100 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="nombre"
          keyColumn="codigo"
          onPick={(r) => {
            setBuscar(null)
            aplicarEmpleadoApertura(String(r.codigo))
          }}
          onClose={() => setBuscar(null)}
        />
      )}
      {lista.dialogo}
    </div>
  )
}
