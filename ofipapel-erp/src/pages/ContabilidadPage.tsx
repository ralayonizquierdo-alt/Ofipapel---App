import { useMemo } from 'react'
import { Calculator } from 'lucide-react'
import { useDatabase } from '../lib/DatabaseContext'
import DataTable, { type Column } from '../components/DataTable'
import Badge from '../components/Badge'
import { formatEUR, formatDate } from '../lib/format'

interface AccountEntry {
  id: string
  fecha: string
  concepto: string
  cuenta: string
  debe: number
  haber: number
}

const CUENTAS: Record<string, string> = {
  '430': 'Clientes',
  '700': 'Ventas de mercaderías',
  '477': 'H.P. IVA repercutido',
  '600': 'Compras de mercaderías',
  '472': 'H.P. IVA soportado',
  '400': 'Proveedores',
}

export default function ContabilidadPage() {
  const { db } = useDatabase()
  const clienteById = useMemo(() => new Map(db.clients.map((c) => [c.id, c])), [db.clients])
  const proveedorById = useMemo(() => new Map(db.suppliers.map((s) => [s.id, s])), [db.suppliers])

  const asientos = useMemo(() => {
    const entries: AccountEntry[] = []
    db.invoices.forEach((inv) => {
      const cliente = clienteById.get(inv.clienteId)?.nombre ?? 'Cliente'
      entries.push({ id: `${inv.id}-1`, fecha: inv.fecha, concepto: `Factura ${inv.id} · ${cliente}`, cuenta: '430', debe: inv.total, haber: 0 })
      entries.push({ id: `${inv.id}-2`, fecha: inv.fecha, concepto: `Factura ${inv.id} · ${cliente}`, cuenta: '700', debe: 0, haber: inv.base })
      entries.push({ id: `${inv.id}-3`, fecha: inv.fecha, concepto: `Factura ${inv.id} · ${cliente}`, cuenta: '477', debe: 0, haber: inv.iva })
    })
    db.purchases
      .filter((p) => p.estado === 'Recibido')
      .forEach((p) => {
        const base = Number(p.lineas.reduce((sum, l) => sum + l.cantidad * l.precioUnit, 0).toFixed(2))
        const iva = Number((p.total - base).toFixed(2))
        const proveedor = proveedorById.get(p.proveedorId)?.nombre ?? 'Proveedor'
        entries.push({ id: `${p.id}-1`, fecha: p.fecha, concepto: `Compra ${p.id} · ${proveedor}`, cuenta: '600', debe: base, haber: 0 })
        entries.push({ id: `${p.id}-2`, fecha: p.fecha, concepto: `Compra ${p.id} · ${proveedor}`, cuenta: '472', debe: iva, haber: 0 })
        entries.push({ id: `${p.id}-3`, fecha: p.fecha, concepto: `Compra ${p.id} · ${proveedor}`, cuenta: '400', debe: 0, haber: p.total })
      })
    return entries.sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  }, [db.invoices, db.purchases, clienteById, proveedorById])

  const mayor = useMemo(() => {
    const map = new Map<string, { debe: number; haber: number }>()
    asientos.forEach((a) => {
      const acc = map.get(a.cuenta) ?? { debe: 0, haber: 0 }
      acc.debe += a.debe
      acc.haber += a.haber
      map.set(a.cuenta, acc)
    })
    return [...map.entries()].map(([cuenta, v]) => ({ cuenta, ...v, saldo: v.debe - v.haber }))
  }, [asientos])

  const columns: Column<AccountEntry>[] = [
    { key: 'fecha', label: 'Fecha', render: (a) => formatDate(a.fecha), sortValue: (a) => a.fecha },
    { key: 'concepto', label: 'Concepto', sortValue: (a) => a.concepto },
    { key: 'cuenta', label: 'Cuenta', render: (a) => `${a.cuenta} · ${CUENTAS[a.cuenta]}`, sortValue: (a) => a.cuenta },
    { key: 'debe', label: 'Debe', align: 'right', render: (a) => (a.debe ? formatEUR(a.debe) : '—'), sortValue: (a) => a.debe },
    { key: 'haber', label: 'Haber', align: 'right', render: (a) => (a.haber ? formatEUR(a.haber) : '—'), sortValue: (a) => a.haber },
  ]

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
            <Calculator size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Contabilidad</h1>
        </div>
        <Badge label="Activo (Fase 2)" />
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">Asientos automáticos generados desde facturas de venta y compras recibidas</p>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium text-slate-700">Libro mayor (saldos por cuenta)</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="text-left px-4 py-2">Cuenta</th>
              <th className="text-right px-4 py-2">Debe</th>
              <th className="text-right px-4 py-2">Haber</th>
              <th className="text-right px-4 py-2">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {mayor.map((m) => (
              <tr key={m.cuenta} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5">
                  {m.cuenta} · {CUENTAS[m.cuenta]}
                </td>
                <td className="px-4 py-2.5 text-right">{formatEUR(m.debe)}</td>
                <td className="px-4 py-2.5 text-right">{formatEUR(m.haber)}</td>
                <td className="px-4 py-2.5 text-right font-medium">{formatEUR(m.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="text-sm font-medium text-slate-700 mb-2">Libro diario</div>
      <DataTable columns={columns} rows={asientos} rowKey={(a) => a.id} searchableText={(a) => `${a.concepto} ${a.cuenta}`} pageSize={16} />
    </div>
  )
}
