import { useState } from 'react'
import { supabase } from '../../../lib/supabase'
import { GwField, GwGroup, GwInput, GwSelect, GwWindow } from '../../../components/gw'

const n = (v: unknown) => Number(v ?? 0)
const r2 = (v: number) => Math.round(v * 100) / 100

interface AlbaranPend {
  tienda_terminal_codigo: string
  numero: number
  proveedor_codigo: string
  almacen_codigo: string | null
  forma_pago_codigo: string | null
  base_imponible: number | null
  total_igic: number | null
  total_gastos: number | null
  total: number | null
}

/**
 * Proceso «Generar Facturas»: agrupa por proveedor los pedidos de proveedor recibidos
 * y sin factura del periodo elegido, y crea una factura de proveedor por cada uno.
 */
export function GenerarFacturasDialog({
  tiendas,
  onClose,
  onHecho,
}: {
  tiendas: string[]
  onClose: () => void
  onHecho: (creadas: { t: string; id: number }[]) => void
}) {
  const hoy = new Date().toISOString().slice(0, 10)
  const [tienda, setTienda] = useState(tiendas[0] ?? '')
  const [proveedor, setProveedor] = useState('')
  const [desde, setDesde] = useState(hoy.slice(0, 8) + '01')
  const [hasta, setHasta] = useState(hoy)
  const [fechaFactura, setFechaFactura] = useState(hoy)
  const [trabajando, setTrabajando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function procesar() {
    if (!tienda) return setError('Indica la tienda que emite las facturas.')
    if (!desde || !hasta || desde > hasta) return setError('El periodo no es válido.')
    setTrabajando(true)
    setError(null)
    let q = supabase
      .from('pedido_proveedor')
      .select('tienda_terminal_codigo, numero, proveedor_codigo, almacen_codigo, forma_pago_codigo, base_imponible, total_igic, total_gastos, total')
      .eq('recibido', true)
      .is('factura_proveedor_id', null)
      .gte('fecha_hora', `${desde}T00:00:00`)
      .lte('fecha_hora', `${hasta}T23:59:59`)
    if (proveedor.trim()) q = q.eq('proveedor_codigo', proveedor.trim())
    const { data, error: e0 } = await q.order('proveedor_codigo').order('numero')
    if (e0) {
      setTrabajando(false)
      return setError(e0.message)
    }
    const grupos = new Map<string, AlbaranPend[]>()
    for (const a of (data ?? []) as AlbaranPend[]) grupos.set(a.proveedor_codigo, [...(grupos.get(a.proveedor_codigo) ?? []), a])
    const creadas: { t: string; id: number }[] = []
    for (const [prov, alb] of grupos) {
      const base = r2(alb.reduce((s, a) => s + n(a.base_imponible), 0))
      const igic = r2(alb.reduce((s, a) => s + n(a.total_igic), 0))
      const gastos = r2(alb.reduce((s, a) => s + n(a.total_gastos), 0))
      const total = r2(alb.reduce((s, a) => s + n(a.total), 0))
      const almacenes = alb.map((a) => a.almacen_codigo).filter(Boolean).sort() as string[]
      const tiendasAlb = alb.map((a) => a.tienda_terminal_codigo).sort()
      const { data: fp } = await supabase.from('proveedor').select('forma_pago_codigo').eq('codigo', prov).maybeSingle()
      const { data: num, error: e1 } = await supabase.rpc('fn_siguiente_numero', { p_tienda: tienda, p_tipo_documento: 'factura_proveedor', p_serie: '' })
      if (e1) {
        setTrabajando(false)
        return setError(e1.message)
      }
      const id = Number(num)
      const { error: e2 } = await supabase.from('factura_proveedor').insert({
        tienda_terminal_codigo: tienda,
        id,
        proveedor_codigo: prov,
        fecha_factura: fechaFactura,
        fecha_desde: desde,
        fecha_hasta: hasta,
        oficina_desde_codigo: tiendasAlb[0] ?? null,
        oficina_hasta_codigo: tiendasAlb[tiendasAlb.length - 1] ?? null,
        almacen_desde_codigo: almacenes[0] ?? null,
        almacen_hasta_codigo: almacenes[almacenes.length - 1] ?? null,
        forma_pago_codigo: (fp?.forma_pago_codigo as string | null) ?? alb[0].forma_pago_codigo ?? null,
        subtotal: base,
        base_imponible: base,
        total_igic: igic,
        total_gastos: gastos,
        total,
        total_a_pagar_proveedor: total,
        total_pendiente: total,
        numero_pagos: 0,
      })
      if (e2) {
        setTrabajando(false)
        return setError(e2.message)
      }
      for (const a of alb) {
        await supabase
          .from('pedido_proveedor')
          .update({ factura_proveedor_tienda_codigo: tienda, factura_proveedor_id: id })
          .eq('tienda_terminal_codigo', a.tienda_terminal_codigo)
          .eq('numero', a.numero)
      }
      creadas.push({ t: tienda, id })
    }
    setTrabajando(false)
    onHecho(creadas)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-24">
      <GwWindow title="Generar Facturas de Proveedor" onClose={onClose} className="w-[520px] max-w-[95vw]">
        <div className="flex flex-col gap-2">
          <GwGroup title="Albaranes a facturar">
            <div className="grid grid-cols-2 gap-2">
              <GwField label="Desde fecha">
                <GwInput type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
              </GwField>
              <GwField label="Hasta fecha">
                <GwInput type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
              </GwField>
              <GwField label="Proveedor (vacío = todos)">
                <GwInput value={proveedor} onChange={(e) => setProveedor(e.target.value)} />
              </GwField>
            </div>
          </GwGroup>
          <GwGroup title="Datos de la factura">
            <div className="grid grid-cols-2 gap-2">
              <GwField label="Tienda">
                <GwSelect value={tienda} onChange={(e) => setTienda(e.target.value)}>
                  {tiendas.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </GwSelect>
              </GwField>
              <GwField label="Fecha de factura">
                <GwInput type="date" value={fechaFactura} onChange={(e) => setFechaFactura(e.target.value)} />
              </GwField>
            </div>
          </GwGroup>
          {error && <span className="gw-label text-[#c42b1c]">{error}</span>}
          <div className="flex justify-end gap-1.5">
            <button type="button" className="gw-btn" disabled={trabajando} onClick={procesar}>
              {trabajando ? 'Procesando…' : 'Procesar'}
            </button>
            <button type="button" className="gw-btn" disabled={trabajando} onClick={onClose}>
              Cancelar
            </button>
          </div>
        </div>
      </GwWindow>
    </div>
  )
}
