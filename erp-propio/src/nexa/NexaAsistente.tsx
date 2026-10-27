// NEXA integrada en el ERP: avatar flotante abajo a la derecha (siempre disponible) y panel de
// conversación a la derecha del área de trabajo. No depende de ninguna pantalla: se monta una
// vez en el Layout. Atajo: Ctrl+Espacio.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as KeyboardEventReact, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowUpRight, Maximize2, Mic, Minimize2, Minus, RotateCcw, SendHorizontal, Square, Volume2, VolumeX, X } from 'lucide-react'
import { NexaAvatar } from './NexaAvatar'
import { getNexaState, onNexaState, type EstadoNexa } from './estado'
import { contextoActual } from './contexto'
import {
  abrirPanel,
  alternarPanel,
  cerrarPanel,
  enviarMensaje,
  getConversacion,
  nuevaConversacion,
  setAmpliado,
  setVoz,
  useConversacion,
  vozDisponible,
  type MensajeNexa,
} from './conversacion'
import { dictadoDisponible, empezarDictado, type Dictado } from './dictado'
import { Markdown } from './Markdown'

export const ATAJO_NEXA = 'Ctrl+Espacio'

const SUGERENCIAS = [
  '¿Cómo van los pedidos de hoy?',
  '¿Qué artículos están bajo mínimo?',
  'Prepara un resumen del día',
  '¿Qué pedidos están pendientes de servir?',
  '¿Qué pedidos a proveedor están pendientes de recibir?',
]

function useEstadoNexa() {
  const [estado, setEstado] = useState<EstadoNexa>(getNexaState())
  useEffect(() => onNexaState(setEstado), [])
  return estado
}

/** Se monta una vez dentro del Layout. */
export function NexaAsistente() {
  const conv = useConversacion()

  // Atajo global: Ctrl+Espacio abre/cierra NEXA desde cualquier pantalla.
  useEffect(() => {
    const onKey = (ev: KeyboardEvent) => {
      if (ev.ctrlKey && !ev.altKey && !ev.metaKey && (ev.code === 'Space' || ev.key === ' ')) {
        ev.preventDefault()
        alternarPanel()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      {!conv.abierto && <NexaFlotante sinLeer={conv.sinLeer} pensando={conv.pensando} />}
      {conv.abierto && <NexaPanel />}
    </>
  )
}

// ---------------------------------------------------------------- Avatar flotante

function NexaFlotante({ sinLeer, pensando }: { sinLeer: boolean; pensando: boolean }) {
  const [hover, setHover] = useState(false)
  const aviso = pensando ? 'Pensando…' : sinLeer ? 'Tienes una respuesta nueva' : null
  return (
    // Abajo a la derecha, sobre la esquina de la barra de estado (que deja ese hueco libre):
    // así el centro pulsable queda por debajo de las botoneras de las ventanas.
    // El aviso va en posición absoluta para no mover el avatar (si lo empujara, el ratón
    // dejaría de estar encima y parpadearía).
    <div className="pointer-events-none fixed bottom-[-6px] right-[2px] z-50" data-nexa="flotante">
      {(hover || aviso) && (
        <div className="absolute bottom-[calc(100%-10px)] right-0 whitespace-nowrap rounded bg-slate-900/85 px-2.5 py-1 text-center text-[11px] leading-tight text-white shadow">
          <div className="font-bold tracking-wide">NEXA · Asistente inteligente</div>
          <div className="text-slate-300">{aviso ?? ATAJO_NEXA}</div>
        </div>
      )}
      <div className="relative" style={{ width: 90, height: 90 }}>
        <NexaAvatar tamano={90} escala={0.92} fpsMax={30} formarAlIniciar />
        {sinLeer && <span className="absolute right-[18px] top-[14px] h-2.5 w-2.5 rounded-full border border-white bg-[#1f6fe0] shadow" />}
        <button
          type="button"
          aria-label="Abrir NEXA, asistente inteligente"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onFocus={() => setHover(true)}
          onBlur={() => setHover(false)}
          onClick={abrirPanel}
          className="pointer-events-auto absolute left-1/2 top-[63%] h-[36px] w-[42px] -translate-x-1/2 -translate-y-1/2 cursor-pointer rounded-full bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------- Panel de conversación

const TEXTO_ESTADO: Record<EstadoNexa, string> = {
  idle: 'Asistente inteligente',
  listening: 'Escuchando…',
  thinking: 'NEXA está pensando…',
  speaking: 'Respondiendo',
  alert: 'Algo no ha ido bien',
}

function NexaPanel() {
  const conv = useConversacion()
  const estado = useEstadoNexa()
  const navigate = useNavigate()
  const { pathname, search } = useLocation()
  const [texto, setTexto] = useState('')
  const [dictado, setDictado] = useState<Dictado | null>(null)
  const [avisoMic, setAvisoMic] = useState<string | null>(null)
  const listaRef = useRef<HTMLDivElement>(null)
  const entradaRef = useRef<HTMLTextAreaElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const [alto, setAlto] = useState(640)

  // Tamaño de la NEXA grande según el alto disponible.
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return
    const ro = new ResizeObserver(() => setAlto(el.clientHeight))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const ladoAvatar = Math.round(Math.max(130, Math.min(230, alto * 0.3)))

  useEffect(() => {
    entradaRef.current?.focus()
  }, [])

  // Último mensaje siempre a la vista.
  useEffect(() => {
    const el = listaRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [conv.mensajes.length, conv.pensando])

  // Ajusta el alto de la caja de texto (1 a 6 líneas).
  useLayoutEffect(() => {
    const el = entradaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 120) + 'px'
  }, [texto])

  useEffect(() => () => dictado?.parar(), [dictado])

  function enviar(t = texto) {
    if (!t.trim() || conv.pensando) return
    dictado?.parar()
    setTexto('')
    void enviarMensaje(t, contextoActual(pathname, search))
  }

  function onTecla(e: KeyboardEventReact<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      enviar()
    }
  }

  function alternarDictado() {
    setAvisoMic(null)
    if (dictado) {
      dictado.parar()
      return
    }
    if (!dictadoDisponible()) {
      setAvisoMic('Este navegador no admite el dictado por voz. Usa Chrome o Edge.')
      return
    }
    const base = texto ? texto.replace(/\s+$/, '') + ' ' : ''
    const d = empezarDictado(
      (t) => setTexto(base + t),
      (error) => {
        setDictado(null)
        if (error) setAvisoMic(error)
        entradaRef.current?.focus()
      },
    )
    if (!d) setAvisoMic('No se pudo iniciar el dictado.')
    setDictado(d)
  }

  function cerrar() {
    dictado?.parar()
    cerrarPanel({ callar: true })
  }

  // «Vacía» = sin preguntas del usuario (el saludo de NEXA no cuenta): siguen saliendo las sugerencias.
  const vacia = !conv.mensajes.some((m) => m.rol === 'usuario')
  const ancho = conv.ampliado ? 'min(70%, 1100px)' : '440px'

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="NEXA, asistente inteligente"
      data-nexa="panel"
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          cerrarPanel()
        }
      }}
      className="nexa-panel absolute bottom-1 right-1 top-[27px] z-40 flex flex-col overflow-hidden rounded-md border border-white/60 bg-[rgba(236,241,248,0.80)] shadow-[0_8px_28px_rgba(15,30,60,0.35)] backdrop-blur-xl"
      style={{ width: ancho, maxWidth: 'calc(100% - 8px)' }}
    >
      {/* Barra superior */}
      <div className="relative z-10 flex h-[30px] flex-none items-center gap-1 border-b border-white/50 bg-white/40 pl-2.5 pr-1">
        <span className="text-[12px] font-bold tracking-[0.12em] text-[#1f4e9c]">NEXA</span>
        <span className="truncate text-[11px] text-slate-500">· {TEXTO_ESTADO[estado]}</span>
        <span className="flex-1" />
        {vozDisponible() && (
          <BotonBarra
            titulo={conv.voz ? 'Voz activada: NEXA lee sus respuestas en voz alta (pulsa para desactivar)' : 'Activar la voz de NEXA (lectura en voz alta)'}
            onClick={() => setVoz(!conv.voz)}
            activo={conv.voz}
          >
            {conv.voz ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </BotonBarra>
        )}
        <BotonBarra titulo="Nueva conversación" onClick={nuevaConversacion} deshabilitado={vacia || conv.pensando}>
          <RotateCcw size={13} />
        </BotonBarra>
        <BotonBarra titulo="Minimizar (Esc)" onClick={() => cerrarPanel()}>
          <Minus size={14} />
        </BotonBarra>
        <BotonBarra titulo={conv.ampliado ? 'Reducir' : 'Ampliar (para tablas grandes)'} onClick={() => setAmpliado(!conv.ampliado)}>
          {conv.ampliado ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
        </BotonBarra>
        <BotonBarra titulo={`Cerrar (${ATAJO_NEXA})`} onClick={cerrar} peligro>
          <X size={15} />
        </BotonBarra>
      </div>

      {/* NEXA grande, sin fondo propio: las partículas directamente sobre el panel */}
      <div className="pointer-events-none flex flex-none justify-center" style={{ height: ladoAvatar - 8, marginTop: -2 }}>
        <NexaAvatar tamano={ladoAvatar} contraste="claro" formarAlIniciar />
      </div>

      {/* Conversación */}
      <div ref={listaRef} className="nexa-lista min-h-0 flex-1 overflow-y-auto px-3 pb-2 pt-1" aria-live="polite">
        {vacia && !conv.mensajes.length ? (
          <Bienvenida onElegir={(s) => enviar(s)} deshabilitado={conv.pensando} />
        ) : (
          <div className="flex flex-col gap-2.5">
            {conv.mensajes.map((m) => (
              <Mensaje
                key={m.id}
                m={m}
                onAbrir={(ruta) => {
                  if (getConversacion().ampliado) setAmpliado(false)
                  navigate(ruta)
                }}
              />
            ))}
            {conv.pensando && (
              <div className="flex items-center gap-2 px-1 text-[12px] text-slate-500">
                <span className="nexa-puntos inline-flex gap-[3px]">
                  <i />
                  <i />
                  <i />
                </span>
                NEXA está pensando…
              </div>
            )}
            {/* Tras el saludo, las sugerencias de inicio siguen disponibles */}
            {vacia && <Bienvenida onElegir={(s) => enviar(s)} deshabilitado={conv.pensando} conSaludo={false} />}
          </div>
        )}
      </div>

      {/* Entrada */}
      <div className="flex-none border-t border-white/60 bg-white/45 px-2.5 pb-2 pt-2">
        {avisoMic && <div className="mb-1.5 rounded bg-amber-100/90 px-2 py-1 text-[11px] text-amber-900">{avisoMic}</div>}
        <div className={`flex items-end gap-1.5 rounded-md border bg-white/90 px-2 py-1.5 shadow-inner ${dictado ? 'border-[#1f6fe0]' : 'border-slate-300'}`}>
          <textarea
            ref={entradaRef}
            rows={1}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={onTecla}
            placeholder={dictado ? 'Habla ahora…' : 'Pregunta a NEXA…'}
            aria-label="Mensaje para NEXA"
            className="max-h-[120px] min-h-[22px] flex-1 resize-none bg-transparent text-[13px] leading-[19px] text-slate-800 outline-none placeholder:text-slate-400"
          />
          <button
            type="button"
            onClick={alternarDictado}
            title={
              !dictadoDisponible()
                ? 'Este navegador no admite el dictado por voz (usa Chrome o Edge)'
                : dictado
                  ? 'Dejar de escuchar'
                  : 'Dictar por voz'
            }
            aria-pressed={Boolean(dictado)}
            className={`flex h-[28px] w-[28px] flex-none items-center justify-center rounded-full ${
              dictado ? 'animate-pulse bg-[#1f6fe0] text-white' : dictadoDisponible() ? 'text-slate-600 hover:bg-slate-200' : 'text-slate-300'
            }`}
          >
            {dictado ? <Square size={11} fill="currentColor" /> : <Mic size={16} />}
          </button>
          <button
            type="button"
            onClick={() => enviar()}
            disabled={!texto.trim() || conv.pensando}
            title="Enviar (Intro) · Mayús+Intro: nueva línea"
            className="flex h-[28px] w-[28px] flex-none items-center justify-center rounded-full bg-[#1f4e9c] text-white disabled:bg-slate-300"
          >
            <SendHorizontal size={15} />
          </button>
        </div>
        <div className="mt-1 flex justify-between px-0.5 text-[10px] text-slate-500">
          <span>Solo lectura · consulta los datos con tus permisos</span>
          <span>Intro envía · Mayús+Intro línea nueva</span>
        </div>
      </div>
    </div>
  )
}

function BotonBarra({
  titulo,
  onClick,
  children,
  activo,
  peligro,
  deshabilitado,
}: {
  titulo: string
  onClick: () => void
  children: ReactNode
  activo?: boolean
  peligro?: boolean
  deshabilitado?: boolean
}) {
  return (
    <button
      type="button"
      title={titulo}
      aria-label={titulo}
      onClick={onClick}
      disabled={deshabilitado}
      className={`flex h-[24px] w-[26px] items-center justify-center rounded text-slate-600 disabled:opacity-35 ${
        peligro ? 'hover:bg-red-500 hover:text-white' : 'hover:bg-white/80'
      } ${activo ? 'bg-[#1f4e9c]/15 text-[#1f4e9c]' : ''}`}
    >
      {children}
    </button>
  )
}

function Bienvenida({ onElegir, deshabilitado, conSaludo = true }: { onElegir: (s: string) => void; deshabilitado: boolean; conSaludo?: boolean }) {
  return (
    <div className="flex flex-col items-center gap-3 pt-1 text-center">
      <div>
        {conSaludo && <div className="text-[15px] font-semibold text-slate-800">Hola, soy NEXA.</div>}
        <div className="mt-0.5 text-[12px] text-slate-500">Pregúntame por ventas, pedidos, stock, clientes o proveedores. Sé en qué pantalla estás.</div>
      </div>
      <div className="flex w-full flex-col gap-1.5">
        {SUGERENCIAS.map((s) => (
          <button
            key={s}
            type="button"
            disabled={deshabilitado}
            onClick={() => onElegir(s)}
            className="rounded-md border border-white/70 bg-white/65 px-3 py-1.5 text-left text-[12.5px] text-slate-700 shadow-sm hover:border-[#1f4e9c]/40 hover:bg-white"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  )
}

function Mensaje({ m, onAbrir }: { m: MensajeNexa; onAbrir: (ruta: string) => void }) {
  if (m.rol === 'usuario') {
    return (
      <div className="gw-seleccionable ml-10 self-end whitespace-pre-wrap rounded-lg rounded-br-sm bg-[#1f4e9c] px-3 py-1.5 text-[13px] leading-[18px] text-white shadow-sm">
        {m.texto}
      </div>
    )
  }
  if (m.rol === 'error') {
    return (
      <div className="mr-6 flex gap-2 rounded-lg border border-red-200 bg-red-50/90 px-3 py-2 text-[12.5px] leading-[18px] text-red-800" role="alert">
        <AlertTriangle size={15} className="mt-[1px] flex-none" />
        <span className="gw-seleccionable">{m.texto}</span>
      </div>
    )
  }
  return (
    <div className="min-w-0 rounded-lg rounded-bl-sm border border-white/70 bg-white/75 px-3 py-2 text-[13px] leading-[19px] text-slate-800 shadow-sm">
      <div className="gw-seleccionable">
        <Markdown texto={m.texto} />
      </div>
      {m.rutas && m.rutas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {m.rutas.map((r) => (
            <button
              key={r.ruta}
              type="button"
              onClick={() => onAbrir(r.ruta)}
              title={r.ruta}
              className="flex items-center gap-1 rounded border border-[#1f4e9c]/40 bg-[#1f4e9c]/8 px-2 py-0.5 text-[12px] font-semibold text-[#1f4e9c] hover:bg-[#1f4e9c] hover:text-white"
            >
              Abrir · {r.etiqueta}
              <ArrowUpRight size={12} />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
