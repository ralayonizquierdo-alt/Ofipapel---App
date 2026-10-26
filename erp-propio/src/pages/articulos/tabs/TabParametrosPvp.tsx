import { GwCheck, GwField, GwGroup, GwInline, GwNumber, GwRadio, GwSelect } from '../../../components/gw'
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
  const dis = !editing
  const num = (v: string) => (v === '' ? null : Number(v))

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
      <div className="flex flex-col gap-2">
        <GwGroup title="Coste base para calcular">
          <div className="flex flex-col gap-1.5">
            <GwField label="Coste base">
              <GwSelect
                title="COSTTOCALC"
                className="max-w-[220px]"
                value={articulo.coste_base_calculo}
                onChange={(e) => onChange({ coste_base_calculo: Number(e.target.value) })}
                disabled={dis}
              >
                <option value={0}>Coste Puro</option>
                <option value={1}>Coste Neto</option>
                <option value={2}>Coste Bruto</option>
                <option value={3}>Coste Líquido</option>
              </GwSelect>
            </GwField>
            <GwInline label="Ultimo Precio de Coste usado para el recalculo de Pvps:">
              <GwNumber className="w-[110px]" value={articulo.coste_usado_calculo_pvp} decimals={3} disabled />
            </GwInline>
            <GwCheck
              label="Recalcular el coste automáticamente al recibir compras"
              checked={articulo.calcular_coste_automatico}
              onChange={(v) => onChange({ calcular_coste_automatico: v })}
              disabled={dis}
            />
          </div>
        </GwGroup>
        <GwGroup title="Pvp">
          <div className="flex flex-col gap-1" title="NOCALCPVP">
            <GwRadio
              name="pvp-fijo"
              label="Pvp variable (se recalcula al cambiar el coste)"
              checked={!articulo.no_calcular_pvp_auto}
              onChange={() => onChange({ no_calcular_pvp_auto: false })}
              disabled={dis}
            />
            <GwRadio
              name="pvp-fijo"
              label="Pvp fijo (no recalcular)"
              checked={articulo.no_calcular_pvp_auto}
              onChange={() => onChange({ no_calcular_pvp_auto: true })}
              disabled={dis}
            />
          </div>
        </GwGroup>
      </div>
      <GwGroup title="Redondeo">
        <div className="flex flex-col gap-1.5">
          <GwField label="Tipo de redondeo">
            <GwSelect
              title="TIPOREDOND"
              className="max-w-[220px]"
              value={articulo.tipo_redondeo ?? ''}
              onChange={(e) => onChange({ tipo_redondeo: num(e.target.value) })}
              disabled={dis}
            >
              <option value="">Sin redondeo</option>
              <option value={0}>Incremental</option>
              <option value={1}>Decremental</option>
              <option value={2}>Más cercano</option>
            </GwSelect>
          </GwField>
          <GwField label="Redondear a">
            <GwSelect
              title="REDUNIDAD · REDDECENA · REDCENTENA · REDUNIDMIL · REDDECMIL"
              className="max-w-[220px]"
              value={articulo.redondeo_a ?? ''}
              onChange={(e) => onChange({ redondeo_a: num(e.target.value) })}
              disabled={dis}
            >
              <option value="">—</option>
              <option value={0}>Céntimo</option>
              <option value={1}>Décimo</option>
              <option value={2}>Unidad</option>
              <option value={3}>Decena</option>
              <option value={4}>Centena</option>
            </GwSelect>
          </GwField>
        </div>
      </GwGroup>
    </div>
  )
}
