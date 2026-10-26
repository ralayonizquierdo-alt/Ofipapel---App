import { GwGroup, GwInput } from '../../../components/gw'
import type { Transportista, TransportistaTabProps } from './types'

// No hay captura de esta pestaña: cuentas de TRANSPOR (TRANSPO400/624/411/4115/572), con la
// misma disposición que la de Proveedores.
export function TabEnlacesTransportista({ transportista, editing, onChange }: TransportistaTabProps) {
  const cuenta = (label: string, key: keyof Transportista, title: string) => (
    <>
      <span className="gw-label">{label}</span>
      <GwInput
        title={title}
        value={(transportista[key] as string | null) ?? ''}
        disabled={!editing}
        onChange={(e) => onChange({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Transportista>)}
      />
    </>
  )

  return (
    <div className="flex min-h-[200px] justify-end pt-2">
      <div className="flex w-[460px] flex-col">
        <span className="gw-label">Cuentas Contables</span>
        <GwGroup className="grid grid-cols-[minmax(0,1fr)_150px] items-center gap-x-2 gap-y-1">
          {cuenta('Cuenta del Transportista (400):', 'cuenta_contable_400', 'TRANSPO400')}
          {cuenta('Cuenta de transportes (624):', 'cuenta_contable_624', 'TRANSPO624')}
          {cuenta('Cuenta como cliente (411):', 'cuenta_contable_411', 'TRANSPO411')}
          {cuenta('Efectos (4115):', 'cuenta_contable_41150', 'TRANSPO4115')}
          {cuenta('Banco C/C vista (572):', 'cuenta_contable_572', 'TRANSPO572')}
        </GwGroup>
      </div>
    </div>
  )
}
