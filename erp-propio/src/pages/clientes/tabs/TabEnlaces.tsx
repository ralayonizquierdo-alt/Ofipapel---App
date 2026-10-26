import { useEffect, useState, type ReactNode } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwGroup, GwInput, GwLookupButton, GwNumber } from '../../../components/gw'
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

  const maestro = (m: Maestro, titulo: string, extra?: ReactNode) => {
    const lista = opciones[m.key] ?? []
    const valor = cliente[m.key]
    const nombre = lista.find((o) => o.codigo === valor)?.nombre ?? ''
    return (
      <GwGroup key={m.key} title={titulo} className="flex flex-col gap-1">
        <div className="grid grid-cols-[80px_minmax(0,1fr)_auto] gap-1" title={m.title}>
          <GwInput
            value={valor ?? ''}
            disabled={disabled}
            onChange={(e) => onChange({ [m.key]: e.target.value === '' ? null : e.target.value } as Partial<Cliente>)}
          />
          <GwInput readOnly value={nombre} tabIndex={-1} />
          <GwLookupButton disabled={disabled} onClick={() => setLookup(m)} title={`Buscar ${m.label.toLowerCase()}`} />
        </div>
        {extra}
      </GwGroup>
    )
  }

  const cuenta = (label: string, key: keyof Cliente, title: string) => (
    <>
      <span className="gw-label">{label}</span>
      {text(key, title)}
    </>
  )

  const face = (label: string, ayuda: string, codigo: keyof Cliente, nombre: keyof Cliente, title: string) => (
    <div className="flex flex-col">
      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-1">
        <span className="gw-label">{label}</span>
        <span className="gw-label">{ayuda}</span>
      </div>
      <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-1">
        {text(codigo, `${title} (código)`)}
        {text(nombre, `${title} (nombre)`)}
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-1.5">
      <div className="grid grid-cols-2 gap-x-2 gap-y-1">
        {maestro(MAESTROS[0], 'Vendedor predeterminado asignado a este cliente')}
        {maestro(MAESTROS[1], 'Tienda predeterminada asignada a este Cliente')}
        {maestro(MAESTROS[2], 'Zona Territorial')}
        {maestro(
          MAESTROS[3],
          'Ruta de Reparto',
          <div className="flex items-start gap-2">
            <span className="flex-1 text-[13px] leading-[15px] text-[#1a4fd0]">
              Si no se asigna una ruta de reparto, se le asignará la ruta de reparto de la zona territorial
            </span>
            <span className="flex items-center gap-1" title="ORDENRUTA">
              <span className="gw-label">Orden:</span>
              <span className="w-[60px]">
                <GwNumber decimals={0} value={cliente.orden_en_ruta} disabled={disabled} onChange={(v) => onChange({ orden_en_ruta: v })} />
              </span>
            </span>
          </div>,
        )}
      </div>
      <div className="grid grid-cols-[minmax(0,320px)_minmax(0,1fr)] gap-2">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2 pl-1.5">
            <span className="gw-label w-[140px]">Código de Barras:</span>
            {text('codigo_barras', 'COD_BARRAS', '!w-[160px]')}
          </div>
          <GwGroup title="Cuentas Contables" className="grid grid-cols-[150px_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
            {cuenta('Cuenta del Cliente (430):', 'cuenta_contable_430', 'CTA430')}
            {cuenta('Ventas del cliente(700):', 'cuenta_contable_700', 'CTA700')}
            {cuenta('Efectos a cobrar (4310):', 'cuenta_contable_431', 'CTA4310')}
            {cuenta('Efct. impagados (4315):', 'cuenta_contable_43150', 'CTA4315')}
            {cuenta('Banco C/C vista (572):', 'cuenta_contable_572', 'CTA572')}
          </GwGroup>
        </div>
        <GwGroup title="FacE datos identificativos de la Administración" className="flex flex-col gap-1">
          {face('Órgano Gestor', 'Nombre, en su defecto se usará la Razón Social', 'face_organo_gestor', 'face_organo_gestor_nombre', 'FACEORGGES')}
          {face('Unidad Tramitadora', 'Nombre, en su defecto se usará el Gerente', 'face_unidad_tramitadora', 'face_unidad_tramitadora_nombre', 'FACEUNITRA')}
          {face('Oficina Contable', 'Nombre, en su defecto se usará el comentario', 'face_oficina_contable', 'face_oficina_contable_nombre', 'FACEOFICON')}
        </GwGroup>
      </div>
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
