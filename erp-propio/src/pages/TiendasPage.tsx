import { useEffect, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DataTable, type Column } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { FormField, TextInput, SelectInput } from '../components/FormField'

interface Almacen {
  codigo: string
  nombre: string
}

interface Tienda {
  codigo: string
  descripcion: string
  tipo: string
  almacen_codigo: string | null
  activa: boolean
}

const emptyForm = { codigo: '', descripcion: '', tipo: 'tienda', almacen_codigo: '' }

export function TiendasPage() {
  const [rows, setRows] = useState<Tienda[]>([])
  const [almacenes, setAlmacenes] = useState<Almacen[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [{ data }, { data: alm }] = await Promise.all([
      supabase.from('tienda_terminal').select('codigo, descripcion, tipo, almacen_codigo, activa').order('codigo'),
      supabase.from('almacen').select('codigo, nombre').order('codigo'),
    ])
    setRows(data ?? [])
    setAlmacenes(alm ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('tienda_terminal').insert({
      codigo: form.codigo,
      descripcion: form.descripcion,
      tipo: form.tipo,
      almacen_codigo: form.almacen_codigo || null,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setOpen(false)
    setForm(emptyForm)
    load()
  }

  const columns: Column<Tienda>[] = [
    { header: 'Código', cell: (r) => <span className="font-mono text-xs">{r.codigo}</span> },
    { header: 'Descripción', cell: (r) => r.descripcion },
    { header: 'Tipo', cell: (r) => r.tipo },
    { header: 'Almacén', cell: (r) => r.almacen_codigo ?? '—' },
    {
      header: 'Estado',
      cell: (r) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.activa ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {r.activa ? 'Activa' : 'Inactiva'}
        </span>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Tiendas / Terminales</h1>
          <p className="mt-1 text-sm text-slate-400">Fase 1 — tiendas físicas, oficinas internas, web y tabletas.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={16} /> Nueva tienda
        </button>
      </div>

      <div className="mt-4">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.codigo} loading={loading} />
      </div>

      {open && (
        <Modal title="Nueva tienda / terminal" onClose={() => setOpen(false)}>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <FormField label="Código *">
              <TextInput required value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </FormField>
            <FormField label="Descripción *">
              <TextInput required value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </FormField>
            <FormField label="Tipo">
              <SelectInput value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                <option value="tienda">Tienda</option>
                <option value="oficina_interna">Oficina interna</option>
                <option value="tienda_web">Tienda web</option>
                <option value="tableta">Tableta</option>
                <option value="caja_central">Caja central</option>
              </SelectInput>
            </FormField>
            <FormField label="Almacén de referencia">
              <SelectInput value={form.almacen_codigo} onChange={(e) => setForm({ ...form, almacen_codigo: e.target.value })}>
                <option value="">— Sin asignar —</option>
                {almacenes.map((a) => (
                  <option key={a.codigo} value={a.codigo}>
                    {a.codigo} — {a.nombre}
                  </option>
                ))}
              </SelectInput>
            </FormField>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={saving} className="mt-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
