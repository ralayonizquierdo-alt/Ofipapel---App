import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Search } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { DataTable, type Column } from '../../components/DataTable'

interface ArticuloRow {
  codigo_interno: string
  descripcion: string
  codigo_barras_principal: string | null
  pvp: number | null
  familia_codigo: string | null
  activo: boolean
}

export function ArticulosListPage() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<ArticuloRow[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  async function load() {
    setLoading(true)
    let query = supabase
      .from('articulo')
      .select('codigo_interno, descripcion, codigo_barras_principal, pvp, familia_codigo, activo')
      .order('actualizado_en', { ascending: false })
      .limit(200)
    if (search) query = query.or(`descripcion.ilike.%${search}%,codigo_interno.ilike.%${search}%,codigo_barras_principal.ilike.%${search}%`)
    const { data } = await query
    setRows(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    const t = setTimeout(load, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const columns: Column<ArticuloRow>[] = [
    { header: 'Código', cell: (r) => <span className="font-mono text-xs">{r.codigo_interno}</span> },
    { header: 'Descripción', cell: (r) => r.descripcion },
    { header: 'Familia', cell: (r) => r.familia_codigo ?? '—' },
    { header: 'Cód. barras', cell: (r) => r.codigo_barras_principal ?? '—' },
    { header: 'PVP', cell: (r) => (r.pvp != null ? `${r.pvp.toFixed(2)} €` : '—') },
    {
      header: 'Estado',
      cell: (r) => (
        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${r.activo ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
          {r.activo ? 'Activo' : 'Baja'}
        </span>
      ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Artículos</h1>
          <p className="mt-1 text-sm text-slate-400">Almacén → Artículos. Ficha completa, igual que en GeminisWin.</p>
        </div>
        <button
          type="button"
          onClick={() => navigate('/articulos/nuevo')}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={16} /> Nuevo artículo
        </button>
      </div>

      <div className="relative mt-5 w-80">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por descripción, código interno o código de barras…"
          className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100"
        />
      </div>

      <div className="mt-4">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.codigo_interno}
          loading={loading}
          onRowClick={(r) => navigate(`/articulos/${encodeURIComponent(r.codigo_interno)}`)}
        />
      </div>
    </div>
  )
}
