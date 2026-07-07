import { useMemo, useRef, useState } from 'react'
import { Store, Plus, X, Lock, Unlock, ScanBarcode } from 'lucide-react'
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

/** Búsqueda sin distinguir acentos ni mayúsculas — la dependienta escribe rápido. */
function normalizar(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}

interface CartLine {
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
  const [cart, setCart] = useState<CartLine[]>([])
  const [busqueda, setBusqueda] = useState('')
  const [formaPago, setFormaPago] = useState<'Efectivo' | 'Tarjeta'>('Efectivo')
  const [cobroAbierto, setCobroAbierto] = useState(false)
  const [importeEntregado, setImporteEntregado] = useState('0')
  const buscadorRef = useRef<HTMLInputElement>(null)

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

  function abrirVenta() {
    setCart([])
    setBusqueda('')
    setFormaPago('Efectivo')
    setSelling(true)
  }

  const resultadosBusqueda = useMemo(() => {
    const q = normalizar(busqueda)
    if (!q) return []
    return db.products
      .filter((p) => p.activo && (p.codigoBarras.includes(busqueda.trim()) || normalizar(p.sku).includes(q) || normalizar(p.nombre).includes(q)))
      .slice(0, 8)
  }, [busqueda, db.products])

  function addToCart(productoId: string) {
    setCart((c) => {
      const existente = c.find((l) => l.productoId === productoId)
      if (existente) return c.map((l) => (l.productoId === productoId ? { ...l, cantidad: l.cantidad + 1 } : l))
      return [...c, { productoId, cantidad: 1 }]
    })
    setBusqueda('')
    buscadorRef.current?.focus()
  }

  function handleBuscadorKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== 'Enter') return
    const crudo = busqueda.trim()
    const q = normalizar(busqueda)
    if (!q) return
    // Un lector de código de barras "escribe" el EAN completo y envía Enter: se comprueba primero.
    const porBarcode = db.products.find((p) => p.activo && p.codigoBarras === crudo)
    if (porBarcode) {
      addToCart(porBarcode.id)
      return
    }
    const porSku = db.products.find((p) => p.activo && normalizar(p.sku) === q)
    if (porSku) {
      addToCart(porSku.id)
      return
    }
    if (resultadosBusqueda.length > 0) addToCart(resultadosBusqueda[0].id)
  }

  function updateCantidad(productoId: string, cantidad: number) {
    setCart((c) => c.map((l) => (l.productoId === productoId ? { ...l, cantidad: Math.max(1, cantidad) } : l)))
  }

  function removeFromCart(productoId: string) {
    setCart((c) => c.filter((l) => l.productoId !== productoId))
  }

  const cartTotal = cart.reduce((sum, l) => {
    const p = productById.get(l.productoId)
    if (!p) return sum
    return sum + l.cantidad * p.pvp * (1 + p.igic / 100)
  }, 0)

  function confirmarVenta() {
    if (!sesionAbierta || cart.length === 0) return
    const lineas = cart.map((l) => {
      const p = productById.get(l.productoId)!
      return { productoId: l.productoId, cantidad: l.cantidad, precioUnit: p.pvp, igic: p.igic }
    })
    const total = Number(lineas.reduce((sum, l) => sum + l.cantidad * l.precioUnit * (1 + l.igic / 100), 0).toFixed(2))
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
    setCart([])
    setCobroAbierto(false)
  }

  const importeEntregadoNum = Number(importeEntregado) || 0
  const cambio = importeEntregadoNum - cartTotal

  function iniciarCobro() {
    if (cart.length === 0) return
    if (formaPago === 'Tarjeta') {
      confirmarVenta()
      return
    }
    setImporteEntregado(cartTotal.toFixed(2))
    setCobroAbierto(true)
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
            disabled={selling}
            className={`px-3 py-2 rounded-lg text-sm border disabled:opacity-40 ${tiendaId === t.id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white border-slate-200 hover:border-slate-300'}`}
          >
            {t.nombre}
          </button>
        ))}
      </div>

      {selling ? (
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold text-slate-900">Venta en curso · {db.locations.find((l) => l.id === tiendaId)?.nombre}</h2>
            <button onClick={() => setSelling(false)} className="text-sm text-slate-500 hover:text-slate-700">
              Cancelar venta
            </button>
          </div>

          <div className="relative mb-1">
            <ScanBarcode size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={buscadorRef}
              autoFocus
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              onKeyDown={handleBuscadorKeyDown}
              placeholder="Escanear código de barras, o escribir código/nombre y pulsar Enter…"
              className="w-full pl-9 pr-3 py-2.5 text-sm border border-slate-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
            />
            {resultadosBusqueda.length > 0 && (
              <div className="absolute z-10 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
                {resultadosBusqueda.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => addToCart(p.id)}
                    className="w-full flex items-center justify-between px-3 py-2 text-sm text-left hover:bg-slate-50 border-b border-slate-100 last:border-0"
                  >
                    <span>
                      <span className="text-slate-400 font-mono text-xs mr-2">{p.sku}</span>
                      {p.nombre}
                    </span>
                    <span className="flex items-center gap-3">
                      <span className="text-slate-400 font-mono text-xs">{p.codigoBarras}</span>
                      <span className="text-slate-500">{formatEUR(p.pvp)}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-slate-400 mb-4">El lector de códigos de barras funciona igual que un teclado: escanea y el artículo se añade solo.</p>

          <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                  <th className="text-left px-3 py-2">Código</th>
                  <th className="text-left px-3 py-2">Descripción</th>
                  <th className="text-right px-3 py-2">Unidades</th>
                  <th className="text-right px-3 py-2">Precio</th>
                  <th className="text-right px-3 py-2">IGIC</th>
                  <th className="text-right px-3 py-2">Subtotal</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {cart.map((l) => {
                  const p = productById.get(l.productoId)
                  if (!p) return null
                  const subtotal = l.cantidad * p.pvp * (1 + p.igic / 100)
                  return (
                    <tr key={l.productoId} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 font-mono text-xs text-slate-500">{p.sku}</td>
                      <td className="px-3 py-2 text-slate-800">{p.nombre}</td>
                      <td className="px-3 py-2 text-right">
                        <input
                          type="number"
                          min={1}
                          value={l.cantidad}
                          onChange={(e) => updateCantidad(l.productoId, Number(e.target.value) || 1)}
                          className="w-16 text-right border border-slate-200 rounded px-1.5 py-1"
                        />
                      </td>
                      <td className="px-3 py-2 text-right">{formatEUR(p.pvp)}</td>
                      <td className="px-3 py-2 text-right">{p.igic}%</td>
                      <td className="px-3 py-2 text-right font-medium">{formatEUR(subtotal)}</td>
                      <td className="px-2 py-2 text-right">
                        <button onClick={() => removeFromCart(l.productoId)} className="p-1 text-slate-400 hover:text-red-600">
                          <X size={15} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {cart.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-400">
                      Busca un artículo arriba para añadirlo al ticket.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
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
            <div className="flex items-center gap-4">
              <span className="text-lg font-semibold text-slate-900">Total: {formatEUR(cartTotal)}</span>
              <button
                onClick={iniciarCobro}
                disabled={cart.length === 0}
                className="px-5 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40"
              >
                Cobrar
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <StatCard icon={sesionAbierta ? Unlock : Lock} label="Estado de caja" value={sesionAbierta ? 'Abierta' : 'Cerrada'} tone={sesionAbierta ? 'good' : 'default'} />
            <StatCard icon={Store} label="Ventas en efectivo" value={formatEUR(sesionAbierta?.ventasEfectivo ?? 0)} />
            <StatCard icon={Store} label="Ventas con tarjeta" value={formatEUR(sesionAbierta?.ventasTarjeta ?? 0)} />
            <StatCard icon={Store} label="Tickets de hoy" value={String(ticketsHoy.length)} />
          </div>

          <div className="flex gap-2 mb-6">
            {sesionAbierta ? (
              <>
                <button onClick={abrirVenta} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
                  <Plus size={15} /> Nueva venta
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
              <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium text-slate-700">
                Histórico de arqueos
              </div>
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
        </>
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
          {Number(saldoContado) !== esperado && <p className="text-xs text-red-600 mt-2">Descuadre: {formatEUR(Number(saldoContado) - esperado)}</p>}
        </Modal>
      )}

      {cobroAbierto && (
        <Modal
          title="Cobrar en efectivo"
          subtitle={`Total: ${formatEUR(cartTotal)}`}
          onClose={() => setCobroAbierto(false)}
          footer={
            <>
              <button onClick={() => setCobroAbierto(false)} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancelar
              </button>
              <button
                onClick={confirmarVenta}
                disabled={cambio < 0}
                className="px-4 py-2 text-sm font-medium text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-40"
              >
                Confirmar cobro
              </button>
            </>
          }
        >
          <label className="block mb-3">
            <span className="block text-xs font-medium text-slate-500 mb-1">Importe entregado por el cliente</span>
            <input
              type="number"
              step="0.01"
              autoFocus
              className={inputClass}
              value={importeEntregado}
              onChange={(e) => setImporteEntregado(e.target.value)}
            />
          </label>
          <div className="flex gap-2 mb-4">
            {[cartTotal, 10, 20, 50, 100]
              .filter((v, i, arr) => arr.indexOf(v) === i)
              .map((v) => (
                <button
                  key={v}
                  onClick={() => setImporteEntregado(v.toFixed(2))}
                  className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg hover:bg-slate-50"
                >
                  {v === cartTotal ? 'Importe exacto' : formatEUR(v)}
                </button>
              ))}
          </div>
          {cambio >= 0 ? (
            <p className="text-sm text-slate-700">
              Cambio a devolver: <strong className="text-emerald-600">{formatEUR(cambio)}</strong>
            </p>
          ) : (
            <p className="text-sm text-red-600">Falta {formatEUR(-cambio)} para completar el importe.</p>
          )}
        </Modal>
      )}
    </div>
  )
}
