import { useMemo, useState } from 'react'
import { Store, Plus, X, Lock, Unlock } from 'lucide-react'
import { useDatabase, useCollection } from '../lib/DatabaseContext'
import DataTable, { type Column } from '../components/DataTable'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import StatCard from '../components/StatCard'
import { inputClass } from '../components/FormField'
import { formatEUR, formatDate } from '../lib/format'
import { createInvoiceFromSale } from '../lib/invoicing'
import type { SaleOrder } from '../types'

const today = () => new Date().toISOString().slice(0, 10)

interface DraftLine {
  productoId: string
  cantidad: number
}

export default function TPVPage() {
  const { db } = useDatabase()
  const { items: sessions, add: addSession, update: updateSession } = useCollection('cashSessions')
  const { items: sales, add: addSale } = useCollection('sales')
  const { add: addInvoice } = useCollection('invoices')
  const tiendas = db.locations.filter((l) => l.tipo === 'Tienda')
  const [tiendaId, setTiendaId] = useState(tiendas[0]?.id ?? '')
  const [closing, setClosing] = useState(false)
  const [saldoContado, setSaldoContado] = useState('0')
  const [selling, setSelling] = useState(false)
  const [draftLines, setDraftLines] = useState<DraftLine[]>([{ productoId: db.products[0]?.id ?? '', cantidad: 1 }])
  const [formaPago, setFormaPago] = useState<'Efectivo' | 'Tarjeta'>('Efectivo')

  const productById = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products])

  const sessionsForTienda = sessions.filter((s) => s.locationId === tiendaId).sort((a, b) => (a.fechaApertura < b.fechaApertura ? 1 : -1))
  const sesionAbierta = sessionsForTienda.find((s) => s.estado === 'Abierta') ?? null
  const historial = sessionsForTienda.filter((s) => s.estado === 'Cerrada').slice(0, 10)

  const ticketsTienda = sales.filter((s) => s.locationId === tiendaId && s.canal === 'Tienda')
  const ticketsHoy = ticketsTienda.filter((s) => s.fecha === today())

  const esperado = sesionAbierta ? sesionAbierta.saldoInicial + sesionAbierta.ventasEfectivo : 0

  const columns: Column<SaleOrder>[] = [
    { key: 'id', label: 'Ticket', sortValue: (s) => s.id },
    { key: 'total', label: 'Total', align: 'right', render: (s) => formatEUR(s.total), sortValue: (s) => s.total },
    { key: 'pago', label: 'Pago', render: (s) => <Badge label={s.formaPago ?? '—'} /> },
    { key: 'fecha', label: 'Fecha', render: (s) => formatDate(s.fecha), sortValue: (s) => s.fecha },
  ]

  function abrirCaja() {
    const ultima = sessionsForTienda[0]
    addSession({
      id: `caja-${Date.now()}`,
      locationId: tiendaId,
      fechaApertura: today(),
      fechaCierre: null,
      saldoInicial: ultima?.saldoContado ?? 100,
      ventasEfectivo: 0,
      ventasTarjeta: 0,
      saldoContado: null,
      estado: 'Abierta',
    })
  }

  function abrirCierre() {
    setSaldoContado(esperado.toFixed(2))
    setClosing(true)
  }

  function confirmarCierre() {
    if (!sesionAbierta) return
    updateSession(sesionAbierta.id, {
      estado: 'Cerrada',
      fechaCierre: today(),
      saldoContado: Number(saldoContado) || 0,
    })
    setClosing(false)
  }

  const draftTotal = draftLines.reduce((sum, l) => {
    const p = productById.get(l.productoId)
    if (!p) return sum
    return sum + l.cantidad * p.pvp * (1 + p.iva / 100)
  }, 0)

  function confirmarVenta() {
    if (!sesionAbierta) return
    const lineas = draftLines
      .filter((l) => l.productoId && l.cantidad > 0)
      .map((l) => {
        const p = productById.get(l.productoId)!
        return { productoId: l.productoId, cantidad: l.cantidad, precioUnit: p.pvp, iva: p.iva }
      })
    if (lineas.length === 0) return
    const total = Number(lineas.reduce((sum, l) => sum + l.cantidad * l.precioUnit * (1 + l.iva / 100), 0).toFixed(2))
    const repDeLaTienda = db.salesReps.find((r) => r.zona === db.locations.find((l) => l.id === tiendaId)?.zona) ?? db.salesReps[0]
    const venta: SaleOrder = {
      id: `V-2026-${Date.now().toString().slice(-6)}`,
      clienteId: db.clients.find((c) => c.tipo === 'Minorista')?.id ?? db.clients[0].id,
      comercialId: repDeLaTienda.id,
      estado: 'Facturado',
      canal: 'Tienda',
      locationId: tiendaId,
      formaPago,
      fecha: today(),
      lineas,
      total,
    }
    addSale(venta)
    addInvoice(createInvoiceFromSale(venta))
    updateSession(sesionAbierta.id, {
      ventasEfectivo: sesionAbierta.ventasEfectivo + (formaPago === 'Efectivo' ? total : 0),
      ventasTarjeta: sesionAbierta.ventasTarjeta + (formaPago === 'Tarjeta' ? total : 0),
    })
    setSelling(false)
    setDraftLines([{ productoId: db.products[0]?.id ?? '', cantidad: 1 }])
    setFormaPago('Efectivo')
  }

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
            <Store size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">TPV / Punto de venta</h1>
        </div>
        <Badge label="Activo (Fase 2)" />
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">Caja, arqueo y venta rápida por tienda</p>

      <div className="flex gap-2 mb-6">
        {tiendas.map((t) => (
          <button
            key={t.id}
            onClick={() => setTiendaId(t.id)}
            className={`px-3 py-2 rounded-lg text-sm border ${tiendaId === t.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 hover:border-slate-300'}`}
          >
            {t.nombre}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={sesionAbierta ? Unlock : Lock} label="Estado de caja" value={sesionAbierta ? 'Abierta' : 'Cerrada'} tone={sesionAbierta ? 'good' : 'default'} />
        <StatCard icon={Store} label="Ventas en efectivo" value={formatEUR(sesionAbierta?.ventasEfectivo ?? 0)} />
        <StatCard icon={Store} label="Ventas con tarjeta" value={formatEUR(sesionAbierta?.ventasTarjeta ?? 0)} />
        <StatCard icon={Store} label="Tickets de hoy" value={String(ticketsHoy.length)} />
      </div>

      <div className="flex gap-2 mb-6">
        {sesionAbierta ? (
          <>
            <button onClick={() => setSelling(true)} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
              <Plus size={15} /> Nueva venta rápida
            </button>
            <button onClick={abrirCierre} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50">
              <Lock size={15} /> Cerrar caja (arqueo)
            </button>
          </>
        ) : (
          <button onClick={abrirCaja} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700">
            <Unlock size={15} /> Abrir caja
          </button>
        )}
      </div>

      <DataTable columns={columns} rows={ticketsTienda} rowKey={(s) => s.id} searchableText={(s) => s.id} pageSize={10} />

      {historial.length > 0 && (
        <div className="mt-6 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium text-slate-700">Histórico de arqueos</div>
          {historial.map((s) => {
            const diff = (s.saldoContado ?? 0) - (s.saldoInicial + s.ventasEfectivo)
            return (
              <div key={s.id} className="flex items-center justify-between px-4 py-2.5 border-b border-slate-100 last:border-0 text-sm">
                <span className="text-slate-700">{formatDate(s.fechaApertura)}</span>
                <span className="text-slate-500">
                  Efectivo {formatEUR(s.ventasEfectivo)} · Tarjeta {formatEUR(s.ventasTarjeta)}
                </span>
                <span className={Math.abs(diff) < 0.01 ? 'text-emerald-600' : 'text-red-600'}>
                  {diff >= 0 ? '+' : ''}
                  {formatEUR(diff)} descuadre
                </span>
              </div>
            )
          })}
        </div>
      )}

      {closing && (
        <Modal
          title="Cerrar caja"
          subtitle={db.locations.find((l) => l.id === tiendaId)?.nombre}
          onClose={() => setClosing(false)}
          footer={
            <>
              <button onClick={() => setClosing(false)} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancelar
              </button>
              <button onClick={confirmarCierre} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
                Confirmar cierre
              </button>
            </>
          }
        >
          <p className="text-sm text-slate-500 mb-3">
            Efectivo esperado (saldo inicial + ventas en efectivo): <strong>{formatEUR(esperado)}</strong>
          </p>
          <label className="block">
            <span className="block text-xs font-medium text-slate-500 mb-1">Efectivo contado en caja</span>
            <input type="number" step="0.01" className={inputClass} value={saldoContado} onChange={(e) => setSaldoContado(e.target.value)} />
          </label>
          {Number(saldoContado) !== esperado && (
            <p className="text-xs text-red-600 mt-2">
              Descuadre: {formatEUR(Number(saldoContado) - esperado)}
            </p>
          )}
        </Modal>
      )}

      {selling && (
        <Modal
          title="Nueva venta rápida"
          subtitle={db.locations.find((l) => l.id === tiendaId)?.nombre}
          onClose={() => setSelling(false)}
          footer={
            <>
              <button onClick={() => setSelling(false)} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancelar
              </button>
              <button onClick={confirmarVenta} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
                Cobrar {formatEUR(draftTotal)}
              </button>
            </>
          }
        >
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
                      {p.sku} · {p.nombre} · {formatEUR(p.pvp)}
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
            className="text-sm text-slate-600 hover:text-slate-900 flex items-center gap-1 mb-4"
          >
            <Plus size={14} /> Añadir línea
          </button>

          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-slate-500">Forma de pago</span>
            <button
              onClick={() => setFormaPago('Efectivo')}
              className={`px-3 py-1.5 text-sm rounded-lg border ${formaPago === 'Efectivo' ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200'}`}
            >
              Efectivo
            </button>
            <button
              onClick={() => setFormaPago('Tarjeta')}
              className={`px-3 py-1.5 text-sm rounded-lg border ${formaPago === 'Tarjeta' ? 'bg-slate-900 text-white border-slate-900' : 'border-slate-200'}`}
            >
              Tarjeta
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
