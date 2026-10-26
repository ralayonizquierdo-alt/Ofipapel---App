import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwField, GwGroup, GwInline, GwInput, GwLookupButton, GwSelect } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import type { Proveedor, ProveedorTabProps } from '../types'

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

export function TabDatosGenerales({ proveedor, editing, onChange }: ProveedorTabProps) {
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

  const txt = (key: keyof Proveedor, title: string) => (
    <GwInput
      value={(proveedor[key] ?? '') as string}
      disabled={ro}
      title={title}
      onChange={(e) => onChange({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Proveedor>)}
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
      <GwGroup className="flex flex-col gap-1">
        <div className="grid grid-cols-[230px_minmax(0,1fr)] gap-x-2">
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
        <div className="grid grid-cols-[minmax(0,1.05fr)_minmax(0,0.8fr)_minmax(0,0.5fr)] gap-x-2">
          <GwField label="Población">
            <span className="flex">
              {txt('poblacion', 'POBLACION')}
              <GwLookupButton disabled={ro} onClick={() => setBuscarCp(true)} title="Buscar población" />
            </span>
          </GwField>
          <GwField label="Província">
            <span className="flex">
              <GwSelect
                value={proveedor.provincia_codigo ?? ''}
                disabled={ro}
                title="PROVINCIA"
                onChange={(e) => onChange({ provincia_codigo: e.target.value || null })}
              >
                {opciones(provincias, proveedor.provincia_codigo)}
              </GwSelect>
              <GwLookupButton disabled={ro} onClick={() => setBuscar('provincia')} title="Buscar provincia" />
            </span>
          </GwField>
          <GwField label="País">
            <span className="flex">
              <GwSelect value={proveedor.pais_codigo ?? ''} disabled={ro} title="PAIS" onChange={(e) => onChange({ pais_codigo: e.target.value || null })}>
                {opciones(paises, proveedor.pais_codigo)}
              </GwSelect>
              <GwLookupButton disabled={ro} onClick={() => setBuscar('pais')} title="Buscar país" />
            </span>
          </GwField>
        </div>
        <GwGroup title="Teléfonos" className="mr-[80px] flex items-center gap-3">
          <GwInline label="Tlf. Fijo:" className="flex-1">
            {txt('telefono_fijo', 'TELEFONO')}
          </GwInline>
          <GwInline label="Tlf. Móvil:" className="flex-1">
            {txt('telefono_movil', 'MOVIL')}
          </GwInline>
          <GwInline label="Fax:" className="flex-1">
            {txt('fax', 'FAX')}
          </GwInline>
        </GwGroup>
        <div className="grid grid-cols-2 gap-x-2">
          <GwField label="Dirección E-mail (Correo Electrónico)">{txt('email', 'EMAIL')}</GwField>
          <GwField label="Dirección Web (URL)">{txt('web', 'WEB')}</GwField>
        </div>
      </GwGroup>

      <div className="mt-1 flex items-center gap-6">
        <GwInline label="Fecha de Alta:">
          <GwInput type="date" title="F_ALTA" className="!w-[150px]" value={proveedor.fecha_alta ? proveedor.fecha_alta.slice(0, 10) : ''} disabled={ro} onChange={(e) => onChange({ fecha_alta: e.target.value || null })} />
        </GwInline>
        <GwInline label="Fecha de Baja:">
          <GwInput type="date" title="F_BAJA" className="!w-[150px]" value={proveedor.fecha_baja ? proveedor.fecha_baja.slice(0, 10) : ''} disabled={ro} onChange={(e) => onChange({ fecha_baja: e.target.value || null })} />
        </GwInline>
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
              provincia_codigo: r.provincia_codigo ?? proveedor.provincia_codigo,
              pais_codigo: r.pais_codigo ?? proveedor.pais_codigo,
            })
            setBuscarCp(false)
          }}
          onClose={() => setBuscarCp(false)}
        />
      )}
    </div>
  )
}
