import { useMemo, useState } from 'react'
import { Package, Plus, Trash2 } from 'lucide-react'
import { useDatabase, useCollection } from '../lib/DatabaseContext'
import DataTable, { type Column } from '../components/DataTable'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import FormField, { inputClass } from '../components/FormField'
import { formatEUR } from '../lib/format'
import type { Product, IvaRate } from '../types'

const emptyForm = {
  sku: '',
  nombre: '',
  categoriaId: '',
  proveedorId: '',
  coste: '0',
  pvp: '0',
  tarifaMayorista: '0',
  iva: '21',
  unidadVenta: 'unidad',
  ubicacion: '',
  activo: true,
}

export default function CatalogoPage() {
  const { db } = useDatabase()
  const { items: products, add, update, remove } = useCollection('products')
  const [selected, setSelected] = useState<Product | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [categoriaFiltro, setCategoriaFiltro] = useState('')

  const categoriaById = useMemo(() => new Map(db.categories.map((c) => [c.id, c.nombre])), [db.categories])
  const proveedorById = useMemo(() => new Map(db.suppliers.map((s) => [s.id, s.nombre])), [db.suppliers])
  const stockByProduct = useMemo(() => {
    const map = new Map<string, number>()
    db.stock.forEach((s) => map.set(s.productoId, (map.get(s.productoId) ?? 0) + s.unidades))
    return map
  }, [db.stock])

  const filteredByCategoria = categoriaFiltro ? products.filter((p) => p.categoriaId === categoriaFiltro) : products

  const columns: Column<Product>[] = [
    { key: 'sku', label: 'SKU', sortValue: (p) => p.sku },
    { key: 'nombre', label: 'Producto', sortValue: (p) => p.nombre },
    { key: 'categoria', label: 'Categoría', render: (p) => categoriaById.get(p.categoriaId) ?? '—', sortValue: (p) => categoriaById.get(p.categoriaId) ?? '' },
    { key: 'coste', label: 'Coste', align: 'right', render: (p) => formatEUR(p.coste), sortValue: (p) => p.coste },
    { key: 'pvp', label: 'PVP', align: 'right', render: (p) => formatEUR(p.pvp), sortValue: (p) => p.pvp },
    { key: 'tarifa', label: 'Tarifa mayorista', align: 'right', render: (p) => formatEUR(p.tarifaMayorista), sortValue: (p) => p.tarifaMayorista },
    { key: 'stock', label: 'Stock total', align: 'right', render: (p) => (stockByProduct.get(p.id) ?? 0).toLocaleString('es-ES'), sortValue: (p) => stockByProduct.get(p.id) ?? 0 },
    { key: 'estado', label: 'Estado', render: (p) => <Badge label={p.activo ? 'Activo' : 'Inactivo'} /> },
  ]

  function openEdit(p: Product) {
    setSelected(p)
    setForm({
      sku: p.sku,
      nombre: p.nombre,
      categoriaId: p.categoriaId,
      proveedorId: p.proveedorId,
      coste: String(p.coste),
      pvp: String(p.pvp),
      tarifaMayorista: String(p.tarifaMayorista),
      iva: String(p.iva),
      unidadVenta: p.unidadVenta,
      ubicacion: p.ubicacion,
      activo: p.activo,
    })
  }

  function openCreate() {
    const nextSku = `OF-${10000 + products.length + Math.floor(Math.random() * 900)}`
    setForm({ ...emptyForm, sku: nextSku, categoriaId: db.categories[0]?.id ?? '', proveedorId: db.suppliers[0]?.id ?? '' })
    setCreating(true)
  }

  function closeModal() {
    setSelected(null)
    setCreating(false)
  }

  function save() {
    const payload = {
      sku: form.sku,
      nombre: form.nombre,
      categoriaId: form.categoriaId,
      proveedorId: form.proveedorId,
      coste: Number(form.coste) || 0,
      pvp: Number(form.pvp) || 0,
      tarifaMayorista: Number(form.tarifaMayorista) || 0,
      iva: Number(form.iva) as IvaRate,
      unidadVenta: form.unidadVenta,
      ubicacion: form.ubicacion,
      activo: form.activo,
    }
    if (selected) {
      update(selected.id, payload)
    } else {
      add({ id: `prod-${Date.now()}`, ...payload })
    }
    closeModal()
  }

  function handleDelete() {
    if (!selected) return
    remove(selected.id)
    closeModal()
  }

  const modalOpen = selected !== null || creating

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
            <Package size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Catálogo</h1>
        </div>
        <Badge label="Activo (Fase 1)" />
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">
        {products.length.toLocaleString('es-ES')} referencias · Alta, baja y edición de productos
      </p>

      <DataTable
        columns={columns}
        rows={filteredByCategoria}
        rowKey={(p) => p.id}
        searchableText={(p) => `${p.sku} ${p.nombre} ${categoriaById.get(p.categoriaId)} ${proveedorById.get(p.proveedorId)}`}
        onRowClick={openEdit}
        pageSize={14}
        filters={
          <select value={categoriaFiltro} onChange={(e) => setCategoriaFiltro(e.target.value)} className={`${inputClass} max-w-[220px]`}>
            <option value="">Todas las categorías</option>
            {db.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        }
        actions={
          <button
            onClick={openCreate}
            className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800"
          >
            <Plus size={15} /> Nuevo producto
          </button>
        }
      />

      {modalOpen && (
        <Modal
          title={selected ? `Editar ${selected.sku}` : 'Nuevo producto'}
          subtitle={selected ? `${stockByProduct.get(selected.id) ?? 0} unidades en stock total` : undefined}
          onClose={closeModal}
          footer={
            <>
              {selected && (
                <button onClick={handleDelete} className="mr-auto flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                  <Trash2 size={14} /> Eliminar
                </button>
              )}
              <button onClick={closeModal} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancelar
              </button>
              <button onClick={save} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
                Guardar
              </button>
            </>
          }
        >
          <div className="grid grid-cols-2 gap-x-4">
            <FormField label="SKU">
              <input className={inputClass} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} />
            </FormField>
            <FormField label="Unidad de venta">
              <input className={inputClass} value={form.unidadVenta} onChange={(e) => setForm({ ...form, unidadVenta: e.target.value })} />
            </FormField>
          </div>
          <FormField label="Nombre">
            <input className={inputClass} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-x-4">
            <FormField label="Categoría">
              <select className={inputClass} value={form.categoriaId} onChange={(e) => setForm({ ...form, categoriaId: e.target.value })}>
                {db.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="Proveedor">
              <select className={inputClass} value={form.proveedorId} onChange={(e) => setForm({ ...form, proveedorId: e.target.value })}>
                {db.suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.nombre}
                  </option>
                ))}
              </select>
            </FormField>
          </div>
          <div className="grid grid-cols-3 gap-x-4">
            <FormField label="Coste (€)">
              <input type="number" step="0.01" className={inputClass} value={form.coste} onChange={(e) => setForm({ ...form, coste: e.target.value })} />
            </FormField>
            <FormField label="PVP (€)">
              <input type="number" step="0.01" className={inputClass} value={form.pvp} onChange={(e) => setForm({ ...form, pvp: e.target.value })} />
            </FormField>
            <FormField label="Tarifa mayorista (€)">
              <input
                type="number"
                step="0.01"
                className={inputClass}
                value={form.tarifaMayorista}
                onChange={(e) => setForm({ ...form, tarifaMayorista: e.target.value })}
              />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            <FormField label="IVA">
              <select className={inputClass} value={form.iva} onChange={(e) => setForm({ ...form, iva: e.target.value })}>
                <option value="21">21%</option>
                <option value="10">10%</option>
                <option value="4">4%</option>
              </select>
            </FormField>
            <FormField label="Ubicación en almacén">
              <input className={inputClass} value={form.ubicacion} onChange={(e) => setForm({ ...form, ubicacion: e.target.value })} />
            </FormField>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 mt-1">
            <input type="checkbox" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
            Producto activo
          </label>
        </Modal>
      )}
    </div>
  )
}
