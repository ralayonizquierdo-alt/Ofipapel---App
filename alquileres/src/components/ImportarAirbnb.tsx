import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Link2, Upload } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import {
  cuadraInformeAirbnb, leeInformeAirbnb, memoriaAirbnb, sinMemoriaAirbnb,
  type AccionAirbnb, type CuadreAirbnb, type ResultadoAirbnb,
} from '../lib/importarAirbnb'
import { tramoPorNoches } from '../lib/priceCalc'
import { today } from '../lib/dateUtils'
import { eur } from '../lib/formato'
import Modal from './ui/Modal'

/**
 * Subir el informe anual de la gestora del Arenal (SOC Properties / Airbnb).
 *
 * Es el único inmueble cuyos importes no vienen en el Excel maestro, porque el
 * dinero lo cobra Airbnb y nos lo transfiere la gestora ya descontadas sus
 * comisiones. Sus reservas estaban en la aplicación con importe 0,00 € y los
 * cobros del banco no tenían estancia a la que agarrarse: esto tapa esa laguna.
 *
 * Se enseña todo antes de guardar nada: qué reservas se crean, a cuáles se les
 * pone el importe, qué cobros se enlazan por importe y —lo que de verdad
 * interesa— qué estancias ya terminadas siguen sin cobro anotado.
 *
 * No da de alta las comisiones como gasto a propósito: el importe que se guarda
 * es el NETO, así que apuntar además la comisión la descontaría dos veces.
 */

const ETIQUETA: Record<AccionAirbnb, { texto: string; clase: string }> = {
  nueva:   { texto: 'nueva',           clase: 'bg-blue-100 text-blue-800' },
  rellena: { texto: 'pone el importe', clase: 'bg-green-100 text-green-800' },
  cambia:  { texto: 'cambia importe',  clase: 'bg-amber-100 text-amber-800' },
  igual:   { texto: 'ya estaba',       clase: 'bg-slate-100 text-slate-600' },
}

export default function ImportarAirbnb({ onClose }: { onClose: () => void }) {
  const {
    apartments, reservations, payments,
    addReservation, updateReservation, updatePayment, anotaVolcado,
  } = useData()

  // El Arenal es el inmueble de Airbnb; si algún día hay otro, se elige aquí.
  const porDefecto = useMemo(() => {
    const deAirbnb = reservations.find(r => r.channel === 'airbnb')?.apartmentId
    return deAirbnb ?? (apartments.find(a => a.id === 'AP2B') ? 'AP2B' : apartments[0]?.id ?? '')
  }, [reservations, apartments])

  const [aptId, setAptId] = useState(porDefecto)
  const [leido, setLeido] = useState<ResultadoAirbnb | null>(null)
  const [nombreFichero, setNombreFichero] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho] = useState('')
  const [error, setError] = useState('')

  const hoy = today()
  const cuadre: CuadreAirbnb | null = useMemo(
    () => (leido ? cuadraInformeAirbnb(leido.estancias, aptId, reservations, payments, hoy) : null),
    [leido, aptId, reservations, payments, hoy],
  )

  const porHacer = cuadre
    ? cuadre.totales.nuevas + cuadre.totales.rellenadas + cuadre.totales.cambiadas + cuadre.totales.enlaces
    : 0

  async function elegir(f: File) {
    setError(''); setLeido(null); setHecho(''); setNombreFichero(f.name); setLeyendo(true)
    try {
      const r = leeInformeAirbnb(await f.text())
      if (r.estancias.length === 0) setError(r.avisos[0] || 'No se ha encontrado ninguna estancia.')
      else setLeido(r)
    } catch {
      setError('No se ha podido leer el fichero. Debe ser el informe anual en HTML.')
    }
    setLeyendo(false)
  }

  function guardar() {
    if (!cuadre || !leido) return
    setGuardando(true)
    try {
      let nuevas = 0, puestas = 0, enlazados = 0
      for (const c of cuadre.casos) {
        const e = c.estancia
        const memoria = memoriaAirbnb(e, leido.anio)
        // La limpieza va a 0: la que cobra Airbnb se la queda la gestora.
        const importes = { basePrice: e.neto, cleaningFee: 0, total: e.neto, discountPct: 0 }
        let reservaId = c.reserva?.id

        if (!c.reserva) {
          const creada = addReservation({
            apartmentId: aptId,
            guestName: e.huesped || undefined,
            checkIn: e.checkIn,
            checkOut: e.checkOut,
            nights: e.noches,
            stayType: tramoPorNoches(e.noches),
            channel: 'airbnb',
            ...importes,
            status: e.checkOut <= hoy ? 'completada' : 'confirmada',
            notes: memoria,
          })
          reservaId = creada.id
          nuevas++
        } else {
          const antes = c.reserva
          const notas = [sinMemoriaAirbnb(antes.notes), memoria].filter(Boolean).join(' · ')
          updateReservation(antes.id, {
            ...importes,
            checkIn: e.checkIn,
            checkOut: e.checkOut,
            nights: e.noches,
            guestName: e.huesped || antes.guestName,
            notes: notas,
          })
          if (c.accion !== 'igual') puestas++
        }

        for (const p of c.porEnlazar) {
          updatePayment(p.id, { reservationId: reservaId!, apartmentId: aptId })
          enlazados++
        }
      }

      // Después de guardar: en el registro solo figura lo que entró de verdad.
      anotaVolcado({
        origen: 'informe-airbnb',
        resumen: `${cuadre.casos.length} estancias del Arenal por ${eur(cuadre.totales.neto)} netos`
          + (nuevas ? `; ${nuevas} reservas nuevas` : '')
          + (puestas ? `; ${puestas} con su importe` : '')
          + (enlazados ? `; ${enlazados} cobros enlazados` : ''),
        fileName: nombreFichero || 'sin nombre',
        year: leido.anio,
        reservas: nuevas + puestas,
        cobros: enlazados,
      })

      setHecho(`${nuevas + puestas} reservas con su importe (${nuevas} nuevas) y ${enlazados} cobros enlazados.`
        + (cuadre.totales.pendienteVencido > 0
          ? ` Siguen sin cobro anotado ${eur(cuadre.totales.pendienteVencido)} de estancias ya terminadas.`
          : ' Todo lo terminado está cobrado.'))
      setLeido(null)
    } catch {
      setError('No se ha podido guardar. Revisa la conexión; los datos siguen como estaban.')
    }
    setGuardando(false)
  }

  return (
    <Modal title="Subir el informe anual de Airbnb" onClose={onClose} size="lg">
      <div className="space-y-4">
        {hecho ? (
          <div className="bg-green-50 border border-green-300 rounded-lg p-4 flex gap-3">
            <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={20} />
            <p className="text-sm font-medium text-green-900">{hecho}</p>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              El informe que manda la gestora (<i>informe_anual_2026.html</i>). Trae cada estancia
              con su bruto, las comisiones y <b>el neto que nos llega</b>, que es lo que no viene en
              el Excel. Se guarda el neto como importe de la reserva; la limpieza que cobra Airbnb
              se la queda la gestora, así que no se apunta.
            </p>
            <div className="flex items-center gap-2">
              <label className="text-sm text-slate-600">Inmueble:</label>
              <select value={aptId} onChange={e => setAptId(e.target.value)}
                className="border border-slate-200 rounded-lg px-3 py-1.5 text-sm bg-white">
                {apartments.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <label
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) elegir(f) }}
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
              <Upload size={22} className="text-slate-400" />
              <span className="text-sm font-medium text-slate-600">
                {leyendo ? 'Leyendo el informe…' : nombreFichero || 'Elegir o arrastrar el .html'}
              </span>
              <input type="file" accept=".html,.htm" className="hidden"
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

        {leido && cuadre && (
          <>
            <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center" translate="no">
              <div>
                <p className="text-xs text-slate-500">Estancias</p>
                <p className="text-xl font-bold text-slate-800">{cuadre.casos.length}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Neto del informe</p>
                <p className="text-xl font-bold text-blue-700">{eur(cuadre.totales.neto)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Ya cobrado</p>
                <p className="text-xl font-bold text-green-700">{eur(cuadre.totales.cobrado)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Sin cobrar, ya vencido</p>
                <p className={`text-xl font-bold ${cuadre.totales.pendienteVencido > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                  {eur(cuadre.totales.pendienteVencido)}
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-500">
              Van a entrar <b>{cuadre.totales.nuevas}</b> reservas nuevas, se les pone el importe a{' '}
              <b>{cuadre.totales.rellenadas}</b> que estaban a cero
              {cuadre.totales.cambiadas > 0 && <>, se le cambia a <b>{cuadre.totales.cambiadas}</b></>}
              {' '}y se enlazan <b>{cuadre.totales.enlaces}</b> cobros que hasta ahora no colgaban de
              ninguna estancia. De las que están por venir quedan{' '}
              {eur(cuadre.totales.pendienteFuturo)} por cobrar, que es lo normal.
            </p>

            {leido.avisos.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 space-y-1">
                {leido.avisos.map((a, i) => <p key={i} className="text-sm text-amber-900">{a}</p>)}
              </div>
            )}

            <div className="border border-slate-200 rounded-lg overflow-auto max-h-80">
              <table className="w-full text-xs" translate="no">
                <thead className="bg-slate-50 text-slate-500 sticky top-0">
                  <tr>
                    <th className="text-left py-2 px-2 font-medium">Estancia</th>
                    <th className="text-left py-2 px-2 font-medium">Huésped</th>
                    <th className="text-right py-2 px-2 font-medium">Neto</th>
                    <th className="text-right py-2 px-2 font-medium">Cobrado</th>
                    <th className="text-left py-2 px-2 font-medium">Qué se hace</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {cuadre.casos.map((c, i) => (
                    <tr key={i} className="border-t border-slate-100">
                      <td className="py-1.5 px-2 whitespace-nowrap text-slate-600">
                        {c.estancia.checkIn.slice(8)}/{c.estancia.checkIn.slice(5, 7)} al{' '}
                        {c.estancia.checkOut.slice(8)}/{c.estancia.checkOut.slice(5, 7)}
                        <span className="text-slate-400"> · {c.estancia.noches}N</span>
                      </td>
                      <td className="py-1.5 px-2 text-slate-700">
                        {c.estancia.huesped}
                        {c.estancia.enEfectivo && <span className="ml-1 text-green-700">· efectivo</span>}
                      </td>
                      <td className="py-1.5 px-2 text-right font-medium text-slate-800 whitespace-nowrap">{eur(c.estancia.neto)}</td>
                      <td className="py-1.5 px-2 text-right text-slate-600 whitespace-nowrap">
                        {c.cobrado ? eur(c.cobrado) : <span className="text-slate-300">—</span>}
                        {c.pendiente > 0.02 && (
                          <span className={c.estancia.checkOut <= hoy ? 'block text-amber-700' : 'block text-slate-400'}>
                            falta {eur(c.pendiente)}
                          </span>
                        )}
                        {c.pendiente < -0.02 && (
                          <span className="block text-blue-700">+{eur(-c.pendiente)} de más</span>
                        )}
                      </td>
                      <td className="py-1.5 px-2">
                        <span className={`px-1.5 py-0.5 rounded ${ETIQUETA[c.accion].clase}`}>
                          {ETIQUETA[c.accion].texto}
                        </span>
                        {c.porEnlazar.length > 0 && (
                          <span className="ml-1 inline-flex items-center gap-0.5 text-violet-700">
                            <Link2 size={11} /> {c.porEnlazar.length} cobro{c.porEnlazar.length > 1 ? 's' : ''}
                          </span>
                        )}
                        {c.avisos.map((a, k) => (
                          <span key={k} className="block text-amber-700 mt-0.5">{a}</span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {cuadre.huerfanos.length > 0 && (
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
                <p className="text-sm text-slate-700">
                  <b>{cuadre.huerfanos.length} cobros</b> del inmueble no cuadran con ninguna estancia
                  del informe. Se quedan como están.
                </p>
                <div className="mt-1 space-y-0.5" translate="no">
                  {cuadre.huerfanos.slice(0, 8).map(p => (
                    <p key={p.id} className="text-xs text-slate-500">
                      {p.mes || p.paymentDate || 'sin fecha'} · {eur(p.amount)}
                      {p.entryNumber && ` · asiento ${p.entryNumber}`}
                    </p>
                  ))}
                  {cuadre.huerfanos.length > 8 && (
                    <p className="text-xs text-slate-400">y {cuadre.huerfanos.length - 8} más</p>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs text-slate-500">
              Los cobros no se inventan: si una estancia terminada no tiene su transferencia anotada,
              queda como pendiente para reclamársela a la gestora. Las comisiones tampoco se dan de
              alta como gasto —el importe ya va neto—, pero quedan escritas en las observaciones de
              cada reserva.
            </p>
          </>
        )}

        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            {hecho ? 'Cerrar' : 'Cancelar'}
          </button>
          {leido && cuadre && (
            <button onClick={guardar} disabled={guardando || porHacer === 0}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
              <CheckCircle2 size={15} />
              {guardando ? 'Guardando…' : porHacer === 0 ? 'No hay nada que cambiar' : `Aplicar (${porHacer})`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
