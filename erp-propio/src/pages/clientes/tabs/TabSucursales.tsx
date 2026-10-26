import { useEffect, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwInput, GwNumber, GwSelect, GwTabs } from '../../../components/gw'
import type { ClienteTabProps } from '../types'

interface Sucursal {
  cliente_codigo: string
  codigo: string
  nombre: string
  nif: string | null
  gerente: string | null
  contacto: string | null
  direccion: string | null
  codigo_postal: string | null
  provincia_codigo: string | null
  pais_codigo: string | null
  poblacion: string | null
  telefono_fijo: string | null
  telefono_movil: string | null
  fax: string | null
  email: string | null
  web: string | null
  zona_territorial_codigo: string | null
  vendedor_codigo: string | null
  ruta_codigo: string | null
  orden_en_ruta: number | null
  face_organo_gestor: string | null
  face_organo_gestor_nombre: string | null
  face_unidad_tramitadora: string | null
  face_unidad_tramitadora_nombre: string | null
  face_oficina_contable: string | null
  face_oficina_contable_nombre: string | null
  fecha_alta: string | null
  fecha_baja: string | null
}

interface Opcion {
  codigo: string
  nombre: string
}

const COLUMNAS =
  'cliente_codigo, codigo, nombre, nif, gerente, contacto, direccion, codigo_postal, provincia_codigo, pais_codigo, poblacion, telefono_fijo, telefono_movil, fax, email, web, zona_territorial_codigo, vendedor_codigo, ruta_codigo, orden_en_ruta, face_organo_gestor, face_organo_gestor_nombre, face_unidad_tramitadora, face_unidad_tramitadora_nombre, face_oficina_contable, face_oficina_contable_nombre, fecha_alta, fecha_baja'

const SUBTABS = [
  [
    { key: 'generales', label: 'Datos generales' },
    { key: 'enlaces', label: 'Enlaces' },
  ],
]

function vacia(clienteCodigo: string, codigo: string): Sucursal {
  return {
    cliente_codigo: clienteCodigo,
    codigo,
    nombre: '',
    nif: null,
    gerente: null,
    contacto: null,
    direccion: null,
    codigo_postal: null,
    provincia_codigo: null,
    pais_codigo: null,
    poblacion: null,
    telefono_fijo: null,
    telefono_movil: null,
    fax: null,
    email: null,
    web: null,
    zona_territorial_codigo: null,
    vendedor_codigo: null,
    ruta_codigo: null,
    orden_en_ruta: null,
    face_organo_gestor: null,
    face_organo_gestor_nombre: null,
    face_unidad_tramitadora: null,
    face_unidad_tramitadora_nombre: null,
    face_oficina_contable: null,
    face_oficina_contable_nombre: null,
    fecha_alta: new Date().toISOString().slice(0, 10),
    fecha_baja: null,
  }
}

function siguienteCodigo(rows: Sucursal[]) {
  const nums = rows.map((r) => Number(r.codigo)).filter((n) => Number.isInteger(n))
  const largo = Math.max(3, ...rows.map((r) => r.codigo.length))
  return String((nums.length ? Math.max(...nums) : 0) + 1).padStart(largo, '0')
}

export function TabSucursales({ cliente, editing, onChange }: ClienteTabProps) {
  const clienteCodigo = cliente.codigo
  const [rows, setRows] = useState<Sucursal[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<Sucursal | null>(null)
  const [esNueva, setEsNueva] = useState(false)
  const [subtab, setSubtab] = useState('generales')
  const [error, setError] = useState<string | null>(null)
  const [zonas, setZonas] = useState<Opcion[]>([])
  const [vendedores, setVendedores] = useState<Opcion[]>([])
  const [rutas, setRutas] = useState<Opcion[]>([])
  const [provincias, setProvincias] = useState<Opcion[]>([])
  const [paises, setPaises] = useState<Opcion[]>([])

  async function load() {
    const { data, error: err } = await supabase.from('cliente_sucursal').select(COLUMNAS).eq('cliente_codigo', clienteCodigo).order('codigo')
    if (err) setError(err.message)
    setRows((data ?? []) as Sucursal[])
  }

  useEffect(() => {
    if (!clienteCodigo) return
    load()
    setSelected(null)
    setDraft(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteCodigo])

  useEffect(() => {
    Promise.all([
      supabase.from('zona_territorial').select('codigo, descripcion').order('codigo'),
      supabase.from('vendedor').select('codigo, nombre').order('nombre'),
      supabase.from('ruta').select('codigo, descripcion').order('codigo'),
      supabase.from('provincia').select('codigo, nombre').order('nombre'),
      supabase.from('pais').select('codigo, nombre').order('nombre'),
    ]).then(([z, v, r, p, pa]) => {
      setZonas((z.data ?? []).map((x) => ({ codigo: x.codigo, nombre: x.descripcion })))
      setVendedores(v.data ?? [])
      setRutas((r.data ?? []).map((x) => ({ codigo: x.codigo, nombre: x.descripcion })))
      setProvincias(p.data ?? [])
      setPaises(pa.data ?? [])
    })
  }, [])

  useEffect(() => {
    if (!editing) setDraft(null)
  }, [editing])

  const actual = draft ?? rows.find((r) => r.codigo === selected) ?? null
  const ro = !draft

  function set<K extends keyof Sucursal>(key: K, value: Sucursal[K]) {
    if (draft) setDraft({ ...draft, [key]: value })
  }

  function texto(key: keyof Sucursal, label: string, title?: string, className = '') {
    return (
      <GwField label={label} className={className}>
        <GwInput
          title={title}
          disabled={ro}
          value={(actual?.[key] as string | null) ?? ''}
          onChange={(e) => set(key, (e.target.value === '' ? null : e.target.value) as never)}
        />
      </GwField>
    )
  }

  function select(key: keyof Sucursal, label: string, opciones: Opcion[], title?: string) {
    return (
      <GwField label={label}>
        <GwSelect
          title={title}
          disabled={ro}
          value={(actual?.[key] as string | null) ?? ''}
          onChange={(e) => set(key, (e.target.value === '' ? null : e.target.value) as never)}
        >
          <option value="" />
          {opciones.map((o) => (
            <option key={o.codigo} value={o.codigo}>
              {o.codigo} — {o.nombre}
            </option>
          ))}
        </GwSelect>
      </GwField>
    )
  }

  function nueva() {
    setError(null)
    setEsNueva(true)
    setDraft(vacia(clienteCodigo, siguienteCodigo(rows)))
    setSubtab('generales')
  }

  async function aceptar() {
    if (!draft) return
    setError(null)
    if (!draft.codigo.trim() || !draft.nombre.trim()) {
      setError('La sucursal necesita código y nombre.')
      return
    }
    if (esNueva) {
      if (rows.some((r) => r.codigo === draft.codigo.trim())) {
        setError(`Ya existe la sucursal ${draft.codigo.trim()} para este cliente.`)
        return
      }
      const { error: err } = await supabase.from('cliente_sucursal').insert({ ...draft, codigo: draft.codigo.trim() })
      if (err) return setError(err.message)
    } else {
      const { cliente_codigo: _c, codigo, ...resto } = draft
      const { error: err } = await supabase
        .from('cliente_sucursal')
        .update(resto)
        .eq('cliente_codigo', clienteCodigo)
        .eq('codigo', codigo)
      if (err) return setError(err.message)
    }
    const codigo = draft.codigo.trim()
    setDraft(null)
    await load()
    setSelected(codigo)
  }

  async function borrar() {
    const s = rows.find((r) => r.codigo === selected)
    if (!s || !confirm(`¿Borrar la sucursal ${s.codigo} — ${s.nombre}?`)) return
    const { error: err } = await supabase.from('cliente_sucursal').delete().eq('cliente_codigo', clienteCodigo).eq('codigo', s.codigo)
    if (err) return setError(err.message)
    setSelected(null)
    load()
  }

  return (
    <div className="flex flex-col gap-1.5" title="CLISUCUR">
      <div className="flex items-center gap-1">
        <button type="button" className="gw-btn" onClick={nueva} disabled={!editing || !!draft}>
          <Plus size={14} /> Añadir línea
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!editing || !selected || !!draft}
          onClick={() => {
            const s = rows.find((r) => r.codigo === selected)
            if (s) {
              setError(null)
              setEsNueva(false)
              setDraft({ ...s })
            }
          }}
        >
          <Pencil size={14} /> Modificar línea
        </button>
        <button type="button" className="gw-btn" disabled={!editing || !selected || !!draft} onClick={borrar}>
          <Trash2 size={14} /> Borrar línea
        </button>
        <span className="ml-auto" />
        <GwCheck
          label="Crear sucursales al vender"
          checked={cliente.genera_sucursales_auto}
          disabled={!editing}
          onChange={(v) => onChange({ genera_sucursales_auto: v })}
        />
      </div>
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}

      <div className="max-h-[180px] overflow-y-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 70 }}>Código</th>
              <th>Nombre</th>
              <th style={{ width: 110 }}>NIF</th>
              <th style={{ width: 180 }}>Contacto</th>
              <th style={{ width: 160 }}>Población</th>
              <th style={{ width: 110 }}>Teléfono</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !draft && (
              <tr>
                <td colSpan={6} className="text-center text-[#6d6d6d]">
                  Sin sucursales.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.codigo}
                className={r.codigo === (draft?.codigo ?? selected) && !esNueva ? 'gw-selected' : ''}
                onClick={() => !draft && setSelected(r.codigo)}
              >
                <td>{r.codigo}</td>
                <td>{r.nombre}</td>
                <td>{r.nif ?? ''}</td>
                <td>{r.contacto ?? ''}</td>
                <td>{r.poblacion ?? ''}</td>
                <td>{r.telefono_movil ?? r.telefono_fijo ?? ''}</td>
              </tr>
            ))}
            {draft && esNueva && (
              <tr className="gw-selected">
                <td>{draft.codigo}</td>
                <td colSpan={5}>{draft.nombre || '(nueva sucursal)'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {actual && (
        <GwTabs rows={SUBTABS} active={subtab} onChange={setSubtab}>
          {subtab === 'generales' && (
            <div className="grid grid-cols-[110px_minmax(0,2fr)_130px_minmax(0,1fr)] gap-x-2 gap-y-1">
              <GwField label="Código">
                <GwInput
                  disabled={!draft || !esNueva}
                  value={actual.codigo}
                  onChange={(e) => set('codigo', e.target.value)}
                />
              </GwField>
              {texto('nombre', 'Nombre')}
              {texto('nif', 'NIF')}
              {texto('gerente', 'Gerente')}
              {texto('contacto', 'Contacto', undefined, 'col-span-2')}
              {texto('direccion', 'Dirección', undefined, 'col-span-2')}
              {texto('codigo_postal', 'Cód. Postal')}
              {texto('poblacion', 'Población', undefined, 'col-span-3')}
              {select('provincia_codigo', 'Provincia', provincias)}
              {select('pais_codigo', 'País', paises)}
              {texto('telefono_fijo', 'Teléfono')}
              {texto('telefono_movil', 'Móvil')}
              {texto('fax', 'Fax')}
              {texto('email', 'Email')}
              {texto('web', 'Web', undefined, 'col-span-2')}
            </div>
          )}
          {subtab === 'enlaces' && (
            <div className="flex flex-col gap-1.5">
              <div className="grid grid-cols-4 gap-x-2 gap-y-1">
                {select('zona_territorial_codigo', 'Zona Territorial', zonas)}
                {select('vendedor_codigo', 'Vendedor', vendedores)}
                {select('ruta_codigo', 'Ruta de Reparto', rutas)}
                <GwField label="Orden en Ruta">
                  <GwNumber decimals={0} disabled={ro} value={actual.orden_en_ruta} onChange={(v) => set('orden_en_ruta', v)} />
                </GwField>
              </div>
              <GwGroup title="FacE (Administración)" className="grid grid-cols-[140px_minmax(0,1fr)] gap-x-2 gap-y-1">
                {texto('face_organo_gestor', 'Órgano Gestor')}
                {texto('face_organo_gestor_nombre', ' ')}
                {texto('face_unidad_tramitadora', 'Unidad Tramitadora')}
                {texto('face_unidad_tramitadora_nombre', ' ')}
                {texto('face_oficina_contable', 'Oficina Contable')}
                {texto('face_oficina_contable_nombre', ' ')}
              </GwGroup>
            </div>
          )}
          {draft && (
            <div className="mt-1.5 flex justify-end gap-1">
              <button type="button" className="gw-btn" onClick={aceptar}>
                <Check size={14} className="text-[#127a12]" /> Aceptar
              </button>
              <button type="button" className="gw-btn" onClick={() => setDraft(null)}>
                <X size={14} className="text-[#c42b1c]" /> Cancelar
              </button>
            </div>
          )}
        </GwTabs>
      )}
    </div>
  )
}
