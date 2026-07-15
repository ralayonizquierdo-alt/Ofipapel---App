import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2, CheckCircle, Circle } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import type { Reservation, Apartment, PriceEntry, StayType, Channel, PaymentMethod } from '../types'
import { formatDate, getNights, getSeason, today } from '../lib/dateUtils'
import { getApartmentType, calcTotal } from '../lib/priceCalc'
import Modal from '../components/ui/Modal'
import PageHeader from '../components/ui/PageHeader'

const STAY_LABELS: Record<StayType, string> = {
  '1semana': '1 Semana', '2semanas': '2 Semanas', '3semanas': '3 Semanas',
  '1mes': '1 Mes', 'directo': 'Directo/Largo', 'otro': 'Otro'
}
const CHANNEL_LABELS: Record<Channel, string> = {
  directo: 'Directo', inmobiliaria: 'Inmobiliaria', booking: 'Booking', web: 'Web'
}
const STATUS_COLORS: Record<string, string> = {
  confirmada: 'bg-blue-100 text-blue-700',
  completada: 'bg-green-100 text-green-700',
  cancelada: 'bg-red-100 text-red-700',
  cobrada: 'bg-emerald-100 text-emerald-800',
}

export default function Reservations() {
  const { reservations, payments, apartments, prices } = useData()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Reservation | null>(null)
  const [selectedRes, setSelectedRes] = useState<Reservation | null>(null)
  const [filterApt, setFilterApt] = useState('')
  const [filterYear, setFilterYear] = useState(String(new Date().getFullYear()))
  const [searchParams, setSearchParams] = useSearchParams()

  useEffect(() => {
    const editId = searchParams.get('edit')
    if (!editId || reservations.length === 0) return
    const res = reservations.find(r => r.id === editId)
    if (res) {
      setEditing(res)
      setShowForm(true)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, reservations])

  const filtered = reservations
    .filter(r => !filterApt || r.apartmentId === filterApt)
    .filter(r => !filterYear || r.checkIn.startsWith(filterYear) || r.checkOut.startsWith(filterYear))
    .sort((a, b) => b.checkIn.localeCompare(a.checkIn))

  const years = [...new Set(reservations.map(r => r.checkIn.slice(0, 4)))].sort((a, b) => b.localeCompare(a))

  function getAptName(id: string) { return apartments.find(a => a.id === id)?.name || id }
  function getPaid(r: Reservation) {
    return payments.filter(p => p.reservationId === r.id && p.received).reduce((s, p) => s + p.amount, 0)
  }
  function getPaymentMethods(r: Reservation): string {
    const rp = payments.filter(p => p.reservationId === r.id && p.received && p.paymentMethod)
    if (rp.length === 0) return '—'
    const labels: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transfer.', otro: 'Otro' }
    const methods = [...new Set(rp.map(p => p.paymentMethod))]
    return methods.map(m => labels[m!] || m!).join('+')
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Reservas"
        subtitle={`${filtered.length} reservas`}
        actions={
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus size={16} /> Nueva reserva
          </button>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <select value={filterApt} onChange={e => setFilterApt(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700">
          <option value="">Todos los apartamentos</option>
          {apartments.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700">
          <option value="">Todos los años</option>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Apartamento</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Entrada</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Salida</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Noches</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Tipo</th>
              <th className="text-right py-3 px-4 font-medium text-slate-600">Total</th>
              <th className="text-right py-3 px-4 font-medium text-slate-600">Cobrado</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Forma pago</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Estado</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => {
              const paid = getPaid(r)
              const pending = r.total - paid
              const displayStatus = (r.status === 'confirmada' && r.total > 0 && paid >= r.total) ? 'cobrada' : r.status
              return (
                <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50 cursor-pointer"
                  onClick={() => setSelectedRes(r)}>
                  <td className="py-3 px-4 font-medium text-slate-700">{getAptName(r.apartmentId)}</td>
                  <td className="py-3 px-4 text-slate-600">{formatDate(r.checkIn)}</td>
                  <td className="py-3 px-4 text-slate-600">{formatDate(r.checkOut)}</td>
                  <td className="py-3 px-4 text-slate-600">{r.nights}N</td>
                  <td className="py-3 px-4 text-slate-500 text-xs">{STAY_LABELS[r.stayType]}</td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-800">{r.total.toLocaleString('es-ES')} €</td>
                  <td className="py-3 px-4 text-right">
                    <span className={`text-xs font-medium ${pending > 0 ? 'text-amber-700' : 'text-green-700'}`}>
                      {paid.toLocaleString('es-ES')} €
                      {pending > 0 && <span className="ml-1 text-amber-500">(-{pending.toFixed(0)})</span>}
                    </span>
                  </td>
                  <td className="py-3 px-4 text-slate-500 text-xs">{getPaymentMethods(r)}</td>
                  <td className="py-3 px-4">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLORS[displayStatus]}`}>
                      {displayStatus}
                    </span>
                  </td>
                  <td className="py-3 px-4" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1 justify-end">
                      <button onClick={() => { setEditing(r); setShowForm(true) }}
                        className="p-1.5 text-slate-400 hover:text-blue-600 rounded"><Pencil size={14} /></button>
                    </div>
                  </td>
                </tr>
              )
            })}
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="py-8 text-center text-slate-400 text-sm">No hay reservas</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {showForm && (
        <ReservationForm
          apartments={apartments}
          prices={prices}
          editing={editing}
          onClose={() => setShowForm(false)}
          onSave={() => setShowForm(false)}
        />
      )}

      {selectedRes && (
        <PaymentModal
          reservation={selectedRes}
          aptName={getAptName(selectedRes.apartmentId)}
          onClose={() => setSelectedRes(null)}
        />
      )}
    </div>
  )
}

// ── Reservation Form ──────────────────────────────────────────────────────────
function ReservationForm({ apartments, prices, editing, onClose, onSave }:
  { apartments: Apartment[]; prices: PriceEntry[]; editing: Reservation | null; onClose: () => void; onSave: () => void }) {

  const { addReservation, updateReservation, deleteReservation, addPayment, updatePayment, payments } = useData()

  const [aptId, setAptId] = useState(editing?.apartmentId || apartments[0]?.id || '')
  const [checkIn, setCheckIn] = useState(editing?.checkIn || today())
  const [checkOut, setCheckOut] = useState(editing?.checkOut || '')
  const [stayType, setStayType] = useState<StayType>(editing?.stayType || '1semana')
  const [channel, setChannel] = useState<Channel>(editing?.channel || 'inmobiliaria')
  const [basePrice, setBasePrice] = useState(editing?.basePrice || 0)
  const [cleaningFee, setCleaningFee] = useState(editing?.cleaningFee || 40)
  const [discountPct, setDiscountPct] = useState(editing?.discountPct || 0)
  const [notes, setNotes] = useState(editing?.notes || '')
  const [status, setStatus] = useState(editing?.status || 'confirmada' as Reservation['status'])
  const [guestName, setGuestName] = useState(editing?.guestName || '')
  const [autoCalc, setAutoCalc] = useState(!editing)

  const nights = checkOut && checkIn ? getNights(checkIn, checkOut) : 0
  const total = calcTotal(basePrice, cleaningFee, discountPct)

  useEffect(() => {
    if (!autoCalc || !aptId || !checkIn) return
    const season = getSeason(checkIn)
    const aptType = getApartmentType(aptId)
    const year = new Date(checkIn).getFullYear()
    const priceEntry = prices.find(p =>
      p.apartmentType === aptType && p.season === season &&
      (p.year === year || p.year === year + 1)
    )
    if (!priceEntry) return
    const priceMap: Record<StayType, number> = {
      '1semana': priceEntry.price1week,
      '2semanas': priceEntry.price2weeks,
      '3semanas': priceEntry.price3weeks,
      '1mes': priceEntry.price1month,
      'directo': priceEntry.price1month * 0.9,
      'otro': 0,
    }
    setBasePrice(priceMap[stayType] || 0)
    setCleaningFee(priceEntry.cleaningFee)
  }, [aptId, stayType, checkIn, autoCalc, prices])

  useEffect(() => {
    if (!autoCalc || !checkIn) return
    const daysMap: Record<StayType, number> = {
      '1semana': 7, '2semanas': 14, '3semanas': 21, '1mes': 30, 'directo': 30, 'otro': 0
    }
    const d = daysMap[stayType]
    if (!d) return
    const date = new Date(checkIn)
    date.setDate(date.getDate() + d)
    setCheckOut(date.toISOString().split('T')[0])
  }, [stayType, checkIn, autoCalc])

  function handleSave() {
    if (!aptId || !checkIn || !checkOut) return alert('Completa los campos obligatorios')
    const newTotal = calcTotal(basePrice, cleaningFee, discountPct)
    const data = {
      apartmentId: aptId, guestName, checkIn, checkOut,
      nights: getNights(checkIn, checkOut), stayType, channel,
      basePrice, cleaningFee, discountPct, total: newTotal, status, notes,
    }
    if (editing) {
      updateReservation(editing.id, data)
      if (newTotal !== editing.total) {
        const resPayments = payments.filter(p => p.reservationId === editing.id)
        const totalPaid = resPayments.filter(p => p.received).reduce((s, p) => s + p.amount, 0)
        const newPending = newTotal - totalPaid
        const unreceived = resPayments.filter(p => !p.received)
        if (unreceived.length === 0) {
          if (newPending > 0) addPayment({ reservationId: editing.id, amount: newPending, received: false })
        } else {
          updatePayment(unreceived[0].id, { amount: Math.max(0, newPending) })
          unreceived.slice(1).forEach(p => updatePayment(p.id, { amount: 0 }))
        }
      }
    } else {
      const res = addReservation(data)
      addPayment({ reservationId: res.id, amount: newTotal, received: false })
    }
    onSave()
  }

  function handleDelete() {
    if (!editing || !confirm('¿Eliminar esta reserva?')) return
    deleteReservation(editing.id, payments)
    onSave()
  }

  return (
    <Modal title={editing ? 'Editar reserva' : 'Nueva reserva'} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Apartamento *</label>
            <select value={aptId} onChange={e => setAptId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {apartments.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Huésped</label>
            <input value={guestName} onChange={e => setGuestName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Nombre opcional" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Entrada *</label>
            <input type="date" value={checkIn} onChange={e => setCheckIn(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Salida *</label>
            <input type="date" value={checkOut} onChange={e => setCheckOut(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de estancia</label>
            <select value={stayType} onChange={e => setStayType(e.target.value as StayType)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {Object.entries(STAY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Canal</label>
            <select value={channel} onChange={e => setChannel(e.target.value as Channel)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
        </div>

        <div className="bg-slate-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold text-slate-700">Precios</p>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer">
              <input type="checkbox" checked={autoCalc} onChange={e => setAutoCalc(e.target.checked)} />
              Cálculo automático
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Precio base (€)</label>
              <input type="number" value={basePrice} onChange={e => setBasePrice(Number(e.target.value))}
                className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Limpieza (€)</label>
              <input type="number" value={cleaningFee} onChange={e => setCleaningFee(Number(e.target.value))}
                className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1">Descuento (%)</label>
              <input type="number" value={discountPct} onChange={e => setDiscountPct(Number(e.target.value))}
                className="w-full border border-slate-200 rounded px-2 py-1.5 text-sm" min="0" max="100" />
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between bg-white rounded p-3 border border-slate-200">
            <div className="text-xs text-slate-500">
              {nights > 0 && <span>{nights} noches · </span>}
              Base: {basePrice}€ + Limpieza: {cleaningFee}€
              {discountPct > 0 && <span> - {discountPct}% dto</span>}
            </div>
            <div className="text-lg font-bold text-blue-700">{total.toLocaleString('es-ES')} €</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Estado</label>
            <select value={status} onChange={e => setStatus(e.target.value as Reservation['status'])}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              <option value="confirmada">Confirmada</option>
              <option value="completada">Completada</option>
              <option value="cancelada">Cancelada</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Notas</label>
            <input value={notes} onChange={e => setNotes(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Observaciones" />
          </div>
        </div>

        <div className="flex justify-between items-center pt-2">
          {editing ? (
            <button onClick={handleDelete} className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">Eliminar</button>
          ) : <div />}
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
            <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
              {editing ? 'Guardar cambios' : 'Crear reserva'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

// ── Payment Modal ─────────────────────────────────────────────────────────────
function PaymentModal({ reservation, aptName, onClose }:
  { reservation: Reservation; aptName: string; onClose: () => void }) {

  const { payments, addPayment, updatePayment, deletePayment } = useData()
  const modalPayments = payments.filter(p => p.reservationId === reservation.id)
  const totalPaid = modalPayments.filter(p => p.received).reduce((s, p) => s + p.amount, 0)
  const pending = reservation.total - totalPaid

  function handleUpdateField(id: string, field: 'amount' | 'paymentDate' | 'entryNumber' | 'paymentMethod', value: string) {
    if (field === 'amount') updatePayment(id, { amount: Number(value) })
    else if (field === 'paymentMethod') updatePayment(id, { paymentMethod: value as PaymentMethod })
    else updatePayment(id, { [field]: value })
  }

  return (
    <Modal title={`Pagos — ${aptName}`} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-3 gap-4 text-center">
          <div>
            <p className="text-xs text-slate-500">Total reserva</p>
            <p className="text-xl font-bold text-slate-800">{reservation.total.toLocaleString('es-ES')} €</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Cobrado</p>
            <p className="text-xl font-bold text-green-700">{totalPaid.toLocaleString('es-ES')} €</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Pendiente</p>
            <p className={`text-xl font-bold ${pending > 0 ? 'text-amber-600' : 'text-green-600'}`}>
              {pending.toLocaleString('es-ES')} €
            </p>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          {formatDate(reservation.checkIn)} → {formatDate(reservation.checkOut)} · {reservation.nights} noches · {reservation.notes}
        </div>

        <div className="space-y-2">
          <div className="grid gap-2 text-xs font-medium text-slate-500 px-2" style={{gridTemplateColumns: '1fr 3fr 3fr 2fr 2fr 2fr'}}>
            <div></div><div>Importe (€)</div><div>Fecha cobro</div><div>Método</div><div>Nº Asiento</div><div></div>
          </div>
          {modalPayments.map((p, i) => (
            <div key={p.id} className={`grid gap-2 items-center p-2 rounded-lg ${p.received ? 'bg-green-50' : 'bg-amber-50'}`} style={{gridTemplateColumns: '1fr 3fr 3fr 2fr 2fr 2fr'}}>
              <div className="flex justify-center">
                <button onClick={() => updatePayment(p.id, { received: !p.received })}
                  title={p.received ? 'Marcar como pendiente' : 'Marcar como cobrado'}>
                  {p.received ? <CheckCircle size={18} className="text-green-600" /> : <Circle size={18} className="text-amber-400" />}
                </button>
              </div>
              <input type="number" defaultValue={p.amount}
                onBlur={e => handleUpdateField(p.id, 'amount', e.target.value)}
                className="w-full border border-slate-200 rounded px-2 py-1 text-sm" />
              <input type="date" defaultValue={p.paymentDate || ''}
                onChange={e => handleUpdateField(p.id, 'paymentDate', e.target.value)}
                className="w-full border border-slate-200 rounded px-2 py-1 text-sm" />
              <select defaultValue={p.paymentMethod || ''}
                onChange={e => handleUpdateField(p.id, 'paymentMethod', e.target.value)}
                className="w-full border border-slate-200 rounded px-2 py-1 text-sm">
                <option value="">—</option>
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="otro">Otro</option>
              </select>
              <input defaultValue={p.entryNumber || ''}
                onBlur={e => handleUpdateField(p.id, 'entryNumber', e.target.value)}
                className="w-full border border-slate-200 rounded px-2 py-1 text-sm" placeholder="Nº asiento" />
              <div className="flex justify-end gap-1">
                <span className="text-xs text-slate-400">P{i + 1}</span>
                <button onClick={() => deletePayment(p.id)} className="text-slate-300 hover:text-red-500 p-0.5">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>

        <button onClick={() => addPayment({ reservationId: reservation.id, amount: Math.max(0, pending), received: false })}
          className="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-700 font-medium">
          <Plus size={15} /> Añadir pago
        </button>

        <div className="flex justify-end pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg">Cerrar</button>
        </div>
      </div>
    </Modal>
  )
}
