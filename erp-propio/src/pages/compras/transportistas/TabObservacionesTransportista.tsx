import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { GwRadio, GwTextArea } from '../../../components/gw'
import type { TransportistaTabProps } from './types'

// Calcada de la captura de GeminisWin (04/11, ZIP 7): «Observaciones» a la izquierda; a la
// derecha el marco de la imagen (aspa cuando no hay), «Ver Imagen a ...» con Tamaño real /
// Tamaño ajustado / Rellenar marco y, debajo, la ruta de la imagen con el botón de carpeta.
const MODOS = [
  { valor: 0, label: 'Tamaño real', fit: 'object-none' },
  { valor: 1, label: 'Tamaño ajustado', fit: 'object-contain' },
  { valor: 2, label: 'Rellenar marco', fit: 'object-fill' },
]

export function TabObservacionesTransportista({ transportista, editing, onChange }: TransportistaTabProps) {
  const [rota, setRota] = useState<string | null>(null)
  const ro = !editing
  const url = transportista.imagen_url?.trim() || null
  const modo = MODOS.find((m) => m.valor === transportista.imagen_modo) ?? MODOS[1]

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,0.98fr)] gap-2">
      <div className="flex flex-col">
        <span className="text-[15px]">Observaciones</span>
        <GwTextArea
          title="TRANSPOR.OBSERV"
          className="h-[240px] resize-none"
          disabled={ro}
          value={transportista.observaciones ?? ''}
          onChange={(e) => onChange({ observaciones: e.target.value === '' ? null : e.target.value })}
        />
      </div>
      <div className="flex flex-col gap-1 pt-1">
        <div className="grid grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-1">
          <div className="relative h-[210px] overflow-hidden border border-[var(--gw-border)] bg-[var(--gw-face)]">
            {url && rota !== url ? (
              <img src={url} alt="" className={`h-full w-full ${modo.fit}`} onError={() => setRota(url)} />
            ) : (
              <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100" aria-label="Sin imagen">
                <line x1="0" y1="0" x2="100" y2="100" stroke="#9a9a9a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                <line x1="100" y1="0" x2="0" y2="100" stroke="#9a9a9a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
          </div>
          <div className="flex flex-col">
            <span className="text-[15px]">Ver Imagen a ...</span>
            <div className="flex flex-col gap-0.5 border border-[var(--gw-border-light)] p-1">
              {MODOS.map((m) => (
                <GwRadio
                  key={m.valor}
                  name="TRANSPOR-imagen-modo"
                  label={m.label}
                  checked={modo.valor === m.valor}
                  disabled={ro}
                  onChange={() => onChange({ imagen_modo: m.valor })}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          <GwTextArea
            rows={1}
            className="h-[28px] resize-none"
            title="TRANSPOR.IMAGEN — ruta o dirección de la imagen"
            disabled={ro}
            value={transportista.imagen_url ?? ''}
            onChange={(e) => onChange({ imagen_url: e.target.value === '' ? null : e.target.value })}
          />
          <button
            type="button"
            className="gw-btn h-[28px] w-[40px] flex-none"
            disabled
            title="Aún no se pueden subir ficheros desde aquí: escribe la ruta o dirección (URL) de la imagen en el cuadro de la izquierda"
          >
            <FolderOpen size={14} className="text-[#b58a1a]" />
          </button>
        </div>
      </div>
    </div>
  )
}
