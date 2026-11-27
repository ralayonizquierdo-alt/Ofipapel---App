// «Ir a la venta Actual» de la ficha de Repartos (Rober, 27/11/2026): las ventas de los repartos son de GeminisWin
// (copia gw_venta / gw_venta_linea) y la pantalla de Ventas del ERP solo abre ventas hechas en el ERP, así que se
// abría vacía. Si la venta no está en el ERP, se enseña aquí la de GeminisWin, solo para consultar.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { supabase } from '../../../lib/supabase'
import { GwWindow } from '../../../components/gw'

interface Cab {
  fecha: string | null
  hora: string | null
  cliente_codigo: string | null
  nombre: string | null
  total: number | null
  total_pagado: number | null
  total_pendiente: number | null
  factura: string | null
  forma_pago: string | null
  vendedor_codigo: string | null
  empleado_codigo: string | null
}
interface Linea {
  linea: number
  articulo_codigo: string | null
  descripcion: string | null
  cantidad: number | null
  pvp: number | null
  descuento: number | null
  total: number
}

const euros = (n: number | null) => (n == null ? '' : `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)
const uds = (n: number) => n.toLocaleString('es-ES', { maximumFractionDigits: 3 })
const fecha = (iso: string | null) => (iso ? iso.slice(0, 10).split('-').reverse().join('/') : '')

export function VentaGeminisDialog({ oficina, numero, onClose }: { oficina: string; numero: number; onClose: () => void }) {
  const [cab, setCab] = useState<Cab | null>(null)
  const [lineas, setLineas] = useState<Linea[]>([])
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      const [c, ls, rg] = await Promise.all([
        supabase.from('gw_venta').select('fecha, hora, cliente_codigo, nombre, total, total_pagado, total_pendiente, vendedor_codigo, empleado_codigo, factura_oficina, factura_id').eq('oficina', oficina).eq('id_venta', numero).maybeSingle(),
        supabase.from('gw_venta_linea').select('linea, articulo_codigo, descripcion, cantidad, pvp, descuento, total_base, total_igic').eq('oficina', oficina).eq('id_venta', numero).order('linea'),
        supabase.from('reparto_gw_venta').select('factura_numero, forma_pago_texto').eq('venta_tienda_codigo', oficina).eq('venta_numero', numero).maybeSingle(),
      ])
      if (c.error || ls.error) return setError((c.error ?? ls.error)!.message)
      if (!c.data) return setError(`No se encuentra la venta ${oficina}-${numero} ni en el ERP ni en los datos de GeminisWin.`)
      const d = c.data as Record<string, unknown>
      const r = (rg.data ?? {}) as { factura_numero?: string | null; forma_pago_texto?: string | null }
      setCab({
        fecha: (d.fecha as string) ?? null,
        hora: (d.hora as string) ?? null,
        cliente_codigo: (d.cliente_codigo as string) ?? null,
        nombre: (d.nombre as string) ?? null,
        total: d.total == null ? null : Number(d.total),
        total_pagado: d.total_pagado == null ? 0 : Number(d.total_pagado),
        total_pendiente: d.total_pendiente == null ? 0 : Number(d.total_pendiente),
        factura: r.factura_numero ?? (d.factura_id ? `${d.factura_oficina}-${d.factura_id}` : null),
        forma_pago: r.forma_pago_texto ?? null,
        vendedor_codigo: (d.vendedor_codigo as string) ?? null,
        empleado_codigo: (d.empleado_codigo as string) ?? null,
      })
      setLineas(
        ((ls.data ?? []) as Record<string, unknown>[]).map((x) => ({
          linea: Number(x.linea),
          articulo_codigo: (x.articulo_codigo as string) ?? null,
          descripcion: (x.descripcion as string) ?? null,
          cantidad: x.cantidad == null ? null : Number(x.cantidad),
          pvp: x.pvp == null ? null : Number(x.pvp),
          descuento: x.descuento == null ? null : Number(x.descuento),
          total: Number(x.total_base ?? 0) + Number(x.total_igic ?? 0),
        })),
      )
    })()
  }, [oficina, numero])

  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-start justify-center bg-black/25 pt-16" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title={`Venta ${oficina}-${numero} (GeminisWin, solo consulta)`} onClose={onClose} className="w-[900px] max-w-[95vw]">
        <div className="flex max-h-[74vh] flex-col gap-2 overflow-y-auto p-1 text-[15px]">
          {error ? (
            <p className="font-bold text-[#c42b1c]">{error}</p>
          ) : !cab ? (
            <p>Cargando…</p>
          ) : (
            <>
              <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-4 gap-y-1">
                <span className="text-[#5b6680]">Cliente</span>
                <b>
                  {cab.cliente_codigo} · {cab.nombre}
                </b>
                <span className="text-[#5b6680]">Fecha</span>
                <span>
                  {fecha(cab.fecha)} {cab.hora ?? ''}
                </span>
                <span className="text-[#5b6680]">Factura</span>
                <span>{cab.factura ?? 'Sin facturar'}</span>
                <span className="text-[#5b6680]">Forma de pago</span>
                <span>{cab.forma_pago ?? ''}</span>
                <span className="text-[#5b6680]">Vendedor</span>
                <span>{cab.vendedor_codigo ?? ''}</span>
                <span className="text-[#5b6680]">Empleado</span>
                <span>{cab.empleado_codigo ?? ''}</span>
                <span className="text-[#5b6680]">Total</span>
                <b>{euros(cab.total)}</b>
                <span className="text-[#5b6680]">Pagado / Pendiente</span>
                <span>
                  {euros(cab.total_pagado)} / <b className={cab.total_pendiente ? 'text-[#c42b1c]' : ''}>{euros(cab.total_pendiente)}</b>
                </span>
              </div>
              <table className="gw-grid gw-seleccionable">
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th>Descripción</th>
                    <th className="text-right">Cant.</th>
                    <th className="text-right">PVP</th>
                    <th className="text-right">Dto.</th>
                    <th className="text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((x) => (
                    <tr key={x.linea}>
                      <td className="whitespace-nowrap">{x.articulo_codigo}</td>
                      <td>{x.descripcion}</td>
                      <td className="text-right tabular-nums">{x.cantidad == null ? '' : uds(x.cantidad)}</td>
                      <td className="text-right tabular-nums">{euros(x.pvp)}</td>
                      <td className="text-right tabular-nums">{x.descuento ? `${uds(x.descuento)} %` : ''}</td>
                      <td className="text-right tabular-nums">{euros(x.total)}</td>
                    </tr>
                  ))}
                  {!lineas.length && (
                    <tr>
                      <td colSpan={6} className="text-[#5b6680]">
                        Las líneas de esta venta no están en la copia de GeminisWin.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </div>
      </GwWindow>
    </div>,
    document.body,
  )
}
