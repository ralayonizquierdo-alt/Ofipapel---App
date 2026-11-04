import { GwInput } from '../../../components/gw'
import type { Transportista, TransportistaTabProps } from './types'

// Calcada de la captura de GeminisWin (04/11, ZIP 7): grupo «Cuentas Contables» arriba a la
// izquierda con cuatro cuentas y un hueco entre «Efectos a Pagar» y «Banco C/C vista».
// Columnas de TRANSPOR: TRANSPO400 guarda la cuenta del transportista (la 410 del plan contable),
// TRANSPO624, TRANSPO411 y TRANSPO572. La TRANSPO4115 no sale en la pantalla (se conserva).
export function TabEnlacesTransportista({ transportista, editing, onChange }: TransportistaTabProps) {
  const cuenta = (label: string, key: keyof Transportista, title: string) => (
    <>
      <span className="text-[15px]">{label}</span>
      <GwInput
        title={title}
        value={(transportista[key] as string | null) ?? ''}
        disabled={!editing}
        onChange={(e) => onChange({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Transportista>)}
      />
    </>
  )

  return (
    <div className="flex min-h-[250px] flex-col pl-3 pt-1">
      <span className="text-[15px]">Cuentas Contables</span>
      <div className="grid w-[405px] grid-cols-[minmax(0,1fr)_125px] items-center gap-x-2 gap-y-1 border border-[var(--gw-border)] px-1 py-1">
        {cuenta('Cuenta del Transportista(410):', 'cuenta_contable_400', 'TRANSPO400')}
        {cuenta('Cuenta Transportes (624):', 'cuenta_contable_624', 'TRANSPO624')}
        {cuenta('Efectos a Pagar (411):', 'cuenta_contable_411', 'TRANSPO411')}
        <span className="h-[26px]" />
        <span />
        {cuenta('Banco C/C vista (572):', 'cuenta_contable_572', 'TRANSPO572')}
      </div>
    </div>
  )
}
