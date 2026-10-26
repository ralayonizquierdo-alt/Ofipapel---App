import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DataTable, type Column } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { FormField, TextInput } from '../components/FormField'

interface Cliente {
  codigo: string
  nombre: string
  nif: string | null
  telefono_movil: string | null
  bloqueado: boolean
  activo: boolean
}

const emptyForm = { codigo: '', nombre: '', nif: '', telefono_movil: '' }

export function ClientesPage() {
  const [rows, setRows] = useState<Cliente[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    let query = supabase
      .from('cliente')
      .select('codigo, nombre, nif, telefono_movil, bloqueado, activo')
      .order('actualizado_en', { ascending: false })
      .limit(100)
    if (search) query = query.ilike('nombre', `%${search}%`)
    const { data } = await query
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('cliente').insert({
      codigo: form.codigo,
      nombre: form.nombre,
      nif: form.nif || null,
      telefono_movil: form.telefono_movil || null,
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

  const columns: Column<Cliente>[] = [
    { header: 'Código', cell: (r) => <span className="font-mono text-xs">{r.codigo}</span> },
    { header: 'Nombre', cell: (r) => r.nombre },
    { header: 'NIF', cell: (r) => r.nif ?? '—' },
    { header: 'Teléfono', cell: (r) => r.telefono_movil ?? '—' },
    {
      header: 'Estado',
      cell: (r) =>
        r.bloqueado ? (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Bloqueado</span>
        ) : (
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
          <h1 className="text-2xl font-bold text-slate-800">Clientes</h1>
          <p className="mt-1 text-sm text-slate-400">Fase 1 — maestro de clientes, conectado a Postgres.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={16} /> Nuevo cliente
        </button>
      </div>

      <div className="relative mt-5 w-72">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nombre…"
          className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <div className="mt-4">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.codigo} loading={loading} />
      </div>

      {open && (
        <Modal title="Nuevo cliente" onClose={() => setOpen(false)}>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <FormField label="Código *">
              <TextInput required value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </FormField>
            <FormField label="Nombre *">
              <TextInput required value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </FormField>
            <FormField label="NIF">
              <TextInput value={form.nif} onChange={(e) => setForm({ ...form, nif: e.target.value })} />
            </FormField>
            <FormField label="Teléfono móvil">
              <TextInput value={form.telefono_movil} onChange={(e) => setForm({ ...form, telefono_movil: e.target.value })} />
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
