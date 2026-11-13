import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, CalendarCheck, Euro, TrendingUp, Clock, ShieldAlert, ClipboardPaste, ChevronRight, Ban, Mail, ArrowRight } from 'lucide-react'
import { EJERCICIO_APP } from '../lib/cuentas'
import { useData } from '../contexts/DataContext'
import type { Reservation } from '../types'
import { formatDate, formatDateShort, today } from '../lib/dateUtils'
import { calcIGIC } from '../lib/priceCalc'
import { Link, useLocation, useNavigationType } from 'react-router-dom'
import AlertasDescuadre from '../components/AlertasDescuadre'
import { TarjetaSolapes } from '../components/AvisoSolapes'
import CorreccionesLuis from '../components/CorreccionesLuis'
import CorregirTarifaAno from '../components/CorregirTarifaAno'
import { CajaPegar } from '../components/PegarWhatsApp'
import SoltarGastos from '../components/SoltarGastos'
import { tocaCopia, DIAS_ENTRE_COPIAS } from '../lib/copia'
import { num, numSuelto } from '../lib/formato'
import { estadoPrecio, textoDiferencia } from '../lib/precioReserva'
import FichaCuadre, { type ModeloFicha } from '../components/FichaCuadre'
import { conformidadesPorEnviar, HORAS_ESPERA } from '../lib/conformidades'
import { useEnHistorial } from '../lib/volver'
import { anuladasConCobros } from '../lib/anuladas'
import { cobrosSinReserva } from '../lib/cobrosSinReserva'
import { cobrosRepetidos } from '../lib/cobrosRepetidos'
import AvisoCobroRepetido from '../components/AvisoCobroRepetido'
import AvisoCobroSinReserva from '../components/AvisoCobrosSinReserva'
import { porApartamento } from '../lib/apartamentos'
import { useRecordado } from '../lib/recordado'
import Operativa from '../components/Operativa'
import { OPERATIVA_DASHBOARD } from '../lib/operativas'

export default function Dashboard() {
  const { reservations, payments, apartments, repairs, prices, offerPrices } = useData()
  /**
   * Cada aviso rojo se pincha y abre el cuadre de esa estancia, para corregirlo
   * desde ahí; una vez corregido, el aviso desaparece solo porque se vuelve a
   * calcular (Luis, 06/11/2026: «pinchando te lleve a donde está el error… y
   * una vez corregido se elimine»).
   */
  const [ficha, setFicha] = useState<Reservation | null>(null)
  /** Con qué pestaña se abre la ficha: la conformidad, si se viene de su aviso. */
  const [modeloFicha, setModeloFicha] = useState<ModeloFicha>('cuadre')
  /** La pregunta «¿añadir texto?» sale al abrirla, no al volver a ella con «← Volver». */
  const [preguntar, setPreguntar] = useState(false)
  const abreFicha = (r: Reservation, modelo: ModeloFicha = 'cuadre') => {
    setModeloFicha(modelo); setPreguntar(modelo === 'conformidad'); setFicha(r)
  }
  /**
   * Conformidades por enviar (Luis, 09/11/2026): avisan a las HORAS_ESPERA de
   * entrar la reserva. Se mira cada minuto para que salgan a su hora sin
   * recargar. Ver lib/conformidades.ts.
   */
  const [ahora, setAhora] = useState(() => new Date())
  useEffect(() => {
    const t = setInterval(() => setAhora(new Date()), 60_000)
    return () => clearInterval(t)
  }, [])
  const conformidades = useMemo(() => conformidadesPorEnviar(reservations, ahora), [reservations, ahora])
  // Si desde la ficha se va a otra pantalla, al volver sale otra vez abierta.
  useEnHistorial('ficha', ficha?.id ?? null, id => setFicha(id ? reservations.find(r => r.id === id) ?? null : null))
  // Y con la misma pestaña (cuadre o conformidad) con la que se dejó.
  useEnHistorial('fichaModelo', modeloFicha, m => setModeloFicha(m))
  /**
   * Desde la ventana «Conformidad pendiente de enviar» (AvisoConformidades): se
   * llega aquí con la reserva y se abre su conformidad.
   */
  const location = useLocation()
  const tipoNavegacion = useNavigationType()
  useEffect(() => {
    if (tipoNavegacion !== 'PUSH') return
    const id = (location.state as { abrirConformidad?: string } | null)?.abrirConformidad
    const r = id ? reservations.find(x => x.id === id) : undefined
    if (r) abreFicha(r, 'conformidad')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.key])

  const todayStr = today()
  const now = new Date()

  const active = reservations.filter(r => r.status !== 'cancelada' && r.checkIn <= todayStr && r.checkOut > todayStr)
  const upcoming = reservations
    .filter(r => r.status !== 'cancelada' && r.checkIn > todayStr)
    .sort((a, b) => a.checkIn.localeCompare(b.checkIn))
    .slice(0, 5)

  /**
   * Reservas que no están cobradas del todo.
   *
   * Antes solo se miraban las que aún no habían terminado, y por ahí se coló lo
   * peor que puede pasar: una estancia acabada, cobrada de menos y sin que
   * saltara nada. Ahora entran también las vencidas, y van las primeras: una
   * estancia terminada y a medio pagar es un descubierto, no una previsión.
   */
  const pendingPayment = reservations
    .filter(r => {
      if (r.status === 'cancelada') return false
      // Nada de años cerrados: sus estancias llevan el importe estimado del
      // calendario de colores y sus cobros son los reales del Excel, así que
      // la resta no significa nada. Ver lib/cuentas.ts, EJERCICIO_APP.
      if (Number(r.checkIn.slice(0, 4)) < EJERCICIO_APP) return false
      const paid = payments.filter(p => p.reservationId === r.id && p.received).reduce((s, p) => s + p.amount, 0)
      // Medio céntimo de margen: los redondeos no son un impago.
      return r.total - paid > 0.005
    })
    .sort((a, b) => a.checkOut.localeCompare(b.checkOut))

  /**
   * Las que ya terminaron y siguen sin cobrarse enteras: lo único que se
   * avisa aquí.
   *
   * Una estancia que todavía no ha empezado y no está cobrada no es una
   * alerta, es lo normal — y mezclarlas tapaba las que sí importan. Las que
   * están por venir se siguen viendo en Reservas, con su columna «falta».
   */
  /**
   * Cómo van los avisos rojos: por apartamento, en el orden de la casa, o por
   * fecha de entrada (Luis, 08/11/2026: «incluir la opción de ordenar por
   * apartamento y por fechas»). Se recuerda en este ordenador.
   */
  const [orden, setOrden] = useRecordado<'apartamento' | 'fecha'>('dashboard.orden', 'apartamento')
  const ordenAvisos = (a: Reservation, b: Reservation) => orden === 'fecha'
    ? a.checkIn.localeCompare(b.checkIn) || porApartamento(a, b)
    : porApartamento(a, b)
  const vencidas = pendingPayment.filter(r => new Date(r.checkOut) < now).sort(ordenAvisos)
  const porVenir = pendingPayment.length - vencidas.length

  /**
   * Importes que no salen de la tarifa y no constan como precio pactado. Desde
   * el cuadre se corrige la reserva o se anota el motivo, y el aviso se va.
   * Ver lib/precioReserva.ts.
   */
  const sinCuadrarConTarifa = useMemo(() => reservations
    .flatMap(r => {
      const p = estadoPrecio(r, prices, offerPrices)
      return p.tipo === 'descuadre' ? [{ r, esperado: p.esperado, diferencia: p.diferencia }] : []
    })
    .sort((a, b) => orden === 'fecha'
      ? a.r.checkIn.localeCompare(b.r.checkIn) || porApartamento(a.r, b.r)
      : porApartamento(a.r, b.r)),
  [reservations, prices, offerPrices, orden])
  const eur = (n: number) => `${num(n, 2)} €`
  /** Anuladas que se quedaron con dinero cobrado: ver lib/anuladas.ts. */
  const anuladasCobradas = useMemo(
    () => [...anuladasConCobros(reservations, payments)].sort((a, b) => orden === 'fecha'
      ? a.r.checkIn.localeCompare(b.r.checkIn) || porApartamento(a.r, b.r)
      : porApartamento(a.r, b.r)),
    [reservations, payments, orden])
  /** Cobros sin reserva por revisar (los de Airbnb): ver lib/cobrosSinReserva.ts. */
  const sueltos = useMemo(() => cobrosSinReserva(payments), [payments])
  /** Cobros que parecen apuntados dos veces: ver lib/cobrosRepetidos.ts. */
  const repetidos = useMemo(() => cobrosRepetidos(reservations, payments), [reservations, payments])
  const hayAvisosRojos = vencidas.length + sinCuadrarConTarifa.length + anuladasCobradas.length + sueltos.length + repetidos.length > 1

  const currentYear = now.getFullYear()
  const currentMonth = now.getMonth() + 1
  const monthStart = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
  const monthEnd = `${currentYear}-${String(currentMonth).padStart(2, '0')}-31`

  const monthIncome = payments
    .filter(p => p.received && p.paymentDate && p.paymentDate >= monthStart && p.paymentDate <= monthEnd)
    .reduce((s, p) => s + p.amount, 0)

  const yearIncome = payments
    .filter(p => p.received && p.paymentDate && p.paymentDate.startsWith(String(currentYear)))
    .reduce((s, p) => s + p.amount, 0)

  const totalRepairs = repairs
    .filter(r => r.repairDate?.startsWith(String(currentYear)))
    .reduce((s, r) => s + (r.amount || 0), 0)

  const netYear = yearIncome - totalRepairs
  // Se mira una sola vez al pintar: no hace falta vigilarlo en vivo.
  const copiaPendiente = tocaCopia()
  const isPriceRenewalMonth = currentMonth === 1

  function getApartmentName(id: string) {
    return apartments.find(a => a.id === id)?.name || id
  }

  function getPaidAmount(r: Reservation) {
    return payments.filter(p => p.reservationId === r.id && p.received).reduce((s, p) => s + p.amount, 0)
  }

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-slate-800">Dashboard</h1>
        <p className="text-sm text-slate-500">{new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</p>
      </div>
      <Operativa titulo="Dashboard" reglas={OPERATIVA_DASHBOARD} />

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <KpiCard icon={<CalendarCheck size={20} className="text-blue-600" />} label="Activas hoy" value={String(active.length)} sub={`de ${apartments.filter(a => a.active).length} aptos.`} color="blue" />
        <KpiCard icon={<Euro size={20} className="text-green-600" />} label="Cobrado este mes" value={`${numSuelto(monthIncome)} €`} sub={`IGIC: ${numSuelto(calcIGIC(monthIncome))} €`} color="green" />
        <KpiCard icon={<TrendingUp size={20} className="text-purple-600" />} label={`Neto ${currentYear}`} value={`${numSuelto(netYear)} €`} sub={`Ingresos: ${numSuelto(yearIncome)} €`} color="purple" />
        <KpiCard icon={<AlertTriangle size={20} className="text-amber-600" />} label="Cobros vencidos" value={String(vencidas.length)} sub={porVenir ? `${porVenir} más por venir` : 'estancias ya terminadas'} color="amber" />
      </div>

      {/* La caja de pegar va arriba del todo y a la vista: es lo que más se usa
          al abrir la app, según llegan los mensajes de la inmobiliaria. */}
      <div className="mb-6 bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-slate-100 flex items-center gap-2">
          <ClipboardPaste size={15} className="text-blue-600" />
          <p className="text-sm font-semibold text-slate-700">Entrada rápida</p>
          <span className="text-xs text-slate-400">
            pega el mensaje de WhatsApp, o suelta el PDF de un cobro o el Excel de gastos
          </span>
        </div>
        <div className="p-4 space-y-3">
          <CajaPegar compacta />
          <SoltarGastos />
        </div>
      </div>

      {conformidades.length > 0 && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border-2 border-blue-300 overflow-hidden">
          <div className="px-4 py-2.5 bg-blue-50 border-b border-blue-200 flex items-center gap-2">
            <Mail size={16} className="text-blue-700" />
            <p className="text-sm font-bold text-blue-900">Conformidades por enviar</p>
            <span className="bg-red-600 text-white text-xs rounded-full min-w-5 h-5 px-1.5 flex items-center justify-center font-bold">
              {conformidades.length}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {conformidades.map(({ r }) => (
              <div key={r.id} className="px-4 py-2.5 flex items-center gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800">
                    {getApartmentName(r.apartmentId)} — {formatDateShort(r.checkIn)} al {formatDateShort(r.checkOut)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {r.nights} noches · {eur(r.total)} · entró el {new Date(r.createdAt).toLocaleString('es-ES', {
                      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                    })}
                  </p>
                </div>
                <button type="button" onClick={() => abreFicha(r, 'conformidad')}
                  title={`Abre la ficha de la reserva (cuadre y conformidad): revisa y elige correo o WhatsApp. Avisa a las ${HORAS_ESPERA} horas de entrar la reserva.`}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 whitespace-nowrap">
                  Ir a enviar <ArrowRight size={14} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Arreglo de una vez de las estancias que se pisaban. Desaparece solo
          cuando no queda nada pendiente. */}
      <CorreccionesLuis />
      {/* Reservas calculadas con la tarifa del año siguiente (fallo corregido el 06/11/2026). */}
      <CorregirTarifaAno />

      {/* Descuadres Excel ↔ app. Van antes que el resto de avisos: son los que
          pidió el propietario para poder cerrar el ejercicio. */}
      {/* Lo primero: un piso alquilado dos veces no es un descuadre que
          revisar, es un error que hay que arreglar hoy. */}
      <TarjetaSolapes />
      <AlertasDescuadre />

      {/* Alerts */}
      {(vencidas.length > 0 || sinCuadrarConTarifa.length > 0 || anuladasCobradas.length > 0 || sueltos.length > 0 || repetidos.length > 0 || isPriceRenewalMonth || copiaPendiente) && (
        <div className="mb-6 space-y-2">
          {copiaPendiente && (
            <Link to="/config"
              className="bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-start gap-3 hover:bg-amber-100/70 transition-colors">
              <ShieldAlert size={18} className="text-amber-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-amber-800 text-sm">Toca copia de seguridad</p>
                <p className="text-amber-700 text-xs mt-0.5">
                  Han pasado {DIAS_ENTRE_COPIAS} días o más desde la última. Pincha aquí para
                  descargarla desde <strong>Apartamentos</strong>.
                </p>
              </div>
            </Link>
          )}
          {isPriceRenewalMonth && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
              <AlertTriangle size={18} className="text-blue-600 mt-0.5 shrink-0" />
              <div>
                <p className="font-medium text-blue-800 text-sm">Renovación de precios</p>
                <p className="text-blue-700 text-xs mt-0.5">Enero es el mes para actualizar la lista de precios del próximo año. Recuerda revisar la sección <strong>Precios</strong>.</p>
              </div>
            </div>
          )}
          {hayAvisosRojos && (
            <div className="flex items-center justify-end gap-2 text-xs text-slate-500" role="group" aria-label="Ordenar los avisos">
              <span>Ordenar por</span>
              {(['apartamento', 'fecha'] as const).map(o => (
                <button key={o} type="button" onClick={() => setOrden(o)} aria-pressed={orden === o}
                  className={`px-2.5 py-1 rounded-full border ${orden === o
                    ? 'bg-slate-700 border-slate-700 text-white' : 'bg-white border-slate-300 text-slate-600 hover:border-slate-400'}`}>
                  {o === 'apartamento' ? 'Apartamento' : 'Fecha'}
                </button>
              ))}
            </div>
          )}
          {repetidos.map(({ r, cobros }) => (
            <AvisoCobroRepetido key={`repetido-${cobros[0].id}`} r={r} cobros={cobros} nombreApt={getApartmentName} />
          ))}
          {sueltos.map(p => (
            <AvisoCobroSinReserva key={`suelto-${p.id}`} p={p} nombreApt={getApartmentName} />
          ))}
          {anuladasCobradas.map(({ r, cobrado }) => (
            <AvisoRojo key={`anulada-${r.id}`} icono={<Ban size={16} className="shrink-0 text-red-600" />}
              titulo={`${getApartmentName(r.apartmentId)} — ${formatDateShort(r.checkIn)} al ${formatDateShort(r.checkOut)}`}
              que="reserva anulada con cobros"
              onClick={() => abreFicha(r)}>
              Tiene <strong>{eur(cobrado)}</strong> cobrados: hay que devolverlos o pasarlos a otra reserva.
            </AvisoRojo>
          ))}
          {vencidas.slice(0, 5).map(r => {
            const paid = getPaidAmount(r)
            const pending = r.total - paid
            return (
              <AvisoRojo key={r.id} icono={<Clock size={16} className="shrink-0 text-red-600" />}
                titulo={`${getApartmentName(r.apartmentId)} — ${formatDateShort(r.checkIn)} al ${formatDateShort(r.checkOut)}`}
                que="ya terminó y no está cobrada del todo"
                onClick={() => abreFicha(r)}>
                Falta por cobrar: <strong>{pending.toFixed(2)} €</strong> · cobrado {paid.toFixed(2)} de {r.total.toFixed(2)} €
              </AvisoRojo>
            )
          })}
          {vencidas.length > 5 && (
            <p className="text-xs text-slate-500 pl-1">+{vencidas.length - 5} cobros vencidos más</p>
          )}
          {sinCuadrarConTarifa.slice(0, 5).map(({ r, esperado, diferencia }) => (
            <AvisoRojo key={`tarifa-${r.id}`} icono={<AlertTriangle size={16} className="shrink-0 text-red-600" />}
              titulo={`${getApartmentName(r.apartmentId)} — ${formatDateShort(r.checkIn)} al ${formatDateShort(r.checkOut)}`}
              que="el importe no sale de la tarifa"
              onClick={() => abreFicha(r)}>
              Importe <strong>{eur(r.total)}</strong> · por tarifa serían {eur(esperado)}, {textoDiferencia(diferencia, eur)}.
              No consta como precio pactado.
            </AvisoRojo>
          ))}
          {sinCuadrarConTarifa.length > 5 && (
            <Link to="/reservas?precio=descuadre" className="block text-xs text-blue-700 hover:underline pl-1">
              +{sinCuadrarConTarifa.length - 5} importes más que no cuadran con la tarifa: verlos todos en Reservas
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Activas hoy */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-2">
            <CalendarCheck size={15} /> Ocupación actual
          </h2>
          {active.length === 0 ? (
            <p className="text-slate-400 text-sm">Ningún apartamento ocupado hoy</p>
          ) : (
            <div className="space-y-2">
              {active.map(r => (
                <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div>
                    <p className="text-sm font-medium text-slate-700">{getApartmentName(r.apartmentId)}</p>
                    <p className="text-xs text-slate-500">Sale {formatDate(r.checkOut)} · {r.nights} noches</p>
                  </div>
                  <span className="text-sm font-semibold text-green-700">{numSuelto(r.total)} €</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Próximas entradas */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
          <h2 className="font-semibold text-slate-700 text-sm mb-3 flex items-center gap-2">
            <Clock size={15} /> Próximas entradas
          </h2>
          {upcoming.length === 0 ? (
            <p className="text-slate-400 text-sm">No hay reservas próximas</p>
          ) : (
            <div className="space-y-2">
              {upcoming.map(r => {
                const daysUntil = Math.ceil((new Date(r.checkIn).getTime() - now.getTime()) / 86400000)
                return (
                  <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-sm font-medium text-slate-700">{getApartmentName(r.apartmentId)}</p>
                      <p className="text-xs text-slate-500">{formatDate(r.checkIn)} → {formatDate(r.checkOut)} · {r.nights}N</p>
                    </div>
                    <span className={`text-xs font-medium px-2 py-1 rounded-full ${daysUntil <= 7 ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                      en {daysUntil}d
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {ficha && <FichaCuadre key={`${ficha.id}-${modeloFicha}`} reserva={ficha} modeloInicial={modeloFicha} preguntarTexto={preguntar}
        onClose={() => setFicha(null)} />}
    </div>
  )
}

/** Un aviso rojo que se pincha y abre el cuadre de la estancia. */
function AvisoRojo({ icono, titulo, que, onClick, children }: {
  icono: React.ReactNode
  titulo: string
  que: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button type="button" onClick={onClick} title="Abrir el cuadre de esta estancia para corregirlo"
      className="w-full text-left rounded-lg p-3 flex items-center gap-3 border bg-red-50 border-red-200 hover:bg-red-100 hover:border-red-300 transition-colors">
      {icono}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-red-800">
          {titulo}
          <span className="ml-2 text-xs font-bold">{que}</span>
        </p>
        <p className="text-xs text-red-700">{children}</p>
      </div>
      <span className="shrink-0 flex items-center gap-0.5 text-xs font-medium text-red-700">
        ver el cuadre <ChevronRight size={14} />
      </span>
    </button>
  )
}

function KpiCard({ icon, label, value, sub, color }: { icon: React.ReactNode; label: string; value: string; sub: string; color: string }) {
  const bg = { blue: 'bg-blue-50', green: 'bg-green-50', purple: 'bg-purple-50', amber: 'bg-amber-50' }[color]
  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4">
      <div className={`w-9 h-9 ${bg} rounded-lg flex items-center justify-center mb-3`}>{icon}</div>
      <p className="text-2xl font-bold text-slate-800">{value}</p>
      <p className="text-xs font-medium text-slate-600 mt-0.5">{label}</p>
      <p className="text-xs text-slate-400 mt-0.5">{sub}</p>
    </div>
  )
}
