import { GwCheck, GwTextArea } from '../../../components/gw'
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
  const dis = !editing

  return (
    <div className="grid min-h-[250px] grid-cols-2 gap-x-4">
      <div className="flex min-h-0 flex-col">
        <div className="flex items-center gap-6">
          <span className="gw-label">Observaciones</span>
          <GwCheck
            label="Al vender el artículo incluirlas en la venta"
            checked={articulo.observaciones_venta}
            onChange={(v) => onChange({ observaciones_venta: v })}
            disabled={dis}
            className="text-[12px]"
          />
        </div>
        <GwTextArea
          title="OBS"
          className="flex-1 !resize-none"
          value={articulo.observaciones ?? ''}
          onChange={(e) => onChange({ observaciones: text(e.target.value) })}
          disabled={dis}
        />
      </div>
      <div className="flex min-h-0 flex-col">
        <span className="gw-label">Mensaje al Vender</span>
        <GwTextArea
          title="MSGVENTAS"
          className="h-[46px] !resize-none"
          value={articulo.mensaje_ventas ?? ''}
          onChange={(e) => onChange({ mensaje_ventas: text(e.target.value) })}
          disabled={dis}
        />
        <span className="gw-label mt-1.5">Notas internas informativas</span>
        <GwTextArea
          title="OBSINFO"
          className="flex-1 !resize-none"
          value={articulo.observaciones_info ?? ''}
          onChange={(e) => onChange({ observaciones_info: text(e.target.value) })}
          disabled={dis}
        />
      </div>
    </div>
  )
}
