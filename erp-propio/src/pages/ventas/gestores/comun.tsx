import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Check, X } from 'lucide-react'
import { GwRadio, GwWindow } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'

// Piezas comunes del Gestor de Pedidos y del Gestor de Presupuestos de GeminisWin:
// pestañas grandes, filtro «Filtrar Según Fecha» + «Tiendas», botones-casilla ×/✓,
// grupo de procesos al detectar documentos nuevos y opciones guardadas por puesto.

export const BIG_INPUT = 'gw-input h-[30px]! text-[16px]!'

export function BigTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { key: string; label: string }[]
  active: string
  onChange: (k: string) => void
}) {
  return (
    <div className="flex flex-none items-end gap-0 pl-1">
      {tabs.map((t) => {
        const on = t.key === active
        return (
          <button
            key={t.key}
            type="button"
            onClick={() => onChange(t.key)}
            className={`-mb-px whitespace-nowrap border border-[var(--gw-border)] px-3 text-[18px] ${
              on ? 'z-10 h-[40px] border-b-transparent bg-[var(--gw-face)] font-bold' : 'mt-[3px] h-[36px] bg-[#f6f6f6] hover:bg-[#e5f1fb]'
            }`}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

/** Botón-casilla de GeminisWin: × roja (no) / ✓ verde (sí); en gris si está deshabilitado. */
export function OptionButton({
  label,
  value,
  onChange,
  disabled,
  title,
  className = '',
}: {
  label: string
  value: boolean
  onChange?: (v: boolean) => void
  disabled?: boolean
  title?: string
  className?: string
}) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={() => onChange?.(!value)}
      className={`flex h-[40px] min-w-0 items-center justify-center gap-1 border border-[var(--gw-border)] bg-[#f3f3f3] px-2 text-[17px] hover:bg-[#e5f1fb] disabled:text-[#9a9a9a] disabled:hover:bg-[#f3f3f3] ${className}`}
    >
      {value ? (
        <Check size={14} strokeWidth={3} className={disabled ? 'text-[#9a9a9a]' : 'text-[#2a9d2a]'} />
      ) : (
        <X size={14} strokeWidth={3} className={disabled ? 'text-[#9a9a9a]' : 'text-[#c42b1c]'} />
      )}
      <span className="truncate">{label}</span>
    </button>
  )
}

export function BarButton({
  title,
  onClick,
  disabled,
  children,
  className = '',
}: {
  title: string
  onClick?: () => void
  disabled?: boolean
  children: ReactNode
  className?: string
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-[42px] items-center justify-center gap-1.5 border border-[var(--gw-border)] bg-[#f3f3f3] px-2 text-[18px] text-[#1d3a8a] hover:bg-[#e5f1fb] disabled:text-[#a8a8a8] disabled:hover:bg-[#f3f3f3] ${className}`}
    >
      {children}
    </button>
  )
}

/* ---------- Periodos rápidos del filtro de fecha ---------- */

export const PERIODOS = [
  'Hoy',
  'Ayer',
  'Esta semana',
  'La semana pasada',
  'El Mes actual',
  'El Mes pasado',
  'El Mes pasado y actual',
  'Este año',
  'El año pasado',
  'Personalizado',
] as const
export type Periodo = (typeof PERIODOS)[number]

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function rangoPeriodo(p: Periodo, hoy = new Date()): [string, string] {
  const y = hoy.getFullYear()
  const m = hoy.getMonth()
  const lunes = new Date(hoy)
  lunes.setDate(hoy.getDate() - ((hoy.getDay() + 6) % 7))
  switch (p) {
    case 'Hoy':
      return [iso(hoy), iso(hoy)]
    case 'Ayer': {
      const a = new Date(hoy)
      a.setDate(a.getDate() - 1)
      return [iso(a), iso(a)]
    }
    case 'Esta semana': {
      const d = new Date(lunes)
      d.setDate(d.getDate() + 6)
      return [iso(lunes), iso(d)]
    }
    case 'La semana pasada': {
      const a = new Date(lunes)
      a.setDate(a.getDate() - 7)
      const b = new Date(lunes)
      b.setDate(b.getDate() - 1)
      return [iso(a), iso(b)]
    }
    case 'El Mes actual':
      return [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))]
    case 'El Mes pasado':
      return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))]
    case 'El Mes pasado y actual':
      return [iso(new Date(y, m - 1, 1)), iso(new Date(y, m + 1, 0))]
    case 'Este año':
      return [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))]
    case 'El año pasado':
      return [iso(new Date(y - 1, 0, 1)), iso(new Date(y - 1, 11, 31))]
    default:
      return [iso(hoy), iso(hoy)]
  }
}

export function fechaEs(v: string | null | undefined) {
  if (!v) return ''
  const [y, m, d] = v.slice(0, 10).split('-')
  return d && m && y ? `${d}/${m}/${y}` : v
}

/* ---------- Filtro: «Filtrar Según Fecha» + «Tiendas» ---------- */

export interface Filtro {
  campo: string
  periodo: Periodo
  desde: string
  hasta: string
  tiendaModo: 'desdeHasta' | 'cualquiera' | 'seleccionar'
  tiendaDesde: string
  tiendaHasta: string
  tiendas: string
}

export function filtroInicial(campo: string, periodo: Periodo): Filtro {
  const [desde, hasta] = rangoPeriodo(periodo)
  return { campo, periodo, desde, hasta, tiendaModo: 'cualquiera', tiendaDesde: '', tiendaHasta: '', tiendas: '' }
}

/** Aplica el filtro de tiendas a una consulta de supabase-js sobre tienda_terminal_codigo. */
export function tiendasSeleccionadas(f: Filtro) {
  return f.tiendas
    .split(/[,\s;]+/)
    .map((t) => t.trim())
    .filter(Boolean)
}

export function FiltroBar({
  filtro,
  onChange,
  campos,
  children,
}: {
  filtro: Filtro
  onChange: (f: Filtro) => void
  campos: { value: string; label: string }[]
  children: ReactNode
}) {
  const [lookup, setLookup] = useState<null | 'desde' | 'hasta' | 'sel'>(null)
  const personal = filtro.periodo === 'Personalizado'
  const set = (p: Partial<Filtro>) => onChange({ ...filtro, ...p })
  return (
    <div className="flex flex-none gap-2 border border-[var(--gw-border)] bg-[var(--gw-face)] p-1.5">
      <fieldset className="gw-group min-w-0 flex-[1.15] px-2 pb-2 pt-1">
        <legend className="text-[18px]!">Filtrar Según Fecha</legend>
        <div className="grid grid-cols-2 gap-x-2 gap-y-2">
          <select className={BIG_INPUT} value={filtro.campo} onChange={(e) => set({ campo: e.target.value })} title="Campo de fecha por el que se filtra">
            {campos.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            className={BIG_INPUT}
            value={filtro.periodo}
            onChange={(e) => {
              const p = e.target.value as Periodo
              if (p === 'Personalizado') set({ periodo: p })
              else {
                const [desde, hasta] = rangoPeriodo(p)
                set({ periodo: p, desde, hasta })
              }
            }}
          >
            {PERIODOS.map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
          <input type="date" className={`${BIG_INPUT} mx-1.5 w-auto!`} disabled={!personal} value={filtro.desde} onChange={(e) => set({ desde: e.target.value })} title="Desde" />
          <input type="date" className={`${BIG_INPUT} mx-1.5 w-auto!`} disabled={!personal} value={filtro.hasta} onChange={(e) => set({ hasta: e.target.value })} title="Hasta" />
        </div>
      </fieldset>
      <fieldset className="gw-group min-w-0 flex-1 px-2 pb-2 pt-1">
        <legend className="text-[18px]!">Tiendas</legend>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-[3px] text-[17px]">
          <div className="flex flex-col gap-[3px] [&_label]:text-[17px]!">
            <GwRadio name="gw-tiendas" label="Desde/Hasta" checked={filtro.tiendaModo === 'desdeHasta'} onChange={() => set({ tiendaModo: 'desdeHasta' })} />
            <GwRadio name="gw-tiendas" label="Cualquiera" checked={filtro.tiendaModo === 'cualquiera'} onChange={() => set({ tiendaModo: 'cualquiera' })} />
            <GwRadio name="gw-tiendas" label="Seleccionar" checked={filtro.tiendaModo === 'seleccionar'} onChange={() => set({ tiendaModo: 'seleccionar' })} />
          </div>
          <div className="flex min-w-0 flex-col gap-1.5">
            <div className="flex min-w-0 gap-1.5">
              <TiendaCode
                value={filtro.tiendaDesde}
                disabled={filtro.tiendaModo !== 'desdeHasta'}
                onChange={(v) => set({ tiendaDesde: v })}
                onLookup={() => setLookup('desde')}
                title="Tienda desde"
              />
              <TiendaCode
                value={filtro.tiendaHasta}
                disabled={filtro.tiendaModo !== 'desdeHasta'}
                onChange={(v) => set({ tiendaHasta: v })}
                onLookup={() => setLookup('hasta')}
                title="Tienda hasta"
              />
            </div>
            <TiendaCode
              value={filtro.tiendas}
              disabled={filtro.tiendaModo !== 'seleccionar'}
              onChange={(v) => set({ tiendas: v })}
              onLookup={() => setLookup('sel')}
              title="Tiendas seleccionadas, separadas por comas"
              wide
            />
          </div>
        </div>
      </fieldset>
      <div className="flex w-[150px] flex-none flex-col gap-1.5">{children}</div>
      {lookup && (
        <GwLookupDialog<{ codigo: string; descripcion: string }>
          title="Tiendas"
          table="tienda_terminal"
          columns={[
            { key: 'codigo', label: 'Código', width: 90 },
            { key: 'descripcion', label: 'Descripción' },
          ]}
          searchColumns={['codigo', 'descripcion']}
          orderBy="codigo"
          keyColumn="codigo"
          onClose={() => setLookup(null)}
          onPick={(r) => {
            if (lookup === 'desde') set({ tiendaDesde: r.codigo })
            else if (lookup === 'hasta') set({ tiendaHasta: r.codigo })
            else set({ tiendas: [...tiendasSeleccionadas(filtro).filter((t) => t !== r.codigo), r.codigo].join(', ') })
            setLookup(null)
          }}
        />
      )}
    </div>
  )
}

function TiendaCode({
  value,
  onChange,
  onLookup,
  disabled,
  title,
  wide,
}: {
  value: string
  onChange: (v: string) => void
  onLookup: () => void
  disabled: boolean
  title: string
  wide?: boolean
}) {
  return (
    <div className={`flex min-w-0 ${wide ? 'w-full' : 'flex-1'}`}>
      <input className={`${BIG_INPUT} min-w-0`} value={value} disabled={disabled} title={title} onChange={(e) => onChange(e.target.value)} />
      <button
        type="button"
        className="gw-btn h-[30px]! w-[54px] flex-none text-[18px] font-bold tracking-[2px]"
        disabled={disabled}
        onClick={onLookup}
        title="Buscar tienda"
      >
        ···
      </button>
    </div>
  )
}

/* ---------- Grupo «Ejecutar los siguientes procesos al Detectar … Nuevos» ---------- */

export interface Procesos {
  activo: boolean
  email: boolean
  emailA: string
  relacion: boolean
  relacionPor: 'pantalla' | 'impresora'
  relacionInforme: string
  completo: boolean
  completoPor: 'pantalla' | 'impresora'
  completoInforme: string
}

export const procesosIniciales: Procesos = {
  activo: false,
  email: false,
  emailA: '',
  relacion: false,
  relacionPor: 'impresora',
  relacionInforme: '',
  completo: false,
  completoPor: 'impresora',
  completoInforme: '',
}

const NO_DISPONIBLE = 'Se guarda la opción, pero el envío de email y la impresión automática aún no están disponibles en el ERP propio'

export function ProcesosGroup({
  value,
  onChange,
  nombre,
  textoCompleto,
}: {
  value: Procesos
  onChange: (p: Procesos) => void
  nombre: string
  textoCompleto: string
}) {
  const set = (p: Partial<Procesos>) => onChange({ ...value, ...p })
  const off = !value.activo
  const chk = (checked: boolean, label: string, onC: (v: boolean) => void, dis: boolean) => (
    <label className={`flex select-none items-center gap-1.5 whitespace-nowrap text-[18px] ${dis ? 'text-[#8a8a8a]' : ''}`} title={NO_DISPONIBLE}>
      <input type="checkbox" className="m-0 h-[13px] w-[13px] accent-[#0078d7]" checked={checked} disabled={dis} onChange={(e) => onC(e.target.checked)} />
      {label}
    </label>
  )
  const destino = (por: 'pantalla' | 'impresora', on: (v: 'pantalla' | 'impresora') => void, dis: boolean, grupo: string) => (
    <div className={`flex h-[34px] items-center gap-16 border border-[var(--gw-border-light)] px-3 [&_label]:text-[18px]! ${dis ? '[&_label]:text-[#8a8a8a]' : ''}`}>
      <GwRadio name={grupo} label="Pantalla" checked={por === 'pantalla'} disabled={dis} onChange={() => on('pantalla')} />
      <GwRadio name={grupo} label="Impresora" checked={por === 'impresora'} disabled={dis} onChange={() => on('impresora')} />
    </div>
  )
  const informe = (v: string, on: (v: string) => void, dis: boolean) => (
    <div className="flex gap-1.5">
      <input className={`${BIG_INPUT} h-[40px]!`} value={v} disabled={dis} onChange={(e) => on(e.target.value)} title="Informe que se imprime" />
      <button type="button" className="gw-btn h-[40px]! w-[90px] flex-none" disabled title={NO_DISPONIBLE}>
        🖨
      </button>
    </div>
  )
  return (
    <fieldset className="gw-group flex flex-col gap-1.5 px-2 pb-2 pt-1">
      <legend className="flex items-center gap-1.5 text-[19px]!">
        <input type="checkbox" className="m-0 h-[13px] w-[13px] accent-[#0078d7]" checked={value.activo} onChange={(e) => set({ activo: e.target.checked })} />
        Ejecutar los siguientes procesos al Detectar {nombre} Nuevos
      </legend>
      <div className="grid grid-cols-[260px_minmax(0,1fr)] items-center gap-2">
        {chk(value.email, 'Enviar un Email a:', (v) => set({ email: v }), off)}
        <input className={`${BIG_INPUT} h-[40px]!`} value={value.emailA} disabled={off || !value.email} onChange={(e) => set({ emailA: e.target.value })} title={NO_DISPONIBLE} />
      </div>
      <div className="flex items-center justify-between gap-2">
        {chk(value.relacion, `Imprimir informe de relación de los ${nombre.toLowerCase()} nuevos Por`, (v) => set({ relacion: v }), off)}
        {destino(value.relacionPor, (v) => set({ relacionPor: v }), off || !value.relacion, 'gw-rel')}
      </div>
      {informe(value.relacionInforme, (v) => set({ relacionInforme: v }), off || !value.relacion)}
      <div className="flex items-center justify-between gap-2">
        {chk(value.completo, textoCompleto, (v) => set({ completo: v }), off)}
        {destino(value.completoPor, (v) => set({ completoPor: v }), off || !value.completo, 'gw-com')}
      </div>
      {informe(value.completoInforme, (v) => set({ completoInforme: v }), off || !value.completo)}
    </fieldset>
  )
}

/* ---------- Opciones por puesto (localStorage) ---------- */

export function leerOpciones<T>(clave: string, porDefecto: T): T {
  try {
    const raw = localStorage.getItem(clave)
    return raw ? { ...porDefecto, ...(JSON.parse(raw) as Partial<T>) } : porDefecto
  } catch {
    return porDefecto
  }
}

export function guardarOpciones<T>(clave: string, v: T) {
  try {
    localStorage.setItem(clave, JSON.stringify(v))
    return true
  } catch {
    return false
  }
}

export function borrarOpciones(clave: string) {
  try {
    localStorage.removeItem(clave)
  } catch {
    /* sin almacenamiento local en este puesto */
  }
}

/** Ejecuta `fn` cada `segundos` mientras `activo`; siempre con la versión más reciente de `fn`. */
export function useRefresco(activo: boolean, segundos: number, fn: () => void) {
  const ref = useRef(fn)
  useEffect(() => {
    ref.current = fn
  })
  useEffect(() => {
    if (!activo || segundos <= 0) return
    const id = setInterval(() => ref.current(), segundos * 1000)
    return () => clearInterval(id)
  }, [activo, segundos])
}

/** Pitido corto para avisar de documentos nuevos (silencioso si el navegador no lo permite). */
export function pitido() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const o = ctx.createOscillator()
    o.frequency.value = 880
    o.connect(ctx.destination)
    o.start()
    o.stop(ctx.currentTime + 0.18)
  } catch {
    /* sin audio */
  }
}

/* ---------- «Localizar» dentro de la rejilla ---------- */

export function LocalizarDialog({ onBuscar, onClose }: { onBuscar: (texto: string) => boolean; onClose: () => void }) {
  const [t, setT] = useState('')
  const [msg, setMsg] = useState('')
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-32" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title="Localizar registros" onClose={onClose} className="w-[460px]">
        <div className="flex flex-col gap-1.5">
          <span className="gw-label">Texto a buscar en la rejilla:</span>
          <input
            autoFocus
            className="gw-input"
            value={t}
            onChange={(e) => setT(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') setMsg(onBuscar(t) ? '' : 'No se ha encontrado.')
            }}
          />
          {msg && <span className="gw-label text-[#c42b1c]">{msg}</span>}
          <div className="flex justify-end gap-1.5">
            <button type="button" className="gw-btn" onClick={() => setMsg(onBuscar(t) ? '' : 'No se ha encontrado.')}>
              Buscar siguiente
            </button>
            <button type="button" className="gw-btn" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}

/* ---------- Consultas ---------- */

export function chunks<T>(arr: T[], n = 150): T[][] {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

export function nombreCliente(r: { nombre_cliente: string | null; cliente: unknown }) {
  const c = r.cliente as { nombre?: string } | { nombre?: string }[] | null
  const n = Array.isArray(c) ? c[0]?.nombre : c?.nombre
  return n ?? r.nombre_cliente ?? ''
}

/** Aplica a una consulta el filtro de fechas y de tiendas del gestor. */
export function conFiltro<Q extends {
  gte: (c: string, v: string) => Q
  lte: (c: string, v: string) => Q
  in: (c: string, v: string[]) => Q
}>(q: Q, f: Filtro, campoFecha: string, conHora: boolean): Q {
  let out = q
  const d = conHora ? `${f.desde}T00:00:00` : f.desde
  const h = conHora ? `${f.hasta}T23:59:59` : f.hasta
  if (f.desde) out = out.gte(campoFecha, d)
  if (f.hasta) out = out.lte(campoFecha, h)
  if (f.tiendaModo === 'desdeHasta') {
    if (f.tiendaDesde.trim()) out = out.gte('tienda_terminal_codigo', f.tiendaDesde.trim())
    if (f.tiendaHasta.trim()) out = out.lte('tienda_terminal_codigo', f.tiendaHasta.trim())
  } else if (f.tiendaModo === 'seleccionar') {
    const sel = tiendasSeleccionadas(f)
    if (sel.length) out = out.in('tienda_terminal_codigo', sel)
  }
  return out
}

