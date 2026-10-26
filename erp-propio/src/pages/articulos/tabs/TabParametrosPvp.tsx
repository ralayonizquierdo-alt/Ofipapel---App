import { FormField, SelectInput } from '../../../components/FormField'
import { Toggle } from '../../../components/Toggle'
import type { Articulo } from '../types'

export function TabParametrosPvp({
  articulo,
  editing,
  onChange,
}: {
  articulo: Articulo
  editing: boolean
  onChange: (patch: Partial<Articulo>) => void
}) {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Coste base para calcular</h3>
        <p className="text-sm text-slate-500">
          Los 7 PVP se calculan a partir del <strong>coste neto</strong> del artículo
          {articulo.coste_neto != null ? ` (actualmente ${articulo.coste_neto.toFixed(3)} €)` : ''}, aplicando a cada
          tarifa su modo (P = % sobre coste, D = % de descuento sobre la General) y su margen, definidos en la pestaña
          Características o en la plantilla de tarifa.
        </p>
        <Toggle
          label="Recalcular el coste automáticamente al recibir compras (COSTTOCALC)"
          checked={articulo.calcular_coste_automatico}
          onChange={(v) => onChange({ calcular_coste_automatico: v })}
          disabled={!editing}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">PVP fijo o variable</h3>
        <FormField label="Tipo de PVP" hint="NOCALCPVP">
          <SelectInput
            className="max-w-xs"
            value={articulo.no_calcular_pvp_auto ? 'fijo' : 'variable'}
            onChange={(e) => onChange({ no_calcular_pvp_auto: e.target.value === 'fijo' })}
            disabled={!editing}
          >
            <option value="variable">Variable — se recalcula al cambiar el coste</option>
            <option value="fijo">PVP fijo (no recalcular)</option>
          </SelectInput>
        </FormField>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Redondeo</h3>
        <FormField label="Tipo de redondeo" hint="TIPOREDOND — confirmar códigos con Luis">
          <SelectInput
            className="max-w-xs"
            value={articulo.tipo_redondeo ?? ''}
            onChange={(e) => onChange({ tipo_redondeo: e.target.value === '' ? null : Number(e.target.value) })}
            disabled={!editing}
          >
            <option value="">Sin redondeo</option>
            <option value="0">Incremental</option>
            <option value="1">Decremental</option>
            <option value="2">Más cercano</option>
          </SelectInput>
        </FormField>
      </section>
    </div>
  )
}
