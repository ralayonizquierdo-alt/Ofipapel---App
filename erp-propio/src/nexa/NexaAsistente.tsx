// NEXA integrada en el ERP: avatar arriba a la derecha, en la cabecera (siempre disponible) y panel de
// conversación a la derecha del área de trabajo. No depende de ninguna pantalla: se monta una
// vez en el Layout. Atajo: Ctrl+Espacio.

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as KeyboardEventReact, type ReactNode } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { usePermisos } from '../lib/PermisosContext'
import { supabase } from '../lib/supabase'
import { AlertTriangle, ArrowUpRight, FileSpreadsheet, Maximize2, Mic, Minimize2, Minus, Printer, RotateCcw, Save, SendHorizontal, Square, Table2, Volume2, VolumeX, X } from 'lucide-react'
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
import { esSumable, etiquetaColumna, excelResultado, imprimirResultado, resumenResultado, rutaGenerador, totalesResultado, valorTexto, type ResultadoListado } from '../lib/listados/resultado'
import { formatGw } from '../components/gw'

export const ATAJO_NEXA = 'Ctrl+Espacio'

/** Alto de la cabecera del Layout: franja del título (24 px) + barra de menús (20 px). */
const ALTO_CABECERA = 44

const SUGERENCIAS = [
  '¿Cómo van los pedidos de hoy?',
  'Listado de clientes con deuda',
  'Ventas de este mes por vendedor',
  '¿Qué artículos están bajo mínimo?',
  'Prepara un resumen del día',
  '¿Qué pedidos están pendientes de servir?',
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
    // Arriba a la derecha, en la franja blanca del título y la barra de menús (44 px de alto),
    // que nunca usan las ventanas: así no tapa ningún botón (antes, abajo a la derecha, se
    // ponía encima de «Salir» y de las botoneras de los gestores). No baja de esa franja.
    // z-40: por debajo de los diálogos (z-50), que la tapan con su fondo como al resto.
    // El aviso va a la izquierda, en posición absoluta, para no mover el avatar (si lo
    // empujara, el ratón dejaría de estar encima y parpadearía).
    <div className="pointer-events-none fixed right-[4px] top-0 z-40" data-nexa="flotante" style={{ height: ALTO_CABECERA }}>
      {(hover || aviso) && (
        <div className="absolute right-[calc(100%+4px)] top-1/2 -translate-y-1/2 whitespace-nowrap rounded bg-slate-900/85 px-2.5 py-1 text-center text-[11px] leading-tight text-white shadow">
          <div className="font-bold tracking-wide">NEXA · Asistente inteligente</div>
          <div className="text-slate-300">{aviso ?? ATAJO_NEXA}</div>
        </div>
      )}
      <div className="relative overflow-hidden" style={{ width: ALTO_CABECERA + 6, height: ALTO_CABECERA }}>
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <NexaAvatar tamano={ALTO_CABECERA + 6} escala={0.95} fpsMax={30} contraste="claro" formarAlIniciar />
        </div>
        {sinLeer && <span className="absolute right-[4px] top-[3px] h-2.5 w-2.5 rounded-full border border-white bg-[#1f6fe0] shadow" />}
        <button
          type="button"
          aria-label="Abrir NEXA, asistente inteligente"
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => setHover(false)}
          onFocus={() => setHover(true)}
          onBlur={() => setHover(false)}
          onClick={abrirPanel}
          className="pointer-events-auto absolute inset-0 cursor-pointer rounded-full bg-transparent outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
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
                onEnviar={(t) => enviar(t)}
                pensando={conv.pensando}
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
        <div className="mt-0.5 text-[12px] text-slate-500">
          Pregúntame por ventas, pedidos, stock, clientes o proveedores, o pídeme cualquier listado: te lo saco, lo pasas a Excel o PDF y lo guardo en el Generador. Sé en qué pantalla estás.
        </div>
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

function Mensaje({ m, onAbrir, onEnviar, pensando }: { m: MensajeNexa; onAbrir: (ruta: string) => void; onEnviar: (texto: string) => void; pensando: boolean }) {
  // El servidor ya no propone pantallas sin permiso; aquí se vuelve a filtrar por si acaso
  // (p. ej. conversaciones guardadas de antes o permisos cambiados después).
  const { puedeRuta } = usePermisos()
  const rutas = (m.rutas ?? []).filter((r) => puedeRuta(r.ruta))
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
      {m.listado && <TablaListado l={m.listado} onAbrir={onAbrir} onEnviar={onEnviar} pensando={pensando} />}
      {rutas.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {rutas.map((r) => (
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

// ---------------------------------------------------------------- Listado (centro de listados)

/** Quién saca el listado (identificación de lo impreso / Excel): se lee una vez por sesión. */
let sacadoPorCache: { uid: string; texto: string } | null = null
async function sacadoPor() {
  const { data } = await supabase.auth.getSession()
  const u = data.session?.user
  if (!u) return ''
  if (sacadoPorCache?.uid === u.id) return sacadoPorCache.texto
  const { data: emp } = await supabase.from('empleado').select('codigo, nombre').eq('auth_user_id', u.id).maybeSingle()
  const texto = emp ? `${emp.codigo as string} · ${emp.nombre as string}` : (u.email ?? '')
  sacadoPorCache = { uid: u.id, texto }
  return texto
}

function BotonListado({ titulo, onClick, children, deshabilitado }: { titulo: string; onClick: () => void; children: ReactNode; deshabilitado?: boolean }) {
  return (
    <button
      type="button"
      title={titulo}
      onClick={onClick}
      disabled={deshabilitado}
      className="flex items-center gap-1 rounded border border-[#1f4e9c]/40 bg-white/80 px-2 py-0.5 text-[12px] font-semibold text-[#1f4e9c] hover:bg-[#1f4e9c] hover:text-white disabled:opacity-40"
    >
      {children}
    </button>
  )
}

function TablaListado({ l, onAbrir, onEnviar, pensando }: { l: ResultadoListado; onAbrir: (ruta: string) => void; onEnviar: (texto: string) => void; pensando: boolean }) {
  const { puedeRuta } = usePermisos()
  const [aviso, setAviso] = useState<string | null>(null)
  const totales = totalesResultado(l)
  const hayTotales = l.filas.length > 0 && Object.keys(totales).length > 0
  const ruta = rutaGenerador(l)
  const sinFilasGuardadas = !l.filas.length && l.total > 0
  return (
    <div className="mt-2 rounded border border-slate-300/80 bg-white/90" data-nexa="listado">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-200 px-2 py-1">
        <Table2 size={14} className="text-[#1f4e9c]" />
        <b className="text-[12.5px] text-slate-800">{l.titulo}</b>
        <span className="text-[11.5px] text-slate-500">
          {l.total > l.filas.length && l.filas.length
            ? `${l.filas.length} de ${l.total_mas ? 'más de 50.000' : l.total} filas`
            : `${l.total} ${l.total === 1 ? 'fila' : 'filas'}`}
        </span>
        <span className="flex-1" />
        <BotonListado titulo="Descargar en Excel (.xlsx)" deshabilitado={!l.filas.length} onClick={() => void sacadoPor().then((q) => excelResultado(l, q))}>
          <FileSpreadsheet size={13} /> Excel
        </BotonListado>
        <BotonListado
          titulo="Imprimir o guardar como PDF"
          deshabilitado={!l.filas.length}
          onClick={() => setAviso(imprimirResultado(l, sacadoPorCache?.texto ?? '') ? null : 'El navegador ha bloqueado la ventana de impresión: permite las ventanas emergentes.')}
        >
          <Printer size={13} /> PDF / Imprimir
        </BotonListado>
        {puedeRuta('/listados') && (
          <BotonListado titulo={l.id ? `Abrir ${l.codigo ?? ''} en el Generador de listados` : 'Abrir el Generador de listados con esta fuente y sus filtros «igual a»'} onClick={() => onAbrir(ruta)}>
            Abrir en el Generador <ArrowUpRight size={12} />
          </BotonListado>
        )}
        {!l.codigo && puedeRuta('/listados') && (
          <BotonListado titulo="Guardarlo en el Generador de listados (con su código)" deshabilitado={pensando} onClick={() => onEnviar('Sí, guárdalo en el Generador.')}>
            <Save size={12} /> Guardar
          </BotonListado>
        )}
      </div>
      <div className="truncate px-2 pt-0.5 text-[11px] text-slate-500" title={resumenResultado(l)}>
        {resumenResultado(l)}
      </div>
      {aviso && <div className="mx-2 mt-1 rounded bg-amber-100 px-2 py-0.5 text-[11px] text-amber-900">{aviso}</div>}
      {sinFilasGuardadas ? (
        <div className="px-2 py-2 text-[12px] text-slate-500">Las filas de este listado ya no están en memoria: pídeselo otra vez a NEXA.</div>
      ) : l.filas.length === 0 ? (
        <div className="px-2 py-2 text-[12px] text-slate-500">Sin resultados con esos filtros.</div>
      ) : (
        <div className="gw-seleccionable mt-1 max-h-[52vh] overflow-auto">
          <table className="w-full border-collapse text-[12px]">
            <thead className="sticky top-0 z-[1] bg-[#e7edf6]">
              <tr>
                {l.columnas.map((c) => (
                  <th key={c.clave} className={`whitespace-nowrap border-b border-slate-300 px-2 py-1 font-semibold text-slate-700 ${c.tipo === 'num' ? 'text-right' : 'text-left'}`}>
                    {etiquetaColumna(l.fuente, c)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {l.filas.map((f, i) => (
                <tr key={i} className="odd:bg-white even:bg-slate-50 hover:bg-[#e5f1fb]">
                  {l.columnas.map((c) => (
                    <td key={c.clave} className={`border-b border-slate-100 px-2 py-[3px] ${c.tipo === 'num' ? 'whitespace-nowrap text-right tabular-nums' : ''}`}>
                      {valorTexto(l.fuente, c, f[c.clave])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
            {hayTotales && (
              <tfoot className="sticky bottom-0 bg-[#f0f0f0] font-bold">
                <tr>
                  {l.columnas.map((c, i) => (
                    <td key={c.clave} className={`px-2 py-1 ${c.tipo === 'num' ? 'whitespace-nowrap text-right tabular-nums' : ''}`}>
                      {esSumable(c) ? formatGw(totales[c.clave], c.clave === 'registros' ? 0 : 2) : i === 0 ? 'TOTAL' : ''}
                    </td>
                  ))}
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
      {l.total > l.filas.length && l.filas.length > 0 && (
        <div className="border-t border-slate-200 px-2 py-0.5 text-[11px] text-slate-500">
          Se enseñan las primeras {l.filas.length}: los totales son de estas filas. Afina los filtros o ábrelo en el Generador para verlo entero.
        </div>
      )}
    </div>
  )
}
