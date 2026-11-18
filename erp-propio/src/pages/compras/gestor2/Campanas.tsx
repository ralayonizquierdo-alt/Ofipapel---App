// Gestor de Pedidos 2.0 → Campañas (vuelta al cole y similares), 18/11/2026.
//
// Como las hace Rober: lo vendido el año pasado en esas fechas «y un poquito más». El ERP lo calcula artículo a
// artículo (fn_compras_campana_proveedores / fn_compras_campana_propuesta, migración 20261118_compras_campanas.sql):
// vendido en los meses elegidos + %, menos stock y lo que está en camino, a cajas completas. Cada proveedor se revisa
// y se convierte en un pedido pendiente con la misma función que la propuesta semanal (fn_compras_crear_pedido), con
// su Excel para GeminisWin.

import { useEffect, useMemo, useState } from 'react'
import { FileSpreadsheet, Send, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { descargarExcelGw } from '../../../lib/excelGeminiswin'

const TIENDA = '01'
const num = (v: unknown) => Number(v ?? 0)
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const eur0 = (n: number) => Math.round(n).toLocaleString('de-DE') + ' €'
const uds = (n: number) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 })

interface ProvCampana {
  proveedor_codigo: string
  proveedor_nombre: string | null
  articulos: number
  unidades: number
  importe: number
  vendido_importe: number
  compra_minima: number | null
  portes_gratis_desde: number | null
  dias_entrega: number | null
}
interface LineaCampana {
  articulo_codigo: string
  descripcion: string
  referencia_compra: string | null
  vendido: number
  objetivo: number
  stock_actual: number
  pendiente_recibir: number
  cantidad_sugerida: number
  unidades_por_caja: number | null
  coste: number
  importe: number
  venta_mes: number | null
}

/** Meses por defecto: agosto y septiembre del último año que ya tiene ventas de septiembre. */
function periodoPorDefecto() {
  const hoy = new Date()
  const año = hoy.getMonth() >= 9 ? hoy.getFullYear() : hoy.getFullYear() - 1
  return { desde: `${año}-08`, hasta: `${año}-09` }
}
const nombreMes = (ym: string) => {
  const [a, m] = ym.split('-').map(Number)
  return new Date(a, m - 1, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
}
const finDeMes = (ym: string) => {
  const [a, m] = ym.split('-').map(Number)
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
}

export function Campanas() {
  const def = periodoPorDefecto()
  const [desde, setDesde] = useState(def.desde)
  const [hasta, setHasta] = useState(def.hasta)
  const [pct, setPct] = useState(10)
  const [familia, setFamilia] = useState('')
  const [nombre, setNombre] = useState('Vuelta al cole')
  const [datos, setDatos] = useState<ProvCampana[] | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState<ProvCampana | null>(null)
  const [hechos, setHechos] = useState<Record<string, number>>({})
  const [aviso, setAviso] = useState<{ texto: string; pedido?: number; error?: boolean } | null>(null)

  const params = useMemo(() => ({ p_desde: `${desde}-01`, p_hasta: finDeMes(hasta), p_pct: pct, p_familia: familia.trim() || null }), [desde, hasta, pct, familia])

  async function calcular() {
    setError(null)
    setAviso(null)
    if (!desde || !hasta || desde > hasta) return setError('Elige bien los meses: «desde» no puede ir después de «hasta».')
    setCargando(true)
    const { data, error: e } = await supabase.rpc('fn_compras_campana_proveedores', params)
    setCargando(false)
    if (e) return setError(e.message)
    setDatos(
      ((data ?? []) as ProvCampana[])
        .map((r) => ({ ...r, importe: num(r.importe), unidades: num(r.unidades), vendido_importe: num(r.vendido_importe), compra_minima: r.compra_minima == null ? null : num(r.compra_minima), portes_gratis_desde: r.portes_gratis_desde == null ? null : num(r.portes_gratis_desde) }))
        .sort((a, b) => b.importe - a.importe),
    )
  }

  async function excel(numero: number) {
    const e = await descargarExcelGw(TIENDA, numero)
    if (e) setAviso({ texto: e, pedido: numero, error: true })
  }

  const pendientes = (datos ?? []).filter((r) => hechos[r.proveedor_codigo] == null)
  const total = pendientes.reduce((s, r) => s + r.importe, 0)

  return (
    <section className="flex flex-col gap-4">
      <div className="rounded-2xl border border-[#e1e7f3] bg-white p-4 shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
        <p className="mb-3 text-[14px] text-[#5b6680]">
          Lo vendido el año pasado en esas fechas, más un poco, menos lo que ya tienes en stock y lo que está en camino. A cajas completas. Sin el papel de oferta ni los consumibles de informática, que van aparte.
        </p>
        <div className="flex flex-wrap items-end gap-3 text-[14px]">
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-[#33415f]">Campaña</span>
            <input value={nombre} onChange={(e) => setNombre(e.target.value)} className="h-9 w-[180px] rounded-lg border border-[#c9d3e8] px-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-[#33415f]">Ventas desde</span>
            <input type="month" value={desde} onChange={(e) => setDesde(e.target.value)} className="h-9 rounded-lg border border-[#c9d3e8] px-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-[#33415f]">hasta</span>
            <input type="month" value={hasta} onChange={(e) => setHasta(e.target.value)} className="h-9 rounded-lg border border-[#c9d3e8] px-2" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-[#33415f]">Un poco más (%)</span>
            <input type="number" min={-50} max={200} value={pct} onChange={(e) => setPct(Number(e.target.value) || 0)} className="h-9 w-[90px] rounded-lg border border-[#c9d3e8] px-2 text-right" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-semibold text-[#33415f]">Familia (opcional)</span>
            <input value={familia} onChange={(e) => setFamilia(e.target.value)} placeholder="p. ej. 20" title="Código de familia o su principio: 20 coge todas las que empiezan por 20" className="h-9 w-[120px] rounded-lg border border-[#c9d3e8] px-2" />
          </label>
          <button type="button" onClick={() => void calcular()} disabled={cargando} className="h-9 rounded-full bg-[#1d3a8a] px-5 font-semibold text-white hover:bg-[#16306f] disabled:opacity-50">
            {cargando ? 'Calculando…' : 'Calcular'}
          </button>
        </div>
        {error && (
          <p role="alert" className="mt-2 text-[14px] font-bold text-[#c42b1c]">
            {error}
          </p>
        )}
      </div>

      {aviso && (
        <p role="status" className={`text-[14px] font-bold ${aviso.error ? 'text-[#b42318]' : 'text-[#127a12]'}`}>
          {aviso.texto}{' '}
          {aviso.pedido != null && (
            <button type="button" onClick={() => void excel(aviso.pedido!)} className="inline-flex items-center gap-1 underline">
              <FileSpreadsheet size={14} /> Excel para GeminisWin
            </button>
          )}
        </p>
      )}

      {datos && (
        <div className="rounded-2xl border border-[#e1e7f3] bg-white shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
          <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#e1e7f3] px-4 py-3">
            <h2 className="text-[17px] font-bold">
              {nombre || 'Campaña'}: ventas de {nombreMes(desde)} a {nombreMes(hasta)} + {pct} %
            </h2>
            <span className="text-[14px] text-[#5b6680]">
              {pendientes.length} {pendientes.length === 1 ? 'proveedor' : 'proveedores'} por pedir · <b className="text-[#1b2540]">{eur0(total)}</b>
            </span>
          </div>
          {!datos.length && <p className="px-4 py-3 text-[14px] text-[#5b6680]">No sale nada que pedir con esas fechas.</p>}
          <div className="max-h-[60vh] overflow-auto">
            <table className="w-full border-collapse text-[14px]">
              <thead className="sticky top-0 bg-[#f4f7fc] text-left text-[12px] uppercase tracking-wide text-[#5b6680]">
                <tr>
                  <th className="px-3 py-2">Proveedor</th>
                  <th className="px-3 py-2 text-right">Artículos</th>
                  <th className="px-3 py-2 text-right" title="Lo vendido en esos meses del año pasado, a precio de coste">Vendido año pasado</th>
                  <th className="px-3 py-2 text-right">A pedir</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {datos.map((r) => (
                  <tr key={r.proveedor_codigo} className="border-t border-[#eef2f8]">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{r.proveedor_nombre ?? r.proveedor_codigo}</div>
                      <div className="text-[12px] text-[#7a849c]">
                        {r.proveedor_codigo}
                        {r.dias_entrega ? ` · ${r.dias_entrega} días` : ''}
                        {r.compra_minima ? ` · mínimo ${eur0(r.compra_minima)}` : ''}
                        {r.portes_gratis_desde ? ` · portes gratis desde ${eur0(r.portes_gratis_desde)}` : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.articulos}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-[#5b6680]">{eur0(r.vendido_importe)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{eur0(r.importe)}</td>
                    <td className="px-3 py-2 text-right">
                      {hechos[r.proveedor_codigo] != null ? (
                        <span className="text-[13px] font-semibold text-[#127a12]">Pedido {hechos[r.proveedor_codigo]}</span>
                      ) : (
                        <button type="button" onClick={() => setAbierto(r)} className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1d3a8a] px-3 text-[13px] font-semibold text-white hover:bg-[#16306f]">
                          <Send size={13} /> Revisar
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {abierto && (
        <RevisarCampana
          r={abierto}
          params={params}
          campana={`${nombre || 'Campaña'} (ventas ${desde} a ${hasta} + ${pct} %)`}
          onCerrar={() => setAbierto(null)}
          onCreado={(numero, texto) => {
            setHechos({ ...hechos, [abierto.proveedor_codigo]: numero })
            setAbierto(null)
            setAviso({ texto, pedido: numero })
          }}
        />
      )}
    </section>
  )
}

function RevisarCampana({
  r,
  params,
  campana,
  onCerrar,
  onCreado,
}: {
  r: ProvCampana
  params: { p_desde: string; p_hasta: string; p_pct: number; p_familia: string | null }
  campana: string
  onCerrar: () => void
  onCreado: (numero: number, texto: string) => void
}) {
  const [lineas, setLineas] = useState<LineaCampana[] | null>(null)
  const [cant, setCant] = useState<Record<string, number>>({})
  const [fuera, setFuera] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    supabase.rpc('fn_compras_campana_propuesta', { ...params, p_proveedor: r.proveedor_codigo }).then(({ data, error: e }) => {
      if (e) return setError(e.message)
      const ls = ((data ?? []) as LineaCampana[])
        .map((l) => ({ ...l, vendido: num(l.vendido), objetivo: num(l.objetivo), stock_actual: num(l.stock_actual), pendiente_recibir: num(l.pendiente_recibir), cantidad_sugerida: num(l.cantidad_sugerida), coste: num(l.coste), importe: num(l.importe), unidades_por_caja: l.unidades_por_caja == null ? null : num(l.unidades_por_caja) }))
        .sort((a, b) => b.importe - a.importe)
      setLineas(ls)
      setCant(Object.fromEntries(ls.map((l) => [l.articulo_codigo, l.cantidad_sugerida])))
    })
  }, [r.proveedor_codigo, params])

  const elegidas = (lineas ?? []).filter((l) => !fuera.has(l.articulo_codigo) && (cant[l.articulo_codigo] ?? 0) > 0)
  const total = elegidas.reduce((s, l) => s + (cant[l.articulo_codigo] ?? 0) * l.coste, 0)

  async function crear() {
    setError(null)
    if (!elegidas.length) return setError('No hay ninguna línea marcada.')
    setCreando(true)
    const { data, error: e } = await supabase.rpc('fn_compras_crear_pedido', {
      p_proveedor: r.proveedor_codigo,
      p_lineas: elegidas.map((l) => ({ articulo: l.articulo_codigo, cantidad: cant[l.articulo_codigo] })),
      p_almacen: null,
      p_observaciones: `Campaña: ${campana}. Gestor de Pedidos 2.0: revisar antes de confirmar`,
      p_tienda: TIENDA,
    })
    setCreando(false)
    if (e) return setError(e.message)
    const d = data as { numero: number; lineas: number; total: number }
    onCreado(d.numero, `Pedido ${d.numero} de campaña creado para ${r.proveedor_nombre ?? r.proveedor_codigo}: ${d.lineas} líneas, ${eur(num(d.total))}. Queda pendiente.`)
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-[#0b1530]/40 p-3 md:p-8" onKeyDown={(e) => e.key === 'Escape' && onCerrar()}>
      <div role="dialog" aria-label={`Campaña ${r.proveedor_nombre ?? r.proveedor_codigo}`} className="w-full max-w-[1100px] rounded-2xl bg-white shadow-2xl">
        <div className="flex items-center justify-between gap-2 border-b border-[#e1e7f3] px-5 py-3">
          <h2 className="truncate text-[19px] font-bold">{r.proveedor_nombre ?? r.proveedor_codigo} · campaña</h2>
          <button type="button" onClick={onCerrar} aria-label="Cerrar" className="rounded-full p-1.5 hover:bg-[#f1f5fd]">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">
          {!lineas && !error && <p className="text-[15px] text-[#5b6680]">Cargando…</p>}
          {lineas && (
            <div className="max-h-[58vh] overflow-auto rounded-xl border border-[#e1e7f3]">
              <table className="w-full border-collapse text-[14px]">
                <thead className="sticky top-0 z-10 bg-[#f4f7fc] text-left text-[12px] uppercase tracking-wide text-[#5b6680]">
                  <tr>
                    <th className="w-9 px-2 py-2" />
                    <th className="px-2 py-2">Artículo</th>
                    <th className="px-2 py-2 text-right" title="Unidades vendidas en esos meses del año pasado">Vendió</th>
                    <th className="px-2 py-2 text-right">Stock</th>
                    <th className="px-2 py-2 text-right">En camino</th>
                    <th className="w-[100px] px-2 py-2 text-right">Pedir</th>
                    <th className="w-[90px] px-2 py-2 text-right">Precio</th>
                    <th className="w-[100px] px-2 py-2 text-right">Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {lineas.map((l) => {
                    const quitada = fuera.has(l.articulo_codigo)
                    const c = cant[l.articulo_codigo] ?? 0
                    return (
                      <tr key={l.articulo_codigo} className={`border-t border-[#eef2f8] ${quitada ? 'opacity-45' : ''}`}>
                        <td className="px-2 py-2 text-center">
                          <input
                            type="checkbox"
                            className="h-4 w-4"
                            checked={!quitada}
                            aria-label={`Incluir ${l.descripcion}`}
                            onChange={() => {
                              const s = new Set(fuera)
                              if (quitada) s.delete(l.articulo_codigo)
                              else s.add(l.articulo_codigo)
                              setFuera(s)
                            }}
                          />
                        </td>
                        <td className="px-2 py-2">
                          <div className="font-semibold">{l.descripcion}</div>
                          <div className="text-[12px] text-[#7a849c]">
                            {l.articulo_codigo}
                            {l.referencia_compra ? ` · ref. ${l.referencia_compra}` : ''}
                            {l.unidades_por_caja && l.unidades_por_caja > 1 ? ` · caja de ${uds(l.unidades_por_caja)}` : ''}
                            {l.venta_mes ? ` · el resto del año ~${uds(l.venta_mes)}/mes` : ''}
                          </div>
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{uds(l.vendido)}</td>
                        <td className={`px-2 py-2 text-right tabular-nums ${l.stock_actual < 0 ? 'text-[#c42b1c]' : ''}`}>{uds(l.stock_actual)}</td>
                        <td className="px-2 py-2 text-right tabular-nums">{l.pendiente_recibir ? uds(l.pendiente_recibir) : ''}</td>
                        <td className="px-2 py-2 text-right">
                          <input
                            type="number"
                            min={0}
                            step="any"
                            disabled={quitada}
                            aria-label={`Cantidad de ${l.descripcion}`}
                            className="h-8 w-[84px] rounded-lg border border-[#c9d3e8] px-2 text-right tabular-nums"
                            value={c}
                            onChange={(e) => setCant({ ...cant, [l.articulo_codigo]: Math.max(0, Number(e.target.value) || 0) })}
                          />
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums">{l.coste ? eur(l.coste) : <span className="text-[#c42b1c]">sin precio</span>}</td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums">{quitada ? '' : eur(c * l.coste)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
            <div className="text-[15px]">
              {elegidas.length} líneas · <b>{eur(total)}</b>
              {r.compra_minima && total < r.compra_minima ? <span className="ml-2 text-[#8a5a00]">No llega al pedido mínimo ({eur0(r.compra_minima)})</span> : null}
            </div>
            {error && (
              <span role="alert" className="text-[14px] font-bold text-[#c42b1c]">
                {error}
              </span>
            )}
            <button type="button" onClick={() => void crear()} disabled={creando || !elegidas.length} className="flex h-10 items-center gap-1.5 rounded-full bg-[#1d3a8a] px-5 text-[15px] font-semibold text-white hover:bg-[#16306f] disabled:opacity-50">
              <Send size={15} /> {creando ? 'Creando…' : 'Crear pedido'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
