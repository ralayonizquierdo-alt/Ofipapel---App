import { useEffect, useState } from 'react'
import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwInput, GwSelect } from '../../../components/gw'
import type { ClienteTabProps } from '../types'

interface Contacto {
  id?: number
  cliente_codigo: string
  tipo_contacto_codigo: string | null
  nombre: string
  descripcion: string | null
  recibe_factura_pdf: boolean
  recibe_factura_electronica: boolean
  telefono_movil: string | null
  telefono_fijo: string | null
  fax: string | null
  email: string | null
  web: string | null
  fecha_alta: string | null
  fecha_baja: string | null
}

interface TipoContacto {
  codigo: string
  descripcion: string
  recibe_factura_pdf_defecto: boolean
  recibe_factura_electronica_defecto: boolean
}

const COLUMNAS =
  'id, cliente_codigo, tipo_contacto_codigo, nombre, descripcion, recibe_factura_pdf, recibe_factura_electronica, telefono_movil, telefono_fijo, fax, email, web, fecha_alta, fecha_baja'

function fecha(v: string | null) {
  if (!v) return '  /  /'
  const [a, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

export function TabAgenda({ cliente, editing }: ClienteTabProps) {
  const clienteCodigo = cliente.codigo
  const [rows, setRows] = useState<Contacto[]>([])
  const [tipos, setTipos] = useState<TipoContacto[]>([])
  const [selected, setSelected] = useState<number | null>(null)
  const [draft, setDraft] = useState<Contacto | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data, error: err } = await supabase.from('cliente_contacto').select(COLUMNAS).eq('cliente_codigo', clienteCodigo).order('id')
    if (err) setError(err.message)
    setRows((data ?? []) as Contacto[])
  }

  useEffect(() => {
    if (!clienteCodigo) return
    load()
    setSelected(null)
    setDraft(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteCodigo])

  useEffect(() => {
    supabase
      .from('tipo_contacto')
      .select('codigo, descripcion, recibe_factura_pdf_defecto, recibe_factura_electronica_defecto')
      .order('codigo')
      .then(({ data }) => setTipos((data ?? []) as TipoContacto[]))
  }, [])

  useEffect(() => {
    if (!editing) setDraft(null)
  }, [editing])

  const actual = draft ?? rows.find((r) => r.id === selected) ?? null
  const ro = !draft

  function set<K extends keyof Contacto>(key: K, value: Contacto[K]) {
    if (draft) setDraft({ ...draft, [key]: value })
  }

  function texto(key: keyof Contacto, label: string, className = '') {
    return (
      <GwField label={label} className={className}>
        <GwInput
          disabled={ro}
          value={(actual?.[key] as string | null) ?? ''}
          onChange={(e) => set(key, (e.target.value === '' ? null : e.target.value) as never)}
        />
      </GwField>
    )
  }

  function cambiarTipo(codigo: string) {
    if (!draft) return
    const t = tipos.find((x) => x.codigo === codigo)
    setDraft({
      ...draft,
      tipo_contacto_codigo: codigo || null,
      ...(t ? { recibe_factura_pdf: t.recibe_factura_pdf_defecto, recibe_factura_electronica: t.recibe_factura_electronica_defecto } : {}),
    })
  }

  function nuevo() {
    setError(null)
    setSelected(null)
    setDraft({
      cliente_codigo: clienteCodigo,
      tipo_contacto_codigo: null,
      nombre: '',
      descripcion: null,
      recibe_factura_pdf: false,
      recibe_factura_electronica: false,
      telefono_movil: null,
      telefono_fijo: null,
      fax: null,
      email: null,
      web: null,
      fecha_alta: new Date().toISOString().slice(0, 10),
      fecha_baja: null,
    })
  }

  async function aceptar() {
    if (!draft) return
    setError(null)
    if (!draft.nombre.trim()) return setError('El contacto necesita un nombre.')
    const { id, ...payload } = draft
    const res = id == null
      ? await supabase.from('cliente_contacto').insert(payload).select('id').single()
      : await supabase.from('cliente_contacto').update(payload).eq('id', id).select('id').single()
    if (res.error) return setError(res.error.message)
    setDraft(null)
    await load()
    setSelected(res.data.id)
  }

  async function borrar() {
    const c = rows.find((r) => r.id === selected)
    if (!c || !confirm(`¿Borrar el contacto ${c.nombre}?`)) return
    const { error: err } = await supabase.from('cliente_contacto').delete().eq('id', c.id!)
    if (err) return setError(err.message)
    setSelected(null)
    load()
  }

  const tipoNombre = (codigo: string | null) => tipos.find((t) => t.codigo === codigo)?.descripcion ?? codigo ?? ''

  return (
    <div className="flex flex-col gap-1.5" title="CLIAGEND">
      <div className="flex gap-1">
        <button type="button" className="gw-btn" onClick={nuevo} disabled={!editing || !!draft}>
          <Plus size={14} /> Añadir línea
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!editing || selected == null || !!draft}
          onClick={() => {
            const c = rows.find((r) => r.id === selected)
            if (c) {
              setError(null)
              setDraft({ ...c })
            }
          }}
        >
          <Pencil size={14} /> Modificar línea
        </button>
        <button type="button" className="gw-btn" disabled={!editing || selected == null || !!draft} onClick={borrar}>
          <Trash2 size={14} /> Borrar línea
        </button>
      </div>
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}

      <div className="max-h-[200px] overflow-y-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 130 }}>Tipo</th>
              <th>Nombre</th>
              <th style={{ width: 50 }}>PDF</th>
              <th style={{ width: 70 }}>F. Elect.</th>
              <th style={{ width: 110 }}>Móvil</th>
              <th style={{ width: 110 }}>Teléfono</th>
              <th style={{ width: 200 }}>Email</th>
              <th style={{ width: 85 }}>Alta</th>
              <th style={{ width: 85 }}>Baja</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && !draft && (
              <tr>
                <td colSpan={9} className="text-center text-[#6d6d6d]">
                  Sin contactos en la agenda.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <tr
                key={r.id}
                className={r.id === (draft?.id ?? selected) ? 'gw-selected' : r.fecha_baja ? 'text-[#8a8a8a]' : ''}
                onClick={() => !draft && setSelected(r.id ?? null)}
              >
                <td>{tipoNombre(r.tipo_contacto_codigo)}</td>
                <td>{r.nombre}</td>
                <td className="text-center">{r.recibe_factura_pdf ? 'Sí' : 'No'}</td>
                <td className="text-center">{r.recibe_factura_electronica ? 'Sí' : 'No'}</td>
                <td>{r.telefono_movil ?? ''}</td>
                <td>{r.telefono_fijo ?? ''}</td>
                <td>{r.email ?? ''}</td>
                <td>{r.fecha_alta ? fecha(r.fecha_alta) : ''}</td>
                <td>{r.fecha_baja ? fecha(r.fecha_baja) : ''}</td>
              </tr>
            ))}
            {draft && draft.id == null && (
              <tr className="gw-selected">
                <td colSpan={9}>{draft.nombre || '(nuevo contacto)'}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {actual && (
        <GwGroup title="Contacto" className="grid grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)_140px_140px] gap-x-2 gap-y-1">
          <GwField label="Tipo">
            <GwSelect disabled={ro} value={actual.tipo_contacto_codigo ?? ''} onChange={(e) => cambiarTipo(e.target.value)}>
              <option value="" />
              {tipos.map((t) => (
                <option key={t.codigo} value={t.codigo}>
                  {t.descripcion}
                </option>
              ))}
            </GwSelect>
          </GwField>
          {texto('nombre', 'Nombre')}
          {texto('descripcion', 'Descripción')}
          <GwField label="Alta">
            <GwInput type="date" disabled={ro} value={actual.fecha_alta ?? ''} onChange={(e) => set('fecha_alta', e.target.value || null)} />
          </GwField>
          <GwField label="Baja">
            <GwInput type="date" disabled={ro} value={actual.fecha_baja ?? ''} onChange={(e) => set('fecha_baja', e.target.value || null)} />
          </GwField>
          {texto('telefono_movil', 'Móvil')}
          {texto('telefono_fijo', 'Teléfono')}
          {texto('fax', 'Fax')}
          {texto('email', 'Email', 'col-span-2')}
          {texto('web', 'Web', 'col-span-2')}
          <div className="col-span-3 flex items-end gap-4 pb-1">
            <GwCheck label="¿Recibe factura en PDF?" disabled={ro} checked={actual.recibe_factura_pdf} onChange={(v) => set('recibe_factura_pdf', v)} />
            <GwCheck
              label="¿Factura electrónica?"
              disabled={ro}
              checked={actual.recibe_factura_electronica}
              onChange={(v) => set('recibe_factura_electronica', v)}
            />
            {draft && (
              <span className="ml-auto flex gap-1">
                <button type="button" className="gw-btn" onClick={aceptar}>
                  <Check size={14} className="text-[#127a12]" /> Aceptar
                </button>
                <button type="button" className="gw-btn" onClick={() => setDraft(null)}>
                  <X size={14} className="text-[#c42b1c]" /> Cancelar
                </button>
              </span>
            )}
          </div>
        </GwGroup>
      )}
    </div>
  )
}
