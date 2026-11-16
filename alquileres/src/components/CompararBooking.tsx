import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { Season } from '../types'
import { useSearchParams } from 'react-router-dom'
import { Plus, Trash2, ChevronDown, ChevronUp, ExternalLink, Printer, ClipboardCopy } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import {
  APARTAMENTOS_BOOKING, NOCHES_BOOKING, TIPO_BOOKING, apuntaPrecioBooking, precioNuestro,
  quitaPrecioBooking, usePreciosBooking, type PrecioBooking, type PrecioNuestro, ENCARGO_CLAUDE,
} from '../lib/booking'
import { addDays, formatDate, getSeason, today } from '../lib/dateUtils'
import { num } from '../lib/formato'

/** El anuncio de la agencia en Booking. */
const ANUNCIO = 'https://www.booking.com/hotel/es/apartments-av-suecia.es.html'

/**
 * Booking pone bajo cada precio «Incluye impuestos y cargos» (visto el
 * 16/11/2026): el IGIC va dentro. Si la limpieza también, aún no se sabe.
 * Cuando se sepa, se cambia este texto o se quita.
 */
const AVISO_SIN_SABER = 'Booking dice que su precio «incluye impuestos y cargos», así que a lo nuestro se le suma el IGIC (7 %) '
  + 'para comparar lo mismo. Falta saber si Booking lleva también la limpieza.'

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
   * Por temporadas, como las tablas de Precios (Luis, 16/11/2026): primero
   * Invierno y luego Verano, y dentro de cada una la tarifa general y después
   * cada oferta de un mes de esa temporada. En cada tarifa, la última consulta
   * de cada apartamento; en la general salen todos, aunque falten, para que se
   * vea qué queda por mirar.
   */
  const porTemporada = useMemo(() => (['INVIERNO', 'VERANO'] as Season[]).map(season => {
    const suyas = filas.filter(f => getSeason(f.c.entrada) === season)
    const tarifaDe = (f: (typeof filas)[number]) => f.nuestro?.tarifa ?? 'Sin tarifa'
    const primera = (t: string) => suyas.filter(f => tarifaDe(f) === t).map(f => f.c.entrada).sort()[0]
    const tarifas = [...new Set(suyas.map(tarifaDe))].sort((a, b) =>
      Number(a.startsWith('Oferta')) - Number(b.startsWith('Oferta'))
      || primera(a).localeCompare(primera(b)))
    const grupos = tarifas.map(tarifa => {
      const oferta = tarifa.startsWith('Oferta')
      // `filas` va de la más reciente a la más antigua: la primera es la última.
      const deEsta = suyas.filter(f => tarifaDe(f) === tarifa)
      const lineas = APARTAMENTOS_BOOKING
        .map(apt => ({ apt, fila: deEsta.find(f => f.c.apartmentId === apt) }))
        .filter(x => x.fila || !oferta)
      return { tarifa, oferta, lineas }
    })
    return { season, grupos }
  }), [filas])

  return (
    <section id="booking" className="mt-10 print:hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <h2 className="text-lg font-semibold text-slate-800">Comparar con Booking</h2>
        <div className="flex flex-wrap items-center gap-2">
          <a href={ANUNCIO} target="_blank" rel="noreferrer"
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            <ExternalLink size={15} /> Abrir Booking
          </a>
          <button onClick={() => imprimeParaAgencia(porTemporada, nombre,
            (apt, entrada) => precioNuestro(prices, offerPrices, apt, entrada))}
            disabled={!consultas || consultas.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 disabled:opacity-50">
            <Printer size={15} /> Imprimir / PDF para la agencia
          </button>
          <BotonCopiarEncargo />
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
                <th className="text-left py-2.5 px-4 font-medium whitespace-nowrap">Semana consultada</th>
                <th className="text-right py-2.5 px-4 font-medium text-green-700 whitespace-nowrap">Nuestro (web + limpieza + IGIC)</th>
                <th className="text-right py-2.5 px-4 font-medium text-blue-700">Booking</th>
                <th className="text-right py-2.5 px-4 font-medium">Diferencia</th>
                <th className="text-left py-2.5 px-4 font-medium whitespace-nowrap">Mirado el</th>
              </tr>
            </thead>
            <tbody>
              {consultas === null ? (
                <tr><td colSpan={6} className="py-4 px-4 text-slate-400">Cargando…</td></tr>
              ) : porTemporada.map(({ season, grupos }) => (
                <Fragment key={season}>
                  <tr className="border-t-2 border-slate-200">
                    <td colSpan={6} className="pt-4 pb-2 px-4">
                      <span className={`text-sm font-bold px-3 py-1 rounded-full ${season === 'VERANO'
                        ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                        {season === 'VERANO' ? 'VERANO (May–Sep)' : 'INVIERNO (Oct–Abr)'}
                      </span>
                    </td>
                  </tr>
                  {grupos.length === 0 && (
                    <tr><td colSpan={6} className="py-3 px-4 text-slate-400 italic">Sin consultas de esta temporada todavía</td></tr>
                  )}
                  {grupos.map(g => (
                    <Fragment key={g.tarifa}>
                      <tr className={g.oferta ? 'bg-amber-50' : 'bg-slate-50'}>
                        <td colSpan={6} className={`py-1.5 px-4 text-xs font-bold ${g.oferta ? 'text-amber-800' : 'text-slate-600'}`}>
                          {g.oferta && <span className="mr-2 px-1.5 py-0.5 rounded bg-amber-500 text-white">TARIFA OFERTA</span>}
                          {g.tarifa}
                        </td>
                      </tr>
                      {g.lineas.map(({ apt, fila }) => (
                        <tr key={`${apt}-${fila?.c.id ?? 'nada'}`} className="border-b border-slate-50">
                          <td className="py-3 px-4">
                            <p className="font-medium text-slate-700 whitespace-nowrap">{nombre(apt)}</p>
                            <p className="text-xs text-slate-400 whitespace-nowrap">{TIPO_BOOKING[apt]}</p>
                          </td>
                          {fila ? <Celdas fila={fila} /> : (
                            <td colSpan={5} className="py-3 px-4 text-slate-400 italic">Sin consultar todavía</td>
                          )}
                        </tr>
                      ))}
                    </Fragment>
                  ))}
                </Fragment>
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
                        <td className="py-2 px-4 text-right whitespace-nowrap text-green-700">
                          {f.nuestro ? <><Desglose n={f.nuestro} />{num(f.nuestro.total, 2)} €</> : '—'}
                        </td>
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

type PorTemporada = {
  season: Season
  grupos: { tarifa: string; oferta: boolean; lineas: { apt: string; fila?: { c: PrecioBooking; nuestro: PrecioNuestro | null } }[] }[]
}[]

const esc = (s: string) => s.replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]!)

/**
 * El listado para mandar a la agencia (Luis, 16/11/2026): en negro, como un
 * borrador, una temporada por hoja, y solo tarifa, apartamento, lo nuestro,
 * Booking y la diferencia. Sin la semana consultada ni el día en que se miró:
 * no interesa que se vea que se ha entrado en Booking.
 *
 * Abre el diálogo de imprimir solo con el listado, donde se elige la
 * impresora o «Guardar como PDF»; la pantalla de la app no se toca.
 */
function imprimeParaAgencia(
  porTemporada: PorTemporada, nombre: (id: string) => string,
  nuestroDe: (apt: string, entrada: string) => PrecioNuestro | null,
) {
  const hoy = formatDate(today())
  const paginas = porTemporada.map(({ season, grupos }) => {
    const filas = grupos.flatMap(g => {
      // Para el que no sale en Booking (el Ático en invierno, 16/11/2026), lo
      // nuestro se calcula con la misma semana que los demás de esa tarifa.
      const semanaDelGrupo = g.lineas.find(l => l.fila)?.fila?.c.entrada
      return g.lineas.map(l => {
        const n = l.fila?.nuestro ?? (semanaDelGrupo ? nuestroDe(l.apt, semanaDelGrupo) : null)
        if (!n) return ''
        const booking = l.fila
          ? `<td class="n b">${num(l.fila.c.precio, 2)} €</td>`
            + `<td class="n b">${diferencia(l.fila.c.precio, n.total).texto}<br>${diferencia(l.fila.c.precio, n.total).pct}</td>`
          : '<td class="n b">No aparece</td><td class="n">—</td>'
        // El desglose desde el neto de la tarifa que se le manda a la agencia
        // (Luis, 16/11/2026: «no se sabe precio base más cuánto de limpieza»).
        return `<tr><td>${esc(g.tarifa.replace(/^(\S+) (\d+) \(aún no hay (\d+)\)$/, '$1 $3 (tarifa $2)'))}</td>`
          + `<td>${esc(nombre(l.apt))}</td>`
          + `<td class="n">${num(n.base, 2)} €</td><td class="n">${num(n.comision * 2, 2)} €</td>`
          + `<td class="n">${num(n.limpieza, 2)} €</td><td class="n">${num(n.igic, 2)} €</td>`
          + `<td class="n b">${num(n.total, 2)} €</td>${booking}</tr>`
      }).filter(Boolean)
    })
    if (filas.length === 0) return ''
    return `<section><h1>Comparativa de precios · ${season === 'VERANO' ? 'Verano (mayo a septiembre)' : 'Invierno (octubre a abril)'}</h1>`
      + `<p class="sub">Precio de 1 semana. Nuestro precio = precio neto + comisiones (15 % + 15 %) + limpieza + IGIC (7 %). Fecha: ${hoy}</p>`
      + '<table><thead><tr><th>Temporada / tarifa</th><th>Apartamento</th>'
      + '<th class="n">Precio neto</th><th class="n">Comisiones<br>15 % + 15 %</th><th class="n">Limpieza</th>'
      + '<th class="n">IGIC 7 %</th><th class="n">Nuestro precio</th>'
      + '<th class="n">Booking</th><th class="n">Diferencia</th></tr></thead>'
      + `<tbody>${filas.join('')}</tbody></table></section>`
  }).filter(Boolean)

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Comparativa de precios ${hoy}</title>
<style>
  * { color: #000 !important; background: #fff !important; }
  body { font-family: Arial, Helvetica, sans-serif; margin: 0; }
  section { padding: 12mm 10mm; page-break-after: always; break-after: page; }
  section:last-child { page-break-after: auto; break-after: auto; }
  h1 { font-size: 18pt; margin: 0 0 4pt; }
  .sub { font-size: 10pt; margin: 0 0 12pt; }
  table { width: 100%; border-collapse: collapse; font-size: 11pt; }
  th, td { border: 1px solid #000; padding: 5pt 6pt; text-align: left; vertical-align: middle; }
  th { font-weight: bold; font-size: 10pt; }
  .n { text-align: right; white-space: nowrap; }
  .b { font-weight: bold; }
  @page { size: A4 landscape; margin: 10mm; }
</style></head><body>${paginas.join('')}</body></html>`

  // Un marco escondido dentro de la página, y no una ventana nueva: las
  // ventanas emergentes las bloquea el navegador (y en la app instalada no hay).
  document.getElementById('imprimir-agencia')?.remove()
  const marco = document.createElement('iframe')
  marco.id = 'imprimir-agencia'
  marco.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0'
  document.body.appendChild(marco)
  const doc = marco.contentDocument!
  doc.open()
  doc.write(html)
  doc.close()
  setTimeout(() => { marco.contentWindow!.focus(); marco.contentWindow!.print() }, 300)
}

/** Copia el encargo mensual para pegárselo a Claude. */
export function BotonCopiarEncargo() {
  const [copiado, setCopiado] = useState(false)
  async function copia() {
    try {
      await navigator.clipboard.writeText(ENCARGO_CLAUDE)
      setCopiado(true)
      setTimeout(() => setCopiado(false), 2500)
    } catch {
      alert(`No se ha podido copiar. Escríbele a Claude:\n\n${ENCARGO_CLAUDE}`)
    }
  }
  return (
    <button type="button" onClick={copia}
      className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
      <ClipboardCopy size={15} /> {copiado ? 'Copiado ✓' : 'Copiar el encargo para Claude'}
    </button>
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
      <td className="py-3 px-4 whitespace-nowrap text-slate-600">{semana(c.entrada)}</td>
      <td className="py-3 px-4 text-right whitespace-nowrap font-semibold text-green-700">
        {nuestro ? <><Desglose n={nuestro} />{num(nuestro.total, 2)} €</> : '—'}
      </td>
      <td className="py-3 px-4 text-right whitespace-nowrap font-semibold text-blue-700">{num(c.precio, 2)} €</td>
      <td className={`py-3 px-4 text-right whitespace-nowrap ${colorDif(dif?.d)}`}>
        {dif ? <>{dif.texto}<br /><span className="text-xs">{dif.pct}</span></> : '—'}
      </td>
      <td className="py-3 px-4 whitespace-nowrap text-slate-600">{formatDate(c.consultado)}</td>
    </>
  )
}

/**
 * El cuadradito delante de nuestro importe (Luis, 16/11/2026): **al hacer
 * clic** se abre el desglose, y se cierra con otro clic, fuera o con Esc.
 * Nunca al pasar el ratón: en Cobros los recuadros que se abren solos al
 * moverse por la pantalla formaban «un medio caos».
 *
 * La ventanita va fija sobre la pantalla (no dentro de la tabla), porque la
 * tabla se desliza de lado y la recortaría.
 */
function Desglose({ n }: { n: PrecioNuestro }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const boton = useRef<HTMLButtonElement>(null)
  const caja = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!pos) return
    const fuera = (e: MouseEvent) => {
      const t = e.target as Node
      if (!caja.current?.contains(t) && !boton.current?.contains(t)) setPos(null)
    }
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setPos(null) }
    const cerrar = () => setPos(null)
    document.addEventListener('mousedown', fuera)
    document.addEventListener('keydown', tecla)
    // Al desplazar la pantalla, la ventanita se quedaría flotando en otro sitio.
    window.addEventListener('scroll', cerrar, true)
    return () => {
      document.removeEventListener('mousedown', fuera)
      document.removeEventListener('keydown', tecla)
      window.removeEventListener('scroll', cerrar, true)
    }
  }, [pos])

  function abre() {
    if (pos) { setPos(null); return }
    const r = boton.current!.getBoundingClientRect()
    const ancho = 300
    setPos({
      top: Math.min(r.bottom + 6, window.innerHeight - 290),
      left: Math.max(8, Math.min(r.left - ancho + 24, window.innerWidth - ancho - 8)),
    })
  }

  const linea = (texto: string, valor: number, fuerte = false) => (
    <div className={`flex justify-between gap-4 ${fuerte ? 'font-bold text-slate-800 border-t border-slate-200 pt-1 mt-1' : 'text-slate-600'}`}>
      <span>{texto}</span><span className="whitespace-nowrap">{num(valor, 2)} €</span>
    </div>
  )

  return (
    <>
      <button ref={boton} type="button" onClick={abre} aria-expanded={!!pos}
        aria-label="Ver el desglose"
        className={`inline-flex items-center justify-center w-5 h-5 mr-2 align-middle rounded border text-xs font-bold leading-none ${
          pos ? 'bg-green-600 border-green-600 text-white' : 'border-green-600 text-green-700 hover:bg-green-50'}`}>
        {pos ? '−' : '+'}
      </button>
      {pos && (
        <div ref={caja} style={{ top: pos.top, left: pos.left, width: 300 }}
          className="fixed z-50 bg-white border border-slate-300 rounded-lg shadow-xl p-3 text-left text-sm font-normal">
          <p className="text-xs font-bold text-slate-500 mb-1.5">{n.tarifa} · 1 semana</p>
          {linea('Base propietario', n.base)}
          {linea('+ Inmobiliaria (15 %)', n.comision)}
          {linea('+ Reserva (15 %)', n.comision)}
          {linea('= Web (publicar)', n.web, true)}
          {linea('+ Limpieza', n.limpieza)}
          {linea('+ IGIC (7 %)', n.igic)}
          {linea('= Nuestro', n.total, true)}
        </div>
      )}
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
            ? <>Nuestro para esa semana · {nuestro.tarifa}: <b className="text-green-700">{num(nuestro.total, 2)} €</b>
                <span className="text-slate-500"> = web {num(nuestro.web, 2)} € + limpieza {num(nuestro.limpieza, 2)} € + IGIC {num(nuestro.igic, 2)} €</span></>
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
