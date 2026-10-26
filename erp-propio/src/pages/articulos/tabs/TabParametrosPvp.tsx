import { GwCheck, GwField, GwGroup, GwInput, GwRadio, GwSelect, formatGw } from '../../../components/gw'
import { costeBase } from '../pricing'
import type { Articulo } from '../types'

const REDONDEOS: { key: keyof Articulo; label: string; title: string }[] = [
  { key: 'redondeo_centimo', label: 'Céntimo:', title: 'REDUNIDAD' },
  { key: 'redondeo_decimo', label: 'Décimo:', title: 'REDDECENA' },
  { key: 'redondeo_unidad', label: 'Unidad:', title: 'REDCENTENA' },
  { key: 'redondeo_decena', label: 'Decena:', title: 'REDUNIDMIL' },
  { key: 'redondeo_centena', label: 'Centena:', title: 'REDDECMIL' },
]

export function TabParametrosPvp({
  articulo,
  editing,
  onChange,
  onRecalcularPvps,
}: {
  articulo: Articulo
  editing: boolean
  onChange: (patch: Partial<Articulo>) => void
  onRecalcularPvps?: () => void
}) {
  const dis = !editing
  const base = costeBase(articulo)
  const sinRedondeo = articulo.tipo_redondeo == null || articulo.tipo_redondeo === 3

  return (
    <div className="flex h-[250px] items-start gap-6">
      <div className="flex w-[300px] flex-none flex-col gap-1.5">
        <GwGroup title="Precio de coste elegido para el cálculo del Pvp">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <GwSelect
                title="COSTTOCALC"
                className="!w-[124px]"
                value={articulo.coste_base_calculo}
                onChange={(e) => onChange({ coste_base_calculo: Number(e.target.value) })}
                disabled={dis}
              >
                <option value={0}>Puro</option>
                <option value={1}>Neto</option>
                <option value={2}>Bruto</option>
                <option value={3}>Liquido</option>
              </GwSelect>
              <button type="button" className="gw-btn flex-1" disabled={dis || !onRecalcularPvps} onClick={onRecalcularPvps}>
                Recalcular Pvps
              </button>
            </div>
            <div className="flex items-center text-[12px]">
              <span className="w-[124px] text-right font-bold">{base != null ? `${formatGw(base, 3)} €` : ''}</span>
              <span className="flex-1 text-right" title="COSTEPVP_0">
                Ult. Usado: {formatGw(articulo.coste_usado_calculo_pvp ?? 0, 3)} €
              </span>
            </div>
            <GwCheck
              label={
                <span className="whitespace-normal leading-[14px]">
                  Utilizar siempre este precio de coste para éste artículo
                </span>
              }
              checked={articulo.coste_base_siempre}
              onChange={(v) => onChange({ coste_base_siempre: v })}
              disabled={dis}
              className="!items-start text-[12px]"
            />
          </div>
        </GwGroup>
        <GwGroup title="Tipo Pvp" className="w-[120px]">
          <div className="flex gap-3" title="FOV">
            <GwRadio name="tipo-pvp" label="Fijo" checked={articulo.pvp_fijo} onChange={() => onChange({ pvp_fijo: true })} disabled={dis} />
            <GwRadio name="tipo-pvp" label="Variable" checked={!articulo.pvp_fijo} onChange={() => onChange({ pvp_fijo: false })} disabled={dis} />
          </div>
        </GwGroup>
      </div>

      <GwGroup title="Redondeo del P.V.P." className="w-[420px] flex-none">
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between border border-[var(--gw-border-light)] px-1 py-0.5" title="TIPOREDOND">
            <GwRadio name="redondeo" label="Incremental" checked={articulo.tipo_redondeo === 0} onChange={() => onChange({ tipo_redondeo: 0 })} disabled={dis} />
            <GwRadio name="redondeo" label="Decremental" checked={articulo.tipo_redondeo === 1} onChange={() => onChange({ tipo_redondeo: 1 })} disabled={dis} />
            <GwRadio name="redondeo" label="Más cercano" checked={articulo.tipo_redondeo === 2} onChange={() => onChange({ tipo_redondeo: 2 })} disabled={dis} />
            <GwRadio name="redondeo" label="Sin redondeo" checked={sinRedondeo} onChange={() => onChange({ tipo_redondeo: 3 })} disabled={dis} />
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {REDONDEOS.map((r) => (
              <GwField key={r.key} label={r.label}>
                <GwInput
                  title={r.title}
                  value={(articulo[r.key] as string | null) ?? ''}
                  onChange={(e) => onChange({ [r.key]: e.target.value === '' ? null : e.target.value } as Partial<Articulo>)}
                  disabled={dis || sinRedondeo}
                />
              </GwField>
            ))}
          </div>
          <GwCheck
            label="Utilizar siempre estos valores para el redondeo en este Artículo"
            checked={articulo.redondeo_siempre}
            onChange={(v) => onChange({ redondeo_siempre: v })}
            disabled={dis}
            className="text-[12px]"
          />
        </div>
      </GwGroup>
    </div>
  )
}
