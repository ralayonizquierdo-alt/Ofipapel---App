import { useEffect, useState } from 'react'
import { supabase } from '../../../../lib/supabase'
import { GwDate, GwField, GwGroup, GwInline, GwInput, GwLookupButton, GwSelect } from '../../../../components/gw'
import { GwLookupDialog } from '../../../../components/gw/GwLookupDialog'
import type { Vendedor, VendedorTabProps } from '../types'

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

export function TabDatosGenerales({ tipo, vendedor: cliente, editing, onChange }: VendedorTabProps) {
  const [provincias, setProvincias] = useState<Opcion[]>([])
  const [paises, setPaises] = useState<Opcion[]>([])
  const [buscarCp, setBuscarCp] = useState(false)
  const [buscar, setBuscar] = useState<'provincia' | 'pais' | null>(null)
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

  const txt = (key: keyof Vendedor, title: string) => (
    <GwInput
      value={(cliente[key] ?? '') as string}
      disabled={ro}
      title={title}
      onChange={(e) => onChange({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Vendedor>)}
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
    <div className="flex flex-col gap-1">
      <div className="h-[38px]" />
      <GwGroup className="mt-1 flex flex-col gap-1">
        <div className="grid grid-cols-[150px_minmax(0,1fr)] gap-x-2">
          <GwField label="Cod. Postal">
            <span className="flex">
              {txt('codigo_postal', 'CODPOSTAL')}
              <GwLookupButton disabled={ro} onClick={() => setBuscarCp(true)} title="Buscar código postal" />
            </span>
          </GwField>
          <GwField label="Dirección">
            <span className="flex">
              {txt('direccion', 'DIRECCION')}
              <GwLookupButton disabled={ro} onClick={() => setBuscarCp(true)} title="Buscar calle" />
            </span>
          </GwField>
        </div>
        <div className="grid grid-cols-[minmax(0,350px)_minmax(0,280px)_minmax(0,1fr)] gap-x-2">
          <GwField label="Población">
            <span className="flex">
              {txt('poblacion', 'POBLACION')}
              <GwLookupButton disabled={ro} onClick={() => setBuscarCp(true)} title="Buscar población" />
            </span>
          </GwField>
          <GwField label="Província">
            <span className="flex">
              <GwSelect
                value={cliente.provincia_codigo ?? ''}
                disabled={ro}
                title="PROVINCIA"
                onChange={(e) => onChange({ provincia_codigo: e.target.value || null })}
              >
                {opciones(provincias, cliente.provincia_codigo)}
              </GwSelect>
              <GwLookupButton disabled={ro} onClick={() => setBuscar('provincia')} title="Buscar provincia" />
            </span>
          </GwField>
          <GwField label="País">
            <span className="flex">
              <GwSelect
                value={cliente.pais_codigo ?? ''}
                disabled={ro}
                title="PAIS"
                onChange={(e) => onChange({ pais_codigo: e.target.value || null })}
              >
                {opciones(paises, cliente.pais_codigo)}
              </GwSelect>
              <GwLookupButton disabled={ro} onClick={() => setBuscar('pais')} title="Buscar país" />
            </span>
          </GwField>
        </div>
        <GwGroup title="Teléfonos" className="mr-[90px] flex items-center gap-3">
          <GwInline label="Tlf. Fijo:" className="flex-1">{txt('telefono_fijo', 'TLF_FIJO')}</GwInline>
          <GwInline label="Tlf. Móvil:" className="flex-1">{txt('telefono_movil', 'TLF_MOVIL')}</GwInline>
          <GwInline label="Fax:" className="flex-1">{txt('fax', 'TLF_FAX')}</GwInline>
        </GwGroup>
        <div className="grid grid-cols-2 gap-x-2">
          <GwField label="Dirección E-mail (Correo Electrónico)">{txt('email', 'DIREMAIL')}</GwField>
          <GwField label="Dirección Web (URL)">{txt('web', 'DIRWEB')}</GwField>
        </div>
      </GwGroup>
      <div className="flex items-center gap-6 px-1">
        <GwInline label="Fecha de Alta:">
          <FechaInput value={cliente.fecha_alta} disabled={ro} title="F_ALTA" onChange={(v) => onChange({ fecha_alta: v })} />
        </GwInline>
        <GwInline label="Fecha de Baja:">
          <FechaInput value={cliente.fecha_baja} disabled={ro} title="F_BAJA" onChange={(v) => onChange({ fecha_baja: v })} />
        </GwInline>
        {tipo === 'vendedor' && (
          <GwInline label="Fecha Nacimiento:">
            <FechaInput value={cliente.fecha_nacimiento} disabled={ro} title="FECHANACI" onChange={(v) => onChange({ fecha_nacimiento: v })} />
          </GwInline>
        )}
      </div>

      {buscar && (
        <GwLookupDialog<Opcion & Record<string, unknown>>
          title={buscar === 'provincia' ? 'Provincias' : 'Países'}
          table={buscar}
          columns={[
            { key: 'codigo', label: 'Código', width: 80 },
            { key: 'nombre', label: 'Nombre' },
          ]}
          searchColumns={['codigo', 'nombre']}
          orderBy="nombre"
          keyColumn="codigo"
          onPick={(r) => {
            onChange(buscar === 'provincia' ? { provincia_codigo: r.codigo } : { pais_codigo: r.codigo })
            setBuscar(null)
          }}
          onClose={() => setBuscar(null)}
        />
      )}
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

function FechaInput({ value, onChange, disabled, title }: { value: string | null; onChange: (v: string | null) => void; disabled?: boolean; title?: string }) {
  return (
    <GwDate className="!w-[150px]" title={title} value={value} disabled={disabled} onChange={onChange} />
  )
}
