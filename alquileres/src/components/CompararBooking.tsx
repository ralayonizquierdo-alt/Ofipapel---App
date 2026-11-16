import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Plus, Trash2, ChevronDown, ChevronUp, ExternalLink } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import {
  APARTAMENTOS_BOOKING, NOCHES_BOOKING, TIPO_BOOKING, apuntaPrecioBooking, precioNuestro,
  quitaPrecioBooking, usePreciosBooking, type PrecioBooking,
} from '../lib/booking'
import { addDays, formatDate, today } from '../lib/dateUtils'
import { num } from '../lib/formato'

/** El anuncio de la agencia en Booking. */
const ANUNCIO = 'https://www.booking.com/hotel/es/apartments-av-suecia.es.html'

/**
 * Booking pone bajo cada precio «Incluye impuestos y cargos» (visto el
 * 16/11/2026): el IGIC va dentro. Si la limpieza también, aún no se sabe.
 * Cuando se sepa, se cambia este texto o se quita.
 */
const AVISO_SIN_SABER = 'Booking dice que su precio «incluye impuestos y cargos»: el IGIC (7 %) va dentro y en lo nuestro no. '
  + 'Falta saber si también lleva la limpieza.'

/** «+235 € (+26,6 %)». */
function diferencia(booking: number, nuestro: number) {
  const d = Math.round((booking - nuestro) * 100) / 100
  const pct = nuestro > 0 ? (d / nuestro) * 100 : 0
  const signo = d > 0 ? '+' : d < 0 ? '−' : ''
  return {
    d,
    texto: `${signo}${num(Math.abs(d), 2)} €`,
    pct: `${signo}${num(Math.abs(pct), 1)} %`,
  }
}

/**
 * «Comparar con Booking», en Precios (Luis, 16/11/2026). Ver lib/booking.ts.
 *
 * Arriba, lo último que se miró de cada apartamento y tarifa; debajo, plegadas,
 * todas las consultas, para ver si Booking sube o baja con el tiempo.
 */
export default function CompararBooking() {
  const { prices, offerPrices, apartments } = useData()
  const consultas = usePreciosBooking()
  const [abierto, setAbierto] = useState(false)
  const [verTodas, setVerTodas] = useState(false)

  /**
   * Desde el aviso mensual se llega con `?ver=booking`: se baja hasta aquí. Con
   * un respiro, porque las tablas de arriba (ofertas) llegan de la nube después
   * y empujan la sección hacia abajo.
   */
  const [params] = useSearchParams()
  const irAqui = params.get('ver') === 'booking'
  const cargado = consultas !== null && prices.length > 0
  useEffect(() => {
    if (!irAqui || !cargado) return
    const t = setTimeout(() => document.getElementById('booking')?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 400)
    return () => clearTimeout(t)
  }, [irAqui, cargado])

  const nombre = (id: string) => apartments.find(a => a.id === id)?.name ?? `Apartamento ${id}`

  /** Cada consulta con lo nuestro de esa semana ya calculado. */
  const filas = useMemo(() => (consultas ?? []).map(c => ({
    c, nuestro: precioNuestro(prices, offerPrices, c.apartmentId, c.entrada),
  })), [consultas, prices, offerPrices])

  /**
   * La última de cada apartamento y tarifa: Invierno, Verano y cada oferta
   * se vigilan por separado. Un apartamento sin ninguna sale igual, vacío,
   * para que se vea que falta.
   */
  const ultimas = useMemo(() => {
    const salida: { apt: string; fila?: (typeof filas)[number] }[] = []
    for (const apt of APARTAMENTOS_BOOKING) {
      const suyas = filas.filter(f => f.c.apartmentId === apt)
      if (suyas.length === 0) { salida.push({ apt }); continue }
      const vistas = new Set<string>()
      for (const f of suyas) {
        const clave = f.nuestro?.tarifa ?? '?'
        if (vistas.has(clave)) continue
        vistas.add(clave)
        salida.push({ apt, fila: f })
      }
    }
    return salida
  }, [filas])

  return (
    <section id="booking" className="mt-10 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold text-slate-800">Comparar con Booking</h2>
        <div className="flex flex-wrap items-center gap-2">
          <a href={ANUNCIO} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            <ExternalLink size={15} /> Abrir Booking
          </a>
          <button onClick={() => setAbierto(a => !a)}
            className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus size={15} /> Apuntar precio de Booking
          </button>
        </div>
      </div>

      <p className="mb-3 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
        ⚠️ {AVISO_SIN_SABER}
      </p>

      {abierto && <FormularioBooking nombre={nombre} onHecho={() => setAbierto(false)} />}

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                <th className="text-left py-2.5 px-4 font-medium">Apartamento</th>
                <th className="text-left py-2.5 px-4 font-medium">Tarifa</th>
                <th className="text-left py-2.5 px-4 font-medium whitespace-nowrap">Semana consultada</th>
                <th className="text-right py-2.5 px-4 font-medium text-green-700 whitespace-nowrap">Nuestro (web + limpieza)</th>
                <th className="text-right py-2.5 px-4 font-medium text-blue-700">Booking</th>
                <th className="text-right py-2.5 px-4 font-medium">Diferencia</th>
                <th className="text-left py-2.5 px-4 font-medium whitespace-nowrap">Mirado el</th>
              </tr>
            </thead>
            <tbody>
              {consultas === null ? (
                <tr><td colSpan={7} className="py-4 px-4 text-slate-400">Cargando…</td></tr>
              ) : ultimas.map(({ apt, fila }) => (
                <tr key={`${apt}-${fila?.c.id ?? 'nada'}`} className="border-b border-slate-50">
                  <td className="py-3 px-4">
                    <p className="font-medium text-slate-700 whitespace-nowrap">{nombre(apt)}</p>
                    <p className="text-xs text-slate-400 whitespace-nowrap">{TIPO_BOOKING[apt]}</p>
                  </td>
                  {fila ? <Celdas fila={fila} /> : (
                    <td colSpan={6} className="py-3 px-4 text-slate-400 italic">Sin consultar todavía</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {consultas && consultas.length > 0 && (
        <div className="mt-3">
          <button onClick={() => setVerTodas(v => !v)}
            className="flex items-center gap-1.5 text-sm text-blue-600 hover:underline">
            {verTodas ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
            {verTodas ? 'Ocultar las consultas' : `Ver todas las consultas (${consultas.length})`}
          </button>
          {verTodas && (
            <div className="mt-2 bg-white rounded-xl shadow-sm border border-slate-200 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-500">
                    <th className="text-left py-2 px-4 font-medium">Mirado el</th>
                    <th className="text-left py-2 px-4 font-medium">Apartamento</th>
                    <th className="text-left py-2 px-4 font-medium">Tarifa</th>
                    <th className="text-left py-2 px-4 font-medium">Semana</th>
                    <th className="text-right py-2 px-4 font-medium text-green-700">Nuestro</th>
                    <th className="text-right py-2 px-4 font-medium text-blue-700">Booking</th>
                    <th className="text-right py-2 px-4 font-medium">Diferencia</th>
                    <th className="py-2 px-2" />
                  </tr>
                </thead>
                <tbody>
                  {filas.map(f => {
                    const dif = f.nuestro ? diferencia(f.c.precio, f.nuestro.total) : null
                    return (
                      <tr key={f.c.id} className="border-b border-slate-50">
                        <td className="py-2 px-4 whitespace-nowrap text-slate-600">
                          {formatDate(f.c.consultado)}{f.c.por && <span className="text-xs text-slate-400"> · {f.c.por}</span>}
                        </td>
                        <td className="py-2 px-4 whitespace-nowrap">{nombre(f.c.apartmentId)}</td>
                        <td className="py-2 px-4 whitespace-nowrap text-slate-600">{f.nuestro?.tarifa ?? '—'}</td>
                        <td className="py-2 px-4 whitespace-nowrap text-slate-600">{semana(f.c.entrada)}</td>
                        <td className="py-2 px-4 text-right whitespace-nowrap text-green-700">{f.nuestro ? `${num(f.nuestro.total, 2)} €` : '—'}</td>
                        <td className="py-2 px-4 text-right whitespace-nowrap text-blue-700">{num(f.c.precio, 2)} €</td>
                        <td className={`py-2 px-4 text-right whitespace-nowrap ${colorDif(dif?.d)}`}>
                          {dif ? `${dif.texto} (${dif.pct})` : '—'}
                        </td>
                        <td className="py-2 px-2">
                          <button title="Quitar esta consulta"
                            onClick={() => { if (confirm('¿Quitar esta consulta de Booking?')) quitaPrecioBooking(f.c.id) }}
                            className="p-1.5 text-slate-400 hover:text-red-600 rounded"><Trash2 size={14} /></button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/** «01/12 al 08/12/2026». */
function semana(entrada: string): string {
  // El día con su cero delante: «01/12», no «1/12».
  return `${formatDate(entrada).slice(0, 5)} al ${formatDate(addDays(entrada, NOCHES_BOOKING))}`
}

/** Booking más caro que nosotros, en rojo; más barato, en azul. */
function colorDif(d?: number): string {
  if (d === undefined || d === 0) return 'text-slate-500'
  return d > 0 ? 'text-red-600 font-semibold' : 'text-blue-700 font-semibold'
}

function Celdas({ fila }: { fila: { c: PrecioBooking; nuestro: ReturnType<typeof precioNuestro> } }) {
  const { c, nuestro } = fila
  const dif = nuestro ? diferencia(c.precio, nuestro.total) : null
  return (
    <>
      <td className="py-3 px-4 whitespace-nowrap text-slate-600">{nuestro?.tarifa ?? 'Sin tarifa'}</td>
      <td className="py-3 px-4 whitespace-nowrap text-slate-600">{semana(c.entrada)}</td>
      <td className="py-3 px-4 text-right whitespace-nowrap font-semibold text-green-700">
        {nuestro ? `${num(nuestro.total, 2)} €` : '—'}
      </td>
      <td className="py-3 px-4 text-right whitespace-nowrap font-semibold text-blue-700">{num(c.precio, 2)} €</td>
      <td className={`py-3 px-4 text-right whitespace-nowrap ${colorDif(dif?.d)}`}>
        {dif ? <>{dif.texto}<br /><span className="text-xs">{dif.pct}</span></> : '—'}
      </td>
      <td className="py-3 px-4 whitespace-nowrap text-slate-600">{formatDate(c.consultado)}</td>
    </>
  )
}

/** Apuntar lo que dice Booking: apartamento, semana y precio. */
function FormularioBooking({ nombre, onHecho }: { nombre: (id: string) => string; onHecho: () => void }) {
  const { prices, offerPrices } = useData()
  const [apt, setApt] = useState(APARTAMENTOS_BOOKING[0])
  const [entrada, setEntrada] = useState(() => addDays(today(), 14))
  const [precio, setPrecio] = useState('')
  const [consultado, setConsultado] = useState(today())
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState('')

  const nuestro = entrada ? precioNuestro(prices, offerPrices, apt, entrada) : null
  const importe = Number(precio.replace(/\./g, '').replace(',', '.'))
  const valido = !!entrada && !!consultado && importe > 0

  async function guardar() {
    if (!valido) return
    setGuardando(true)
    setError('')
    try {
      await apuntaPrecioBooking({ apartmentId: apt, entrada, precio: importe, consultado })
      onHecho()
    } catch {
      setError('No se ha podido guardar. Mira la conexión y vuelve a probar.')
    } finally {
      setGuardando(false)
    }
  }

  const campo = 'border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white w-full'
  return (
    <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm">
          <span className="text-slate-600">Apartamento</span>
          <select value={apt} onChange={e => setApt(e.target.value)} className={campo}>
            {APARTAMENTOS_BOOKING.map(a => (
              <option key={a} value={a}>{nombre(a)} · {TIPO_BOOKING[a]}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Entrada (salida a los {NOCHES_BOOKING} días)</span>
          <input type="date" value={entrada} onChange={e => setEntrada(e.target.value)} className={campo} />
          {entrada && <span className="text-xs text-slate-500">Salida: {formatDate(addDays(entrada, NOCHES_BOOKING))}</span>}
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Precio en Booking (€, la semana)</span>
          <input inputMode="decimal" value={precio} onChange={e => setPrecio(e.target.value)}
            placeholder="1.120" className={campo} />
        </label>
        <label className="block text-sm">
          <span className="text-slate-600">Mirado el</span>
          <input type="date" value={consultado} onChange={e => setConsultado(e.target.value)} className={campo} />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-slate-700">
          {nuestro
            ? <>Nuestro para esa semana ({nuestro.tarifa}): <b className="text-green-700">{num(nuestro.total, 2)} €</b>
                <span className="text-slate-500"> = web {num(nuestro.web, 2)} € + limpieza {num(nuestro.limpieza, 2)} €</span></>
            : <span className="text-red-600">No hay tarifa para esas fechas.</span>}
        </p>
        <div className="flex gap-2">
          <button onClick={onHecho} className="px-4 py-2 text-sm text-slate-600 hover:bg-white rounded-lg">Cancelar</button>
          <button onClick={guardar} disabled={!valido || guardando}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-semibold hover:bg-blue-700 disabled:opacity-50">
            {guardando ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  )
}
