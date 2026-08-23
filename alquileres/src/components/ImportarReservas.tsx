import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, CalendarRange, Upload } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { leeCalendario, type ResultadoCalendario } from '../lib/importarCalendario'
import { buscaTarifa, calcTotal, tramoPorNoches } from '../lib/priceCalc'
import type { Reservation } from '../types'
import Modal from './ui/Modal'

const eur = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

/**
 * Volcado del calendario anual de reservas.
 *
 * El calendario es la fuente buena, así que sustituye lo que hay en la app —
 * pero solo de los años que trae el fichero: los calendarios se suben de uno
 * en uno y subir el de 2026 no puede llevarse por delante lo de 2022 a 2025.
 *
 * Se enseña todo antes de tocar nada —cuántas entran, cuántas se van, cuáles
 * se pisan— y el botón no se activa hasta marcar que hay copia de seguridad.
 */
export default function ImportarReservas({ onClose }: { onClose: () => void }) {
  const { reservations, payments, prices, apartments, reemplazaReservas } = useData()
  const [previo, setPrevio] = useState<ResultadoCalendario | null>(null)
  const [nombreFichero, setNombreFichero] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [conCopia, setConCopia] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho] = useState('')
  const [error, setError] = useState('')

  const nombreApt = (id: string) => apartments.find(a => a.id === id)?.name || id

  /** Cada reserva del calendario, ya con el precio que le toca por tarifa. */
  const conPrecio = useMemo(() => (previo?.reservas ?? []).map(r => {
    const tarifa = buscaTarifa(prices, r.apartmentId, r.checkIn, r.nights)
    const limpieza = tarifa ? Number(tarifa.entry.cleaningFee) || 40 : 40
    return {
      ...r,
      basePrice: tarifa?.base ?? 0,
      cleaningFee: tarifa ? limpieza : 0,
      total: tarifa ? calcTotal(tarifa.base, limpieza, 0) : 0,
    }
  }), [previo, prices])

  const resumen = useMemo(() => {
    const porAnio = new Map<string, number>()
    const porApt = new Map<string, number>()
    for (const r of conPrecio) {
      porAnio.set(r.checkIn.slice(0, 4), (porAnio.get(r.checkIn.slice(0, 4)) || 0) + 1)
      porApt.set(r.apartmentId, (porApt.get(r.apartmentId) || 0) + 1)
    }
    return {
      porAnio: [...porAnio.entries()].sort(),
      porApt: [...porApt.entries()].sort((a, b) => b[1] - a[1]),
      solapadas: conPrecio.filter(r => r.solapada).length,
      deColor: conPrecio.filter(r => r.origen === 'color').length,
      sinPrecio: conPrecio.filter(r => r.total === 0).length,
      importe: conPrecio.reduce((s, r) => s + r.total, 0),
    }
  }, [conPrecio])

  /** Años que trae el fichero: solo se tocan las reservas de esos años. */
  const anios = useMemo(() => [...new Set(conPrecio.map(r => r.checkIn.slice(0, 4)))].sort(), [conPrecio])
  const aRetirar = useMemo(
    () => reservations.filter(r => anios.includes(r.checkIn.slice(0, 4))),
    [reservations, anios],
  )
  const seQuedan = reservations.length - aRetirar.length
  const cobrosARetirar = payments.filter(p => aRetirar.some(r => r.id === p.reservationId)).length

  async function elegir(f: File) {
    setError(''); setPrevio(null); setHecho(''); setNombreFichero(f.name); setLeyendo(true)
    try {
      const r = await leeCalendario(f)
      if (r.reservas.length === 0) {
        setError(r.avisos[0] || 'No se ha encontrado ninguna reserva en el fichero.')
      } else {
        setPrevio(r)
      }
    } catch {
      setError('No se ha podido leer el fichero. Debe ser el calendario en .xlsx.')
    }
    setLeyendo(false)
  }

  async function confirmar() {
    if (!previo) return
    setGuardando(true)
    try {
      const nuevas: Omit<Reservation, 'id' | 'createdAt'>[] = conPrecio.map(r => ({
        apartmentId: r.apartmentId,
        guestName: r.guestName,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        nights: r.nights,
        stayType: tramoPorNoches(r.nights),
        channel: 'inmobiliaria',
        basePrice: r.basePrice,
        cleaningFee: r.cleaningFee,
        discountPct: 0,
        total: r.total,
        status: 'completada',
        notes: r.origen === 'color' ? 'Del calendario; fechas tomadas del color de la casilla' : 'Del calendario',
      }))
      const { borradas, creadas } = await reemplazaReservas(nuevas, anios)
      setHecho(`${creadas} reservas cargadas (${anios.join(', ')}). Se han retirado las ${borradas} que había de esos años.`)
      setPrevio(null)
    } catch {
      setError('No se han podido guardar. Revisa la conexión y vuelve a intentarlo; los datos siguen como estaban.')
    }
    setGuardando(false)
  }

  return (
    <Modal title="Cargar el calendario de reservas" onClose={onClose} size="lg">
      <div className="space-y-4">
        {hecho ? (
          <div className="bg-green-50 border border-green-300 rounded-lg p-4 flex gap-3">
            <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={20} />
            <p className="text-sm font-medium text-green-900">{hecho}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Sube el calendario anual (<i>alquileres 2022 al 2025.xlsx</i>). Cada franja de
              color es una estancia; cuando la casilla trae las fechas escritas, se usan esas.
            </p>
            <label
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) elegir(f) }}
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
              <Upload size={22} className="text-slate-400" />
              <span className="text-sm font-medium text-slate-600">
                {leyendo ? 'Leyendo el calendario…' : nombreFichero || 'Elegir o arrastrar el .xlsx'}
              </span>
              <input type="file" accept=".xlsx" className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) elegir(f); e.target.value = '' }} />
            </label>
          </>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={16} />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {previo && (
          <>
            <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-3 gap-4 text-center" translate="no">
              <div>
                <p className="text-xs text-slate-500">Reservas</p>
                <p className="text-xl font-bold text-slate-800">{conPrecio.length}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Meses leídos</p>
                <p className="text-xl font-bold text-slate-800">{previo.meses}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Importe</p>
                <p className="text-xl font-bold text-blue-700">{eur(resumen.importe)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm" translate="no">
              <div className="border border-slate-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-600 mb-1.5">Por año</p>
                {resumen.porAnio.map(([a, n]) => (
                  <p key={a} className="flex justify-between text-slate-600">
                    <span>{a}</span><span className="font-medium text-slate-800">{n}</span>
                  </p>
                ))}
              </div>
              <div className="border border-slate-200 rounded-lg p-3">
                <p className="text-xs font-semibold text-slate-600 mb-1.5">Por inmueble</p>
                {resumen.porApt.map(([a, n]) => (
                  <p key={a} className="flex justify-between text-slate-600">
                    <span>{nombreApt(a)}</span><span className="font-medium text-slate-800">{n}</span>
                  </p>
                ))}
              </div>
            </div>

            {(resumen.solapadas > 0 || resumen.deColor > 0 || resumen.sinPrecio > 0) && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 space-y-1">
                {resumen.solapadas > 0 && (
                  <p className="text-sm text-amber-900">
                    <b>{resumen.solapadas} se pisan</b> con otra estancia del mismo inmueble. Entran igual,
                    pero conviene repasarlas después.
                  </p>
                )}
                {resumen.deColor > 0 && (
                  <p className="text-sm text-amber-900">
                    <b>{resumen.deColor}</b> no llevaban las fechas escritas: se han tomado del color de
                    las casillas y pueden bailar un día.
                  </p>
                )}
                {resumen.sinPrecio > 0 && (
                  <p className="text-sm text-amber-900">
                    <b>{resumen.sinPrecio} entran sin importe</b>: no hay tarifa cargada para esos años.
                    Se puede poner después a mano.
                  </p>
                )}
              </div>
            )}

            <div className="bg-red-50 border border-red-300 rounded-lg p-4">
              <p className="text-sm font-semibold text-red-900 flex items-center gap-2">
                <AlertTriangle size={16} /> Esto borra lo que hay ahora
              </p>
              <p className="text-sm text-red-900 mt-1">
                Solo se tocan los años que trae el fichero (<b>{anios.join(', ')}</b>): se retirarán{' '}
                <b>{aRetirar.length} reservas</b> y sus <b>{cobrosARetirar} cobros</b>, y en su lugar
                quedarán estas {conPrecio.length}. No se puede deshacer.
              </p>
              {seQuedan > 0 && (
                <p className="text-sm text-red-900 mt-1">
                  Las <b>{seQuedan}</b> de otros años se quedan como están.
                </p>
              )}
              <label className="flex items-center gap-2 mt-3 text-sm text-red-900 cursor-pointer">
                <input type="checkbox" checked={conCopia} onChange={e => setConCopia(e.target.checked)} />
                Tengo descargada la copia de seguridad
              </label>
            </div>
          </>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            {hecho ? 'Cerrar' : 'Cancelar'}
          </button>
          {previo && (
            <button onClick={confirmar} disabled={guardando || !conCopia}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-50">
              <CalendarRange size={15} />
              {guardando ? 'Cargando…' : `Sustituir por estas ${conPrecio.length}`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
