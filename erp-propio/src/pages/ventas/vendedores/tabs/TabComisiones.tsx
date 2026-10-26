import { GwCheck, GwGroup, GwNumber } from '../../../../components/gw'
import type { Comisiones, VendedorTabProps } from '../types'

// Disposición de la captura: cuatro columnas de dos filas.
const CELDAS: { nivel: number | 'oferta'; label: string; title: string }[] = [
  { nivel: 'oferta', label: 'Precio de Oferta:', title: 'COMISOFERT' },
  { nivel: 0, label: 'General:', title: 'COMISION0' },
  { nivel: 1, label: 'MAYOR  M-1:', title: 'COMISION1' },
  { nivel: 2, label: 'MAYOR  M-2:', title: 'COMISION2' },
  { nivel: 3, label: 'MAYOR  M-3:', title: 'COMISION3' },
  { nivel: 4, label: 'Tarifa Dcto -4:', title: 'COMISION4' },
  { nivel: 5, label: 'Tarifa Dcto -5:', title: 'COMISION5' },
  { nivel: 6, label: 'Tarifa Dcto -6:', title: 'COMISION6' },
]

export function TabComisiones({
  vendedor,
  editing,
  onChange,
  comisiones,
  onComision,
}: VendedorTabProps & { comisiones: Comisiones; onComision: (nivel: number, v: number | null) => void }) {
  const ro = !editing
  return (
    <div className="flex min-h-[250px] flex-col">
      <GwGroup className="flex flex-col gap-2">
        <span className="gw-label text-[14px]">Comisiones según tarifa aplicada al artículo</span>
        <div className="grid grid-flow-col grid-cols-4 grid-rows-2 gap-x-6 gap-y-2">
          {CELDAS.map((c) => (
            <div key={String(c.nivel)} className="flex items-center justify-end gap-2" title={c.title}>
              <span className="gw-label">{c.label}</span>
              <GwNumber
                className="!w-[90px]"
                decimals={2}
                disabled={ro}
                value={c.nivel === 'oferta' ? vendedor.comision_oferta_pct : comisiones[c.nivel]}
                onChange={(v) => (c.nivel === 'oferta' ? onChange({ comision_oferta_pct: v }) : onComision(c.nivel, v))}
              />
            </div>
          ))}
        </div>
        <GwCheck
          className="mt-1"
          label="Aplicar el % de las comisiones sobre el Beneficio"
          checked={vendedor.computa_beneficio}
          disabled={ro}
          onChange={(v) => onChange({ computa_beneficio: v })}
        />
      </GwGroup>
    </div>
  )
}
