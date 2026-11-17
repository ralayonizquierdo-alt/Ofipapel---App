// Diario «como en CONTANET» (Rober, 16/11/2026): PRIMERA PRUEBA para que la vea Mónica.
//
// Calco de la pantalla principal de ContaNet 6.0 (capturas 01-86, que no están en el repositorio): el
// diario ES la pantalla; una rejilla de apuntes con letra grande, la línea de entrada debajo, los botones
// Debe / Haber y la zona de estado con los totales. Colores y letra del ERP; la barra de botones, en el
// mismo orden que la de CONTANET.
//
// Por debajo usa el motor del ERP sin tocarlo (fn_contab_guardar_asiento): el asiento se guarda solo
// cuando cuadra, con todos sus controles (mes cerrado, doble firma, cuentas que existen).
//
// Lo que TODAVÍA NO hace (no hay dónde guardarlo; va en la siguiente tanda, con migración):
// tipo de diario, canal por apunte, punteo, apuntes modelo y centros de costo. Se ven en gris.
// Enseña los últimos asientos del diario; los totales los calcula el servidor.

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  BadgeMinus, BadgePlus, BookOpenCheck, Briefcase, Calculator, Check, ClipboardPaste, Copy, FilePlus2, FileSearch, FolderOpen, PieChart, Printer,
  RefreshCw, Replace, Save, Scale, Scissors, ShieldCheck, StickyNote, Table2, Undo2, Wallet, Wrench, type LucideIcon,
} from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { cargarDescripciones, ejercicioContable, hoy, r2 } from './contabModel'
import { Aviso } from './ui'

interface Fila {
  cuenta: string
  fecha: string
  asiento: number | null
  descripcion: string
  ref: string
  canal: string
  importe: number // positivo = debe, negativo = haber (como lo pinta CONTANET)
  pendiente?: boolean
}

const imp = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) // de-DE: pone el punto de millar también en 1.234,56
const num6 = (n: number | null) => (n == null ? '' : String(n).padStart(6, '0'))
const ddmm = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

/** «16/11», «1611» o «16» → fecha ISO dentro del ejercicio. */
function fechaDe(txt: string, anio: number): string | null {
  const t = txt.trim()
  if (!t) return null
  const m = t.match(/^(\d{1,2})[/\-.]?(\d{1,2})?$/)
  if (!m) return null
  const d = Number(m[1])
  const mes = m[2] ? Number(m[2]) : Number(hoy().slice(5, 7))
  if (d < 1 || d > 31 || mes < 1 || mes > 12) return null
  return `${anio}-${String(mes).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

const numero = (txt: string) => {
  const n = Number(txt.replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? r2(n) : 0
}

// Conceptos Contables (F7) de la captura 74. Cuando lleguen los datos de CONTANET se cargan los reales.
const CONCEPTOS = ['FRA. Nº', 'PAGO FRA. Nº', 'VENTA S/.FRA.', 'COMPRA S/.FRA.', 'INGRESO BANCO Nº', 'PAGO ALQUILER', 'CGO. BCO. S.S. MES', 'CGO. SEGURO AUTÓNOMO', 'SUELDO MES', 'PGO. CUOTAS', 'PAGO ABASTEC. AGUA MES']
const TIPOS_DIARIO = ['Diario de Ventas', 'Diario de Compras', 'Diario de Gastos', 'Diario de Bancos', 'Diario de Caja']
/** Asientos que se enseñan al abrir: los últimos del diario. */
const ULTIMOS = 60
const TIPOS_IGIC = [0, 1, 3, 5, 7, 9.5, 15, 20]

export function DiarioContanetPage() {
  const anio = ejercicioContable()
  const ir = useNavigate()
  const [filas, setFilas] = useState<Fila[]>([])
  const [titulos, setTitulos] = useState<Map<string, string>>(new Map())
  const [siguiente, setSiguiente] = useState(1)
  const [enCurso, setEnCurso] = useState<Fila[]>([])
  const [error, setError] = useState<string | null>(null)
  const [ok, setOk] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [ventana, setVentana] = useState<null | 'rep' | 'sop' | 'conceptos'>(null)
  // Línea de entrada
  const [cuenta, setCuenta] = useState('')
  const [fecha, setFecha] = useState(ddmm(hoy()))
  const [desc, setDesc] = useState('')
  const [ref, setRef] = useState('')
  const [importe, setImporte] = useState('')
  const rCuenta = useRef<HTMLInputElement>(null)
  const rFin = useRef<HTMLDivElement>(null)

  // Solo se traen los últimos asientos (como CONTANET, que abre por el final del diario); los totales
  // del año los da el servidor. Un año real son más de 200.000 líneas.
  const [total, setTotal] = useState({ debe: 0, haber: 0 })
  const cargar = useCallback(async () => {
    setCargando(true)
    try {
      const { data: res, error: e1 } = await supabase.rpc('fn_contab_diario_resumen', { p_anio: anio })
      if (e1) throw new Error(e1.message)
      const r = res as { debe: number; haber: number; siguiente: number }
      setTotal({ debe: Number(r.debe), haber: Number(r.haber) })
      setSiguiente(Number(r.siguiente))
      const { data: asientos, error: e2 } = await supabase
        .from('asiento')
        .select('id, numero, fecha, concepto, origen_tienda_codigo')
        .eq('ejercicio', anio)
        .eq('estado', 'correcto')
        .order('numero', { ascending: false, nullsFirst: false })
        .order('id', { ascending: false })
        .limit(ULTIMOS)
      if (e2) throw new Error(e2.message)
      const lista = (asientos ?? []).reverse()
      const { data: aps, error: e3 } = await supabase.from('apunte').select('asiento_id, linea, cuenta, debe, haber, concepto, documento').in('asiento_id', lista.map((a) => a.id)).order('linea').limit(5000)
      if (e3) throw new Error(e3.message)
      const out: Fila[] = []
      for (const a of lista)
        for (const p of (aps ?? []).filter((x) => x.asiento_id === a.id))
          out.push({ cuenta: p.cuenta ?? '', fecha: a.fecha, asiento: a.numero, descripcion: p.concepto ?? a.concepto, ref: p.documento ?? '', canal: a.origen_tienda_codigo ?? '', importe: r2(Number(p.debe) - Number(p.haber)) })
      setFilas(out)
      setTitulos(new Map([...(await cargarDescripciones(out.map((f) => f.cuenta)))].map(([c, v]) => [c, v.descripcion])))
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
    setCargando(false)
  }, [anio])
  useEffect(() => {
    void cargar()
  }, [cargar])
  useEffect(() => {
    rFin.current?.scrollIntoView({ block: 'end' })
  }, [filas.length, enCurso.length])

  // Título y acumulados de la cuenta que se está tecleando
  const [tituloCuenta, setTituloCuenta] = useState('')
  const [deCuenta, setDeCuenta] = useState({ debe: 0, haber: 0 })
  useEffect(() => {
    if (!/^\d{3,}$/.test(cuenta)) {
      setTituloCuenta('')
      setDeCuenta({ debe: 0, haber: 0 })
      return
    }
    let vivo = true
    supabase.from('cuenta_contable').select('descripcion').eq('codigo', cuenta).maybeSingle().then(({ data }) => vivo && setTituloCuenta(data?.descripcion ?? '*** No existe en el Plan ***'))
    supabase.rpc('fn_contab_cuenta_totales', { p_cuenta: cuenta, p_anio: anio }).then(({ data }) => vivo && data && setDeCuenta({ debe: Number((data as { debe: number }).debe), haber: Number((data as { haber: number }).haber) }))
    return () => {
      vivo = false
    }
  }, [cuenta, anio])

  const suma = (fs: Fila[]) => ({ debe: r2(fs.reduce((s, f) => s + (f.importe > 0 ? f.importe : 0), 0)), haber: r2(fs.reduce((s, f) => s + (f.importe < 0 ? -f.importe : 0), 0)) })
  const delAsiento = suma(enCurso)
  const descuadre = r2(delAsiento.debe - delAsiento.haber)

  async function guardar(lineas: Fila[]) {
    setError(null)
    const f = lineas[0].fecha
    const { data, error: e } = await supabase.rpc('fn_contab_guardar_asiento', {
      p_id: null,
      p_fecha: f,
      p_concepto: lineas[0].descripcion,
      p_tienda: null,
      p_apuntes: lineas.map((l) => ({ cuenta: l.cuenta, debe: l.importe > 0 ? l.importe : 0, haber: l.importe < 0 ? -l.importe : 0, concepto: l.descripcion, documento: l.ref })),
    })
    if (e) return setError(e.message)
    setEnCurso([])
    setOk(Number(data) < 0 ? 'Asiento de importe alto: queda pendiente de la segunda firma (Control y firmas).' : 'Asiento guardado.')
    await cargar()
  }

  function anotar(lado: 'debe' | 'haber') {
    setError(null)
    setOk(null)
    const n = Math.abs(numero(importe))
    const f = fechaDe(fecha, anio)
    if (!cuenta) return setError('Falta el código de la cuenta.')
    if (!f) return setError('La fecha no vale. Escribe día y mes: 16/11.')
    if (!n) return setError('Falta el importe.')
    const nuevas = [...enCurso, { cuenta, fecha: f, asiento: siguiente, descripcion: desc, ref, canal: '', importe: lado === 'debe' ? n : -n, pendiente: true }]
    setEnCurso(nuevas)
    setCuenta('')
    setImporte('')
    rCuenta.current?.focus()
    const s = suma(nuevas)
    if (nuevas.length >= 2 && s.debe === s.haber) void guardar(nuevas)
  }

  // Teclas de CONTANET: F4 plan, F5 extractos, F7 conceptos, F8 / F9 grabar IGIC.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const m: Record<string, () => void> = { F4: () => ir('/contabilidad/plan-cuentas'), F6: () => ir('/contabilidad/plan-cuentas'), F5: () => ir('/contabilidad/mayor'), F7: () => setVentana('conceptos'), F8: () => setVentana('rep'), F9: () => setVentana('sop') }
      if (m[e.key]) {
        e.preventDefault()
        m[e.key]()
      }
    }
    window.addEventListener('keydown', tecla)
    return () => window.removeEventListener('keydown', tecla)
  }, [ir])

  const todas = [...filas, ...enCurso]
  const celda = 'border-r border-b border-[#c9d7ee] px-1.5'
  const entrada = 'h-[30px] w-full border-0 bg-white px-1.5 text-[19px] outline-none focus:bg-[#fffbe0]'

  return (
    <div className="flex min-w-0 flex-col gap-1">
      {/* Barra de botones, en el orden de la de CONTANET */}
      <div className="flex flex-wrap items-center gap-0.5 border border-[var(--gw-border-light)] bg-[var(--gw-face)] px-1 py-0.5 print:hidden">
        {/* Los 27 botones de CONTANET, con su mismo texto y orden (lista de Cowork, 17/11/2026). */}
        <Boton icono={RefreshCw} color="#1e6fc2" titulo="Actualizar" onClick={() => void cargar()} />
        <Boton icono={FilePlus2} color="#6b7280" titulo="Nuevo" onClick={() => (setCuenta(''), setDesc(''), setRef(''), setImporte(''))} />
        <Boton icono={FolderOpen} color="#d99a06" titulo="Abrir (la empresa se elige arriba, en la barra del ejercicio)" />
        <Boton icono={Save} color="#374151" titulo="Actualizar (el asiento se guarda solo cuando cuadra)" />
        <Sep />
        <Boton icono={Printer} color="#374151" titulo="Imprimir" onClick={() => window.print()} />
        <Sep />
        <Boton icono={Scissors} color="#1e6fc2" titulo="Cortar" />
        <Boton icono={Copy} color="#6b7280" titulo="Copiar" />
        <Boton icono={ClipboardPaste} color="#6b7280" titulo="Pegar" />
        <Sep />
        <Boton icono={Undo2} color="#1e6fc2" titulo="Deshacer último borrado (quita la última línea sin guardar)" onClick={enCurso.length ? () => setEnCurso(enCurso.slice(0, -1)) : undefined} />
        <Boton icono={Table2} color="#b91c1c" titulo="Consultar Acumulados de la Cuenta (F4)" onClick={() => ir('/contabilidad/plan-cuentas')} />
        <Boton icono={FileSearch} color="#374151" titulo="Consultar Extracto (F5)" onClick={() => ir('/contabilidad/mayor')} />
        <Boton icono={BookOpenCheck} color="#c2410c" titulo="Buscar Cuenta en Plan Contable (F6)" onClick={() => ir('/contabilidad/plan-cuentas')} />
        <Boton icono={PieChart} color="#16a34a" titulo="Ver Gráfico de la Cuenta (pendiente)" />
        <Boton icono={Wrench} color="#6b7280" titulo="Personalización (pendiente)" />
        <Boton icono={Replace} color="#7c3aed" titulo="Buscar y Reemplazar (pendiente)" />
        <Boton icono={BadgePlus} color="#16a34a" titulo="IVA Soportado (F9): factura de compra" etiqueta="IVA" onClick={() => setVentana('sop')} />
        <Boton icono={BadgeMinus} color="#dc2626" titulo="IVA Repercutido (F8): factura de venta" etiqueta="IVA" onClick={() => setVentana('rep')} />
        <Boton icono={Briefcase} color="#b45309" titulo="Grabar Cartera (no se usa en Ofipapel)" />
        <Boton icono={Check} color="#16a34a" titulo="Punteo (pendiente)" />
        <Boton icono={StickyNote} color="#eab308" titulo="Notas (pendiente)" />
        <Boton icono={Wallet} color="#15803d" titulo="Conciliación Bancaria" onClick={() => ir('/contabilidad/conciliacion')} />
        <Sep />
        <Boton icono={Scale} color="#b45309" titulo="Balance de Sumas y Saldos" onClick={() => ir('/contabilidad/sumas-saldos')} />
        <Boton icono={ShieldCheck} color="#1e6fc2" titulo="Auditoría y Recálculo: Control y firmas" onClick={() => ir('/contabilidad/control')} />
        <Boton icono={Calculator} color="#7c3aed" titulo="Conceptos Contables (F7)" onClick={() => setVentana('conceptos')} />
        <span className="ml-2 text-[12px] text-[#555]">Prueba del diario como en CONTANET · ejercicio {anio}</span>
      </div>

      {/* Rejilla del diario */}
      <div className="h-[calc(100vh-430px)] min-h-[220px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="w-full border-collapse text-[19px] leading-[26px]">
          <thead className="sticky top-0 z-10 bg-[#e8eef9] text-[15px] font-normal">
            <tr>
              <th className={`${celda} w-[18px]`}>*</th>
              <th className={`${celda} w-[130px]`}>Código</th>
              <th className={`${celda} w-[72px]`}>Fecha</th>
              <th className={`${celda} w-[86px]`}>Asiento</th>
              <th className={celda}>Descripción</th>
              <th className={`${celda} w-[190px]`}>Ref.</th>
              <th className={`${celda} w-[44px]`}>C</th>
              <th className={`${celda} w-[250px]`}>Importe</th>
              <th className={`${celda} w-[22px]`}>$</th>
            </tr>
          </thead>
          <tbody>
            {todas.map((f, i) => (
              <tr key={i} className={f.pendiente ? 'bg-[#fffbe0]' : undefined} title={titulos.get(f.cuenta) ?? undefined}>
                <td className={celda} />
                <td className={celda}>{f.cuenta}</td>
                <td className={celda}>{ddmm(f.fecha)}</td>
                <td className={`${celda} ${f.pendiente ? 'text-[#888]' : ''}`}>{num6(f.asiento)}</td>
                <td className={`${celda} max-w-0 truncate`}>{f.descripcion}</td>
                <td className={`${celda} max-w-0 truncate`}>{f.ref}</td>
                <td className={celda}>{f.canal}</td>
                <td className={`${celda} tabular-nums ${f.importe < 0 ? 'text-right text-[#e00000]' : 'pr-[110px] text-right'}`}>{imp(f.importe)}</td>
                <td className={celda}>€</td>
              </tr>
            ))}
            {!todas.length && (
              <tr>
                <td colSpan={9} className="px-2 py-3 text-[14px] text-[#555]">
                  {cargando ? 'Cargando el diario…' : `No hay asientos en ${anio}.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div ref={rFin} />
      </div>

      {/* Línea de entrada y botones Debe / Haber */}
      <form
        className="border border-[var(--gw-border)] bg-white print:hidden"
        onSubmit={(e) => {
          e.preventDefault()
          anotar(numero(importe) < 0 ? 'haber' : 'debe')
        }}
      >
        <div className="grid grid-cols-[148px_72px_86px_1fr_190px_44px_272px] divide-x divide-[#c9d7ee]">
          <input ref={rCuenta} aria-label="Código" className={entrada} value={cuenta} maxLength={10} onChange={(e) => setCuenta(e.target.value.replace(/\D/g, ''))} autoFocus />
          <input aria-label="Fecha" className={entrada} value={fecha} maxLength={5} onChange={(e) => setFecha(e.target.value)} />
          <div className="px-1.5 text-[19px] leading-[30px] text-[#999]">{num6(siguiente)}</div>
          <input aria-label="Descripción" className={entrada} value={desc} maxLength={200} list="contanet-conceptos" onChange={(e) => setDesc(e.target.value)} />
          <input aria-label="Referencia" className={entrada} value={ref} maxLength={40} onChange={(e) => setRef(e.target.value)} />
          <div />
          <input aria-label="Importe" className={`${entrada} text-right`} value={importe} inputMode="decimal" onChange={(e) => setImporte(e.target.value.replace(/[^\d.,-]/g, ''))} />
        </div>
        <datalist id="contanet-conceptos">
          {CONCEPTOS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
        <div className="grid grid-cols-[148px_72px_86px_1fr_190px_44px_272px] divide-x divide-[#c9d7ee] border-t border-[#c9d7ee] bg-[#e8eef9] text-center text-[15px] leading-[26px]">
          <div>Código</div>
          <div>Fecha</div>
          <div>*Asiento</div>
          <div>Descripción</div>
          <div>Ref.</div>
          <div />
          <div className="grid grid-cols-2 divide-x divide-[#c9d7ee]">
            <button type="submit" className="hover:bg-[#cfe0f7]" onClick={(e) => (e.preventDefault(), anotar('debe'))}>
              Debe
            </button>
            <button type="button" className="hover:bg-[#cfe0f7]" onClick={() => anotar('haber')}>
              Haber
            </button>
          </div>
        </div>
      </form>

      {/* Zona de estado */}
      <div className="flex flex-wrap items-start gap-2 text-[12px] print:hidden">
        <div className="w-[400px] border border-[var(--gw-border-light)] bg-[var(--gw-face)]">
          <div className="flex items-center gap-1 px-1">
            <span>Título:</span>
            <b className="flex-1 truncate">{tituloCuenta}</b>
            <select className="h-[20px] w-[150px] text-[12px] text-[#888]" disabled title="Tipo de diario: pendiente (siguiente tanda)" defaultValue={TIPOS_DIARIO[1]}>
              {TIPOS_DIARIO.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <Estado nombre="Cuenta" debe={deCuenta.debe} haber={deCuenta.haber} resto="Saldo" valor={cuenta ? r2(deCuenta.debe - deCuenta.haber) : null} />
          <Estado nombre="Asiento" debe={delAsiento.debe} haber={delAsiento.haber} resto="Descuadre" valor={enCurso.length ? descuadre : null} />
          <Estado nombre="Total" debe={total.debe} haber={total.haber} resto="Descuadre" valor={r2(total.debe - total.haber)} />
        </div>
        <div className="min-w-[200px] flex-1 border border-[var(--gw-border-light)] bg-white p-1 text-[#888]">Apuntes modelo, punteo y centros de costo: en la siguiente tanda.</div>
        <div className="min-w-[240px] flex-1">
          <Aviso error={error} ok={ok} />
          {enCurso.length > 0 && !error && <p className="font-bold text-[#8a5a00]">Asiento {num6(siguiente)} sin guardar: se guarda solo cuando cuadre.</p>}
        </div>
      </div>

      {(ventana === 'rep' || ventana === 'sop') && <VentanaIgic lado={ventana} anio={anio} onCerrar={() => setVentana(null)} onAceptar={(ls) => (setVentana(null), void guardar(ls.map((l) => ({ ...l, asiento: siguiente, canal: '' }))))} />}
      {ventana === 'conceptos' && (
        <Ventana titulo="Conceptos contables" onCerrar={() => setVentana(null)}>
          <ol className="max-h-[260px] w-[300px] overflow-auto border border-[var(--gw-border)] bg-white text-[15px]">
            {CONCEPTOS.map((c, i) => (
              <li key={c}>
                <button type="button" className="flex w-full gap-2 px-1.5 text-left hover:bg-[#cfe0f7]" onClick={() => (setDesc(`${c} `), setVentana(null))}>
                  <span className="w-5 text-right">{i + 1}</span>
                  {c}
                </button>
              </li>
            ))}
          </ol>
        </Ventana>
      )}
    </div>
  )
}

function Boton({ icono: Icono, color, titulo, onClick, etiqueta }: { icono: LucideIcon; color: string; titulo: string; onClick?: () => void; etiqueta?: string }) {
  return (
    <button type="button" title={titulo} aria-label={titulo} disabled={!onClick} onClick={onClick} className="relative flex h-[26px] w-[26px] items-center justify-center rounded-sm hover:bg-[#cfe0f7] disabled:opacity-40 disabled:hover:bg-transparent">
      <Icono size={18} color={color} fill={color} fillOpacity={0.18} strokeWidth={2} aria-hidden />
      {etiqueta && <span className="absolute -top-[1px] left-0 text-[7px] font-bold leading-none" style={{ color }}>{etiqueta}</span>}
    </button>
  )
}
const Sep = () => <span className="mx-0.5 h-[20px] border-l border-[#b9c6de]" />

function Estado({ nombre, debe, haber, resto, valor }: { nombre: string; debe: number; haber: number; resto: string; valor: number | null }) {
  return (
    <div className="grid grid-cols-[52px_34px_1fr_36px_1fr_62px_1fr] border-t border-[#c9d7ee] px-1 tabular-nums">
      <span>{nombre}</span>
      <span>Debe</span>
      <span className="text-right">{debe ? imp(debe) : ''}</span>
      <span className="pl-1">Haber</span>
      <span className="text-right">{haber ? imp(-haber) : ''}</span>
      <span className="pl-1">{resto}</span>
      <span className={`text-right ${valor ? 'font-bold text-[#c42b1c]' : 'text-[#1d3a8a]'}`}>{valor == null ? '' : imp(valor)}</span>
    </div>
  )
}

function Ventana({ titulo, onCerrar, children }: { titulo: string; onCerrar: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onKeyDown={(e) => e.key === 'Escape' && onCerrar()}>
      <div role="dialog" aria-label={titulo} className="border border-[var(--gw-border)] bg-[var(--gw-face)] shadow-lg">
        <div className="flex items-center justify-between bg-[#1d3a8a] px-2 py-0.5 text-[13px] text-white">
          {titulo}
          <button type="button" aria-label="Cerrar" onClick={onCerrar}>
            ✕
          </button>
        </div>
        <div className="p-2">{children}</div>
      </div>
    </div>
  )
}

/** IGIC (Repercutido) F8 / IGIC (Soportado) F9: mismos campos y orden que en CONTANET (capturas 69 y 70). */
function VentanaIgic({ lado, anio, onCerrar, onAceptar }: { lado: 'rep' | 'sop'; anio: number; onCerrar: () => void; onAceptar: (l: Omit<Fila, 'asiento' | 'canal'>[]) => void }) {
  const rep = lado === 'rep'
  const [tercero, setTercero] = useState(rep ? '430' : '400')
  const [factura, setFactura] = useState('')
  const [fecha, setFecha] = useState(ddmm(hoy()))
  const [base, setBase] = useState('')
  const [tipo, setTipo] = useState(7)
  const [ctaIgic, setCtaIgic] = useState(rep ? '477' : '472')
  const [contra, setContra] = useState(rep ? '700' : '600')
  const [error, setError] = useState<string | null>(null)
  const b = numero(base)
  const cuota = r2((b * tipo) / 100)

  function aceptar() {
    const f = fechaDe(fecha, anio)
    if (!f) return setError('La fecha no vale. Escribe día y mes: 16/11.')
    if (!b) return setError('Falta la base imponible.')
    if (!factura.trim()) return setError('Falta el número de factura.')
    const d = `FRA. Nº ${factura.trim()}`
    const s = rep ? 1 : -1 // repercutido: cliente al debe; soportado: proveedor al haber
    const lineas = [
      { cuenta: tercero, importe: s * r2(b + cuota) },
      { cuenta: contra, importe: -s * b },
      ...(cuota ? [{ cuenta: ctaIgic, importe: -s * cuota }] : []),
    ]
    onAceptar(lineas.map((l) => ({ ...l, fecha: f, descripcion: d, ref: factura.trim() })))
  }

  const fila = 'grid grid-cols-[150px_1fr] items-center gap-1 text-[13px]'
  const caja = 'h-[22px] border border-[var(--gw-border)] bg-white px-1 text-[13px]'
  return (
    <Ventana titulo={rep ? 'IGIC (Repercutido)' : 'IGIC (Soportado)'} onCerrar={onCerrar}>
      <form className="flex w-[380px] flex-col gap-1" onSubmit={(e) => (e.preventDefault(), aceptar())}>
        <label className={fila}>
          {rep ? 'Código Cliente' : 'Código Proveedor'}
          <input className={`${caja} w-[110px]`} value={tercero} autoFocus onChange={(e) => setTercero(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className={fila}>
          N.º Factura
          <input className={caja} value={factura} maxLength={40} onChange={(e) => setFactura(e.target.value)} />
        </label>
        <label className={fila}>
          Fecha contable
          <input className={`${caja} w-[70px]`} value={fecha} maxLength={5} onChange={(e) => setFecha(e.target.value)} />
        </label>
        <label className={fila}>
          Base Imponible
          <input className={`${caja} w-[110px] text-right`} value={base} inputMode="decimal" onChange={(e) => setBase(e.target.value.replace(/[^\d.,-]/g, ''))} />
        </label>
        <label className={fila}>
          Tipo IVA
          <select className={`${caja} w-[110px]`} value={tipo} onChange={(e) => setTipo(Number(e.target.value))}>
            {TIPOS_IGIC.map((t) => (
              <option key={t} value={t}>
                IGIC {String(t).replace('.', ',')}%
              </option>
            ))}
          </select>
        </label>
        <div className={fila}>
          Importe IVA <span className="w-[110px] text-right tabular-nums">{imp(cuota)}</span>
        </div>
        <div className={fila}>
          Total <b className="w-[110px] text-right tabular-nums">{imp(r2(b + cuota))}</b>
        </div>
        <label className={fila}>
          Cuenta IVA
          <input className={`${caja} w-[110px]`} value={ctaIgic} onChange={(e) => setCtaIgic(e.target.value.replace(/\D/g, ''))} />
        </label>
        <label className={fila}>
          Contrapartida
          <input className={`${caja} w-[110px]`} value={contra} onChange={(e) => setContra(e.target.value.replace(/\D/g, ''))} />
        </label>
        <Aviso error={error} />
        <div className="mt-1 flex justify-between">
          <button type="submit" className="gw-btn">
            Aceptar
          </button>
          <button type="button" className="gw-btn" onClick={onCerrar}>
            Cancelar
          </button>
        </div>
      </form>
    </Ventana>
  )
}
