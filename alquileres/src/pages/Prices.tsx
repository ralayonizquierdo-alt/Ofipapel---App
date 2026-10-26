import { useState } from 'react'
import { useData } from '../contexts/DataContext'
import type { PriceEntry, ApartmentType, Season, OfferPrice, OfferTarifa } from '../types'
import { calcPrices, getApartmentType, tarifaDeOferta } from '../lib/priceCalc'
import PageHeader from '../components/ui/PageHeader'
import Modal from '../components/ui/Modal'
import { Pencil, Info, Printer, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import { MONTH_NAMES_ES } from '../lib/dateUtils'
import { num, numSuelto } from '../lib/formato'
import AplicarOferta from '../components/AplicarOferta'

const APT_TYPE_LABELS: Record<ApartmentType, string> = {
  '1BR': '1 Dormitorio (104, 105)',
  '2BR': '2 Dormitorios (106, 203, 204)',
  '2BR_ATICO': 'Ático 402 (2 Dorm.)',
  '3BR': 'Piso 3 (3 Dorm.)',
}

const CURRENT_YEAR = new Date().getFullYear()

/** La tarifa del mismo tipo y temporada del año anterior, si la hay. */
function tarifaAnterior(prices: PriceEntry[], entry: PriceEntry): PriceEntry | undefined {
  return prices.find(p =>
    p.year === entry.year - 1
    && p.season === entry.season
    && p.apartmentType === entry.apartmentType)
}

/** A qué temporada pertenece un mes: verano es de mayo a septiembre. */
function temporadaDe(month: number): Season {
  return month >= 5 && month <= 9 ? 'VERANO' : 'INVIERNO'
}

/**
 * La tarifa general vigente para ese mes, tipo y año.
 *
 * Si el año pedido todavía no tiene tarifa, se coge la del año más reciente que
 * sí la tenga: una oferta se hace siempre sobre un precio que ya existe, y
 * arrancar en blanco obliga a ir a buscar las cifras a otra pantalla.
 */
function tarifaGeneral(prices: PriceEntry[], year: number, season: Season, aptType: ApartmentType) {
  const candidatas = prices
    .filter(p => p.season === season && p.apartmentType === aptType && p.year <= year)
    .sort((a, b) => b.year - a.year)
  return candidatas[0]
}

/** Los apartamentos de una oferta, por su nombre. */
function nombresDe(op: OfferPrice, apartments: { id: string; name: string }[]): string {
  const suyos = apartments.filter(a => tarifaDeOferta(op, a.id))
  if (suyos.length === 0) return 'sin apartamentos'
  if (suyos.length === apartments.length) return 'todos los apartamentos'
  return suyos.map(a => a.name.replace(/^Apartamento /, '')).join(', ')
}

/** Una línea de precios por cada tipo de apartamento que cubre la oferta. */
function lineasDeOferta(op: OfferPrice, apartments: { id: string; name: string }[]): string[] {
  const vistos = new Map<ApartmentType, string>()
  for (const a of apartments) {
    const t = getApartmentType(a.id)
    if (vistos.has(t)) continue
    const p = tarifaDeOferta(op, a.id)
    if (!p) continue
    vistos.set(t, `${APT_TYPE_LABELS[t]} · 1S: ${p.price1week}€ · 2S: ${p.price2weeks}€`
      + ` · 3S: ${p.price3weeks}€ · 1M: ${p.price1month}€ · Limp: ${p.cleaningFee}€`)
  }
  return [...vistos.values()]
}

/**
 * Las tarifas de una oferta vistas como tarifas normales, una por tipo, para
 * poder enseñarlas con la misma tabla que las generales (con sus canales y su
 * precio por noche). El año y la temporada son los de aplicación de la oferta.
 */
function tarifasDeOferta(op: OfferPrice, apartments: { id: string; name: string }[]) {
  const salida: { tipo: ApartmentType; entry: PriceEntry; quien: string }[] = []
  for (const tipo of ['1BR', '2BR', '2BR_ATICO', '3BR'] as ApartmentType[]) {
    const suyos = apartments.filter(a => getApartmentType(a.id) === tipo && tarifaDeOferta(op, a.id))
    if (suyos.length === 0) continue
    const p = tarifaDeOferta(op, suyos[0].id)!
    salida.push({
      tipo,
      entry: { id: `${op.id}-${tipo}`, year: op.year, season: temporadaDe(op.month), apartmentType: tipo, ...p },
      quien: suyos.map(a => a.name.replace(/^Apartamento /, '')).join(', '),
    })
  }
  return salida
}

export default function Prices() {
  const { prices, offerPrices, apartments, addPrice, deleteOfferPrice } = useData()
  const [selectedYear, setSelectedYear] = useState(CURRENT_YEAR)
  const [editing, setEditing] = useState<PriceEntry | null>(null)
  const [showOfferForm, setShowOfferForm] = useState(false)
  const [editingOffer, setEditingOffer] = useState<OfferPrice | null>(null)
  /**
   * Las ofertas van desplegadas: son pocas —un mes suelto de temporada baja— y
   * lo que se quiere ver de ellas es la tabla, no el titular. Aquí solo se
   * apuntan las que se han plegado a mano.
   */
  const [plegadas, setPlegadas] = useState<string[]>([])
  /** Mientras se imprime una oferta sola, el resto de la pantalla no sale. */
  const [soloOferta, setSoloOferta] = useState<string | null>(null)
  /** La oferta que se está llevando a las reservas ya hechas. */
  const [aplicando, setAplicando] = useState<OfferPrice | null>(null)

  /**
   * Imprime una oferta sola, que es como se le presenta a la agencia: se
   * esconde todo lo demás, se manda a imprimir y se vuelve a dejar como estaba.
   */
  function imprimeOferta(id: string) {
    setSoloOferta(id)
    setPlegadas(p => p.filter(x => x !== id))
    // Un respiro para que React pinte antes de abrir el diálogo del navegador.
    setTimeout(() => { window.print(); setSoloOferta(null) }, 80)
  }

  // El año que viene siempre está en la lista aunque no tenga tarifa todavía:
  // es en enero cuando se prepara, y hay que poder llegar hasta él.
  const availableYears = [...new Set([
    ...prices.map(p => p.year), CURRENT_YEAR, CURRENT_YEAR + 1,
  ])].sort()
  const pricesBySeason = (season: Season) => prices.filter(p => p.season === season && p.year === selectedYear)

  /**
   * Crea la tarifa de un año partiendo de la del anterior.
   *
   * Es lo que pidió el propietario: un año nuevo nunca arranca en blanco, sino
   * con lo del año pasado ya puesto, para no teclear nada que no cambie. Si no
   * hay año anterior —el primero de todos— sí arranca a cero.
   */
  function creaTarifa(season: Season, aptType: ApartmentType) {
    const previa = prices.find(p =>
      p.year === selectedYear - 1 && p.season === season && p.apartmentType === aptType)
    setEditing(addPrice({
      year: selectedYear, season, apartmentType: aptType,
      price1week: previa?.price1week ?? 0,
      price2weeks: previa?.price2weeks ?? 0,
      price3weeks: previa?.price3weeks ?? 0,
      price1month: previa?.price1month ?? 0,
      cleaningFee: previa?.cleaningFee ?? 40,
    }))
  }

  function handleDeleteOffer(id: string) {
    if (!confirm('¿Eliminar tarifa de oferta?')) return
    deleteOfferPrice(id)
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Tabla de Precios"
        subtitle="Los precios se actualizan en Enero para el año siguiente"
        actions={
          <button onClick={() => window.print()}
            title="Abre el diálogo de impresión; ahí mismo se puede elegir «Guardar como PDF»"
            className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50">
            <Printer size={16} /> Imprimir / PDF
          </button>
        }
      />

      <div className={`print:hidden bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6 flex items-start gap-3 ${
        soloOferta ? 'hidden' : ''}`}>
        <Info size={16} className="text-blue-600 mt-0.5 shrink-0" />
        <div className="text-sm text-blue-700">
          <strong>Reglas de precio:</strong> Vacacional incluye 40€ limpieza. Prolongaciones = precio_contratado ÷ días × días_extra.
          Descuento 10% CON PAGO DE CONTADO para directos y VIP-B (desde 14/04/26). Canal inmobiliaria/Booking/Web = precio base +15% (limpieza no incluida, se cobra aparte).
          DIRECTOS y VIP-B no se publican en web.
        </div>
      </div>

      {/* Year selector */}
      <div className={`print:hidden flex gap-4 mb-6 ${soloOferta ? 'hidden' : ''}`}>
        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white text-slate-700">
          {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Price tables — both seasons */}
      <div className={`space-y-8 ${soloOferta ? 'hidden' : ''}`}>
        {(['VERANO', 'INVIERNO'] as Season[]).map(season => {
          const filtered = pricesBySeason(season)
          return (
            <div key={season}>
              <div className="flex items-center gap-2 mb-4 px-1">
                <span className={`text-sm font-bold px-3 py-1 rounded-full ${season === 'VERANO' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                  {season === 'VERANO' ? 'VERANO (May–Sep)' : 'INVIERNO (Oct–Abr)'}
                </span>
              </div>
              <div className="space-y-4">
                {(['1BR', '2BR', '2BR_ATICO', '3BR'] as ApartmentType[]).map(aptType => {
                  const entry = filtered.find(p => p.apartmentType === aptType)
                  if (!entry) {
                    const hayPrevia = prices.some(p =>
                      p.year === selectedYear - 1 && p.season === season && p.apartmentType === aptType)
                    return (
                      <div key={aptType} className="bg-white rounded-xl border border-dashed border-slate-300 p-4 text-center">
                        <p className="text-slate-400 text-sm">{APT_TYPE_LABELS[aptType]} — Sin precios para {season} {selectedYear}</p>
                        <button onClick={() => creaTarifa(season, aptType)}
                          className="mt-2 text-sm text-blue-600 hover:underline">
                          {hayPrevia ? `Cargar la tarifa de ${selectedYear - 1} y editarla` : '+ Añadir precios'}
                        </button>
                      </div>
                    )
                  }
                  return <PriceTable key={aptType} entry={entry} onEdit={() => setEditing(entry)} />
                })}
              </div>
            </div>
          )
        })}
      </div>

      {/* Offer Prices section */}
      <div className="mt-8">
        <div className={`flex items-center justify-between mb-4 ${soloOferta ? 'hidden' : ''}`}>
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
            {offerPrices.map(op => {
              const plegada = plegadas.includes(op.id)
              return (
              <div key={op.id}
                className={`bg-white rounded-xl border-2 border-amber-300 ${
                  soloOferta && soloOferta !== op.id ? 'hidden' : ''}`}>
               <div className="p-4 flex items-start justify-between gap-3 bg-amber-50 rounded-t-lg">
                <div>
                  {/* El distintivo de oferta, bien visible: en el papel que se
                      le lleva a la agencia no puede confundirse con la general. */}
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold tracking-wide px-2 py-0.5 rounded bg-amber-500 text-white">
                      TARIFA OFERTA
                    </span>
                    <span className="text-base font-bold text-amber-900 uppercase">
                      {MONTH_NAMES_ES[op.month - 1]} {op.year}
                    </span>
                  </p>
                  <p className="text-sm font-medium text-slate-700 mt-1">{op.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {nombresDe(op, apartments)} · manda sobre la tarifa general en ese mes
                    {op.sourceYear && op.sourceYear !== op.year && <> · con los precios de {op.sourceYear}</>}
                  </p>
                </div>
                <div className="print:hidden flex items-center gap-2 shrink-0">
                  {/* Llevar la oferta a las reservas de ese mes que ya
                      estaban hechas: cambiar los precios aquí no las movía
                      (propietario, 26/10/2026). */}
                  <button onClick={() => setAplicando(op)}
                    title="Aplicar esta oferta a las reservas de ese mes que ya estaban hechas"
                    className="px-2 py-1.5 text-xs font-medium text-amber-800 bg-amber-100 hover:bg-amber-200 rounded">
                    Aplicar a las reservas
                  </button>
                  <button onClick={() => imprimeOferta(op.id)}
                    title="Imprimir solo esta tarifa, o guardarla en PDF desde el mismo diálogo"
                    className="p-1.5 text-amber-700 hover:text-amber-900 rounded"><Printer size={15} /></button>
                  <button onClick={() => setPlegadas(p => plegada ? p.filter(x => x !== op.id) : [...p, op.id])}
                    title={plegada ? 'Ver la tabla' : 'Plegar'}
                    className="p-1.5 text-slate-400 hover:text-blue-600 rounded">
                    {plegada ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                  </button>
                  <button onClick={() => { setEditingOffer(op); setShowOfferForm(true) }}
                    className="p-1.5 text-slate-400 hover:text-blue-600 rounded"><Pencil size={14} /></button>
                  <button onClick={() => handleDeleteOffer(op.id)}
                    className="p-1.5 text-slate-400 hover:text-red-600 rounded"><Trash2 size={14} /></button>
                </div>
               </div>

               {/* Desplegada por defecto: la misma tabla que las generales de
                   arriba, con los canales y el precio por noche. */}
               {plegada ? (
                 <div className="px-4 py-3">
                   {lineasDeOferta(op, apartments).map(l => (
                     <p key={l} className="text-xs text-slate-500 tabular-nums">{l}</p>
                   ))}
                 </div>
               ) : (
                 <div className="p-4 space-y-4">
                   {tarifasDeOferta(op, apartments).map(({ tipo, entry, quien }) => (
                     <PriceTable key={tipo} entry={entry}
                       // «1 Dormitorio (104, 105) · 104, 105» decía lo mismo
                       // dos veces: el tipo va sin su lista y manda la de la oferta.
                       titulo={`${APT_TYPE_LABELS[tipo].replace(/\s*\(.*\)/, '')} · ${quien}`} />
                   ))}
                 </div>
               )}
              </div>
              )
            })}
          </div>
        )}
      </div>

      {editing && (
        <PriceEditModal entry={editing} onClose={() => setEditing(null)} />
      )}

      {aplicando && (
        <AplicarOferta oferta={aplicando} onClose={() => setAplicando(null)} />
      )}

      {showOfferForm && (
        <OfferPriceModal
          editing={editingOffer}
          onClose={() => { setShowOfferForm(false); setEditingOffer(null) }}
        />
      )}
    </div>
  )
}

function PriceTable({ entry, onEdit, titulo }: {
  entry: PriceEntry
  /** Sin esto no sale el botón: las tarifas de oferta se editan en su ficha. */
  onEdit?: () => void
  titulo?: string
}) {
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
        <h3 className="font-semibold text-slate-700 text-sm">{titulo ?? APT_TYPE_LABELS[entry.apartmentType]}</h3>
        {onEdit && (
          <button onClick={onEdit} className="print:hidden flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-700 font-medium">
            <Pencil size={13} /> Editar precios base
          </button>
        )}
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
                  <td className={`py-3 px-4 text-right ${(row as { isDirect?: boolean }).isDirect ? 'text-green-700 font-semibold' : 'text-slate-600'}`}>{numSuelto(row.base)} €</td>
                  <td className="py-3 px-4 text-right text-slate-500 text-xs">{entry.cleaningFee} €</td>
                  <td className="py-3 px-4 text-right text-slate-700 font-semibold">{numSuelto(calc.totalOwner)} €</td>
                  <td className="py-3 px-4 text-right text-amber-700 font-medium">{numSuelto(calc.realEstate)} €</td>
                  <td className="py-3 px-4 text-right text-violet-700 font-medium">{numSuelto(calc.booking)} €</td>
                  <td className="py-3 px-4 text-right font-bold text-green-700 bg-green-50">
                    {(row as { isDirect?: boolean }).isDirect ? '0' : numSuelto(calc.webPrice)} €
                  </td>
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

/**
 * «+5,9 %» o «−3 %» respecto del año anterior. Cadena vacía cuando el precio
 * no ha cambiado: al abrir el editor lo normal es que no haya cambiado nada
 * todavía, y una fila de «=» solo sería ruido.
 */
function variacion(actual: number, anterior: number): string {
  if (!anterior) return ''
  const pct = ((actual - anterior) / anterior) * 100
  if (Math.abs(pct) < 0.05) return ''
  const txt = num(Math.abs(pct), 1)
  return `${pct > 0 ? '+' : '−'}${txt} %`
}

/**
 * Editor de la tarifa de un año.
 *
 * Está pensado para lo que se hace de verdad cada enero: coger la tarifa del
 * año pasado y subirla un tanto por ciento. Por eso el año anterior está
 * presente todo el rato —debajo de cada casilla, en pequeño— y hay una casilla
 * de subida que rellena las cuatro de golpe. Cambiar un precio a mano sigue
 * valiendo: el porcentaje de esa línea se recalcula solo.
 */
function PriceEditModal({ entry, onClose }: { entry: PriceEntry; onClose: () => void }) {
  const { prices, updatePrice } = useData()
  const anterior = tarifaAnterior(prices, entry)

  const [p1w, setP1w] = useState(entry.price1week)
  const [p2w, setP2w] = useState(entry.price2weeks)
  const [p3w, setP3w] = useState(entry.price3weeks)
  const [p1m, setP1m] = useState(entry.price1month)
  const [cleaning, setCleaning] = useState(entry.cleaningFee)
  const [subida, setSubida] = useState('')

  function save() {
    updatePrice(entry.id, {
      price1week: p1w, price2weeks: p2w, price3weeks: p3w,
      price1month: p1m, cleaningFee: cleaning
    })
    onClose()
  }

  /**
   * Aplica el porcentaje a los cuatro precios base. Siempre sobre la tarifa
   * del año anterior, no sobre lo que haya en pantalla: así se puede teclear
   * 5, ver el resultado, probar con 7 y no ir acumulando subida sobre subida.
   * Sin año anterior, el punto de partida es lo que había al abrir.
   */
  function aplicaSubida() {
    const pct = Number(subida.replace(',', '.'))
    if (!Number.isFinite(pct)) return
    const base = anterior ?? entry
    const sube = (v: number) => Math.round(v * (1 + pct / 100))
    setP1w(sube(base.price1week))
    setP2w(sube(base.price2weeks))
    setP3w(sube(base.price3weeks))
    setP1m(sube(base.price1month))
  }

  const campos: [string, number, (v: number) => void, number | undefined][] = [
    ['1 Semana (7 días)', p1w, setP1w, anterior?.price1week],
    ['2 Semanas (14 días)', p2w, setP2w, anterior?.price2weeks],
    ['3 Semanas (21 días)', p3w, setP3w, anterior?.price3weeks],
    ['1 Mes (30 días)', p1m, setP1m, anterior?.price1month],
    ['Limpieza (€)', cleaning, setCleaning, anterior?.cleaningFee],
  ]

  return (
    <Modal title={`Editar precios — ${APT_TYPE_LABELS[entry.apartmentType]}`} onClose={onClose}>
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          {entry.season} {entry.year}
          {anterior && <> · comparado con <b className="text-slate-600">{entry.season} {anterior.year}</b></>}
        </p>

        {/* Casilla de subida: lo que se usa en enero para el año siguiente. */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex flex-wrap items-center gap-2">
          <label htmlFor="subida" className="text-sm text-blue-800">
            Subida sobre {anterior ? anterior.year : 'los precios actuales'}:
          </label>
          <div className="flex items-center gap-1">
            <input id="subida" type="number" step="0.5" value={subida} placeholder="0"
              onChange={e => setSubida(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') aplicaSubida() }}
              className="w-20 border border-blue-200 rounded-lg px-2 py-1.5 text-sm text-right bg-white" />
            <span className="text-sm text-blue-800">%</span>
          </div>
          <button onClick={aplicaSubida} disabled={subida.trim() === ''}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
            Aplicar
          </button>
          <span className="text-xs text-blue-700/80 w-full sm:w-auto">
            rellena las cuatro duraciones; la limpieza no se toca
          </span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {campos.map(([label, val, setter, previo]) => (
            <div key={label}>
              <label className="block text-xs font-medium text-slate-600 mb-1">{label}</label>
              <input type="number" value={val}
                onChange={e => setter(Number(e.target.value))}
                className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
              {/* La referencia del año pasado, justo debajo y en pequeño. */}
              {previo !== undefined && previo > 0 && (
                <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                  {anterior!.year}: {numSuelto(previo)} €
                  {variacion(val, previo) && (
                    <span className={`ml-1.5 font-medium ${val > previo ? 'text-emerald-600' : 'text-red-500'}`}>
                      {variacion(val, previo)}
                    </span>
                  )}
                </p>
              )}
            </div>
          ))}
        </div>

        <div className="bg-slate-50 rounded-lg p-3">
          <p className="text-xs text-slate-500 mb-2">Directo/Largo plazo (−10%):</p>
          <p className="text-sm font-medium text-slate-700">{(p1m * 0.9).toFixed(0)} € (mes) · {(p1w * 0.9).toFixed(0)} € (semana)</p>
        </div>

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={save} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Guardar</button>
        </div>
      </div>
    </Modal>
  )
}

/**
 * Alta y edición de una tarifa de oferta.
 *
 * Una oferta nunca se inventa desde cero: sale de la tarifa general de ese mes
 * y ese tipo de apartamento, subida o bajada un tanto por ciento. Por eso la
 * ventana abre con esa tarifa ya puesta, la enseña debajo de cada casilla como
 * referencia, y trae una casilla de ajuste con los atajos de ±10 %. Cambiar un
 * precio a mano sigue valiendo, y el porcentaje de esa línea se recalcula solo.
 *
 * Al cambiar el año, el mes o el tipo se vuelve a cargar la tarifa general que
 * corresponde: los precios que había dejarían de tener nada que ver.
 */
function OfferPriceModal({ editing, onClose }: { editing: OfferPrice | null; onClose: () => void }) {
  const { prices, apartments, addOfferPrice, updateOfferPrice } = useData()

  const hoy = new Date()
  const anioInicial = editing?.year ?? hoy.getFullYear()
  const mesInicial = editing?.month ?? hoy.getMonth() + 1
  const origenInicial = editing?.sourceYear ?? anioInicial

  /** Los apartamentos de la oferta. Una de las antiguas valía para todo su
   *  tipo, así que al abrirla se marcan todos los de ese tipo. */
  const seleccionInicial = editing
    ? (editing.apartments
      ?? apartments.filter(a => getApartmentType(a.id) === editing.apartmentType).map(a => a.id))
    : apartments.map(a => a.id)

  const [label, setLabel] = useState(editing?.label ?? '')
  const [year, setYear] = useState(anioInicial)
  const [month, setMonth] = useState(mesInicial)
  const [origen, setOrigen] = useState(origenInicial)
  // La temporada de la que se copian los precios. Normalmente la del mes en que
  // se aplica, pero se puede cambiar: nada impide ofrecer octubre al precio de
  // verano, y antes no había manera de pedirlo.
  const [origenTemporada, setOrigenTemporada] = useState<Season>(
    editing?.sourceSeason ?? temporadaDe(mesInicial))
  const [seleccion, setSeleccion] = useState<string[]>(seleccionInicial)
  const [ajuste, setAjuste] = useState('')

  /** Los precios de cada tipo. Al editar, los guardados; al crear, los de la
   *  tarifa general del año de origen. */
  const [precios, setPrecios] = useState<Partial<Record<ApartmentType, OfferTarifa>>>(() => {
    if (editing?.byType) return { ...editing.byType }
    if (editing?.apartmentType) {
      return { [editing.apartmentType]: {
        price1week: editing.price1week ?? 0, price2weeks: editing.price2weeks ?? 0,
        price3weeks: editing.price3weeks ?? 0, price1month: editing.price1month ?? 0,
        cleaningFee: editing.cleaningFee ?? 40,
      } }
    }
    return desdeGeneral(prices, origenInicial, editing?.sourceSeason ?? temporadaDe(mesInicial), seleccionInicial)
  })

  /** Los tipos que hay entre los apartamentos marcados, en el orden de la casa. */
  const tipos = tiposDe(seleccion, apartments)
  /** La tarifa general de cada tipo, para enseñarla debajo de cada casilla. */
  const generales = Object.fromEntries(tipos.map(t =>
    [t, tarifaGeneral(prices, origen, origenTemporada, t)])) as Partial<Record<ApartmentType, PriceEntry>>

  /** Vuelca la tarifa general de origen en las casillas. */
  function cargaGeneral(y: number, temporada: Season, ids: string[]) {
    setAjuste('')
    setPrecios(desdeGeneral(prices, y, temporada, ids))
  }

  /** Marca o desmarca un apartamento; los tipos nuevos entran con su general. */
  function marca(id: string) {
    const ids = seleccion.includes(id) ? seleccion.filter(x => x !== id) : [...seleccion, id]
    setSeleccion(ids)
    const tipo = getApartmentType(id)
    if (!seleccion.includes(id) && !precios[tipo]) {
      const g = tarifaGeneral(prices, origen, origenTemporada, tipo)
      if (g) setPrecios(p => ({ ...p, [tipo]: tarifaDe(g) }))
    }
  }

  /**
   * Aplica el porcentaje a los precios de todos los tipos. Siempre sobre la
   * tarifa general, no sobre lo que haya en pantalla: así se puede probar con
   * un 10, mirarlo, probar con un 15 y no ir acumulando subida sobre subida.
   * La limpieza no se toca, que no es un precio de alquiler.
   */
  function aplicaAjuste(pct: number) {
    if (!Number.isFinite(pct)) return
    const ap = (v: number) => Math.round(v * (1 + pct / 100))
    setPrecios(antes => {
      const nuevo = { ...antes }
      for (const t of tipos) {
        const g = generales[t]
        if (!g) continue
        nuevo[t] = {
          price1week: ap(g.price1week), price2weeks: ap(g.price2weeks),
          price3weeks: ap(g.price3weeks), price1month: ap(g.price1month),
          cleaningFee: antes[t]?.cleaningFee ?? g.cleaningFee,
        }
      }
      return nuevo
    })
  }

  function atajo(pct: number) {
    setAjuste(String(pct))
    aplicaAjuste(pct)
  }

  function cambiaPrecio(t: ApartmentType, campo: keyof OfferTarifa, v: number) {
    setPrecios(p => ({ ...p, [t]: { ...(p[t] ?? VACIA), [campo]: v } }))
  }

  function handleSave() {
    if (!label.trim()) return alert('Introduce una etiqueta')
    if (seleccion.length === 0) return alert('Marca al menos un apartamento')
    // Solo los tipos que siguen marcados: si se quita el ático, sus precios se
    // van con él y no quedan colgando en la ficha.
    const byType = Object.fromEntries(
      tipos.map(t => [t, precios[t] ?? VACIA])) as Partial<Record<ApartmentType, OfferTarifa>>
    const data = { label, year, month, sourceYear: origen, sourceSeason: origenTemporada, apartments: seleccion, byType }
    if (editing) updateOfferPrice(editing.id, data)
    else addOfferPrice(data)
    onClose()
  }

  const CAMPOS: [keyof OfferTarifa, string][] = [
    ['price1week', '1 Semana'], ['price2weeks', '2 Semanas'], ['price3weeks', '3 Semanas'],
    ['price1month', '1 Mes'], ['cleaningFee', 'Limpieza'],
  ]

  return (
    <Modal title={editing ? 'Editar tarifa de oferta' : 'Nueva tarifa de oferta'} onClose={onClose} size="lg">
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Etiqueta *</label>
          <input value={label} onChange={e => setLabel(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            placeholder="Ej: PRECIOS OFERTA ABRIL 2026" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Se aplica en el año</label>
            <input type="number" value={year} onChange={e => setYear(Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">y en el mes</label>
            <select value={month}
              onChange={e => {
                const v = Number(e.target.value)
                setMonth(v)
                // Al cambiar de mes se sigue a la temporada que le toca, salvo
                // que ya se haya elegido otra a mano.
                const t = temporadaDe(v)
                if (temporadaDe(month) === origenTemporada) setOrigenTemporada(t)
                cargaGeneral(origen, temporadaDe(month) === origenTemporada ? t : origenTemporada, seleccion)
              }}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {MONTH_NAMES_ES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </div>
        </div>

        {/* Los apartamentos a los que va la oferta. */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-medium text-slate-600">
              Apartamentos a los que se aplica
            </label>
            <div className="flex gap-2 text-xs">
              <button onClick={() => { const ids = apartments.map(a => a.id); setSeleccion(ids); cargaGeneral(origen, origenTemporada, ids) }}
                className="text-blue-600 hover:underline">Todos</button>
              <button onClick={() => setSeleccion([])} className="text-slate-400 hover:underline">Ninguno</button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {apartments.map(a => {
              const puesto = seleccion.includes(a.id)
              return (
                <button key={a.id} onClick={() => marca(a.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${puesto
                    ? 'bg-blue-600 border-blue-600 text-white font-medium'
                    : 'bg-white border-slate-200 text-slate-600 hover:border-blue-300'}`}>
                  {a.name}
                </button>
              )
            })}
          </div>
        </div>

        {/* De dónde salen los precios, y el ajuste en %. */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 space-y-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-blue-800">
            <span>Con los precios de la tarifa general de</span>
            <select value={origen}
              onChange={e => { const v = Number(e.target.value); setOrigen(v); cargaGeneral(v, origenTemporada, seleccion) }}
              className="border border-blue-200 rounded-lg px-2 py-1 text-sm bg-white">
              {aniosConTarifa(prices, year).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            <select value={origenTemporada}
              onChange={e => { const v = e.target.value as Season; setOrigenTemporada(v); cargaGeneral(origen, v, seleccion) }}
              className="border border-blue-200 rounded-lg px-2 py-1 text-sm bg-white">
              <option value="INVIERNO">Invierno (Oct–Abr)</option>
              <option value="VERANO">Verano (May–Sep)</option>
            </select>
            {origenTemporada !== temporadaDe(month) && (
              <span className="text-blue-700">
                — ojo: {MONTH_NAMES_ES[month - 1].toLowerCase()} es de {temporadaDe(month).toLowerCase()}
              </span>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="ajuste" className="text-sm text-blue-800">Ajuste:</label>
            <div className="flex items-center gap-1">
              <input id="ajuste" type="number" step="0.5" value={ajuste} placeholder="0"
                onChange={e => setAjuste(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') aplicaAjuste(Number(e.currentTarget.value.replace(',', '.'))) }}
                className="w-20 border border-blue-200 rounded-lg px-2 py-1.5 text-sm text-right bg-white" />
              <span className="text-sm text-blue-800">%</span>
            </div>
            <button onClick={() => aplicaAjuste(Number(ajuste.replace(',', '.')))} disabled={ajuste.trim() === ''}
              className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-40">
              Aplicar
            </button>
            <button onClick={() => atajo(10)}
              className="px-3 py-1.5 text-sm border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100">+10 %</button>
            <button onClick={() => atajo(-10)}
              className="px-3 py-1.5 text-sm border border-blue-300 text-blue-700 rounded-lg hover:bg-blue-100">−10 %</button>
            <button onClick={() => cargaGeneral(origen, origenTemporada, seleccion)}
              className="px-3 py-1.5 text-sm text-blue-700 rounded-lg hover:bg-blue-100">Volver a la general</button>
          </div>
          <p className="text-xs text-blue-700/80">
            El porcentaje se aplica siempre sobre la tarifa general, nunca sobre lo que ya hay en
            pantalla. La limpieza no se toca, y cualquier precio se puede corregir a mano.
          </p>
        </div>

        {/* Un bloque de precios por cada tipo que haya entre los marcados: un
            ático y un estudio no valen lo mismo aunque la oferta sea la misma. */}
        {tipos.length === 0 ? (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
            Marca los apartamentos a los que se aplica la oferta.
          </p>
        ) : tipos.map(t => {
          const g = generales[t]
          const v = precios[t] ?? VACIA
          return (
            <div key={t} className="border border-slate-200 rounded-lg p-3">
              <p className="text-xs font-semibold text-slate-700 mb-2">
                {APT_TYPE_LABELS[t]}
                <span className="font-normal text-slate-400">
                  {' · '}{seleccion.filter(id => getApartmentType(id) === t)
                    .map(id => apartments.find(a => a.id === id)?.name ?? id).join(', ')}
                </span>
              </p>
              {!g && (
                <p className="text-xs text-amber-700 mb-2">
                  No hay tarifa general de {origenTemporada} {origen} para este tipo: hay que teclear los precios.
                </p>
              )}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                {CAMPOS.map(([campo, nombre]) => {
                  const ref = g?.[campo]
                  return (
                    <div key={campo}>
                      <label className="block text-[11px] font-medium text-slate-600 mb-1">{nombre} (€)</label>
                      <input type="number" value={v[campo]}
                        onChange={e => cambiaPrecio(t, campo, Number(e.target.value))}
                        className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-sm" />
                      {ref !== undefined && ref > 0 && (
                        <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                          General: {numSuelto(ref)} €
                          {variacion(v[campo], ref) && (
                            <span className={`ml-1 font-medium ${v[campo] > ref ? 'text-emerald-600' : 'text-red-500'}`}>
                              {variacion(v[campo], ref)}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}

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

const VACIA: OfferTarifa = {
  price1week: 0, price2weeks: 0, price3weeks: 0, price1month: 0, cleaningFee: 40,
}

/** Los precios de una tarifa general, sin lo que no es precio. */
function tarifaDe(g: PriceEntry): OfferTarifa {
  return {
    price1week: g.price1week, price2weeks: g.price2weeks, price3weeks: g.price3weeks,
    price1month: g.price1month, cleaningFee: g.cleaningFee,
  }
}

/** Los años que tienen tarifa cargada, de nuevo a viejo, y el de la oferta. */
function aniosConTarifa(prices: PriceEntry[], year: number): number[] {
  return [...new Set([...prices.map(p => p.year), year])].sort((a, b) => b - a)
}

/** Los tipos de apartamento que hay entre unos ids, sin repetir. */
function tiposDe(ids: string[], apartments: { id: string }[]): ApartmentType[] {
  const orden: ApartmentType[] = ['1BR', '2BR', '2BR_ATICO', '3BR']
  const hay = new Set(ids.filter(id => apartments.some(a => a.id === id)).map(getApartmentType))
  return orden.filter(t => hay.has(t))
}

/** Un juego de precios por tipo, sacado de la tarifa general de ese año. */
function desdeGeneral(
  prices: PriceEntry[], year: number, season: Season, ids: string[],
): Partial<Record<ApartmentType, OfferTarifa>> {
  const salida: Partial<Record<ApartmentType, OfferTarifa>> = {}
  for (const t of new Set(ids.map(getApartmentType))) {
    const g = tarifaGeneral(prices, year, season, t)
    if (g) salida[t] = tarifaDe(g)
  }
  return salida
}
