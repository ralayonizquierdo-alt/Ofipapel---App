import { FormField, TextArea } from '../../../components/FormField'
import { Toggle } from '../../../components/Toggle'
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
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Observaciones</h3>
        <FormField label="Observaciones" hint="OBS">
          <TextArea
            rows={5}
            value={articulo.observaciones ?? ''}
            onChange={(e) => onChange({ observaciones: text(e.target.value) })}
            disabled={!editing}
          />
        </FormField>
        <Toggle
          label="Incluir las observaciones en la venta (OBSENVENTA)"
          checked={articulo.observaciones_venta}
          onChange={(v) => onChange({ observaciones_venta: v })}
          disabled={!editing}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Mensaje al vender</h3>
        <FormField label="Mensaje al vender" hint="MSGVENTAS — aparece como aviso al vender este artículo">
          <TextArea
            rows={3}
            value={articulo.mensaje_ventas ?? ''}
            onChange={(e) => onChange({ mensaje_ventas: text(e.target.value) })}
            disabled={!editing}
          />
        </FormField>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notas internas</h3>
        <FormField label="Notas internas" hint="OBSINFO — no salen en ningún documento">
          <TextArea
            rows={4}
            value={articulo.observaciones_info ?? ''}
            onChange={(e) => onChange({ observaciones_info: text(e.target.value) })}
            disabled={!editing}
          />
        </FormField>
      </section>
    </div>
  )
}
