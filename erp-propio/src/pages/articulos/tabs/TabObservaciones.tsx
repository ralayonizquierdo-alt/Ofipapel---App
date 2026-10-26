import { GwCheck, GwField, GwTextArea } from '../../../components/gw'
import type { Articulo } from '../types'

export function TabObservaciones({
  articulo,
  editing,
  onChange,
}: {
  articulo: Articulo
  editing: boolean
  onChange: (patch: Partial<Articulo>) => void
}) {
  const text = (v: string) => (v === '' ? null : v)

  return (
    <div className="flex flex-col gap-2">
      <GwField label="Observaciones">
        <GwTextArea
          title="OBS"
          rows={6}
          value={articulo.observaciones ?? ''}
          onChange={(e) => onChange({ observaciones: text(e.target.value) })}
          disabled={!editing}
        />
      </GwField>
      <GwCheck
        label="Incluir las observaciones en la venta"
        checked={articulo.observaciones_venta}
        onChange={(v) => onChange({ observaciones_venta: v })}
        disabled={!editing}
      />
      <div className="grid grid-cols-2 gap-2">
        <GwField label="Mensaje al Vender">
          <GwTextArea
            title="MSGVENTAS"
            rows={5}
            value={articulo.mensaje_ventas ?? ''}
            onChange={(e) => onChange({ mensaje_ventas: text(e.target.value) })}
            disabled={!editing}
          />
        </GwField>
        <GwField label="Notas Internas">
          <GwTextArea
            title="OBSINFO"
            rows={5}
            value={articulo.observaciones_info ?? ''}
            onChange={(e) => onChange({ observaciones_info: text(e.target.value) })}
            disabled={!editing}
          />
        </GwField>
      </div>
    </div>
  )
}
