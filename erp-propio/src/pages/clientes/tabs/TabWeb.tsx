import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwDate, GwField, GwGroup, GwInline, GwInput, GwNumber, GwSelect } from '../../../components/gw'
import type { Cliente, ClienteTabProps } from '../types'

export function TabWeb({ cliente, editing, onChange }: ClienteTabProps) {
  const [sucursales, setSucursales] = useState<{ codigo: string; nombre: string }[]>([])
  const ro = !editing

  useEffect(() => {
    if (!cliente.codigo) return
    supabase
      .from('cliente_sucursal')
      .select('codigo, nombre')
      .eq('cliente_codigo', cliente.codigo)
      .order('codigo')
      .then(({ data }) => setSucursales(data ?? []))
  }, [cliente.codigo])

  const texto = (key: keyof Cliente, title: string, disabled = ro) => (
    <GwInput
      title={title}
      disabled={disabled}
      value={(cliente[key] as string | null) ?? ''}
      onChange={(e) => onChange({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Cliente>)}
    />
  )

  const distintos = cliente.web_factura_datos_distintos

  return (
    <GwGroup
      title={<GwCheck label="Cliente Web" disabled={ro} checked={cliente.web_publicado} onChange={(v) => onChange({ web_publicado: v })} />}
      className="flex flex-col gap-1.5"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_250px_190px] gap-4">
        <GwInline label="Usuario:" className="[&>span]:w-[64px]">
          {texto('web_usuario', 'WEBUSUARIO')}
        </GwInline>
        <GwInline label="Contraseña:">
          <GwInput
            disabled
            value=""
            title={cliente.web_contrasena_hash ? 'Contraseña establecida' : 'Sin contraseña'}
            placeholder={cliente.web_contrasena_hash ? '••••••••' : ''}
          />
        </GwInline>
        <GwInline label="Fecha baja:">
          <GwDate title="WEB_F_BAJA" disabled={ro} value={cliente.web_fecha_baja} onChange={(v) => onChange({ web_fecha_baja: v })} />
        </GwInline>
      </div>
      <div className="flex items-center gap-4">
        <GwInline label="Cliente WebId:" className="w-[230px]">
          <GwNumber decimals={0} disabled={ro} value={cliente.web_id_cliente} onChange={(v) => onChange({ web_id_cliente: v })} />
        </GwInline>
        <GwInline label="Sucursal predeterminada para la entrega de productos Web:" className="ml-auto">
          <GwSelect
            title="WEBIDSUCUR"
            className="!w-[140px]"
            disabled={ro}
            value={cliente.web_id_sucursal ?? ''}
            onChange={(e) => onChange({ web_id_sucursal: e.target.value || null })}
          >
            <option value="" />
            {sucursales.map((s) => (
              <option key={s.codigo} value={s.codigo}>
                {s.codigo} — {s.nombre}
              </option>
            ))}
          </GwSelect>
        </GwInline>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <GwField label="Nombre">{texto('web_nombre_pila', 'WEBNOMBRE')}</GwField>
        <GwField label="Apellidos">{texto('web_apellidos', 'WEBAPELLID')}</GwField>
      </div>
      <GwGroup title="Datos de Facturación y/o Transporte" className="flex flex-col gap-1">
        <div className="grid grid-cols-2 gap-4">
          <GwField label="Nombre">{texto('web_fact_nombre_pila', 'WEBFNOMBRE', ro || !distintos)}</GwField>
          <GwField label="Apellidos">{texto('web_fact_apellidos', 'WEBFAPELLI', ro || !distintos)}</GwField>
        </div>
        <GwCheck
          label="Usar datos de facturación distintos a los del transporte"
          disabled={ro}
          checked={distintos}
          onChange={(v) => onChange({ web_factura_datos_distintos: v })}
        />
      </GwGroup>
    </GwGroup>
  )
}
