import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Printer } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { MONTH_NAMES_ES, getDaysInMonth } from '../lib/dateUtils'
import { calcIGIC } from '../lib/priceCalc'
import { deducibleGasto, deducibleReparacion, nochesOcupadas, mapaOcupaciones, redondea } from '../lib/deducible'
import PageHeader from '../components/ui/PageHeader'

/** Todo el año, un trimestre o un mes suelto: son los tres cortes con los que
 *  se mira el negocio (el trimestre, además, es el periodo del IGIC). */
type Periodo = 'anual' | 'T1' | 'T2' | 'T3' | 'T4' | `M${number}`

const TRIMESTRES: Record<string, number[]> = {
  T1: [1, 2, 3], T2: [4, 5, 6], T3: [7, 8, 9], T4: [10, 11, 12],
}

function mesesDe(periodo: Periodo): number[] {
  if (periodo === 'anual') return [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]
  if (periodo in TRIMESTRES) return TRIMESTRES[periodo]
  return [Number(periodo.slice(1))]
}

function etiquetaPeriodo(periodo: Periodo, year: number): string {
  if (periodo === 'anual') return String(year)
  if (periodo in TRIMESTRES) return `${periodo.slice(1)}T ${year}`
  return `${MONTH_NAMES_ES[Number(periodo.slice(1)) - 1]} ${year}`
}

export default function Analytics() {
  const { reservations, payments, repairs, expenses, incomes, occupancies, apartments: allApartments } = useData()
  const [year, setYear] = useState(new Date().getFullYear())
  const [periodo, setPeriodo] = useState<Periodo>('anual')
  const [aptFiltro, setAptFiltro] = useState('')

  const activos = allApartments.filter(a => a.active)
  const apartments = aptFiltro ? activos.filter(a => a.id === aptFiltro) : activos
  const meses = mesesDe(periodo)
  const ocupDeclarada = useMemo(() => mapaOcupaciones(occupancies), [occupancies])

  /** Años con algún dato, no solo con cobros. */
  const years = useMemo(() => {
    const s = new Set<string>()
    for (const p of payments) if (p.paymentDate) s.add(p.paymentDate.slice(0, 4))
    for (const r of reservations) if (r.checkIn) s.add(r.checkIn.slice(0, 4))
    for (const e of expenses) if (e.expenseDate) s.add(e.expenseDate.slice(0, 4))
    for (const r of repairs) if (r.repairDate) s.add(r.repairDate.slice(0, 4))
    for (const i of incomes) s.add(String(i.year))
    return [...s].filter(Boolean).sort((a, b) => b.localeCompare(a))
  }, [payments, reservations, expenses, repairs, incomes])

  /** Ingresos declarados del Excel, indexados por inmueble y mes. */
  const declarados = useMemo(() => {
    const m = new Map<string, number>()
    for (const i of incomes) {
      if (i.year !== year) continue
      m.set(`${i.apartmentId}|${i.month}`, (m.get(`${i.apartmentId}|${i.month}`) || 0) + i.amount)
    }
    return m
  }, [incomes, year])

  /** Si el ejercicio tiene ingresos del Excel, esos mandan y los cobros pasan a
   *  ser comprobación. Si no los hay, se sigue calculando desde los cobros. */
  const hayDeclarados = declarados.size > 0

  const aptDeReserva = useMemo(() => {
    const m = new Map<string, string>()
    for (const r of reservations) m.set(r.id, r.apartmentId)
    return m
  }, [reservations])

  /** ¿Cae la fecha dentro del año y del periodo elegidos? */
  const enPeriodo = (fecha?: string) => {
    if (!fecha) return false
    const [y, m] = fecha.split('-')
    return Number(y) === year && meses.includes(Number(m))
  }

  const visible = (aptId: string) => !aptFiltro || aptId === aptFiltro

  // ── Cifras por apartamento ──────────────────────────────────────────────────
  const porApartamento = apartments.map(apt => {
    const diasPeriodo = meses.reduce((s, m) => s + getDaysInMonth(year, m), 0)
    // Con ocupación declarada, las noches salen de ella: son las que sustentan
    // el prorrateo, así que lo que se enseña y lo que se calcula coinciden.
    const noches = Math.round(meses.reduce((s, m) => {
      const dias = getDaysInMonth(year, m)
      const decl = ocupDeclarada.get(`${apt.id}|${year}|${m}`)
      return s + (decl !== undefined ? decl * dias : nochesOcupadas(reservations, apt.id, year, m))
    }, 0))

    const cobrado = payments
      .filter(p => p.received && enPeriodo(p.paymentDate) && aptDeReserva.get(p.reservationId) === apt.id)
      .reduce((s, p) => s + p.amount, 0)
    const declarado = meses.reduce((s, m) => s + (declarados.get(`${apt.id}|${m}`) || 0), 0)
    const ingresos = hayDeclarados ? declarado : cobrado

    const gastosApt = expenses.filter(e => e.apartmentId === apt.id && enPeriodo(e.expenseDate))
    const repsApt = repairs.filter(r => r.apartmentId === apt.id && enPeriodo(r.repairDate))

    const gastos = gastosApt.reduce((s, e) => s + (e.amount || 0), 0)
      + repsApt.reduce((s, r) => s + (r.amount || 0), 0)
    const deducible = gastosApt.reduce((s, e) => s + deducibleGasto(e, reservations, ocupDeclarada), 0)
      + repsApt.reduce((s, r) => s + deducibleReparacion(r, reservations, ocupDeclarada), 0)

    return {
      apt, noches, diasLibres: diasPeriodo - noches,
      ocupacion: diasPeriodo ? Math.round((noches / diasPeriodo) * 100) : 0,
      ingresos: redondea(ingresos), cobrado: redondea(cobrado), gastos: redondea(gastos), deducible: redondea(deducible),
      resultado: redondea(ingresos - deducible), igic: calcIGIC(ingresos),
    }
  })

  const totIngresos = redondea(porApartamento.reduce((s, a) => s + a.ingresos, 0))
  const totGastos = redondea(porApartamento.reduce((s, a) => s + a.gastos, 0))
  const totDeducible = redondea(porApartamento.reduce((s, a) => s + a.deducible, 0))
  const totResultado = redondea(totIngresos - totDeducible)
  const totCobrado = redondea(porApartamento.reduce((s, a) => s + a.cobrado, 0))
  const totNoches = porApartamento.reduce((s, a) => s + a.noches, 0)
  const totDiasLibres = porApartamento.reduce((s, a) => s + a.diasLibres, 0)

  // ── Resumen general mes a mes ───────────────────────────────────────────────
  const resumenMensual = Array.from({ length: 12 }, (_, i) => {
    const m = i + 1
    const clave = `${year}-${String(m).padStart(2, '0')}`
    const dentro = meses.includes(m)

    const cobrado = payments
      .filter(p => p.received && p.paymentDate?.startsWith(clave) && visible(aptDeReserva.get(p.reservationId) || ''))
      .reduce((s, p) => s + p.amount, 0)
    const declarado = [...declarados.entries()]
      .filter(([k]) => k.endsWith(`|${m}`) && visible(k.split('|')[0]))
      .reduce((s, [, v]) => s + v, 0)
    const ingresos = hayDeclarados ? declarado : cobrado
    const gastosMes = expenses.filter(e => e.expenseDate?.startsWith(clave) && visible(e.apartmentId))
    const repsMes = repairs.filter(r => r.repairDate?.startsWith(clave) && visible(r.apartmentId))
    const gastos = gastosMes.reduce((s, e) => s + (e.amount || 0), 0)
      + repsMes.reduce((s, r) => s + (r.amount || 0), 0)
    const deducible = gastosMes.reduce((s, e) => s + deducibleGasto(e, reservations, ocupDeclarada), 0)
      + repsMes.reduce((s, r) => s + deducibleReparacion(r, reservations, ocupDeclarada), 0)

    return {
      mes: MONTH_NAMES_ES[i], abrev: MONTH_NAMES_ES[i].slice(0, 3), dentro,
      ingresos: redondea(ingresos), cobrado: redondea(cobrado), gastos: redondea(gastos),
      deducible: redondea(deducible), resultado: redondea(ingresos - deducible),
    }
  })

  const grafico = resumenMensual.filter(m => m.dentro).map(m => ({
    month: m.abrev,
    ingresos: Math.round(m.ingresos),
    gastos: Math.round(m.gastos),
    resultado: Math.round(m.resultado),
  }))

  const eur = (n: number) => `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
  const titulo = etiquetaPeriodo(periodo, year)

  return (
    <div className="p-6">
      <PageHeader
        title="Analítica y Rentabilidad"
        subtitle={`${titulo}${aptFiltro ? ` · ${apartments[0]?.name ?? ''}` : ' · todos los apartamentos'}`}
        actions={
          <div className="flex gap-2 flex-wrap print:hidden">
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              {(years.length ? years : [String(year)]).map(y => <option key={y} value={y}>{y}</option>)}
            </select>

            <select value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="anual">Todo el año</option>
              <optgroup label="Trimestre">
                <option value="T1">1T (Ene–Mar)</option>
                <option value="T2">2T (Abr–Jun)</option>
                <option value="T3">3T (Jul–Sep)</option>
                <option value="T4">4T (Oct–Dic)</option>
              </optgroup>
              <optgroup label="Mes">
                {MONTH_NAMES_ES.map((n, i) => (
                  <option key={n} value={`M${i + 1}`}>{n}</option>
                ))}
              </optgroup>
            </select>

            <select value={aptFiltro} onChange={e => setAptFiltro(e.target.value)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="">Todos los apartamentos</option>
              {activos.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>

            <button onClick={() => window.print()}
              className="flex items-center gap-2 px-3 py-2 border border-slate-200 rounded-lg text-sm text-slate-700 hover:border-blue-300 hover:text-blue-700">
              <Printer size={15} /> Imprimir
            </button>
          </div>
        }
      />

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500">Ingresos {titulo}</p>
          <p className="text-2xl font-bold text-green-700 mt-1">{eur(totIngresos)}</p>
          <p className="text-xs text-slate-400 mt-0.5">
            IGIC 7%: {eur(calcIGIC(totIngresos))} · {hayDeclarados ? 'según Excel' : 'según cobros'}
          </p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500">Gastos totales</p>
          <p className="text-2xl font-bold text-red-700 mt-1">{eur(totGastos)}</p>
          <p className="text-xs text-slate-400 mt-0.5">gastos + reparaciones</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500">Gasto deducible</p>
          <p className="text-2xl font-bold text-amber-700 mt-1">{eur(totDeducible)}</p>
          <p className="text-xs text-slate-400 mt-0.5">prorrateado por ocupación</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm">
          <p className="text-xs text-slate-500">Resultado</p>
          <p className={`text-2xl font-bold mt-1 ${totResultado >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
            {eur(totResultado)}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            Margen: {totIngresos > 0 ? Math.round((totResultado / totIngresos) * 100) : 0}%
          </p>
        </div>
      </div>

      {/* Resumen general mes a mes */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden mb-6">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between gap-3 flex-wrap">
          <h2 className="font-semibold text-slate-700 text-sm">Resumen general — {year}</h2>
          <span className="text-xs text-slate-500">
            {hayDeclarados
              ? 'Ingresos según el Excel · «Cobrado» es lo registrado en la app'
              : 'Ingresos calculados a partir de los cobros registrados'}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-2.5 px-4 font-medium text-slate-600">Mes</th>
                <th className="text-right py-2.5 px-4 font-medium text-green-700">Ingresos</th>
                {hayDeclarados && (
                  <>
                    <th className="text-right py-2.5 px-4 font-medium text-slate-500">Cobrado</th>
                    <th className="text-right py-2.5 px-4 font-medium text-slate-500">Dif.</th>
                  </>
                )}
                <th className="text-right py-2.5 px-4 font-medium text-red-700">Gastos</th>
                <th className="text-right py-2.5 px-4 font-medium text-amber-700">Deducible</th>
                <th className="text-right py-2.5 px-4 font-medium text-blue-700">Resultado</th>
              </tr>
            </thead>
            <tbody>
              {resumenMensual.map(m => (
                <tr key={m.mes}
                  className={`border-b border-slate-100 ${m.dentro ? 'hover:bg-slate-50' : 'opacity-40'}`}>
                  <td className="py-2 px-4 text-slate-700">{m.mes}</td>
                  <td className="py-2 px-4 text-right text-green-700 tabular-nums">{eur(m.ingresos)}</td>
                  {hayDeclarados && (
                    <>
                      <td className="py-2 px-4 text-right text-slate-500 tabular-nums">{eur(m.cobrado)}</td>
                      <td className={`py-2 px-4 text-right tabular-nums ${
                        Math.abs(m.ingresos - m.cobrado) < 0.005 ? 'text-slate-300' : 'text-amber-700'
                      }`}>
                        {Math.abs(m.ingresos - m.cobrado) < 0.005 ? '—' : eur(redondea(m.ingresos - m.cobrado))}
                      </td>
                    </>
                  )}
                  <td className="py-2 px-4 text-right text-red-700 tabular-nums">{eur(m.gastos)}</td>
                  <td className="py-2 px-4 text-right text-amber-700 tabular-nums">{eur(m.deducible)}</td>
                  <td className="py-2 px-4 text-right font-semibold text-blue-700 tabular-nums">{eur(m.resultado)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td className="py-3 px-4 font-bold text-slate-700">TOTAL {titulo}</td>
                <td className="py-3 px-4 text-right font-bold text-green-700 tabular-nums">{eur(totIngresos)}</td>
                {hayDeclarados && (
                  <>
                    <td className="py-3 px-4 text-right font-semibold text-slate-600 tabular-nums">{eur(totCobrado)}</td>
                    <td className="py-3 px-4 text-right font-semibold text-amber-700 tabular-nums">
                      {eur(redondea(totIngresos - totCobrado))}
                    </td>
                  </>
                )}
                <td className="py-3 px-4 text-right font-bold text-red-700 tabular-nums">{eur(totGastos)}</td>
                <td className="py-3 px-4 text-right font-bold text-amber-700 tabular-nums">{eur(totDeducible)}</td>
                <td className="py-3 px-4 text-right font-bold text-blue-700 tabular-nums">{eur(totResultado)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Gráfico */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 mb-6">
        <h2 className="font-semibold text-slate-700 text-sm mb-4">Ingresos, gastos y resultado — {titulo}</h2>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={grafico} margin={{ top: 5, right: 20, left: 10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
            <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
            <Tooltip formatter={(v) => `${Number(v).toLocaleString('es-ES')} €`} />
            <Legend />
            <Bar dataKey="ingresos" name="Ingresos" fill="#22c55e" radius={[3, 3, 0, 0]} />
            <Bar dataKey="gastos" name="Gastos" fill="#ef4444" radius={[3, 3, 0, 0]} />
            <Bar dataKey="resultado" name="Resultado" fill="#3b82f6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detalle por apartamento */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-200 bg-slate-50">
          <h2 className="font-semibold text-slate-700 text-sm">Detalle por apartamento — {titulo}</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-3 px-4 font-medium text-slate-600">Apartamento</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600">Noches</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600">Libres</th>
                <th className="text-right py-3 px-4 font-medium text-slate-600">Ocupación</th>
                <th className="text-right py-3 px-4 font-medium text-green-700">Ingresos</th>
                <th className="text-right py-3 px-4 font-medium text-red-700">Gastos</th>
                <th className="text-right py-3 px-4 font-medium text-amber-700">Deducible</th>
                <th className="text-right py-3 px-4 font-medium text-blue-700">Resultado</th>
                <th className="text-right py-3 px-4 font-medium text-slate-500">IGIC 7%</th>
              </tr>
            </thead>
            <tbody>
              {porApartamento.map(a => (
                <tr key={a.apt.id} className="border-b border-slate-100 hover:bg-slate-50">
                  <td className="py-3 px-4 font-medium text-slate-700">{a.apt.name}</td>
                  <td className="py-3 px-4 text-right text-slate-600 tabular-nums">{a.noches}</td>
                  <td className="py-3 px-4 text-right text-amber-600 tabular-nums">{a.diasLibres}</td>
                  <td className="py-3 px-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <div className="w-16 bg-slate-200 rounded-full h-1.5">
                        <div className="bg-blue-500 h-1.5 rounded-full" style={{ width: `${a.ocupacion}%` }} />
                      </div>
                      <span className={`text-xs font-medium ${a.ocupacion >= 70 ? 'text-green-700' : a.ocupacion >= 40 ? 'text-amber-700' : 'text-red-700'}`}>
                        {a.ocupacion}%
                      </span>
                    </div>
                  </td>
                  <td className="py-3 px-4 text-right font-semibold text-green-700 tabular-nums">{eur(a.ingresos)}</td>
                  <td className="py-3 px-4 text-right text-red-700 tabular-nums">{a.gastos ? eur(a.gastos) : '—'}</td>
                  <td className="py-3 px-4 text-right text-amber-700 tabular-nums">{a.deducible ? eur(a.deducible) : '—'}</td>
                  <td className="py-3 px-4 text-right font-bold text-blue-700 tabular-nums">{eur(a.resultado)}</td>
                  <td className="py-3 px-4 text-right text-slate-500 text-xs tabular-nums">{eur(a.igic)}</td>
                </tr>
              ))}
              {porApartamento.length === 0 && (
                <tr><td colSpan={9} className="py-8 text-center text-slate-400 text-sm">No hay datos para este periodo</td></tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td className="py-3 px-4 font-bold text-slate-700">TOTAL</td>
                <td className="py-3 px-4 text-right font-semibold text-slate-700 tabular-nums">{totNoches}</td>
                <td className="py-3 px-4 text-right font-semibold text-amber-700 tabular-nums">{totDiasLibres}</td>
                <td className="py-3 px-4 text-right font-semibold text-blue-700 text-sm">
                  {totNoches + totDiasLibres > 0 ? Math.round((totNoches / (totNoches + totDiasLibres)) * 100) : 0}%
                </td>
                <td className="py-3 px-4 text-right font-bold text-green-700 tabular-nums">{eur(totIngresos)}</td>
                <td className="py-3 px-4 text-right font-bold text-red-700 tabular-nums">{eur(totGastos)}</td>
                <td className="py-3 px-4 text-right font-bold text-amber-700 tabular-nums">{eur(totDeducible)}</td>
                <td className="py-3 px-4 text-right font-bold text-blue-700 tabular-nums">{eur(totResultado)}</td>
                <td className="py-3 px-4 text-right font-semibold text-slate-600 text-xs tabular-nums">{eur(calcIGIC(totIngresos))}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
