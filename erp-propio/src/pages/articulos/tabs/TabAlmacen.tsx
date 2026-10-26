import { useEffect, useState, type ReactNode } from 'react'
import { FilePen, FilePlus2, Trash2 } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwGroup, GwInput, GwNumber, formatGw } from '../../../components/gw'
import type { Articulo } from '../types'

interface FilaStock {
  almacen: string
  nombre: string
  cantidad: number
}

function Fila({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-1">
      <span className="gw-label text-[12px]">{label}</span>
      {children}
    </div>
  )
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
  const [filas, setFilas] = useState<FilaStock[]>([])
  const [sel, setSel] = useState(0)

  useEffect(() => {
    Promise.all([
      supabase.from('almacen').select('codigo, nombre').order('codigo'),
      supabase.from('articulo_almacen_stock').select('almacen_codigo, cantidad_actual').eq('articulo_codigo', articulo.codigo_interno),
    ]).then(([alm, stk]) => {
      const porAlmacen = new Map((stk.data ?? []).map((r) => [r.almacen_codigo as string, Number(r.cantidad_actual)]))
      setFilas((alm.data ?? []).map((a) => ({ almacen: a.codigo, nombre: a.nombre, cantidad: porAlmacen.get(a.codigo) ?? 0 })))
    })
  }, [articulo.codigo_interno])

  const dis = !editing
  const text = (v: string) => (v === '' ? null : v)
  const total = filas.reduce((s, f) => s + f.cantidad, 0)
  const miniBtn = 'flex h-[22px] w-[46px] items-center justify-center border border-[var(--gw-border)] bg-[var(--gw-face)] text-[#9a9a9a]'

  return (
    <div className="flex min-h-[250px] items-start gap-8">
      <div className="flex w-[205px] flex-none flex-col gap-0.5">
        <GwCheck
          label="Éste artículo no tiene stock"
          checked={articulo.sin_control_stock}
          onChange={(v) => onChange({ sin_control_stock: v })}
          disabled={dis}
          className="text-[12px]"
        />
        <GwGroup title="Datos comunes almacenes">
          <div className="flex flex-col gap-1">
            <Fila label="Ubicación:">
              <div className="grid grid-cols-2 gap-0.5">
                <GwInput title="UBICACION1" value={articulo.ubicacion_1 ?? ''} onChange={(e) => onChange({ ubicacion_1: text(e.target.value) })} disabled={dis} />
                <GwInput title="UBICACION2" value={articulo.ubicacion_2 ?? ''} onChange={(e) => onChange({ ubicacion_2: text(e.target.value) })} disabled={dis} />
              </div>
            </Fila>
            <Fila label="Stock Mínimo:">
              <GwNumber value={articulo.stock_minimo} decimals={3} emptyAsZero disabled={dis} onChange={(v) => onChange({ stock_minimo: v })} />
            </Fila>
            <Fila label="Stock Máximo:">
              <GwNumber value={articulo.stock_maximo} decimals={3} emptyAsZero disabled={dis} onChange={(v) => onChange({ stock_maximo: v })} />
            </Fila>
            <Fila label="Stock Reservado:">
              <GwNumber value={articulo.unidades_reservadas} decimals={3} emptyAsZero disabled={dis} onChange={(v) => onChange({ unidades_reservadas: v ?? 0 })} />
            </Fila>
            <Fila label="Stock Pedido:">
              <GwNumber value={articulo.unidades_pedidas} decimals={3} emptyAsZero disabled={dis} onChange={(v) => onChange({ unidades_pedidas: v ?? 0 })} />
            </Fila>
            <Fila label="Stock Comprado:">
              <GwNumber value={articulo.unidades_compradas} decimals={3} emptyAsZero disabled={dis} onChange={(v) => onChange({ unidades_compradas: v ?? 0 })} />
            </Fila>
            <Fila label="Total Stock Actual:">
              <span className="pr-1 text-right text-[12px] tabular-nums text-[#1a4fd0]">{formatGw(total, 3)}</span>
            </Fila>
          </div>
        </GwGroup>
      </div>

      <GwGroup title="Stock en los almacenes" className="w-[250px] flex-none">
        <div className="flex items-end gap-0.5">
          <div className="h-[226px] flex-1 overflow-y-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid text-[12px]">
              <thead className="sticky top-0">
                <tr>
                  <th>Almacen</th>
                  <th className="!text-left">Cantidad</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={f.almacen} title={f.nombre} className={i === sel ? 'gw-selected' : ''} onClick={() => setSel(i)}>
                    <td className="!h-[16px] !py-0">{f.almacen}</td>
                    <td className="!h-[16px] !py-0 text-right tabular-nums">{formatGw(f.cantidad, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-col gap-0.5" title="El stock solo cambia con documentos: compras, ventas, traspasos y regularizaciones">
            <span className={miniBtn}>
              <FilePlus2 size={13} />
            </span>
            <span className={miniBtn}>
              <FilePen size={13} />
            </span>
            <span className={miniBtn}>
              <Trash2 size={13} />
            </span>
          </div>
        </div>
      </GwGroup>
    </div>
  )
}
