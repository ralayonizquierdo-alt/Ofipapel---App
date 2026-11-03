// Archivo → Fichaje (/fichaje-gestion, permiso «/fichaje-gestion»): gestión del registro horario (Rober, 03/11/2026).
// Rehace dentro del ERP lo que hacía fichaje.html (Firebase, sin estrenar), con los mismos menús: Hoy, Alertas,
// Personas, Histórico, Corrección, Exportar, Horarios y festivos, Ubicaciones y Normativa. Las personas son los
// empleados del ERP (tabla empleado) y los repartidores se enlazan con su ficha de repartidor. Se ficha en /fichaje.
// Un fichaje no se cambia ni se borra nunca: una corrección es un registro nuevo con motivo y autor.
// Datos: migración 20261103_fichaje.sql (fn_fichaje_*).

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from '../../lib/supabase'
import { GwField, GwGroup, GwInput, GwSelect } from '../../components/gw'
import { GwOperativa } from '../../components/gw/GwOperativa'
import { exportarExcel, exportarPdf, type TablaExportar } from '../../lib/exportarTabla'
import {
  canariasAIso,
  diaSemana,
  duracion,
  fechaCan,
  horaCan,
  hoyCan,
  jornadas,
  TIPOS_FICHAJE,
  type EstadoFichaje,
  type EventoFichaje,
  type TipoFichaje,
} from '../../lib/fichaje'

type Pestana = 'hoy' | 'alertas' | 'personas' | 'historico' | 'correccion' | 'exportar' | 'horarios' | 'ubicaciones' | 'normativa' | 'operativa'
const PESTANAS: [Pestana, string][] = [
  ['hoy', 'Hoy'],
  ['alertas', 'Alertas'],
  ['personas', 'Personas'],
  ['historico', 'Histórico'],
  ['correccion', 'Corrección'],
  ['exportar', 'Exportar'],
  ['horarios', 'Horarios y festivos'],
  ['ubicaciones', 'Ubicaciones'],
  ['normativa', 'Normativa'],
  ['operativa', 'Operativa'],
]

interface Departamento {
  codigo: string
  nombre: string
  grupo: string
  orden: number
  lat: number | null
  lng: number | null
  radio_m: number | null
  activo: boolean
}
interface Persona {
  codigo: string
  nombre: string
  nombre_corto: string | null
  numero: string | null
  activo: boolean
  departamento: string | null
  repartidor: string | null
  ficha: boolean
  con_pin: boolean
  horario_propio: boolean
}
interface Horario {
  id?: number
  departamento_codigo: string | null
  empleado_codigo: string | null
  manana_desde: string | null
  manana_hasta: string | null
  tarde_desde: string | null
  tarde_hasta: string | null
  sabado_desde: string | null
  sabado_hasta: string | null
  domingos: boolean
}
interface Festivo {
  fecha: string
  etiqueta: string
  cerrado: boolean
  manana_desde: string | null
  manana_hasta: string | null
  tarde_desde: string | null
  tarde_hasta: string | null
}

const sumarDias = (dia: string, n: number) => {
  const d = new Date(dia + 'T12:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const corto = (p: { nombre: string; nombre_corto: string | null }) => p.nombre_corto || p.nombre
const hh = (t: string | null) => (t ? t.slice(0, 5) : '')

function useDatosBase() {
  const [deps, setDeps] = useState<Departamento[]>([])
  const [personas, setPersonas] = useState<Persona[]>([])
  const [error, setError] = useState<string | null>(null)
  const cargar = useCallback(async () => {
    const [d, p] = await Promise.all([
      supabase.from('fichaje_departamento').select('*').order('orden'),
      supabase.rpc('fn_fichaje_plantilla'),
    ])
    if (d.error || p.error) return setError((d.error ?? p.error)!.message)
    setDeps((d.data ?? []) as Departamento[])
    setPersonas((p.data ?? []) as Persona[])
  }, [])
  useEffect(() => {
    void cargar()
  }, [cargar])
  return { deps, personas, error, recargar: cargar }
}

async function eventos(desde: string, hasta: string, empleado?: string, departamento?: string) {
  const { data, error } = await supabase.rpc('fn_fichaje_eventos', {
    p_desde: desde,
    p_hasta: hasta,
    p_empleado: empleado || null,
    p_departamento: departamento || null,
  })
  if (error) throw new Error(error.message)
  return (data ?? []) as EventoFichaje[]
}

export function FichajeGestionPage() {
  const [pestana, setPestana] = useState<Pestana>('hoy')
  const base = useDatosBase()
  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-wrap items-center gap-1 border border-[var(--gw-border-light)] bg-[var(--gw-face)] p-1.5">
        {PESTANAS.map(([p, t]) => (
          <button key={p} type="button" className={`gw-btn h-[24px] ${pestana === p ? 'bg-[#91c9f7] font-bold' : ''}`} onClick={() => setPestana(p)}>
            {t}
          </button>
        ))}
        <span className="flex-1" />
        <a className="gw-btn h-[24px]" href={`${import.meta.env.BASE_URL}fichaje`} target="_blank" rel="noreferrer" title="La pantalla donde ficha el personal (móvil o tablet de la entrada)">
          🕒 Abrir la pantalla de fichar
        </a>
      </div>
      {base.error && <div className="font-bold text-[#c42b1c]">{base.error}</div>}
      {pestana === 'hoy' && <Hoy />}
      {pestana === 'alertas' && <Alertas />}
      {pestana === 'personas' && <Personas {...base} />}
      {pestana === 'historico' && <Historico {...base} />}
      {pestana === 'correccion' && <Correccion personas={base.personas} />}
      {pestana === 'exportar' && <Exportar personas={base.personas} />}
      {pestana === 'horarios' && <Horarios deps={base.deps} personas={base.personas} />}
      {pestana === 'ubicaciones' && <Ubicaciones deps={base.deps} recargar={base.recargar} />}
      {pestana === 'normativa' && <Normativa />}
      {pestana === 'operativa' && <Operativa />}
    </div>
  )
}

function Caja({ children, titulo }: { children: ReactNode; titulo?: ReactNode }) {
  return (
    <div className="border border-[var(--gw-border)] bg-white p-2">
      {titulo && <div className="mb-1 text-[14px] font-bold text-[#1d3a8a]">{titulo}</div>}
      {children}
    </div>
  )
}
const th = 'border border-[var(--gw-border-light)] bg-[var(--gw-face)] px-1.5 py-0.5 text-left font-bold'
const td = 'border border-[var(--gw-border-light)] px-1.5 py-0.5'

// ------------------------------------------------------------------ Hoy
const ESTADO_HOY: Record<EstadoFichaje, { texto: string; color: string; fondo: string }> = {
  trabajando: { texto: 'Trabajando', color: '#127a12', fondo: '#e3f5e3' },
  pausa: { texto: 'En pausa', color: '#a86400', fondo: '#fff1d6' },
  salida: { texto: 'Jornada terminada', color: '#4a5568', fondo: '#eceff3' },
  sin_fichar: { texto: 'Sin fichar', color: '#b3261e', fondo: '#fde7e4' },
}
function Hoy() {
  const [dia, setDia] = useState(hoyCan())
  const [filas, setFilas] = useState<
    { empleado: string; nombre: string; departamento: string | null; grupo: string | null; estado: EstadoFichaje; eventos: { tipo: TipoFichaje; en: string; origen: string; fuera_de_horario: boolean; fuera_de_sitio: boolean }[] }[]
  >([])
  const [error, setError] = useState<string | null>(null)
  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('fn_fichaje_hoy', { p_dia: dia })
    if (e) return setError(e.message)
    setError(null)
    setFilas((data ?? []) as typeof filas)
  }, [dia])
  useEffect(() => {
    void cargar()
    const t = setInterval(() => void cargar(), 30_000)
    return () => clearInterval(t)
  }, [cargar])
  const cuenta = (e: EstadoFichaje) => filas.filter((f) => f.estado === e).length
  return (
    <Caja
      titulo={
        <span className="flex flex-wrap items-center gap-2">
          Estado del día
          <GwInput type="date" value={dia} onChange={(e) => setDia(e.target.value || hoyCan())} className="!w-[150px]" />
        </span>
      }
    >
      {error && <div className="font-bold text-[#c42b1c]">{error}</div>}
      {!filas.length && <div>Nadie ficha todavía: da de alta a las personas en «Personas» (departamento y PIN).</div>}
      {!!filas.length && (
        <div className="flex flex-col gap-3">
          {/* Resumen en grande */}
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {(Object.keys(ESTADO_HOY) as EstadoFichaje[]).map((e) => (
              <div key={e} className="rounded-lg border px-3 py-2" style={{ borderColor: ESTADO_HOY[e].color + '55', background: ESTADO_HOY[e].fondo }}>
                <div className="text-[28px] font-bold leading-none" style={{ color: ESTADO_HOY[e].color }}>
                  {cuenta(e)}
                </div>
                <div className="text-[12px] font-semibold" style={{ color: ESTADO_HOY[e].color }}>
                  {ESTADO_HOY[e].texto}
                </div>
              </div>
            ))}
          </div>
          {/* Una tarjeta por persona, por secciones */}
          {[...new Set(filas.map((f) => f.departamento ?? 'Sin departamento'))].map((dep) => (
            <div key={dep}>
              <div className="mb-1 border-b-2 border-[#1d3a8a] pb-0.5 text-[14px] font-bold text-[#1d3a8a]">{dep}</div>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-2">
                {filas
                  .filter((f) => (f.departamento ?? 'Sin departamento') === dep)
                  .map((f) => (
                    <div key={f.empleado} className="rounded-lg border border-[#d7dde8] bg-white p-2 shadow-sm" style={{ borderLeft: `5px solid ${ESTADO_HOY[f.estado].color}` }}>
                      <div className="flex items-center justify-between gap-2">
                        <b className="truncate text-[14px]">{f.nombre}</b>
                        <span className="whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ color: ESTADO_HOY[f.estado].color, background: ESTADO_HOY[f.estado].fondo }}>
                          {ESTADO_HOY[f.estado].texto}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {!f.eventos.length && <span className="text-[12px] text-[#8a94a6]">Sin fichajes</span>}
                        {f.eventos.map((e, i) => (
                          <span
                            key={i}
                            className={`rounded-full border px-1.5 text-[11px] ${e.fuera_de_horario || e.fuera_de_sitio ? 'border-[#c42b1c] font-bold text-[#c42b1c]' : 'border-[#d7dde8] text-[#333]'}`}
                            title={[e.origen === 'correccion' && 'Corrección', e.fuera_de_horario && 'Fuera de horario', e.fuera_de_sitio && 'Fuera del lugar esperado'].filter(Boolean).join(' · ') || undefined}
                          >
                            {TIPOS_FICHAJE[e.tipo]} {horaCan(e.en)}
                            {e.origen === 'correccion' ? ' ✎' : ''}
                            {e.fuera_de_horario ? ' ⏰' : ''}
                            {e.fuera_de_sitio ? ' 📍' : ''}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-1 text-[11px] text-[#555]">⏰ fuera de horario · 📍 fuera del lugar esperado · ✎ corrección. Se actualiza solo cada 30 s.</div>
    </Caja>
  )
}

// ------------------------------------------------------------------ Alertas
function Alertas() {
  const [dias, setDias] = useState(30)
  const [evs, setEvs] = useState<EventoFichaje[]>([])
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    eventos(sumarDias(hoyCan(), -dias + 1), hoyCan())
      .then((e) => (setEvs(e.filter((x) => x.anulado_por == null)), setError(null)))
      .catch((e: Error) => setError(e.message))
  }, [dias])
  const bloque = (titulo: string, campo: 'fuera_de_horario' | 'fuera_de_sitio', explicacion: string) => {
    const casos = evs.filter((e) => e[campo])
    const ranking = [...casos.reduce((m, e) => m.set(e.nombre, (m.get(e.nombre) ?? 0) + 1), new Map<string, number>())].sort((a, b) => b[1] - a[1])
    return (
      <Caja titulo={`${titulo} (${casos.length})`}>
        <div className="mb-1 text-[12px] text-[#555]">{explicacion}</div>
        {!casos.length && <div>Ninguno en este periodo.</div>}
        {!!casos.length && (
          <div className="flex flex-wrap gap-4">
            <table className="border-collapse">
              <thead>
                <tr>
                  <th className={th}>Persona</th>
                  <th className={th}>Veces</th>
                </tr>
              </thead>
              <tbody>
                {ranking.map(([n, c]) => (
                  <tr key={n}>
                    <td className={td}>{n}</td>
                    <td className={`${td} text-right`}>{c}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="border-collapse">
              <thead>
                <tr>
                  <th className={th}>Últimos casos</th>
                  <th className={th}>Día</th>
                  <th className={th}>Hora</th>
                  <th className={th}>Fichaje</th>
                </tr>
              </thead>
              <tbody>
                {casos
                  .slice()
                  .reverse()
                  .slice(0, 25)
                  .map((e) => (
                    <tr key={e.id}>
                      <td className={td}>{e.nombre}</td>
                      <td className={td}>{fechaCan(e.dia)}</td>
                      <td className={td}>{horaCan(e.en)}</td>
                      <td className={td}>
                        {TIPOS_FICHAJE[e.tipo]}
                        {campo === 'fuera_de_sitio' && e.lat != null && (
                          <a className="ml-2 text-[#1a4fd0] underline" href={`https://www.google.com/maps?q=${e.lat},${e.lng}`} target="_blank" rel="noreferrer">
                            ver sitio
                          </a>
                        )}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </Caja>
    )
  }
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1">
        Periodo:
        {[7, 30, 90].map((d) => (
          <button key={d} type="button" className={`gw-btn h-[24px] ${dias === d ? 'bg-[#91c9f7] font-bold' : ''}`} onClick={() => setDias(d)}>
            Últimos {d} días
          </button>
        ))}
      </div>
      {error && <div className="font-bold text-[#c42b1c]">{error}</div>}
      {bloque('⏰ Fuera de horario', 'fuera_de_horario', 'Fichajes hechos fuera del horario de la persona (o de su departamento) con 15 min de margen, en festivo cerrado o en domingo sin horario de domingo. Sin horario puesto no se marca nunca.')}
      {bloque('📍 Fuera del lugar esperado', 'fuera_de_sitio', 'Fichajes hechos lejos de la ubicación de su departamento (pestaña Ubicaciones). Si el móvil no dio la ubicación, no se marca.')}
    </div>
  )
}

// ------------------------------------------------------------------ Personas
function Personas({ deps, personas, recargar }: { deps: Departamento[]; personas: Persona[]; recargar: () => Promise<void> }) {
  const [repartidores, setRepartidores] = useState<{ codigo: string; nombre: string }[]>([])
  const [pin, setPin] = useState<Record<string, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const [verTodos, setVerTodos] = useState(false)
  useEffect(() => {
    // Todos, también los de baja en Repartidores (se marcan), para que no se pierda un enlace ya hecho.
    void supabase
      .from('repartidor')
      .select('codigo, nombre, nombre_corto, deshabilitado')
      .order('nombre')
      .then(({ data }) =>
        setRepartidores(
          ((data ?? []) as { codigo: string; nombre: string; nombre_corto: string | null; deshabilitado: boolean | null }[]).map((r) => ({
            codigo: r.codigo,
            nombre: `${r.nombre_corto || r.nombre} (${r.codigo})${r.deshabilitado ? ' · de baja en Repartidores' : ''}`,
          })),
        ),
      )
  }, [])
  const guardar = async (p: Persona, cambios: Partial<{ departamento_codigo: string | null; repartidor_codigo: string | null; activo: boolean }>) => {
    setMsg(null)
    const fila = {
      empleado_codigo: p.codigo,
      departamento_codigo: p.departamento,
      repartidor_codigo: p.repartidor,
      activo: p.ficha,
      ...cambios,
      actualizado_en: new Date().toISOString(),
    }
    const { error } = await supabase.from('fichaje_empleado').upsert(fila)
    if (error) setMsg(/repartidor_codigo/.test(error.message) ? 'Ese repartidor ya está enlazado con otra persona.' : error.message)
    else if (fila.activo && !fila.departamento_codigo) setMsg(`Elige el departamento de ${corto(p)}: sin él no sale en la pantalla de fichar.`)
    else if (fila.activo && !p.con_pin) setMsg(`Ponle un PIN a ${corto(p)}: sin él no sale en la pantalla de fichar.`)
    await recargar()
  }
  const ponerPin = async (p: Persona) => {
    const v = pin[p.codigo] ?? ''
    const { error } = await supabase.rpc('fn_fichaje_pin_poner', { p_empleado: p.codigo, p_pin: v })
    setMsg(error ? error.message : `PIN de ${corto(p)} guardado. Ya puede fichar.`)
    setPin((x) => ({ ...x, [p.codigo]: '' }))
    await recargar()
  }
  const generarPines = async () => {
    const sinPin = personas.filter((p) => p.ficha && p.activo && !p.con_pin).length
    if (!sinPin) return setMsg('Todas las personas que fichan ya tienen PIN.')
    if (!confirm(`Se crea un PIN al azar para ${sinPin} persona(s) sin PIN. La lista sale UNA sola vez para imprimirla y repartirla (después solo se pueden cambiar). ¿Seguir?`)) return
    const { data, error } = await supabase.rpc('fn_fichaje_pin_generar')
    if (error) return setMsg(error.message)
    const filas = (data ?? []) as { numero: string; nombre: string; departamento: string | null; pin: string }[]
    exportarPdf({
      titulo: 'PIN de Fichaje (entregar a cada persona y no guardar esta hoja)',
      fichero: 'pines-fichaje',
      apaisado: false,
      columnas: ['Nº', 'Nombre', 'Departamento', 'PIN'],
      filas: filas.map((f) => [f.numero, f.nombre, f.departamento ?? '', f.pin]),
    })
    setMsg(`PIN creado para ${filas.length} persona(s). Si no se abrió la hoja para imprimir, permite las ventanas emergentes y vuelve a generarlos (cambiando el PIN de cada uno).`)
    await recargar()
  }
  // Ordenadas por sección (departamento, en su orden) y dentro por nombre; quien no ficha, al final.
  const ordenDep = new Map(deps.map((d) => [d.codigo, d.orden]))
  const nombreDep = new Map(deps.map((d) => [d.codigo, d.nombre]))
  const seccion = (p: Persona) => (p.ficha && p.departamento ? p.departamento : '')
  const lista = (verTodos ? personas : personas.filter((p) => p.ficha || p.activo))
    .slice()
    .sort((a, b) => (ordenDep.get(seccion(a)) ?? 9999) - (ordenDep.get(seccion(b)) ?? 9999) || a.nombre.localeCompare(b.nombre, 'es'))
  return (
    <Caja titulo="Personas que fichan (salen de Archivo → Empleados)">
      <div className="mb-1 text-[12px] text-[#555]">
        Marca «Ficha» a quien tenga que fichar, elige su departamento y ponle un PIN de 4 cifras. Si reparte, enlázale su repartidor: así la app de reparto sabe si ha fichado y, al fichar, le sale el botón «🚚 Mi reparto». Para añadir una persona, créala antes en Archivo → Empleados.
      </div>
      <div className="mb-1 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={verTodos} onChange={(e) => setVerTodos(e.target.checked)} /> Ver también los empleados de baja
        </label>
        <button type="button" className="gw-btn font-bold" onClick={() => void generarPines()} title="Un PIN al azar para cada persona que ficha y aún no tiene; sale una hoja para imprimir">
          🔑 Crear PIN a quien no tenga (e imprimir la lista)
        </button>
      </div>
      {msg && <div className="mb-1 font-bold text-[#127a12]">{msg}</div>}
      <table className="w-full border-collapse">
        <thead>
          <tr>
            <th className={th}>Nº</th>
            <th className={th}>Empleado</th>
            <th className={th}>Ficha</th>
            <th className={th}>Departamento</th>
            <th className={th}>Repartidor (app de reparto)</th>
            <th className={th}>PIN</th>
            <th className={th}>Horario</th>
          </tr>
        </thead>
        <tbody>
          {lista.map((p, i) => (
            <Fragment key={p.codigo}>
            {(i === 0 || seccion(lista[i - 1]) !== seccion(p)) && (
              <tr>
                <td colSpan={7} className="border-b border-[var(--gw-border)] bg-[#dfe9f7] px-1.5 py-1 font-bold text-[#1d3a8a]">
                  {seccion(p) ? nombreDep.get(seccion(p)) : 'No fichan (o sin departamento)'} ({lista.filter((x) => seccion(x) === seccion(p)).length})
                </td>
              </tr>
            )}
            <tr className={p.activo ? '' : 'text-[#888]'}>
              <td className={td}>{p.numero ?? p.codigo}</td>
              <td className={td}>
                {p.nombre}
                {!p.activo && ' (baja)'}
              </td>
              <td className={`${td} text-center`}>
                <input type="checkbox" checked={p.ficha} onChange={(e) => void guardar(p, { activo: e.target.checked })} />
              </td>
              <td className={td}>
                <GwSelect value={p.departamento ?? ''} onChange={(e) => void guardar(p, { departamento_codigo: e.target.value || null })} className="w-[170px]">
                  <option value="">—</option>
                  {deps.map((d) => (
                    <option key={d.codigo} value={d.codigo}>
                      {d.nombre}
                    </option>
                  ))}
                </GwSelect>
              </td>
              <td className={td}>
                <GwSelect value={p.repartidor ?? ''} onChange={(e) => void guardar(p, { repartidor_codigo: e.target.value || null })} className="w-[170px]">
                  <option value="">No reparte</option>
                  {repartidores.map((r) => (
                    <option key={r.codigo} value={r.codigo}>
                      {r.nombre}
                    </option>
                  ))}
                </GwSelect>
              </td>
              <td className={td}>
                <span className="flex items-center gap-1">
                  {p.con_pin ? '✔' : '—'}
                  <GwInput
                    value={pin[p.codigo] ?? ''}
                    onChange={(e) => setPin((x) => ({ ...x, [p.codigo]: e.target.value.replace(/\D/g, '').slice(0, 4) }))}
                    placeholder={p.con_pin ? 'cambiar' : 'nuevo'}
                    inputMode="numeric"
                    className="w-[70px]"
                  />
                  <button type="button" className="gw-btn h-[22px]" disabled={(pin[p.codigo] ?? '').length !== 4} onClick={() => void ponerPin(p)}>
                    Guardar
                  </button>
                </span>
              </td>
              <td className={td}>{p.horario_propio ? 'Propio' : 'El del departamento'}</td>
            </tr>
            </Fragment>
          ))}
        </tbody>
      </table>
    </Caja>
  )
}

// ------------------------------------------------------------------ Histórico
function Historico({ deps, personas }: { deps: Departamento[]; personas: Persona[] }) {
  const [dep, setDep] = useState('')
  const [emp, setEmp] = useState('')
  const [desde, setDesde] = useState(sumarDias(hoyCan(), -6))
  const [hasta, setHasta] = useState(hoyCan())
  const [evs, setEvs] = useState<EventoFichaje[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const buscar = () =>
    eventos(desde, hasta, emp, dep)
      .then((e) => (setEvs(e), setError(null)))
      .catch((e: Error) => setError(e.message))
  const tabla = (): TablaExportar => ({
    titulo: `Fichajes del ${fechaCan(desde)} al ${fechaCan(hasta)}`,
    fichero: `fichajes-${desde}-${hasta}`,
    columnas: ['Día', 'Persona', 'Fichaje', 'Hora', 'Origen', 'Motivo / quién', 'Anulado', 'Fuera de horario', 'Fuera de sitio'],
    filas: (evs ?? []).map((e) => [
      fechaCan(e.dia),
      e.nombre_completo,
      TIPOS_FICHAJE[e.tipo],
      horaCan(e.en),
      e.origen === 'correccion' ? 'Corrección' : 'Fichaje',
      e.motivo ? `${e.motivo} (${e.corregido_por ?? ''})` : '',
      e.anulado_por != null ? 'Sí' : '',
      e.fuera_de_horario ? 'Sí' : '',
      e.fuera_de_sitio ? 'Sí' : '',
    ]),
  })
  return (
    <Caja titulo="Histórico de fichajes">
      <div className="mb-1 flex flex-wrap items-end gap-2">
        <GwField label="Departamento">
          <GwSelect value={dep} onChange={(e) => setDep(e.target.value)} className="w-[160px]">
            <option value="">Todos</option>
            {deps.map((d) => (
              <option key={d.codigo} value={d.codigo}>
                {d.nombre}
              </option>
            ))}
          </GwSelect>
        </GwField>
        <GwField label="Persona">
          <GwSelect value={emp} onChange={(e) => setEmp(e.target.value)} className="w-[180px]">
            <option value="">Todas</option>
            {personas
              .filter((p) => p.ficha)
              .map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {corto(p)}
                </option>
              ))}
          </GwSelect>
        </GwField>
        <GwField label="Desde">
          <GwInput type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
        </GwField>
        <GwField label="Hasta">
          <GwInput type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </GwField>
        <button type="button" className="gw-btn font-bold" onClick={() => void buscar()}>
          Buscar
        </button>
        <button type="button" className="gw-btn" disabled={!evs?.length} onClick={() => exportarExcel(tabla())}>
          📊 Excel
        </button>
        <button type="button" className="gw-btn" disabled={!evs?.length} onClick={() => exportarPdf(tabla())}>
          🖨 PDF
        </button>
      </div>
      {error && <div className="font-bold text-[#c42b1c]">{error}</div>}
      {evs && !evs.length && <div>No hay fichajes con esos filtros.</div>}
      {!!evs?.length && (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {tabla().columnas.map((c) => (
                <th key={c} className={th}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabla().filas.map((f, i) => (
              <tr key={evs[i].id} className={evs[i].anulado_por != null ? 'text-[#999] line-through' : ''}>
                {f.map((v, j) => (
                  <td key={j} className={td}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Caja>
  )
}

// ------------------------------------------------------------------ Corrección
function Correccion({ personas }: { personas: Persona[] }) {
  const [emp, setEmp] = useState('')
  const [dia, setDia] = useState(hoyCan())
  const [evs, setEvs] = useState<EventoFichaje[]>([])
  const [tipo, setTipo] = useState<TipoFichaje>('entrada')
  const [hora, setHora] = useState('08:00')
  const [motivo, setMotivo] = useState('')
  const [anular, setAnular] = useState<EventoFichaje | null>(null)
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null)
  const cargar = useCallback(async () => {
    if (!emp) return setEvs([])
    try {
      setEvs(await eventos(dia, dia, emp))
    } catch (e) {
      setMsg({ ok: false, t: (e as Error).message })
    }
  }, [emp, dia])
  useEffect(() => {
    void cargar()
  }, [cargar])
  const enviar = async (soloAnular: boolean) => {
    setMsg(null)
    const { error } = await supabase.rpc('fn_fichaje_corregir', {
      p_empleado: emp,
      p_tipo: soloAnular ? null : tipo,
      p_en: soloAnular ? null : canariasAIso(`${dia}T${hora}`),
      p_motivo: motivo,
      p_anula: anular?.id ?? null,
    })
    if (error) return setMsg({ ok: false, t: error.message })
    setMsg({ ok: true, t: soloAnular ? 'Fichaje anulado (queda en el histórico, tachado, con el motivo).' : 'Corrección guardada.' })
    setMotivo('')
    setAnular(null)
    void cargar()
  }
  return (
    <Caja titulo="Corrección de fichajes">
      <div className="mb-2 text-[12px] text-[#555]">
        Un fichaje nunca se cambia ni se borra (lo exige la ley). Para arreglar un error se añade un fichaje nuevo marcado como corrección, con el motivo y quién lo hace; si hace falta, se anula el equivocado (sigue en el histórico, tachado).
      </div>
      <div className="mb-2 flex flex-wrap items-end gap-2">
        <GwField label="Persona">
          <GwSelect value={emp} onChange={(e) => setEmp(e.target.value)} className="w-[200px]">
            <option value="">Elige…</option>
            {personas
              .filter((p) => p.ficha)
              .map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {corto(p)}
                </option>
              ))}
          </GwSelect>
        </GwField>
        <GwField label="Día">
          <GwInput type="date" value={dia} max={hoyCan()} onChange={(e) => setDia(e.target.value)} />
        </GwField>
      </div>
      {emp && (
        <>
          <table className="mb-2 border-collapse">
            <thead>
              <tr>
                <th className={th}>Fichaje</th>
                <th className={th}>Hora</th>
                <th className={th}>Origen</th>
                <th className={th}></th>
              </tr>
            </thead>
            <tbody>
              {!evs.length && (
                <tr>
                  <td className={td} colSpan={4}>
                    Sin fichajes este día.
                  </td>
                </tr>
              )}
              {evs.map((e) => (
                <tr key={e.id} className={e.anulado_por != null ? 'text-[#999] line-through' : anular?.id === e.id ? 'bg-[#fff3b0]' : ''}>
                  <td className={td}>{TIPOS_FICHAJE[e.tipo]}</td>
                  <td className={td}>{horaCan(e.en)}</td>
                  <td className={td}>{e.origen === 'correccion' ? `Corrección: ${e.motivo ?? ''} (${e.corregido_por ?? ''})` : 'Fichaje'}</td>
                  <td className={td}>
                    {e.anulado_por == null && (
                      <button type="button" className="gw-btn h-[22px]" onClick={() => (setAnular(anular?.id === e.id ? null : e), setTipo(e.tipo), setHora(horaCan(e.en)))}>
                        {anular?.id === e.id ? 'No tocar' : 'Corregir este'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <GwGroup title={anular ? `Corregir «${TIPOS_FICHAJE[anular.tipo]} ${horaCan(anular.en)}»` : 'Añadir un fichaje que falta'}>
            <div className="flex flex-wrap items-end gap-2 p-1">
              <GwField label="Fichaje">
                <GwSelect value={tipo} onChange={(e) => setTipo(e.target.value as TipoFichaje)}>
                  {(Object.keys(TIPOS_FICHAJE) as TipoFichaje[]).map((t) => (
                    <option key={t} value={t}>
                      {TIPOS_FICHAJE[t]}
                    </option>
                  ))}
                </GwSelect>
              </GwField>
              <GwField label="Hora (Canarias)">
                <GwInput type="time" value={hora} onChange={(e) => setHora(e.target.value)} />
              </GwField>
              <GwField label="Motivo (obligatorio)" className="min-w-[260px] flex-1">
                <GwInput value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ej.: se le olvidó fichar la salida; avisó por WhatsApp a las 17:05" />
              </GwField>
              <button type="button" className="gw-btn font-bold" disabled={!motivo.trim() || !hora} onClick={() => void enviar(false)}>
                {anular ? 'Guardar la hora buena' : 'Añadir fichaje'}
              </button>
              {anular && (
                <button type="button" className="gw-btn" disabled={!motivo.trim()} onClick={() => void enviar(true)} title="El fichaje sobra (p. ej. lo hizo dos veces): se anula sin poner otro">
                  Solo anularlo
                </button>
              )}
            </div>
          </GwGroup>
        </>
      )}
      {msg && <div className={`mt-1 font-bold ${msg.ok ? 'text-[#127a12]' : 'text-[#c42b1c]'}`}>{msg.t}</div>}
    </Caja>
  )
}

// ------------------------------------------------------------------ Exportar
function Exportar({ personas }: { personas: Persona[] }) {
  const mesActual = hoyCan().slice(0, 7)
  const [emp, setEmp] = useState('')
  const [modo, setModo] = useState<'mes' | 'rango'>('mes')
  const [mes, setMes] = useState(mesActual)
  const [desde, setDesde] = useState(mesActual + '-01')
  const [hasta, setHasta] = useState(hoyCan())
  const [soloFuera, setSoloFuera] = useState(false)
  const [evs, setEvs] = useState<EventoFichaje[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const rango = useMemo(() => {
    if (modo === 'rango') return [desde, hasta]
    const [a, m] = mes.split('-').map(Number)
    return [`${mes}-01`, new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)]
  }, [modo, mes, desde, hasta])
  const ver = () =>
    eventos(rango[0], rango[1], emp)
      .then((e) => (setEvs(e), setError(null)))
      .catch((e: Error) => setError(e.message))
  const js = useMemo(() => jornadas(evs ?? []).filter((j) => !soloFuera || j.fueraHorario || j.fueraSitio), [evs, soloFuera])
  const total = js.reduce((s, j) => s + j.trabajadoMin, 0)
  const persona = personas.find((p) => p.codigo === emp)
  const tabla = (): TablaExportar => ({
    titulo: `Registro de jornada · ${persona?.nombre ?? 'Todo el personal'} · ${fechaCan(rango[0])} a ${fechaCan(rango[1])}`,
    fichero: `registro-jornada-${persona ? corto(persona).replace(/\s+/g, '-') : 'todos'}-${rango[0]}`,
    apaisado: false,
    columnas: ['Día', 'Persona', 'Entrada', 'Salida', 'Pausas', 'Horas', 'Observaciones'],
    filas: [
      ...js.map((j) => [
        `${diaSemana(j.dia)} ${fechaCan(j.dia)}`,
        j.nombre,
        horaCan(j.entrada),
        j.salida ? horaCan(j.salida) : j.abierta ? 'sin salida' : '',
        j.pausaMin ? duracion(j.pausaMin) : '',
        duracion(j.trabajadoMin),
        [j.corregida && 'corregido', j.fueraHorario && 'fuera de horario', j.fueraSitio && 'fuera de sitio'].filter(Boolean).join(', '),
      ]),
      ['', 'TOTAL', '', '', '', duracion(total), ''],
    ],
  })
  const whatsapp = () => {
    const t = tabla()
    const texto = [t.titulo, ...t.filas.map((f) => f.filter((x) => x !== '').join(' · '))].join('\n')
    window.open(`https://wa.me/?text=${encodeURIComponent(texto)}`, '_blank')
  }
  return (
    <Caja titulo="Exportar el registro de jornada">
      <div className="mb-1 flex flex-wrap items-end gap-2">
        <GwField label="Persona">
          <GwSelect value={emp} onChange={(e) => setEmp(e.target.value)} className="w-[200px]">
            <option value="">Todo el personal</option>
            {personas
              .filter((p) => p.ficha)
              .map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {corto(p)}
                </option>
              ))}
          </GwSelect>
        </GwField>
        <GwField label="Periodo">
          <GwSelect value={modo} onChange={(e) => setModo(e.target.value as 'mes' | 'rango')}>
            <option value="mes">Un mes</option>
            <option value="rango">Entre fechas</option>
          </GwSelect>
        </GwField>
        {modo === 'mes' ? (
          <GwField label="Mes">
            <GwInput type="month" value={mes} onChange={(e) => setMes(e.target.value)} />
          </GwField>
        ) : (
          <>
            <GwField label="Desde">
              <GwInput type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
            </GwField>
            <GwField label="Hasta">
              <GwInput type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </GwField>
          </>
        )}
        <label className="flex items-center gap-1 pb-1">
          <input type="checkbox" checked={soloFuera} onChange={(e) => setSoloFuera(e.target.checked)} /> Solo fuera de horario o de sitio
        </label>
        <button type="button" className="gw-btn font-bold" onClick={() => void ver()}>
          Vista previa
        </button>
        <button type="button" className="gw-btn" disabled={!js.length} onClick={() => exportarPdf(tabla())}>
          🖨 Imprimir / PDF
        </button>
        <button type="button" className="gw-btn" disabled={!js.length} onClick={() => exportarExcel(tabla())}>
          📊 Excel
        </button>
        <button type="button" className="gw-btn" disabled={!js.length} onClick={whatsapp}>
          WhatsApp
        </button>
      </div>
      {error && <div className="font-bold text-[#c42b1c]">{error}</div>}
      {evs && !js.length && <div>No hay jornadas en ese periodo.</div>}
      {!!js.length && (
        <table className="w-full border-collapse">
          <thead>
            <tr>
              {tabla().columnas.map((c) => (
                <th key={c} className={th}>
                  {c}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {tabla().filas.map((f, i) => (
              <tr key={i} className={i === js.length ? 'font-bold' : js[i]?.abierta && js[i].dia !== hoyCan() ? 'bg-[#fff3b0]' : ''}>
                {f.map((v, j) => (
                  <td key={j} className={td}>
                    {v}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="mt-1 text-[11px] text-[#555]">En amarillo, días pasados sin salida fichada: corrígelos en «Corrección». Este registro hay que guardarlo 4 años y darlo a la persona o a la Inspección si lo piden.</div>
    </Caja>
  )
}

// ------------------------------------------------------------------ Horarios y festivos
const HORARIO_VACIO = { manana_desde: null, manana_hasta: null, tarde_desde: null, tarde_hasta: null, sabado_desde: null, sabado_hasta: null, domingos: false }

function EditorHorario({ titulo, clave, onGuardado }: { titulo: string; clave: { departamento_codigo: string | null; empleado_codigo: string | null }; onGuardado?: () => void }) {
  const [h, setH] = useState<Horario | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const columna = clave.departamento_codigo ? 'departamento_codigo' : 'empleado_codigo'
  const valor = (clave.departamento_codigo ?? clave.empleado_codigo)!
  useEffect(() => {
    void supabase
      .from('fichaje_horario')
      .select('*')
      .eq(columna, valor)
      .maybeSingle()
      .then(({ data }) => setH((data as Horario | null) ?? { ...clave, ...HORARIO_VACIO }))
  }, [columna, valor]) // eslint-disable-line react-hooks/exhaustive-deps
  if (!h) return null
  const campo = (k: keyof typeof HORARIO_VACIO, label: string) => (
    <GwField label={label}>
      <GwInput type="time" value={hh(h[k] as string | null)} onChange={(e) => setH({ ...h, [k]: e.target.value || null })} className="w-[90px]" />
    </GwField>
  )
  const guardar = async () => {
    const { id: _id, ...fila } = h
    void _id
    const { error } = await supabase.from('fichaje_horario').upsert({ ...fila, actualizado_en: new Date().toISOString() }, { onConflict: columna })
    setMsg(error ? error.message : 'Guardado.')
    onGuardado?.()
  }
  const quitar = async () => {
    const { error } = await supabase.from('fichaje_horario').delete().eq(columna, valor)
    setMsg(error ? error.message : 'Quitado: vuelve a mandar el del departamento.')
    setH({ ...clave, ...HORARIO_VACIO })
    onGuardado?.()
  }
  return (
    <GwGroup title={titulo}>
      <div className="flex flex-wrap items-end gap-2 p-1">
        {campo('manana_desde', 'Mañana desde')}
        {campo('manana_hasta', 'hasta')}
        {campo('tarde_desde', 'Tarde desde')}
        {campo('tarde_hasta', 'hasta')}
        {campo('sabado_desde', 'Sábado desde')}
        {campo('sabado_hasta', 'hasta')}
        <label className="flex items-center gap-1 pb-1">
          <input type="checkbox" checked={h.domingos} onChange={(e) => setH({ ...h, domingos: e.target.checked })} /> Trabaja domingos
        </label>
        <button type="button" className="gw-btn font-bold" onClick={() => void guardar()}>
          Guardar
        </button>
        {clave.empleado_codigo && h.id != null && (
          <button type="button" className="gw-btn" onClick={() => void quitar()}>
            Quitar horario propio
          </button>
        )}
        {msg && <span className="pb-1 font-bold text-[#127a12]">{msg}</span>}
      </div>
    </GwGroup>
  )
}

function Horarios({ deps, personas }: { deps: Departamento[]; personas: Persona[] }) {
  const [dep, setDep] = useState('')
  const [emp, setEmp] = useState('')
  const [festivos, setFestivos] = useState<Festivo[]>([])
  const [nuevo, setNuevo] = useState<Festivo>({ fecha: '', etiqueta: '', cerrado: true, manana_desde: null, manana_hasta: null, tarde_desde: null, tarde_hasta: null })
  const [msg, setMsg] = useState<string | null>(null)
  const cargarFestivos = useCallback(async () => {
    const { data } = await supabase.from('fichaje_festivo').select('*').gte('fecha', `${new Date().getFullYear() - 1}-01-01`).order('fecha')
    setFestivos((data ?? []) as Festivo[])
  }, [])
  useEffect(() => {
    void cargarFestivos()
  }, [cargarFestivos])
  const guardarFestivo = async () => {
    const { error } = await supabase.from('fichaje_festivo').upsert({ ...nuevo, etiqueta: nuevo.etiqueta.trim(), actualizado_en: new Date().toISOString() })
    setMsg(error ? error.message : null)
    if (!error) setNuevo({ ...nuevo, fecha: '', etiqueta: '' })
    void cargarFestivos()
  }
  const quitarFestivo = async (f: string) => {
    await supabase.from('fichaje_festivo').delete().eq('fecha', f)
    void cargarFestivos()
  }
  return (
    <div className="flex flex-col gap-1.5">
      <Caja titulo="Horario por departamento">
        <div className="mb-1 text-[12px] text-[#555]">Sirve para las alertas de «fuera de horario» (15 min de margen). Si una persona tiene horario propio, manda el suyo.</div>
        <GwSelect value={dep} onChange={(e) => setDep(e.target.value)} className="mb-1 w-[220px]">
          <option value="">Elige departamento…</option>
          {deps.map((d) => (
            <option key={d.codigo} value={d.codigo}>
              {d.nombre}
            </option>
          ))}
        </GwSelect>
        {dep && <EditorHorario key={dep} titulo={`Horario de ${deps.find((d) => d.codigo === dep)?.nombre}`} clave={{ departamento_codigo: dep, empleado_codigo: null }} />}
      </Caja>
      <Caja titulo="Horario individual (opcional)">
        <GwSelect value={emp} onChange={(e) => setEmp(e.target.value)} className="mb-1 w-[220px]">
          <option value="">Elige persona…</option>
          {personas
            .filter((p) => p.ficha)
            .map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {corto(p)}
                {p.horario_propio ? ' (propio)' : ''}
              </option>
            ))}
        </GwSelect>
        {emp && <EditorHorario key={emp} titulo={`Horario de ${corto(personas.find((p) => p.codigo === emp)!)}`} clave={{ departamento_codigo: null, empleado_codigo: emp }} />}
      </Caja>
      <Caja titulo="Festivos y días con horario especial">
        <div className="mb-1 flex flex-wrap items-end gap-2">
          <GwField label="Fecha">
            <GwInput type="date" value={nuevo.fecha} onChange={(e) => setNuevo({ ...nuevo, fecha: e.target.value })} />
          </GwField>
          <GwField label="Qué es">
            <GwInput value={nuevo.etiqueta} onChange={(e) => setNuevo({ ...nuevo, etiqueta: e.target.value })} placeholder="Ej.: Día de Canarias" className="w-[200px]" />
          </GwField>
          <label className="flex items-center gap-1 pb-1">
            <input type="checkbox" checked={nuevo.cerrado} onChange={(e) => setNuevo({ ...nuevo, cerrado: e.target.checked })} /> Cerrado todo el día
          </label>
          {!nuevo.cerrado && (
            <>
              <GwField label="Mañana desde">
                <GwInput type="time" value={hh(nuevo.manana_desde)} onChange={(e) => setNuevo({ ...nuevo, manana_desde: e.target.value || null })} />
              </GwField>
              <GwField label="hasta">
                <GwInput type="time" value={hh(nuevo.manana_hasta)} onChange={(e) => setNuevo({ ...nuevo, manana_hasta: e.target.value || null })} />
              </GwField>
              <GwField label="Tarde desde">
                <GwInput type="time" value={hh(nuevo.tarde_desde)} onChange={(e) => setNuevo({ ...nuevo, tarde_desde: e.target.value || null })} />
              </GwField>
              <GwField label="hasta">
                <GwInput type="time" value={hh(nuevo.tarde_hasta)} onChange={(e) => setNuevo({ ...nuevo, tarde_hasta: e.target.value || null })} />
              </GwField>
            </>
          )}
          <button type="button" className="gw-btn font-bold" disabled={!nuevo.fecha || !nuevo.etiqueta.trim()} onClick={() => void guardarFestivo()}>
            Guardar día
          </button>
        </div>
        {msg && <div className="font-bold text-[#c42b1c]">{msg}</div>}
        <table className="border-collapse">
          <tbody>
            {festivos.map((f) => (
              <tr key={f.fecha}>
                <td className={td}>
                  {diaSemana(f.fecha)} {fechaCan(f.fecha)}
                </td>
                <td className={td}>{f.etiqueta}</td>
                <td className={td}>{f.cerrado ? 'Cerrado' : [f.manana_desde && `${hh(f.manana_desde)}–${hh(f.manana_hasta)}`, f.tarde_desde && `${hh(f.tarde_desde)}–${hh(f.tarde_hasta)}`].filter(Boolean).join(' y ')}</td>
                <td className={td}>
                  <button type="button" className="gw-btn h-[22px]" onClick={() => void quitarFestivo(f.fecha)}>
                    Quitar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Caja>
    </div>
  )
}

// ------------------------------------------------------------------ Ubicaciones
function Ubicaciones({ deps, recargar }: { deps: Departamento[]; recargar: () => Promise<void> }) {
  const [edit, setEdit] = useState<Record<string, { lat: string; lng: string; radio: string }>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const val = (d: Departamento) => edit[d.codigo] ?? { lat: d.lat?.toString() ?? '', lng: d.lng?.toString() ?? '', radio: d.radio_m?.toString() ?? '' }
  const set = (d: Departamento, p: Partial<{ lat: string; lng: string; radio: string }>) => setEdit((x) => ({ ...x, [d.codigo]: { ...val(d), ...p } }))
  const aqui = (d: Departamento) =>
    navigator.geolocation.getCurrentPosition(
      (p) => set(d, { lat: p.coords.latitude.toFixed(6), lng: p.coords.longitude.toFixed(6), radio: val(d).radio || '150' }),
      () => setMsg('El navegador no ha dado la ubicación: permítela o escribe las coordenadas (las de Google Maps).'),
      { enableHighAccuracy: true, timeout: 10_000 },
    )
  const guardar = async (d: Departamento) => {
    const v = val(d)
    const num = (s: string) => (s.trim() === '' ? null : Number(s.replace(',', '.')))
    const fila = { lat: num(v.lat), lng: num(v.lng), radio_m: num(v.radio), actualizado_en: new Date().toISOString() }
    if ([fila.lat, fila.lng, fila.radio_m].some((x) => x != null && Number.isNaN(x))) return setMsg('Escribe números (p. ej. 28.4636, -16.2518 y 150).')
    const { error } = await supabase.from('fichaje_departamento').update(fila).eq('codigo', d.codigo)
    setMsg(error ? error.message : `Ubicación de ${d.nombre} guardada.`)
    await recargar()
  }
  return (
    <Caja titulo="Lugar esperado de cada departamento">
      <div className="mb-1 text-[12px] text-[#555]">
        Si alguien ficha a más distancia que el radio, sale en Alertas como «fuera del lugar esperado». Déjalo vacío en los departamentos que trabajan fuera (comerciales, reparto…). El fichaje nunca se bloquea por esto.
      </div>
      {msg && <div className="mb-1 font-bold text-[#127a12]">{msg}</div>}
      <table className="border-collapse">
        <thead>
          <tr>
            <th className={th}>Departamento</th>
            <th className={th}>Latitud</th>
            <th className={th}>Longitud</th>
            <th className={th}>Radio (m)</th>
            <th className={th}></th>
          </tr>
        </thead>
        <tbody>
          {deps.map((d) => (
            <tr key={d.codigo}>
              <td className={td}>{d.nombre}</td>
              <td className={td}>
                <GwInput value={val(d).lat} onChange={(e) => set(d, { lat: e.target.value })} className="w-[110px]" />
              </td>
              <td className={td}>
                <GwInput value={val(d).lng} onChange={(e) => set(d, { lng: e.target.value })} className="w-[110px]" />
              </td>
              <td className={td}>
                <GwInput value={val(d).radio} onChange={(e) => set(d, { radio: e.target.value })} className="w-[70px]" />
              </td>
              <td className={td}>
                <span className="flex gap-1">
                  <button type="button" className="gw-btn h-[22px]" onClick={() => aqui(d)} title="Coge la ubicación de este ordenador o móvil (hazlo estando allí)">
                    📍 Estoy aquí
                  </button>
                  <button type="button" className="gw-btn h-[22px] font-bold" onClick={() => void guardar(d)}>
                    Guardar
                  </button>
                  {d.lat != null && (
                    <a className="gw-btn h-[22px]" href={`https://www.google.com/maps?q=${d.lat},${d.lng}`} target="_blank" rel="noreferrer">
                      Ver
                    </a>
                  )}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Caja>
  )
}

// ------------------------------------------------------------------ Normativa y Operativa
function Normativa() {
  return (
    <Caja titulo="Qué dice la ley (registro de jornada)">
      <GwOperativa
        bloques={[
          {
            titulo: 'Obligación',
            notas: [
              'Real Decreto-ley 8/2019 y artículo 34.9 del Estatuto de los Trabajadores: la empresa tiene que registrar cada día la hora de inicio y de fin de la jornada de cada persona.',
              'El registro se conserva 4 años y tiene que estar a disposición de la persona, de sus representantes y de la Inspección de Trabajo.',
            ],
          },
          {
            titulo: 'Cómo lo cumple el ERP',
            notas: [
              'La hora la pone el servidor, no el móvil: no se puede fichar con la hora cambiada.',
              'Un fichaje no se modifica ni se borra nunca. Los errores se arreglan con una corrección: un registro nuevo con el motivo y quién la hace; el fichaje equivocado queda en el histórico, tachado.',
              'Todo queda además en la Auditoría del ERP.',
              'Cada persona entra con su PIN (5 fallos seguidos lo bloquean 15 minutos).',
              'La ubicación solo se guarda en el momento de fichar, si el móvil la da; nunca bloquea el fichaje. Conviene que lo recoja el aviso legal del personal.',
            ],
          },
        ]}
      />
    </Caja>
  )
}

function Operativa() {
  return (
    <Caja>
      <GwOperativa
        bloques={[
          {
            titulo: 'Poner en marcha',
            pasos: [
              'Las personas salen de Archivo → Empleados. En «Personas», marca «Ficha», elige el departamento y ponle un PIN de 4 cifras (se lo das tú; no se puede ver después, solo cambiar).',
              'Si la persona reparte, elige su repartidor: así la app de reparto sabe si ha fichado (sin fichar no puede entregar) y al fichar le sale «🚚 Mi reparto».',
              'En «Horarios y festivos» pon el horario de cada departamento (y el individual de quien lo tenga distinto) y los festivos.',
              'En «Ubicaciones», estando en cada sitio, pulsa «📍 Estoy aquí» y «Guardar».',
              'En el móvil o tablet de la entrada abre la pantalla de fichar (botón «🕒 Abrir la pantalla de fichar») y guárdala en la pantalla de inicio.',
            ],
          },
          {
            titulo: 'Día a día',
            pasos: [
              '«Hoy» enseña quién está trabajando, en pausa, con la jornada terminada o sin fichar.',
              '«Alertas» junta los fichajes fuera de horario o lejos del sitio de los últimos 7, 30 o 90 días.',
              'Si alguien se olvida de fichar o se equivoca: «Corrección», elige persona y día, y añade el fichaje que falta o pulsa «Corregir este» en el equivocado. El motivo es obligatorio.',
              'A fin de mes: «Exportar», elige persona y mes, «Vista previa» y «Imprimir / PDF» (o WhatsApp). Los días pasados sin salida salen en amarillo: corrígelos antes.',
            ],
          },
          {
            titulo: 'NEXA',
            notas: ['NEXA puede consultar los fichajes (tablas fichaje_*) para responder preguntas como «¿quién no ha fichado hoy?» o «horas de Pepe en octubre».'],
          },
        ]}
      />
    </Caja>
  )
}
