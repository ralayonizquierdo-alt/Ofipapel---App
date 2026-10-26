import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, Clipboard, ClipboardPaste, FileUp, Ban } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { analizaPegado, analizaAirbnb, analizaAnulacion, analizaCobro, type LineaPegada } from '../lib/pegarReservas'
import { textoDePdf } from '../lib/leePdf'
import { esImagen, textoDeImagen, ErrorImagen } from '../lib/leeImagen'
import { subeJustificante, ErrorJustificante, tamanoLegible } from '../lib/justificantes'
import { buscaTarifa, calcTotal, tramoPorNoches } from '../lib/priceCalc'
import { formatDate } from '../lib/dateUtils'
import type { Reservation } from '../types'
import Modal from './ui/Modal'
import { num } from '../lib/formato'

const eur = (n: number) =>
  `${num(n, 2)} €`

const EJEMPLO = `Pega aquí el mensaje, tal cual llega:

ALAYON 104: entra 30/07/2026 y sale 13/08/2026.
ALAYON 105: entra 31/07/2026 y sale 10/08/2026.

O el aviso de reserva de Airbnb, tal cual lo copias de la aplicación.

O el aviso de que una reserva se ha anulado: se busca y se marca.

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
    reservations, payments, apartments, prices, offerPrices,
    addReservation, updateReservation, addPayment, updatePayment, anotaVolcado,
  } = useData()
  const [texto, setTexto] = useState('')
  const [leyendo, setLeyendo] = useState<'pdf' | 'imagen' | null>(null)
  /** El PDF o la foto de la que salió el texto, para poder archivarla. */
  const [fichero, setFichero] = useState<File | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho] = useState('')
  const [error, setError] = useState('')
  const areaRef = useRef<HTMLTextAreaElement>(null)

  const nombreApt = (id: string | null) => apartments.find(a => a.id === id)?.name || id || '¿?'

  // Cuatro formatos distintos, y se distinguen solos. La anulación se mira
  // antes que nada: trae fechas y vivienda igual que un alta, y leerla como un
  // alta daría de alta otra vez la reserva que se acaba de caer.
  const anulacion = useMemo(() => analizaAnulacion(texto), [texto])
  const cobro = useMemo(() => (anulacion ? null : analizaCobro(texto)), [texto, anulacion])
  const airbnb = useMemo(() => (anulacion || cobro ? null : analizaAirbnb(texto)), [texto, cobro, anulacion])
  const lineas = useMemo(
    () => (anulacion || cobro ? [] : airbnb ? [airbnb] : analizaPegado(texto)),
    [texto, cobro, airbnb, anulacion],
  )

  /**
   * Las reservas que pueden ser la que se anula.
   *
   * Primero la que cuadra al día; si no hay, las que empiezan o acaban a un par
   * de días (un aviso puede traer la fecha del cambio de huésped y no la del
   * contrato); y en último caso cualquiera de ese apartamento que pise esas
   * fechas. Nunca se elige sola si hay más de una.
   */
  const candidatas = useMemo((): Reservation[] => {
    if (!anulacion?.apartmentId || !anulacion.checkIn || !anulacion.checkOut) return []
    const { apartmentId, checkIn, checkOut } = anulacion
    const suyas = reservations.filter(r => r.apartmentId === apartmentId && r.status !== 'cancelada')
    const exactas = suyas.filter(r => r.checkIn === checkIn && r.checkOut === checkOut)
    if (exactas.length) return exactas
    const dias = (a: string, b: string) =>
      Math.abs(Date.parse(a) - Date.parse(b)) / 86400000
    const cerca = suyas.filter(r => dias(r.checkIn, checkIn) <= 2 && dias(r.checkOut, checkOut) <= 2)
    if (cerca.length) return cerca
    return suyas
      .filter(r => r.checkIn < checkOut && checkIn < r.checkOut)
      .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
  }, [anulacion, reservations])

  /** Cuál de las candidatas se va a anular. Con una sola, esa. */
  const [elegida, setElegida] = useState<string>('')
  const aAnular = candidatas.find(r => r.id === elegida) ?? (candidatas.length === 1 ? candidatas[0] : null)

  /** Reservas listas para crear, con su precio calculado y sus avisos. */
  const propuestas = useMemo(() => lineas.map(l => {
    if (l.problema || !l.apartmentId || !l.checkIn || !l.checkOut) return { linea: l, total: 0, aviso: l.problema }
    const tarifa = buscaTarifa(prices, l.apartmentId, l.checkIn, l.nights, offerPrices)
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
  }), [lineas, prices, offerPrices, reservations])

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
   * Trae de un toque lo que haya copiado.
   *
   * En el móvil, y sobre todo en el iPhone, pegar a mano es un acertijo: hay
   * que tocar el recuadro para poner el cursor y volver a tocar para que
   * salga «Pegar». Con esto es un botón. Safari pide permiso la primera vez,
   * y eso no se puede evitar: lo decide el navegador, no la aplicación.
   */
  async function pegaDelPortapapeles() {
    setError(''); setHecho('')
    try {
      const t = await navigator.clipboard.readText()
      if (!t.trim()) { setError('No hay nada copiado.'); return }
      setTexto(t)
      areaRef.current?.focus()
    } catch {
      setError('El navegador no ha dejado pegar. Toca dentro del recuadro, vuelve a tocar y elige «Pegar».')
    }
  }

  /**
   * Único camino para un fichero, venga del botón, de un arrastre o del
   * portapapeles. Dos cosas valen: el PDF de un justificante y la foto o
   * captura de un aviso de reserva. De las dos sale texto, y a partir de ahí
   * todo lo demás funciona igual que si se hubiera pegado a mano.
   */
  async function leeFichero(f: File) {
    setError(''); setHecho(''); setFichero(null)
    const esPdf = /\.pdf$/i.test(f.name) || f.type === 'application/pdf'
    if (!esPdf && !esImagen(f)) {
      setError(`«${f.name}» no vale: tiene que ser un PDF o una foto.`)
      return
    }
    setLeyendo(esPdf ? 'pdf' : 'imagen')
    try {
      setTexto(esPdf ? await textoDePdf(f) : await textoDeImagen(f))
      // Se guarda el fichero, no solo lo que se ha leído de él: si resulta ser
      // un justificante, al anotar el cobro se sube y queda el papel.
      setFichero(f)
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
        apartmentId: l.apartmentId!, guestName: l.guestName ?? '', guests: l.guests, checkIn: l.checkIn!, checkOut: l.checkOut!,
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
    setTexto(''); setFichero(null); setGuardando(false)
  }

  /**
   * Marca la reserva como anulada. **No borra nada**: la reserva se queda con
   * sus cobros y su historial, deja de ocupar el apartamento y sale del
   * planning. Lo que ya se hubiera cobrado se devuelve o no por otro lado;
   * eso no lo decide la aplicación.
   */
  function anularReserva() {
    if (!anulacion || !aAnular) return
    setGuardando(true)
    const sello = `Anulada el ${formatDate(new Date().toISOString().slice(0, 10))}`
      + (anulacion.codigo ? ` (reserva ${anulacion.codigo})` : '')
      + ` desde el aviso: ${anulacion.texto}`
    updateReservation(aAnular.id, {
      status: 'cancelada',
      notes: [aAnular.notes, sello].filter(Boolean).join(' · '),
    })
    anotaVolcado({
      origen: 'anulacion',
      resumen: `${nombreApt(aAnular.apartmentId)}, reserva del ${formatDate(aAnular.checkIn)} `
        + `al ${formatDate(aAnular.checkOut)} marcada como anulada`,
      year: Number(aAnular.checkIn.slice(0, 4)),
      reservas: 1,
    })
    const cobrado = payments
      .filter(p => p.reservationId === aAnular.id && p.received)
      .reduce((s, p) => s + p.amount, 0)
    setHecho(`Reserva anulada: ${nombreApt(aAnular.apartmentId)}, del ${formatDate(aAnular.checkIn)} `
      + `al ${formatDate(aAnular.checkOut)}`
      + (cobrado > 0 ? `. Ojo: tiene ${eur(cobrado)} ya cobrados, míralo` : ''))
    setTexto(''); setFichero(null); setElegida(''); setGuardando(false)
  }

  async function guardarCobro() {
    if (!cobro || !reservaDelCobro) return
    setGuardando(true)

    // El papel primero: si falla la subida, se dice y el cobro se anota igual.
    // Perder el documento es malo; perder también el cobro sería peor.
    let papel: { url: string; nombre: string } | null = null
    if (fichero) {
      try {
        const j = await subeJustificante(fichero, cobro.paymentDate || undefined)
        papel = { url: j.url, nombre: j.nombre }
      } catch (e) {
        setError(e instanceof ErrorJustificante ? e.message
          : 'No se ha podido guardar el justificante; el cobro sí se anota.')
      }
    }
    const conPapel = papel
      ? { justificanteUrl: papel.url, justificanteNombre: papel.nombre }
      : {}
    // Si la reserva tiene un cobro pendiente, se aprovecha ese en vez de
    // añadir uno nuevo: si no, quedaría el pendiente por un lado y el cobrado
    // por otro, y la reserva parecería pagada de más.
    const pendiente = payments.find(p => p.reservationId === reservaDelCobro.id && !p.received)
    if (pendiente && Math.abs(pendiente.amount - cobro.amount) < 0.01) {
      updatePayment(pendiente.id, {
        received: true, paymentDate: cobro.paymentDate || undefined, paymentMethod: 'transferencia',
        ...conPapel,
      })
    } else {
      if (pendiente) updatePayment(pendiente.id, { amount: Math.max(0, pendiente.amount - cobro.amount) })
      addPayment({
        reservationId: reservaDelCobro.id, amount: cobro.amount, received: true,
        paymentDate: cobro.paymentDate || undefined, paymentMethod: 'transferencia',
        ...conPapel,
      })
    }
    anotaVolcado({
      origen: 'justificante',
      resumen: `${eur(cobro.amount)} en ${nombreApt(cobro.apartmentId)}, reserva del `
        + `${formatDate(reservaDelCobro.checkIn)} al ${formatDate(reservaDelCobro.checkOut)}`,
      year: Number((cobro.paymentDate ?? reservaDelCobro.checkIn).slice(0, 4)),
      cobros: 1,
      ...conPapel,
    })
    setHecho(`Cobro de ${eur(cobro.amount)} anotado en ${nombreApt(cobro.apartmentId)}`
      + (papel ? ` · justificante guardado (${papel.nombre})` : ''))
    setTexto(''); setFichero(null); setGuardando(false)
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

        <div className="flex items-center gap-3 flex-wrap">
          {/* Solo si el navegador sabe leer el portapapeles: si no, el botón
              prometería algo que no puede cumplir. */}
          {typeof navigator !== 'undefined' && !!navigator.clipboard?.readText && (
            <button type="button" onClick={pegaDelPortapapeles}
              className="flex items-center gap-2 px-3 py-2 border border-slate-300 rounded-lg text-xs font-medium text-slate-700 bg-white hover:border-blue-400 hover:text-blue-700 whitespace-nowrap">
              <Clipboard size={15} className="text-slate-400" />
              Pegar lo copiado
            </button>
          )}
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

        {/* ── Un aviso de anulación ── */}
        {anulacion && (
          <div className="border-2 border-amber-300 rounded-lg overflow-hidden">
            <div className="bg-amber-50 px-4 py-2 border-b border-amber-200 flex items-center gap-2">
              <Ban size={15} className="text-amber-700 shrink-0" />
              <p className="text-xs font-semibold text-amber-900">Aviso de anulación</p>
            </div>
            <div className="p-4 space-y-1.5 text-sm" translate="no">
              <p className="flex justify-between">
                <span className="text-slate-500">Apartamento</span>
                <span className="text-slate-800">{nombreApt(anulacion.apartmentId)}</span>
              </p>
              <p className="flex justify-between">
                <span className="text-slate-500">Fechas del aviso</span>
                <span className="text-slate-800">
                  {anulacion.checkIn ? formatDate(anulacion.checkIn) : '—'} → {anulacion.checkOut ? formatDate(anulacion.checkOut) : '—'}
                </span>
              </p>
              {(anulacion.guestName || anulacion.codigo) && (
                <p className="flex justify-between">
                  <span className="text-slate-500">Reserva</span>
                  <span className="text-slate-800">
                    {[anulacion.guestName, anulacion.codigo].filter(Boolean).join(' · ')}
                  </span>
                </p>
              )}
              {anulacion.nota && <p className="text-xs text-amber-800">{anulacion.nota}</p>}

              <div className="pt-2 mt-1 border-t border-slate-100">
                {anulacion.problema ? (
                  <p className="text-sm text-red-800">{anulacion.problema}</p>
                ) : candidatas.length === 0 ? (
                  <p className="text-sm text-amber-800">
                    No hay ninguna reserva de esas fechas sin anular en {nombreApt(anulacion.apartmentId)}.
                    Puede que ya estuviera anulada.
                  </p>
                ) : candidatas.length === 1 ? (
                  <p className="text-sm text-slate-700">
                    Se marcará como anulada la reserva del{' '}
                    <b>{formatDate(candidatas[0].checkIn)}</b> al{' '}
                    <b>{formatDate(candidatas[0].checkOut)}</b>
                    {candidatas[0].guestName ? <> de <b>{candidatas[0].guestName}</b></> : null}.
                    No se borra: se queda con sus cobros y su historial.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-slate-700 mb-2">
                      Hay {candidatas.length} reservas que pueden ser. Elige cuál:
                    </p>
                    <div className="space-y-1.5">
                      {candidatas.map(r => (
                        <label key={r.id}
                          className={`flex items-center gap-2 text-sm border rounded-lg px-3 py-2 cursor-pointer ${
                            aAnular?.id === r.id ? 'border-amber-400 bg-amber-50' : 'border-slate-200 hover:bg-slate-50'
                          }`}>
                          <input type="radio" name="anular" checked={aAnular?.id === r.id}
                            onChange={() => setElegida(r.id)} />
                          <span>
                            {formatDate(r.checkIn)} → {formatDate(r.checkOut)} · {r.nights}-N
                            {r.guestName ? ` · ${r.guestName}` : ''}
                          </span>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
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
              {/* El papel que se va a archivar. Solo lo hay si el texto vino de
                  un fichero: lo pegado a mano no tiene documento detrás. */}
              <p className="flex justify-between gap-4">
                <span className="text-slate-500 shrink-0">Justificante</span>
                {fichero ? (
                  <span className="text-emerald-700 text-xs text-right">
                    se guardará <b>{fichero.name}</b> ({tamanoLegible(fichero.size)})
                  </span>
                ) : (
                  <span className="text-amber-700 text-xs text-right">
                    no hay documento: se anota solo la cifra
                  </span>
                )}
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
          {anulacion ? (
            <button onClick={anularReserva} disabled={guardando || !aAnular}
              className="flex items-center gap-2 px-4 py-2 text-sm bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium disabled:opacity-50">
              <Ban size={15} />
              {guardando ? 'Anulando…' : 'Marcar como anulada'}
            </button>
          ) : cobro ? (
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
          {(l.guestName || l.guests) && (
            <span className="block text-xs font-normal text-slate-500">
              {[l.guestName, l.guests ? `${l.guests} personas` : ''].filter(Boolean).join(' · ')}
            </span>
          )}
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
