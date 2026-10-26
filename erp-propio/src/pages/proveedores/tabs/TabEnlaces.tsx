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
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        <GwGroup title="Almacén asignado a este proveedor" className="flex flex-col gap-1">
          <div className="grid grid-cols-[80px_minmax(0,1fr)_auto] gap-1" title="ALMACEN — proveedor exclusivo por almacén">
            <GwInput
              value={proveedor.almacen_defecto_codigo ?? ''}
              disabled={disabled}
              onChange={(e) => onChange({ almacen_defecto_codigo: e.target.value === '' ? null : e.target.value })}
            />
            <GwInput readOnly value={nombreAlmacen} tabIndex={-1} />
            <GwLookupButton disabled={disabled} onClick={() => setLookup(true)} title="Buscar almacén" />
          </div>
          <span className="text-[13px] leading-[15px] text-[#1a4fd0]">
            Si se asigna un almacén, este proveedor solo servirá los pedidos de ese almacén
          </span>
        </GwGroup>
        <GwGroup title="Sector del libro" className="grid grid-cols-[80px_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
          <span className="gw-label">Id Sinli:</span>
          {text('id_sinli', 'Identificador Sinli', '!w-[200px]')}
          <span className="gw-label">Id Fande:</span>
          {text('id_fande', 'Identificador Fande', '!w-[200px]')}
        </GwGroup>
      </div>
      <div className="grid grid-cols-[minmax(0,400px)_minmax(0,1fr)] gap-2">
        <GwGroup title="Cuentas Contables" className="grid grid-cols-[210px_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
          {cuenta('Cuenta del Proveedor (400):', 'cuenta_contable_400', 'CTA400')}
          {cuenta('Compras (600):', 'cuenta_contable_600', 'CTA600')}
          {cuenta('Proveedores efectos a pagar (401):', 'cuenta_contable_401', 'CTA401')}
          {cuenta('Efectos a pagar (41150):', 'cuenta_contable_41150', 'CTA41150')}
          {cuenta('Banco C/C vista (572):', 'cuenta_contable_572', 'CTA572')}
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
