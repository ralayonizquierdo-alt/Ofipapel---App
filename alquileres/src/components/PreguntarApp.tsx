import { useEffect, useMemo, useRef, useState } from 'react'
import { MessageCircleQuestion, X, Send, Loader2 } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { auth } from '../lib/firebase'
import { resumenParaAsistente } from '../lib/resumenParaAsistente'

/**
 * «Preguntar a la aplicación» (lo pidió el propietario el 23/10/2026).
 *
 * Un botón abajo a la derecha, en todas las pantallas, para escribir
 * «¿cuánto llevamos cobrado del 402?» en vez de ir sumando columnas.
 *
 * Lo importante de cómo está hecho:
 * · Las cifras las calcula la app (`lib/resumenParaAsistente.ts`) y se mandan
 *   ya sumadas. El asistente solo redacta sobre ese resumen, así que no puede
 *   inventarse un total: o está ahí, o contesta que no lo sabe.
 * · La clave de Anthropic no está aquí: la llamada va a una función del
 *   servidor, que además exige el token de sesión de Firebase del que
 *   pregunta.
 * · No escribe nada. Es de mirar.
 * · **La pregunta se hace en dos tiempos** (30/10/2026): se manda a una
 *   función en segundo plano y luego se va a recoger la respuesta. Antes era
 *   una sola llamada, y Netlify corta una función normal a los 10 segundos:
 *   una respuesta que tardaba 8,6 s pasaba por los pelos y cualquier otra se
 *   quedaba en «El asistente no ha podido responder», que es lo que se ve
 *   cuando el servidor devuelve una página de error en vez de JSON.
 *
 * Fuera de Netlify (la copia de GitHub Pages) no hay funciones: en vez de dar
 * un error raro, lo dice y manda a la buena.
 */

interface Mensaje { role: 'user' | 'assistant'; content: string }

const RUTA = '/.netlify/functions/alquileres-asistente-background'
const RUTA_ESTADO = '/.netlify/functions/alquileres-asistente-estado'
/** Cuánto se espera a la respuesta antes de rendirse, y cada cuánto se mira. */
const ESPERA_MS = 90_000
const CADA_MS = 1_500

const duerme = (ms: number) => new Promise(r => setTimeout(r, ms))

const EJEMPLOS = [
  '¿Qué estancias terminaron sin cobrar del todo?',
  '¿Cuánto llevamos cobrado este año?',
  '¿Cuánto devengó el 402 en octubre?',
]

export default function PreguntarApp() {
  const { reservations, payments, expenses, apartments } = useData()
  const [abierto, setAbierto] = useState(false)
  const [pregunta, setPregunta] = useState('')
  const [mensajes, setMensajes] = useState<Mensaje[]>([])
  const [pensando, setPensando] = useState(false)
  const [error, setError] = useState('')
  const [year, setYear] = useState(new Date().getFullYear())
  const finRef = useRef<HTMLDivElement>(null)

  const years = useMemo(() => {
    const s = new Set<number>()
    for (const r of reservations) if (r.checkIn) s.add(Number(r.checkIn.slice(0, 4)))
    for (const p of payments) {
      const m = p.mes ?? p.paymentDate
      if (m) s.add(Number(m.slice(0, 4)))
    }
    s.add(new Date().getFullYear())
    return [...s].filter(Boolean).sort((a, b) => b - a)
  }, [reservations, payments])

  useEffect(() => { finRef.current?.scrollIntoView({ behavior: 'smooth' }) }, [mensajes, pensando])

  async function manda(texto: string) {
    const limpio = texto.trim()
    if (!limpio || pensando) return
    setError('')
    setPregunta('')
    const historial = mensajes.slice(-6)
    setMensajes(m => [...m, { role: 'user', content: limpio }])
    setPensando(true)
    try {
      const token = await auth.currentUser?.getIdToken()
      if (!token) throw new Error('No encuentro tu sesión. Vuelve a entrar en la app.')
      const contexto = resumenParaAsistente({ apartments, reservations, payments, expenses }, year)
      // El número de la pregunta lo pone esta pantalla: la función de segundo
      // plano contesta 202 al momento y no puede devolver nada.
      const jobId = crypto.randomUUID()
      const resp = await fetch(RUTA, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ jobId, pregunta: limpio, contexto, historial }),
      })
      if (resp.status === 404) {
        throw new Error('Esta copia de la app no tiene el asistente. Ábrela en ofipapel.netlify.app/alquileres/')
      }
      if (!resp.ok && resp.status !== 202) {
        const datos = await resp.json().catch(() => ({}))
        throw new Error(datos.error || 'No he podido mandar la pregunta.')
      }

      // Y ahora se va a recoger la respuesta hasta que esté.
      const hasta = Date.now() + ESPERA_MS
      for (;;) {
        await duerme(CADA_MS)
        const r = await fetch(`${RUTA_ESTADO}?jobId=${jobId}`, {
          headers: { authorization: `Bearer ${token}` },
        })
        const datos = await r.json().catch(() => ({}))
        if (!r.ok) throw new Error(datos.error || 'No he podido recoger la respuesta.')
        if (datos.estado === 'hecho') {
          setMensajes(m => [...m, { role: 'assistant', content: datos.respuesta }])
          break
        }
        if (datos.estado === 'error') throw new Error(datos.error || 'El asistente no ha podido responder.')
        if (Date.now() > hasta) {
          throw new Error('Está tardando demasiado. Vuelve a preguntarlo en un momento.')
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Algo ha fallado.')
    } finally {
      setPensando(false)
    }
  }

  if (!abierto) {
    return (
      <button onClick={() => setAbierto(true)} title="Preguntar a la aplicación"
        className="print:hidden fixed bottom-5 right-5 z-40 flex items-center gap-2 px-4 py-3 rounded-full bg-blue-600 text-white shadow-lg hover:bg-blue-700">
        <MessageCircleQuestion size={20} />
        <span className="text-sm font-medium hidden sm:inline">Preguntar</span>
      </button>
    )
  }

  return (
    <div className="print:hidden fixed inset-x-0 bottom-0 sm:inset-x-auto sm:right-5 sm:bottom-5 z-40 sm:w-[26rem]">
      <div className="bg-white border border-slate-200 rounded-t-xl sm:rounded-xl shadow-2xl flex flex-col max-h-[80vh]">
        <div className="flex items-center justify-between px-4 py-3 bg-slate-700 rounded-t-xl">
          <div className="flex items-center gap-2 text-white">
            <MessageCircleQuestion size={18} />
            <span className="font-semibold text-sm">Preguntar a la aplicación</span>
          </div>
          <div className="flex items-center gap-2">
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              title="De qué ejercicio son los datos sobre los que pregunto"
              className="bg-white/10 text-white text-xs rounded px-1.5 py-1 border border-white/20">
              {years.map(y => <option key={y} value={y} className="text-slate-800">{y}</option>)}
            </select>
            <button onClick={() => setAbierto(false)} className="text-white/80 hover:text-white"><X size={18} /></button>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-3 min-h-[10rem]">
          {mensajes.length === 0 && (
            <div className="space-y-2">
              <p className="text-sm text-slate-500">
                Pregúntame por los datos de {year}: cobros, reservas, lo que falta por cobrar,
                gastos… Contesto con lo que hay en la app, y si no está, te lo digo.
              </p>
              {EJEMPLOS.map(e => (
                <button key={e} onClick={() => manda(e)}
                  className="block w-full text-left text-xs text-blue-700 bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 hover:bg-blue-100">
                  {e}
                </button>
              ))}
            </div>
          )}
          {mensajes.map((m, i) => (
            <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
              <span className={`inline-block text-sm rounded-2xl px-3 py-2 whitespace-pre-wrap text-left ${
                m.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-100 text-slate-800'}`}>
                {m.content}
              </span>
            </div>
          ))}
          {pensando && (
            <p className="flex items-center gap-2 text-sm text-slate-400">
              <Loader2 size={14} className="animate-spin" /> Mirando los datos…
            </p>
          )}
          {error && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">{error}</p>
          )}
          <div ref={finRef} />
        </div>

        <form onSubmit={e => { e.preventDefault(); manda(pregunta) }}
          className="flex items-center gap-2 p-3 border-t border-slate-200">
          <input value={pregunta} onChange={e => setPregunta(e.target.value)}
            placeholder="Escribe tu pregunta…"
            className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          <button type="submit" disabled={pensando || !pregunta.trim()}
            className="p-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
            <Send size={16} />
          </button>
        </form>
      </div>
    </div>
  )
}
