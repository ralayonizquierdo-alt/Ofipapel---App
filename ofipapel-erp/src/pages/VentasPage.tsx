import { useMemo, useState } from 'react'
import { ShoppingCart, Plus, Trash2, X } from 'lucide-react'
import { useDatabase, useCollection } from '../lib/DatabaseContext'
import DataTable, { type Column } from '../components/DataTable'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import { inputClass } from '../components/FormField'
import { formatEUR, formatDate } from '../lib/format'
import { createInvoiceFromSale } from '../lib/invoicing'
import type { SaleOrder, EstadoVenta, OrderLine, TarifaId } from '../types'

const ESTADOS: EstadoVenta[] = ['Presupuesto', 'Pedido', 'Albarán', 'Facturado']

interface DraftLine {
  productoId: string
  cantidad: number
}

export default function VentasPage() {
  const { db } = useDatabase()
  const { items: sales, add, update, remove } = useCollection('sales')
  const { add: addInvoice } = useCollection('invoices')
  const [estadoFiltro, setEstadoFiltro] = useState('')
  const [comercialFiltro, setComercialFiltro] = useState('')
  const [selected, setSelected] = useState<SaleOrder | null>(null)
  const [creating, setCreating] = useState(false)
  const [draftClienteId, setDraftClienteId] = useState('')
  const [draftLines, setDraftLines] = useState<DraftLine[]>([])

  const clienteById = useMemo(() => new Map(db.clients.map((c) => [c.id, c])), [db.clients])
  const repById = useMemo(() => new Map(db.salesReps.map((r) => [r.id, r])), [db.salesReps])
  const productById = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products])

  const rows = sales.filter((s) => (estadoFiltro ? s.estado === estadoFiltro : true)).filter((s) => (comercialFiltro ? s.comercialId === comercialFiltro : true))

  const columns: Column<SaleOrder>[] = [
    { key: 'id', label: 'Nº', sortValue: (s) => s.id },
    { key: 'cliente', label: 'Cliente', render: (s) => clienteById.get(s.clienteId)?.nombre ?? 'Cliente eliminado', sortValue: (s) => clienteById.get(s.clienteId)?.nombre ?? '' },
    { key: 'comercial', label: 'Comercial', render: (s) => repById.get(s.comercialId)?.nombre ?? '—', sortValue: (s) => repById.get(s.comercialId)?.nombre ?? '' },
    { key: 'canal', label: 'Canal', render: (s) => <Badge label={s.canal} /> },
    { key: 'estado', label: 'Estado', render: (s) => <Badge label={s.estado} />, sortValue: (s) => s.estado },
    { key: 'total', label: 'Total', align: 'right', render: (s) => formatEUR(s.total), sortValue: (s) => s.total },
    { key: 'fecha', label: 'Fecha', render: (s) => formatDate(s.fecha), sortValue: (s) => s.fecha },
  ]

  function openCreate() {
    setDraftClienteId(db.clients[0]?.id ?? '')
    setDraftLines([{ productoId: db.products[0]?.id ?? '', cantidad: 1 }])
    setCreating(true)
  }
  function closeModal() {
    setSelected(null)
    setCreating(false)
  }

  function priceFor(clienteId: string, productoId: string): number {
    const cliente = clienteById.get(clienteId)
    const producto = productById.get(productoId)
    if (!cliente || !producto) return 0
    if (cliente.tipo === 'Minorista') return producto.pvp
    return producto.tarifas[cliente.tarifa as TarifaId] ?? producto.tarifas['Tarifa 2']
  }

  const draftTotal = draftLines.reduce((sum, l) => {
    const producto = productById.get(l.productoId)
    if (!producto) return sum
    const precio = priceFor(draftClienteId, l.productoId)
    return sum + l.cantidad * precio * (1 + producto.igic / 100)
  }, 0)

  function saveNewOrder() {
    const cliente = clienteById.get(draftClienteId)
    if (!cliente) return
    const lineas: OrderLine[] = draftLines
      .filter((l) => l.productoId && l.cantidad > 0)
      .map((l) => {
        const producto = productById.get(l.productoId)!
        return { productoId: l.productoId, cantidad: l.cantidad, precioUnit: priceFor(draftClienteId, l.productoId), igic: producto.igic }
      })
    if (lineas.length === 0) return
    const total = Number(lineas.reduce((sum, l) => sum + l.cantidad * l.precioUnit * (1 + l.igic / 100), 0).toFixed(2))
    add({
      id: `V-2026-${Date.now().toString().slice(-6)}`,
      clienteId: cliente.id,
      comercialId: cliente.comercialId,
      estado: 'Presupuesto',
      canal: 'Comercial',
      fecha: new Date().toISOString().slice(0, 10),
      lineas,
      total,
    })
    closeModal()
  }

  function advanceEstado(order: SaleOrder) {
    const idx = ESTADOS.indexOf(order.estado)
    if (idx >= ESTADOS.length - 1) return
    const siguiente = ESTADOS[idx + 1]
    update(order.id, { estado: siguiente })
    if (siguiente === 'Facturado') addInvoice(createInvoiceFromSale({ ...order, estado: siguiente }))
    setSelected((s) => (s ? { ...s, estado: siguiente } : s))
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
            <ShoppingCart size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Ventas</h1>
        </div>
        <Badge label="Activo (Fase 1)" />
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">{sales.length} operaciones · Presupuesto → Pedido → Albarán → Factura</p>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        searchableText={(s) => `${s.id} ${clienteById.get(s.clienteId)?.nombre ?? ''}`}
        onRowClick={setSelected}
        pageSize={14}
        filters={
          <>
            <select value={estadoFiltro} onChange={(e) => setEstadoFiltro(e.target.value)} className={`${inputClass} max-w-[160px]`}>
              <option value="">Todos los estados</option>
              {ESTADOS.map((e) => (
                <option key={e} value={e}>
                  {e}
                </option>
              ))}
            </select>
            <select value={comercialFiltro} onChange={(e) => setComercialFiltro(e.target.value)} className={`${inputClass} max-w-[200px]`}>
              <option value="">Todos los comerciales</option>
              {db.salesReps.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.nombre}
                </option>
              ))}
            </select>
          </>
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
          subtitle={`${clienteById.get(selected.clienteId)?.nombre ?? ''} · ${repById.get(selected.comercialId)?.nombre ?? ''}`}
          wide
          onClose={closeModal}
          footer={
            <>
              <button onClick={handleDelete} className="mr-auto flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                <Trash2 size={14} /> Eliminar
              </button>
              {selected.estado !== 'Facturado' && (
                <button onClick={() => advanceEstado(selected)} className="px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
                  Avanzar a {ESTADOS[ESTADOS.indexOf(selected.estado) + 1]}
                </button>
              )}
              <button onClick={closeModal} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cerrar
              </button>
            </>
          }
        >
          <div className="flex items-center gap-2 mb-4">
            {ESTADOS.map((e, i) => (
              <div key={e} className="flex items-center gap-2">
                <Badge label={e} />
                {i < ESTADOS.length - 1 && <span className="text-slate-300">→</span>}
              </div>
            ))}
          </div>
          <div className="border border-slate-200 rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="text-left px-3 py-2">Producto</th>
                  <th className="text-right px-3 py-2">Cantidad</th>
                  <th className="text-right px-3 py-2">Precio</th>
                  <th className="text-right px-3 py-2">IGIC</th>
                  <th className="text-right px-3 py-2">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {selected.lineas.map((l, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">{productById.get(l.productoId)?.nombre ?? 'Producto eliminado'}</td>
                    <td className="px-3 py-2 text-right">{l.cantidad}</td>
                    <td className="px-3 py-2 text-right">{formatEUR(l.precioUnit)}</td>
                    <td className="px-3 py-2 text-right">{l.igic}%</td>
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
          title="Nuevo pedido"
          wide
          onClose={closeModal}
          footer={
            <>
              <button onClick={closeModal} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancelar
              </button>
              <button onClick={saveNewOrder} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
                Crear presupuesto
              </button>
            </>
          }
        >
          <div className="mb-4">
            <span className="block text-xs font-medium text-slate-500 mb-1">Cliente</span>
            <select className={inputClass} value={draftClienteId} onChange={(e) => setDraftClienteId(e.target.value)}>
              {db.clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre} · {c.tarifa}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2 mb-3">
            {draftLines.map((line, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  className={inputClass}
                  value={line.productoId}
                  onChange={(e) => setDraftLines((ls) => ls.map((l, j) => (j === i ? { ...l, productoId: e.target.value } : l)))}
                >
                  {db.products.slice(0, 400).map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.sku} · {p.nombre}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={1}
                  className={`${inputClass} w-24`}
                  value={line.cantidad}
                  onChange={(e) => setDraftLines((ls) => ls.map((l, j) => (j === i ? { ...l, cantidad: Number(e.target.value) || 1 } : l)))}
                />
                <button onClick={() => setDraftLines((ls) => ls.filter((_, j) => j !== i))} className="p-2 text-slate-400 hover:text-red-600">
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
          <button
            onClick={() => setDraftLines((ls) => [...ls, { productoId: db.products[0]?.id ?? '', cantidad: 1 }])}
            className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1"
          >
            <Plus size={14} /> Añadir línea
          </button>

          <div className="text-right mt-4 text-base font-semibold text-slate-900">Total estimado: {formatEUR(draftTotal)}</div>
        </Modal>
      )}
    </div>
  )
}
