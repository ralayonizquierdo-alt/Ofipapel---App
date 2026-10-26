import { useState } from 'react'
import { GwField, GwGroup, GwInput } from '../../../components/gw'
import type { ClienteTabProps } from '../types'

export function TabObsImg({ cliente, editing, onChange }: ClienteTabProps) {
  const [rota, setRota] = useState<string | null>(null)
  const url = cliente.imagen_url?.trim() || null

  return (
    <div className="flex flex-col gap-1.5">
      <GwField label="Imagen">
        <GwInput
          title="CLIENTES.IMAGEN"
          disabled={!editing}
          value={cliente.imagen_url ?? ''}
          onChange={(e) => onChange({ imagen_url: e.target.value === '' ? null : e.target.value })}
        />
      </GwField>
      <GwGroup className="flex h-[320px] items-center justify-center bg-white">
        {url && rota !== url ? (
          <img src={url} alt={cliente.nombre} className="max-h-[300px] max-w-full object-contain" onError={() => setRota(url)} />
        ) : (
          <span className="gw-label text-[#6d6d6d]">{url ? 'No se puede mostrar la imagen' : 'Sin imagen'}</span>
        )}
      </GwGroup>
    </div>
  )
}
