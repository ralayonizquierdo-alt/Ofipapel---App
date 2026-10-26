import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { Check, X } from 'lucide-react'
import { GwField, GwGroup, GwInline, GwInput, GwLookupButton, GwSelect } from '../../../components/gw'
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
    <div className="flex flex-col gap-1">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-2">
        <GwField label="Gerente">{txt('gerente', 'GERENTE')}</GwField>
        <GwField label="Contacto">{txt('contacto', 'CONTACTO')}</GwField>
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_130px_105px_105px] items-end gap-x-2">
        <GwField label="Comentario">{txt('comentario', 'COMENTARIO')}</GwField>
        <GwField label="Fecha Ult. Venta">
          <GwInput readOnly disabled={ro} value={fecha(cliente.fecha_ultima_venta)} title="F_ULTVTA" />
        </GwField>
        <BotonCasilla label="Cliente Genérico" checked={cliente.es_generico} disabled={ro} title="GENERICO" onChange={(v) => onChange({ es_generico: v })} />
        <BotonCasilla
          label="Bloquear Cliente"
          checked={cliente.bloqueado}
          disabled={ro}
          title="BLOQUEADO"
          onChange={(v) => onChange({ bloqueado: v })}
        />
      </div>

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
          <GwField label="Provincia">
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
          <GwInline label="Tlf. Fijo:" className="flex-1">{txt('telefono_fijo', 'TELEFONO')}</GwInline>
          <GwInline label="Tlf. Móvil:" className="flex-1">{txt('telefono_movil', 'MOVIL')}</GwInline>
          <GwInline label="Fax:" className="flex-1">{txt('fax', 'FAX')}</GwInline>
        </GwGroup>
        <div className="grid grid-cols-2 gap-x-2">
          <GwField label="Dirección E-mail (Correo Electrónico)">{txt('email', 'EMAIL')}</GwField>
          <GwField label="Dirección Web (URL)">{txt('web', 'WEB')}</GwField>
        </div>
      </GwGroup>

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

/** Botón-casilla de GeminisWin: × roja cuando está desactivado, ✓ verde cuando está activado. */
function BotonCasilla({
  label,
  checked,
  disabled,
  title,
  onChange,
}: {
  label: string
  checked: boolean
  disabled?: boolean
  title?: string
  onChange: (v: boolean) => void
}) {
  return (
    <button
      type="button"
      title={title}
      aria-pressed={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`flex h-[34px] items-center gap-1 border border-[var(--gw-border)] px-1.5 text-left text-[13px] leading-[14px] ${
        checked ? 'bg-[#dfe9f7]' : 'bg-[var(--gw-face)]'
      } disabled:text-[var(--gw-text)]`}
    >
      {checked ? <Check size={12} strokeWidth={3} className="flex-none text-[#127a12]" /> : <X size={12} strokeWidth={3} className="flex-none text-[#c42b1c]" />}
      <span>{label}</span>
    </button>
  )
}
