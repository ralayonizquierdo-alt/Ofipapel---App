import { useMemo, useState } from 'react'
import { ShoppingBag, Plus, Check, Trash2 } from 'lucide-react'
import { useDatabase, useCollection } from '../lib/DatabaseContext'
import DataTable, { type Column } from '../components/DataTable'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import { inputClass } from '../components/FormField'
import { formatEUR, formatDate } from '../lib/format'
import type { PurchaseOrder } from '../types'

export default function ComprasPage() {
  const { db } = useDatabase()
  const { items: purchases, add, update, remove } = useCollection('purchases')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [selected, setSelected] = useState<PurchaseOrder | null>(null)
  const [creating, setCreating] = useState(false)
  const [draftProveedorId, setDraftProveedorId] = useState('')
  const [draftLocationId, setDraftLocationId] = useState('')

  const proveedorById = useMemo(() => new Map(db.suppliers.map((s) => [s.id, s])), [db.suppliers])
  const locationById = useMemo(() => new Map(db.locations.map((l) => [l.id, l])), [db.locations])
  const productById = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products])
  const almacenes = db.locations.filter((l) => l.tipo === 'Almacén')

  const rows = purchases.filter((p) => (estadoFiltro ? p.estado === estadoFiltro : true))

  const columns: Column<PurchaseOrder>[] = [
    { key: 'id', label: 'Nº pedido', sortValue: (p) => p.id },
    { key: 'proveedor', label: 'Proveedor', render: (p) => proveedorById.get(p.proveedorId)?.nombre ?? '—', sortValue: (p) => proveedorById.get(p.proveedorId)?.nombre ?? '' },
    { key: 'destino', label: 'Almacén destino', render: (p) => locationById.get(p.locationId)?.nombre ?? '—', sortValue: (p) => locationById.get(p.locationId)?.nombre ?? '' },
    { key: 'estado', label: 'Estado', render: (p) => <Badge label={p.estado} />, sortValue: (p) => p.estado },
    { key: 'total', label: 'Total', align: 'right', render: (p) => formatEUR(p.total), sortValue: (p) => p.total },
    { key: 'prevista', label: 'Fecha prevista', render: (p) => formatDate(p.fechaPrevista), sortValue: (p) => p.fechaPrevista },
  ]

  function openCreate() {
    setDraftProveedorId(db.suppliers[0]?.id ?? '')
    setDraftLocationId(almacenes[0]?.id ?? '')
    setCreating(true)
  }
  function closeModal() {
    setSelected(null)
    setCreating(false)
  }

  function saveNewOrder() {
    const proveedor = proveedorById.get(draftProveedorId)
    if (!proveedor) return
    const catalogo = db.products.filter((p) => p.proveedorId === draftProveedorId)
    const base = catalogo.length > 0 ? catalogo : db.products.slice(0, 5)
    const lineas = base.slice(0, 3).map((p) => ({ productoId: p.id, cantidad: 50, precioUnit: p.coste, igic: p.igic }))
    const total = Number(lineas.reduce((sum, l) => sum + l.cantidad * l.precioUnit * (1 + l.igic / 100), 0).toFixed(2))
    const fechaPrevista = new Date()
    fechaPrevista.setDate(fechaPrevista.getDate() + proveedor.plazoEntregaDias)
    add({
      id: `C-2026-${Date.now().toString().slice(-6)}`,
      proveedorId: draftProveedorId,
      locationId: draftLocationId,
      estado: 'Pendiente',
      fecha: new Date().toISOString().slice(0, 10),
      fechaPrevista: fechaPrevista.toISOString().slice(0, 10),
      lineas,
      total,
    })
    closeModal()
  }

  function markReceived(p: PurchaseOrder) {
    update(p.id, { estado: 'Recibido' })
  }
  function handleDelete() {
    if (!selected) return
    remove(selected.id)
    closeModal()
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
            <ShoppingBag size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Compras</h1>
        </div>
        <Badge label="Activo (Fase 1)" />
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">{purchases.length} pedidos a proveedor · Recepción y actualización de stock</p>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(p) => p.id}
        searchableText={(p) => `${p.id} ${proveedorById.get(p.proveedorId)?.nombre ?? ''}`}
        onRowClick={setSelected}
        pageSize={14}
        filters={
          <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} className={`${inputClass} max-w-[160px]`}>
            <option value="">Todos los estados</option>
            <option value="Pendiente">Pendiente</option>
            <option value="Recibido">Recibido</option>
          </select>
        }
        actions={
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
            <Plus size={15} /> Nuevo pedido
          </button>
        }
      />

      {selected && (
        <Modal
          title={selected.id}
          subtitle={`${proveedorById.get(selected.proveedorId)?.nombre ?? ''} → ${locationById.get(selected.locationId)?.nombre ?? ''}`}
          wide
          onClose={closeModal}
          footer={
            <>
              <button onClick={handleDelete} className="mr-auto flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                <Trash2 size={14} /> Eliminar
              </button>
              {selected.estado === 'Pendiente' && (
                <button
                  onClick={() => {
                    markReceived(selected)
                    closeModal()
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700"
                >
                  <Check size={14} /> Marcar recibido
                </button>
              )}
              <button onClick={closeModal} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cerrar
              </button>
            </>
          }
        >
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="text-left px-3 py-2">Producto</th>
                  <th className="text-right px-3 py-2">Cantidad</th>
                  <th className="text-right px-3 py-2">Coste unit.</th>
                  <th className="text-right px-3 py-2">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {selected.lineas.map((l, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">{productById.get(l.productoId)?.nombre ?? 'Producto eliminado'}</td>
                    <td className="px-3 py-2 text-right">{l.cantidad}</td>
                    <td className="px-3 py-2 text-right">{formatEUR(l.precioUnit)}</td>
                    <td className="px-3 py-2 text-right">{formatEUR(l.cantidad * l.precioUnit * (1 + l.igic / 100))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-right mt-3 text-base font-semibold text-slate-900">Total: {formatEUR(selected.total)}</div>
        </Modal>
      )}

      {creating && (
        <Modal
          title="Nuevo pedido a proveedor"
          onClose={closeModal}
          footer={
            <>
              <button onClick={closeModal} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancelar
              </button>
              <button onClick={saveNewOrder} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
                Crear pedido
              </button>
            </>
          }
        >
          <div className="mb-4">
            <span className="block text-xs font-medium text-slate-500 mb-1">Proveedor</span>
            <select className={inputClass} value={draftProveedorId} onChange={(e) => setDraftProveedorId(e.target.value)}>
              {db.suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </div>
          <div>
            <span className="block text-xs font-medium text-slate-500 mb-1">Almacén destino</span>
            <select className={inputClass} value={draftLocationId} onChange={(e) => setDraftLocationId(e.target.value)}>
              {almacenes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
          </div>
          <p className="text-xs text-slate-400 mt-3">Se generan automáticamente hasta 3 líneas con las referencias habituales de este proveedor.</p>
        </Modal>
      )}
    </div>
  )
}
