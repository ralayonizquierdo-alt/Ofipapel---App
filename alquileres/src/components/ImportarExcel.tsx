import { useState } from 'react'
import { Upload, AlertTriangle, CheckCircle2 } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { leerExcel, idGasto, idIngreso, idOcupacion, type ResultadoImport } from '../lib/importExcel'
import { EXPENSE_LABELS } from '../lib/deducible'
import type { Expense, ExpenseType, IngresoMensual, OcupacionMensual } from '../types'
import Modal from './ui/Modal'

const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

/**
 * Volcado del Excel «Resumen cobros y gastos». Siempre enseña una vista previa
 * antes de escribir: el fichero puede traer inmuebles que no reconozcamos o
 * conceptos nuevos, y conviene verlo antes de tocar los datos.
 */
export default function ImportarExcel({ onClose }: { onClose: () => void }) {
  const { importExpenses, importIncomes, importOccupancies, apartments } = useData()
  const [previo, setPrevio] = useState<ResultadoImport | null>(null)
  const [nombreFichero, setNombreFichero] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho] = useState(0)
  const [ingresosHechos, setIngresosHechos] = useState(0)

  async function elegirFichero(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (!f) return
    setError(''); setPrevio(null); setHecho(0); setNombreFichero(f.name)
    try {
      const r = await leerExcel(f)
      if (r.gastos.length === 0) {
        setError('No se ha encontrado ningún gasto. ¿Es el Excel de «Resumen cobros y gastos»?')
        return
      }
      setPrevio(r)
    } catch {
      setError('No se ha podido leer el fichero. Debe ser un .xlsx.')
    }
  }

  async function confirmar() {
    if (!previo) return
    setGuardando(true)
    try {
      const ahora = new Date().toISOString()
      const items: Expense[] = previo.gastos.map(g => ({
        id: idGasto(g),
        apartmentId: g.apartmentId,
        expenseDate: `${g.year}-${String(g.month).padStart(2, '0')}-01`,
        expenseType: g.expenseType,
        description: `${EXPENSE_LABELS[g.expenseType]} · importado del Excel`,
        amount: g.base,
        igic: g.igic || undefined,
        createdAt: ahora,
      }))
      await importExpenses(items)

      // Los ingresos brutos del Excel son la cifra que se declara: se guardan
      // aparte, sin tocar los cobros, y Analítica enseña ambos para comparar.
      const porMes = new Map<string, number>()
      for (const i of previo.ingresosPorInmueble) {
        const k = `${i.apartmentId}|${i.month}`
        porMes.set(k, (porMes.get(k) || 0) + i.base)
      }
      const ingresos: IngresoMensual[] = [...porMes.entries()].map(([k, amount]) => {
        const [apartmentId, mes] = k.split('|')
        const month = Number(mes)
        return { id: idIngreso(previo.year, apartmentId, month), apartmentId,
                 year: previo.year, month, amount, origen: 'excel' as const }
      })
      await importIncomes(ingresos)

      // La ocupación declarada es la que prorratea el gasto deducible. Sin ella
      // se usaría la de las reservas de la app, que pueden estar incompletas.
      const ocupaciones: OcupacionMensual[] = previo.ocupaciones.map(o => ({
        id: idOcupacion(previo.year, o.apartmentId, o.month),
        apartmentId: o.apartmentId, year: previo.year, month: o.month,
        diasAlquilados: o.diasAlquilados, diasTotales: o.diasTotales, origen: 'excel' as const,
      }))
      await importOccupancies(ocupaciones)

      setHecho(items.length)
      setIngresosHechos(ingresos.length)
      setPrevio(null)
    } catch {
      setError('No se han podido guardar los gastos. Revisa la conexión y vuelve a intentarlo.')
    }
    setGuardando(false)
  }

  const porConcepto = previo
    ? Object.entries(
        previo.gastos.reduce<Record<string, { n: number; total: number }>>((acc, g) => {
          const k = g.expenseType
          acc[k] = acc[k] || { n: 0, total: 0 }
          acc[k].n++; acc[k].total += g.base
          return acc
        }, {}),
      ).sort((a, b) => b[1].total - a[1].total)
    : []

  const totalPrevio = previo ? previo.gastos.reduce((s, g) => s + g.base, 0) : 0
  const nombreApt = (id: string) => apartments.find(a => a.id === id)?.name || id
  const inmuebles = previo ? [...new Set(previo.gastos.map(g => g.apartmentId))] : []
  // Un mes no puede tener más noches alquiladas que días: si pasa, el dato de
  // origen está mal y conviene decirlo en vez de arrastrarlo al deducible.
  const ocupacionImposible = previo
    ? previo.ocupaciones.filter(o => o.diasTotales > 0 && o.diasAlquilados > o.diasTotales)
    : []

  return (
    <Modal title="Importar Excel de gastos" onClose={onClose} size="lg">
      <div className="space-y-4">
        {hecho > 0 ? (
          <div className="bg-green-50 border border-green-300 rounded-lg p-4 flex gap-3">
            <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-semibold text-green-900">{hecho} apuntes cargados</p>
              <p className="text-sm text-green-800 mt-0.5">
                Y {ingresosHechos} meses de ingresos brutos y su ocupación. Ya aparecen
                en la lista de gastos y en Analítica.
              </p>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Sube el Excel de «Resumen cobros y gastos». Se cargan los conceptos de gasto
              (luz, IBI, basura, comunidad, comisiones…) y los ingresos brutos de cada
              mes. <strong>Las reparaciones no se importan</strong>: ya tienen su propia
              pantalla con proveedor y factura, y volcarlas aquí duplicaría el gasto.
            </p>

            <label className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
              <Upload size={22} className="text-slate-400" />
              <span className="text-sm font-medium text-slate-600">
                {nombreFichero || 'Elegir fichero .xlsx'}
              </span>
              <input type="file" accept=".xlsx" className="hidden" onChange={elegirFichero} />
            </label>
          </>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
            <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={16} />
            <p className="text-sm text-red-800">{error}</p>
          </div>
        )}

        {previo && (
          <>
            <div className="bg-slate-50 rounded-lg p-4 grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-slate-500">Ejercicio</p>
                <p className="text-xl font-bold text-slate-800">{previo.year}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Apuntes</p>
                <p className="text-xl font-bold text-slate-800">{previo.gastos.length}</p>
              </div>
              <div>
                <p className="text-xs text-slate-500">Total</p>
                <p className="text-xl font-bold text-blue-700">
                  {totalPrevio.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </p>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left py-2 px-3 font-medium text-slate-600">Concepto</th>
                    <th className="text-right py-2 px-3 font-medium text-slate-600">Apuntes</th>
                    <th className="text-right py-2 px-3 font-medium text-slate-600">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {porConcepto.map(([tipo, v]) => (
                    <tr key={tipo} className="border-b border-slate-100 last:border-0">
                      <td className="py-2 px-3 text-slate-700">{EXPENSE_LABELS[tipo as ExpenseType]}</td>
                      <td className="py-2 px-3 text-right text-slate-500">{v.n}</td>
                      <td className="py-2 px-3 text-right font-semibold text-slate-800">
                        {v.total.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-slate-500">
              Inmuebles detectados: {inmuebles.map(nombreApt).join(', ')}
            </p>

            {previo.ocupaciones.length > 0 && (
              <p className="text-xs text-slate-500">
                Se cargará también la ocupación declarada ({previo.ocupaciones.length} meses):
                es la que reparte el gasto deducible de cada inmueble.
              </p>
            )}

            {ocupacionImposible.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
                <p className="text-sm font-semibold text-amber-900 mb-1">
                  {ocupacionImposible.length} meses con más días alquilados que días tiene el mes
                </p>
                <p className="text-sm text-amber-900">
                  {ocupacionImposible.slice(0, 4).map(o =>
                    `${nombreApt(o.apartmentId)} ${MESES_CORTOS[o.month - 1]}: ${o.diasAlquilados}/${o.diasTotales}`
                  ).join(' · ')}
                  {ocupacionImposible.length > 4 && ' …'}
                  . Se contarán como 100% de ocupación, pero conviene revisarlos en el Excel.
                </p>
              </div>
            )}

            {previo.ingresosPorInmueble.length > 0 && (
              <p className="text-xs text-slate-500">
                Se cargarán además los ingresos brutos del ejercicio:{' '}
                <strong>
                  {previo.ingresosPorInmueble.reduce((s, i) => s + i.base, 0)
                    .toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
                </strong>. Los cobros no se tocan; Analítica mostrará ambos.
              </p>
            )}

            {previo.reparacionesIgnoradas.length > 0 && (
              <p className="text-xs text-slate-500">
                Se omiten {previo.reparacionesIgnoradas.length} líneas de reparaciones
                ({previo.reparacionesIgnoradas.reduce((s, r) => s + r.base, 0).toLocaleString('es-ES')} €),
                ya registradas en la pantalla de Reparaciones.
              </p>
            )}

            {previo.inmueblesNoReconocidos.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
                <p className="text-sm text-amber-900">
                  No se ha reconocido: {previo.inmueblesNoReconocidos.join(', ')}. Esos gastos
                  no se cargarán.
                </p>
              </div>
            )}

            <p className="text-xs text-slate-500">
              Si ya habías importado este mismo ejercicio, los apuntes se actualizan en vez de
              duplicarse.
            </p>
          </>
        )}

        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose}
            className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
            {hecho > 0 ? 'Cerrar' : 'Cancelar'}
          </button>
          {previo && (
            <button onClick={confirmar} disabled={guardando}
              className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-60">
              {guardando ? 'Cargando…' : `Cargar ${previo.gastos.length} apuntes`}
            </button>
          )}
        </div>
      </div>
    </Modal>
  )
}
