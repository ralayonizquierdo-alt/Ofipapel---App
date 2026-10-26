import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwInput, GwNumber, GwSelect } from '../../../components/gw'
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

  function texto(key: keyof Cliente, label: string, title: string, disabled = ro) {
    return (
      <GwField label={label}>
        <GwInput
          title={title}
          disabled={disabled}
          value={(cliente[key] as string | null) ?? ''}
          onChange={(e) => onChange({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Cliente>)}
        />
      </GwField>
    )
  }

  const distintos = cliente.web_factura_datos_distintos

  return (
    <div className="flex flex-col gap-1.5">
      <GwGroup title="Cliente Web" className="grid grid-cols-[auto_150px_140px_minmax(0,1fr)] items-end gap-x-3 gap-y-1">
        <GwCheck label="Cliente web" disabled={ro} checked={cliente.web_publicado} onChange={(v) => onChange({ web_publicado: v })} />
        <GwField label="Fecha de baja web">
          <GwInput
            type="date"
            title="WEB_F_BAJA"
            disabled={ro}
            value={cliente.web_fecha_baja ?? ''}
            onChange={(e) => onChange({ web_fecha_baja: e.target.value || null })}
          />
        </GwField>
        <GwField label="Id Web">
          <GwNumber decimals={0} disabled={ro} value={cliente.web_id_cliente} onChange={(v) => onChange({ web_id_cliente: v })} />
        </GwField>
        <GwField label="Sucursal de entrega">
          <GwSelect
            title="WEBIDSUCUR"
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
        </GwField>
      </GwGroup>

      <GwGroup title="Acceso" className="grid grid-cols-[minmax(0,1fr)_220px] gap-x-3 gap-y-1">
        {texto('web_usuario', 'Usuario', 'WEBUSUARIO')}
        <GwField label="Contraseña">
          <GwInput readOnly value={cliente.web_contrasena_hash ? 'Contraseña establecida' : 'Sin contraseña'} />
        </GwField>
      </GwGroup>

      <div className="grid grid-cols-2 gap-2">
        <GwGroup title="Datos de envío" className="grid grid-cols-2 gap-x-2 gap-y-1">
          {texto('web_nombre_pila', 'Nombre', 'WEBNOMBRE')}
          {texto('web_apellidos', 'Apellidos', 'WEBAPELLID')}
        </GwGroup>
        <GwGroup title="Datos de facturación" className="grid grid-cols-2 gap-x-2 gap-y-1">
          <GwCheck
            className="col-span-2"
            label="Datos de facturación distintos de los de envío"
            disabled={ro}
            checked={distintos}
            onChange={(v) => onChange({ web_factura_datos_distintos: v })}
          />
          {texto('web_fact_nombre_pila', 'Nombre', 'WEBFNOMBRE', ro || !distintos)}
          {texto('web_fact_apellidos', 'Apellidos', 'WEBFAPELLI', ro || !distintos)}
        </GwGroup>
      </div>
    </div>
  )
}
