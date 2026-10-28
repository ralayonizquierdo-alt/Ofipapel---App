import { useCallback, useEffect, useMemo, useState } from 'react'
import { Download, RefreshCw } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { todasLasFilas } from '../../lib/todasLasFilas'
import { GwCheck, GwField, GwNumber } from '../../components/gw'
import { descargarCsv, eur0, fechaEs, hoy, numCsv, r2 } from './contabModel'
import { Aviso, Barra, Rango, Rejilla, Vacio } from './ui'

interface Previsto {
  vencimiento: string
  tipo: 'Cobro' | 'Pago'
  documento: string
  tercero: string
  importe: number // + cobro / - pago
}

const masDias = (d: number) => {
  const x = new Date()
  x.setDate(x.getDate() + d)
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`
}

/**
 * Contabilidad → Previsión de Tesorería: cobros y pagos pendientes ordenados por vencimiento,
 * con el saldo previsto partiendo del saldo actual de caja y bancos (cuentas 570 y 572).
 */
export function PrevisionTesoreriaPage() {
  const [desde, setDesde] = useState('2000-01-01')
  const [hasta, setHasta] = useState(masDias(90))
  const [verVencidos, setVerVencidos] = useState(true)
  const [saldoInicial, setSaldoInicial] = useState<number | null>(null)
  const [filas, setFilas] = useState<Previsto[]>([])
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    try {
      const out: Previsto[] = []
      // Supabase corta cada respuesta en 1000 filas: todo lo pendiente se pide por bloques.
      const [cob, pag, fac, fpr, anu] = await Promise.all([
        todasLasFilas(() =>
          supabase
            .from('cobro_cliente')
            .select('tienda_terminal_codigo, codigo_pago, fecha_vencimiento, fecha, importe_cobrado, cuota, concepto, factura_tienda_codigo, factura_numero, cliente:cliente_codigo(nombre)')
            .eq('activo', true)
            .neq('estado_cobro', 'cobrado')
            .order('tienda_terminal_codigo')
            .order('codigo_pago'),
        ),
        todasLasFilas(() =>
          supabase
            .from('pago_proveedor')
            .select('tienda_terminal_codigo, codigo_pago, fecha_vencimiento, fecha, importe_pagado, cuota, concepto, receptor_nombre, factura_relacionada_tienda_codigo, factura_relacionada_id')
            .eq('activo', true)
            .eq('estado_pago', 'pendiente')
            .order('tienda_terminal_codigo')
            .order('codigo_pago'),
        ),
        todasLasFilas(() =>
          supabase
            .from('factura')
            .select('tienda_terminal_codigo, numero, serie, n_factura, tipo_factura, fecha_factura, fecha_primer_pago, total_pendiente, nombre_cliente')
            .neq('total_pendiente', 0)
            .order('tienda_terminal_codigo')
            .order('numero'),
        ),
        todasLasFilas(() =>
          supabase
            .from('factura_proveedor')
            .select('tienda_terminal_codigo, id, numero_factura_externo, fecha_factura, fecha_vencimiento, total_pendiente, pagado, proveedor:proveedor_codigo(nombre)')
            .gt('total_pendiente', 0)
            .eq('pagado', false)
            .order('tienda_terminal_codigo')
            .order('id'),
        ),
        // Facturas anuladas en VeriFactu: la factura no cambia, la anulación es un registro aparte
        todasLasFilas(() => supabase.from('registro_facturacion').select('origen_tienda_codigo, origen_numero').eq('origen_tipo', 'factura').eq('tipo_registro', 'anulacion').order('id')),
      ])
      for (const r of [cob, pag, fac, fpr, anu]) if (r.error) throw new Error(r.error)
      const anuladas = new Set((anu.data ?? []).map((a) => `${a.origen_tienda_codigo}-${a.origen_numero}`))
      const conCobro = new Set<string>()
      for (const c of (cob.data ?? []) as unknown as Record<string, unknown>[]) {
        if (c.factura_numero && anuladas.has(`${c.factura_tienda_codigo}-${c.factura_numero}`)) continue
        if (c.factura_numero) conCobro.add(`${c.factura_tienda_codigo}-${c.factura_numero}`)
        out.push({
          vencimiento: String(c.fecha_vencimiento ?? c.fecha ?? hoy()),
          tipo: 'Cobro',
          documento: String(c.concepto ?? `Cobro ${c.tienda_terminal_codigo}-${c.codigo_pago}`),
          tercero: String((c.cliente as { nombre?: string } | null)?.nombre ?? ''),
          importe: Number(c.cuota ?? c.importe_cobrado ?? 0),
        })
      }
      const conPago = new Set<string>()
      for (const p of (pag.data ?? []) as Record<string, unknown>[]) {
        if (p.factura_relacionada_id) conPago.add(`${p.factura_relacionada_tienda_codigo}-${p.factura_relacionada_id}`)
        out.push({
          vencimiento: String(p.fecha_vencimiento ?? p.fecha ?? hoy()),
          tipo: 'Pago',
          documento: String(p.concepto ?? `Pago ${p.tienda_terminal_codigo}-${p.codigo_pago}`),
          tercero: String(p.receptor_nombre ?? ''),
          importe: -Number(p.cuota ?? p.importe_pagado ?? 0),
        })
      }
      for (const f of fac.data ?? []) {
        const k = `${f.tienda_terminal_codigo}-${f.numero}`
        if (conCobro.has(k) || anuladas.has(k)) continue
        out.push({
          vencimiento: f.fecha_primer_pago ?? f.fecha_factura,
          tipo: 'Cobro',
          documento: `${String(f.tipo_factura ?? '').startsWith('R') ? 'Fra. rectificativa' : 'Factura'} ${[f.serie, f.n_factura ?? f.numero].filter(Boolean).join('-')}`,
          tercero: f.nombre_cliente ?? '',
          importe: Number(f.total_pendiente),
        })
      }
      for (const f of (fpr.data ?? []) as unknown as Record<string, unknown>[]) {
        if (conPago.has(`${f.tienda_terminal_codigo}-${f.id}`)) continue
        out.push({
          vencimiento: String(f.fecha_vencimiento ?? f.fecha_factura ?? hoy()),
          tipo: 'Pago',
          documento: `Fra. prov. ${f.numero_factura_externo ?? f.id}`,
          tercero: String((f.proveedor as { nombre?: string } | null)?.nombre ?? ''),
          importe: -Number(f.total_pendiente),
        })
      }
      out.sort((a, b) => a.vencimiento.localeCompare(b.vencimiento))
      setFilas(out)
      // Saldo actual de tesorería según la contabilidad (570 + 572)
      if (saldoInicial == null) {
        const { data } = await todasLasFilas(() => supabase.rpc('fn_contab_sumas_saldos', { p_desde: '2000-01-01', p_hasta: hoy(), p_nivel: 2 }))
        const t = ((data ?? []) as { cuenta: string; debe: number; haber: number }[]).find((x) => x.cuenta === '57')
        setSaldoInicial(t ? r2(Number(t.debe) - Number(t.haber)) : 0)
      }
    } catch (e) {
      setError((e as Error).message)
    }
  }, [saldoInicial])

  useEffect(() => {
    cargar()
    // Solo al entrar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const visibles = useMemo(
    () => filas.filter((f) => f.vencimiento <= hasta && f.vencimiento >= desde && (verVencidos || f.vencimiento >= hoy())),
    [filas, desde, hasta, verVencidos],
  )
  let saldo = saldoInicial ?? 0
  const conSaldo = visibles.map((f) => {
    saldo = r2(saldo + f.importe)
    return { ...f, saldo }
  })
  const cobros = r2(visibles.filter((f) => f.importe > 0).reduce((s, f) => s + f.importe, 0))
  const pagos = r2(visibles.filter((f) => f.importe < 0).reduce((s, f) => s - f.importe, 0))

  return (
    <div className="flex min-w-0 flex-col gap-1.5 text-[13px]">
      <Barra>
        <Rango desde={desde} hasta={hasta} onDesde={setDesde} onHasta={setHasta} />
        <GwField label="Saldo inicial (570+572)">
          <GwNumber value={saldoInicial} decimals={2} onChange={(v) => setSaldoInicial(v ?? 0)} className="w-[110px]" />
        </GwField>
        <GwCheck label="Incluir vencidos" checked={verVencidos} onChange={setVerVencidos} className="mb-1" />
        <button type="button" className="gw-btn" onClick={cargar}>
          <RefreshCw size={14} /> Actualizar
        </button>
        <button
          type="button"
          className="gw-btn"
          disabled={!conSaldo.length}
          onClick={() =>
            descargarCsv(
              'prevision_tesoreria.csv',
              ['Vencimiento', 'Tipo', 'Documento', 'Tercero', 'Importe', 'Saldo previsto'],
              conSaldo.map((f) => [fechaEs(f.vencimiento), f.tipo, f.documento, f.tercero, numCsv(f.importe), numCsv(f.saldo)]),
            )
          }
        >
          <Download size={14} /> Excel (CSV)
        </button>
        <span className="mb-1 ml-auto">
          Cobros <b>{eur0(cobros)}</b> · Pagos <b>{eur0(pagos)}</b> · Saldo final previsto <b>{eur0(r2((saldoInicial ?? 0) + cobros - pagos))}</b>
        </span>
      </Barra>
      <Aviso error={error} />
      <Rejilla alto="calc(100vh - 280px)">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th className="w-[95px]">Vencimiento</th>
              <th className="w-[60px]">Tipo</th>
              <th>Documento</th>
              <th className="w-[260px]">Cliente / proveedor</th>
              <th className="w-[110px] text-right!">Importe</th>
              <th className="w-[120px] text-right!">Saldo previsto</th>
            </tr>
          </thead>
          <tbody>
            {conSaldo.length === 0 && <Vacio cols={6} texto="No hay cobros ni pagos pendientes en el periodo." />}
            {conSaldo.map((f, i) => (
              <tr key={i} className={f.vencimiento < hoy() ? 'text-[#c42b1c]' : ''}>
                <td>{fechaEs(f.vencimiento)}</td>
                <td>{f.tipo}</td>
                <td className="truncate">{f.documento}</td>
                <td className="truncate">{f.tercero}</td>
                <td className="text-right">{eur0(f.importe)}</td>
                <td className={`text-right font-bold ${f.saldo < 0 ? 'text-[#c42b1c]' : ''}`}>{eur0(f.saldo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Rejilla>
    </div>
  )
}
