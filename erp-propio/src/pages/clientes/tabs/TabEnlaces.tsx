import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwField, GwGroup, GwInput, GwLookupButton, GwNumber, GwSelect } from '../../../components/gw'
import { GwLookupDialog } from '../../../components/gw/GwLookupDialog'
import type { Cliente, ClienteTabProps } from '../types'

interface Opcion {
  codigo: string
  nombre: string
}

interface Maestro {
  key: 'vendedor_codigo' | 'tienda_defecto_codigo' | 'zona_territorial_codigo' | 'ruta_codigo'
  label: string
  title: string
  table: string
  nombre: string
}

const MAESTROS: Maestro[] = [
  { key: 'vendedor_codigo', label: 'Vendedor', title: 'VENDEDOR', table: 'vendedor', nombre: 'nombre' },
  { key: 'tienda_defecto_codigo', label: 'Tienda asignada', title: 'OFICINA', table: 'tienda_terminal', nombre: 'descripcion' },
  { key: 'zona_territorial_codigo', label: 'Zona territorial', title: 'ZONATERR', table: 'zona_territorial', nombre: 'descripcion' },
  {
    key: 'ruta_codigo',
    label: 'Ruta de reparto',
    title: 'RUTA — si no hay, se usa la de la zona territorial',
    table: 'ruta',
    nombre: 'descripcion',
  },
]

export function TabEnlaces({ cliente, editing, onChange }: ClienteTabProps) {
  const disabled = !editing
  const [opciones, setOpciones] = useState<Record<string, Opcion[]>>({})
  const [lookup, setLookup] = useState<Maestro | null>(null)

  useEffect(() => {
    Promise.all(
      MAESTROS.map((m) =>
        supabase
          .from(m.table)
          .select(`codigo, ${m.nombre}`)
          .order('codigo')
          .then(({ data }) => [
            m.key,
            ((data ?? []) as unknown as Record<string, string>[]).map((r) => ({ codigo: r.codigo, nombre: r[m.nombre] ?? '' })),
          ]),
      ),
    ).then((pares) => setOpciones(Object.fromEntries(pares)))
  }, [])

  const text = (key: keyof Cliente, title: string, className = '') => (
    <GwInput
      title={title}
      className={className}
      value={(cliente[key] as string | null) ?? ''}
      disabled={disabled}
      onChange={(e) => onChange({ [key]: e.target.value === '' ? null : e.target.value } as Partial<Cliente>)}
    />
  )

  const maestro = (m: Maestro, extra?: ReactNode) => {
    const lista = opciones[m.key] ?? []
    const valor = cliente[m.key]
    return (
      <GwField key={m.key} label={m.label}>
        <div className="flex gap-1" title={m.title}>
          <GwSelect
            value={valor ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ [m.key]: e.target.value === '' ? null : e.target.value } as Partial<Cliente>)}
          >
            <option value="" />
            {valor && !lista.some((o) => o.codigo === valor) && <option value={valor}>{valor}</option>}
            {lista.map((o) => (
              <option key={o.codigo} value={o.codigo}>
                {o.codigo} — {o.nombre}
              </option>
            ))}
          </GwSelect>
          <GwLookupButton disabled={disabled} onClick={() => setLookup(m)} title={`Buscar ${m.label.toLowerCase()}`} />
          {extra}
        </div>
      </GwField>
    )
  }

  const face = (label: string, codigo: keyof Cliente, nombre: keyof Cliente, title: string) => (
    <GwField label={label}>
      <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-1">
        {text(codigo, `${title} (código)`)}
        {text(nombre, `${title} (nombre)`)}
      </div>
    </GwField>
  )

  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-2">
      <div className="flex flex-col gap-1.5">
        <GwGroup title="Enlaces" className="flex flex-col gap-1">
          {MAESTROS.slice(0, 3).map((m) => maestro(m))}
          <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-2">
            {maestro(MAESTROS[3])}
            <GwField label="Orden en ruta">
              <span title="ORDENRUTA">
                <GwNumber decimals={0} value={cliente.orden_en_ruta} disabled={disabled} onChange={(v) => onChange({ orden_en_ruta: v })} />
              </span>
            </GwField>
          </div>
          <GwField label="Código de barras del cliente">{text('codigo_barras', 'COD_BARRAS', '!w-[220px]')}</GwField>
        </GwGroup>
        <GwGroup title="Cuentas contables" className="grid grid-cols-[90px_minmax(0,220px)] items-center gap-x-2 gap-y-1">
          <span className="gw-label">Cliente 430</span>
          {text('cuenta_contable_430', 'CTA430')}
          <span className="gw-label">Ventas 700</span>
          {text('cuenta_contable_700', 'CTA700')}
          <span className="gw-label">4310</span>
          {text('cuenta_contable_431', 'CTA4310')}
          <span className="gw-label">4315</span>
          {text('cuenta_contable_43150', 'CTA4315')}
          <span className="gw-label">Caja 572</span>
          {text('cuenta_contable_572', 'CTA572')}
        </GwGroup>
      </div>
      <GwGroup title="FacE (Administración)" className="flex flex-col gap-1">
        {face('Órgano gestor', 'face_organo_gestor', 'face_organo_gestor_nombre', 'FACEORGGES')}
        {face('Unidad tramitadora', 'face_unidad_tramitadora', 'face_unidad_tramitadora_nombre', 'FACEUNITRA')}
        {face('Oficina contable', 'face_oficina_contable', 'face_oficina_contable_nombre', 'FACEOFICON')}
      </GwGroup>
      {lookup && (
        <GwLookupDialog<Record<string, unknown>>
          title={lookup.label}
          table={lookup.table}
          columns={[
            { key: 'codigo', label: 'Código', width: 110 },
            { key: lookup.nombre, label: 'Nombre' },
          ]}
          searchColumns={['codigo', lookup.nombre]}
          orderBy="codigo"
          keyColumn="codigo"
          onClose={() => setLookup(null)}
          onPick={(r) => {
            onChange({ [lookup.key]: String(r.codigo) } as Partial<Cliente>)
            setLookup(null)
          }}
        />
      )}
    </div>
  )
}
