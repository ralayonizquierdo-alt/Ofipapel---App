import { useEffect, useState } from 'react'
import { Check, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwField, GwInput, GwSelect } from '../../../components/gw'
import { FilasVacias, GridMiniBar } from '../../../components/gw/GwGridParts'
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

  const celda = (key: keyof Contacto) => (
    <GwInput
      className="!h-[20px]"
      value={(draft?.[key] as string | null) ?? ''}
      onChange={(e) => set(key, (e.target.value === '' ? null : e.target.value) as never)}
    />
  )

  const marca = (v: boolean) => <span className="block text-center">{v ? '✔' : ''}</span>

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

  const filaEdicion = draft && (
    <tr key="__edicion" className="bg-[#fffbe6]">
      <td>{celda('nombre')}</td>
      <td>
        <GwSelect className="!h-[20px]" value={draft.tipo_contacto_codigo ?? ''} onChange={(e) => cambiarTipo(e.target.value)} title="Tipo de contacto">
          <option value="" />
          {tipos.map((t) => (
            <option key={t.codigo} value={t.codigo}>
              {t.codigo} — {t.descripcion}
            </option>
          ))}
        </GwSelect>
      </td>
      <td>{celda('descripcion')}</td>
      <td className="text-center">
        <input type="checkbox" title="¿Recibe factura en PDF?" checked={draft.recibe_factura_pdf} onChange={(e) => set('recibe_factura_pdf', e.target.checked)} />
      </td>
      <td className="text-center">
        <input
          type="checkbox"
          title="¿Factura electrónica?"
          checked={draft.recibe_factura_electronica}
          onChange={(e) => set('recibe_factura_electronica', e.target.checked)}
        />
      </td>
      <td>{celda('telefono_movil')}</td>
      <td>{celda('telefono_fijo')}</td>
      <td>{celda('fax')}</td>
    </tr>
  )

  const seleccionado = rows.find((r) => r.id === selected)

  return (
    <div className="flex flex-col gap-1" title="CLIAGEND">
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
      <div className="max-h-[250px] overflow-y-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th>Nombre</th>
              <th style={{ width: 50 }}>Tipo</th>
              <th style={{ width: 170 }}>Descrip</th>
              <th style={{ width: 46 }}>Pdf</th>
              <th style={{ width: 56 }}>FactE</th>
              <th style={{ width: 120 }}>Tlf_movil</th>
              <th style={{ width: 120 }}>Tlf_fijo</th>
              <th style={{ width: 120 }}>Tlf_fax</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) =>
              draft?.id != null && draft.id === r.id ? (
                filaEdicion
              ) : (
                <tr
                  key={r.id}
                  className={r.id === selected ? 'gw-selected' : r.fecha_baja ? 'text-[#8a8a8a]' : ''}
                  onClick={() => !draft && setSelected(r.id ?? null)}
                  title={tipoNombre(r.tipo_contacto_codigo)}
                >
                  <td>{r.nombre}</td>
                  <td>{r.tipo_contacto_codigo ?? ''}</td>
                  <td>{r.descripcion ?? ''}</td>
                  <td>{marca(r.recibe_factura_pdf)}</td>
                  <td>{marca(r.recibe_factura_electronica)}</td>
                  <td>{r.telefono_movil ?? ''}</td>
                  <td>{r.telefono_fijo ?? ''}</td>
                  <td>{r.fax ?? ''}</td>
                </tr>
              ),
            )}
            {draft && draft.id == null && filaEdicion}
            <FilasVacias cols={8} ocupadas={rows.length + (draft && draft.id == null ? 1 : 0)} total={11} />
          </tbody>
        </table>
      </div>

      <div className="grid grid-cols-[90px_90px_minmax(0,1fr)_minmax(0,1fr)] gap-x-2">
        <GwField label="Fecha Alta">
          {ro ? (
            <GwInput readOnly value={fecha(actual?.fecha_alta ?? null)} />
          ) : (
            <GwInput type="date" value={actual?.fecha_alta ?? ''} onChange={(e) => set('fecha_alta', e.target.value || null)} />
          )}
        </GwField>
        <GwField label="Fecha Baja">
          {ro ? (
            <GwInput readOnly value={fecha(actual?.fecha_baja ?? null)} />
          ) : (
            <GwInput type="date" value={actual?.fecha_baja ?? ''} onChange={(e) => set('fecha_baja', e.target.value || null)} />
          )}
        </GwField>
        {texto('email', 'Dirección Email')}
        {texto('web', 'Dirección Web o URL')}
      </div>

      <GridMiniBar
        nuevo={editing && !draft}
        modificar={editing && !draft && seleccionado != null}
        borrar={editing && !draft && seleccionado != null}
        buscar={false}
        onNuevo={nuevo}
        onModificar={() => {
          if (seleccionado) {
            setError(null)
            setDraft({ ...seleccionado })
          }
        }}
        onBorrar={borrar}
      >
        {draft && (
          <span className="flex gap-1">
            <button type="button" className="gw-btn" onClick={aceptar}>
              <Check size={14} className="text-[#127a12]" /> Aceptar
            </button>
            <button type="button" className="gw-btn" onClick={() => setDraft(null)}>
              <X size={14} className="text-[#c42b1c]" /> Cancelar
            </button>
          </span>
        )}
      </GridMiniBar>
    </div>
  )
}
