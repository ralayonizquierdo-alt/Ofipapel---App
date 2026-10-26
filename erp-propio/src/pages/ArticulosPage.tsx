import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DataTable, type Column } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { FormField, TextInput } from '../components/FormField'

interface Articulo {
  codigo_interno: string
  descripcion: string
  codigo_barras_principal: string | null
  pvp: number | null
  stock_minimo: number | null
  activo: boolean
}

const emptyForm = {
  codigo_interno: '',
  descripcion: '',
  codigo_barras_principal: '',
  pvp: '',
}

export function ArticulosPage() {
  const [rows, setRows] = useState<Articulo[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    let query = supabase
      .from('articulo')
      .select('codigo_interno, descripcion, codigo_barras_principal, pvp, stock_minimo, activo')
      .order('actualizado_en', { ascending: false })
      .limit(100)
    if (search) query = query.ilike('descripcion', `%${search}%`)
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
    const { error } = await supabase.from('articulo').insert({
      codigo_interno: form.codigo_interno,
      descripcion: form.descripcion,
      codigo_barras_principal: form.codigo_barras_principal || null,
      pvp: form.pvp ? Number(form.pvp) : null,
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

  const columns: Column<Articulo>[] = [
    { header: 'Código', cell: (r) => <span className="font-mono text-xs">{r.codigo_interno}</span> },
    { header: 'Descripción', cell: (r) => r.descripcion },
    { header: 'Cód. barras', cell: (r) => r.codigo_barras_principal ?? '—' },
    { header: 'PVP', cell: (r) => (r.pvp != null ? `${r.pvp.toFixed(2)} €` : '—') },
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
          <h1 className="text-2xl font-bold text-slate-800">Artículos</h1>
          <p className="mt-1 text-sm text-slate-400">Fase 1 — catálogo real, conectado a Postgres.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={16} /> Nuevo artículo
        </button>
      </div>

      <div className="relative mt-5 w-72">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por descripción…"
          className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <div className="mt-4">
        <DataTable columns={columns} rows={rows} rowKey={(r) => r.codigo_interno} loading={loading} />
      </div>

      {open && (
        <Modal title="Nuevo artículo" onClose={() => setOpen(false)}>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <FormField label="Código interno *">
              <TextInput required value={form.codigo_interno} onChange={(e) => setForm({ ...form, codigo_interno: e.target.value })} />
            </FormField>
            <FormField label="Descripción *">
              <TextInput required value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </FormField>
            <FormField label="Código de barras">
              <TextInput value={form.codigo_barras_principal} onChange={(e) => setForm({ ...form, codigo_barras_principal: e.target.value })} />
            </FormField>
            <FormField label="PVP (General)">
              <TextInput type="number" step="0.01" value={form.pvp} onChange={(e) => setForm({ ...form, pvp: e.target.value })} />
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
