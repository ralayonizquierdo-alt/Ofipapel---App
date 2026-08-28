import { useMemo, useRef, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileUp, Sparkles } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { leeLimpieza, type ResultadoLimpieza } from '../lib/importLimpieza'
import { EXPENSE_LABELS } from '../lib/deducible'
import { formatDate } from '../lib/dateUtils'
import type { Expense } from '../types'
import PageHeader from '../components/ui/PageHeader'

/**
 * Subida del parte de limpieza, la pantalla de Mónica y Cande.
 *
 * Es lo único que ven al entrar, así que está escrita para que se entienda sin
 * que nadie tenga que explicar nada: se suelta el fichero, se enseña lo que va
 * a entrar y hasta que no se pulsa el botón no se guarda nada.
 *
 * Añade, no reemplaza. Cada línea lleva una identidad hecha con su fecha, su
 * apartamento y su importe, así que subir el mismo fichero dos veces no
 * duplica nada: las que ya están se reconocen y se quedan como están. Es lo
 * que pidió el propietario, y con la identidad por línea sale gratis.
 */

const eur = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`

/** Los años anteriores ya están cerrados: por defecto solo entra lo nuevo. */
const DESDE = 2026

export default function SubirLimpieza() {
  const { apartments, expenses, importExpenses, anotaVolcado } = useData()
  const [previo, setPrevio] = useState<ResultadoLimpieza | null>(null)
  const [nombreFichero, setNombreFichero] = useState('')
  const [leyendo, setLeyendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [todosLosAnios, setTodosLosAnios] = useState(false)
  const [hecho, setHecho] = useState('')
  const [error, setError] = useState('')
  const [arrastrando, setArrastrando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  const nombreApt = (id: string) => apartments.find(a => a.id === id)?.name || id

  /** Lo que entraría: del año en curso en adelante, salvo que se pidan todos. */
  const candidatos = useMemo(
    () => (previo?.apuntes ?? []).filter(a => todosLosAnios || Number(a.fecha.slice(0, 4)) >= DESDE),
    [previo, todosLosAnios],
  )

  /** Los que ya están cargados no se vuelven a meter: se reconocen por su id. */
  const yaEstan = useMemo(() => {
    const ids = new Set(expenses.map(e => e.id))
    return candidatos.filter(a => ids.has(a.id))
  }, [candidatos, expenses])

  const nuevos = useMemo(() => {
    const ids = new Set(expenses.map(e => e.id))
    return candidatos.filter(a => !ids.has(a.id))
  }, [candidatos, expenses])

  const totalNuevos = nuevos.reduce((s, a) => s + a.importe, 0)

  /** Lo que va a entrar, agrupado por apartamento, que es como se mira. */
  const porApartamento = useMemo(() => {
    const m = new Map<string, { n: number; importe: number; horas: number }>()
    for (const a of nuevos) {
      const x = m.get(a.apartmentId) ?? { n: 0, importe: 0, horas: 0 }
      x.n++; x.importe += a.importe; x.horas += a.horas
      m.set(a.apartmentId, x)
    }
    return [...m.entries()].sort((a, b) => b[1].importe - a[1].importe)
  }, [nuevos])

  /** Las líneas que no dicen a qué piso van, agrupadas por lo que pone. */
  const sinAsignar = useMemo(() => {
    const m = new Map<string, { n: number; importe: number; motivo: string }>()
    for (const s of previo?.sinAsignar ?? []) {
      if (!todosLosAnios && Number(s.fecha.slice(0, 4)) < DESDE) continue
      const x = m.get(s.destino) ?? { n: 0, importe: 0, motivo: s.motivo }
      x.n++; x.importe += s.importe
      m.set(s.destino, x)
    }
    return [...m.entries()].sort((a, b) => b[1].importe - a[1].importe)
  }, [previo, todosLosAnios])

  async function abre(f: File) {
    setError(''); setHecho(''); setPrevio(null)
    if (!/\.xlsx?$/i.test(f.name)) {
      setError(`«${f.name}» no es un Excel. Tiene que ser el fichero de limpieza.`)
      return
    }
    setNombreFichero(f.name)
    setLeyendo(true)
    try {
      const r = await leeLimpieza(f)
      if (!r.apuntes.length && !r.sinAsignar.length) {
        setError('No se ha encontrado ninguna limpieza de apartamentos en ese fichero. ¿Es el correcto?')
      } else {
        setPrevio(r)
      }
    } catch {
      setError('No se ha podido leer el fichero. Comprueba que es el Excel de limpieza y vuelve a intentarlo.')
    }
    setLeyendo(false)
  }

  async function guarda() {
    if (!nuevos.length) return
    setGuardando(true)
    setError('')
    try {
      const items: Expense[] = nuevos.map(a => ({
        id: a.id,
        apartmentId: a.apartmentId,
        expenseDate: a.fecha,
        expenseType: a.expenseType,
        description: a.destino,
        supplier: 'Limpieza (parte semanal)',
        amount: a.importe,
        createdAt: new Date().toISOString(),
      }))
      await importExpenses(items)
      anotaVolcado({
        // Origen propio: en el registro tiene que distinguirse del Excel anual,
        // que es otro fichero, otra persona y otra periodicidad.
        origen: 'excel-limpieza',
        fileName: nombreFichero,
        resumen: `${items.length} limpiezas, ${eur(totalNuevos)}`,
        year: Number(nuevos[0].fecha.slice(0, 4)),
        gastos: items.length,
      })
      setHecho(`${items.length} ${items.length === 1 ? 'limpieza guardada' : 'limpiezas guardadas'} · ${eur(totalNuevos)}`)
      setPrevio(null)
    } catch {
      setError('No se han podido guardar. Comprueba la conexión y vuelve a intentarlo.')
    }
    setGuardando(false)
  }

  return (
    <div className="p-6 max-w-3xl">
      <PageHeader
        title="Subir el parte de limpieza"
        subtitle="Suelta aquí el Excel de limpieza y se anotará en los gastos de cada apartamento"
      />

      {hecho && (
        <div className="bg-green-50 border border-green-300 rounded-lg p-4 flex gap-3 mb-4">
          <CheckCircle2 className="text-green-600 shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-sm font-medium text-green-900">{hecho}</p>
            <p className="text-xs text-green-800 mt-0.5">Ya está. Puedes cerrar o subir otro fichero.</p>
          </div>
        </div>
      )}

      {/* ── La zona de soltar ── */}
      <div
        onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={e => { e.preventDefault(); setArrastrando(false) }}
        onDrop={e => {
          e.preventDefault(); setArrastrando(false)
          const f = e.dataTransfer.files?.[0]
          if (f) abre(f)
        }}
        onClick={() => inputRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          arrastrando ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-white hover:border-blue-400 hover:bg-blue-50/40'
        }`}
      >
        <FileUp size={28} className={`mx-auto mb-2 ${arrastrando ? 'text-blue-600' : 'text-slate-400'}`} />
        <p className="text-sm font-medium text-slate-700">
          {leyendo ? 'Leyendo el fichero…' : 'Arrastra aquí el Excel de limpieza'}
        </p>
        <p className="text-xs text-slate-500 mt-1">o pincha para buscarlo en el ordenador</p>
        <input ref={inputRef} type="file" accept=".xlsx,.xls" className="hidden"
          onChange={e => { const f = e.target.files?.[0]; if (f) abre(f); e.target.value = '' }} />
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2 mt-4">
          <AlertTriangle className="text-red-600 shrink-0 mt-0.5" size={16} />
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* ── Lo que va a entrar ── */}
      {previo && (
        <div className="mt-6 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
              <p className="text-sm font-semibold text-slate-700">
                {nuevos.length
                  ? `Se van a anotar ${nuevos.length} ${nuevos.length === 1 ? 'limpieza' : 'limpiezas'} · ${eur(totalNuevos)}`
                  : 'No hay nada nuevo que anotar'}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">{nombreFichero}</p>
            </div>

            {porApartamento.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[26rem]">
                  <thead className="bg-slate-50 text-xs text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="text-left py-2 px-4 font-medium">Apartamento</th>
                      <th className="text-right py-2 px-4 font-medium whitespace-nowrap">Limpiezas</th>
                      <th className="text-right py-2 px-4 font-medium whitespace-nowrap">Horas</th>
                      <th className="text-right py-2 px-4 font-medium whitespace-nowrap">Importe</th>
                    </tr>
                  </thead>
                  <tbody className="tabular-nums">
                    {porApartamento.map(([apt, x]) => (
                      <tr key={apt} className="border-b border-slate-100">
                        <td className="py-2 px-4 font-medium text-slate-700">{nombreApt(apt)}</td>
                        <td className="py-2 px-4 text-right text-slate-600">{x.n}</td>
                        <td className="py-2 px-4 text-right text-slate-600">{x.horas}</td>
                        <td className="py-2 px-4 text-right font-semibold text-slate-800 whitespace-nowrap">{eur(x.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {yaEstan.length > 0 && (
              <p className="px-4 py-2.5 text-xs text-slate-500 bg-slate-50 border-t border-slate-100 flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-green-600 shrink-0" />
                {yaEstan.length} {yaEstan.length === 1 ? 'línea ya estaba' : 'líneas ya estaban'} guardadas de otras veces: no se repiten.
              </p>
            )}
          </div>

          {/* Lo que no se puede repartir solo */}
          {sinAsignar.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <p className="text-sm font-medium text-amber-900 flex items-center gap-1.5 mb-2">
                <AlertTriangle size={15} /> Esto no se anota, porque no dice a qué apartamento va
              </p>
              <ul className="text-xs text-amber-800 space-y-1">
                {sinAsignar.map(([destino, x]) => (
                  <li key={destino} className="flex justify-between gap-4">
                    <span>{destino} <span className="text-amber-600">({x.n}×)</span></span>
                    <b className="tabular-nums whitespace-nowrap">{eur(x.importe)}</b>
                  </li>
                ))}
              </ul>
              <p className="text-xs text-amber-700 mt-2">
                Si estas líneas tienen que contar, hay que decidir a qué pisos se reparten. Díselo a Luis o a Rober.
              </p>
            </div>
          )}

          {previo.deOfipapel.n > 0 && (
            <p className="text-xs text-slate-500 flex items-center gap-1.5">
              <Sparkles size={13} className="text-slate-400" />
              Las {previo.deOfipapel.n} líneas de la papelería ({eur(previo.deOfipapel.importe)}) se quedan fuera: no son gastos de los apartamentos.
            </p>
          )}

          <div className="flex items-center justify-between gap-4 flex-wrap">
            <label className="flex items-center gap-2 text-xs text-slate-600">
              <input type="checkbox" checked={todosLosAnios} onChange={e => setTodosLosAnios(e.target.checked)}
                className="rounded border-slate-300" />
              Incluir también los años anteriores a {DESDE}
            </label>
            <button onClick={guarda} disabled={guardando || !nuevos.length}
              className="px-5 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 whitespace-nowrap">
              {guardando ? 'Guardando…' : `Anotar ${nuevos.length} ${nuevos.length === 1 ? 'limpieza' : 'limpiezas'}`}
            </button>
          </div>

          {/* El detalle, por si alguien quiere comprobar línea a línea */}
          {nuevos.length > 0 && (
            <details className="bg-white rounded-xl border border-slate-200">
              <summary className="px-4 py-2.5 text-xs font-medium text-slate-600 cursor-pointer select-none">
                Ver las {nuevos.length} líneas una a una
              </summary>
              <div className="overflow-x-auto border-t border-slate-100">
                <table className="w-full text-xs min-w-[30rem]">
                  <tbody className="tabular-nums">
                    {nuevos.map(a => (
                      <tr key={a.id} className="border-b border-slate-50">
                        <td className="py-1.5 px-4 text-slate-500 whitespace-nowrap">{formatDate(a.fecha)}</td>
                        <td className="py-1.5 px-3 font-medium text-slate-700 whitespace-nowrap">{nombreApt(a.apartmentId)}</td>
                        <td className="py-1.5 px-3 text-slate-500">{a.destino}</td>
                        <td className="py-1.5 px-3 text-slate-500 whitespace-nowrap">{EXPENSE_LABELS[a.expenseType]}</td>
                        <td className="py-1.5 px-4 text-right text-slate-700 whitespace-nowrap">{eur(a.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          )}
        </div>
      )}
    </div>
  )
}
