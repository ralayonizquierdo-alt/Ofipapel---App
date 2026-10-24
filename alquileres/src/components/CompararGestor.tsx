import { useState } from 'react'
import { Upload, AlertTriangle, CheckCircle2, Printer } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { leeHojaGestor, cuadraConGestor, type CuadreGestor } from '../lib/compararGestor'
import { leeInformeAirbnb, cuadraInformeAirbnb, type CuadreAirbnb } from '../lib/importarAirbnb'
import { num } from '../lib/formato'
import { formatDate } from '../lib/dateUtils'

/**
 * Comparar lo que dicen fuera con lo que tenemos nosotros.
 *
 * Lo pidió el propietario el 23/10/2026: «necesito dónde subir estos ficheros
 * para hacer comparativa con lo que figura en nuestra aplicación y señalarme
 * diferencias e incongruencias», por los dos sitios de los que llegan cifras
 * que no escribimos nosotros:
 *
 *   · la hoja trimestral del gestor (ALQUILER MAURIZ AAAA…, en Excel), y
 *   · el informe anual de SOC del Arenal 2B (el HTML de Airbnb).
 *
 * **No guarda nada.** Ni crea reservas, ni apunta cobros, ni corrige importes:
 * enseña la diferencia y ya. Para meter los importes del Arenal sigue estando
 * el botón «Informe de Airbnb» de la pantalla de Reservas, que sí escribe y
 * pide confirmación. Aquí se viene a mirar, no a tocar.
 */
export default function CompararGestor() {
  const { apartments, reservations, payments } = useData()
  const [cuadre, setCuadre] = useState<CuadreGestor | null>(null)
  const [airbnb, setAirbnb] = useState<{ cuadre: CuadreAirbnb; anio?: number } | null>(null)
  const [fichero, setFichero] = useState('')
  const [error, setError] = useState('')
  const [leyendo, setLeyendo] = useState(false)

  const eur = (n: number) => `${num(n, 2)} €`
  const nombreApt = (id: string) => apartments.find(a => a.id === id)?.name ?? id

  async function recibe(f?: File) {
    if (!f) return
    setError(''); setCuadre(null); setAirbnb(null); setFichero(f.name); setLeyendo(true)
    try {
      if (/\.html?$/i.test(f.name)) {
        const leido = leeInformeAirbnb(await f.text())
        if (leido.estancias.length === 0) {
          setError('Ese HTML no trae ninguna estancia que se pueda leer.')
        } else {
          setAirbnb({ cuadre: cuadraInformeAirbnb(leido.estancias, 'AP2B', reservations, payments), anio: leido.anio })
        }
      } else {
        const hoja = await leeHojaGestor(f, apartments)
        if (!hoja.year || hoja.filas.length === 0) {
          setError('No he encontrado los trimestres («1T», «2T»…) en ese Excel. ¿Es la hoja del gestor?')
        } else {
          setCuadre(cuadraConGestor(hoja, reservations, payments))
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No he podido leer el fichero.')
    } finally {
      setLeyendo(false)
    }
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden print:border-0 print:shadow-none">
      <div className="px-5 py-3 bg-slate-600 flex items-center justify-between print:bg-white">
        <h3 className="font-semibold text-white print:text-slate-800">Comparar con lo del gestor</h3>
        {(cuadre || airbnb) && (
          <button onClick={() => window.print()} title="Imprimir o guardar en PDF"
            className="print:hidden flex items-center gap-2 px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20">
            <Printer size={14} /> Imprimir
          </button>
        )}
      </div>

      <div className="p-5 space-y-4">
        <div className="print:hidden">
          <p className="text-sm text-slate-600 mb-2">
            Suelta aquí la hoja trimestral del gestor (Excel, «ALQUILER MAURIZ…») o el
            informe anual de SOC del Arenal (HTML). Se compara con lo que tiene la
            aplicación y se señalan las diferencias. <b>No se guarda nada</b>.
          </p>
          <label className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50/40 w-fit">
            <Upload size={16} className="text-blue-600" />
            <span className="text-sm text-slate-600">{leyendo ? 'Leyendo…' : 'Elegir fichero'}</span>
            <input type="file" accept=".xlsx,.xls,.html,.htm" className="hidden"
              onChange={e => recibe(e.target.files?.[0])} />
          </label>
          {fichero && <p className="text-xs text-slate-400 mt-1.5">{fichero}</p>}
        </div>

        {error && (
          <p className="flex items-start gap-2 text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2.5">
            <AlertTriangle size={16} className="shrink-0 mt-0.5" /> {error}
          </p>
        )}

        {/* ── La hoja trimestral del gestor ─────────────────────────────── */}
        {cuadre && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="font-semibold text-slate-800">Ejercicio {cuadre.year}</span>
              <span className="text-slate-600">Gestor: <b>{eur(cuadre.totalGestor)}</b></span>
              <span className="text-slate-600">Nosotros: <b>{eur(cuadre.totalNuestro)}</b></span>
              <span className={Math.abs(cuadre.totalGestor - cuadre.totalNuestro) < 0.02
                ? 'text-green-700 font-semibold' : 'text-purple-700 font-semibold'}>
                Diferencia: {eur(Math.round((cuadre.totalGestor - cuadre.totalNuestro) * 100) / 100)}
              </span>
            </div>

            {cuadre.sinCasar.length > 0 && (
              <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No sé con qué apartamento nuestro casar esto del gestor: {cuadre.sinCasar.join(' · ')}
              </p>
            )}

            {cuadre.diferencias.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-green-800 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
                <CheckCircle2 size={16} /> Cuadra trimestre a trimestre y apartamento a apartamento.
              </p>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  <b className="text-purple-700">{cuadre.diferencias.length}</b> casillas no cuadran:
                </p>
                <div className="overflow-auto">
                  <table className="w-full text-sm" translate="no">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                        <th className="text-left py-2 px-3 font-medium">Trimestre</th>
                        <th className="text-left py-2 px-3 font-medium">Apartamento</th>
                        <th className="text-right py-2 px-3 font-medium">Gestor</th>
                        <th className="text-right py-2 px-3 font-medium">Nosotros</th>
                        <th className="text-right py-2 px-3 font-medium text-purple-700">Diferencia</th>
                      </tr>
                    </thead>
                    <tbody className="tabular-nums">
                      {cuadre.diferencias.map(l => (
                        <tr key={`${l.trimestre}-${l.apartmentId}`} className="border-b border-slate-50">
                          <td className="py-1.5 px-3 text-slate-600">{l.trimestre}T</td>
                          <td className="py-1.5 px-3 text-slate-700">{nombreApt(l.apartmentId)}</td>
                          <td className="py-1.5 px-3 text-right text-slate-600">{eur(l.gestor)}</td>
                          <td className="py-1.5 px-3 text-right text-slate-600">{eur(l.nuestro)}</td>
                          <td className="py-1.5 px-3 text-right font-semibold text-purple-700">
                            {l.diferencia > 0 ? '+' : ''}{eur(l.diferencia)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-slate-400">
                  «Gestor» es lo que declara su hoja; «nosotros», lo cobrado en la app en ese
                  trimestre —por el mes contable del cobro—. Una diferencia en positivo es
                  dinero que él declara y nosotros no tenemos apuntado.
                </p>
              </>
            )}
          </div>
        )}

        {/* ── El informe de SOC del Arenal ──────────────────────────────── */}
        {airbnb && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm">
              <span className="font-semibold text-slate-800">
                Arenal 2B · informe de SOC{airbnb.anio ? ` ${airbnb.anio}` : ''}
              </span>
              <span className="text-slate-600">Neto del informe: <b>{eur(airbnb.cuadre.totales.neto)}</b></span>
              <span className="text-slate-600">Cobrado en la app: <b>{eur(airbnb.cuadre.totales.cobrado)}</b></span>
              {airbnb.cuadre.totales.pendienteVencido > 0.005 && (
                <span className="text-purple-700 font-semibold">
                  Pendiente de estancias terminadas: {eur(airbnb.cuadre.totales.pendienteVencido)}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              {airbnb.cuadre.totales.nuevas > 0 && (
                <span className="px-2 py-1 rounded bg-amber-100 text-amber-800">
                  {airbnb.cuadre.totales.nuevas} estancias del informe que no tenemos
                </span>
              )}
              {airbnb.cuadre.totales.rellenadas > 0 && (
                <span className="px-2 py-1 rounded bg-blue-100 text-blue-800">
                  {airbnb.cuadre.totales.rellenadas} nuestras sin importe
                </span>
              )}
              {airbnb.cuadre.totales.cambiadas > 0 && (
                <span className="px-2 py-1 rounded bg-purple-100 text-purple-800">
                  {airbnb.cuadre.totales.cambiadas} con otro importe
                </span>
              )}
              {airbnb.cuadre.huerfanos.length > 0 && (
                <span className="px-2 py-1 rounded bg-slate-200 text-slate-700">
                  {airbnb.cuadre.huerfanos.length} cobros nuestros sin estancia en el informe
                </span>
              )}
            </div>

            <div className="overflow-auto">
              <table className="w-full text-sm" translate="no">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs text-slate-600">
                    <th className="text-left py-2 px-3 font-medium">Estancia del informe</th>
                    <th className="text-right py-2 px-3 font-medium">Neto SOC</th>
                    <th className="text-right py-2 px-3 font-medium">Nuestro importe</th>
                    <th className="text-right py-2 px-3 font-medium">Cobrado</th>
                    <th className="text-right py-2 px-3 font-medium text-purple-700">Falta</th>
                    <th className="text-left py-2 px-3 font-medium">Qué pasa</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums">
                  {airbnb.cuadre.casos.map((c, i) => (
                    <tr key={i} className="border-b border-slate-50 align-top">
                      <td className="py-1.5 px-3 text-slate-600 whitespace-nowrap">
                        {formatDate(c.estancia.checkIn)} → {formatDate(c.estancia.checkOut)}
                      </td>
                      <td className="py-1.5 px-3 text-right text-slate-700">{eur(c.estancia.neto)}</td>
                      <td className="py-1.5 px-3 text-right text-slate-500">
                        {c.reserva ? eur(c.reserva.total) : '—'}
                      </td>
                      <td className="py-1.5 px-3 text-right text-slate-600">{eur(c.cobrado)}</td>
                      <td className={`py-1.5 px-3 text-right font-semibold ${c.pendiente > 0.005 ? 'text-purple-700' : 'text-slate-300'}`}>
                        {c.pendiente > 0.005 ? eur(c.pendiente) : '—'}
                      </td>
                      <td className="py-1.5 px-3 text-xs text-slate-500">
                        {c.accion === 'nueva' && <span className="text-amber-800">no está en la app</span>}
                        {c.accion === 'rellena' && <span className="text-blue-800">la tenemos sin importe</span>}
                        {c.accion === 'cambia' && <span className="text-purple-800">el importe no coincide</span>}
                        {c.accion === 'igual' && 'coincide'}
                        {c.avisos.length > 0 && <span className="block text-amber-700">{c.avisos.join(' · ')}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-slate-400">
              Esto solo mira. Para meter los importes del Arenal, el botón «Informe de Airbnb»
              de la pantalla de Reservas, que enseña lo que va a escribir y pide confirmación.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
