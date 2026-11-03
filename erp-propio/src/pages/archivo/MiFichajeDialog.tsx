// «Mi fichaje» (Rober, 03/11/2026): botón de la barra de accesos del ERP para fichar desde el ordenador más cercano,
// sin hacer cola en un solo aparato. Cada persona se identifica con su nombre y su código (PIN): el ordenador puede tener
// abierta la sesión de otra persona. Al fichar, la ventana se cierra sola; la siguiente persona la vuelve a abrir.
// Si el empleado de la sesión ficha, sale ya elegido (fn_fichaje_mio) pero también pone su código.
// Lo abre el evento «gw:mi-fichaje» (Layout → QuickBar). Gestión: Archivo → Fichaje.
// Diseño: lo ve cada empleado dos veces al día, así que es más vistoso que el resto del ERP (sin salirse de sus
// colores): saludo, reloj grande, estado en color, botones grandes, horas de hoy y de la semana y un mensaje amable.

import { useEffect, useState } from 'react'
import { supabase } from '../../lib/supabase'
import { GwWindow } from '../../components/gw'
import { delDia, duracion, FRASES_ENTRADA, FRASES_SALIDA, horaCan, TIPOS_FICHAJE, type EstadoFichaje, type TipoFichaje } from '../../lib/fichaje'

interface Panel {
  ok: boolean
  error?: string
  nombre: string
  estado: EstadoFichaje
  siguientes: TipoFichaje[]
  hoy: { tipo: TipoFichaje; en: string; origen: string }[]
  semana?: { tipo: TipoFichaje; en: string; dia: string }[]
  reparto_token: string | null
}

const BOTON: Record<TipoFichaje, { texto: string; icono: string; fondo: string }> = {
  entrada: { texto: 'Fichar entrada', icono: '▶', fondo: 'linear-gradient(135deg,#1e9e4a,#127a12)' },
  pausa_inicio: { texto: 'Empezar pausa', icono: '☕', fondo: 'linear-gradient(135deg,#f0a531,#c77700)' },
  pausa_fin: { texto: 'Volver de la pausa', icono: '▶', fondo: 'linear-gradient(135deg,#1e9e4a,#127a12)' },
  salida: { texto: 'Fichar salida', icono: '■', fondo: 'linear-gradient(135deg,#e2533f,#b3261e)' },
}
const ESTADO: Record<EstadoFichaje, { texto: string; color: string; fondo: string }> = {
  trabajando: { texto: 'Trabajando', color: '#127a12', fondo: '#e3f5e3' },
  pausa: { texto: 'En pausa', color: '#a86400', fondo: '#fff1d6' },
  salida: { texto: 'Jornada terminada', color: '#4a5568', fondo: '#eceff3' },
  sin_fichar: { texto: 'Sin fichar todavía', color: '#b3261e', fondo: '#fde7e4' },
}
const DIAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** Minutos trabajados en una lista ordenada de fichajes (hasta ahora si sigue trabajando). */
function minutos(evs: { tipo: TipoFichaje; en: string }[], hastaAhora: boolean) {
  let total = 0
  let desde: number | null = null
  for (const e of evs) {
    const t = new Date(e.en).getTime()
    if (e.tipo === 'entrada' || e.tipo === 'pausa_fin') desde = t
    else if (desde != null) {
      total += t - desde
      desde = null
    }
  }
  if (desde != null && hastaAhora) total += Date.now() - desde
  return total / 60000
}

function saludo(d: Date) {
  const h = Number(d.toLocaleTimeString('es-ES', { hour: '2-digit', hour12: false, timeZone: 'Atlantic/Canary' }))
  return h < 13 ? 'Buenos días' : h < 20 ? 'Buenas tardes' : 'Buenas noches'
}

function mensajeTras(tipo: TipoFichaje, nombre: string, minHoy: number) {
  switch (tipo) {
    case 'entrada':
      return `¡Bienvenido/a, ${nombre}!`
    case 'pausa_inicio':
      return 'Disfruta del descanso ☕ Te lo has ganado.'
    case 'pausa_fin':
      return '¡De vuelta! A por la segunda parte del día.'
    case 'salida':
      return `¡Hasta mañana, ${nombre}!${minHoy ? ` Hoy has trabajado ${duracion(minHoy)}.` : ''}`
  }
}

async function ubicacion(): Promise<{ lat: number; lng: number; precision: number } | null> {
  if (!navigator.geolocation) return null
  return new Promise((ok) => {
    const t = setTimeout(() => ok(null), 4000)
    navigator.geolocation.getCurrentPosition(
      (p) => (clearTimeout(t), ok({ lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy })),
      () => (clearTimeout(t), ok(null)),
      { timeout: 4000, maximumAge: 120_000 },
    )
  })
}

export function MiFichajeHost() {
  const [abierto, setAbierto] = useState(false)
  useEffect(() => {
    const abrir = () => setAbierto(true)
    window.addEventListener('gw:mi-fichaje', abrir)
    return () => window.removeEventListener('gw:mi-fichaje', abrir)
  }, [])
  return abierto ? <MiFichajeDialog onCerrar={() => setAbierto(false)} /> : null
}

function MiFichajeDialog({ onCerrar }: { onCerrar: () => void }) {
  const [panel, setPanel] = useState<Panel | null>(null)
  const [personas, setPersonas] = useState<{ grupo: string; personas: { codigo: string; nombre: string }[] }[]>([])
  const [quien, setQuien] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [hecho, setHecho] = useState<{ titulo: string; frase: string; tipo: TipoFichaje } | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const [ahora, setAhora] = useState(() => new Date())

  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 1000)
    return () => clearInterval(t)
  }, [])

  useEffect(() => {
    void supabase.rpc('fn_fichaje_personas').then(({ data }) => setPersonas((data ?? []) as typeof personas))
    // El empleado de la sesión, si ficha, sale ya elegido.
    void supabase.rpc('fn_fichaje_mio').then(({ data }) => {
      const r = data as { ok: boolean; empleado?: string } | null
      if (r?.ok && r.empleado) setQuien((q) => q || r.empleado!)
    })
  }, [])

  const entrarOtra = async () => {
    setError(null)
    setOcupado(true)
    const { data, error: e } = await supabase.rpc('fn_fichaje_entrar', { p_empleado: quien, p_pin: pin })
    setOcupado(false)
    const r = data as Panel | null
    if (e || !r?.ok) {
      setPin('')
      return setError(e?.message ?? r?.error ?? 'PIN incorrecto.')
    }
    setPanel(r)
  }

  const fichar = async (tipo: TipoFichaje) => {
    setError(null)
    setOcupado(true)
    const pos = await ubicacion()
    const comun = { p_tipo: tipo, p_lat: pos?.lat ?? null, p_lng: pos?.lng ?? null, p_precision: pos?.precision ?? null, p_dispositivo: navigator.userAgent.slice(0, 150) }
    const { data, error: e } = await supabase.rpc('fn_fichaje_fichar', { ...comun, p_empleado: quien, p_pin: pin })
    setOcupado(false)
    const r = data as Panel | null
    if (e || !r?.ok) return setError(e?.message ?? r?.error ?? 'No se ha podido fichar.')
    setPanel(r)
    setHecho({
      tipo,
      titulo: `${mensajeTras(tipo, r.nombre, minutos(r.hoy, false))} (${TIPOS_FICHAJE[tipo].toLowerCase()} a las ${horaCan(r.hoy[r.hoy.length - 1]?.en)})`,
      frase: tipo === 'entrada' ? delDia(FRASES_ENTRADA) : tipo === 'salida' ? delDia(FRASES_SALIDA) : '',
    })
    // Se cierra sola: el ordenador queda libre para la siguiente persona.
    setTimeout(onCerrar, 5000)
  }

  // Horas de hoy y de la semana (lunes a domingo).
  const minHoy = panel ? minutos(panel.hoy, panel.estado === 'trabajando') : 0
  const porDia = DIAS.map(() => 0)
  if (panel?.semana) {
    const dias = new Map<string, { tipo: TipoFichaje; en: string }[]>()
    for (const e of panel.semana) dias.set(e.dia, [...(dias.get(e.dia) ?? []), e])
    for (const [dia, evs] of dias) {
      const i = (new Date(dia + 'T12:00:00Z').getUTCDay() + 6) % 7
      porDia[i] = minutos(evs, panel.estado === 'trabajando' && evs === dias.get([...dias.keys()].pop()!))
    }
  }
  const minSemana = porDia.reduce((a, b) => a + b, 0)
  const maxDia = Math.max(480, ...porDia)
  const hoyIdx = (ahora.getDay() + 6) % 7
  const est = panel ? ESTADO[panel.estado] : null

  return (
    <div className="fixed inset-0 z-[320] flex items-start justify-center bg-black/30 pt-10" onKeyDown={(e) => e.key === 'Escape' && onCerrar()}>
      <GwWindow title="Mi fichaje" onClose={onCerrar} className="w-[520px] max-w-[96vw]">
        <div className="flex flex-col text-[13px]">
          {/* Cabecera: saludo y reloj */}
          <div className="px-5 py-4 text-white" style={{ background: 'linear-gradient(135deg,#16306e 0%,#1d3a8a 45%,#2f6fb5 100%)' }}>
            <div className="text-[18px] font-semibold">
              {saludo(ahora)}
              {panel ? `, ${panel.nombre}` : ''} 👋
            </div>
            <div className="mt-1 flex items-end justify-between gap-3">
              <div className="font-mono text-[46px] font-bold leading-none tracking-tight">
                {ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit', timeZone: 'Atlantic/Canary' })}
                <span className="text-[24px] opacity-70">:{ahora.toLocaleTimeString('es-ES', { second: '2-digit', timeZone: 'Atlantic/Canary' }).padStart(2, '0')}</span>
              </div>
              <div className="pb-1 text-right capitalize opacity-90">
                {ahora.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Atlantic/Canary' })}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-3 bg-[#f6f8fb] p-4">
            {!panel && (
              <div className="flex flex-col gap-2 rounded-lg border border-[#d7dde8] bg-white p-3 shadow-sm">
                <div className="font-semibold text-[#1d3a8a]">¿Quién ficha? Elige tu nombre y pon tu código</div>
                <select className="gw-input h-[34px] text-[15px]" value={quien} onChange={(e) => (setQuien(e.target.value), setPin(''))}>
                  <option value="">Elige tu nombre…</option>
                  {personas.map((g) => (
                    <optgroup key={g.grupo} label={g.grupo}>
                      {g.personas.map((p) => (
                        <option key={p.codigo} value={p.codigo}>
                          {p.nombre}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div className="flex gap-2">
                  <input
                    className="gw-input h-[34px] flex-1 text-center text-[20px] tracking-[0.5em]"
                    type="password"
                    inputMode="numeric"
                    autoComplete="off"
                    placeholder="PIN"
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && quien && pin.length === 4 && void entrarOtra()}
                  />
                  <button
                    type="button"
                    disabled={!quien || pin.length !== 4 || ocupado}
                    onClick={() => void entrarOtra()}
                    className="rounded-md px-5 font-bold text-white disabled:opacity-40"
                    style={{ background: 'linear-gradient(135deg,#2f6fb5,#1d3a8a)' }}
                  >
                    Entrar
                  </button>
                </div>
              </div>
            )}

            {panel && est && (
              <>
                <div className="flex items-center justify-between">
                  <span className="rounded-full px-3 py-1 text-[14px] font-bold" style={{ color: est.color, background: est.fondo }}>
                    ● {est.texto}
                  </span>
                  <span className="text-[13px] text-[#4a5568]">
                    Hoy llevas <b className="text-[15px] text-[#1d3a8a]">{duracion(minHoy)}</b>
                  </span>
                </div>

                <div className="flex flex-col gap-2">
                  {panel.siguientes.map((t) => (
                    <button
                      key={t}
                      type="button"
                      disabled={ocupado}
                      onClick={() => void fichar(t)}
                      className="flex h-[58px] items-center justify-center gap-3 rounded-xl text-[20px] font-bold text-white shadow-md transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
                      style={{ background: BOTON[t].fondo }}
                    >
                      <span className="text-[22px]">{BOTON[t].icono}</span>
                      {panel.estado === 'salida' && t === 'entrada' ? 'Volver a entrar' : BOTON[t].texto}
                    </button>
                  ))}
                  {panel.reparto_token && (
                    <a
                      className="flex h-[46px] items-center justify-center gap-2 rounded-xl border-2 border-[#127a12] bg-white text-[17px] font-bold text-[#127a12] no-underline"
                      href={`${import.meta.env.BASE_URL}repartidor?t=${panel.reparto_token}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      🚚 Mi reparto
                    </a>
                  )}
                </div>

                {hecho && (
                  <div className="rounded-xl border-2 border-[#1e9e4a] px-4 py-3 text-center shadow-sm" style={{ background: 'linear-gradient(135deg,#ecf9ee,#d7f2dc)' }}>
                    <div className="text-[30px] leading-none">{hecho.tipo === 'salida' ? '🙌' : hecho.tipo === 'entrada' ? '☀️' : hecho.tipo === 'pausa_inicio' ? '☕' : '💪'}</div>
                    <div className="mt-1 text-[16px] font-bold text-[#127a12]">{hecho.titulo}</div>
                    {hecho.frase && <div className="mt-1 font-serif text-[17px] italic leading-snug text-[#1a7f3c]">{hecho.frase}</div>}
                  </div>
                )}

                {!!panel.hoy.length && (
                  <div className="rounded-lg border border-[#d7dde8] bg-white p-3">
                    <div className="mb-2 font-semibold text-[#1d3a8a]">Hoy</div>
                    <div className="flex flex-wrap gap-2">
                      {panel.hoy.map((e, i) => (
                        <span key={i} className="rounded-full border border-[#d7dde8] bg-[#f6f8fb] px-2.5 py-1 text-[12px]">
                          {TIPOS_FICHAJE[e.tipo]} <b className="font-mono">{horaCan(e.en)}</b>
                          {e.origen === 'correccion' ? ' ✎' : ''}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="rounded-lg border border-[#d7dde8] bg-white p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="font-semibold text-[#1d3a8a]">Tu semana</span>
                    <span className="text-[#4a5568]">
                      <b className="text-[15px] text-[#1d3a8a]">{duracion(minSemana)}</b> trabajadas
                    </span>
                  </div>
                  <div className="flex h-[70px] items-end gap-2">
                    {porDia.map((m, i) => (
                      <div key={i} className="flex flex-1 flex-col items-center gap-1">
                        <div className="flex w-full flex-1 items-end">
                          <div
                            className="w-full rounded-t-md"
                            title={m ? duracion(m) : 'Sin fichajes'}
                            style={{
                              height: `${Math.max(m ? 6 : 2, (m / maxDia) * 100)}%`,
                              background: i === hoyIdx ? 'linear-gradient(180deg,#4f9be6,#1d3a8a)' : m ? '#9dbbe3' : '#e6eaf0',
                            }}
                          />
                        </div>
                        <span className={`text-[11px] ${i === hoyIdx ? 'font-bold text-[#1d3a8a]' : 'text-[#8a94a6]'}`}>{DIAS[i]}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}

            {error && <div className="rounded-lg bg-[#fde7e4] px-3 py-2 font-bold text-[#b3261e]">{error}</div>}

            {!hecho && (
              <div className="text-center font-serif text-[16px] italic leading-snug text-[#1a7f3c]">
                {delDia(!panel || panel.estado === 'sin_fichar' || panel.estado === 'salida' ? FRASES_ENTRADA : FRASES_SALIDA)}
              </div>
            )}

            <div className="flex items-center justify-between">
              {panel && !hecho ? (
                <button type="button" className="gw-btn" onClick={() => (setPanel(null), setPin(''), setQuien(''), setError(null))}>
                  No soy yo
                </button>
              ) : (
                <span />
              )}
              <button type="button" className="gw-btn" onClick={onCerrar}>
                Cerrar
              </button>
            </div>
            <div className="text-center text-[11px] text-[#8a94a6]">La hora la pone el servidor. Si te equivocas, avisa a gerencia: lo corrige dejando constancia.</div>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}
