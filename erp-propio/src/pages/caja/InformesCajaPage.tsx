import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calendar, Check, DoorOpen, FileDown, FileText, ListPlus, Monitor, Printer, ScanSearch } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { todasLasFilas } from '../../lib/todasLasFilas'
import { GwDate, GwInput, GwLookupButton, GwRadio, GwSelect, GwWindow, formatGw } from '../../components/gw'
import { GwLookupDialog } from '../../components/gw/GwLookupDialog'
import { useListaOrdenada, type GwListaOrdenadaDef } from '../../components/gw/GwListaOrdenada'
import { OptionButton } from '../ventas/gestores/comun'
import { VentanaOperativa } from '../../components/gw/GwListado'
import {
  MOV_COLS,
  TIPOS_MOV,
  cargarMaestrosCaja,
  fechaGw,
  hoyISO,
  horaActual,
  r3,
  textoDocumento,
  tiendaPuesto,
  type FormaPagoCaja,
  type MovimientoCaja,
  type TiendaCaja,
} from './cajaModel'

// Caja → Listado de Caja (Ctrl+F5): ventana «Informes de Caja» de GeminisWin. Filtros como en
// la captura; «Procesar» saca el informe en pantalla (rejilla con totales, exportable a CSV),
// por impresora o a PDF (impresión del navegador → Guardar como PDF).
// Botones-casilla: ✓ = se filtra por esa opción; si en un grupo no hay ninguna marcada (× en
// todas, como sale la ventana al abrir), ese grupo no filtra.

const L = 'text-[18px] leading-[21px] whitespace-nowrap'
const I = '!h-[30px] !text-[17px]'

type Rango = 'desdeHasta' | 'cualquiera' | 'seleccionar'
type Salida = 'pantalla' | 'impresora' | 'examinar' | 'pdf'

// Desplegables calcados de las capturas ZIP 7, nº 73-75 (04/11/2026).
const INFORMES = [
  { v: 'movimientos', label: 'Listado de movimientos' },
  { v: 'tickets', label: 'Listado de movimientos (impresora de Tickets)' },
  { v: 'detallado', label: 'Listado de movimientos detallado' },
  { v: 'tipos_pago', label: 'Listado por Tipos de Pago' },
  { v: 'tipos_mov', label: 'Listado por Tipos de Movimiento' },
  { v: 'tienda', label: 'Totales de movimientos por Tienda' },
  { v: 'fecha_tienda', label: 'Totales de movimientos por Fecha y Tienda' },
  { v: 'tienda_fecha', label: 'Totales de movimientos por Tienda y Fecha' },
  { v: 'tienda_mes', label: 'Totales de movimientos por Tienda y Mes' },
  { v: 'formas', label: 'Totales de movimientos por Formas de Pago' },
  { v: 'formas_mes', label: 'Totales de movimientos por Formas de Pago y mes' },
] as const
type Informe = (typeof INFORMES)[number]['v']

// La lista de GeminisWin tiene barra de desplazamiento: los siete primeros son los de la captura.
const ORDENES = [
  { v: 'tienda', label: 'Tienda y Movimiento' },
  { v: 'fecha', label: 'Fecha y Hora' },
  { v: 'saldo_asc', label: 'Saldo de Menor a Mayor' },
  { v: 'saldo_desc', label: 'Saldo de Mayor a Menor' },
  { v: 'forma', label: 'Forma de Pago' },
  { v: 'contado', label: 'Tipo contado' },
  { v: 'tipo', label: 'Tipo Movimiento' },
  { v: 'empleado', label: 'Empleado' },
] as const
type Orden = (typeof ORDENES)[number]['v']

const TIPOS_FP = [
  { v: 1, label: 'Crédito' },
  { v: 3, label: 'Banco' },
  { v: 2, label: 'Efecto' },
  { v: 4, label: 'Contado' },
]
const TIPOS_CONT = [
  { v: 1, label: 'Efectivo' },
  { v: 3, label: 'Cheque' },
  { v: 2, label: 'Tarjeta' },
]

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
    { key: 'estado', label: 'Estado' },
  ],
}

interface Filtros {
  informe: Informe
  soloTotales: boolean
  incluirCredito: boolean
  orden: Orden
  fechaModo: 'desdeHasta' | 'cualquiera'
  fDesde: string | null
  hDesde: string
  fHasta: string | null
  hHasta: string
  horaModo: 'desdeHasta' | 'cualquiera'
  horaDesde: string
  horaHasta: string
  tiendaModo: Rango
  tDesde: string
  nDesde: string
  tHasta: string
  nHasta: string
  tiendasSel: string
  tipos: Set<string>
  dcFra: Set<string>
  docCampo: 'documento' | 'tienda'
  docModo: Rango
  docDesde: string
  docHasta: string
  docSel: string
  empModo: Rango
  empDesde: string
  empHasta: string
  empSel: string
  fpModo: Rango
  fpDesde: string
  fpHasta: string
  fpSel: string
  tiposFp: Set<number>
  tiposCont: Set<number>
  saldo: Set<'ingresos' | 'gastos' | 'negativo'>
  salida: Salida
}

function alternar<T>(s: Set<T>, v: T) {
  const n = new Set(s)
  if (n.has(v)) n.delete(v)
  else n.add(v)
  return n
}

const lista = (txt: string) =>
  txt
    .split(/[\s,;]+/)
    .map((x) => x.trim().toUpperCase())
    .filter(Boolean)

const enRango = (v: string, d: string, h: string) => (!d || v >= d) && (!h || v <= h)

function Marco({ title, children, className = '' }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <fieldset className={`min-w-0 border border-[var(--gw-border-light)] px-1.5 pb-1 pt-0 ${className}`}>
      {title != null && <legend className={`${L} px-1`}>{title}</legend>}
      {children}
    </fieldset>
  )
}

function Radio({ name, label, checked, onChange }: { name: string; label: string; checked: boolean; onChange: () => void }) {
  return (
    <span className="text-[18px] [&_label]:text-[18px]">
      <GwRadio name={name} label={<span className="text-[18px]">{label}</span>} checked={checked} onChange={onChange} />
    </span>
  )
}

/** Caja de «Seleccionar»: varios códigos separados por comas, ··· para añadir y botón para vaciar. */
function Seleccion({ value, onChange, onBuscar, className = '' }: { value: string; onChange: (v: string) => void; onBuscar: () => void; className?: string }) {
  return (
    <span className={`flex min-w-0 ${className}`}>
      <textarea
        className="gw-input !h-[30px] min-w-0 flex-1 resize-none overflow-y-scroll !py-0.5 !text-[15px] leading-[20px]"
        value={value}
        title="Códigos separados por comas"
        onChange={(e) => onChange(e.target.value)}
      />
      <GwLookupButton onClick={onBuscar} title="Añadir a la selección" />
      <button type="button" className="gw-btn !h-[30px] w-[34px] flex-none !px-0" title="Vaciar la selección" onClick={() => onChange('')}>
        <ListPlus size={14} className="text-[#1d3a8a]" />
      </button>
    </span>
  )
}

function CampoLookup({ value, onChange, onBuscar, className = '', num }: { value: string; onChange: (v: string) => void; onBuscar?: () => void; className?: string; num?: boolean }) {
  return (
    <span className={`flex min-w-0 ${className}`}>
      <GwInput className={`${I} ${num ? 'gw-num' : ''} min-w-0`} value={value} onChange={(e) => onChange(e.target.value)} />
      <GwLookupButton onClick={onBuscar} disabled={!onBuscar} />
    </span>
  )
}

function Toggle({ label, on, set, title }: { label: string; on: boolean; set: () => void; title?: string }) {
  return <OptionButton label={label} value={on} onChange={set} title={title ?? (on ? 'Se filtra por esta opción' : 'Sin filtrar')} className="!h-[29px] !px-1 !text-[18px]" />
}

interface Fila extends MovimientoCaja {
  _fp: FormaPagoCaja | undefined
}

export function InformesCajaPage() {
  const navigate = useNavigate()
  const [tiendas, setTiendas] = useState<TiendaCaja[]>([])
  const [formas, setFormas] = useState<FormaPagoCaja[]>([])
  const [f, setF] = useState<Filtros | null>(null)
  const [lookup, setLookup] = useState<{ tabla: 'tienda' | 'empleado' | 'forma'; aplicar: (v: string) => void } | null>(null)
  const [procesando, setProcesando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [resultado, setResultado] = useState<{ filas: Fila[]; credito: number; truncado: boolean; imprimir: boolean } | null>(null)
  const listaOrd = useListaOrdenada()
  const [verOperativa, setVerOperativa] = useState(false)

  useEffect(() => {
    cargarMaestrosCaja().then(({ tiendas: t, formas: fp }) => {
      setTiendas(t)
      setFormas(fp)
      const tp = tiendaPuesto(t)
      setF({
        informe: 'movimientos',
        soloTotales: false,
        incluirCredito: false,
        orden: 'tienda',
        fechaModo: 'desdeHasta',
        fDesde: hoyISO(),
        hDesde: '00:00:00',
        fHasta: hoyISO(),
        hHasta: horaActual(),
        horaModo: 'cualquiera',
        horaDesde: '',
        horaHasta: '',
        tiendaModo: 'desdeHasta',
        tDesde: tp,
        nDesde: '',
        tHasta: tp,
        nHasta: '',
        tiendasSel: '',
        tipos: new Set(),
        dcFra: new Set(),
        docCampo: 'documento',
        docModo: 'cualquiera',
        docDesde: '',
        docHasta: '',
        docSel: '',
        empModo: 'cualquiera',
        empDesde: '',
        empHasta: '',
        empSel: '',
        fpModo: 'cualquiera',
        fpDesde: '',
        fpHasta: '',
        fpSel: '',
        tiposFp: new Set(),
        tiposCont: new Set(),
        saldo: new Set(),
        salida: 'pantalla',
      })
    })
  }, [])

  // F4 cierra la ventana (salvo en un campo de fecha, donde abre el calendario).
  useEffect(() => {
    const k = (e: KeyboardEvent) => {
      if (e.key !== 'F4' || e.defaultPrevented || resultado) return
      if ((e.target as HTMLElement | null)?.closest?.('[data-gw-fecha]')) return
      e.preventDefault()
      navigate('/')
    }
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [navigate, resultado])

  const fpDe = useMemo(() => new Map(formas.map((x) => [x.codigo, x])), [formas])

  if (!f) return <div className="gw-label p-2">Cargando…</div>
  const set = (c: Partial<Filtros>) => setF((x) => (x ? { ...x, ...c } : x))

  async function asignarHorario() {
    listaOrd.abrir(LISTA_CAJAS, {
      onPick: async (r) => {
        const { data } = await supabase
          .from('caja_apertura_cierre')
          .select('tienda_terminal_codigo, fecha_apertura, fecha_cierre')
          .eq('tienda_terminal_codigo', String(r.tienda_terminal_codigo))
          .eq('ejercicio', Number(r.ejercicio))
          .maybeSingle()
        if (!data) return
        const partir = (v: string | null) => {
          const d = v ? new Date(v) : new Date()
          const p = (n: number) => String(n).padStart(2, '0')
          return [`${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`]
        }
        const [fd, hd] = partir(data.fecha_apertura as string)
        const [fh, hh] = partir((data.fecha_cierre as string | null) ?? null)
        set({ fechaModo: 'desdeHasta', fDesde: fd, hDesde: hd, fHasta: fh, hHasta: hh, tiendaModo: 'desdeHasta', tDesde: data.tienda_terminal_codigo as string, tHasta: data.tienda_terminal_codigo as string })
      },
    })
  }

  async function procesar() {
    if (!f) return
    setProcesando(true)
    setAviso(null)
    try {
      const PAG = 1000
      const MAX = 50000
      const todas: MovimientoCaja[] = []
      let truncado = false
      for (let desde = 0; ; desde += PAG) {
        let q = supabase.from('movimiento_caja').select(MOV_COLS)
        if (f.fechaModo === 'desdeHasta') {
          if (f.fDesde) q = q.gte('fecha', f.fDesde)
          if (f.fHasta) q = q.lte('fecha', f.fHasta)
        }
        if (f.tiendaModo === 'desdeHasta') {
          if (f.tDesde) q = q.gte('tienda_terminal_codigo', f.tDesde)
          if (f.tHasta) q = q.lte('tienda_terminal_codigo', f.tHasta)
        } else if (f.tiendaModo === 'seleccionar' && lista(f.tiendasSel).length) q = q.in('tienda_terminal_codigo', lista(f.tiendasSel))
        if (f.tipos.size) q = q.in('tipo_movimiento', [...f.tipos])
        const { data, error } = await q.order('tienda_terminal_codigo').order('numero').range(desde, desde + PAG - 1)
        if (error) throw new Error(error.message)
        todas.push(...((data ?? []) as MovimientoCaja[]))
        if (!data || data.length < PAG) break
        if (todas.length >= MAX) {
          truncado = true
          break
        }
      }

      const nDesde = Number(f.nDesde) || null
      const nHasta = Number(f.nHasta) || null
      const tsDesde = `${f.fDesde ?? ''} ${f.hDesde || '00:00:00'}`
      const tsHasta = `${f.fHasta ?? ''} ${f.hHasta || '23:59:59'}`
      const hora8 = (h: string | null) => (h ?? '').padEnd(8, ':00').slice(0, 8)
      const docs = lista(f.docSel)
      const emps = lista(f.empSel)
      const fps = lista(f.fpSel)
      const filas: Fila[] = todas
        .filter((m) => {
          const h = hora8(m.hora)
          if (f.fechaModo === 'desdeHasta') {
            const ts = `${m.fecha} ${h}`
            if (f.fDesde && ts < tsDesde) return false
            if (f.fHasta && ts > tsHasta) return false
          }
          if (f.horaModo === 'desdeHasta' && !enRango(h, f.horaDesde ? hora8(f.horaDesde) : '', f.horaHasta ? hora8(f.horaHasta) : '')) return false
          if (f.tiendaModo === 'desdeHasta' && m.numero != null) {
            if (nDesde && m.tienda_terminal_codigo === f.tDesde && m.numero < nDesde) return false
            if (nHasta && m.tienda_terminal_codigo === f.tHasta && m.numero > nHasta) return false
          }
          const docVal = (f.docCampo === 'documento' ? textoDocumento(m) : (m.ajeno_tienda_codigo ?? '')).toUpperCase()
          if (f.docModo === 'desdeHasta' && !enRango(docVal, f.docDesde.toUpperCase(), f.docHasta.toUpperCase())) return false
          if (f.docModo === 'seleccionar' && docs.length && !docs.includes(docVal)) return false
          const emp = (m.empleado_codigo ?? '').toUpperCase()
          if (f.empModo === 'desdeHasta' && !enRango(emp, f.empDesde.toUpperCase(), f.empHasta.toUpperCase())) return false
          if (f.empModo === 'seleccionar' && emps.length && !emps.includes(emp)) return false
          const fpc = (m.forma_pago_codigo ?? '').toUpperCase()
          if (f.fpModo === 'desdeHasta' && !enRango(fpc, f.fpDesde.toUpperCase(), f.fpHasta.toUpperCase())) return false
          if (f.fpModo === 'seleccionar' && fps.length && !fps.includes(fpc)) return false
          const fp = fpDe.get(m.forma_pago_codigo ?? '')
          const tf = m.tipo_forma_pago ?? fp?.tipo ?? 4
          const tc = tf === 4 ? (m.tipo_contado || fp?.tipo_contado || 1) : null
          if (f.tiposFp.size && !f.tiposFp.has(tf)) return false
          if (f.tiposCont.size && (tc == null || !f.tiposCont.has(tc))) return false
          if (f.saldo.size) {
            const ing = Number(m.ingreso ?? 0)
            const gas = Number(m.gasto ?? 0)
            const ok =
              (f.saldo.has('ingresos') && ing > 0) || (f.saldo.has('gastos') && gas > 0) || (f.saldo.has('negativo') && (ing < 0 || gas < 0))
            if (!ok) return false
          }
          return true
        })
        .map((m) => ({ ...m, _fp: fpDe.get(m.forma_pago_codigo ?? '') }))

      const fh = (m: Fila) => `${m.fecha} ${hora8(m.hora)}|${m.tienda_terminal_codigo}|${String(m.numero).padStart(12, '0')}`
      // Saldo como texto ordenable: desplazado para que los negativos queden delante.
      const saldoTxt = (m: Fila, signo: 1 | -1) => String(Math.round((signo * (Number(m.ingreso ?? 0) - Number(m.gasto ?? 0)) + 1e9) * 1000)).padStart(16, '0')
      const clave = (m: Fila) =>
        f.orden === 'fecha'
          ? fh(m)
          : f.orden === 'empleado'
            ? `${m.empleado_codigo ?? ''}|${fh(m)}`
            : f.orden === 'forma'
              ? `${m.forma_pago_codigo ?? ''}|${fh(m)}`
              : f.orden === 'saldo_asc'
                ? `${saldoTxt(m, 1)}|${fh(m)}`
                : f.orden === 'saldo_desc'
                  ? `${saldoTxt(m, -1)}|${fh(m)}`
                  : f.orden === 'contado'
                    ? `${m.tipo_contado ?? m._fp?.tipo_contado ?? 9}|${fh(m)}`
                    : f.orden === 'tipo'
                      ? `${m.tipo_movimiento ?? ''}|${fh(m)}`
                      : `${m.tienda_terminal_codigo}|${String(m.numero).padStart(12, '0')}`
      // Listados por Tipos de Pago / de Movimiento: primero el grupo, luego el orden elegido.
      const grupoOrden = (m: Fila) => (f.informe === 'tipos_pago' ? String(m.tipo_forma_pago ?? m._fp?.tipo ?? 4) : f.informe === 'tipos_mov' ? (m.tipo_movimiento ?? '') : '')
      const k = (m: Fila) => `${grupoOrden(m)}#${clave(m)}`
      filas.sort((a, b) => (k(a) < k(b) ? -1 : k(a) > k(b) ? 1 : 0))

      // Ventas de crédito: lo pendiente de las ventas emitidas en el periodo y tiendas del filtro.
      let credito = 0
      if (f.incluirCredito) {
        const consulta = () => {
          let q = supabase.from('venta').select('total_pendiente').gt('total_pendiente', 0).eq('aplazada', false).is('anulada_en', null)
          if (f.fechaModo === 'desdeHasta') {
            if (f.fDesde) q = q.gte('fecha', f.fDesde)
            if (f.fHasta) q = q.lte('fecha', f.fHasta)
          }
          if (f.tiendaModo === 'desdeHasta') {
            if (f.tDesde) q = q.gte('tienda_terminal_codigo', f.tDesde)
            if (f.tHasta) q = q.lte('tienda_terminal_codigo', f.tHasta)
          } else if (f.tiendaModo === 'seleccionar' && lista(f.tiendasSel).length) q = q.in('tienda_terminal_codigo', lista(f.tiendasSel))
          return q.order('tienda_terminal_codigo').order('numero')
        }
        // Supabase corta cada respuesta en 1000 filas: la suma se hace con todas, por bloques.
        const { data } = await todasLasFilas(consulta, { tope: 200000 })
        credito = r3(data.reduce((s, v) => s + Number(v.total_pendiente ?? 0), 0))
      }
      setResultado({ filas, credito, truncado, imprimir: f.salida === 'impresora' || f.salida === 'pdf' })
    } catch (e) {
      setAviso((e as Error).message)
    } finally {
      setProcesando(false)
    }
  }

  function abrirLookup(tabla: 'tienda' | 'empleado' | 'forma', aplicar: (v: string) => void) {
    setLookup({ tabla, aplicar })
  }
  const anadir = (actual: string, v: string) => (lista(actual).includes(v.toUpperCase()) ? actual : [...lista(actual), v].join(', '))

  const fechaCampo = (fecha: string | null, hora: string, onF: (v: string | null) => void, onH: (v: string) => void, dis: boolean) => (
    <span className="flex min-w-0" data-gw-fecha="">
      <GwDate className={`${I} min-w-0 flex-[1.3]`} value={fecha} disabled={dis} onChange={onF} />
      <GwInput className={`${I} min-w-0 flex-1`} value={hora} disabled={dis} maxLength={8} title="Hora (hh:mm:ss)" onChange={(e) => onH(e.target.value)} />
      <button type="button" disabled={dis} className="gw-btn !h-[30px] w-[50px] flex-none !px-0" title="Calendario (F4 en la fecha)" onClick={(e) => {
        const inp = (e.currentTarget.parentElement?.querySelector('input') as HTMLInputElement | null)
        inp?.focus()
        inp?.dispatchEvent(new KeyboardEvent('keydown', { key: 'F4', bubbles: true }))
      }}>
        <Calendar size={14} className="text-[#1d3a8a]" />
      </button>
    </span>
  )

  const dhRadios = (name: string, modo: Rango, onM: (m: Rango) => void, conSel = true) => (
    <div className="flex flex-col justify-between gap-0.5 py-0.5">
      <Radio name={name} label="Desde/Hasta" checked={modo === 'desdeHasta'} onChange={() => onM('desdeHasta')} />
      <Radio name={name} label="Cualquiera" checked={modo === 'cualquiera'} onChange={() => onM('cualquiera')} />
      {conSel && <Radio name={name} label="Seleccionar" checked={modo === 'seleccionar'} onChange={() => onM('seleccionar')} />}
    </div>
  )

  return (
    <div className="flex flex-col gap-1 px-1 text-[18px]">
      {/* Fila 1: Informe a procesar | Orden de salida */}
      <div className="grid grid-cols-[786fr_582fr] items-stretch gap-2">
        <Marco
          title={
            <span className="flex items-center gap-10">
              <b className="text-[20px]">Informe a procesar</b>
              <label className="flex items-center gap-1.5 text-[20px] font-bold">
                <input type="checkbox" className="h-[12px] w-[12px]" checked={f.soloTotales} onChange={(e) => set({ soloTotales: e.target.checked })} />
                Sólo Ver los Totales del informe
              </label>
            </span>
          }
          className="flex flex-col gap-1"
        >
          <GwSelect className={`${I} !h-[34px] !text-[19px]`} value={f.informe} onChange={(e) => set({ informe: e.target.value as Informe })}>
            {INFORMES.map((x) => (
              <option key={x.v} value={x.v}>
                {x.label}
              </option>
            ))}
          </GwSelect>
          <label className="flex items-center gap-1.5 text-[18px]">
            <input type="checkbox" className="h-[12px] w-[12px]" checked={f.incluirCredito} onChange={(e) => set({ incluirCredito: e.target.checked })} />
            Incluir el Total de las Ventas de Crédito
          </label>
        </Marco>
        <Marco title={<b className="text-[20px]">Orden de salida</b>}>
          <span className="flex">
            <GwSelect className={`${I} !h-[34px] !text-[19px]`} value={f.orden} onChange={(e) => set({ orden: e.target.value as Orden })}>
              {ORDENES.map((x) => (
                <option key={x.v} value={x.v}>
                  {x.label}
                </option>
              ))}
            </GwSelect>
            <GwLookupButton title="Orden de salida" onClick={() => set({ orden: ORDENES[(ORDENES.findIndex((o) => o.v === f.orden) + 1) % ORDENES.length].v })} />
          </span>
        </Marco>
      </div>

      {/* Fila 2: Fecha y Hora | Hora */}
      <div className="grid grid-cols-[896fr_472fr] gap-2">
        <Marco title="Fecha y Hora" className="grid grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)] gap-x-2 gap-y-1">
          <div className="row-span-2 flex flex-col justify-around">
            <Radio name="cj-fecha" label="Desde/Hasta" checked={f.fechaModo === 'desdeHasta'} onChange={() => set({ fechaModo: 'desdeHasta' })} />
            <Radio name="cj-fecha" label="Cualquiera" checked={f.fechaModo === 'cualquiera'} onChange={() => set({ fechaModo: 'cualquiera' })} />
          </div>
          {fechaCampo(f.fDesde, f.hDesde, (v) => set({ fDesde: v }), (v) => set({ hDesde: v }), f.fechaModo !== 'desdeHasta')}
          {fechaCampo(f.fHasta, f.hHasta, (v) => set({ fHasta: v }), (v) => set({ hHasta: v }), f.fechaModo !== 'desdeHasta')}
          <button type="button" className="col-span-2 h-[28px] border border-[var(--gw-border)] bg-[var(--gw-face)] text-[18px] hover:bg-[#e5f1fb]" onClick={asignarHorario}>
            Asignar un Horario de Apertura y/o Cierre Existente
          </button>
        </Marco>
        <Marco title="Hora" className="grid grid-cols-[170px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-2">
          <div className="flex flex-col gap-1">
            <Radio name="cj-hora" label="Desde/Hasta" checked={f.horaModo === 'desdeHasta'} onChange={() => set({ horaModo: 'desdeHasta' })} />
            <Radio name="cj-hora" label="Cualquiera" checked={f.horaModo === 'cualquiera'} onChange={() => set({ horaModo: 'cualquiera' })} />
          </div>
          <GwInput className={`${I} text-center`} placeholder=" : " value={f.horaDesde} maxLength={8} disabled={f.horaModo !== 'desdeHasta'} onChange={(e) => set({ horaDesde: e.target.value })} title="Hora desde (hh:mm)" />
          <GwInput className={`${I} text-center`} placeholder=" : " value={f.horaHasta} maxLength={8} disabled={f.horaModo !== 'desdeHasta'} onChange={(e) => set({ horaHasta: e.target.value })} title="Hora hasta (hh:mm)" />
        </Marco>
      </div>

      {/* Fila 3: Tienda y Número de Movimiento | Tipo Movimiento | D.C. Fra. */}
      <div className="grid grid-cols-[930fr_302fr_118fr] gap-2">
        <Marco title="Tienda y Número de Movimiento" className="grid grid-cols-[200px_minmax(0,1fr)] gap-x-2">
          {dhRadios('cj-tienda', f.tiendaModo, (m) => set({ tiendaModo: m }))}
          <div className="flex flex-col justify-between gap-1 py-0.5">
            <div className="grid grid-cols-[110px_minmax(0,1fr)_110px_minmax(0,1fr)] gap-x-2">
              <CampoLookup value={f.tDesde} onChange={(v) => set({ tDesde: v.toUpperCase() })} onBuscar={() => abrirLookup('tienda', (v) => set({ tDesde: v }))} />
              <CampoLookup num value={f.nDesde} onChange={(v) => set({ nDesde: v.replace(/\D/g, '') })} />
              <CampoLookup value={f.tHasta} onChange={(v) => set({ tHasta: v.toUpperCase() })} onBuscar={() => abrirLookup('tienda', (v) => set({ tHasta: v }))} />
              <CampoLookup num value={f.nHasta} onChange={(v) => set({ nHasta: v.replace(/\D/g, '') })} />
            </div>
            <span className="h-[3px]" />
            <Seleccion value={f.tiendasSel} onChange={(v) => set({ tiendasSel: v, tiendaModo: 'seleccionar' })} onBuscar={() => abrirLookup('tienda', (v) => set({ tiendasSel: anadir(f.tiendasSel, v), tiendaModo: 'seleccionar' }))} />
          </div>
        </Marco>
        <Marco title="Tipo Movimiento" className="grid grid-cols-2 gap-x-1.5 gap-y-1 py-0.5">
          {TIPOS_MOV.map((t) => (
            <Toggle key={t.codigo} label={t.filtro} on={f.tipos.has(t.codigo)} set={() => set({ tipos: alternar(f.tipos, t.codigo) })} title={`${t.codigo} — ${t.descripcion}`} />
          ))}
        </Marco>
        <Marco title="D.C. Fra." className="flex flex-col gap-1 py-0.5">
          {['1-04', '2-01', '3-02'].map((d) => (
            <Toggle key={d} label={d} on={f.dcFra.has(d)} set={() => set({ dcFra: alternar(f.dcFra, d) })} title="D.C. Fra.: pendiente de saber qué filtra en GeminisWin (no se aplica todavía)" />
          ))}
        </Marco>
      </div>

      {/* Fila 4: Documento / Tienda | Empleado */}
      <div className="grid grid-cols-[676fr_692fr] gap-5">
        <Marco
          title={
            <span className="flex items-center gap-12">
              <Radio name="cj-doccampo" label="Documento" checked={f.docCampo === 'documento'} onChange={() => set({ docCampo: 'documento' })} />
              <Radio name="cj-doccampo" label="Tienda" checked={f.docCampo === 'tienda'} onChange={() => set({ docCampo: 'tienda' })} />
            </span>
          }
          className="grid grid-cols-[200px_minmax(0,1fr)] gap-x-2"
        >
          {dhRadios('cj-doc', f.docModo, (m) => set({ docModo: m }))}
          <div className="flex flex-col justify-between gap-1 py-0.5">
            <div className="grid grid-cols-2 gap-x-3">
              <CampoLookup value={f.docDesde} onChange={(v) => set({ docDesde: v })} />
              <CampoLookup value={f.docHasta} onChange={(v) => set({ docHasta: v })} />
            </div>
            <Seleccion value={f.docSel} onChange={(v) => set({ docSel: v, docModo: 'seleccionar' })} onBuscar={() => f.docCampo === 'tienda' && abrirLookup('tienda', (v) => set({ docSel: anadir(f.docSel, v), docModo: 'seleccionar' }))} />
          </div>
        </Marco>
        <Marco title="Empleado" className="grid grid-cols-[200px_minmax(0,1fr)] gap-x-2">
          {dhRadios('cj-emp', f.empModo, (m) => set({ empModo: m }))}
          <div className="flex flex-col justify-between gap-1 py-0.5">
            <div className="grid grid-cols-2 gap-x-3">
              <CampoLookup value={f.empDesde} onChange={(v) => set({ empDesde: v.toUpperCase() })} onBuscar={() => abrirLookup('empleado', (v) => set({ empDesde: v, empModo: 'desdeHasta' }))} />
              <CampoLookup value={f.empHasta} onChange={(v) => set({ empHasta: v.toUpperCase() })} onBuscar={() => abrirLookup('empleado', (v) => set({ empHasta: v, empModo: 'desdeHasta' }))} />
            </div>
            <Seleccion value={f.empSel} onChange={(v) => set({ empSel: v, empModo: 'seleccionar' })} onBuscar={() => abrirLookup('empleado', (v) => set({ empSel: anadir(f.empSel, v), empModo: 'seleccionar' }))} />
          </div>
        </Marco>
      </div>

      {/* Fila 5: Forma de pago | Tipo de la forma de pago | Tipo Contado | Saldo */}
      <div className="grid grid-cols-[478fr_346fr_340fr_190fr] gap-2">
        <Marco title="Forma de pago" className="grid grid-cols-[180px_minmax(0,1fr)] gap-x-1.5">
          {dhRadios('cj-fp', f.fpModo, (m) => set({ fpModo: m }))}
          <div className="flex flex-col justify-between gap-1 py-0.5">
            <div className="grid grid-cols-2 gap-x-1.5">
              <CampoLookup value={f.fpDesde} onChange={(v) => set({ fpDesde: v.toUpperCase() })} onBuscar={() => abrirLookup('forma', (v) => set({ fpDesde: v, fpModo: 'desdeHasta' }))} />
              <CampoLookup value={f.fpHasta} onChange={(v) => set({ fpHasta: v.toUpperCase() })} onBuscar={() => abrirLookup('forma', (v) => set({ fpHasta: v, fpModo: 'desdeHasta' }))} />
            </div>
            <Seleccion value={f.fpSel} onChange={(v) => set({ fpSel: v, fpModo: 'seleccionar' })} onBuscar={() => abrirLookup('forma', (v) => set({ fpSel: anadir(f.fpSel, v), fpModo: 'seleccionar' }))} />
          </div>
        </Marco>
        <Marco title="Tipo de la forma de pago" className="grid grid-cols-2 content-center gap-x-1.5 gap-y-2.5 py-1">
          {TIPOS_FP.map((t) => (
            <Toggle key={t.v} label={t.label} on={f.tiposFp.has(t.v)} set={() => set({ tiposFp: alternar(f.tiposFp, t.v) })} />
          ))}
        </Marco>
        <Marco title="Tipo Contado" className="grid grid-cols-2 content-center gap-x-1.5 gap-y-2.5 py-1">
          {TIPOS_CONT.map((t) => (
            <Toggle key={t.v} label={t.label} on={f.tiposCont.has(t.v)} set={() => set({ tiposCont: alternar(f.tiposCont, t.v) })} />
          ))}
        </Marco>
        <Marco title="Saldo" className="flex flex-col gap-0.5 py-0.5">
          {(
            [
              ['ingresos', 'Ingresos'],
              ['gastos', 'Gastos'],
              ['negativo', 'Negativo'],
            ] as const
          ).map(([k, l]) => (
            <Toggle key={k} label={l} on={f.saldo.has(k)} set={() => set({ saldo: alternar(f.saldo, k) })} />
          ))}
        </Marco>
      </div>

      {/* Fila 6: ayuda F4 · salida · Procesar · Cerrar */}
      <div className="grid grid-cols-[236fr_784fr_198fr_198fr] items-stretch gap-2.5 border border-[var(--gw-border-light)] p-1">
        <span className={`${L} flex items-center gap-1 self-center whitespace-normal pl-1 text-[19px] leading-[24px]`}>
          <span className="flex-1">Pulse F4 para cerrar la ventana</span>
          <button type="button" className="gw-btn !h-[26px] !px-1.5 !text-[13px]" title="Cómo se usa esta ventana" onClick={() => setVerOperativa(true)}>
            Operativa
          </button>
        </span>
        <div className="grid grid-cols-4 border border-[var(--gw-border)] p-0.5">
          {(
            [
              ['pantalla', 'Pantalla', <Monitor key="i" size={15} />],
              ['impresora', 'Impresora', <Printer key="i" size={15} />],
              ['examinar', 'Examinar', <ScanSearch key="i" size={15} />],
              ['pdf', 'Doc. PDF', <FileText key="i" size={15} className="text-[#c42b1c]" />],
            ] as const
          ).map(([k, l, ico]) => (
            <button
              key={k}
              type="button"
              onClick={() => set({ salida: k })}
              className={`flex h-[50px] items-center justify-center gap-1.5 border text-[21px] ${f.salida === k ? 'border-[var(--gw-border)] bg-white shadow-[inset_1px_1px_2px_rgba(0,0,0,0.25)]' : 'border-transparent hover:bg-[#e5f1fb]'}`}
            >
              {ico}
              {l}
            </button>
          ))}
        </div>
        <button type="button" disabled={procesando} onClick={procesar} className="flex items-center justify-center gap-1.5 border border-[var(--gw-border)] text-[21px] hover:bg-[#e5f1fb]">
          <Check size={17} strokeWidth={3} className="text-[#2a9d2a]" />
          {procesando ? 'Procesando…' : 'Procesar'}
        </button>
        <button type="button" onClick={() => navigate('/')} className="flex items-center justify-center gap-1.5 border border-[var(--gw-border)] text-[21px] hover:bg-[#e5f1fb]">
          <DoorOpen size={17} className="text-[#1d3a8a]" />
          Cerrar
        </button>
      </div>
      {aviso && <p className="gw-label px-1 !text-[#c42b1c]">{aviso}</p>}

      {resultado && (
        <ResultadoInforme
          f={f}
          filas={resultado.filas}
          credito={resultado.credito}
          truncado={resultado.truncado}
          imprimir={resultado.imprimir}
          tiendas={tiendas}
          onClose={() => setResultado(null)}
        />
      )}
      {lookup && (
        <GwLookupDialog<Record<string, unknown>>
          title={lookup.tabla === 'tienda' ? 'Tiendas / terminales' : lookup.tabla === 'empleado' ? 'Empleados' : 'Formas de pago'}
          table={lookup.tabla === 'tienda' ? 'tienda_terminal' : lookup.tabla === 'empleado' ? 'empleado' : 'forma_pago'}
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: lookup.tabla === 'empleado' ? 'nombre' : 'descripcion', label: lookup.tabla === 'empleado' ? 'Nombre' : 'Descripción' },
          ]}
          searchColumns={['codigo', lookup.tabla === 'empleado' ? 'nombre' : 'descripcion']}
          orderBy="codigo"
          keyColumn="codigo"
          onPick={(r) => {
            lookup.aplicar(String(r.codigo))
            setLookup(null)
          }}
          onClose={() => setLookup(null)}
        />
      )}
      {listaOrd.dialogo}
      {verOperativa && (
        <VentanaOperativa
          onCerrar={() => setVerOperativa(false)}
          bloques={[
            {
              titulo: 'Sacar un informe de caja',
              pasos: [
                'Elige el informe y el orden de salida. «Sólo Ver los Totales» quita el detalle.',
                'Fecha y Hora: tramo de los movimientos (sale de hoy a ahora). «Asignar un Horario de Apertura y/o Cierre Existente» copia las horas de una caja ya abierta o cerrada.',
                'Tienda y Número de Movimiento, Documento/Tienda, Empleado y Forma de pago: Desde/Hasta, Cualquiera o Seleccionar (códigos separados por comas).',
                'Botones ✓/× (Tipo Movimiento, Tipo de la forma de pago, Tipo Contado, Saldo): con ✓ se filtra por eso; todo en × = sin filtrar.',
                'Elige el destino (Pantalla, Impresora, Examinar o Doc. PDF) y pulsa Procesar.',
              ],
              notas: [
                '«(impresora de Tickets)» saca el listado en el ancho de 80 mm del ticket.',
                '«Listado por Tipos de Pago / de Movimiento» lleva subtotal por cada tipo; los «Totales de movimientos por…» dan una línea por grupo.',
                '«Incluir el Total de las Ventas de Crédito» añade lo pendiente de cobro de las ventas del periodo.',
                'D.C. Fra. aún no filtra (pendiente de saber qué hace en GeminisWin).',
              ],
            },
          ]}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ resultado del informe */

interface Grupo {
  clave: string
  titulo: string
  n: number
  ing: number
  gas: number
}

function agrupar(filas: Fila[], por: (m: Fila) => [string, string]): Grupo[] {
  const m = new Map<string, Grupo>()
  for (const x of filas) {
    const [k, t] = por(x)
    const g = m.get(k) ?? { clave: k, titulo: t, n: 0, ing: 0, gas: 0 }
    g.n++
    g.ing += Number(x.ingreso ?? 0)
    g.gas += Number(x.gasto ?? 0)
    m.set(k, g)
  }
  return [...m.values()].sort((a, b) => (a.clave < b.clave ? -1 : 1))
}

function csv(celdas: (string | number | null | undefined)[][]) {
  return celdas
    .map((r) =>
      r
        .map((c) => {
          const v = c == null ? '' : typeof c === 'number' ? String(c).replace('.', ',') : c
          return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v
        })
        .join(';'),
    )
    .join('\r\n')
}

function ResultadoInforme({
  f,
  filas,
  credito,
  truncado,
  imprimir,
  tiendas,
  onClose,
}: {
  f: Filtros
  filas: Fila[]
  credito: number
  truncado: boolean
  imprimir: boolean
  tiendas: TiendaCaja[]
  onClose: () => void
}) {
  const nombreTienda = (t: string) => tiendas.find((x) => x.codigo === t)?.descripcion ?? ''
  const totIng = r3(filas.reduce((s, m) => s + Number(m.ingreso ?? 0), 0))
  const totGas = r3(filas.reduce((s, m) => s + Number(m.gasto ?? 0), 0))
  const titulo = INFORMES.find((x) => x.v === f.informe)!.label
  const periodo =
    f.fechaModo === 'desdeHasta' ? `Del ${fechaGw(f.fDesde)} ${f.hDesde} al ${fechaGw(f.fHasta)} ${f.hHasta}` : 'Cualquier fecha'
  const tiendasTxt =
    f.tiendaModo === 'desdeHasta'
      ? `Tiendas ${f.tDesde || '…'} a ${f.tHasta || '…'}`
      : f.tiendaModo === 'seleccionar'
        ? `Tiendas ${lista(f.tiendasSel).join(', ')}`
        : 'Todas las tiendas'

  const porContado = useMemo(() => {
    const t = { efectivo: 0, tarjeta: 0, cheque: 0, otros: 0 }
    for (const m of filas) {
      const tf = m.tipo_forma_pago ?? m._fp?.tipo ?? 4
      const tc = m.tipo_contado || m._fp?.tipo_contado || 1
      const neto = Number(m.ingreso ?? 0) - Number(m.gasto ?? 0)
      if (tf !== 4) t.otros += neto
      else if (tc === 2) t.tarjeta += neto
      else if (tc === 3) t.cheque += neto
      else t.efectivo += neto
    }
    return t
  }, [filas])

  const grupos: Grupo[] | null = useMemo(() => {
    const fp = (m: Fila) => `${m.forma_pago_codigo ?? '(sin forma de pago)'} ${m._fp?.descripcion ?? ''}`
    const tie = (m: Fila) => `${m.tienda_terminal_codigo} ${nombreTienda(m.tienda_terminal_codigo)}`
    const mes = (m: Fila) => (m.fecha ?? '').slice(0, 7)
    const mesTxt = (m: Fila) => mes(m).split('-').reverse().join('/')
    switch (f.informe) {
      case 'formas':
        return agrupar(filas, (m) => [m.forma_pago_codigo ?? '', fp(m)])
      case 'formas_mes':
        return agrupar(filas, (m) => [`${m.forma_pago_codigo ?? ''}|${mes(m)}`, `${fp(m)} · ${mesTxt(m)}`])
      case 'tienda':
        return agrupar(filas, (m) => [m.tienda_terminal_codigo, tie(m)])
      case 'fecha_tienda':
        return agrupar(filas, (m) => [`${m.fecha}|${m.tienda_terminal_codigo}`, `${fechaGw(m.fecha)} · ${tie(m)}`])
      case 'tienda_fecha':
        return agrupar(filas, (m) => [`${m.tienda_terminal_codigo}|${m.fecha}`, `${tie(m)} · ${fechaGw(m.fecha)}`])
      case 'tienda_mes':
        return agrupar(filas, (m) => [`${m.tienda_terminal_codigo}|${mes(m)}`, `${tie(m)} · ${mesTxt(m)}`])
      default:
        return null
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f.informe, filas])

  useEffect(() => {
    if (!imprimir) return
    const t = setTimeout(() => window.print(), 300)
    return () => clearTimeout(t)
  }, [imprimir])

  function exportar() {
    const filasCsv: (string | number | null)[][] = grupos
      ? [['Grupo', 'Movimientos', 'Ingresos', 'Gastos', 'Saldo'], ...grupos.map((g) => [g.titulo, g.n, r3(g.ing), r3(g.gas), r3(g.ing - g.gas)])]
      : [
          ['Tienda', 'Número', 'Fecha', 'Hora', 'Tipo', 'Forma de pago', 'Documento', 'Empleado', 'Concepto', 'Ingreso', 'Gasto', 'Anulado'],
          ...filas.map((m) => [
            m.tienda_terminal_codigo,
            m.numero,
            fechaGw(m.fecha),
            m.hora,
            m.tipo_movimiento,
            m._fp?.descripcion ?? m.forma_pago_codigo,
            textoDocumento(m),
            m.empleado_codigo,
            m.concepto,
            r3(Number(m.ingreso ?? 0)),
            r3(Number(m.gasto ?? 0)),
            m.activo ? '' : 'S',
          ]),
        ]
    filasCsv.push([], ['Total ingresos', totIng], ['Total gastos', totGas], ['Saldo', r3(totIng - totGas)])
    if (f.incluirCredito) filasCsv.push(['Total ventas de crédito', credito])
    const blob = new Blob(['﻿' + csv(filasCsv)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `informe-caja-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  // Subtotales por tienda en el listado ordenado por tienda.
  const detalle: ({ tipo: 'fila'; m: Fila } | { tipo: 'sub'; t: string; ing: number; gas: number; n: number })[] = []
  // Subtotal por grupo: tipo de forma de pago / tipo de movimiento en sus listados, y tienda en el
  // listado ordenado por tienda.
  const grupoDe = (m: Fila): [string, string] | null => {
    if (f.informe === 'tipos_pago') {
      const t = m.tipo_forma_pago ?? m._fp?.tipo ?? 4
      return [String(t), `tipo de pago ${TIPOS_FP.find((x) => x.v === t)?.label ?? t}`]
    }
    if (f.informe === 'tipos_mov')
      return [m.tipo_movimiento ?? '', `tipo de movimiento ${m.tipo_movimiento ?? ''} ${TIPOS_MOV.find((t) => t.codigo === m.tipo_movimiento)?.descripcion ?? ''}`]
    if (f.orden === 'tienda') return [m.tienda_terminal_codigo, `tienda ${m.tienda_terminal_codigo} ${nombreTienda(m.tienda_terminal_codigo)}`]
    return null
  }
  if (!grupos && !f.soloTotales) {
    let actual: [string, string] | null = null
    let acc = { ing: 0, gas: 0, n: 0 }
    const claves = new Set(filas.map((x) => grupoDe(x)?.[0] ?? ''))
    for (const m of filas) {
      const g = grupoDe(m)
      if (g && actual && g[0] !== actual[0]) {
        detalle.push({ tipo: 'sub', t: actual[1], ...acc })
        acc = { ing: 0, gas: 0, n: 0 }
      }
      actual = g
      acc = { ing: acc.ing + Number(m.ingreso ?? 0), gas: acc.gas + Number(m.gasto ?? 0), n: acc.n + 1 }
      detalle.push({ tipo: 'fila', m })
    }
    if (actual && (claves.size > 1 || f.informe === 'tipos_pago' || f.informe === 'tipos_mov')) detalle.push({ tipo: 'sub', t: actual[1], ...acc })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-16" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title={`Informes de Caja — ${titulo}`} onClose={onClose} className="informe-impresion w-[1260px] max-w-[98vw]">
        <div className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between px-1">
            <b className="text-[17px]">{titulo}</b>
            <span className="text-[13px]">
              {periodo} · {tiendasTxt}
              {f.horaModo === 'desdeHasta' ? ` · Hora ${f.horaDesde || '…'} a ${f.horaHasta || '…'}` : ''}
            </span>
          </div>
          {truncado && <p className="gw-label px-1 !text-[#c42b1c]">Hay más de 50.000 movimientos: estrecha el filtro de fechas o tiendas.</p>}
          {!f.soloTotales && (
            <div className="informe-scroll h-[440px] max-h-[58vh] overflow-auto border border-[var(--gw-border)] bg-white">
              {grupos ? (
                <table className="gw-grid">
                  <thead className="sticky top-0">
                    <tr>
                      <th>{f.informe === 'formas' ? 'Forma de pago' : f.informe === 'formas_mes' ? 'Forma de pago · Mes' : f.informe === 'tienda' ? 'Tienda' : f.informe === 'fecha_tienda' ? 'Fecha · Tienda' : f.informe === 'tienda_mes' ? 'Tienda · Mes' : 'Tienda · Fecha'}</th>
                      <th className="text-right!" style={{ width: 110 }}>Movimientos</th>
                      <th className="text-right!" style={{ width: 130 }}>Ingresos</th>
                      <th className="text-right!" style={{ width: 130 }}>Gastos</th>
                      <th className="text-right!" style={{ width: 130 }}>Saldo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map((g) => (
                      <tr key={g.clave}>
                        <td>{g.titulo}</td>
                        <td className="text-right tabular-nums">{g.n}</td>
                        <td className="text-right tabular-nums">{formatGw(g.ing, 3)}</td>
                        <td className="text-right tabular-nums">{formatGw(g.gas, 3)}</td>
                        <td className="text-right tabular-nums">{formatGw(g.ing - g.gas, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : f.informe === 'tickets' ? (
                // Formato de la impresora de tickets (80 mm): número, hora, concepto e importe.
                <div className="mx-auto w-[80mm] bg-white p-1 font-mono text-[11px] leading-[14px]">
                  <div className="text-center font-bold">INFORME DE CAJA</div>
                  <div className="text-center">{periodo}</div>
                  <div className="mb-1 border-b border-dashed border-black text-center">{tiendasTxt}</div>
                  {detalle.length === 0 && <div className="text-center">No hay movimientos con estos filtros.</div>}
                  {detalle.map((d, i) =>
                    d.tipo === 'fila' ? (
                      <div key={`${d.m.tienda_terminal_codigo}|${d.m.numero}`} className={`flex gap-1 ${d.m.activo ? '' : 'line-through'}`}>
                        <span className="w-[42px] flex-none">{d.m.numero}</span>
                        <span className="w-[36px] flex-none">{(d.m.hora ?? '').slice(0, 5)}</span>
                        <span className="w-[18px] flex-none">{d.m.tipo_movimiento}</span>
                        <span className="min-w-0 flex-1 truncate">{d.m.concepto || textoDocumento(d.m)}</span>
                        <span className="w-[62px] flex-none text-right">{formatGw(Number(d.m.ingreso ?? 0) - Number(d.m.gasto ?? 0), 2)}</span>
                      </div>
                    ) : (
                      <div key={`sub${i}`} className="flex border-t border-dashed border-black font-bold">
                        <span className="flex-1">Total {d.t}</span>
                        <span>{formatGw(d.ing - d.gas, 2)}</span>
                      </div>
                    ),
                  )}
                  <div className="mt-1 border-t border-dashed border-black">
                    <div className="flex justify-between"><span>Ingresos</span><span>{formatGw(totIng, 2)}</span></div>
                    <div className="flex justify-between"><span>Gastos</span><span>{formatGw(totGas, 2)}</span></div>
                    <div className="flex justify-between font-bold"><span>Saldo</span><span>{formatGw(totIng - totGas, 2)}</span></div>
                  </div>
                </div>
              ) : (
                <table className="gw-grid table-fixed">
                  <thead className="sticky top-0">
                    <tr>
                      <th style={{ width: 52 }}>Tienda</th>
                      <th className="text-right!" style={{ width: 86 }}>Número</th>
                      <th style={{ width: 90 }}>Fecha</th>
                      <th style={{ width: 70 }}>Hora</th>
                      <th style={{ width: 44 }}>Tipo</th>
                      <th style={{ width: 150 }}>Forma de pago</th>
                      <th style={{ width: 130 }}>Documento</th>
                      <th style={{ width: 64 }}>Empl.</th>
                      {f.informe === 'detallado' && <th style={{ width: 150 }}>Cliente</th>}
                      <th>Concepto</th>
                      <th className="text-right!" style={{ width: 100 }}>Ingreso</th>
                      <th className="text-right!" style={{ width: 100 }}>Gasto</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.length === 0 && (
                      <tr>
                        <td colSpan={f.informe === 'detallado' ? 12 : 11} className="text-center text-[#6d6d6d]">
                          No hay movimientos con estos filtros.
                        </td>
                      </tr>
                    )}
                    {detalle.map((d, i) =>
                      d.tipo === 'fila' ? (
                        <tr key={`${d.m.tienda_terminal_codigo}|${d.m.numero}`} className={d.m.activo ? '' : 'text-[#8a8a8a] line-through'}>
                          <td>{d.m.tienda_terminal_codigo}</td>
                          <td className="text-right tabular-nums">{d.m.numero}</td>
                          <td>{fechaGw(d.m.fecha)}</td>
                          <td>{d.m.hora}</td>
                          <td>{d.m.tipo_movimiento}</td>
                          <td className="truncate">{d.m._fp?.descripcion ?? d.m.forma_pago_codigo}</td>
                          <td className="truncate">{textoDocumento(d.m)}</td>
                          <td>{d.m.empleado_codigo}</td>
                          {f.informe === 'detallado' && <td className="truncate">{d.m.cliente_codigo ?? ''}</td>}
                          <td className={f.informe === 'detallado' ? 'whitespace-normal' : 'truncate'} title={d.m.concepto ?? ''}>
                            {d.m.concepto}
                          </td>
                          <td className="text-right tabular-nums">{Number(d.m.ingreso ?? 0) ? formatGw(d.m.ingreso, 3) : ''}</td>
                          <td className="text-right tabular-nums">{Number(d.m.gasto ?? 0) ? formatGw(d.m.gasto, 3) : ''}</td>
                        </tr>
                      ) : (
                        <tr key={`sub${i}`} className="bg-[#f3f3f3] font-bold">
                          <td colSpan={f.informe === 'detallado' ? 10 : 9}>
                            Total {d.t} ({d.n} movimientos)
                          </td>
                          <td className="text-right tabular-nums">{formatGw(d.ing, 3)}</td>
                          <td className="text-right tabular-nums">{formatGw(d.gas, 3)}</td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Totales del informe */}
          <div className="grid grid-cols-[repeat(4,minmax(0,1fr))] gap-2 border border-[var(--gw-border-light)] p-1.5 text-[15px]">
            <span>
              Movimientos: <b className="tabular-nums">{filas.length}</b>
            </span>
            <span>
              Total ingresos: <b className="tabular-nums">{formatGw(totIng, 3)}</b>
            </span>
            <span>
              Total gastos: <b className="tabular-nums">{formatGw(totGas, 3)}</b>
            </span>
            <span>
              Saldo: <b className="tabular-nums">{formatGw(totIng - totGas, 3)}</b>
            </span>
            <span>
              Efectivo: <b className="tabular-nums">{formatGw(porContado.efectivo, 3)}</b>
            </span>
            <span>
              Tarjetas: <b className="tabular-nums">{formatGw(porContado.tarjeta, 3)}</b>
            </span>
            <span>
              Cheques: <b className="tabular-nums">{formatGw(porContado.cheque, 3)}</b>
            </span>
            <span>
              Bancos / efectos / crédito: <b className="tabular-nums">{formatGw(porContado.otros, 3)}</b>
            </span>
            {f.incluirCredito && (
              <span className="col-span-4">
                Total de las ventas de crédito (pendiente de cobro): <b className="tabular-nums">{formatGw(credito, 3)}</b>
              </span>
            )}
          </div>

          <div className="no-imprimir flex justify-end gap-1.5">
            <button type="button" className="gw-btn !h-[32px] w-[140px] !text-[15px]" onClick={exportar}>
              <FileDown size={15} className="text-[#127a12]" />
              Exportar CSV
            </button>
            <button type="button" className="gw-btn !h-[32px] w-[140px] !text-[15px]" onClick={() => window.print()}>
              <Printer size={15} className="text-[#1d3a8a]" />
              Imprimir / PDF
            </button>
            <button type="button" className="gw-btn !h-[32px] w-[140px] !text-[15px]" onClick={onClose}>
              <DoorOpen size={15} className="text-[#1d3a8a]" />
              Cerrar
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}
