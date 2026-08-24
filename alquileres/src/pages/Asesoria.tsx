import { useMemo, useState } from 'react'
import { Printer } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { MONTH_NAMES_ES } from '../lib/dateUtils'
import { EXPENSE_LABELS } from '../lib/deducible'
import { cuentasDe, mesesDe, type Periodo } from '../lib/cuentas'
import type { ExpenseType } from '../types'
import PageHeader from '../components/ui/PageHeader'

const eur = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

const CONCEPTO_LABEL = (c: ExpenseType | 'reparaciones') =>
  c === 'reparaciones' ? 'Reparaciones y conservación' : EXPENSE_LABELS[c]

function etiqueta(periodo: Periodo, year: number): string {
  if (periodo === 'anual') return `Ejercicio ${year}`
  if (periodo.startsWith('T')) return `${periodo.slice(1)}º trimestre de ${year}`
  return `${MONTH_NAMES_ES[Number(periodo.slice(1)) - 1]} de ${year}`
}

/**
 * La hoja que se le manda a la asesoría.
 *
 * Solo las cifras que hacen falta para declarar, por inmueble y por periodo, y
 * pensada para imprimirse o guardarse en PDF tal cual. Nada de gráficas ni de
 * cosas de gestión: eso está en Analítica.
 *
 * Las cifras salen de lib/cuentas.ts, las mismas que enseña Analítica, para
 * que lo que se manda fuera y lo que se ve dentro no puedan discrepar.
 */
export default function Asesoria() {
  const { reservations, payments, repairs, expenses, incomes, occupancies, apartments } = useData()
  const [year, setYear] = useState(new Date().getFullYear() - 1)
  const [periodo, setPeriodo] = useState<Periodo>('anual')

  const years = useMemo(() => {
    const s = new Set<string>()
    for (const i of incomes) s.add(String(i.year))
    for (const e of expenses) if (e.expenseDate) s.add(e.expenseDate.slice(0, 4))
    for (const r of reservations) if (r.checkIn) s.add(r.checkIn.slice(0, 4))
    return [...s].filter(Boolean).sort((a, b) => b.localeCompare(a))
  }, [incomes, expenses, reservations])

  const cuentas = useMemo(
    () => cuentasDe(
      { apartments: apartments.filter(a => a.active), reservations, payments, expenses, repairs, incomes, occupancies },
      year, mesesDe(periodo),
    ),
    [apartments, reservations, payments, expenses, repairs, incomes, occupancies, year, periodo],
  )

  const { total } = cuentas
  const conDatos = cuentas.porInmueble.filter(c => c.ingresos || c.gastos || c.noches)

  /** Todos los conceptos que aparecen, para que la tabla tenga las mismas filas. */
  const conceptos = useMemo(() => {
    const s = new Set<ExpenseType | 'reparaciones'>()
    for (const c of conDatos) for (const g of c.porConcepto) if (g.gasto) s.add(g.concepto)
    return [...s]
  }, [conDatos])

  const gastoDe = (c: typeof conDatos[number], concepto: ExpenseType | 'reparaciones') =>
    c.porConcepto.find(g => g.concepto === concepto)?.gasto ?? 0
  const totalConcepto = (concepto: ExpenseType | 'reparaciones') =>
    conDatos.reduce((s, c) => s + gastoDe(c, concepto), 0)

  return (
    <div className="p-6 print:p-0">
      {/* En el papel manda la cabecera de abajo, con fecha de emisión */}
      <div className="print:hidden">
      <PageHeader
        title="Hoja para la asesoría"
        subtitle={etiqueta(periodo, year)}
        actions={
          <div className="flex flex-wrap gap-2">
            <select value={year} onChange={e => setYear(Number(e.target.value))}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              {(years.length ? years : [String(year)]).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={periodo} onChange={e => setPeriodo(e.target.value as Periodo)}
              className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
              <option value="anual">Todo el año</option>
              <option value="T1">1º trimestre</option>
              <option value="T2">2º trimestre</option>
              <option value="T3">3º trimestre</option>
              <option value="T4">4º trimestre</option>
            </select>
            <button onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 whitespace-nowrap">
              <Printer size={16} /> Imprimir
            </button>
          </div>
        }
      />
      </div>

      {/* Cabecera que solo se ve en el papel */}
      <div className="hidden print:block mb-4">
        <h1 className="text-lg font-bold">Alquileres vacacionales · {etiqueta(periodo, year)}</h1>
        <p className="text-xs text-slate-500">
          Emitido el {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {conDatos.length === 0 ? (
        <p className="text-slate-400 text-sm">No hay datos de ese periodo.</p>
      ) : (
        <div className="space-y-6">
          {/* ── Resumen ── */}
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden print:border-slate-400">
            <p className="px-4 py-2 text-sm font-semibold text-slate-700 border-b border-slate-100 bg-slate-50">
              Resumen por inmueble
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" translate="no">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium">Inmueble</th>
                    <th className="text-right py-2 px-3 font-medium whitespace-nowrap">Días alq.</th>
                    <th className="text-right py-2 px-3 font-medium whitespace-nowrap">Ocupación</th>
                    <th className="text-right py-2 px-3 font-medium whitespace-nowrap">Ingresos íntegros</th>
                    <th className="text-right py-2 px-3 font-medium whitespace-nowrap">Gastos</th>
                    <th className="text-right py-2 px-3 font-medium whitespace-nowrap">Gasto deducible</th>
                    <th className="text-right py-2 px-3 font-medium whitespace-nowrap">Rendimiento neto</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {conDatos.map(c => (
                    <tr key={c.apt.id} className="border-b border-slate-100">
                      <td className="py-2 px-3 font-medium text-slate-700">{c.apt.name}</td>
                      <td className="py-2 px-3 whitespace-nowrap text-right text-slate-600">{c.noches}</td>
                      <td className="py-2 px-3 whitespace-nowrap text-right text-slate-600">{c.ocupacion} %</td>
                      <td className="py-2 px-3 whitespace-nowrap text-right text-slate-800">{eur(c.ingresos)}</td>
                      <td className="py-2 px-3 whitespace-nowrap text-right text-slate-600">{eur(c.gastos)}</td>
                      <td className="py-2 px-3 whitespace-nowrap text-right text-slate-800">{eur(c.deducible)}</td>
                      <td className="py-2 px-3 whitespace-nowrap text-right font-semibold text-slate-900">{eur(c.resultado)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-semibold tabular-nums">
                    <td className="py-2 px-3">Total</td>
                    <td className="py-2 px-3 whitespace-nowrap text-right">{total.noches}</td>
                    <td className="py-2 px-3 whitespace-nowrap text-right">
                      {total.diasPeriodo ? Math.round((total.noches / total.diasPeriodo) * 100) : 0} %
                    </td>
                    <td className="py-2 px-3 whitespace-nowrap text-right">{eur(total.ingresos)}</td>
                    <td className="py-2 px-3 whitespace-nowrap text-right">{eur(total.gastos)}</td>
                    <td className="py-2 px-3 whitespace-nowrap text-right">{eur(total.deducible)}</td>
                    <td className="py-2 px-3 whitespace-nowrap text-right">{eur(total.resultado)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* ── Gastos por concepto ── */}
          <section className="bg-white rounded-xl border border-slate-200 overflow-hidden print:border-slate-400 break-inside-avoid">
            <p className="px-4 py-2 text-sm font-semibold text-slate-700 border-b border-slate-100 bg-slate-50">
              Gastos por concepto
            </p>
            <div className="overflow-x-auto">
              <table className="w-full text-sm" translate="no">
                <thead className="bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium">Concepto</th>
                    {conDatos.map(c => (
                      <th key={c.apt.id} className="text-right py-2 px-3 font-medium whitespace-nowrap">{c.apt.name}</th>
                    ))}
                    <th className="text-right py-2 px-3 font-medium whitespace-nowrap">Total</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {conceptos.map(concepto => (
                    <tr key={concepto} className="border-b border-slate-100">
                      <td className="py-2 px-3 text-slate-700">{CONCEPTO_LABEL(concepto)}</td>
                      {conDatos.map(c => (
                        <td key={c.apt.id} className="py-2 px-3 whitespace-nowrap text-right text-slate-600">
                          {gastoDe(c, concepto) ? eur(gastoDe(c, concepto)) : '—'}
                        </td>
                      ))}
                      <td className="py-2 px-3 whitespace-nowrap text-right font-medium text-slate-800">{eur(totalConcepto(concepto))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-slate-50 font-semibold tabular-nums">
                    <td className="py-2 px-3">Total gastos</td>
                    {conDatos.map(c => (
                      <td key={c.apt.id} className="py-2 px-3 whitespace-nowrap text-right">{eur(c.gastos)}</td>
                    ))}
                    <td className="py-2 px-3 whitespace-nowrap text-right">{eur(total.gastos)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </section>

          {/* ── IGIC ── */}
          <section className="bg-white rounded-xl border border-slate-200 p-4 print:border-slate-400 break-inside-avoid">
            <p className="text-sm font-semibold text-slate-700 mb-2">IGIC del periodo</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm tabular-nums" translate="no">
              <div>
                <p className="text-xs text-slate-500">Repercutido (7 % de los ingresos)</p>
                <p className="text-lg font-semibold text-slate-800">{eur(total.igic)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Soportado (según facturas)</p>
                <p className="text-lg font-semibold text-slate-800">{eur(total.igicSoportado)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Diferencia</p>
                <p className="text-lg font-semibold text-slate-900">{eur(total.igic - total.igicSoportado)}</p>
              </div>
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Calculado al 7 %. Si el alquiler está exento por no prestarse servicios de hostelería,
              esta parte no aplica: la decide la asesoría.
            </p>
          </section>

          {/* ── De dónde sale cada cifra ── */}
          <section className="text-xs text-slate-500 leading-relaxed border-t border-slate-200 pt-3">
            <p className="font-medium text-slate-600 mb-1">De dónde sale cada cifra</p>
            <p>
              <b>Ingresos íntegros</b>: {cuentas.hayDeclarados
                ? 'de los ingresos declarados en el Excel del ejercicio.'
                : 'de los cobros registrados en la aplicación, porque este ejercicio no tiene Excel cargado.'}
            </p>
            <p>
              <b>Gasto deducible</b>: los gastos ligados al alquiler van al 100 % (comisiones, limpieza,
              lavandería); los de la vivienda —luz, agua, IBI, basura, comunidad, profesionales,
              reparaciones— en proporción a los días alquilados de <i>ese</i> inmueble.
            </p>
            <p><b>Rendimiento neto</b>: ingresos íntegros menos gasto deducible.</p>
            {!cuentas.hayDeclarados && (
              <p className="text-amber-700 mt-1">
                Ojo: este ejercicio no tiene Excel cargado, así que los ingresos salen de los cobros de
                la aplicación y pueden estar incompletos.
              </p>
            )}
          </section>
        </div>
      )}
    </div>
  )
}
