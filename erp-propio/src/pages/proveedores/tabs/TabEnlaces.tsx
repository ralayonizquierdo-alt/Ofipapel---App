import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwGroup, GwInput, GwLookupButton } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import type { Proveedor, ProveedorTabProps } from '../types'

export function TabEnlaces({ proveedor, editing, onChange }: ProveedorTabProps) {
  const disabled = !editing
  const [almacenes, setAlmacenes] = useState<{ codigo: string; nombre: string }[]>([])
  const [lookup, setLookup] = useState(false)

  useEffect(() => {
    supabase
      .from('almacen')
      .select('codigo, nombre')
      .order('codigo')
      .then(({ data }) => setAlmacenes((data ?? []) as { codigo: string; nombre: string }[]))
  }, [])

  const text = (key: keyof Proveedor, title: string, className = '') => (
    <GwInput
      title={title}
      className={className}
      value={(proveedor[key] as string | null) ?? ''}
      disabled={disabled}
      onChange={(e) => onChange({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Proveedor>)}
    />
  )

  const cuenta = (label: string, key: keyof Proveedor, title: string) => (
    <>
      <span className="gw-label">{label}</span>
      {text(key, title)}
    </>
  )

  const nombreAlmacen = almacenes.find((a) => a.codigo === proveedor.almacen_defecto_codigo)?.nombre ?? ''

  return (
    <div className="grid min-h-[200px] grid-cols-[minmax(0,1fr)_minmax(0,460px)] gap-x-8">
      <div className="flex flex-col gap-3 pt-2">
        <GwGroup title="Proveedor exclusivo para este almacen">
          <div className="grid grid-cols-[100px_minmax(0,1fr)] gap-1" title="CODALMAC — proveedor exclusivo por almacén">
            <GwInput
              value={proveedor.almacen_defecto_codigo ?? ''}
              disabled={disabled}
              onChange={(e) => onChange({ almacen_defecto_codigo: e.target.value === '' ? null : e.target.value })}
            />
            <span className="flex">
              <GwInput readOnly value={nombreAlmacen} tabIndex={-1} />
              <GwLookupButton disabled={disabled} onClick={() => setLookup(true)} title="Buscar almacén" />
            </span>
          </div>
        </GwGroup>
        <div className="grid grid-cols-[140px_160px] items-center">
          <span className="gw-label">Sinli Id Fande:</span>
          {text('id_sinli', 'SINLIID')}
        </div>
      </div>
      <div className="flex flex-col">
        <span className="gw-label">Cuentas Contables</span>
        <GwGroup className="grid grid-cols-[minmax(0,1fr)_150px] items-center gap-x-2 gap-y-1">
          {proveedor.tipo === 'acreedor'
            ? cuenta('Cuenta del Acreedor(410):', 'cuenta_contable_400', 'PROVEED400')
            : cuenta('Cuenta del Proveedor(400):', 'cuenta_contable_400', 'PROVEED400')}
          {cuenta('Cuenta de compras (600):', 'cuenta_contable_600', 'PROVEED600')}
          {cuenta('Efectos a Pagar (401):', 'cuenta_contable_401', 'PROVEED401')}
          <span className="h-[22px]" />
          <span />
          {cuenta('Banco C/C vista (572):', 'cuenta_contable_572', 'PROVEED572')}
        </GwGroup>
      </div>
      {lookup && (
        <GwLookupDialog<Record<string, unknown>>
          title="Almacén"
          table="almacen"
          columns={[
            { key: 'codigo', label: 'Código', width: 110 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="codigo"
          keyColumn="codigo"
          onClose={() => setLookup(false)}
          onPick={(r) => {
            onChange({ almacen_defecto_codigo: String(r.codigo) })
            setLookup(false)
          }}
        />
      )}
    </div>
  )
}
