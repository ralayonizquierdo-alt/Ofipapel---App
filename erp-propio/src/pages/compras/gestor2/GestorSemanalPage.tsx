// Gestor de Pedidos 2.0 (Rober, 17/11/2026): «que el ERP me proponga cada semana los pedidos a
// proveedores y yo vaya decidiendo si envío o aguanto un poco más».
//
// Pantalla nueva y aparte del Gestor de siempre (que es calco de GeminisWin y no se toca). Por debajo usa
// el mismo motor: mínimos y máximos de cada artículo (fn_compras_propuesta_pedidos, vía fn_compras2_*) y
// la misma función que crea el pedido (fn_compras_crear_pedido): el pedido nace «pendiente» y aparece
// también en el Gestor de siempre y en Pedidos a Proveedores.
//
// A propósito NO tiene el aspecto de ventana de GeminisWin: Rober la pidió sencilla, atractiva y moderna.
// OJO: propone con el stock y los mínimos que haya en el ERP. Hasta que el espejo de GeminisWin los traiga
// al día (docs/PLAN_ESPEJO_GEMINISWIN.md), lo que sale es de la muestra cargada, no para pedir de verdad.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AlarmClock, CircleHelp, PackageX, RefreshCw, Send, TrendingDown, Truck, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwOperativa, type BloqueOperativa } from '../../../components/gw/GwOperativa'

interface Resumen {
  proveedor_codigo: string
  proveedor_nombre: string | null
  articulos: number
  agotados: number
  unidades: number
  importe: number
  compra_minima: number | null
  dias_entrega: number | null
  ultimo_pedido: string | null
  mas_baratos_en_otro: number
  aplazado_hasta: string | null
  aplazado_motivo: string | null
}
interface Linea {
  articulo_codigo: string
  descripcion: string
  referencia_compra: string | null
  stock_actual: number
  pendiente_recibir: number
  stock_minimo: number
  stock_maximo: number
  cantidad_sugerida: number
  unidades_por_caja: number | null
  coste: number
  importe: number
  mejor_proveedor: string | null
  mejor_proveedor_nombre: string | null
  mejor_coste: number | null
}

const TIENDA = '01' // la misma que usa el Gestor de siempre
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'
const eur0 = (n: number) => Math.round(n).toLocaleString('de-DE') + ' €'
const uds = (n: number) => Number(n).toLocaleString('de-DE', { maximumFractionDigits: 2 })
const fecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')
const num = (v: unknown) => Number(v ?? 0)

const OPERATIVA: BloqueOperativa[] = [
  {
    titulo: 'Pedidos de la semana',
    pasos: [
      'Cada ficha es un proveedor con lo que el programa propone pedirle: los artículos que están en su stock mínimo o por debajo, en la cantidad que los lleva a su máximo.',
      'Arriba salen primero los que tienen artículos agotados. La barra dice si la propuesta llega al pedido mínimo del proveedor.',
      '«Revisar y enviar»: abre la propuesta. Quita lo que no quieras, cambia cantidades y pulsa «Crear pedido». El pedido nace pendiente, igual que los del Gestor de siempre.',
      '«Aguantar»: lo quita de la lista una o dos semanas. Cuando vuelve trae lo que se haya sumado.',
    ],
  },
  {
    titulo: 'Bueno es saber',
    notas: [
      'El aviso «más barato en…» compara el precio neto por unidad con el de los otros proveedores dados de alta en la ficha del artículo.',
      'El pedido creado se ve y se cambia en Compras › Pedidos a Proveedores y en el Gestor de Pedidos a Proveedores.',
      'Los mínimos y máximos se ponen en la ficha del artículo. Sin mínimo, el artículo no se propone.',
      'Las campañas (vuelta al cole, Navidad) no van por aquí: se piden comparando con el año anterior.',
    ],
  },
]

export function GestorSemanalPage() {
  const [datos, setDatos] = useState<Resumen[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [aviso, setAviso] = useState<{ texto: string; pedido?: boolean } | null>(null)
  const [vista, setVista] = useState<'decidir' | 'aplazados'>('decidir')
  const [abierto, setAbierto] = useState<Resumen | null>(null)
  const [ayuda, setAyuda] = useState(false)

  const cargar = useCallback(async () => {
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_compras2_resumen')
    if (e) return setError(e.message)
    setDatos(
      ((data ?? []) as Resumen[])
        .map((r) => ({ ...r, importe: num(r.importe), unidades: num(r.unidades), compra_minima: r.compra_minima == null ? null : num(r.compra_minima) }))
        .sort((a, b) => b.agotados - a.agotados || b.importe - a.importe),
    )
  }, [])
  useEffect(() => {
    void cargar()
  }, [cargar])

  const decidir = useMemo(() => (datos ?? []).filter((r) => !r.aplazado_hasta), [datos])
  const aplazados = useMemo(() => (datos ?? []).filter((r) => r.aplazado_hasta), [datos])
  const lista = vista === 'decidir' ? decidir : aplazados

  async function aplazar(r: Resumen, dias: number) {
    setError(null)
    const { error: e } = await supabase.rpc('fn_compras2_aplazar', { p_proveedor: r.proveedor_codigo, p_dias: dias, p_motivo: null })
    if (e) return setError(e.message)
    setAviso({ texto: dias ? `${r.proveedor_nombre ?? r.proveedor_codigo}: aguantas ${dias} días.` : `${r.proveedor_nombre ?? r.proveedor_codigo} vuelve a la lista.` })
    await cargar()
  }

  return (
    <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-4 p-3 text-[#1b2540]">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-[26px] font-bold leading-tight">Pedidos de la semana</h1>
          <p className="text-[14px] text-[#5b6680]">Lo que el programa propone pedir a cada proveedor, según el stock mínimo y máximo. Tú decides: enviar o aguantar.</p>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button type="button" onClick={() => void cargar()} className="flex h-9 items-center gap-1.5 rounded-full border border-[#d5dcec] bg-white px-3 text-[14px] hover:bg-[#f1f5fd]">
            <RefreshCw size={15} /> Actualizar
          </button>
          <button type="button" onClick={() => setAyuda(true)} className="flex h-9 items-center gap-1.5 rounded-full border border-[#d5dcec] bg-white px-3 text-[14px] hover:bg-[#f1f5fd]">
            <CircleHelp size={15} /> Operativa
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Dato titulo="Proveedores por decidir" valor={String(decidir.length)} />
        <Dato titulo="Importe propuesto" valor={eur0(decidir.reduce((s, r) => s + r.importe, 0))} />
        <Dato titulo="Artículos agotados" valor={String(decidir.reduce((s, r) => s + r.agotados, 0))} alerta />
        <Dato titulo="Aguantando" valor={String(aplazados.length)} />
      </section>

      <div className="flex flex-wrap items-center gap-2 print:hidden">
        <Pestana activa={vista === 'decidir'} onClick={() => setVista('decidir')}>
          Para decidir · {decidir.length}
        </Pestana>
        <Pestana activa={vista === 'aplazados'} onClick={() => setVista('aplazados')}>
          Aguantando · {aplazados.length}
        </Pestana>
        {error && (
          <span role="alert" className="text-[14px] font-bold text-[#c42b1c]">
            {error}
          </span>
        )}
        {aviso && (
          <span role="status" className="text-[14px] font-bold text-[#127a12]">
            {aviso.texto}{' '}
            {aviso.pedido && (
              <Link to="/gestor-pedidos-proveedor" className="underline">
                Verlo en el Gestor
              </Link>
            )}
          </span>
        )}
      </div>

      {datos === null && !error && <p className="text-[15px] text-[#5b6680]">Calculando las propuestas…</p>}
      {datos !== null && !lista.length && (
        <p className="rounded-2xl border border-dashed border-[#c9d3e8] bg-white p-8 text-center text-[15px] text-[#5b6680]">
          {vista === 'decidir' ? 'No hay nada que pedir: ningún artículo con mínimo está por debajo de él.' : 'No estás aguantando ningún proveedor.'}
        </p>
      )}

      <section className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {lista.map((r) => (
          <Ficha key={r.proveedor_codigo} r={r} onAbrir={() => setAbierto(r)} onAplazar={(d) => void aplazar(r, d)} />
        ))}
      </section>

      {abierto && (
        <Propuesta
          r={abierto}
          onCerrar={() => setAbierto(null)}
          onCreado={(texto) => {
            setAbierto(null)
            setAviso({ texto, pedido: true })
            void cargar()
          }}
        />
      )}
      {ayuda && (
        <Capa titulo="Operativa" onCerrar={() => setAyuda(false)} ancho="max-w-[820px]">
          <GwOperativa bloques={OPERATIVA} />
        </Capa>
      )}
    </div>
  )
}

function Dato({ titulo, valor, alerta }: { titulo: string; valor: string; alerta?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#e1e7f3] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(20,40,90,0.06)]">
      <div className="text-[13px] text-[#5b6680]">{titulo}</div>
      <div className={`text-[24px] font-bold tabular-nums ${alerta && valor !== '0' ? 'text-[#c42b1c]' : ''}`}>{valor}</div>
    </div>
  )
}

function Pestana({ activa, onClick, children }: { activa: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={activa} className={`h-9 rounded-full px-4 text-[14px] font-semibold ${activa ? 'bg-[#1d3a8a] text-white' : 'border border-[#d5dcec] bg-white text-[#1b2540] hover:bg-[#f1f5fd]'}`}>
      {children}
    </button>
  )
}

function Ficha({ r, onAbrir, onAplazar }: { r: Resumen; onAbrir: () => void; onAplazar: (dias: number) => void }) {
  const [menu, setMenu] = useState(false)
  const minimo = r.compra_minima && r.compra_minima > 0 ? r.compra_minima : null
  const llega = minimo == null || r.importe >= minimo
  const pct = minimo ? Math.min(100, Math.round((r.importe / minimo) * 100)) : 100
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-[#e1e7f3] bg-white p-4 shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-[17px] font-bold" title={r.proveedor_nombre ?? ''}>
            {r.proveedor_nombre ?? '(sin nombre)'}
          </h2>
          <div className="text-[12px] text-[#7a849c]">
            {r.proveedor_codigo}
            {r.ultimo_pedido ? ` · último pedido ${fecha(r.ultimo_pedido)}` : ''}
          </div>
        </div>
        <div className="shrink-0 text-right text-[22px] font-bold tabular-nums">{eur0(r.importe)}</div>
      </div>

      <div className="flex flex-wrap gap-1.5 text-[13px]">
        <Chip>{r.articulos} {r.articulos === 1 ? 'artículo' : 'artículos'}</Chip>
        {r.agotados > 0 && (
          <Chip color="rojo">
            <PackageX size={13} /> {r.agotados} sin stock
          </Chip>
        )}
        {r.mas_baratos_en_otro > 0 && (
          <Chip color="ambar">
            <TrendingDown size={13} /> {r.mas_baratos_en_otro} más {r.mas_baratos_en_otro === 1 ? 'barato' : 'baratos'} en otro
          </Chip>
        )}
        {r.dias_entrega ? (
          <Chip>
            <Truck size={13} /> {r.dias_entrega} días
          </Chip>
        ) : null}
      </div>

      <div>
        <div className="h-2 overflow-hidden rounded-full bg-[#e9eef8]">
          <div className={`h-full rounded-full ${llega ? 'bg-[#1f9d55]' : 'bg-[#e0a100]'}`} style={{ width: `${pct}%` }} />
        </div>
        <div className={`mt-1 text-[13px] font-semibold ${llega ? 'text-[#127a12]' : 'text-[#8a5a00]'}`}>
          {minimo == null ? 'Sin pedido mínimo en la ficha del proveedor' : llega ? `Llega al pedido mínimo (${eur0(minimo)})` : `Faltan ${eur0(minimo - r.importe)} para el mínimo (${eur0(minimo)})`}
        </div>
      </div>

      {r.aplazado_hasta ? (
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] text-[#5b6680]">Aguantando hasta el {fecha(r.aplazado_hasta)}</span>
          <button type="button" onClick={() => onAplazar(0)} className="h-9 rounded-full border border-[#d5dcec] px-4 text-[14px] font-semibold hover:bg-[#f1f5fd]">
            Volver a decidir
          </button>
        </div>
      ) : (
        <div className="relative flex gap-2">
          <button type="button" onClick={onAbrir} className="flex h-10 flex-1 items-center justify-center gap-1.5 rounded-full bg-[#1d3a8a] text-[15px] font-semibold text-white hover:bg-[#16306f]">
            <Send size={15} /> Revisar y enviar
          </button>
          <button type="button" onClick={() => setMenu(!menu)} aria-expanded={menu} className="flex h-10 items-center justify-center gap-1.5 rounded-full border border-[#d5dcec] px-4 text-[15px] font-semibold hover:bg-[#f1f5fd]">
            <AlarmClock size={15} /> Aguantar
          </button>
          {menu && (
            <div className="absolute bottom-11 right-0 z-10 flex flex-col overflow-hidden rounded-xl border border-[#d5dcec] bg-white text-[14px] shadow-lg">
              {[7, 14, 30].map((d) => (
                <button key={d} type="button" className="px-4 py-2 text-left hover:bg-[#f1f5fd]" onClick={() => (setMenu(false), onAplazar(d))}>
                  {d === 7 ? 'Una semana' : d === 14 ? 'Dos semanas' : 'Un mes'}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  )
}

function Chip({ children, color }: { children: React.ReactNode; color?: 'rojo' | 'ambar' }) {
  const c = color === 'rojo' ? 'bg-[#fdecea] text-[#b3261e]' : color === 'ambar' ? 'bg-[#fff4d6] text-[#7a5200]' : 'bg-[#eef2fb] text-[#33415f]'
  return <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-semibold ${c}`}>{children}</span>
}

function Capa({ titulo, onCerrar, children, ancho = 'max-w-[1100px]' }: { titulo: string; onCerrar: () => void; children: React.ReactNode; ancho?: string }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-[#0b1530]/40 p-3 md:p-8" onKeyDown={(e) => e.key === 'Escape' && onCerrar()}>
      <div role="dialog" aria-label={titulo} className={`w-full ${ancho} rounded-2xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between gap-2 border-b border-[#e1e7f3] px-5 py-3">
          <h2 className="truncate text-[19px] font-bold">{titulo}</h2>
          <button type="button" aria-label="Cerrar" onClick={onCerrar} className="flex h-9 w-9 items-center justify-center rounded-full hover:bg-[#f1f5fd]">
            <X size={18} />
          </button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  )
}

/** La propuesta de un proveedor: se quita lo que no se quiera, se cambian cantidades y se crea el pedido. */
function Propuesta({ r, onCerrar, onCreado }: { r: Resumen; onCerrar: () => void; onCreado: (texto: string) => void }) {
  const [lineas, setLineas] = useState<Linea[] | null>(null)
  const [cant, setCant] = useState<Record<string, number>>({})
  const [fuera, setFuera] = useState<Set<string>>(new Set())
  const [error, setError] = useState<string | null>(null)
  const [creando, setCreando] = useState(false)

  useEffect(() => {
    supabase.rpc('fn_compras2_lineas', { p_proveedor: r.proveedor_codigo }).then(({ data, error: e }) => {
      if (e) return setError(e.message)
      const ls = ((data ?? []) as Linea[]).map((l) => ({ ...l, stock_actual: num(l.stock_actual), pendiente_recibir: num(l.pendiente_recibir), stock_minimo: num(l.stock_minimo), stock_maximo: num(l.stock_maximo), cantidad_sugerida: num(l.cantidad_sugerida), coste: num(l.coste), importe: num(l.importe), mejor_coste: l.mejor_coste == null ? null : num(l.mejor_coste) }))
      ls.sort((a, b) => a.stock_actual - b.stock_actual || a.descripcion.localeCompare(b.descripcion))
      setLineas(ls)
      setCant(Object.fromEntries(ls.map((l) => [l.articulo_codigo, l.cantidad_sugerida])))
    })
  }, [r.proveedor_codigo])

  const elegidas = (lineas ?? []).filter((l) => !fuera.has(l.articulo_codigo) && (cant[l.articulo_codigo] ?? 0) > 0)
  const total = elegidas.reduce((s, l) => s + (cant[l.articulo_codigo] ?? 0) * l.coste, 0)
  const minimo = r.compra_minima && r.compra_minima > 0 ? r.compra_minima : null

  async function crear() {
    setError(null)
    if (!elegidas.length) return setError('No hay ninguna línea marcada.')
    setCreando(true)
    const { data, error: e } = await supabase.rpc('fn_compras_crear_pedido', {
      p_proveedor: r.proveedor_codigo,
      p_lineas: elegidas.map((l) => ({ articulo: l.articulo_codigo, cantidad: cant[l.articulo_codigo] })),
      p_almacen: null,
      p_observaciones: 'Propuesta semanal por mínimos y máximos (Gestor de Pedidos 2.0): revisar antes de confirmar',
      p_tienda: TIENDA,
    })
    setCreando(false)
    if (e) return setError(e.message)
    const d = data as { numero: number; lineas: number; total: number }
    onCreado(`Pedido ${d.numero} creado para ${r.proveedor_nombre ?? r.proveedor_codigo}: ${d.lineas} líneas, ${eur(num(d.total))}. Queda pendiente.`)
  }

  return (
    <Capa titulo={`${r.proveedor_nombre ?? r.proveedor_codigo} · propuesta de pedido`} onCerrar={onCerrar}>
      {!lineas && !error && <p className="text-[15px] text-[#5b6680]">Cargando la propuesta…</p>}
      {lineas && (
        <div className="max-h-[58vh] overflow-auto rounded-xl border border-[#e1e7f3]">
          <table className="w-full border-collapse text-[14px]">
            <thead className="sticky top-0 z-10 bg-[#f4f7fc] text-left text-[12px] uppercase tracking-wide text-[#5b6680]">
              <tr>
                <th className="w-9 px-2 py-2" />
                <th className="px-2 py-2">Artículo</th>
                <th className="w-[190px] px-2 py-2">Stock · mín · máx</th>
                <th className="w-[100px] px-2 py-2 text-right">Pedir</th>
                <th className="w-[90px] px-2 py-2 text-right">Precio</th>
                <th className="w-[100px] px-2 py-2 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {lineas.map((l) => {
                const quitada = fuera.has(l.articulo_codigo)
                const c = cant[l.articulo_codigo] ?? 0
                const tope = Math.max(l.stock_maximo, l.stock_actual, 1)
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
                      </div>
                      {l.mejor_proveedor && l.mejor_coste != null && (
                        <div className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-[#fff4d6] px-2 py-0.5 text-[12px] font-semibold text-[#7a5200]">
                          <TrendingDown size={12} /> Más barato en {l.mejor_proveedor_nombre ?? l.mejor_proveedor}: {eur(l.mejor_coste)} ({Math.round((1 - l.mejor_coste / l.coste) * 100)} % menos)
                        </div>
                      )}
                    </td>
                    <td className="px-2 py-2">
                      <div className="relative h-2 rounded-full bg-[#e9eef8]">
                        <div className={`absolute inset-y-0 left-0 rounded-full ${l.stock_actual <= 0 ? 'bg-[#c42b1c]' : 'bg-[#e0a100]'}`} style={{ width: `${Math.max(0, Math.min(100, (l.stock_actual / tope) * 100))}%` }} />
                        <div className="absolute -top-0.5 h-3 w-0.5 bg-[#33415f]" style={{ left: `${Math.min(100, (l.stock_minimo / tope) * 100)}%` }} title="Mínimo" />
                      </div>
                      <div className="mt-1 text-[12px] tabular-nums text-[#5b6680]">
                        <b className={l.stock_actual <= 0 ? 'text-[#c42b1c]' : 'text-[#1b2540]'}>{uds(l.stock_actual)}</b> · {uds(l.stock_minimo)} · {uds(l.stock_maximo)}
                        {l.pendiente_recibir > 0 ? ` · +${uds(l.pendiente_recibir)} en camino` : ''}
                      </div>
                    </td>
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
        <div>
          <div className="text-[13px] text-[#5b6680]">
            {elegidas.length} {elegidas.length === 1 ? 'línea' : 'líneas'} · sin IGIC
          </div>
          <div className="text-[24px] font-bold tabular-nums">{eur(total)}</div>
          {minimo != null && <div className={`text-[13px] font-semibold ${total >= minimo ? 'text-[#127a12]' : 'text-[#8a5a00]'}`}>{total >= minimo ? `Llega al pedido mínimo (${eur0(minimo)})` : `Faltan ${eur0(minimo - total)} para el pedido mínimo`}</div>}
          {error && (
            <div role="alert" className="text-[14px] font-bold text-[#c42b1c]">
              {error}
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={onCerrar} className="h-10 rounded-full border border-[#d5dcec] px-5 text-[15px] font-semibold hover:bg-[#f1f5fd]">
            Cancelar
          </button>
          <button type="button" onClick={() => void crear()} disabled={creando || !elegidas.length} className="flex h-10 items-center gap-1.5 rounded-full bg-[#1d3a8a] px-5 text-[15px] font-semibold text-white hover:bg-[#16306f] disabled:opacity-50">
            <Send size={15} /> {creando ? 'Creando…' : 'Crear pedido'}
          </button>
        </div>
      </div>
    </Capa>
  )
}
