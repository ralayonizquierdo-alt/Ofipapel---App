import { useState } from 'react'
import { FolderOpen } from 'lucide-react'
import { GwField, GwGroup, GwInput, GwRadio, GwTextArea } from '../../../components/gw'
import type { Cliente, ClienteTabProps } from '../types'

const MODOS = [
  { valor: 0, label: 'Tamaño real', fit: 'object-none' },
  { valor: 1, label: 'Tam. ajustado', fit: 'object-contain' },
  { valor: 2, label: 'Rellenar marco', fit: 'object-fill' },
]

export function TabObsImg({ cliente, editing, onChange }: ClienteTabProps) {
  const [rota, setRota] = useState<string | null>(null)
  const ro = !editing
  const url = cliente.imagen_url?.trim() || null
  const modo = MODOS.find((m) => m.valor === cliente.imagen_modo) ?? MODOS[1]

  const texto = (key: keyof Cliente) => ({
    disabled: ro,
    value: (cliente[key] as string | null) ?? '',
    onChange: (e: { target: { value: string } }) => onChange({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Cliente>),
  })

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_400px] gap-3">
        <GwField label="Observaciones">
          <GwTextArea title="CLIENTES.OBSERV" rows={12} className="h-[240px]" {...texto('observaciones')} />
        </GwField>
        <div className="flex flex-col gap-1 pt-4">
          <div className="grid grid-cols-[210px_minmax(0,1fr)] gap-1">
            <div className="relative h-[200px] overflow-hidden border border-[var(--gw-border)] bg-[var(--gw-face)]">
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
              <span className="gw-label">Ver Imagen a ...</span>
              <div className="flex flex-col gap-0.5 border border-[var(--gw-border-light)] p-1">
                {MODOS.map((m) => (
                  <GwRadio
                    key={m.valor}
                    name="cliente-imagen-modo"
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
            <GwInput title="CLIENTES.IMAGEN — ruta o dirección de la imagen" {...texto('imagen_url')} />
            <button type="button" className="gw-btn flex-none px-2" disabled={ro} title="Elegir imagen (escribe la ruta o URL)">
              <FolderOpen size={14} className="text-[#b58a1a]" />
            </button>
          </div>
        </div>
      </div>
      <GwGroup className="grid grid-cols-2 gap-3 border-0 p-0">
        <GwField label="EJERCE DESDE:">
          <GwInput title="Ejerce desde" {...texto('ejerce_desde')} />
        </GwField>
        <GwField label="HORARIO">
          <GwInput title="Horario" {...texto('horario')} />
        </GwField>
      </GwGroup>
    </div>
  )
}
