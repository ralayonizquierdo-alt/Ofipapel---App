import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { GwRadio, GwTextArea } from '../../../components/gw'
import type { ProveedorTabProps } from '../types'

// Calcada de GeminisWin (captura 05 del 12/11/2026): «Observaciones» ocupa la mitad izquierda,
// de arriba abajo; a la derecha el marco de la imagen (aspa cuando no hay ninguna), «Ver Imagen
// a ...» con Tamaño real / Tamaño ajustado / Rellenar marco y, debajo de las dos cosas, la ruta
// de la imagen con el botón de carpeta.
const MODOS = [
  { valor: 0, label: 'Tamaño real', fit: 'object-none' },
  { valor: 1, label: 'Tamaño ajustado', fit: 'object-contain' },
  { valor: 2, label: 'Rellenar marco', fit: 'object-fill' },
]

export function TabObservaciones({ proveedor, editing, onChange, tabla = 'PROVEEDO' }: ProveedorTabProps & { tabla?: string }) {
  const [rota, setRota] = useState<string | null>(null)
  const ro = !editing
  const url = proveedor.imagen_url?.trim() || null
  const modo = MODOS.find((m) => m.valor === proveedor.imagen_modo) ?? MODOS[1]

  return (
    <div className="grid h-[300px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-2">
      <div className="flex min-h-0 flex-col">
        <span className="text-[15px] leading-[18px]">Observaciones</span>
        <GwTextArea
          title={`${tabla}.OBSERV`}
          className="min-h-0 flex-1 resize-none!"
          disabled={ro}
          value={proveedor.observaciones ?? ''}
          onChange={(e) => onChange({ observaciones: e.target.value === '' ? null : e.target.value })}
        />
      </div>
      <div className="flex min-h-0 flex-col gap-1.5 pt-[6px]">
        <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1.33fr)_minmax(0,1fr)] gap-x-1">
          <div className="relative overflow-hidden border-2 border-[var(--gw-border-light)] bg-[var(--gw-face)]" title={`${tabla}.IMAGEN`}>
            {url && rota !== url ? (
              <img src={url} alt="" className={`h-full w-full ${modo.fit}`} onError={() => setRota(url)} />
            ) : (
              <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100" aria-label={url ? 'No se puede ver la imagen' : 'Sin imagen'}>
                <line x1="0" y1="0" x2="100" y2="100" stroke="#9a9a9a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
                <line x1="100" y1="0" x2="0" y2="100" stroke="#9a9a9a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
              </svg>
            )}
          </div>
          <div className="flex flex-col border-l border-t border-[var(--gw-border-light)] pl-1.5 pt-2">
            <span className="text-[15px] leading-[18px]">Ver Imagen a ...</span>
            <div className="mr-4 flex flex-col gap-1 border border-[var(--gw-border-light)] px-1.5 py-1">
              {MODOS.map((m) => (
                <GwRadio
                  key={m.valor}
                  name={`${tabla}-imagen-modo`}
                  label={<span className="text-[15px]">{m.label}</span>}
                  checked={modo.valor === m.valor}
                  disabled={ro}
                  onChange={() => onChange({ imagen_modo: m.valor })}
                />
              ))}
            </div>
          </div>
        </div>
        <div className="flex">
          <GwTextArea
            rows={1}
            className="h-[30px]! resize-none!"
            title={`${tabla}.IMAGEN — dirección (URL) de la imagen`}
            disabled={ro}
            value={proveedor.imagen_url ?? ''}
            onChange={(e) => onChange({ imagen_url: e.target.value.replace(/\n/g, '') || null })}
          />
          <button
            type="button"
            className="gw-btn h-[30px] w-[58px] flex-none px-0"
            disabled={ro}
            title={ro ? 'Para poner o cambiar la imagen, pulsa Modificar en la ficha' : 'Elegir imagen: escribe su dirección (URL)'}
            onClick={() => {
              const v = prompt('Dirección (URL) de la imagen', proveedor.imagen_url ?? '')
              if (v !== null) onChange({ imagen_url: v.trim() || null })
            }}
          >
            <FolderOpen size={14} className="text-[#b8860b]" />
          </button>
        </div>
      </div>
    </div>
  )
}
