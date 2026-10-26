import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwInput, GwLookupButton, GwSelect, GwTextArea } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import type { Cliente, ClienteTabProps } from '../types'

interface Opcion {
  codigo: string
  nombre: string
}

type CodigoPostal = {
  codigo_postal: string
  poblacion: string
  provincia_codigo: string | null
  pais_codigo: string | null
}

function fecha(v: string | null) {
  if (!v) return '  /  /'
  const d = new Date(v.length === 10 ? `${v}T00:00:00` : v)
  return Number.isNaN(d.getTime()) ? v : d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

export function TabGeneral({ cliente, editing, onChange }: ClienteTabProps) {
  const [provincias, setProvincias] = useState<Opcion[]>([])
  const [paises, setPaises] = useState<Opcion[]>([])
  const [buscarCp, setBuscarCp] = useState(false)
  const ro = !editing

  useEffect(() => {
    Promise.all([
      supabase.from('provincia').select('codigo, nombre').order('nombre'),
      supabase.from('pais').select('codigo, nombre').order('nombre'),
    ]).then(([pr, pa]) => {
      setProvincias((pr.data ?? []) as Opcion[])
      setPaises((pa.data ?? []) as Opcion[])
    })
  }, [])

  const txt = (key: keyof Cliente, title: string) => (
    <GwInput
      value={(cliente[key] ?? '') as string}
      disabled={ro}
      title={title}
      onChange={(e) => onChange({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Cliente>)}
    />
  )

  const opciones = (lista: Opcion[], actual: string | null) => (
    <>
      <option value="">—</option>
      {lista.map((o) => (
        <option key={o.codigo} value={o.codigo}>
          {o.nombre}
        </option>
      ))}
      {actual && !lista.some((o) => o.codigo === actual) && <option value={actual}>{actual}</option>}
    </>
  )

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_200px] gap-x-2 gap-y-1">
        <GwField label="Gerente">{txt('gerente', 'GERENTE')}</GwField>
        <GwField label="Contacto">{txt('contacto', 'CONTACTO')}</GwField>
        <GwField label="Fecha Última Venta">
          <GwInput readOnly disabled={ro} value={fecha(cliente.fecha_ultima_venta)} title="F_ULTVTA" />
        </GwField>
        <GwField label="Comentario" className="col-span-2">
          <GwTextArea
            rows={2}
            value={cliente.comentario ?? ''}
            disabled={ro}
            title="COMENTARIO"
            onChange={(e) => onChange({ comentario: e.target.value === '' ? null : e.target.value })}
          />
        </GwField>
        <div className="flex flex-col justify-end gap-1 pb-0.5">
          <GwCheck label="Cliente genérico" checked={cliente.es_generico} disabled={ro} onChange={(v) => onChange({ es_generico: v })} />
          <GwCheck
            label={<span className={cliente.bloqueado ? 'font-bold text-[#c42b1c]' : ''}>Bloquear cliente</span>}
            checked={cliente.bloqueado}
            disabled={ro}
            onChange={(v) => onChange({ bloqueado: v })}
          />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)_380px] gap-2">
        <GwGroup title="Dirección" className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-2 gap-y-1">
          <GwField label="Dirección" className="col-span-2">
            {txt('direccion', 'DIRECCION')}
          </GwField>
          <GwField label="Código Postal">
            <span className="flex">
              {txt('codigo_postal', 'CODPOSTAL')}
              <GwLookupButton disabled={ro} onClick={() => setBuscarCp(true)} title="Buscar código postal" />
            </span>
          </GwField>
          <GwField label="Población">{txt('poblacion', 'POBLACION')}</GwField>
          <GwField label="Provincia">
            <GwSelect
              value={cliente.provincia_codigo ?? ''}
              disabled={ro}
              title="PROVINCIA"
              onChange={(e) => onChange({ provincia_codigo: e.target.value || null })}
            >
              {opciones(provincias, cliente.provincia_codigo)}
            </GwSelect>
          </GwField>
          <GwField label="País">
            <GwSelect
              value={cliente.pais_codigo ?? ''}
              disabled={ro}
              title="PAIS"
              onChange={(e) => onChange({ pais_codigo: e.target.value || null })}
            >
              {opciones(paises, cliente.pais_codigo)}
            </GwSelect>
          </GwField>
        </GwGroup>

        <div className="flex flex-col gap-1.5">
          <GwGroup title="Teléfonos" className="grid grid-cols-3 gap-x-2">
            <GwField label="Fijo">{txt('telefono_fijo', 'TELEFONO')}</GwField>
            <GwField label="Móvil">{txt('telefono_movil', 'MOVIL')}</GwField>
            <GwField label="Fax">{txt('fax', 'FAX')}</GwField>
          </GwGroup>
          <GwGroup title="Internet" className="flex flex-col gap-1">
            <GwField label="Email">{txt('email', 'EMAIL')}</GwField>
            <GwField label="Web">{txt('web', 'WEB')}</GwField>
          </GwGroup>
        </div>
      </div>

      {buscarCp && (
        <GwLookupDialog<CodigoPostal & { calle: string | null }>
          title="Códigos Postales"
          table="codigo_postal"
          columns={[
            { key: 'codigo_postal', label: 'C. Postal', width: 80 },
            { key: 'poblacion', label: 'Población' },
            { key: 'calle', label: 'Calle' },
            { key: 'provincia_codigo', label: 'Prov.', width: 60 },
          ]}
          searchColumns={['codigo_postal', 'poblacion', 'calle']}
          orderBy="codigo_postal"
          keyColumn="codigo_postal"
          onPick={(r) => {
            onChange({
              codigo_postal: r.codigo_postal,
              poblacion: r.poblacion,
              provincia_codigo: r.provincia_codigo ?? cliente.provincia_codigo,
              pais_codigo: r.pais_codigo ?? cliente.pais_codigo,
            })
            setBuscarCp(false)
          }}
          onClose={() => setBuscarCp(false)}
        />
      )}
    </div>
  )
}
