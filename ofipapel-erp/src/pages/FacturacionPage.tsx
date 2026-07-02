import { useMemo, useState } from 'react'
import { Receipt, Printer } from 'lucide-react'
import { useDatabase } from '../lib/DatabaseContext'
import DataTable, { type Column } from '../components/DataTable'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import { inputClass } from '../components/FormField'
import { formatEUR, formatDate } from '../lib/format'
import type { Invoice } from '../types'

export default function FacturacionPage() {
  const { db } = useDatabase()
  const [clienteFiltro, setClienteFiltro] = useState('')
  const [selected, setSelected] = useState<Invoice | null>(null)

  const clienteById = useMemo(() => new Map(db.clients.map((c) => [c.id, c])), [db.clients])
  const ventaById = useMemo(() => new Map(db.sales.map((s) => [s.id, s])), [db.sales])
  const productById = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products])

  const rows = clienteFiltro ? db.invoices.filter((i) => i.clienteId === clienteFiltro) : db.invoices
  const totalFacturado = db.invoices.reduce((sum, i) => sum + i.total, 0)
  const totalIva = db.invoices.reduce((sum, i) => sum + i.iva, 0)

  const columns: Column<Invoice>[] = [
    { key: 'id', label: 'Factura', sortValue: (i) => i.id },
    { key: 'cliente', label: 'Cliente', render: (i) => clienteById.get(i.clienteId)?.nombre ?? 'Cliente eliminado', sortValue: (i) => clienteById.get(i.clienteId)?.nombre ?? '' },
    { key: 'base', label: 'Base', align: 'right', render: (i) => formatEUR(i.base), sortValue: (i) => i.base },
    { key: 'iva', label: 'IVA', align: 'right', render: (i) => formatEUR(i.iva), sortValue: (i) => i.iva },
    { key: 'total', label: 'Total', align: 'right', render: (i) => formatEUR(i.total), sortValue: (i) => i.total },
    { key: 'fecha', label: 'Fecha', render: (i) => formatDate(i.fecha), sortValue: (i) => i.fecha },
  ]

  const venta = selected ? ventaById.get(selected.ventaId) : null
  const cliente = selected ? clienteById.get(selected.clienteId) : null

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
            <Receipt size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Facturación</h1>
        </div>
        <Badge label="Activo (Fase 1)" />
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">
        {db.invoices.length} facturas · {formatEUR(totalFacturado)} facturados ({formatEUR(totalIva)} de IVA repercutido)
      </p>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(i) => i.id}
        searchableText={(i) => `${i.id} ${clienteById.get(i.clienteId)?.nombre ?? ''}`}
        onRowClick={setSelected}
        pageSize={14}
        filters={
          <select value={clienteFiltro} onChange={(e) => setClienteFiltro(e.target.value)} className={`${inputClass} max-w-[240px]`}>
            <option value="">Todos los clientes</option>
            {db.clients.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>
        }
      />

      {selected && cliente && (
        <Modal
          title={selected.id}
          subtitle={cliente.nombre}
          wide
          onClose={() => setSelected(null)}
          footer={
            <>
              <button onClick={() => setSelected(null)} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cerrar
              </button>
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800"
              >
                <Printer size={14} /> Imprimir / PDF
              </button>
            </>
          }
        >
          <div id="invoice-print-area">
            <div className="flex items-start justify-between mb-6">
              <div>
                <div className="font-semibold text-slate-900">Ofipapel</div>
                <div className="text-xs text-slate-400">Distribución mayorista y minorista de material de oficina</div>
              </div>
              <div className="text-right">
                <div className="font-semibold text-slate-900">Factura {selected.id}</div>
                <div className="text-xs text-slate-400">Fecha: {formatDate(selected.fecha)}</div>
              </div>
            </div>
            <div className="mb-4 text-sm">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-1">Cliente</div>
              <div className="text-slate-800">{cliente.nombre}</div>
              <div className="text-slate-500">
                {cliente.cif} · {cliente.direccion}
              </div>
            </div>
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                    <th className="text-left px-3 py-2">Producto</th>
                    <th className="text-right px-3 py-2">Cantidad</th>
                    <th className="text-right px-3 py-2">Precio</th>
                    <th className="text-right px-3 py-2">IVA</th>
                    <th className="text-right px-3 py-2">Subtotal</th>
                  </tr>
                </thead>
                <tbody>
                  {venta?.lineas.map((l, i) => (
                    <tr key={i} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2">{productById.get(l.productoId)?.nombre ?? 'Producto eliminado'}</td>
                      <td className="px-3 py-2 text-right">{l.cantidad}</td>
                      <td className="px-3 py-2 text-right">{formatEUR(l.precioUnit)}</td>
                      <td className="px-3 py-2 text-right">{l.iva}%</td>
                      <td className="px-3 py-2 text-right">{formatEUR(l.cantidad * l.precioUnit * (1 + l.iva / 100))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex justify-end mt-4">
              <div className="w-56 text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Base imponible</span>
                  <span className="text-slate-800">{formatEUR(selected.base)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">IVA</span>
                  <span className="text-slate-800">{formatEUR(selected.iva)}</span>
                </div>
                <div className="flex justify-between text-base font-semibold text-slate-900 border-t border-slate-200 pt-1 mt-1">
                  <span>Total</span>
                  <span>{formatEUR(selected.total)}</span>
                </div>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
