import { useMemo, useState } from 'react'
import { FileSpreadsheet, Printer } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { EJERCICIO_APP, rejillaAnual } from '../lib/cuentas'
import { hojaAsesoria, type FilaHoja, type Formato } from '../lib/hojaAsesoria'
import { creaXlsx, descarga, ESTILO, type Celda } from '../lib/exportaExcel'
import PageHeader from '../components/ui/PageHeader'

/**
 * La hoja que se le manda a la asesoría, con la forma del Excel de siempre.
 *
 * Un bloque por inmueble: ocupación y días arriba, y debajo la rejilla de
 * conceptos por meses con TOTAL AÑO y TOTAL DEDUCIBLE. Se puede imprimir o
 * guardar en PDF (sale apaisada, sin el menú de la app) y también descargar
 * como .xlsx, que es como la asesoría lo trabaja.
 *
 * Las filas las arma lib/hojaAsesoria.ts sobre lib/cuentas.ts: las mismas
 * cifras que enseña Analítica, y el mismo contenido en papel que en Excel.
 */
export default function Asesoria() {
  const { reservations, payments, repairs, expenses, incomes, occupancies, apartments } = useData()
  const [year, setYear] = useState(new Date().getFullYear() - 1)

  const years = useMemo(() => {
    const s = new Set<string>()
    for (const i of incomes) s.add(String(i.year))
    for (const e of expenses) if (e.expenseDate) s.add(e.expenseDate.slice(0, 4))
    for (const r of reservations) if (r.checkIn) s.add(r.checkIn.slice(0, 4))
    return [...s].filter(Boolean).sort((a, b) => b.localeCompare(a))
  }, [incomes, expenses, reservations])

  const filas = useMemo(
    () => hojaAsesoria(
      rejillaAnual(
        { apartments: apartments.filter(a => a.active), reservations, payments, expenses, repairs, incomes, occupancies },
        year,
      ),
      year,
    ),
    [apartments, reservations, payments, expenses, repairs, incomes, occupancies, year],
  )

  const hayDeclarados = useMemo(() => incomes.some(i => i.year === year), [incomes, year])
  // Ejercicio viejo del que solo se guardó el histórico de estancias: no tiene
  // cuentas que mandar, y enseñar una rejilla en blanco haría creer que sí.
  const soloReservas = !hayDeclarados && year < EJERCICIO_APP

  function bajaExcel() {
    descarga(creaXlsx(hojaXlsx(filas, year)), `Alquileres-asesoria-${year}.xlsx`)
  }

  return (
    <div className="p-6 print:p-0">
      {/* La hoja es ancha: en papel solo cabe apaisada. */}
      <style>{'@media print { @page { size: A4 landscape; margin: 10mm } }'}</style>

      <div className="print:hidden">
        <PageHeader
          title="Hoja para la asesoría"
          subtitle={`Ejercicio ${year}`}
          actions={
            <div className="flex flex-wrap gap-2">
              <select value={year} onChange={e => setYear(Number(e.target.value))}
                className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
                {(years.length ? years : [String(year)]).map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <button onClick={bajaExcel} disabled={soloReservas}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg text-sm font-medium hover:bg-emerald-700 disabled:opacity-40 whitespace-nowrap">
                <FileSpreadsheet size={16} /> Descargar Excel
              </button>
              <button onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 whitespace-nowrap">
                <Printer size={16} /> Imprimir / PDF
              </button>
            </div>
          }
        />
      </div>

      {/* Cabecera que solo sale en el papel */}
      <div className="hidden print:block mb-3">
        <h1 className="text-base font-bold">Alquileres vacacionales · Ejercicio {year}</h1>
        <p className="text-[10px] text-slate-500">
          Emitido el {new Date().toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      </div>

      {soloReservas ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 max-w-2xl">
          <p className="text-sm font-semibold text-amber-900">
            El ejercicio {year} no tiene cuentas en la aplicación
          </p>
          <p className="text-sm text-amber-800 mt-1.5 leading-relaxed">
            De los años anteriores a {EJERCICIO_APP} solo se cargó el histórico de estancias, para
            tener el calendario. Los ingresos y los gastos de {year} están en el Excel de ese
            ejercicio, que es el que hay que mandar a la asesoría.
          </p>
          <p className="text-sm text-amber-800 mt-2">
            Si se sube aquí el Excel de {year}, esta hoja se rellena sola.
          </p>
        </div>
      ) : filas.length === 0 ? (
        <p className="text-slate-400 text-sm">No hay datos de ese ejercicio.</p>
      ) : (
        <>
          <div className="bg-white rounded-xl border border-slate-200 overflow-x-auto print:border-0 print:rounded-none print:overflow-visible">
            <table className="text-xs border-collapse w-full print:text-[8px]" translate="no">
              <tbody className="tabular-nums">
                {filas.map((f, i) => <Fila key={i} f={f} />)}
              </tbody>
            </table>
          </div>

          <section className="text-[11px] text-slate-500 leading-relaxed mt-4 pt-3 border-t border-slate-200 print:text-[8px]">
            <p>
              <b>Ingresos brutos</b>: {hayDeclarados
                ? 'los ingresos declarados en el Excel del ejercicio.'
                : 'los cobros registrados en la aplicación, porque este ejercicio no tiene Excel cargado.'}
              {' '}<b>TOTAL DEDUCIBLE</b>: los gastos ligados al alquiler van al 100 % (comisiones,
              limpieza, lavandería); los de la vivienda —luz, agua, IBI, basura, comunidad,
              profesionales, reparaciones— en proporción a los días alquilados de <i>ese</i> inmueble.
              El IGIC va calculado al 7 %; si el alquiler está exento por no prestarse servicios de
              hostelería, esa fila no aplica.
            </p>
          </section>
        </>
      )}
    </div>
  )
}

/* ───────────────────────── pantalla y papel ───────────────────────── */

const eur = (n: number) =>
  n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'

function texto(v: number | string | null, formato: Formato): string {
  if (v === null || v === undefined) return ''
  if (typeof v === 'string') return v
  if (formato === 'porcentaje') return `${Math.round(v * 100)} %`
  if (formato === 'entero') return v ? String(v) : ''
  if (formato === 'euros') return v ? eur(v) : '—'
  return String(v)
}

function Fila({ f }: { f: FilaHoja }) {
  if (f.tipo === 'titulo') return (
    <tr className="break-inside-avoid">
      <td colSpan={15} className="pt-5 pb-1 font-bold text-sm text-slate-800 print:text-[10px] print:pt-3">
        {f.etiqueta}
      </td>
    </tr>
  )

  if (f.tipo === 'seccion') return (
    <tr>
      <td colSpan={15} className="pt-2 pb-1 font-semibold text-slate-600 border-b border-slate-200">
        {f.etiqueta}
      </td>
    </tr>
  )

  const cabecera = f.tipo === 'cabecera'
  const total = f.tipo === 'total'
  const trClase = cabecera
    ? 'bg-slate-800 text-white'
    : total ? 'bg-slate-100 font-semibold' : 'border-b border-slate-100'
  const tdClase = cabecera ? 'px-1.5 py-1.5 text-center font-medium' : 'px-1.5 py-1 text-right whitespace-nowrap'

  return (
    <tr className={`${trClase} break-inside-avoid`}>
      <th scope="row" className={`px-1.5 py-1 text-left font-normal ${cabecera ? 'font-medium' : ''} ${total ? 'font-semibold' : ''}`}>
        {f.etiqueta}
      </th>
      {f.meses.map((v, i) => (
        <td key={i} className={tdClase}>{texto(v, f.formato)}</td>
      ))}
      <td className={`${tdClase} ${cabecera ? '' : 'font-semibold text-slate-800 bg-slate-50'}`}>
        {texto(f.anio, f.formato)}
      </td>
      <td className={`${tdClase} ${cabecera ? '' : 'font-semibold text-slate-800 bg-slate-50'}`}>
        {texto(f.deducible, f.formato)}
      </td>
    </tr>
  )
}

/* ───────────────────────────── el .xlsx ───────────────────────────── */

/**
 * Las mismas filas, pero como celdas de Excel: los números van como números
 * —no como texto— para que la asesoría pueda sumarlos y filtrarlos.
 */
function hojaXlsx(filas: FilaHoja[], year: number) {
  const estilo = (f: FilaHoja): number => {
    if (f.tipo === 'cabecera') return ESTILO.cabecera
    if (f.tipo === 'total') return ESTILO.eurosTotal
    if (f.formato === 'porcentaje') return ESTILO.porcentaje
    if (f.formato === 'entero') return ESTILO.entero
    if (f.formato === 'euros') return ESTILO.euros
    return ESTILO.normal
  }

  const celda = (v: number | string | null, f: FilaHoja): Celda => {
    if (v === null || v === undefined) return { v: null, s: estilo(f) }
    if (typeof v === 'string') return { v, s: estilo(f) }
    // El 0 de un importe se deja en blanco, igual que en el Excel de siempre.
    // El de la ocupación no: un mes vacío es «0,0 %», y dejarlo en blanco hace
    // que la fila parezca que falta.
    if (f.formato === 'porcentaje') return { v, s: estilo(f) }
    return { v: v || null, s: estilo(f) }
  }

  const cuerpo: Celda[][] = filas.map(f => {
    if (f.tipo === 'titulo') return [{ v: f.etiqueta, s: ESTILO.titulo }]
    if (f.tipo === 'seccion') return [{ v: f.etiqueta, s: ESTILO.total }]
    const et = f.tipo === 'cabecera'
      ? { v: f.etiqueta, s: ESTILO.cabecera }
      : { v: f.etiqueta, s: f.tipo === 'total' ? ESTILO.total : ESTILO.concepto }
    return [et, ...f.meses.map(v => celda(v, f)), celda(f.anio, f), celda(f.deducible, f)]
  })

  return {
    nombre: `Asesoría ${year}`,
    anchos: [34, ...Array(12).fill(12), 14, 16],
    filas: [
      [{ v: `ALQUILERES VACACIONALES · EJERCICIO ${year}`, s: ESTILO.titulo }],
      [],
      ...cuerpo,
    ] as Celda[][],
  }
}
