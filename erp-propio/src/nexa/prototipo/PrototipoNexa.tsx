// Prototipo visual AISLADO de NEXA (/nexa.html). No forma parte del ERP todavía: sirve para
// evaluar las partículas, los estados y la transparencia sobre distintos fondos.

import { useCallback, useEffect, useRef, useState } from 'react'
import { NexaAvatar } from '../NexaAvatar'
import { setNexaState, type EstadoNexa } from '../estado'
import { escucharMicrofono, type FuenteAudio } from '../audio'
import type { NexaMotor } from '../visual/NexaMotor'
import { ESCENARIOS, FondoEscenario, type Escenario } from './Escenarios'

const ESTADOS: { id: EstadoNexa; nombre: string }[] = [
  { id: 'idle', nombre: 'Reposo' },
  { id: 'listening', nombre: 'Escuchando' },
  { id: 'thinking', nombre: 'Pensando' },
  { id: 'speaking', nombre: 'Hablando' },
  { id: 'alert', nombre: 'Alerta' },
]

const PARTICULAS = [
  { v: 0, t: 'Automático' },
  { v: 900, t: '900' },
  { v: 2500, t: '2.500' },
  { v: 5000, t: '5.000' },
  { v: 8000, t: '8.000' },
  { v: 12000, t: '12.000' },
]

function useTamanoEscenario() {
  const ref = useRef<HTMLDivElement>(null)
  const [lado, setLado] = useState(560)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect()
      setLado(Math.round(Math.min(r.height * 0.96, r.width * 0.7, 760)))
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return { ref, lado }
}

export function PrototipoNexa() {
  const grande = useRef<NexaMotor | null>(null)
  const pequena = useRef<NexaMotor | null>(null)
  const [estado, setEstado] = useState<EstadoNexa>('idle')
  const [escenario, setEscenario] = useState<Escenario>('tarjetas')
  const [contraste, setContraste] = useState<'auto' | 'claro' | 'oscuro'>('auto')
  const [glow, setGlow] = useState(0.35)
  const [intensidad, setIntensidad] = useState(1)
  const [particulas, setParticulas] = useState(0)
  const [fps, setFps] = useState({ fps: 0, n: 0 })
  const [mic, setMic] = useState<FuenteAudio | null>(null)
  const [errorMic, setErrorMic] = useState<string | null>(null)
  const [hover, setHover] = useState(false)
  const [clicsAvatar, setClicsAvatar] = useState(0)
  const { ref: escenarioRef, lado } = useTamanoEscenario()

  const cambiar = (e: EstadoNexa) => {
    setEstado(e)
    setNexaState(e)
  }
  const formar = () => {
    grande.current?.formar()
    pequena.current?.formar()
  }
  const disolver = () => {
    grande.current?.disolver()
    pequena.current?.disolver()
  }
  const alternarMic = async () => {
    if (mic) {
      mic.parar()
      setMic(null)
      return
    }
    try {
      setErrorMic(null)
      setMic(await escucharMicrofono())
      cambiar('listening')
    } catch {
      setErrorMic('No se pudo abrir el micrófono (permiso denegado o no disponible).')
    }
  }
  useEffect(() => () => mic?.parar(), [mic])
  const alFps = useCallback((f: number, n: number) => setFps({ fps: f, n }), [])

  return (
    <div className="flex h-screen flex-col bg-[#e9edf2] font-[Tahoma,Segoe_UI,sans-serif] text-[13px] text-slate-800">
      <header className="flex items-center gap-3 border-b border-slate-300 bg-white px-4 py-2">
        <span className="text-[15px] font-bold tracking-wide text-[#1f4e9c]">NEXA</span>
        <span className="text-slate-500">Prototipo visual aislado · no está integrado en el ERP</span>
        <span className="ml-auto font-mono text-[12px] text-slate-500">
          {fps.fps} FPS · {fps.n.toLocaleString('es-ES')} partículas
        </span>
      </header>

      {/* Escenario de prueba DETRÁS de NEXA */}
      <div ref={escenarioRef} className="relative min-h-0 flex-1 overflow-hidden">
        <div className="absolute inset-0">
          <FondoEscenario escenario={escenario} />
        </div>
        {/* NEXA grande: el contenedor no captura el ratón; solo existen las partículas */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <NexaAvatar
            ref={grande}
            tamano={lado}
            formarAlIniciar
            contraste={contraste}
            glow={glow}
            intensidad={intensidad}
            particulas={particulas || undefined}
            onFps={alFps}
          />
        </div>

        {/* NEXA flotante pequeña, como irá en el programa: solo el círculo central es pulsable */}
        <div className="pointer-events-none absolute bottom-3 right-4 flex flex-col items-center">
          {hover && (
            <div className="mb-1 rounded bg-slate-900/85 px-2.5 py-1 text-center text-[11px] leading-tight text-white shadow">
              <div className="font-bold tracking-wide">NEXA</div>
              <div className="text-slate-300">Asistente inteligente</div>
            </div>
          )}
          <div className="relative" style={{ width: 92, height: 92 }}>
            <NexaAvatar ref={pequena} tamano={92} fpsMax={30} formarAlIniciar contraste={contraste} glow={glow} intensidad={intensidad} />
            <button
              aria-label="Abrir NEXA"
              title=""
              onMouseEnter={() => setHover(true)}
              onMouseLeave={() => setHover(false)}
              onClick={() => {
                setClicsAvatar((n) => n + 1)
                cambiar('listening')
              }}
              className="pointer-events-auto absolute left-1/2 top-1/2 h-[64px] w-[52px] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
            />
          </div>
          {clicsAvatar > 0 && <div className="mt-0.5 text-[10px] text-slate-500">avatar pulsado {clicsAvatar}×</div>}
        </div>
      </div>

      {/* Controles temporales de prueba */}
      <footer className="flex flex-col gap-2 border-t border-slate-300 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {ESTADOS.map((e) => (
            <button
              key={e.id}
              onClick={() => cambiar(e.id)}
              className={`rounded border px-3 py-1.5 font-semibold ${estado === e.id ? 'border-[#1f4e9c] bg-[#1f4e9c] text-white' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}
            >
              {e.nombre.toUpperCase()}
            </button>
          ))}
          <span className="mx-1 h-6 w-px bg-slate-300" />
          <button onClick={formar} className="rounded border border-slate-300 bg-slate-50 px-3 py-1.5 font-semibold hover:bg-slate-100">
            FORMAR NEXA
          </button>
          <button onClick={disolver} className="rounded border border-slate-300 bg-slate-50 px-3 py-1.5 font-semibold hover:bg-slate-100">
            DISOLVER NEXA
          </button>
          <span className="mx-1 h-6 w-px bg-slate-300" />
          <button
            onClick={alternarMic}
            className={`rounded border px-3 py-1.5 font-semibold ${mic ? 'border-red-500 bg-red-50 text-red-700' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'}`}
            title="El volumen del micrófono mueve las partículas (escuchando / hablando)"
          >
            {mic ? '● MICRÓFONO ACTIVO' : 'PROBAR CON MICRÓFONO'}
          </button>
          {errorMic && <span className="text-red-600">{errorMic}</span>}
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <label className="flex items-center gap-1.5">
            Escenario detrás
            <select className="rounded border border-slate-300 px-1.5 py-1" value={escenario} onChange={(e) => setEscenario(e.target.value as Escenario)}>
              {ESCENARIOS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            Contraste
            <select className="rounded border border-slate-300 px-1.5 py-1" value={contraste} onChange={(e) => setContraste(e.target.value as typeof contraste)}>
              <option value="auto">Automático (según el fondo)</option>
              <option value="claro">Para fondo claro</option>
              <option value="oscuro">Para fondo oscuro</option>
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            Partículas
            <select className="rounded border border-slate-300 px-1.5 py-1" value={particulas} onChange={(e) => setParticulas(Number(e.target.value))}>
              {PARTICULAS.map((p) => (
                <option key={p.v} value={p.v}>
                  {p.t}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-1.5">
            Resplandor
            <input type="range" min={0} max={1} step={0.05} value={glow} onChange={(e) => setGlow(Number(e.target.value))} />
          </label>
          <label className="flex items-center gap-1.5">
            Intensidad del azul
            <input type="range" min={0.5} max={1.6} step={0.05} value={intensidad} onChange={(e) => setIntensidad(Number(e.target.value))} />
          </label>
          <span className="text-[12px] text-slate-500">Los botones del escenario siguen funcionando a través de NEXA.</span>
        </div>
      </footer>
    </div>
  )
}
