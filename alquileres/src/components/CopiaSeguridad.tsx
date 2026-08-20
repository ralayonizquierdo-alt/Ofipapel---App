import { useState } from 'react'
import { Download, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { descargaCopia, diasDesde, ultimaCopia, apuntaCopia, DIAS_ENTRE_COPIAS } from '../lib/copia'

export default function CopiaSeguridad() {
  const datos = useData()
  const [ultima, setUltima] = useState<string | null>(ultimaCopia())
  const [nombre, setNombre] = useState('')

  const dias = diasDesde(ultima)
  const toca = dias === null || dias >= DIAS_ENTRE_COPIAS

  function descargar() {
    const n = descargaCopia({
      apartments: datos.apartments,
      prices: datos.prices,
      reservations: datos.reservations,
      payments: datos.payments,
      repairs: datos.repairs,
      deletedRepairs: datos.deletedRepairs,
      expenses: datos.expenses,
      offerPrices: datos.offerPrices,
      incomes: datos.incomes,
      occupancies: datos.occupancies,
      repairTotals: datos.repairTotals,
      importLogs: datos.importLogs,
    })
    const ahora = new Date().toISOString()
    apuntaCopia(ahora)
    setUltima(ahora)
    setNombre(n)
  }

  const total = datos.reservations.length + datos.payments.length + datos.repairs.length +
                datos.expenses.length + datos.incomes.length

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="font-semibold text-slate-700 text-sm flex items-center gap-2">
            {toca
              ? <AlertTriangle size={15} className="text-amber-600" />
              : <ShieldCheck size={15} className="text-green-600" />}
            Copia de seguridad
          </h2>
          <p className="text-xs text-slate-500 mt-1 max-w-md">
            Descarga todos los datos en un fichero. Lo borrado en Firebase no se puede
            recuperar, así que conviene guardar una copia cada {DIAS_ENTRE_COPIAS} días.
          </p>
        </div>
        <button onClick={descargar}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shrink-0">
          <Download size={16} /> Descargar copia
        </button>
      </div>

      <div className={`mt-4 rounded-lg px-3 py-2 text-xs ${
        toca ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'
      }`} translate="no">
        {dias === null
          ? 'No consta ninguna copia hecha desde este navegador.'
          : dias === 0
            ? 'Última copia: hoy.'
            : `Última copia: hace ${dias} ${dias === 1 ? 'día' : 'días'}.`}
        {toca && ' Toca hacer una.'}
        {` Se guardarían ${total.toLocaleString('es-ES')} registros.`}
      </div>

      {nombre && (
        <p className="mt-2 text-xs text-slate-500" translate="no">
          Descargado <b>{nombre}</b>. Guárdalo fuera del ordenador (correo, disco o nube).
        </p>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        El aviso se apunta en este navegador: si haces la copia desde otro equipo, aquí
        seguirá pidiéndola.
      </p>
    </div>
  )
}
