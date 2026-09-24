import { useState, useCallback } from 'react'
import { FileSpreadsheet, Printer, AlertTriangle } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { calcIGIC } from '../lib/priceCalc'
import PageHeader from '../components/ui/PageHeader'
import { MONTH_NAMES_ES, formatDate, today } from '../lib/dateUtils'
import type { Apartment, Payment } from '../types'

const QUARTERS = [
  { q: 1, months: [1, 2, 3], label: '1T (Ene–Mar)' },
  { q: 2, months: [4, 5, 6], label: '2T (Abr–Jun)' },
  { q: 3, months: [7, 8, 9], label: '3T (Jul–Sep)' },
  { q: 4, months: [10, 11, 12], label: '4T (Oct–Dic)' },
]

const TODOS_LOS_MESES = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
/** Valor del selector de periodo que enseña los doce meses en una sola tabla. */
const ANUAL = -1

type SortBy = 'nombre' | 'importe'
/** Un bloque de la pantalla: un trimestre, un mes suelto o el año entero. */
type Bloque = { key: string; months: number[]; label: string; corto: string; totalLabel: string }

export default function Collections() {
  const { reservations, payments, apartments: allApartments } = useData()
  const apartments = allApartments.filter(a => a.active)
  const [year, setYear] = useState(new Date().getFullYear())
  const [filterQ, setFilterQ] = useState<number>(0)
  /** 0 = todos. Al elegir mes, el trimestre se ajusta solo al que lo contiene. */
  const [filterMes, setFilterMes] = useState<number>(0)
  const [sortBy, setSortBy] = useState<SortBy>('nombre')
  /** '' = todos. Un solo apartamento es como se cuadra contra el Excel. */
  const [filterApt, setFilterApt] = useState('')

  /**
   * Mes al que pertenece un cobro, «AAAA-MM».
   *
   * Manda el mes contable del Excel cuando lo trae: el alquiler de enero del
   * 106 se pagó el 31 de diciembre y cuenta en enero. Si no, la fecha del
   * movimiento, que es lo único que tienen los cobros metidos por la app.
   */
  const mesDe = useCallback((p: Payment) => p.mes || p.paymentDate?.slice(0, 7), [])

  /**
   * Apartamento de un cobro: el suyo propio si lo lleva —los del Excel van por
   * apartamento— y si no, el de la estancia de la que cuelga.
   */
  const aptDe = useCallback((p: Payment) => {
    if (p.apartmentId) return p.apartmentId
    const r = reservations.find(x => x.id === p.reservationId)
    return r && r.status !== 'cancelada' ? r.apartmentId : undefined
  }, [reservations])

  const years = [...new Set(payments.map(p => mesDe(p)?.slice(0, 4)).filter(Boolean))].sort((a, b) => b!.localeCompare(a!))

  const getMonthAmount = useCallback((aptId: string, month: number): number => {
    const monthStr = `${year}-${String(month).padStart(2, '0')}`
    return payments
      .filter(p => p.received && mesDe(p) === monthStr && aptDe(p) === aptId)
      .reduce((s, p) => s + p.amount, 0)
  }, [year, payments, mesDe, aptDe])

  const getQuarterTotal = useCallback((aptId: string, months: number[]): number =>
    months.reduce((s, m) => s + getMonthAmount(aptId, m), 0),
  [getMonthAmount])

  function sortApartments(apts: Apartment[], months: number[]): Apartment[] {
    if (sortBy === 'nombre') return [...apts].sort((a, b) => a.name.localeCompare(b.name))
    return [...apts].sort((a, b) => getQuarterTotal(b.id, months) - getQuarterTotal(a.id, months))
  }

  // Todo lo que se enseña y se suma respeta el apartamento elegido: si se está
  // mirando el 104, el total de abajo tiene que ser el del 104 y no el de la casa.
  const visibleApts = filterApt ? apartments.filter(a => a.id === filterApt) : apartments

  // Qué tablas se pintan. Un mes elegido manda sobre el trimestre, y «todos los
  // meses» pone los doce en una sola fila, que es como está el Excel.
  const bloques: Bloque[] = filterMes
    ? [{ key: `m${filterMes}`, months: [filterMes], label: `${MONTH_NAMES_ES[filterMes - 1]} ${year}`,
         corto: MONTH_NAMES_ES[filterMes - 1], totalLabel: 'TOTAL MES' }]
    : filterQ === ANUAL
      ? [{ key: 'anual', months: TODOS_LOS_MESES, label: `Todos los meses de ${year}`,
           corto: 'AÑO', totalLabel: 'TOTAL AÑO' }]
      : (filterQ ? QUARTERS.filter(qt => qt.q === filterQ) : QUARTERS).map(qt => ({
          key: `q${qt.q}`, months: qt.months, label: qt.label, corto: `${qt.q}T`, totalLabel: 'TRIMESTRE' }))

  const yearTotal = visibleApts.reduce((s, a) =>
    s + QUARTERS.reduce((q, qt) => q + getQuarterTotal(a.id, qt.months), 0), 0)

  /**
   * Lo que falta por cobrar del ejercicio.
   *
   * Esta pantalla contaba solo el dinero que ha entrado, así que una reserva
   * cobrada a medias no aparecía por ningún lado — es lo que dejó pasar el
   * pago parcial del 105. Se mira reserva a reserva: total menos lo cobrado.
   */
  const hoy = today()
  const saldos = reservations
    .filter(r => r.status !== 'cancelada' && r.checkIn.startsWith(String(year))
      && (!filterApt || r.apartmentId === filterApt))
    .map(r => {
      const cobrado = payments
        .filter(p => p.reservationId === r.id && p.received)
        .reduce((s, p) => s + p.amount, 0)
      return { r, cobrado, falta: Math.round((r.total - cobrado) * 100) / 100 }
    })
    .sort((a, b) => a.r.checkOut.localeCompare(b.r.checkOut))
  // Medio céntimo de margen: un redondeo no es un impago.
  const porCobrar = saldos.filter(x => x.falta > 0.005)
  /**
   * Lo cobrado de más. Pasa a menudo —se paga un mes redondo, se adelanta de
   * más— y hasta ahora no se veía en ninguna parte: la pantalla solo miraba
   * lo que faltaba. Ese dinero está cobrado y es del cliente hasta que se le
   * devuelve o se le descuenta de la siguiente estancia.
   */
  const aFavor = saldos.filter(x => x.falta < -0.005)
  const totalAFavor = Math.round(aFavor.reduce((s, x) => s - x.falta, 0) * 100) / 100

  const totalPorCobrar = Math.round(porCobrar.reduce((s, x) => s + x.falta, 0) * 100) / 100
  const vencidas = porCobrar.filter(x => x.r.checkOut < hoy)
  const totalVencido = Math.round(vencidas.reduce((s, x) => s + x.falta, 0) * 100) / 100
  const nombreApt = (id: string) => allApartments.find(a => a.id === id)?.name ?? id
  const eur = (n: number) =>
    `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

  function getAnnualBreakdown(aptId: string): { transferencia: number; efectivo: number; total: number } {
    const yearStr = String(year)
    const aptPayments = payments.filter(p =>
      p.received && mesDe(p)?.startsWith(yearStr) && aptDe(p) === aptId
    )
    let efectivo = 0
    let transferencia = 0
    for (const p of aptPayments) {
      if (p.paymentMethod) {
        if (p.paymentMethod === 'efectivo') efectivo += p.amount
        else transferencia += p.amount
      } else {
        const res = reservations.find(r => r.id === p.reservationId)
        if (res?.channel === 'directo') efectivo += p.amount
        else transferencia += p.amount
      }
    }
    return { transferencia, efectivo, total: efectivo + transferencia }
  }

  function exportCSV() {
    const fmt = (n: number) => n > 0 ? n.toLocaleString('es-ES', { minimumFractionDigits: 2 }) : '0,00'
    const rows: string[][] = []
    rows.push([`Cobros por Trimestres — ${year}`])
    rows.push([])

    for (const { months, label, corto } of bloques) {
      rows.push([label])
      rows.push(['Apartamento', ...months.map(m => MONTH_NAMES_ES[m - 1]), 'Total trimestre', 'IGIC 7%', 'Total con IGIC'])
      const sorted = sortApartments(visibleApts, months)
      for (const apt of sorted) {
        const monthAmounts = months.map(m => getMonthAmount(apt.id, m))
        const total = monthAmounts.reduce((s, a) => s + a, 0)
        if (total === 0) continue
        const igic = calcIGIC(total)
        rows.push([apt.name, ...monthAmounts.map(fmt), fmt(total), fmt(igic), fmt(total + igic)])
      }
      const qTotal = visibleApts.reduce((s, a) => s + getQuarterTotal(a.id, months), 0)
      const qIGIC = calcIGIC(qTotal)
      rows.push(['TOTAL ' + corto,
        ...months.map(m => fmt(visibleApts.reduce((s, a) => s + getMonthAmount(a.id, m), 0))),
        fmt(qTotal), fmt(qIGIC), fmt(qTotal + qIGIC)])
      rows.push([])
    }

    rows.push(['Resumen anual ' + year])
    rows.push(['Apartamento', 'Transferencia', 'Efectivo', 'Total', 'IGIC 7%', 'Total con IGIC'])
    for (const apt of visibleApts) {
      const { transferencia, efectivo, total } = getAnnualBreakdown(apt.id)
      if (total === 0) continue
      const igic = calcIGIC(total)
      rows.push([apt.name, fmt(transferencia), fmt(efectivo), fmt(total), fmt(igic), fmt(total + igic)])
    }
    const igicTotal = calcIGIC(yearTotal)
    rows.push(['TOTAL ANUAL', '', '', fmt(yearTotal), fmt(igicTotal), fmt(yearTotal + igicTotal)])

    const csv = rows.map(r => r.map(c => `"${c}"`).join(';')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cobros_${year}${filterQ > 0 ? `_${filterQ}T` : ''}${filterMes ? `_${MONTH_NAMES_ES[filterMes - 1]}` : ''}${filterApt ? `_${filterApt}` : ''}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handlePrint() {
    window.print()
  }

  return (
    <div className="p-6">
      <style>{`
        @media print {
          body > * { display: none !important; }
          #collections-print { display: block !important; }
          #collections-print { position: fixed; inset: 0; background: white; padding: 20px; }
        }
        #collections-print { display: none; }
      `}</style>

      <PageHeader
        title="Total Cobrado por Trimestres"
        subtitle="IGIC incluido al 7%"
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              {(years.length ? years : [String(year)]).map(y => <option key={y} value={y!}>{y}</option>)}
            </select>
            <select value={filterQ} onChange={e => { setFilterQ(Number(e.target.value)); setFilterMes(0) }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value={0}>Trimestres (4 tablas)</option>
              <option value={ANUAL}>Todos los meses (una tabla)</option>
              {QUARTERS.map(qt => <option key={qt.q} value={qt.q}>{qt.label}</option>)}
            </select>
            <select value={filterMes} onChange={e => { setFilterMes(Number(e.target.value)); setFilterQ(0) }}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value={0}>Todos los meses</option>
              {MONTH_NAMES_ES.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select value={filterApt} onChange={e => setFilterApt(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">Todos los apartamentos</option>
              {apartments.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
            <select value={sortBy} onChange={e => setSortBy(e.target.value as SortBy)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="nombre">Ordenar por nombre</option>
              <option value="importe">Ordenar por importe</option>
            </select>
            <button onClick={exportCSV}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">
              <FileSpreadsheet size={15} /> Excel
            </button>
            <button onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 text-sm bg-slate-600 text-white rounded-lg hover:bg-slate-700 font-medium">
              <Printer size={15} /> Imprimir / PDF
            </button>
          </div>
        }
      />

      {/* Lo que falta por cobrar va antes que lo cobrado: es lo que hay que
          mirar, y si está vacío ni siquiera aparece. */}
      {porCobrar.length > 0 && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-amber-200 overflow-hidden print:hidden">
          <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600 shrink-0" />
              <p className="text-sm font-semibold text-amber-900">
                Falta por cobrar de {year}: {eur(totalPorCobrar)}
              </p>
            </div>
            {totalVencido > 0 && (
              <p className="text-sm font-semibold text-red-700">
                {eur(totalVencido)} de estancias ya terminadas
              </p>
            )}
          </div>
          <table className="w-full text-sm" translate="no">
            <thead>
              <tr className="border-b border-slate-200 text-xs text-slate-500">
                <th className="text-left py-2 px-5 font-medium">Apartamento</th>
                <th className="text-left py-2 px-4 font-medium">Estancia</th>
                <th className="text-right py-2 px-4 font-medium">Total</th>
                <th className="text-right py-2 px-4 font-medium">Cobrado</th>
                <th className="text-right py-2 px-5 font-medium">Falta</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {porCobrar.map(({ r, cobrado, falta }) => {
                const vencida = r.checkOut < hoy
                return (
                  <tr key={r.id} className="border-b border-slate-100 last:border-0">
                    <td className="py-2 px-5 font-medium text-slate-700">{nombreApt(r.apartmentId)}</td>
                    <td className="py-2 px-4 text-slate-500 text-xs">
                      {formatDate(r.checkIn)} → {formatDate(r.checkOut)}
                      {vencida && <span className="ml-2 text-red-600 font-semibold">ya terminó</span>}
                    </td>
                    <td className="py-2 px-4 text-right text-slate-700">{eur(r.total)}</td>
                    <td className="py-2 px-4 text-right text-slate-500">{eur(cobrado)}</td>
                    <td className={`py-2 px-5 text-right font-semibold ${vencida ? 'text-red-600' : 'text-amber-700'}`}>
                      {eur(falta)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {aFavor.length > 0 && (
        <div className="mb-6 bg-white rounded-xl shadow-sm border border-blue-200 overflow-hidden print:hidden">
          <div className="bg-blue-50 border-b border-blue-200 px-5 py-3">
            <p className="text-sm font-semibold text-blue-900">
              Cobrado de más en {year}: {eur(totalAFavor)} · queda a favor del cliente
            </p>
            <p className="text-xs text-blue-800/80 mt-0.5">
              Para devolver, o para descontar de la siguiente estancia. El dinero ya entró y cuenta
              en el mes en que se cobró; esto solo recuerda que sobra.
            </p>
          </div>
          <table className="w-full text-sm" translate="no">
            <tbody className="tabular-nums">
              {aFavor.map(({ r, cobrado, falta }) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0">
                  <td className="py-2 px-5 font-medium text-slate-700">{nombreApt(r.apartmentId)}</td>
                  <td className="py-2 px-4 text-slate-500 text-xs">
                    {formatDate(r.checkIn)} → {formatDate(r.checkOut)}
                  </td>
                  <td className="py-2 px-4 text-right text-slate-700">{eur(r.total)}</td>
                  <td className="py-2 px-4 text-right text-slate-500">{eur(cobrado)}</td>
                  <td className="py-2 px-5 text-right font-semibold text-blue-700">+{eur(-falta)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="space-y-6" id="collections-screen">
        {bloques.map(({ key, months, label, corto, totalLabel }) => {
          const sorted = sortApartments(visibleApts, months)
          const qTotal = visibleApts.reduce((s, a) => s + getQuarterTotal(a.id, months), 0)
          const qIGIC = calcIGIC(qTotal)
          const qWithIGIC = qTotal + qIGIC
          return (
            <div key={key} className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-3 bg-slate-700">
                <h3 className="font-semibold text-white">{label}</h3>
                <div className="text-right">
                  <span className="text-white font-bold">{qTotal.toLocaleString('es-ES')} €</span>
                  <span className="text-slate-300 text-xs ml-3">IGIC: {qIGIC.toLocaleString('es-ES')} €</span>
                </div>
              </div>
              <div className="overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50">
                      <th className="text-left py-2.5 px-4 font-medium text-slate-600 w-40">Apartamento</th>
                      {months.map(m => (
                        <th key={m} className="text-right py-2.5 px-4 font-medium text-slate-600">
                          {MONTH_NAMES_ES[m - 1]}
                        </th>
                      ))}
                      <th className="text-right py-2.5 px-4 font-semibold text-slate-700 bg-slate-100">
                        {totalLabel}
                      </th>
                      <th className="text-right py-2.5 px-4 font-medium text-slate-500">IGIC 7%</th>
                      <th className="text-right py-2.5 px-4 font-medium text-slate-700 bg-amber-50">TOTAL</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sorted.map(apt => {
                      const monthAmounts = months.map(m => getMonthAmount(apt.id, m))
                      const total = monthAmounts.reduce((s, a) => s + a, 0)
                      if (total === 0) return null
                      const igic = calcIGIC(total)
                      return (
                        <tr key={apt.id} className="border-b border-slate-100 hover:bg-slate-50">
                          <td className="py-2.5 px-4 font-medium text-slate-700 text-xs">{apt.name}</td>
                          {monthAmounts.map((amount, i) => (
                            <td key={i} className="py-2.5 px-4 text-right text-slate-600 whitespace-nowrap">
                              {amount > 0 ? `${amount.toLocaleString('es-ES')} €` : <span className="text-slate-300">—</span>}
                            </td>
                          ))}
                          <td className="py-2.5 px-4 text-right font-bold text-slate-800 bg-slate-50 whitespace-nowrap">
                            {total.toLocaleString('es-ES')} €
                          </td>
                          <td className="py-2.5 px-4 text-right text-slate-500 text-xs whitespace-nowrap">
                            {igic.toLocaleString('es-ES')} €
                          </td>
                          <td className="py-2.5 px-4 text-right font-semibold text-amber-700 bg-amber-50 text-xs whitespace-nowrap">
                            {(total + igic).toLocaleString('es-ES')} €
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot className="border-t-2 border-slate-300 bg-slate-50">
                    <tr>
                      <td className="py-3 px-4 font-semibold text-slate-700">TOTAL {corto}</td>
                      {months.map(m => {
                        const mTotal = visibleApts.reduce((s, a) => s + getMonthAmount(a.id, m), 0)
                        return (
                          <td key={m} className="py-3 px-4 text-right font-semibold text-slate-700 whitespace-nowrap">
                            {mTotal > 0 ? `${mTotal.toLocaleString('es-ES')} €` : '—'}
                          </td>
                        )
                      })}
                      <td className="py-3 px-4 text-right font-bold text-slate-900 bg-slate-100 whitespace-nowrap">
                        {qTotal.toLocaleString('es-ES')} €
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-slate-600 whitespace-nowrap">
                        {qIGIC.toLocaleString('es-ES')} €
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-amber-700 bg-amber-50 whitespace-nowrap">
                        {qWithIGIC.toLocaleString('es-ES')} €
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )
        })}

        {/* Annual summary by apartment */}
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
          <div className="px-5 py-3 bg-slate-600">
            <h3 className="font-semibold text-white">Cobros Anuales {year} — Transferencia vs Efectivo</h3>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left py-2.5 px-4 font-medium text-slate-600">Apartamento</th>
                  <th className="text-right py-2.5 px-4 font-medium text-blue-700">Transferencia</th>
                  <th className="text-right py-2.5 px-4 font-medium text-green-700">Efectivo</th>
                  <th className="text-right py-2.5 px-4 font-semibold text-slate-700">Total</th>
                  <th className="text-right py-2.5 px-4 font-medium text-slate-500">IGIC 7%</th>
                  <th className="text-right py-2.5 px-4 font-medium text-amber-700 bg-amber-50">Total con IGIC</th>
                </tr>
              </thead>
              <tbody>
                {visibleApts.map(apt => {
                  const { transferencia, efectivo, total } = getAnnualBreakdown(apt.id)
                  if (total === 0) return null
                  const igic = calcIGIC(total)
                  return (
                    <tr key={apt.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-2.5 px-4 font-medium text-slate-700 text-xs">{apt.name}</td>
                      <td className="py-2.5 px-4 text-right text-blue-700 whitespace-nowrap">{transferencia > 0 ? `${transferencia.toLocaleString('es-ES')} €` : '—'}</td>
                      <td className="py-2.5 px-4 text-right text-green-700 whitespace-nowrap">{efectivo > 0 ? `${efectivo.toLocaleString('es-ES')} €` : '—'}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-slate-800 whitespace-nowrap">{total.toLocaleString('es-ES')} €</td>
                      <td className="py-2.5 px-4 text-right text-slate-500 text-xs whitespace-nowrap">{igic.toLocaleString('es-ES')} €</td>
                      <td className="py-2.5 px-4 text-right font-semibold text-amber-700 bg-amber-50 whitespace-nowrap">{(total + igic).toLocaleString('es-ES')} €</td>
                    </tr>
                  )
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 bg-slate-50">
                <tr>
                  <td className="py-3 px-4 font-semibold text-slate-700">TOTAL ANUAL</td>
                  <td className="py-3 px-4 text-right font-bold text-blue-700 whitespace-nowrap">
                    {visibleApts.reduce((s, a) => s + getAnnualBreakdown(a.id).transferencia, 0).toLocaleString('es-ES')} €
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-green-700 whitespace-nowrap">
                    {visibleApts.reduce((s, a) => s + getAnnualBreakdown(a.id).efectivo, 0).toLocaleString('es-ES')} €
                  </td>
                  <td className="py-3 px-4 text-right font-bold text-slate-900 whitespace-nowrap">{yearTotal.toLocaleString('es-ES')} €</td>
                  <td className="py-3 px-4 text-right font-semibold text-slate-600 whitespace-nowrap">{calcIGIC(yearTotal).toLocaleString('es-ES')} €</td>
                  <td className="py-3 px-4 text-right font-bold text-amber-700 bg-amber-50 whitespace-nowrap">{(yearTotal + calcIGIC(yearTotal)).toLocaleString('es-ES')} €</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Annual total */}
        <div className="bg-slate-900 rounded-xl p-5 flex items-center justify-between print:hidden">
          <div>
            <p className="text-slate-300 text-sm">Total anual {year}</p>
            <p className="text-white text-3xl font-bold mt-1">{yearTotal.toLocaleString('es-ES')} €</p>
          </div>
          <div className="text-right">
            <p className="text-slate-400 text-xs">IGIC 7% a declarar</p>
            <p className="text-amber-400 text-xl font-bold mt-1">{calcIGIC(yearTotal).toLocaleString('es-ES')} €</p>
          </div>
        </div>
      </div>
    </div>
  )
}
