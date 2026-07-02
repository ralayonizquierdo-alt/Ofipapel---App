import { useMemo, useState } from 'react'
import { Truck, Plus, Trash2 } from 'lucide-react'
import { useDatabase, useCollection } from '../lib/DatabaseContext'
import DataTable, { type Column } from '../components/DataTable'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import FormField, { inputClass } from '../components/FormField'
import { formatDate } from '../lib/format'
import type { Supplier } from '../types'

const emptyForm = { nombre: '', contacto: '', telefono: '', email: '', plazoEntregaDias: '3' }

export default function ProveedoresPage() {
  const { db } = useDatabase()
  const { items: suppliers, add, update, remove } = useCollection('suppliers')
  const [selected, setSelected] = useState<Supplier | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const productCountBySupplier = useMemo(() => {
    const map = new Map<string, number>()
    db.products.forEach((p) => map.set(p.proveedorId, (map.get(p.proveedorId) ?? 0) + 1))
    return map
  }, [db.products])

  const columns: Column<Supplier>[] = [
    { key: 'nombre', label: 'Proveedor', sortValue: (s) => s.nombre },
    { key: 'contacto', label: 'Contacto', sortValue: (s) => s.contacto },
    { key: 'telefono', label: 'Teléfono', render: (s) => s.telefono },
    { key: 'plazo', label: 'Plazo entrega', align: 'right', render: (s) => `${s.plazoEntregaDias} días`, sortValue: (s) => s.plazoEntregaDias },
    { key: 'productos', label: 'Referencias', align: 'right', render: (s) => productCountBySupplier.get(s.id) ?? 0, sortValue: (s) => productCountBySupplier.get(s.id) ?? 0 },
    { key: 'ultima', label: 'Últ. compra', render: (s) => formatDate(s.ultimaCompra), sortValue: (s) => s.ultimaCompra },
  ]

  function openEdit(s: Supplier) {
    setSelected(s)
    setForm({ nombre: s.nombre, contacto: s.contacto, telefono: s.telefono, email: s.email, plazoEntregaDias: String(s.plazoEntregaDias) })
  }
  function openCreate() {
    setForm(emptyForm)
    setCreating(true)
  }
  function closeModal() {
    setSelected(null)
    setCreating(false)
  }
  function save() {
    const payload = { nombre: form.nombre, contacto: form.contacto, telefono: form.telefono, email: form.email, plazoEntregaDias: Number(form.plazoEntregaDias) || 1 }
    if (selected) update(selected.id, payload)
    else add({ id: `prov-${Date.now()}`, ...payload, ultimaCompra: new Date().toISOString().slice(0, 10) })
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
            <Truck size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Proveedores</h1>
        </div>
        <Badge label="Activo (Fase 1)" />
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">{suppliers.length} proveedores · Condiciones de compra e histórico</p>

      <DataTable
        columns={columns}
        rows={suppliers}
        rowKey={(s) => s.id}
        searchableText={(s) => `${s.nombre} ${s.contacto}`}
        onRowClick={openEdit}
        pageSize={14}
        actions={
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
            <Plus size={15} /> Nuevo proveedor
          </button>
        }
      />

      {modalOpen && (
        <Modal
          title={selected ? selected.nombre : 'Nuevo proveedor'}
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
          <FormField label="Nombre">
            <input className={inputClass} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-x-4">
            <FormField label="Contacto">
              <input className={inputClass} value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
            </FormField>
            <FormField label="Teléfono">
              <input className={inputClass} value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </FormField>
          </div>
          <div className="grid grid-cols-2 gap-x-4">
            <FormField label="Email">
              <input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </FormField>
            <FormField label="Plazo de entrega (días)">
              <input type="number" className={inputClass} value={form.plazoEntregaDias} onChange={(e) => setForm({ ...form, plazoEntregaDias: e.target.value })} />
            </FormField>
          </div>
        </Modal>
      )}
    </div>
  )
}
