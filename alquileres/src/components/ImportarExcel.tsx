import { useEffect, useMemo, useState } from 'react'
import { Upload, AlertTriangle, CheckCircle2, History } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { leerExcel, idGasto, idIngreso, idOcupacion, idReparacionDeclarada, type ResultadoImport } from '../lib/importExcel'
import { EXPENSE_LABELS } from '../lib/deducible'
import type { Expense, ExpenseType, IngresoMensual, OcupacionMensual, ReparacionMensual } from '../types'
import Modal from './ui/Modal'

const MESES_CORTOS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

/** Fecha guardada en ISO → algo legible, sin que una fecha rota rompa la lista. */
function fechaHora(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '¿?'
  return d.toLocaleString('es-ES', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

/**
 * Volcado del Excel «Resumen cobros y gastos». Siempre enseña una vista previa
 * antes de escribir: el fichero puede traer inmuebles que no reconozcamos o
 * conceptos nuevos, y conviene verlo antes de tocar los datos.
 */
export default function ImportarExcel(
  { onClose, ficheroInicial }: { onClose: () => void; ficheroInicial?: File },
) {
  const {
    importExpenses, importIncomes, importOccupancies, importRepairTotals, purgeImported,
    apartments, expenses, incomes, occupancies, repairTotals, importLogs, anotaVolcado,
  } = useData()
  const [previo, setPrevio] = useState<ResultadoImport | null>(null)
  const [nombreFichero, setNombreFichero] = useState('')
  const [error, setError] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [hecho, setHecho] = useState(0)
  const [ingresosHechos, setIngresosHechos] = useState(0)
  const [borrados, setBorrados] = useState(0)

  async function lee(f: File) {
    setError(''); setPrevio(null); setHecho(0); setBorrados(0); setNombreFichero(f.name)
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

  function elegirFichero(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    if (f) lee(f)
    e.target.value = ''   // así se puede volver a elegir el mismo fichero
  }

  // Cuando se llega soltando el fichero en el dashboard, ya viene elegido: hay
  // que leerlo al abrirse, que es lo que en la pantalla de Gastos hace el clic.
  useEffect(() => {
    if (ficheroInicial) lee(ficheroInicial)
  }, [ficheroInicial])

  /**
   * Lo que se va a escribir, ya con su id definitivo. Se calcula antes de
   * confirmar porque la vista previa necesita saber, además de lo que entra,
   * qué apuntes del Excel anterior van a desaparecer.
   */
  const preparado = useMemo(() => {
    if (!previo) return null
    const ahora = new Date().toISOString()

    const gastos: Expense[] = previo.gastos.map(g => ({
      id: idGasto(g),
      apartmentId: g.apartmentId,
      expenseDate: `${g.year}-${String(g.month).padStart(2, '0')}-01`,
      expenseType: g.expenseType,
      description: `${EXPENSE_LABELS[g.expenseType]} · importado del Excel`,
      amount: g.base,
      igic: g.igic || undefined,
      createdAt: ahora,
    }))

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

    // La ocupación declarada es la que prorratea el gasto deducible. Sin ella
    // se usaría la de las reservas de la app, que pueden estar incompletas.
    const ocupaciones: OcupacionMensual[] = previo.ocupaciones.map(o => ({
      id: idOcupacion(previo.year, o.apartmentId, o.month),
      apartmentId: o.apartmentId, year: previo.year, month: o.month,
      diasAlquilados: o.diasAlquilados, diasTotales: o.diasTotales, origen: 'excel' as const,
    }))

    // Las reparaciones del Excel no se dan de alta como gasto —duplicarían las
    // de la pantalla de Reparaciones—, pero se guarda la cifra declarada para
    // que el dashboard pueda avisar cuando las dos no cuadren.
    const reparaciones: ReparacionMensual[] = previo.reparaciones.map(r => ({
      id: idReparacionDeclarada(previo.year, r.apartmentId, r.month),
      apartmentId: r.apartmentId, year: previo.year, month: r.month,
      amount: r.base, origen: 'excel' as const,
    }))

    return { gastos, ingresos, ocupaciones, reparaciones }
  }, [previo])

  /**
   * Apuntes que vinieron de un Excel anterior del mismo ejercicio y que este
   * fichero ya no trae. Al reimportar hay que quitarlos: si el propietario
   * borra una línea del Excel, la app tiene que quedarse igual que el fichero.
   * Solo cuentan los que llevan id del importador (`xls-<año>…`); lo dado de
   * alta a mano no entra nunca.
   */
  const aBorrar = useMemo(() => {
    if (!previo || !preparado) return null
    const prefijo = `xls-${previo.year}`
    const sobran = <T extends { id: string }>(actuales: T[], nuevos: { id: string }[]) => {
      const vivos = new Set(nuevos.map(n => n.id))
      return actuales.filter(a => a.id.startsWith(prefijo) && !vivos.has(a.id))
    }
    const g = sobran(expenses, preparado.gastos)
    const i = sobran(incomes, preparado.ingresos)
    const o = sobran(occupancies, preparado.ocupaciones)
    const r = sobran(repairTotals, preparado.reparaciones)
    return { gastos: g, ingresos: i, ocupaciones: o, reparaciones: r,
             total: g.length + i.length + o.length + r.length,
             importe: g.reduce((s, x) => s + (x.amount || 0), 0) }
  }, [previo, preparado, expenses, incomes, occupancies, repairTotals])

  async function confirmar() {
    if (!previo || !preparado) return
    setGuardando(true)
    try {
      await importExpenses(preparado.gastos)
      await importIncomes(preparado.ingresos)
      await importOccupancies(preparado.ocupaciones)
      await importRepairTotals(preparado.reparaciones)

      // El borrado va al final, cuando lo nuevo ya está guardado: si algo falla
      // antes, el ejercicio se queda como estaba y no a medio camino.
      const quitados = await purgeImported(previo.year, {
        expenses: preparado.gastos.map(x => x.id),
        incomes: preparado.ingresos.map(x => x.id),
        occupancies: preparado.ocupaciones.map(x => x.id),
        repairTotals: preparado.reparaciones.map(x => x.id),
      })

      // El registro del volcado va lo último: solo se anota lo que de verdad
      // ha entrado, nunca un intento que se quedó a medias.
      anotaVolcado({
        fileName: nombreFichero || 'sin nombre',
        year: previo.year,
        gastos: preparado.gastos.length,
        ingresos: preparado.ingresos.length,
        ocupaciones: preparado.ocupaciones.length,
        reparaciones: preparado.reparaciones.length,
        borrados: quitados,
      })

      setHecho(preparado.gastos.length)
      setIngresosHechos(preparado.ingresos.length)
      setBorrados(quitados)
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

  // Los últimos volcados, del más reciente al más antiguo.
  const historial = useMemo(
    () => [...importLogs].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5),
    [importLogs],
  )

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
                {borrados > 0 && ` Se han quitado ${borrados} apuntes del Excel anterior que este fichero ya no traía.`}
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

            <label
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) lee(f) }}
              className="flex flex-col items-center justify-center gap-2 border-2 border-dashed border-slate-300 rounded-lg p-6 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 transition-colors">
              <Upload size={22} className="text-slate-400" />
              <span className="text-sm font-medium text-slate-600">
                {nombreFichero || 'Elegir o arrastrar el fichero .xlsx'}
              </span>
              <input type="file" accept=".xlsx" className="hidden" onChange={elegirFichero} />
            </label>

            {/* Historial: meses después, saber qué fichero trajo cada cifra y
                quién lo subió evita tener que reconstruirlo de memoria. */}
            {!previo && historial.length > 0 && (
              <div className="border border-slate-200 rounded-lg overflow-hidden">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 bg-slate-50 border-b border-slate-200 px-3 py-2">
                  <History size={13} /> Últimos volcados
                </p>
                <ul className="divide-y divide-slate-100">
                  {historial.map(l => (
                    <li key={l.id} className="px-3 py-2 text-xs">
                      <p className="font-medium text-slate-700 truncate">{l.fileName}</p>
                      <p className="text-slate-500" translate="no">
                        Ejercicio {l.year} · {fechaHora(l.at)} · {l.by} ·{' '}
                        {l.gastos} gastos, {l.ingresos} meses de ingresos
                        {l.borrados > 0 && `, ${l.borrados} retirados`}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
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

            {previo.reparaciones.length > 0 && (
              <p className="text-xs text-slate-500">
                Las {previo.reparaciones.length} líneas de reparaciones
                ({previo.reparaciones.reduce((s, r) => s + r.base, 0).toLocaleString('es-ES')} €)
                <strong> no se cargan como gasto</strong>: ya están en la pantalla de
                Reparaciones. Solo se anota la cifra del Excel para poder compararlas y
                avisar en el dashboard si no cuadran.
              </p>
            )}

            {previo.sinJustificante.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
                <p className="text-sm text-amber-900">
                  <b>{previo.sinJustificante.length} líneas de gastos sin justificante</b>{' '}
                  ({previo.sinJustificante.reduce((s, g) => s + g.base, 0)
                    .toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €)
                  no se cargan: falta decidir si se deducen o no. En cuanto se decida, se añaden.
                </p>
              </div>
            )}

            {previo.inmueblesNoReconocidos.length > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
                <p className="text-sm text-amber-900">
                  No se ha reconocido: {previo.inmueblesNoReconocidos.join(', ')}. Esos gastos
                  no se cargarán.
                </p>
              </div>
            )}

            {aBorrar && aBorrar.total > 0 && (
              <div className="bg-amber-50 border border-amber-300 rounded-lg p-3">
                <p className="text-sm font-semibold text-amber-900 mb-1">
                  Se quitarán {aBorrar.total} apuntes del Excel anterior de {previo.year}
                </p>
                <p className="text-sm text-amber-900">
                  Estaban en el fichero que se subió antes y este ya no los trae, así que la app
                  se queda igual que el Excel nuevo.
                  {aBorrar.gastos.length > 0 && ` Gastos: ${aBorrar.gastos.length} (${aBorrar.importe.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €).`}
                  {aBorrar.ingresos.length > 0 && ` Ingresos: ${aBorrar.ingresos.length} meses.`}
                  {aBorrar.ocupaciones.length > 0 && ` Ocupación: ${aBorrar.ocupaciones.length} meses.`}
                  {aBorrar.reparaciones.length > 0 && ` Reparaciones: ${aBorrar.reparaciones.length}.`}
                </p>
                <p className="text-xs text-amber-800 mt-1">
                  Lo dado de alta a mano en la app no se toca: solo se quita lo que vino de un Excel.
                </p>
              </div>
            )}

            <p className="text-xs text-slate-500">
              Si ya habías importado este mismo ejercicio, los apuntes se actualizan en vez de
              duplicarse, y los que ya no estén en el fichero nuevo se quitan.
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
