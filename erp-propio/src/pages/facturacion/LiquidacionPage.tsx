// Facturación → Liquidación. SIN CAPTURA de GeminisWin y sin descripción en el mapa funcional:
// se interpreta como LIQUIDACIÓN DE COMISIONES a vendedores, técnicos y repartidores, que es lo
// que encaja con los datos que trae GeminisWin (venta.vendedor_codigo y % de comisión, comisión
// por línea de vendedor y de técnico, % por defecto del repartidor). CONFIRMAR CON LUIS.
//
// Se calcula por venta (fn_liquidacion_comisiones_calculo; reglas en la migración
// 20261028_archivo_parametros.sql), se ve el resumen por agente y el detalle del elegido, y
// «Liquidar» lo deja apuntado (una liquidación por agente) para que esas ventas no vuelvan a
// salir. Una liquidación se puede anular y sus ventas vuelven a quedar pendientes.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calculator, CheckCheck, Printer, Undo2 } from 'lucide-react'
import { GwCheck, GwDate, GwGroup, GwInput, GwRadio, formatGw } from '../../components/gw'
import { fechaEs } from '../../components/gw/GwListado'
import { supabase } from '../../lib/supabase'
import { fechaReferencia, isoLocal } from '../../lib/sesionTrabajo'
import { Mensaje } from '../utilidades/comun'

type TipoAgente = 'vendedor' | 'tecnico' | 'repartidor'
const TIPOS: { k: TipoAgente; l: string }[] = [
  { k: 'vendedor', l: 'Vendedores' },
  { k: 'tecnico', l: 'Técnicos' },
  { k: 'repartidor', l: 'Repartidores' },
]

interface LineaCalc {
  agente_codigo: string
  agente_nombre: string | null
  venta_tienda_codigo: string
  venta_numero: number
  fecha: string
  cliente_codigo: string | null
  nombre_cliente: string | null
  factura: string | null
  cobrada: boolean
  base: number
  pct: number
  comision: number
  liquidacion_id: number | null
}

interface Liquidacion {
  id: number
  tipo: TipoAgente
  agente_codigo: string
  fecha: string
  desde: string | null
  hasta: string | null
  documentos: number
  base_total: number
  comision_total: number
  anulada: boolean
}

function mesAnterior(): { desde: string; hasta: string } {
  const r = fechaReferencia()
  const ini = new Date(r.getFullYear(), r.getMonth() - 1, 1)
  const fin = new Date(r.getFullYear(), r.getMonth(), 0)
  return { desde: isoLocal(ini), hasta: isoLocal(fin) }
}

export function LiquidacionPage() {
  const navigate = useNavigate()
  const [tipo, setTipo] = useState<TipoAgente>('vendedor')
  const [{ desde, hasta }, setRango] = useState(mesAnterior)
  const [agDesde, setAgDesde] = useState('')
  const [agHasta, setAgHasta] = useState('')
  const [soloFacturadas, setSoloFacturadas] = useState(false)
  const [soloCobradas, setSoloCobradas] = useState(false)
  const [incluirLiquidadas, setIncluirLiquidadas] = useState(false)
  const [lineas, setLineas] = useState<LineaCalc[] | null>(null)
  const [sel, setSel] = useState<string | null>(null)
  const [historial, setHistorial] = useState<Liquidacion[]>([])
  const [ocupado, setOcupado] = useState(false)
  const [mensaje, setMensaje] = useState<{ texto: string; error?: boolean } | null>(null)

  const parametros = () => ({
    tipo,
    desde,
    hasta,
    agente_desde: agDesde.trim(),
    agente_hasta: agHasta.trim(),
    solo_facturadas: soloFacturadas,
    solo_cobradas: soloCobradas,
    incluir_liquidadas: incluirLiquidadas,
  })

  const cargarHistorial = useCallback(async () => {
    const { data } = await supabase
      .from('liquidacion_comision')
      .select('id, tipo, agente_codigo, fecha, desde, hasta, documentos, base_total, comision_total, anulada')
      .eq('tipo', tipo)
      .order('id', { ascending: false })
      .limit(50)
    setHistorial(((data ?? []) as Liquidacion[]).map((l) => ({ ...l, base_total: Number(l.base_total), comision_total: Number(l.comision_total) })))
  }, [tipo])

  useEffect(() => {
    cargarHistorial()
  }, [cargarHistorial])

  async function calcular() {
    setOcupado(true)
    setMensaje(null)
    const { data, error } = await supabase.rpc('fn_liquidacion_comisiones_calculo', { p: parametros() })
    setOcupado(false)
    if (error) return setMensaje({ texto: error.message, error: true })
    const l = ((data ?? []) as LineaCalc[]).map((x) => ({ ...x, base: Number(x.base), pct: Number(x.pct), comision: Number(x.comision) }))
    setLineas(l)
    setSel(l[0]?.agente_codigo ?? null)
    if (!l.length) setMensaje({ texto: incluirLiquidadas ? 'No hay ventas con comisión con estos filtros.' : 'No hay ventas con comisión pendiente de liquidar con estos filtros.' })
  }

  const resumen = useMemo(() => {
    const m = new Map<string, { codigo: string; nombre: string; docs: number; base: number; comision: number; liquidadas: number }>()
    for (const x of lineas ?? []) {
      const r = m.get(x.agente_codigo) ?? { codigo: x.agente_codigo, nombre: x.agente_nombre ?? '', docs: 0, base: 0, comision: 0, liquidadas: 0 }
      r.docs++
      r.base += x.base
      r.comision += x.comision
      if (x.liquidacion_id) r.liquidadas++
      m.set(x.agente_codigo, r)
    }
    return [...m.values()]
  }, [lineas])
  const detalle = (lineas ?? []).filter((x) => x.agente_codigo === sel)
  const pendientes = (lineas ?? []).filter((x) => !x.liquidacion_id)
  const total = resumen.reduce((a, r) => ({ base: a.base + r.base, comision: a.comision + r.comision }), { base: 0, comision: 0 })

  async function liquidar() {
    if (!pendientes.length) return
    const tot = pendientes.reduce((a, x) => a + x.comision, 0)
    if (!confirm(`¿Liquidar ${pendientes.length} venta(s) de ${new Set(pendientes.map((x) => x.agente_codigo)).size} agente(s), comisión total ${formatGw(tot, 2)} €? Las ventas quedan marcadas como liquidadas.`)) return
    setOcupado(true)
    const { data, error } = await supabase.rpc('fn_liquidacion_comisiones_liquidar', { p: parametros(), p_observaciones: null })
    setOcupado(false)
    if (error) return setMensaje({ texto: error.message, error: true })
    const n = ((data ?? []) as unknown[]).length
    setMensaje({ texto: `Creadas ${n} liquidación(es).` })
    await cargarHistorial()
    calcular()
  }

  async function anular(l: Liquidacion) {
    if (!confirm(`¿Anular la liquidación nº ${l.id} de ${l.agente_codigo}? Sus ${l.documentos} venta(s) vuelven a quedar pendientes.`)) return
    const { error } = await supabase.rpc('fn_liquidacion_comisiones_anular', { p_id: l.id })
    if (error) return setMensaje({ texto: error.message, error: true })
    setMensaje({ texto: `Liquidación nº ${l.id} anulada.` })
    await cargarHistorial()
    if (lineas) calcular()
  }

  const etiquetaAgente = TIPOS.find((t) => t.k === tipo)!.l.replace(/es$/, '').replace(/s$/, '')

  return (
    <div className="flex w-[1180px] max-w-full flex-col gap-1.5 text-[12px]">
      <div className="flex gap-2">
        <GwGroup title="Liquidar a" className="flex-none">
          <div className="flex flex-col gap-0.5">
            {TIPOS.map((t) => (
              <GwRadio
                key={t.k}
                name="liq-tipo"
                label={t.l}
                checked={tipo === t.k}
                onChange={() => {
                  setTipo(t.k)
                  setLineas(null)
                  setMensaje(null)
                }}
              />
            ))}
          </div>
        </GwGroup>
        <GwGroup title="Ventas" className="flex-none">
          <div className="grid grid-cols-[auto_110px_auto_110px] items-center gap-x-2 gap-y-1">
            <span className="gw-label">Desde fecha:</span>
            <GwDate value={desde} onChange={(v) => setRango((r) => ({ ...r, desde: v ?? '' }))} style={{ width: 100 }} />
            <span className="gw-label">Hasta fecha:</span>
            <GwDate value={hasta} onChange={(v) => setRango((r) => ({ ...r, hasta: v ?? '' }))} style={{ width: 100 }} />
            <span className="gw-label">Desde {etiquetaAgente.toLowerCase()}:</span>
            <GwInput value={agDesde} maxLength={10} onChange={(e) => setAgDesde(e.target.value.toUpperCase())} />
            <span className="gw-label">Hasta {etiquetaAgente.toLowerCase()}:</span>
            <GwInput value={agHasta} maxLength={10} onChange={(e) => setAgHasta(e.target.value.toUpperCase())} />
          </div>
        </GwGroup>
        <GwGroup title="Condiciones" className="min-w-0 flex-1">
          <div className="flex flex-col gap-0.5">
            <GwCheck label="Solo ventas facturadas" checked={soloFacturadas} onChange={setSoloFacturadas} />
            <GwCheck label="Solo ventas cobradas" checked={soloCobradas} onChange={setSoloCobradas} />
            <GwCheck label="Incluir las ya liquidadas (consulta)" checked={incluirLiquidadas} onChange={setIncluirLiquidadas} />
          </div>
        </GwGroup>
        <div className="flex flex-none flex-col justify-end gap-1">
          <button type="button" className="gw-btn h-[30px]! w-[130px]" onClick={calcular} disabled={ocupado}>
            <Calculator size={14} /> Calcular
          </button>
          <button type="button" className="gw-btn h-[30px]! w-[130px]" onClick={liquidar} disabled={ocupado || !pendientes.length} title="Apunta como liquidadas las ventas pendientes del cálculo">
            <CheckCheck size={14} className="text-[#2a9d2a]" /> Liquidar
          </button>
        </div>
      </div>
      {mensaje && <Mensaje texto={mensaje.texto} error={mensaje.error} />}
      <div className="grid grid-cols-[430px_minmax(0,1fr)] gap-2">
        <div className="h-[300px] overflow-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th className="w-[60px]">Código</th>
                <th>{etiquetaAgente}</th>
                <th className="w-[44px] text-right!">Docs.</th>
                <th className="w-[90px] text-right!">Base</th>
                <th className="w-[80px] text-right!">Comisión</th>
              </tr>
            </thead>
            <tbody>
              {resumen.map((r) => (
                <tr key={r.codigo} className={r.codigo === sel ? 'gw-selected' : ''} onClick={() => setSel(r.codigo)}>
                  <td>{r.codigo}</td>
                  <td className="truncate">{r.nombre}</td>
                  <td className="text-right">{r.docs}</td>
                  <td className="text-right tabular-nums">{formatGw(r.base, 2)}</td>
                  <td className="text-right tabular-nums">{formatGw(r.comision, 2)}</td>
                </tr>
              ))}
              {resumen.length > 0 && (
                <tr className="font-bold">
                  <td colSpan={3}>Total</td>
                  <td className="text-right tabular-nums">{formatGw(total.base, 2)}</td>
                  <td className="text-right tabular-nums">{formatGw(total.comision, 2)}</td>
                </tr>
              )}
              {lineas == null && (
                <tr>
                  <td colSpan={5} className="py-3 text-center text-[#666]">
                    Elija los filtros y pulse Calcular.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="h-[300px] overflow-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th className="w-[80px]">Venta</th>
                <th className="w-[76px]">Fecha</th>
                <th>Cliente</th>
                <th className="w-[80px]">Factura</th>
                <th className="w-[50px]">Cobr.</th>
                <th className="w-[84px] text-right!">Base</th>
                <th className="w-[54px] text-right!">%</th>
                <th className="w-[80px] text-right!">Comisión</th>
                <th className="w-[60px]">Liq.</th>
              </tr>
            </thead>
            <tbody>
              {detalle.map((x) => (
                <tr key={`${x.venta_tienda_codigo}-${x.venta_numero}`}>
                  <td>
                    {x.venta_tienda_codigo}-{x.venta_numero}
                  </td>
                  <td>{fechaEs(x.fecha)}</td>
                  <td className="truncate">
                    {x.cliente_codigo} {x.nombre_cliente}
                  </td>
                  <td>{x.factura}</td>
                  <td>{x.cobrada ? 'Sí' : 'No'}</td>
                  <td className="text-right tabular-nums">{formatGw(x.base, 2)}</td>
                  <td className="text-right tabular-nums">{formatGw(x.pct, 2)}</td>
                  <td className="text-right tabular-nums">{formatGw(x.comision, 2)}</td>
                  <td>{x.liquidacion_id ? `nº ${x.liquidacion_id}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <GwGroup title={`Liquidaciones anteriores (${TIPOS.find((t) => t.k === tipo)!.l.toLowerCase()})`}>
        <div className="h-[130px] overflow-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th className="w-[50px]">Nº</th>
                <th className="w-[76px]">Fecha</th>
                <th className="w-[70px]">Agente</th>
                <th className="w-[170px]">Periodo</th>
                <th className="w-[50px] text-right!">Docs.</th>
                <th className="w-[100px] text-right!">Base</th>
                <th className="w-[100px] text-right!">Comisión</th>
                <th>Estado</th>
                <th className="w-[80px]" />
              </tr>
            </thead>
            <tbody>
              {historial.map((l) => (
                <tr key={l.id} className={l.anulada ? 'text-[#888] line-through' : ''}>
                  <td>{l.id}</td>
                  <td>{fechaEs(l.fecha)}</td>
                  <td>{l.agente_codigo}</td>
                  <td>
                    {fechaEs(l.desde)} - {fechaEs(l.hasta)}
                  </td>
                  <td className="text-right">{l.documentos}</td>
                  <td className="text-right tabular-nums">{formatGw(l.base_total, 2)}</td>
                  <td className="text-right tabular-nums">{formatGw(l.comision_total, 2)}</td>
                  <td>{l.anulada ? 'Anulada' : 'Liquidada'}</td>
                  <td className="p-0!">
                    {!l.anulada && (
                      <button type="button" className="gw-btn h-[19px]! text-[11px]!" onClick={() => anular(l)}>
                        <Undo2 size={11} /> Anular
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {!historial.length && (
                <tr>
                  <td colSpan={9} className="py-2 text-center text-[#666]">
                    Todavía no hay liquidaciones.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </GwGroup>
      <div className="flex items-center gap-1.5">
        <span className="border border-[#d6a400] bg-[#fff6d5] px-2 py-[3px] text-[12px] text-[#6b5200]">
          Sin captura de GeminisWin: interpretado como liquidación de comisiones — confirmar con Luis
        </span>
        <span className="flex-1" />
        <button type="button" className="gw-btn w-[100px]" onClick={() => window.print()} disabled={!lineas?.length}>
          <Printer size={14} /> Imprimir
        </button>
        <button type="button" className="gw-btn w-[100px]" onClick={() => navigate('/')}>
          Salir
        </button>
      </div>
    </div>
  )
}
