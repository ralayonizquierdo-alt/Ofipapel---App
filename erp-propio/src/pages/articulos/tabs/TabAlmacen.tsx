import { useEffect, useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwField, GwGroup, GwInput, GwNumber, formatGw } from '../../../components/gw'
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
  const [sel, setSel] = useState<string | null>(null)

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

  const dis = !editing
  const text = (v: string) => (v === '' ? null : v)
  const total = stock.reduce((s, r) => s + Number(r.cantidad_actual), 0)
  const totalReservado = stock.reduce((s, r) => s + Number(r.cantidad_reservada), 0)

  return (
    <div className="grid grid-cols-[300px_minmax(0,1fr)] gap-2">
      <div className="flex flex-col gap-2">
        <GwCheck
          label="No tiene stock"
          checked={articulo.sin_control_stock}
          onChange={(v) => onChange({ sin_control_stock: v })}
          disabled={dis}
        />
        <GwGroup title="Ubicación">
          <div className="grid grid-cols-2 gap-2">
            <GwField label="Ubicación 1">
              <GwInput title="UBICACION1" value={articulo.ubicacion_1 ?? ''} onChange={(e) => onChange({ ubicacion_1: text(e.target.value) })} disabled={dis} />
            </GwField>
            <GwField label="Ubicación 2">
              <GwInput title="UBICACION2" value={articulo.ubicacion_2 ?? ''} onChange={(e) => onChange({ ubicacion_2: text(e.target.value) })} disabled={dis} />
            </GwField>
          </div>
        </GwGroup>
        <GwGroup title="Stock">
          <div className="grid grid-cols-[1fr_120px] items-center gap-x-2 gap-y-1">
            <span className="gw-label">Stock Mínimo:</span>
            <GwNumber value={articulo.stock_minimo} decimals={3} disabled={dis} onChange={(v) => onChange({ stock_minimo: v })} />
            <span className="gw-label">Stock Máximo:</span>
            <GwNumber value={articulo.stock_maximo} decimals={3} disabled={dis} onChange={(v) => onChange({ stock_maximo: v })} />
            <span className="gw-label">Pedido Recomendado:</span>
            <GwNumber value={articulo.pedido_recomendado} decimals={3} disabled={dis} onChange={(v) => onChange({ pedido_recomendado: v })} />
            <span className="gw-label">Reservado:</span>
            <GwNumber value={totalReservado} decimals={3} disabled />
            <span className="gw-label">Total:</span>
            <GwNumber value={total} decimals={3} disabled />
          </div>
        </GwGroup>
      </div>
      <GwGroup title="Stock por Almacén">
        <table className="gw-grid">
          <thead>
            <tr>
              <th style={{ width: 60 }}>Almacén</th>
              <th>Descripción</th>
              <th className="text-right">Stock</th>
              <th className="text-right">Reservado</th>
              <th className="text-right">Disponible</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={5} className="text-center text-[#6d6d6d]">Cargando…</td>
              </tr>
            )}
            {!loading && stock.length === 0 && (
              <tr>
                <td colSpan={5} className="text-center text-[#6d6d6d]">Sin stock en ningún almacén.</td>
              </tr>
            )}
            {stock.map((r) => (
              <tr key={r.almacen_codigo} className={sel === r.almacen_codigo ? 'gw-selected' : ''} onClick={() => setSel(r.almacen_codigo)}>
                <td>{r.almacen_codigo}</td>
                <td>{r.almacen?.nombre ?? ''}</td>
                <td className="text-right tabular-nums">{formatGw(r.cantidad_actual, 3)}</td>
                <td className="text-right tabular-nums">{formatGw(r.cantidad_reservada, 3)}</td>
                <td className="text-right tabular-nums">{r.cantidad_disponible != null ? formatGw(r.cantidad_disponible, 3) : ''}</td>
              </tr>
            ))}
          </tbody>
          {stock.length > 0 && (
            <tfoot>
              <tr>
                <td colSpan={2} className="font-bold">Total</td>
                <td className="text-right font-bold tabular-nums">{formatGw(total, 3)}</td>
                <td className="text-right font-bold tabular-nums">{formatGw(totalReservado, 3)}</td>
                <td className="text-right font-bold tabular-nums">{formatGw(total - totalReservado, 3)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </GwGroup>
    </div>
  )
}
