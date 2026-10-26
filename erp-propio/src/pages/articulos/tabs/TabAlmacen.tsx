import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { FormField, TextInput } from '../../../components/FormField'
import { Toggle } from '../../../components/Toggle'
import type { Articulo } from '../types'

interface StockRow {
  almacen_codigo: string
  cantidad_actual: number
  cantidad_reservada: number
  cantidad_disponible: number | null
  almacen: { nombre: string } | null
}

export function TabAlmacen({
  articulo,
  editing,
  onChange,
}: {
  articulo: Articulo
  editing: boolean
  onChange: (patch: Partial<Articulo>) => void
}) {
  const [stock, setStock] = useState<StockRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase
      .from('articulo_almacen_stock')
      .select('almacen_codigo, cantidad_actual, cantidad_reservada, cantidad_disponible, almacen:almacen_codigo(nombre)')
      .eq('articulo_codigo', articulo.codigo_interno)
      .order('almacen_codigo')
      .then(({ data }) => {
        setStock((data ?? []) as unknown as StockRow[])
        setLoading(false)
      })
  }, [articulo.codigo_interno])

  const num = (v: string) => (v === '' ? null : Number(v))
  const text = (v: string) => (v === '' ? null : v)
  const total = stock.reduce((s, r) => s + Number(r.cantidad_actual), 0)
  const totalReservado = stock.reduce((s, r) => s + Number(r.cantidad_reservada), 0)

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Control de stock</h3>
        <Toggle
          label="No tiene stock (SINSTOCK) — servicios, cuotas, copias…"
          checked={articulo.sin_control_stock}
          onChange={(v) => onChange({ sin_control_stock: v })}
          disabled={!editing}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <FormField label="Ubicación 1" hint="UBICACION1">
            <TextInput value={articulo.ubicacion_1 ?? ''} onChange={(e) => onChange({ ubicacion_1: text(e.target.value) })} disabled={!editing} />
          </FormField>
          <FormField label="Ubicación 2" hint="UBICACION2">
            <TextInput value={articulo.ubicacion_2 ?? ''} onChange={(e) => onChange({ ubicacion_2: text(e.target.value) })} disabled={!editing} />
          </FormField>
          <FormField label="Stock mínimo" hint="STOCK_MIN">
            <TextInput type="number" step="0.001" value={articulo.stock_minimo ?? ''} onChange={(e) => onChange({ stock_minimo: num(e.target.value) })} disabled={!editing} />
          </FormField>
          <FormField label="Stock máximo" hint="STOCK_MAX">
            <TextInput type="number" step="0.001" value={articulo.stock_maximo ?? ''} onChange={(e) => onChange({ stock_maximo: num(e.target.value) })} disabled={!editing} />
          </FormField>
          <FormField label="Pedido recomendado" hint="PED_RECOM">
            <TextInput type="number" step="0.001" value={articulo.pedido_recomendado ?? ''} onChange={(e) => onChange({ pedido_recomendado: num(e.target.value) })} disabled={!editing} />
          </FormField>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Stock por almacén</h3>
        <p className="text-xs text-slate-400">
          Solo lectura. El stock cambia únicamente con documentos (compras, ventas, traspasos y regularizaciones), nunca
          editándolo aquí.
        </p>
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Almacén</th>
                <th className="px-3 py-2 text-right">Actual</th>
                <th className="px-3 py-2 text-right">Reservado</th>
                <th className="px-3 py-2 text-right">Disponible</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-slate-400">Cargando…</td>
                </tr>
              )}
              {!loading && stock.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-slate-400">Sin movimientos de stock todavía.</td>
                </tr>
              )}
              {stock.map((r) => (
                <tr key={r.almacen_codigo} className="border-b border-slate-100 last:border-0">
                  <td className="px-3 py-2">
                    <span className="font-mono text-xs text-slate-400">{r.almacen_codigo}</span> {r.almacen?.nombre ?? ''}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(r.cantidad_actual).toFixed(3)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{Number(r.cantidad_reservada).toFixed(3)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.cantidad_disponible != null ? Number(r.cantidad_disponible).toFixed(3) : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
            {stock.length > 0 && (
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-3 py-2">Total</td>
                  <td className="px-3 py-2 text-right tabular-nums">{total.toFixed(3)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{totalReservado.toFixed(3)}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{(total - totalReservado).toFixed(3)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </section>
    </div>
  )
}
