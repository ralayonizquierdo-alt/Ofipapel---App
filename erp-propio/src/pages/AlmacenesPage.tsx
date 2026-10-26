import { useEffect, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DataTable, type Column } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { FormField, TextInput } from '../components/FormField'

interface Almacen {
  codigo: string
  nombre: string
  poblacion: string | null
  activo: boolean
}

const emptyForm = { codigo: '', nombre: '', poblacion: '' }

export function AlmacenesPage() {
  const [rows, setRows] = useState<Almacen[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const { data } = await supabase
      .from('almacen')
      .select('codigo, nombre, poblacion, activo')
      .order('codigo')
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('almacen').insert({
      codigo: form.codigo,
      nombre: form.nombre,
      poblacion: form.poblacion || null,
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

  const columns: Column<Almacen>[] = [
    { header: 'Código', cell: (r) => <span className="font-mono text-xs">{r.codigo}</span> },
    { header: 'Nombre', cell: (r) => r.nombre },
    { header: 'Población', cell: (r) => r.poblacion ?? '—' },
    {
      header: 'Estado',
      cell: (r) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {r.activo ? 'Activo' : 'Inactivo'}
        </span>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Almacenes</h1>
          <p className="mt-1 text-sm text-slate-400">Fase 1 — maestro de almacenes, conectado a Postgres.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={16} /> Nuevo almacén
        </button>
      </div>

      <div className="mt-4">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.codigo} loading={loading} />
      </div>

      {open && (
        <Modal title="Nuevo almacén" onClose={() => setOpen(false)}>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <FormField label="Código *">
              <TextInput required value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </FormField>
            <FormField label="Nombre *">
              <TextInput required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </FormField>
            <FormField label="Población">
              <TextInput value={form.poblacion} onChange={(e) => setForm({ ...form, poblacion: e.target.value })} />
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
