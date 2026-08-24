import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { Printer } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { MONTH_NAMES_ES } from '../lib/dateUtils'
import { calcIGIC } from '../lib/priceCalc'
import { redondea } from '../lib/deducible'
import { cuentasDe, mesesDe, TRIMESTRES, type Periodo } from '../lib/cuentas'
import PageHeader from '../components/ui/PageHeader'

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

  const activos = useMemo(() => allApartments.filter(a => a.active), [allApartments])
  const apartments = useMemo(
    () => (aptFiltro ? activos.filter(a => a.id === aptFiltro) : activos),
    [activos, aptFiltro],
  )

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

  /** Los datos que necesitan las cuentas, ya acotados al filtro de apartamento. */
  const datos = useMemo(
    () => ({ apartments, reservations, payments, expenses, repairs, incomes, occupancies }),
    [apartments, reservations, payments, expenses, repairs, incomes, occupancies],
  )

  // Las cifras las lleva lib/cuentas.ts, el mismo cálculo que sale en la hoja
  // de la asesoría: así lo que se ve aquí y lo que se manda fuera no divergen.
  const cuentas = useMemo(() => cuentasDe(datos, year, mesesDe(periodo)), [datos, year, periodo])
  const { hayDeclarados, total } = cuentas

  const porApartamento = cuentas.porInmueble.map(c => ({ ...c, diasLibres: c.diasPeriodo - c.noches }))

  const totIngresos = total.ingresos
  const totGastos = total.gastos
  const totDeducible = total.deducible
  const totResultado = total.resultado
  const totCobrado = total.cobrado
  const totNoches = total.noches
  const totDiasLibres = total.diasPeriodo - total.noches

  // ── Resumen general mes a mes ───────────────────────────────────────────────
  const resumenMensual = useMemo(() => {
    const dentro = mesesDe(periodo)
    return Array.from({ length: 12 }, (_, i) => {
      const m = i + 1
      const t = cuentasDe(datos, year, [m]).total
      return {
        mes: MONTH_NAMES_ES[i], abrev: MONTH_NAMES_ES[i].slice(0, 3), dentro: dentro.includes(m),
        ingresos: t.ingresos, cobrado: t.cobrado, gastos: t.gastos,
        deducible: t.deducible, resultado: t.resultado,
      }
    })
  }, [datos, year, periodo])

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
