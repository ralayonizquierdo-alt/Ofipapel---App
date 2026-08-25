import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, ClipboardPaste, FileUp } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { analizaPegado, analizaAirbnb, analizaCobro, type LineaPegada } from '../lib/pegarReservas'
import { textoDePdf } from '../lib/leePdf'
import { esImagen, textoDeImagen, ErrorImagen } from '../lib/leeImagen'
import { buscaTarifa, calcTotal, tramoPorNoches } from '../lib/priceCalc'
import { formatDate } from '../lib/dateUtils'
import type { Reservation } from '../types'
import Modal from './ui/Modal'

const eur = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

const EJEMPLO = `Pega aquí el mensaje, tal cual llega:

ALAYON 104: entra 30/07/2026 y sale 13/08/2026.
ALAYON 105: entra 31/07/2026 y sale 10/08/2026.

O el aviso de reserva de Airbnb, tal cual lo copias de la aplicación.

O el justificante de una transferencia, o suelta su PDF.

También puedes soltar aquí la foto o captura del aviso: se lee sola.`

/**
 * Caja para dar de alta reservas y cobros pegando el mensaje que llega por
 * WhatsApp, sin teclear nada.
 *
 * Reconoce dos cosas distintas y sola: los avisos de entrada de la
 * inmobiliaria (varias reservas por mensaje) y los justificantes de
 * transferencia (un cobro). Nunca guarda sin enseñar antes qué va a guardar.
 */
export default function PegarWhatsApp({ onClose }: { onClose: () => void }) {
  return (
    <Modal title="Pegar desde WhatsApp" onClose={onClose} size="lg">
      <CajaPegar onClose={onClose} />
    </Modal>
  )
}

/**
 * El contenido, sin ventana. Se usa tal cual dentro del dashboard, donde tener
 * la caja a la vista ahorra un clic: llega el mensaje, se pega y listo.
 */
export function CajaPegar({ onClose, compacta = false }: { onClose?: () => void; compacta?: boolean }) {
  const {
    reservations, payments, apartments, prices,
    addReservation, addPayment, updatePayment, anotaVolcado,
  } = useData()
  const [texto, setTexto] = useState('')
  const [leyendo, setLeyendo] = useState<'pdf' | 'imagen' | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho] = useState('')
  const [error, setError] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const nombreApt = (id: string | null) => apartments.find(a => a.id === id)?.name || id || '¿?'

  // Tres formatos distintos, y se distinguen solos: un justificante de
  // transferencia trae importe; un aviso de Airbnb, sus propias señales; y lo
  // que no sea ninguna de las dos cosas, el mensaje suelto de la inmobiliaria.
  const cobro = useMemo(() => analizaCobro(texto), [texto])
  const airbnb = useMemo(() => (cobro ? null : analizaAirbnb(texto)), [texto, cobro])
  const lineas = useMemo(
    () => (cobro ? [] : airbnb ? [airbnb] : analizaPegado(texto)),
    [texto, cobro, airbnb],
  )

  /** Reservas listas para crear, con su precio calculado y sus avisos. */
  const propuestas = useMemo(() => lineas.map(l => {
    if (l.problema || !l.apartmentId || !l.checkIn || !l.checkOut) return { linea: l, total: 0, aviso: l.problema }
    const tarifa = buscaTarifa(prices, l.apartmentId, l.checkIn, l.nights)
    const choca = reservations.find(r =>
      r.apartmentId === l.apartmentId && r.status !== 'cancelada' &&
      r.checkIn < l.checkOut! && l.checkIn! < r.checkOut)
    return {
      linea: l,
      total: tarifa ? calcTotal(tarifa.base, Number(tarifa.entry.cleaningFee) || 40, 0) : 0,
      limpieza: tarifa ? Number(tarifa.entry.cleaningFee) || 40 : 40,
      base: tarifa?.base ?? 0,
      aviso: [
        !tarifa ? 'No hay precios cargados para esas fechas: se creará sin importe' : '',
        choca ? `Ya hay una reserva del ${formatDate(choca.checkIn)} al ${formatDate(choca.checkOut)}` : '',
        l.nota ?? '',
        // Airbnb nunca manda el precio, así que conviene decir de dónde sale.
        l.origen === 'airbnb' && tarifa ? 'El aviso de Airbnb no trae importe: es el de la tarifa' : '',
      ].filter(Boolean).join('. '),
    }
  }), [lineas, prices, reservations])

  /** Reserva a la que le corresponde el cobro: misma vivienda y fechas que pisan. */
  const reservaDelCobro = useMemo((): Reservation | null => {
    if (!cobro?.apartmentId) return null
    const candidatas = reservations.filter(r => r.apartmentId === cobro.apartmentId && r.status !== 'cancelada')
    if (cobro.periodoIni && cobro.periodoFin) {
      const dentro = candidatas.filter(r => r.checkIn < cobro.periodoFin! && cobro.periodoIni! < r.checkOut)
      if (dentro.length) return dentro.sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0]
    }
    if (cobro.paymentDate) {
      const futuras = candidatas.filter(r => r.checkOut >= cobro.paymentDate!)
      if (futuras.length) return futuras.sort((a, b) => a.checkIn.localeCompare(b.checkIn))[0]
    }
    return null
  }, [cobro, reservations])

  const validas = propuestas.filter(p => !p.linea.problema)

  /**
   * Único camino para un fichero, venga del botón, de un arrastre o del
   * portapapeles. Dos cosas valen: el PDF de un justificante y la foto o
   * captura de un aviso de reserva. De las dos sale texto, y a partir de ahí
   * todo lo demás funciona igual que si se hubiera pegado a mano.
   */
  async function leeFichero(f: File) {
    setError(''); setHecho('')
    const esPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf'
    if (!esPdf && !esImagen(f)) {
      setError(`«${f.name}» no vale: tiene que ser un PDF o una foto.`)
      return
    }
    setLeyendo(esPdf ? 'pdf' : 'imagen')
    try {
      setTexto(esPdf ? await textoDePdf(f) : await textoDeImagen(f))
    } catch (e) {
      setError(e instanceof ErrorImagen
        ? e.message
        : esPdf
          ? 'No se ha podido leer el PDF. Prueba a copiar el texto y pegarlo aquí.'
          : 'No se ha podido leer la imagen. Prueba a copiar el texto y pegarlo aquí.')
    }
    setLeyendo(null)
  }

  function elegirFichero(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) leeFichero(f)
    e.target.value = ''   // así se puede volver a elegir el mismo fichero
  }

  function guardarReservas() {
    setGuardando(true)
    let n = 0
    for (const p of validas) {
      const l = p.linea
      const res = addReservation({
        apartmentId: l.apartmentId!, guestName: l.guestName ?? '', checkIn: l.checkIn!, checkOut: l.checkOut!,
        nights: l.nights, stayType: tramoPorNoches(l.nights),
        channel: l.origen === 'airbnb' ? 'airbnb' : 'inmobiliaria',
        basePrice: p.base ?? 0, cleaningFee: p.limpieza ?? 40, discountPct: 0,
        total: p.total, status: 'confirmada',
        notes: `Alta desde ${l.origen === 'airbnb' ? 'el aviso de Airbnb' : 'el mensaje'}: ${l.texto}`,
      })
      addPayment({ reservationId: res.id, amount: p.total, received: false })
      n++
    }
    if (n) {
      anotaVolcado({
        origen: validas.some(p => p.linea.origen === 'airbnb') ? 'pegado-airbnb' : 'pegado-whatsapp',
        resumen: validas
          .map(p => `${nombreApt(p.linea.apartmentId)} ${formatDate(p.linea.checkIn!)} a ${formatDate(p.linea.checkOut!)}`)
          .join(' · '),
        year: Number(validas[0].linea.checkIn!.slice(0, 4)),
        reservas: n, cobros: n,
      })
    }
    setHecho(`${n} ${n === 1 ? 'reserva creada' : 'reservas creadas'}`)
    setTexto(''); setGuardando(false)
  }

  function guardarCobro() {
    if (!cobro || !reservaDelCobro) return
    setGuardando(true)
    // Si la reserva tiene un cobro pendiente, se aprovecha ese en vez de
    // añadir uno nuevo: si no, quedaría el pendiente por un lado y el cobrado
    // por otro, y la reserva parecería pagada de más.
    const pendiente = payments.find(p => p.reservationId === reservaDelCobro.id && !p.received)
    if (pendiente && Math.abs(pendiente.amount - cobro.amount) < 0.01) {
      updatePayment(pendiente.id, {
        received: true, paymentDate: cobro.paymentDate || undefined, paymentMethod: 'transferencia',
      })
    } else {
      if (pendiente) updatePayment(pendiente.id, { amount: Math.max(0, pendiente.amount - cobro.amount) })
      addPayment({
        reservationId: reservaDelCobro.id, amount: cobro.amount, received: true,
        paymentDate: cobro.paymentDate || undefined, paymentMethod: 'transferencia',
      })
    }
    anotaVolcado({
      origen: 'justificante',
      resumen: `${eur(cobro.amount)} en ${nombreApt(cobro.apartmentId)}, reserva del `
        + `${formatDate(reservaDelCobro.checkIn)} al ${formatDate(reservaDelCobro.checkOut)}`,
      year: Number((cobro.paymentDate ?? reservaDelCobro.checkIn).slice(0, 4)),
      cobros: 1,
    })
    setHecho(`Cobro de ${eur(cobro.amount)} anotado en ${nombreApt(cobro.apartmentId)}`)
    setTexto(''); setGuardando(false)
  }

  return (
    <div className="space-y-4">
        {hecho && (
          <div className="bg-green-50 border border-green-300 rounded-lg p-3 flex gap-2.5">
            <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={18} />
            <p className="text-sm font-medium text-green-900">{hecho}</p>
          </div>
        )}

        {/* Se puede escribir, pegar o soltar el PDF encima: las tres cosas
            acaban en el mismo sitio. Los manejadores van en el envoltorio para
            que valga soltar en cualquier punto, no solo sobre el recuadro. */}
        <div
          onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
          onDragLeave={e => { e.preventDefault(); setArrastrando(false) }}
          onDrop={e => {
            e.preventDefault(); setArrastrando(false)
            const f = e.dataTransfer.files?.[0]
            if (f) leeFichero(f)
          }}
          className="relative"
        >
          <textarea
            ref={areaRef}
            value={texto}
            onChange={e => { setTexto(e.target.value); setHecho(''); setError('') }}
            onPaste={e => {
              // Algunos gestores de correo y el propio móvil pegan el PDF como
              // fichero en vez de como texto.
              const f = [...e.clipboardData.files][0]
              if (f) { e.preventDefault(); leeFichero(f) }
            }}
            rows={compacta ? 3 : 6}
            placeholder={EJEMPLO}
            className={`w-full border rounded-lg px-3 py-2.5 text-sm font-mono leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 ${
              arrastrando ? 'border-blue-500 bg-blue-50/60' : 'border-slate-200'
            }`}
          />
          {arrastrando && (
            <div className="absolute inset-0 rounded-lg bg-blue-50/90 border-2 border-dashed border-blue-400 flex items-center justify-center pointer-events-none">
              <p className="text-sm font-medium text-blue-700">Suelta aquí el PDF o la foto</p>
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg text-xs text-slate-600 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40">
            <FileUp size={15} className="text-slate-400" />
            {leyendo === 'pdf' ? 'Leyendo el PDF…'
              : leyendo === 'imagen' ? 'Leyendo la foto…'
              : 'Elegir un PDF o una foto'}
            {/* «capture» hace que en el móvil salga directamente la cámara
                además del carrete, que es de donde vendrá la captura. */}
            <input type="file" accept=".pdf,image/*" className="hidden" onChange={elegirFichero} />
          </label>
          <span className="text-xs text-slate-400">o arrástralo sobre el recuadro</span>
          {texto && (
            <button onClick={() => { setTexto(''); setHecho(''); areaRef.current?.focus() }}
              className="text-xs text-slate-400 hover:text-slate-600 ml-auto">Limpiar</button>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={16} />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {/* ── Un justificante de transferencia ── */}
        {cobro && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <div className="bg-slate-50 px-4 py-2 border-b border-slate-200">
              <p className="text-xs font-semibold text-slate-700">Cobro detectado</p>
            </div>
            <div className="p-4 space-y-1.5 text-sm" translate="no">
              <p className="flex justify-between">
                <span className="text-slate-500">Importe</span>
                <span className="font-bold text-blue-700">{eur(cobro.amount)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-slate-500">Apartamento</span>
                <span className="text-slate-800">{nombreApt(cobro.apartmentId)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-slate-500">Fecha del pago</span>
                <span className="text-slate-800">{cobro.paymentDate ? formatDate(cobro.paymentDate) : 'sin fecha'}</span>
              </p>
              <p className="flex justify-between gap-4">
                <span className="text-slate-500 shrink-0">Concepto</span>
                <span className="text-slate-500 text-xs text-right">{cobro.concepto}</span>
              </p>
              <div className="pt-2 mt-1 border-t border-slate-100">
                {reservaDelCobro ? (
                  <p className="text-sm text-slate-700">
                    Se anotará en la reserva del{' '}
                    <b>{formatDate(reservaDelCobro.checkIn)}</b> al{' '}
                    <b>{formatDate(reservaDelCobro.checkOut)}</b>.
                  </p>
                ) : (
                  <p className="text-sm text-amber-800">
                    {cobro.problema || 'No hay ninguna reserva de esas fechas: créala primero y vuelve a pegar el justificante.'}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Un aviso de entradas ── */}
        {!cobro && propuestas.length > 0 && (
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            {/* En el móvil la tabla no cabe: que se pueda arrastrar, porque si
                solo se recorta el aviso de la fila se queda ilegible. */}
            <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[30rem]">
              <thead className="bg-slate-50 border-b border-slate-200">
                <tr>
                  <th className="text-left py-2 px-3 font-medium text-slate-600">Apartamento</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600">Entrada</th>
                  <th className="text-left py-2 px-3 font-medium text-slate-600">Salida</th>
                  <th className="text-right py-2 px-3 font-medium text-slate-600">Noches</th>
                  <th className="text-right py-2 px-3 font-medium text-slate-600">Precio</th>
                </tr>
              </thead>
              <tbody translate="no">
                {propuestas.map((p, i) => (
                  <Fila key={i} p={p} nombreApt={nombreApt} />
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        <div className="flex justify-end gap-3 pt-1">
          {onClose && (
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
              Cerrar
            </button>
          )}
          {cobro ? (
            <button onClick={guardarCobro} disabled={guardando || !reservaDelCobro}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50">
              Anotar el cobro
            </button>
          ) : validas.length > 0 && (
            <button onClick={guardarReservas} disabled={guardando}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60">
              <ClipboardPaste size={15} />
              {guardando ? 'Creando…' : `Crear ${validas.length} ${validas.length === 1 ? 'reserva' : 'reservas'}`}
            </button>
          )}
        </div>
    </div>
  )
}

interface Propuesta {
  linea: LineaPegada
  total: number
  aviso: string
}

function Fila({ p, nombreApt }: { p: Propuesta; nombreApt: (id: string | null) => string }) {
  const { linea: l } = p
  const malo = !!l.problema
  return (
    <>
      <tr className={`border-b border-slate-100 ${malo ? 'bg-red-50/60' : ''}`}>
        <td className="py-2 px-3 font-medium text-slate-700">
          {nombreApt(l.apartmentId)}
          {l.guestName && <span className="block text-xs font-normal text-slate-500">{l.guestName}</span>}
          {l.origen === 'airbnb' && (
            <span className="inline-block mt-0.5 text-[10px] font-medium text-rose-700 bg-rose-100 px-1.5 py-0.5 rounded">Airbnb</span>
          )}
        </td>
        <td className="py-2 px-3 text-slate-600">{l.checkIn ? formatDate(l.checkIn) : '—'}</td>
        <td className="py-2 px-3 text-slate-600">{l.checkOut ? formatDate(l.checkOut) : '—'}</td>
        <td className="py-2 px-3 text-right text-slate-600">{l.nights || '—'}</td>
        <td className="py-2 px-3 text-right font-semibold text-slate-800">{p.total ? eur(p.total) : '—'}</td>
      </tr>
      {p.aviso && (
        <tr className={malo ? 'bg-red-50/60' : 'bg-amber-50/60'}>
          <td colSpan={5} className={`py-1.5 px-3 text-xs ${malo ? 'text-red-800' : 'text-amber-800'}`}>
            {malo ? `${p.aviso} — «${l.texto}»` : `Ojo: ${p.aviso}`}
          </td>
        </tr>
      )}
    </>
  )
}
