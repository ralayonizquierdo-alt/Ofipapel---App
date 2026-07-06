import { useMemo, useState } from 'react'
import { Warehouse, Plus, X, ArrowRight, Trash2 } from 'lucide-react'
import { useDatabase, useCollection } from '../lib/DatabaseContext'
import DataTable, { type Column } from '../components/DataTable'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import { inputClass } from '../components/FormField'
import { formatDate } from '../lib/format'
import type { StockTransfer, EstadoTransferencia } from '../types'

const SIGUIENTE: Record<EstadoTransferencia, EstadoTransferencia | null> = {
  Pendiente: 'En tránsito',
  'En tránsito': 'Completada',
  Completada: null,
}

interface DraftLine {
  productoId: string
  cantidad: number
}

export default function TransferenciasPage() {
  const { db, setDb } = useDatabase()
  const { items: transfers, add, remove } = useCollection('transfers')
  const [locationFiltro, setLocationFiltro] = useState('')
  const [selected, setSelected] = useState<StockTransfer | null>(null)
  const [creating, setCreating] = useState(false)
  const [origenId, setOrigenId] = useState('')
  const [destinoId, setDestinoId] = useState('')
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ productoId: db.products[0]?.id ?? '', cantidad: 10 }])

  const almacenes = db.locations.filter((l) => l.tipo === 'Almacén')
  const locationById = useMemo(() => new Map(db.locations.map((l) => [l.id, l])), [db.locations])
  const productById = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products])

  const rows = transfers.filter((t) => (locationFiltro ? t.origenId === locationFiltro || t.destinoId === locationFiltro : true))

  const columns: Column<StockTransfer>[] = [
    { key: 'id', label: 'Nº', sortValue: (t) => t.id },
    { key: 'origen', label: 'Origen', render: (t) => locationById.get(t.origenId)?.nombre ?? '—', sortValue: (t) => locationById.get(t.origenId)?.nombre ?? '' },
    { key: 'destino', label: 'Destino', render: (t) => locationById.get(t.destinoId)?.nombre ?? '—', sortValue: (t) => locationById.get(t.destinoId)?.nombre ?? '' },
    { key: 'lineas', label: 'Referencias', align: 'right', render: (t) => t.lineas.length, sortValue: (t) => t.lineas.length },
    { key: 'estado', label: 'Estado', render: (t) => <Badge label={t.estado} />, sortValue: (t) => t.estado },
    { key: 'fecha', label: 'Fecha', render: (t) => formatDate(t.fecha), sortValue: (t) => t.fecha },
  ]

  function openCreate() {
    setOrigenId(almacenes[0]?.id ?? '')
    setDestinoId(almacenes[1]?.id ?? '')
    setDraftLines([{ productoId: db.products[0]?.id ?? '', cantidad: 10 }])
    setCreating(true)
  }
  function closeModal() {
    setSelected(null)
    setCreating(false)
  }

  function saveNewTransfer() {
    if (origenId === destinoId) return
    const lineas = draftLines.filter((l) => l.productoId && l.cantidad > 0)
    if (lineas.length === 0) return
    add({
      id: `TR-2026-${Date.now().toString().slice(-6)}`,
      origenId,
      destinoId,
      fecha: new Date().toISOString().slice(0, 10),
      estado: 'Pendiente',
      lineas,
    })
    closeModal()
  }

  function avanzarEstado(t: StockTransfer) {
    const siguiente = SIGUIENTE[t.estado]
    if (!siguiente) return

    if (siguiente === 'Completada') {
      // Ejecuta el movimiento real de stock: descuenta en origen, suma en destino.
      setDb((prev) => {
        const stock = [...prev.stock]
        t.lineas.forEach((linea) => {
          const origenIdx = stock.findIndex((s) => s.productoId === linea.productoId && s.locationId === t.origenId)
          if (origenIdx >= 0) {
            stock[origenIdx] = { ...stock[origenIdx], unidades: Math.max(0, stock[origenIdx].unidades - linea.cantidad) }
          }
          const destinoIdx = stock.findIndex((s) => s.productoId === linea.productoId && s.locationId === t.destinoId)
          if (destinoIdx >= 0) {
            stock[destinoIdx] = { ...stock[destinoIdx], unidades: stock[destinoIdx].unidades + linea.cantidad }
          } else {
            stock.push({ id: `stk-tr-${Date.now()}-${linea.productoId}`, productoId: linea.productoId, locationId: t.destinoId, unidades: linea.cantidad, minimo: 20 })
          }
        })
        return {
          ...prev,
          stock,
          transfers: prev.transfers.map((tr) => (tr.id === t.id ? { ...tr, estado: siguiente } : tr)),
        }
      })
    } else {
      setDb((prev) => ({ ...prev, transfers: prev.transfers.map((tr) => (tr.id === t.id ? { ...tr, estado: siguiente } : tr)) }))
    }
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
            <Warehouse size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Multi-almacén avanzado</h1>
        </div>
        <Badge label="Activo (Fase 2)" />
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">{transfers.length} transferencias entre almacenes · el movimiento de stock se ejecuta al completarlas</p>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(t) => t.id}
        searchableText={(t) => `${t.id} ${locationById.get(t.origenId)?.nombre ?? ''} ${locationById.get(t.destinoId)?.nombre ?? ''}`}
        onRowClick={setSelected}
        pageSize={14}
        filters={
          <select value={locationFiltro} onChange={(e) => setLocationFiltro(e.target.value)} className={`${inputClass} max-w-[220px]`}>
            <option value="">Todos los almacenes</option>
            {almacenes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.nombre}
              </option>
            ))}
          </select>
        }
        actions={
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
            <Plus size={15} /> Nueva transferencia
          </button>
        }
      />

      {selected && (
        <Modal
          title={selected.id}
          subtitle={`${locationById.get(selected.origenId)?.nombre} → ${locationById.get(selected.destinoId)?.nombre}`}
          onClose={closeModal}
          footer={
            <>
              <button onClick={handleDelete} className="mr-auto flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                <Trash2 size={14} /> Eliminar
              </button>
              {SIGUIENTE[selected.estado] && (
                <button onClick={() => avanzarEstado(selected)} className="px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
                  Marcar como {SIGUIENTE[selected.estado]}
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
                </tr>
              </thead>
              <tbody>
                {selected.lineas.map((l, i) => (
                  <tr key={i} className="border-b border-slate-100 last:border-0">
                    <td className="px-3 py-2">{productById.get(l.productoId)?.nombre ?? 'Producto eliminado'}</td>
                    <td className="px-3 py-2 text-right">{l.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Modal>
      )}

      {creating && (
        <Modal
          title="Nueva transferencia"
          wide
          onClose={closeModal}
          footer={
            <>
              <button onClick={closeModal} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancelar
              </button>
              <button onClick={saveNewTransfer} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
                Crear transferencia
              </button>
            </>
          }
        >
          <div className="flex items-center gap-3 mb-4">
            <select className={inputClass} value={origenId} onChange={(e) => setOrigenId(e.target.value)}>
              {almacenes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
            <ArrowRight size={16} className="text-slate-400 shrink-0" />
            <select className={inputClass} value={destinoId} onChange={(e) => setDestinoId(e.target.value)}>
              {almacenes.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
          </div>
          {origenId === destinoId && <p className="text-xs text-red-600 mb-3">El origen y el destino deben ser distintos.</p>}

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
            onClick={() => setDraftLines((ls) => [...ls, { productoId: db.products[0]?.id ?? '', cantidad: 10 }])}
            className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1"
          >
            <Plus size={14} /> Añadir línea
          </button>
        </Modal>
      )}
    </div>
  )
}
