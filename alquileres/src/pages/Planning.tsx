import { useState, useEffect } from 'react'
import { ChevronLeft, ChevronRight, Eye, Pencil } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import Modal from '../components/ui/Modal'
import type { Reservation } from '../types'
import { MONTH_NAMES_ES, DAY_NAMES_ES, getDaysInMonth, getSeason } from '../lib/dateUtils'
import { num } from '../lib/formato'
import { huespedYPersonas, nombreDe, personasDe } from '../lib/huesped'

const APT_COLORS = [
  'bg-blue-400', 'bg-emerald-400', 'bg-violet-400', 'bg-amber-400',
  'bg-rose-400', 'bg-cyan-400', 'bg-lime-400', 'bg-orange-400', 'bg-pink-400',
]

export default function Planning() {
  const { reservations, payments, apartments: allApartments } = useData()
  const navigate = useNavigate()
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  /** La reserva que se está mirando con el ojo. */
  const [mirando, setMirando] = useState<Reservation | null>(null)

  const daysInMonth = getDaysInMonth(year, month)
  const season = getSeason(new Date(year, month - 1, 1))

  function prevMonth() {
    if (month === 1) { setMonth(12); setYear(y => y - 1) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    if (month === 12) { setMonth(1); setYear(y => y + 1) }
    else setMonth(m => m + 1)
  }
  function irAHoy() {
    const ahora = new Date()
    setYear(ahora.getFullYear())
    setMonth(ahora.getMonth() + 1)
  }
  const enEsteMes = year === now.getFullYear() && month === now.getMonth() + 1

  /**
   * Al volver a la app después de un buen rato, el planning se pone solo en el
   * mes de hoy.
   *
   * La pantalla arranca siempre en el mes en curso, pero la app instalada en el
   * móvil no se cierra: al abrirla otra vez el navegador devuelve la página tal
   * y como se dejó, con el mes que se estuviera mirando —que puede ser de hace
   * días—. Se espera media hora a propósito: cambiar de pantalla un momento
   * para mirar un WhatsApp no tiene por qué mover el mes que estás mirando.
   */
  useEffect(() => {
    let desde = 0
    const alVolver = () => {
      if (document.visibilityState === 'hidden') { desde = Date.now(); return }
      if (!desde || Date.now() - desde < 30 * 60 * 1000) return
      desde = 0
      irAHoy()
    }
    document.addEventListener('visibilitychange', alVolver)
    return () => document.removeEventListener('visibilitychange', alVolver)
  }, [])

  const mm = `${year}-${String(month).padStart(2, '0')}`
  const dia = (d: number) => `${mm}-${String(d).padStart(2, '0')}`

  /** Una reserva en este mes: de qué día a qué día se pinta su franja. */
  type Franja = { r: Reservation; desde: number; hasta: number }

  /**
   * Las franjas de un apartamento en el mes que se está mirando.
   *
   * `desde` es el día de entrada, o el 1 si la estancia viene del mes anterior
   * —así las largas también llevan su texto, en vez de cuadraditos mudos— y
   * `hasta` es el último día dormido (la salida no se cuenta).
   */
  function franjasDe(aptId: string): Franja[] {
    const primero = dia(1), ultimo = dia(daysInMonth)
    return reservations
      .filter(r => r.apartmentId === aptId && r.status !== 'cancelada'
        && r.checkIn <= ultimo && r.checkOut > primero)
      .map(r => ({
        r,
        desde: r.checkIn > primero ? Number(r.checkIn.slice(8, 10)) : 1,
        // La salida es exclusiva: el último día que ocupa es el anterior.
        hasta: r.checkOut.slice(0, 7) === mm ? Number(r.checkOut.slice(8, 10)) - 1 : daysInMonth,
      }))
      .filter(f => f.hasta >= f.desde)
      .sort((a, b) => a.desde - b.desde || b.hasta - a.hasta)
  }

  /**
   * Las franjas repartidas en carriles, uno debajo de otro, sin pisarse.
   *
   * Antes el planning buscaba **una** reserva por casilla (`find`), así que de
   * dos que compartieran un solo día en el mismo apartamento se pintaba una y
   * la otra no salía por ninguna parte: guardada, visible en Reservas y en
   * Cobros, pero invisible aquí. Pasaba con un solape de verdad y también con
   * una reserva duplicada al subirla dos veces, que es justo lo que había que
   * poder ver. Ahora cada una tiene su carril y la fila del apartamento crece.
   */
  function carrilesDe(aptId: string): Franja[][] {
    const carriles: Franja[][] = []
    for (const f of franjasDe(aptId)) {
      const sitio = carriles.find(c => c[c.length - 1].hasta < f.desde)
      if (sitio) sitio.push(f)
      else carriles.push([f])
    }
    return carriles
  }

  /**
   * Los apartamentos que salen en el planning.
   *
   * Los activos siempre, y además cualquiera que tenga reservas este mes
   * aunque esté dado de baja o ni siquiera exista en la ficha de apartamentos
   * (una reserva subida con un identificador que no es el nuestro). Antes se
   * pintaban solo los activos, así que esas reservas no tenían fila donde
   * salir y desaparecían de la pantalla sin decir nada.
   */
  const conReservas = new Set(reservations
    .filter(r => r.status !== 'cancelada' && r.checkIn <= dia(daysInMonth) && r.checkOut > dia(1))
    .map(r => r.apartmentId))
  const apartments = [
    ...allApartments.filter(a => a.active || conReservas.has(a.id)),
    ...[...conReservas]
      .filter(id => !allApartments.some(a => a.id === id))
      .sort()
      .map(id => ({ id, name: id, bedrooms: 0, type: '1BR' as const, active: false, desconocido: true })),
  ]

  /** Lo cobrado de una reserva, para el detalle del ojo. */
  function cobradoDe(r: Reservation): number {
    return payments.filter(p => p.reservationId === r.id && p.received)
      .reduce((s, p) => s + p.amount, 0)
  }

  const colorMap: Record<string, string> = {}
  apartments.forEach((a, i) => { colorMap[a.id] = APT_COLORS[i % APT_COLORS.length] })

  /** El importe con sus céntimos, que es como se compara con el Excel. */
  const eur = (n: number) =>
    `${num(n, 2)} €`

  function fmtD(iso: string, withYear = false): string {
    const d = new Date(iso)
    const day = d.getDate()
    const mon = d.getMonth() + 1
    return withYear ? `${day}/${mon}/${String(d.getFullYear()).slice(2)}` : `${day}/${mon}`
  }

  const today = new Date()
  const isToday = (d: number) => year === today.getFullYear() && month === today.getMonth() + 1 && d === today.getDate()

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-slate-800">Planning de Reservas</h1>
          <span className={`text-xs font-medium px-2 py-0.5 rounded-full mt-1 inline-block ${season === 'VERANO' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
            Temporada de {season} {season === 'VERANO' ? '(May–Sep)' : '(Oct–Abr)'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-2 rounded-lg hover:bg-slate-200 text-slate-600"><ChevronLeft size={18} /></button>
          <span className="font-semibold text-slate-700 text-sm w-36 text-center capitalize">
            {MONTH_NAMES_ES[month - 1]} {year}
          </span>
          <button onClick={nextMonth} className="p-2 rounded-lg hover:bg-slate-200 text-slate-600"><ChevronRight size={18} /></button>
          {/* Para volver al mes de hoy sin ir dando saltos con las flechas.
              Solo sale cuando se está mirando otro mes. */}
          {!enEsteMes && (
            <button onClick={irAHoy}
              className="ml-1 px-3 py-1.5 text-xs font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700">
              Hoy
            </button>
          )}
        </div>
      </div>

      {/* Calendar grid */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-auto">
        <table className="w-full text-xs border-collapse min-w-[900px] table-fixed">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 text-slate-500 font-medium w-28 sticky left-0 bg-white z-10">Apartamento</th>
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map(d => {
                const dow = new Date(year, month - 1, d).getDay()
                const isWe = dow === 0 || dow === 6
                return (
                  <th key={d} className={`text-center py-2 font-medium w-8 ${isToday(d) ? 'bg-blue-50 text-blue-700' : isWe ? 'text-slate-400 bg-slate-50' : 'text-slate-500'}`}>
                    <div>{d}</div>
                    <div className="text-slate-400 font-normal">{DAY_NAMES_ES[(dow + 6) % 7]}</div>
                  </th>
                )
              })}
            </tr>
          </thead>
          <tbody>
            {apartments.map(apt => {
              const carriles = carrilesDe(apt.id)
              // Sin reservas este mes la fila sigue existiendo, vacía: el
              // planning también se mira para ver qué está libre.
              if (carriles.length === 0) carriles.push([])
              return carriles.map((carril, nc) => (
              <tr key={`${apt.id}-${nc}`} className={`${nc === carriles.length - 1 ? 'border-b border-slate-100' : ''} hover:bg-slate-50`}>
                {nc === 0 && (
                <td rowSpan={carriles.length}
                  className="py-2 px-3 font-medium text-slate-700 sticky left-0 bg-white z-10 border-r border-slate-200 align-top">
                  <div className="flex items-center gap-1.5">
                    <span className={`w-2.5 h-2.5 rounded-full ${colorMap[apt.id]}`} />
                    {apt.name}
                  </div>
                  {!apt.active && (
                    <div className="text-[10px] text-amber-700 font-normal mt-0.5"
                      title="Este apartamento no está activo, pero tiene reservas en este mes">
                      {'desconocido' in apt ? 'no está en la ficha' : 'dado de baja'}
                    </div>
                  )}
                  {carriles.length > 1 && (
                    <div className="text-[10px] text-rose-700 font-normal mt-0.5"
                      title="Hay reservas que se pisan: cada una va en su propia línea">
                      ⚠ {carriles.length} reservas a la vez
                    </div>
                  )}
                </td>
                )}
                {/* Las casillas del mes. Una reserva ocupa de verdad las
                    suyas (`colSpan`), en vez de una barra con el ancho
                    calculado en rem: las columnas se estiran con la ventana y
                    la barra se quedaba corta, sin llegar a su último día. */}
                {(() => {
                  const celdas = []
                  for (let d = 1; d <= daysInMonth; d++) {
                    const franja = carril.find(f => d >= f.desde && d <= f.hasta)
                    const dow = new Date(year, month - 1, d).getDay()
                    const isWe = dow === 0 || dow === 6
                    if (!franja) {
                      celdas.push(
                        <td key={d} className={`h-9 p-0 ${isWe ? 'bg-slate-50' : ''} ${isToday(d) ? 'bg-blue-50' : ''}`} />,
                      )
                      continue
                    }
                    const res = franja.r
                    // Viene de antes del día 1: se marca con una flecha para no
                    // confundirla con una entrada de ese día.
                    const vieneDeAntes = res.checkIn < dia(1)
                    // Orden fijo, el que pidió el propietario: apartamento, fechas,
                    // noches e importe total. Antes iba el desglose precio+limpieza,
                    // que en una franja estrecha no se lee y no es lo que se mira.
                    // Quién viene y cuántos son, delante del dinero: es lo
                    // primero que se mira en el planning (lo pidió el
                    // propietario el 26/10/2026).
                    const quien = huespedYPersonas(res)
                    const label = `${vieneDeAntes ? '◀ ' : ''}${apt.id} — `
                      + (quien ? `${quien} — ` : '')
                      + `${fmtD(res.checkIn)} al ${fmtD(res.checkOut, true)}, `
                      + `${res.nights}-N, ${eur(res.total)}`
                    celdas.push(
                      <td key={d} colSpan={franja.hasta - d + 1} title={label} className="h-9 p-0.5">
                        <div
                          className={`h-full ${colorMap[apt.id]} opacity-80 rounded-sm flex items-center overflow-hidden cursor-pointer hover:opacity-100`}
                          onClick={() => navigate(`/reservas?edit=${res.id}`)}
                        >
                          <span className="text-white font-semibold px-1 text-xs leading-none whitespace-nowrap overflow-hidden flex-1">
                            {label}
                          </span>
                          {/* El ojo: la franja estrecha no cabe entera y el
                              aviso amarillo solo sale si aciertas a parar el
                              ratón encima. Esto se pincha y se queda. */}
                          <button
                            onClick={e => { e.stopPropagation(); setMirando(res) }}
                            title="Ver los datos de esta reserva"
                            className="shrink-0 h-full px-1 flex items-center text-white/90 hover:text-white hover:bg-black/20">
                            <Eye size={13} />
                          </button>
                        </div>
                      </td>,
                    )
                    d = franja.hasta
                  }
                  return celdas
                })()}
              </tr>
              ))
            })}
          </tbody>
        </table>
      </div>

      {mirando && (
        <DetalleReserva
          res={mirando}
          nombre={allApartments.find(a => a.id === mirando.apartmentId)?.name ?? mirando.apartmentId}
          cobrado={cobradoDe(mirando)}
          eur={eur}
          onEditar={() => navigate(`/reservas?edit=${mirando.id}`)}
          onClose={() => setMirando(null)}
        />
      )}

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-3">
        {apartments.map(apt => (
          <div key={apt.id} className="flex items-center gap-1.5 text-xs text-slate-600">
            <span className={`w-3 h-3 rounded ${colorMap[apt.id]}`} />
            {apt.name}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Los datos de una reserva, al pinchar el ojo de su franja.
 *
 * Enseña lo que no cabe en la franja y lo que de verdad se pregunta uno
 * mirando el planning: qué días, cuántas noches, cuánto vale y si está
 * cobrada. Cuando han pagado de más lo dice con esas palabras, en vez de
 * enseñar un «pendiente» en negativo, que no se entiende. El sobrante no se
 * devuelve ni se descuenta de nada: la estancia queda cuadrada.
 */
function DetalleReserva({ res, nombre, cobrado, eur, onEditar, onClose }: {
  res: Reservation
  nombre: string
  cobrado: number
  eur: (n: number) => string
  onEditar: () => void
  onClose: () => void
}) {
  const saldo = Math.round((res.total - cobrado) * 100) / 100
  const fecha = (iso: string) => new Date(iso).toLocaleDateString('es-ES',
    { day: 'numeric', month: 'long', year: 'numeric' })

  const filas: [string, string][] = [
    ['Apartamento', nombre],
    ...(nombreDe(res) ? [['Huésped', nombreDe(res)] as [string, string]] : []),
    ...(personasDe(res) ? [['Personas', `${personasDe(res)}`] as [string, string]] : []),
    ['Entrada', fecha(res.checkIn)],
    ['Salida', fecha(res.checkOut)],
    ['Noches', `${res.nights}`],
    ['Canal', res.channel],
    ['Importe', eur(res.total)],
    ['Cobrado', eur(cobrado)],
  ]

  return (
    <Modal title={`Reserva · ${nombre}`} onClose={onClose}>
      <div className="space-y-4">
        <table className="w-full text-sm">
          <tbody>
            {filas.map(([k, v]) => (
              <tr key={k} className="border-b border-slate-100 last:border-0">
                <th scope="row" className="text-left py-2 font-normal text-slate-500 capitalize">{k}</th>
                <td className="py-2 text-right font-medium text-slate-800 tabular-nums">{v}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {saldo > 0.005 && (
          <p className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5 text-sm font-semibold text-amber-800">
            Falta por cobrar {eur(saldo)}
          </p>
        )}
        {saldo < -0.005 && (
          <p className="bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5 text-sm font-semibold text-blue-800">
            Cuadrada, y pagaron {eur(-saldo)} de más
          </p>
        )}
        {Math.abs(saldo) <= 0.005 && res.total > 0 && (
          <p className="bg-green-50 border border-green-200 rounded-lg px-4 py-2.5 text-sm font-semibold text-green-800">
            Cobrada del todo
          </p>
        )}

        {res.notes && <p className="text-xs text-slate-400 leading-relaxed">{res.notes}</p>}

        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cerrar</button>
          <button onClick={onEditar}
            className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            <Pencil size={15} /> Abrir la reserva
          </button>
        </div>
      </div>
    </Modal>
  )
}
