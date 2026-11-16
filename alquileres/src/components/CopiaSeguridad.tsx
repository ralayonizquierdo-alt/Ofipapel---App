import { useState } from 'react'
import { Download, ShieldCheck, AlertTriangle } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import { diasDesde, ultimaCopia, DIAS_ENTRE_COPIAS, registrosDe } from '../lib/copia'
import { datosDeCopia, haceCopia, useEstadoCopia } from '../lib/copiaAutomatica'
import { numSuelto } from '../lib/formato'

/**
 * La copia de seguridad en Apartamentos. Cada 15 días se hace sola al abrir la
 * app (components/CopiaAutomatica.tsx); este botón la hace cuando se quiera.
 * Las dos cosas hacen lo mismo: descargarla y mandarla por correo.
 */
export default function CopiaSeguridad() {
  const datos = useData()
  const estado = useEstadoCopia()
  const [haciendo, setHaciendo] = useState(false)
  const [resultado, setResultado] = useState('')

  const ultima = estado?.ultima ?? ultimaCopia()
  const dias = diasDesde(ultima)
  const toca = dias === null || dias >= DIAS_ENTRE_COPIAS

  async function hacer() {
    setHaciendo(true)
    const r = await haceCopia(datosDeCopia(datos), ultima)
    setResultado(`Descargado ${r.nombre}; ${r.correo}.`)
    setHaciendo(false)
  }

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
            Cada {DIAS_ENTRE_COPIAS} días se hace sola al abrir la app: se guarda en Descargas y se manda por correo
            a la oficina. Con el botón se hace cuando quieras.
          </p>
        </div>
        <button onClick={hacer} disabled={haciendo}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shrink-0 disabled:opacity-60">
          <Download size={16} /> {haciendo ? 'Haciendo la copia…' : 'Hacer copia ahora'}
        </button>
      </div>

      <div className={`mt-4 rounded-lg px-3 py-2 text-xs ${
        toca ? 'bg-amber-50 text-amber-800' : 'bg-green-50 text-green-800'
      }`} translate="no">
        {dias === null
          ? 'No consta ninguna copia'
          : dias === 0
            ? 'Última copia: hoy'
            : `Última copia: hace ${dias} ${dias === 1 ? 'día' : 'días'}`}
        {estado?.por && ` (${estado.por})`}
        {estado?.correo && `, ${estado.correo}`}.
        {toca && ' Toca hacer una.'}
        {` Se guardarían ${numSuelto(registrosDe(datosDeCopia(datos)))} registros.`}
      </div>

      {resultado && <p className="mt-2 text-xs text-slate-500" translate="no">{resultado}</p>}
    </div>
  )
}
