import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { formatGw } from '../../components/gw'
import { DLG, DialogoListado, DlgCodigoNombre, fechaEs } from '../../components/gw/GwListado'

// Clientes → Recalcular deuda. SIN CAPTURA de GeminisWin (diálogo pequeño gris como los listados
// antiguos). Pone al día cliente.deuda_actual (y fecha_ultima_venta) con lo pendiente de cobro de
// sus documentos: facturas no anuladas + ventas sin facturar (no anuladas ni aplazadas); un
// albarán facturado no cuenta dos veces. Todo el cálculo en la función SQL
// fn_cliente_recalcular_deuda, que se llama por tramos de clientes para enseñar el progreso.
// Primero se calcula sin tocar nada; con la confirmación se aplica y queda apuntado en
// cliente_deuda_recalculo para poder deshacerlo (fn_cliente_recalcular_deuda_deshacer).

interface Fila {
  cliente_codigo: string
  nombre: string
  deuda_anterior: number
  deuda_nueva: number
  diferencia: number
  ultima_venta_anterior: string | null
  ultima_venta_nueva: string | null
  cambia: boolean
}

const TRAMO = 100

type Fase = 'inicio' | 'calculando' | 'confirmar' | 'aplicando' | 'hecho'

export function RecalcularDeudaPage() {
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [bajas, setBajas] = useState(false)
  const [fase, setFase] = useState<Fase>('inicio')
  const [hechos, setHechos] = useState(0)
  const [total, setTotal] = useState(0)
  const [cambios, setCambios] = useState<Fila[]>([])
  const [error, setError] = useState<string | null>(null)
  const [lote, setLote] = useState<string | null>(null)
  const [deshecho, setDeshecho] = useState<number | null>(null)

  async function contar() {
    let q = supabase.from('cliente').select('codigo', { count: 'exact', head: true })
    if (desde.trim()) q = q.gte('codigo', desde.trim())
    if (hasta.trim()) q = q.lte('codigo', hasta.trim())
    if (!bajas) q = q.eq('activo', true).is('fecha_baja', null)
    const { count, error: e } = await q
    if (e) throw e
    return count ?? 0
  }

  /** Recorre los clientes del rango por tramos; `aplicar` = escribe. Devuelve los que cambian. */
  async function recorrer(aplicar: boolean, idLote: string | null) {
    const n = await contar()
    setTotal(n)
    setHechos(0)
    const out: Fila[] = []
    let despues = ''
    let hechosLocal = 0
    for (;;) {
      const { data, error: e } = await supabase.rpc('fn_cliente_recalcular_deuda', {
        p: { desde: desde.trim(), hasta: hasta.trim(), despues, limite: TRAMO, incluirBajas: bajas, aplicar, lote: idLote },
      })
      if (e) throw e
      const filas = (data ?? []) as Fila[]
      out.push(...filas.filter((f) => f.cambia))
      hechosLocal += filas.length
      setHechos(hechosLocal)
      if (filas.length < TRAMO) break
      despues = filas[filas.length - 1].cliente_codigo
    }
    setTotal(Math.max(n, hechosLocal))
    return out
  }

  async function calcular() {
    if (fase === 'calculando' || fase === 'aplicando') return
    setError(null)
    setDeshecho(null)
    setLote(null)
    setFase('calculando')
    try {
      const c = await recorrer(false, null)
      setCambios(c)
      setFase('confirmar')
    } catch (e) {
      setError((e as { message?: string }).message ?? String(e))
      setFase('inicio')
    }
  }

  async function aplicar() {
    setError(null)
    setFase('aplicando')
    const id = crypto.randomUUID()
    try {
      const c = await recorrer(true, id)
      setCambios(c)
      setLote(id)
      setFase('hecho')
    } catch (e) {
      setError((e as { message?: string }).message ?? String(e))
      setFase('confirmar')
    }
  }

  async function deshacer() {
    if (!lote) return
    if (!confirm('¿Devolver la deuda y la fecha de última venta que tenían estos clientes antes del recálculo?')) return
    const { data, error: e } = await supabase.rpc('fn_cliente_recalcular_deuda_deshacer', { p_lote: lote })
    if (e) return setError(e.message)
    setDeshecho(Number(data ?? 0))
    setLote(null)
  }

  const difTotal = cambios.reduce((s, f) => s + Number(f.diferencia ?? 0), 0)
  const pct = total ? Math.min(100, Math.round((hechos / total) * 100)) : fase === 'hecho' || fase === 'confirmar' ? 100 : 0
  const ocupado = fase === 'calculando' || fase === 'aplicando'

  return (
    <DialogoListado titulo="Recalcular Deuda de Clientes" ancho={560} onAceptar={calcular} textoCancelar="Cerrar" procesando={ocupado}>
      <div className={`${DLG.marco} flex flex-col gap-1`}>
        <span className={DLG.etiqueta}>Clientes</span>
        <div className="grid grid-cols-[48px_1fr] items-center gap-x-2 gap-y-1">
          <span className={DLG.etiqueta}>Desde</span>
          <DlgCodigoNombre valor={desde} onChange={(v) => (setDesde(v), setFase('inicio'))} buscador="cliente" anchoCodigo={60} anchoNombre={340} title="Cliente desde (vacío = el primero)" />
          <span className={DLG.etiqueta}>Hasta</span>
          <DlgCodigoNombre valor={hasta} onChange={(v) => (setHasta(v), setFase('inicio'))} buscador="cliente" anchoCodigo={60} anchoNombre={340} title="Cliente hasta (vacío = el último)" />
        </div>
        <label className="flex select-none items-center gap-1.5 text-[12px] font-bold">
          <input type="checkbox" className="m-0 h-[11px] w-[11px]" checked={bajas} onChange={(e) => (setBajas(e.target.checked), setFase('inicio'))} />
          Incluir clientes de baja
        </label>
      </div>
      <div className="px-0.5 text-[11px] leading-[14px] text-[#333]">
        La deuda pasa a ser lo pendiente de cobro de sus facturas y de sus ventas sin facturar (los albaranes facturados cuentan en su factura). Primero se calcula sin
        cambiar nada; al confirmar se aplica y se puede deshacer. <b>Sin captura de GeminisWin.</b>
      </div>

      {fase !== 'inicio' && (
        <div className={`${DLG.marco} flex flex-col gap-1`}>
          <div className="flex justify-between text-[12px] font-bold">
            <span>{fase === 'calculando' ? 'Calculando…' : fase === 'aplicando' ? 'Recalculando…' : fase === 'hecho' ? 'Recálculo terminado' : 'Cálculo terminado'}</span>
            <span>
              {hechos} / {total} clientes
            </span>
          </div>
          <div className="h-[14px] border border-[#7f7f7f] border-b-white border-r-white bg-white" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className="h-full bg-[#0a246a]" style={{ width: `${pct}%` }} />
          </div>
          {(fase === 'confirmar' || fase === 'hecho') && (
            <>
              <div className="text-[12px]">
                {cambios.length === 0 ? (
                  <b className="text-[#127a12]">La deuda de todos los clientes ya está al día: no hay nada que cambiar.</b>
                ) : (
                  <>
                    <b>{cambios.length}</b> cliente(s) {fase === 'hecho' ? 'actualizados' : 'cambian'} · diferencia total de deuda <b>{formatGw(difTotal, 2)}</b>
                  </>
                )}
              </div>
              {cambios.length > 0 && (
                <div className="max-h-[190px] overflow-auto border border-[#7f7f7f] bg-white">
                  <table className="gw-grid text-[11px]!">
                    <thead className="sticky top-0">
                      <tr>
                        <th>Cliente</th>
                        <th>Nombre</th>
                        <th className="text-right!">Deuda antes</th>
                        <th className="text-right!">Deuda nueva</th>
                        <th>Últ. venta</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cambios.slice(0, 500).map((f) => (
                        <tr key={f.cliente_codigo}>
                          <td>{f.cliente_codigo}</td>
                          <td className="max-w-[170px] truncate">{f.nombre}</td>
                          <td className="text-right">{formatGw(f.deuda_anterior, 2)}</td>
                          <td className="text-right font-bold text-[#1a4fd0]">{formatGw(f.deuda_nueva, 2)}</td>
                          <td>{f.ultima_venta_anterior !== f.ultima_venta_nueva ? fechaEs(f.ultima_venta_nueva) : ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
          {fase === 'confirmar' && cambios.length > 0 && (
            <div className="flex items-center justify-end gap-1.5 pt-0.5">
              <span className="mr-auto text-[12px] font-bold text-[#a00000]">¿Recalcular la deuda de estos {cambios.length} cliente(s)?</span>
              <button type="button" className={DLG.boton} onClick={aplicar}>
                <u>S</u>í, recalcular
              </button>
              <button type="button" className={DLG.boton} onClick={() => setFase('inicio')}>
                <u>N</u>o
              </button>
            </div>
          )}
          {fase === 'hecho' && (lote || deshecho != null) && (
            <div className="flex items-center justify-end gap-1.5 pt-0.5">
              {deshecho != null ? (
                <span className="mr-auto text-[12px] font-bold text-[#127a12]">Deshecho: {deshecho} cliente(s) vuelven a su deuda anterior.</span>
              ) : (
                cambios.length > 0 && (
                  <button type="button" className={DLG.boton} onClick={deshacer}>
                    <u>D</u>eshacer el recálculo
                  </button>
                )
              )}
            </div>
          )}
        </div>
      )}
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-1.5 py-0.5 text-[12px] text-[#c42b1c]">{error}</div>}
    </DialogoListado>
  )
}
