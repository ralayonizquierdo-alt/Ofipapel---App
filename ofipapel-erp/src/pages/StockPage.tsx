import { useMemo, useState } from 'react'
import { Warehouse } from 'lucide-react'
import { useDatabase, useCollection } from '../lib/DatabaseContext'
import DataTable, { type Column } from '../components/DataTable'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import FormField, { inputClass } from '../components/FormField'
import type { StockEntry } from '../types'

export default function StockPage() {
  const { db } = useDatabase()
  const { items: stock, update } = useCollection('stock')
  const [locationFiltro, setLocationFiltro] = useState('')
  const [soloAlertas, setSoloAlertas] = useState(false)
  const [selected, setSelected] = useState<StockEntry | null>(null)
  const [form, setForm] = useState({ unidades: '0', minimo: '0' })

  const productById = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products])
  const locationById = useMemo(() => new Map(db.locations.map((l) => [l.id, l])), [db.locations])

  const rows = stock.filter((s) => (locationFiltro ? s.locationId === locationFiltro : true)).filter((s) => (soloAlertas ? s.unidades < s.minimo : true))

  const columns: Column<StockEntry>[] = [
    { key: 'sku', label: 'SKU', render: (s) => productById.get(s.productoId)?.sku ?? '—', sortValue: (s) => productById.get(s.productoId)?.sku ?? '' },
    { key: 'producto', label: 'Producto', render: (s) => productById.get(s.productoId)?.nombre ?? 'Producto eliminado', sortValue: (s) => productById.get(s.productoId)?.nombre ?? '' },
    { key: 'ubicacion', label: 'Ubicación', render: (s) => locationById.get(s.locationId)?.nombre ?? '—', sortValue: (s) => locationById.get(s.locationId)?.nombre ?? '' },
    { key: 'unidades', label: 'Unidades', align: 'right', render: (s) => s.unidades.toLocaleString('es-ES'), sortValue: (s) => s.unidades },
    { key: 'minimo', label: 'Mínimo', align: 'right', render: (s) => s.minimo.toLocaleString('es-ES'), sortValue: (s) => s.minimo },
    { key: 'estado', label: 'Estado', render: (s) => <Badge label={s.unidades < s.minimo ? 'Bajo mínimo' : 'OK'} /> },
  ]

  const totalAlertas = stock.filter((s) => s.unidades < s.minimo).length

  function openEdit(s: StockEntry) {
    setSelected(s)
    setForm({ unidades: String(s.unidades), minimo: String(s.minimo) })
  }

  function save() {
    if (!selected) return
    update(selected.id, { unidades: Number(form.unidades) || 0, minimo: Number(form.minimo) || 0 })
    setSelected(null)
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
            <Warehouse size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Stock y almacenes</h1>
        </div>
        <Badge label="Activo (Fase 1)" />
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">
        {stock.length.toLocaleString('es-ES')} líneas de stock en {db.locations.length} ubicaciones · {totalAlertas} por debajo del mínimo
      </p>

      <div className="grid grid-cols-3 md:grid-cols-7 gap-2 mb-4">
        {db.locations.map((loc) => {
          const count = stock.filter((s) => s.locationId === loc.id).length
          const alertas = stock.filter((s) => s.locationId === loc.id && s.unidades < s.minimo).length
          const active = locationFiltro === loc.id
          return (
            <button
              key={loc.id}
              onClick={() => setLocationFiltro(active ? '' : loc.id)}
              className={`text-left p-2.5 rounded-lg border text-xs ${active ? 'border-slate-900 bg-slate-900 text-white' : 'border-slate-200 bg-white hover:border-slate-300'}`}
            >
              <div className={`font-medium ${active ? 'text-white' : 'text-slate-800'}`}>{loc.nombre}</div>
              <div className={active ? 'text-slate-300' : 'text-slate-400'}>
                {count} ref. {alertas > 0 && `· ${alertas} alerta${alertas !== 1 ? 's' : ''}`}
              </div>
            </button>
          )
        })}
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        searchableText={(s) => `${productById.get(s.productoId)?.sku ?? ''} ${productById.get(s.productoId)?.nombre ?? ''}`}
        onRowClick={openEdit}
        pageSize={14}
        filters={
          <label className="flex items-center gap-2 text-sm text-slate-600 px-1">
            <input type="checkbox" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} />
            Solo bajo mínimo
          </label>
        }
      />

      {selected && (
        <Modal
          title={productById.get(selected.productoId)?.nombre ?? 'Movimiento de stock'}
          subtitle={locationById.get(selected.locationId)?.nombre}
          onClose={() => setSelected(null)}
          footer={
            <>
              <button onClick={() => setSelected(null)} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancelar
              </button>
              <button onClick={save} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
                Guardar ajuste
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-x-4">
            <FormField label="Unidades en stock">
              <input type="number" className={inputClass} value={form.unidades} onChange={(e) => setForm({ ...form, unidades: e.target.value })} />
            </FormField>
            <FormField label="Stock mínimo">
              <input type="number" className={inputClass} value={form.minimo} onChange={(e) => setForm({ ...form, minimo: e.target.value })} />
            </FormField>
          </div>
        </Modal>
      )}
    </div>
  )
}
