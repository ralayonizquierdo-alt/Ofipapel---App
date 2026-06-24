import { useState, useEffect } from 'react'
import { priceStorage, offerPriceStorage } from '../lib/storage'
import type { PriceEntry, ApartmentType, Season, OfferPrice } from '../types'
import { calcPrices } from '../lib/priceCalc'
import PageHeader from '../components/ui/PageHeader'
import Modal from '../components/ui/Modal'
import { Pencil, Info, Printer, Plus, Trash2 } from 'lucide-react'
import { MONTH_NAMES_ES } from '../lib/dateUtils'

const APT_TYPE_LABELS: Record<ApartmentType, string> = {
  '1BR': '1 Dormitorio (104, 105)',
  '2BR': '2 Dormitorios (106, 203, 204)',
  '2BR_ATICO': 'Ático 402 (2 Dorm.)',
  '3BR': 'Piso 3 (3 Dorm.)',
}

const CURRENT_YEAR = new Date().getFullYear()

export default function Prices() {
  const [prices, setPrices] = useState<PriceEntry[]>([])
  const [offerPrices, setOfferPrices] = useState<OfferPrice[]>([])
  const [selectedSeason, setSelectedSeason] = useState<Season>('VERANO')
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR)
  const [editing, setEditing] = useState<PriceEntry | null>(null)
  const [showOfferForm, setShowOfferForm] = useState(false)
  const [editingOffer, setEditingOffer] = useState<OfferPrice | null>(null)

  function reload() {
    setPrices(priceStorage.getAll())
    setOfferPrices(offerPriceStorage.getAll())
  }
  useEffect(() => { reload() }, [])

  const filtered = prices.filter(p => p.season === selectedSeason && p.year === selectedYear)
  const availableYears = [...new Set(prices.map(p => p.year))].sort()

  function handleDeleteOffer(id: string) {
    if (!confirm('¿Eliminar tarifa de oferta?')) return
    offerPriceStorage.delete(id)
    reload()
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Tabla de Precios"
        subtitle="Los precios se actualizan en Enero para el año siguiente"
        actions={
          <button onClick={() => window.print()} className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            <Printer size={16} /> Imprimir
          </button>
        }
      />

      <div className="print:hidden bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3">
        <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-700">
          <strong>Reglas de precio:</strong> Vacacional incluye 40€ limpieza. Prolongaciones = precio_contratado ÷ días × días_extra.
          Descuento 10% CON PAGO DE CONTADO para directos y VIP-B (desde 14/04/26). Canal inmobiliaria/Booking/Web = precio base +15% (limpieza no incluida, se cobra aparte).
          DIRECTOS y VIP-B no se publican en web.
        </div>
      </div>

      {/* Season / Year selector */}
      <div className="print:hidden flex gap-4 mb-6">
        <div className="flex bg-white border border-slate-200 rounded-lg p-1 gap-1">
          {(['VERANO', 'INVIERNO'] as Season[]).map(s => (
            <button key={s}
              onClick={() => setSelectedSeason(s)}
              className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
                selectedSeason === s
                  ? s === 'VERANO' ? 'bg-orange-500 text-white' : 'bg-blue-600 text-white'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}>
              {s} {s === 'VERANO' ? '(May–Sep)' : '(Oct–Abr)'}
            </button>
          ))}
        </div>
        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700">
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Price tables */}
      <div className="space-y-6">
        {(['1BR', '2BR', '2BR_ATICO', '3BR'] as ApartmentType[]).map(aptType => {
          const entry = filtered.find(p => p.apartmentType === aptType)
          if (!entry) return (
            <div key={aptType} className="bg-white rounded-xl border border-dashed border-slate-300 p-6 text-center">
              <p className="text-slate-400 text-sm">{APT_TYPE_LABELS[aptType]} — Sin precios para {selectedSeason} {selectedYear}</p>
              <button
                onClick={() => {
                  const newEntry = priceStorage.add({
                    year: selectedYear, season: selectedSeason, apartmentType: aptType,
                    price1week: 0, price2weeks: 0, price3weeks: 0, price1month: 0, cleaningFee: 40
                  })
                  setEditing(newEntry)
                  reload()
                }}
                className="mt-2 text-sm text-blue-600 hover:underline">+ Añadir precios</button>
            </div>
          )
          return <PriceTable key={aptType} entry={entry} onEdit={() => setEditing(entry)} />
        })}
      </div>

      {/* Offer Prices section */}
      <div className="mt-8">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-slate-800">Tarifas de Oferta</h2>
          <button
            onClick={() => { setEditingOffer(null); setShowOfferForm(true) }}
            className="print:hidden flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus size={15} /> Nueva tarifa de oferta
          </button>
        </div>

        {offerPrices.length === 0 ? (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-6 text-center">
            <p className="text-slate-400 text-sm">No hay tarifas de oferta registradas</p>
          </div>
        ) : (
          <div className="space-y-3">
            {offerPrices.map(op => (
              <div key={op.id} className="bg-white rounded-xl border border-slate-200 p-4 flex items-center justify-between">
                <div>
                  <p className="font-semibold text-slate-800">{op.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {MONTH_NAMES_ES[op.month - 1]} {op.year} · {APT_TYPE_LABELS[op.apartmentType]} ·
                    1S: {op.price1week}€ · 2S: {op.price2weeks}€ · 3S: {op.price3weeks}€ · 1M: {op.price1month}€ · Limp: {op.cleaningFee}€
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => { setEditingOffer(op); setShowOfferForm(true) }}
                    className="p-1.5 text-slate-400 hover:text-blue-600 rounded"><Pencil size={14} /></button>
                  <button onClick={() => handleDeleteOffer(op.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded"><Trash2 size={14} /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {editing && (
        <PriceEditModal entry={editing} onClose={() => { setEditing(null); reload() }} />
      )}

      {showOfferForm && (
        <OfferPriceModal
          editing={editingOffer}
          onClose={() => { setShowOfferForm(false); setEditingOffer(null); reload() }}
        />
      )}
    </div>
  )
}

function PriceTable({ entry, onEdit }: { entry: PriceEntry; onEdit: () => void }) {
  const rows = [
    { label: '1 Semana (7d)', days: 7, base: entry.price1week },
    { label: '2 Semanas (14d)', days: 14, base: entry.price2weeks },
    { label: '3 Semanas (21d)', days: 21, base: entry.price3weeks },
    { label: '1 Mes (30d)', days: 30, base: entry.price1month },
    { label: 'Directo/VIP-B (-10%)', days: 30, base: entry.price1month * 0.9, isDirect: true },
  ]

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden break-inside-avoid">
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 bg-slate-50">
        <h3 className="font-semibold text-slate-700 text-sm">{APT_TYPE_LABELS[entry.apartmentType]}</h3>
        <button onClick={onEdit} className="print:hidden flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
          <Pencil size={13} /> Editar precios base
        </button>
      </div>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100">
              <th className="text-left py-2.5 px-4 text-xs font-medium text-slate-500">Duración</th>
              <th className="text-right py-2.5 px-4 text-xs font-medium text-slate-500">Base Propietario</th>
              <th className="text-right py-2.5 px-4 text-xs font-medium text-slate-500">+ Limpieza</th>
              <th className="text-right py-2.5 px-4 text-xs font-medium text-slate-500">Pago Propietario</th>
              <th className="text-right py-2.5 px-4 text-xs font-medium text-amber-600">+ Inmobi. (15%)</th>
              <th className="text-right py-2.5 px-4 text-xs font-medium text-violet-600">+ Reserva (15%)</th>
              <th className="text-right py-2.5 px-4 text-xs font-medium text-green-700 bg-green-50">Web (Publicar)</th>
              <th className="text-right py-2.5 px-4 text-xs font-medium text-slate-500">€/Noche</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => {
              if (row.base === 0) return null
              const calc = calcPrices(row.base, entry.cleaningFee)
              const perNight = (row.base / row.days).toFixed(2)
              return (
                <tr key={row.label} className={`border-b border-slate-50 hover:bg-slate-50 ${(row as { isDirect?: boolean }).isDirect ? 'bg-green-50/30' : ''}`}>
                  <td className={`py-3 px-4 font-medium ${(row as { isDirect?: boolean }).isDirect ? 'text-green-700' : 'text-slate-700'}`}>
                    {row.label}
                    {(row as { isDirect?: boolean }).isDirect && <span className="ml-1 text-xs font-normal text-green-600">(contado/efectivo)</span>}
                  </td>
                  <td className={`py-3 px-4 text-right ${(row as { isDirect?: boolean }).isDirect ? 'text-green-700 font-semibold' : 'text-slate-600'}`}>{row.base.toLocaleString('es-ES')} €</td>
                  <td className="py-3 px-4 text-right text-slate-500 text-xs">{entry.cleaningFee} €</td>
                  <td className="py-3 px-4 text-right text-slate-700 font-semibold">{calc.totalOwner.toLocaleString('es-ES')} €</td>
                  <td className="py-3 px-4 text-right text-amber-700 font-medium">{calc.realEstate.toLocaleString('es-ES')} €</td>
                  <td className="py-3 px-4 text-right text-violet-700 font-medium">{calc.booking.toLocaleString('es-ES')} €</td>
                  <td className="py-3 px-4 text-right font-bold text-green-700 bg-green-50">{calc.webPrice.toLocaleString('es-ES')} €</td>
                  <td className="py-3 px-4 text-right text-slate-400 text-xs">{perNight} €</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-slate-200 bg-slate-50">
              <td colSpan={8} className="py-2 px-4 text-xs text-slate-400">
                Limpieza: {entry.cleaningFee}€ · Precios {entry.season} {entry.year} · Canales: limpieza no incluida, se cobra aparte
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}

function PriceEditModal({ entry, onClose }: { entry: PriceEntry; onClose: () => void }) {
  const [p1w, setP1w] = useState(entry.price1week)
  const [p2w, setP2w] = useState(entry.price2weeks)
  const [p3w, setP3w] = useState(entry.price3weeks)
  const [p1m, setP1m] = useState(entry.price1month)
  const [cleaning, setCleaning] = useState(entry.cleaningFee)

  function save() {
    priceStorage.update(entry.id, {
      price1week: p1w, price2weeks: p2w, price3weeks: p3w,
      price1month: p1m, cleaningFee: cleaning
    })
    onClose()
  }

  function apply10Increase() {
    setP1w(Math.round(p1w * 1.1))
    setP2w(Math.round(p2w * 1.1))
    setP3w(Math.round(p3w * 1.1))
    setP1m(Math.round(p1m * 1.1))
  }

  return (
    <Modal title={`Editar precios — ${APT_TYPE_LABELS[entry.apartmentType]}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-slate-500">{entry.season} {entry.year}</p>
        <div className="grid grid-cols-2 gap-4">
          {[
            ['1 Semana (7 días)', p1w, setP1w],
            ['2 Semanas (14 días)', p2w, setP2w],
            ['3 Semanas (21 días)', p3w, setP3w],
            ['1 Mes (30 días)', p1m, setP1m],
            ['Limpieza (€)', cleaning, setCleaning],
          ].map(([label, val, setter]) => (
            <div key={label as string}>
              <label className="block text-xs font-medium text-slate-600 mb-1">{label as string}</label>
              <input type="number" value={val as number}
                onChange={e => (setter as (v: number) => void)(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}
        </div>
        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-500 mb-2">Directo/Largo plazo (−10%):</p>
          <p className="text-sm font-medium text-slate-700">{(p1m * 0.9).toFixed(0)} € (mes) · {(p1w * 0.9).toFixed(0)} € (semana)</p>
        </div>
        <div className="flex justify-between items-center pt-2">
          <button onClick={apply10Increase}
            className="text-sm text-slate-500 hover:text-slate-700 underline underline-offset-2">
            Aplicar subida del 10%
          </button>
          <div className="flex gap-3">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
            <button onClick={save} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Guardar</button>
          </div>
        </div>
      </div>
    </Modal>
  )
}

function OfferPriceModal({ editing, onClose }: { editing: OfferPrice | null; onClose: () => void }) {
  const [label, setLabel] = useState(editing?.label || '')
  const [year, setYear] = useState(editing?.year || new Date().getFullYear())
  const [month, setMonth] = useState(editing?.month || new Date().getMonth() + 1)
  const [aptType, setAptType] = useState<ApartmentType>(editing?.apartmentType || '1BR')
  const [p1w, setP1w] = useState(editing?.price1week || 0)
  const [p2w, setP2w] = useState(editing?.price2weeks || 0)
  const [p3w, setP3w] = useState(editing?.price3weeks || 0)
  const [p1m, setP1m] = useState(editing?.price1month || 0)
  const [cleaning, setCleaning] = useState(editing?.cleaningFee || 40)

  function handleSave() {
    if (!label.trim()) return alert('Introduce una etiqueta')
    const data = {
      label, year, month, apartmentType: aptType,
      price1week: p1w, price2weeks: p2w, price3weeks: p3w, price1month: p1m, cleaningFee: cleaning
    }
    if (editing) {
      offerPriceStorage.update(editing.id, data)
    } else {
      offerPriceStorage.add(data)
    }
    onClose()
  }

  return (
    <Modal title={editing ? 'Editar tarifa de oferta' : 'Nueva tarifa de oferta'} onClose={onClose}>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Etiqueta *</label>
          <input value={label} onChange={e => setLabel(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            placeholder="Ej: PRECIOS OFERTA ABRIL 2026" />
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Año</label>
            <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Mes (1-12)</label>
            <input type="number" value={month} onChange={e => setMonth(Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" min="1" max="12" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tipo apartamento</label>
            <select value={aptType} onChange={e => setAptType(e.target.value as ApartmentType)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {(Object.keys(APT_TYPE_LABELS) as ApartmentType[]).map(k => (
                <option key={k} value={k}>{APT_TYPE_LABELS[k]}</option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {[
            ['1 Semana (€)', p1w, setP1w],
            ['2 Semanas (€)', p2w, setP2w],
            ['3 Semanas (€)', p3w, setP3w],
            ['1 Mes (€)', p1m, setP1m],
            ['Limpieza (€)', cleaning, setCleaning],
          ].map(([lbl, val, setter]) => (
            <div key={lbl as string}>
              <label className="block text-xs font-medium text-slate-600 mb-1">{lbl as string}</label>
              <input type="number" value={val as number}
                onChange={e => (setter as (v: number) => void)(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            {editing ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
