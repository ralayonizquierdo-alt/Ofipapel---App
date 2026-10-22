import { useState } from 'react'
import { FileSpreadsheet } from 'lucide-react'
import ImportarExcel from './ImportarExcel'

/**
 * Zona de arrastre para el Excel de gastos, en el dashboard.
 *
 * Los gastos que la app no produce —luz, agua, IBI, basura, comunidad,
 * profesionales…— llegan en un Excel que rellena administración. Tenerlo aquí
 * a la vista ahorra el viaje hasta Gastos: se suelta el fichero y se abre
 * directamente la vista previa de siempre, con lo que va a entrar y lo que se
 * va a retirar.
 */
export default function SoltarGastos() {
  const [fichero, setFichero] = useState<File | null>(null)
  const [arrastrando, setArrastrando] = useState(false)
  const [error, setError] = useState('')

  function recibe(f: File | undefined) {
    if (!f) return
    if (!/\.xlsx$/i.test(f.name)) {
      setError(`«${f.name}» no es un Excel. El fichero de gastos es un .xlsx.`)
      return
    }
    setError('')
    setFichero(f)
  }

  return (
    <>
      <label
        onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
        onDragLeave={e => { e.preventDefault(); setArrastrando(false) }}
        onDrop={e => { e.preventDefault(); setArrastrando(false); recibe(e.dataTransfer.files?.[0]) }}
        className={`flex items-center gap-3 border-2 border-dashed rounded-lg px-4 py-3 cursor-pointer transition-colors ${
          arrastrando ? 'border-blue-500 bg-blue-50/70' : 'border-slate-300 hover:border-blue-400 hover:bg-blue-50/40'
        }`}>
        <FileSpreadsheet size={18} className={arrastrando ? 'text-blue-600' : 'text-slate-400'} />
        <span className="text-sm text-slate-600">
          {arrastrando
            ? 'Suelta aquí el Excel'
            : <>Arrastra aquí el <b>Excel de gastos</b>, o pincha para elegirlo</>}
        </span>
        <input type="file" accept=".xlsx" className="hidden"
          onChange={e => { recibe(e.target.files?.[0]); e.target.value = '' }} />
      </label>

      {error && <p className="text-xs text-red-700 mt-1.5">{error}</p>}

      {fichero && <ImportarExcel ficheroInicial={fichero} onClose={() => setFichero(null)} />}
    </>
  )
}
