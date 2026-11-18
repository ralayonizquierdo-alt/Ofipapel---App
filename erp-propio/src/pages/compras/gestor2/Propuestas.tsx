// Gestor de Pedidos 2.0 → Propuestas de proveedor, 18/11/2026 (migración 20261119_compras_propuestas_proveedor.sql y
// función propuesta-proveedor-ia).
//
// Enviamos el pedido → el proveedor manda su propuesta en PDF → aquí se sube, la IA la lee y el ERP la compara línea
// a línea con el pedido (precio neto, cantidad, lo que falta, sin stock, sustitutos, lo que añaden) → se decide cada
// diferencia (aceptar o reparo) → sale al proveedor un correo de confirmación o de reparos (cola de correo de
// siempre, buzón de compras). No cambia el pedido: lo aceptado distinto se corrige en la ficha.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { FileText, Send, Upload } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { leerConLector, type LecturaLector } from '../../../lib/lectorPdf'

const num = (v: unknown) => (v == null ? null : Number(v))
const eur = (n: number | null) => (n == null ? '—' : n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' €')
const eur0 = (n: number | null) => (n == null ? '—' : Math.round(n).toLocaleString('de-DE') + ' €')
const uds = (n: number | null) => (n == null ? '—' : n.toLocaleString('de-DE', { maximumFractionDigits: 2 }))
const fecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')

interface PedidoAbierto {
  tienda: string
  numero: number
  fecha: string
  proveedor_codigo: string
  proveedor_nombre: string | null
  proveedor_email: string | null
  estado: string
  lineas: number
  total: number | null
  propuestas: number
  ultima_propuesta: string | null
}
type Tipo = 'igual' | 'precio' | 'cantidad' | 'precio_cantidad' | 'sin_stock' | 'sustituto' | 'falta' | 'no_pedido'
interface LineaComp {
  linea_pedido: number | null
  articulo_codigo: string | null
  descripcion_pedido: string | null
  referencia: string | null
  ean: string | null
  descripcion: string
  cant_pedida: number | null
  cant_propuesta: number | null
  neto_pedido: number | null
  neto_propuesto: number | null
  diferencia_pct: number | null
  tipo: Tipo
  nota: string | null
  confianza: 'alta' | 'media' | 'baja'
  decision: 'aceptar' | 'reparo' | null
  reparo: string | null
}
interface Propuesta {
  id: number
  pedido_tienda: string
  pedido_numero: number
  proveedor_nombre: string | null
  archivo: string | null
  documento_numero: string | null
  documento_fecha: string | null
  total_propuesta: number | null
  total_pedido: number | null
  lineas: LineaComp[]
  avisos: string[]
  resumen: { portes?: number | null; plazo_entrega?: string | null }
  estado: 'revisando' | 'confirmada' | 'con_reparos' | 'anulada'
  respuesta_para: string | null
  respuesta_texto: string | null
  respondida_en: string | null
  respondida_por: string | null
  creada_en: string
  correo_enviado_en: string | null
  correo_error: string | null
}

const TIPOS: Record<Tipo, { t: string; c: string }> = {
  igual: { t: 'Igual', c: 'bg-[#e6f4ea] text-[#127a12]' },
  precio: { t: 'Precio distinto', c: 'bg-[#fdecea] text-[#b3261e]' },
  cantidad: { t: 'Cantidad distinta', c: 'bg-[#fff4d6] text-[#7a5200]' },
  precio_cantidad: { t: 'Precio y cantidad', c: 'bg-[#fdecea] text-[#b3261e]' },
  sin_stock: { t: 'Sin stock', c: 'bg-[#fff4d6] text-[#7a5200]' },
  sustituto: { t: 'Sustituto', c: 'bg-[#efe6fb] text-[#5b2a9e]' },
  falta: { t: 'No aparece', c: 'bg-[#fdecea] text-[#b3261e]' },
  no_pedido: { t: 'No pedido', c: 'bg-[#eef2fb] text-[#33415f]' },
}
const ESTADOS: Record<Propuesta['estado'], string> = { revisando: 'Por contestar', confirmada: 'Confirmada', con_reparos: 'Con reparos', anulada: 'Anulada' }

/** Texto del reparo que se propone para cada diferencia (se puede cambiar). */
function reparoPorDefecto(l: LineaComp): string {
  switch (l.tipo) {
    case 'precio':
      return `precio ${eur(l.neto_propuesto)} en vez de ${eur(l.neto_pedido)} pactado`
    case 'cantidad':
      return `sirven ${uds(l.cant_propuesta)} uds. en vez de ${uds(l.cant_pedida)}`
    case 'precio_cantidad':
      return `precio ${eur(l.neto_propuesto)} en vez de ${eur(l.neto_pedido)} y ${uds(l.cant_propuesta)} uds. en vez de ${uds(l.cant_pedida)}`
    case 'sin_stock':
      return 'indican que no hay stock: ¿cuándo lo tendrán?'
    case 'sustituto':
      return 'ofrecen otro artículo: necesitamos el que pedimos'
    case 'falta':
      return 'no aparece en su propuesta'
    case 'no_pedido':
      return 'no está en nuestro pedido: no lo sirvan'
    default:
      return ''
  }
}

function textoRespuesta(p: Propuesta, lineas: LineaComp[]) {
  const doc = p.documento_numero ? `nº ${p.documento_numero} ` : ''
  const reparos = lineas.filter((l) => l.decision === 'reparo')
  if (!reparos.length) {
    return {
      tipo: 'confirmar' as const,
      asunto: `Confirmación del pedido ${p.pedido_numero} · Ofipapel`,
      texto: `Buenos días:\n\nConfirmamos su propuesta ${doc}para nuestro pedido nº ${p.pedido_numero}. Pueden servirlo tal cual.\n\nUn saludo,\nCompras · Ofipapel`,
    }
  }
  const filas = reparos.map((l) => `- ${[l.referencia, l.descripcion_pedido ?? l.descripcion].filter(Boolean).join(' · ')}: ${l.reparo || reparoPorDefecto(l)}`).join('\n')
  return {
    tipo: 'reparos' as const,
    asunto: `Pedido ${p.pedido_numero}: revisión de su propuesta · Ofipapel`,
    texto: `Buenos días:\n\nHemos revisado su propuesta ${doc}para nuestro pedido nº ${p.pedido_numero}. Antes de confirmarla, necesitamos que revisen lo siguiente:\n\n${filas}\n\nEl resto de líneas está conforme. Quedamos a la espera de su respuesta.\n\nUn saludo,\nCompras · Ofipapel`,
  }
}

function aBase64(archivo: File): Promise<string> {
  return new Promise((ok, mal) => {
    const lector = new FileReader()
    lector.onload = () => ok(String(lector.result).split(',')[1] ?? '')
    lector.onerror = () => mal(new Error('No se ha podido leer el archivo.'))
    lector.readAsDataURL(archivo)
  })
}

const normalizarPropuesta = (p: Propuesta): Propuesta => ({
  ...p,
  total_propuesta: num(p.total_propuesta),
  total_pedido: num(p.total_pedido),
  lineas: (p.lineas ?? []).map((l) => ({ ...l, cant_pedida: num(l.cant_pedida), cant_propuesta: num(l.cant_propuesta), neto_pedido: num(l.neto_pedido), neto_propuesto: num(l.neto_propuesto), diferencia_pct: num(l.diferencia_pct) })),
  avisos: p.avisos ?? [],
  resumen: p.resumen ?? {},
})

export function Propuestas({ pedidoInicial }: { pedidoInicial?: { tienda: string; numero: number } | null }) {
  const [pedidos, setPedidos] = useState<PedidoAbierto[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [sel, setSel] = useState<PedidoAbierto | null>(null)
  const [filtro, setFiltro] = useState('')

  const cargar = useCallback(async () => {
    const { data, error: e } = await supabase.rpc('fn_compras_pedidos_para_propuesta')
    if (e) return setError(e.message)
    const ps = ((data ?? []) as PedidoAbierto[]).map((p) => ({ ...p, total: num(p.total) }))
    setPedidos(ps)
    return ps
  }, [])

  useEffect(() => {
    void cargar().then((ps) => {
      if (ps && pedidoInicial) setSel(ps.find((p) => p.tienda === pedidoInicial.tienda && p.numero === pedidoInicial.numero) ?? null)
    })
  }, [cargar, pedidoInicial])

  const visibles = useMemo(() => {
    const f = filtro.trim().toLowerCase()
    return (pedidos ?? []).filter((p) => !f || String(p.numero).includes(f) || (p.proveedor_nombre ?? '').toLowerCase().includes(f) || p.proveedor_codigo.toLowerCase().includes(f))
  }, [pedidos, filtro])

  if (sel) return <RevisarPedido pedido={sel} onVolver={() => (setSel(null), void cargar())} />

  return (
    <section className="flex flex-col gap-3">
      <div className="rounded-2xl border border-[#e1e7f3] bg-white p-4 shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
        <h2 className="text-[17px] font-bold">Propuestas de proveedor</h2>
        <p className="text-[14px] text-[#5b6680]">
          Elige el pedido, sube el PDF que ha mandado el proveedor y el ERP lo compara con lo que pediste (si el proveedor está homologado en «PDF a Excel», con su mismo lector; si no, lo lee la IA): precios, cantidades, lo que no sirven y lo que añaden. Después contestas con una confirmación o con reparos.
        </p>
        <input value={filtro} onChange={(e) => setFiltro(e.target.value)} placeholder="Buscar por nº de pedido o proveedor" className="mt-3 h-9 w-[320px] max-w-full rounded-lg border border-[#c9d3e8] px-2 text-[14px]" />
        {error && <p className="mt-2 text-[14px] font-bold text-[#c42b1c]">{error}</p>}
      </div>
      {!pedidos && !error && <p className="text-[14px] text-[#5b6680]">Cargando pedidos…</p>}
      {pedidos && (
        <div className="rounded-2xl border border-[#e1e7f3] bg-white shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
          {!visibles.length && <p className="px-4 py-3 text-[14px] text-[#5b6680]">No hay pedidos pendientes de recibir.</p>}
          <table className="w-full border-collapse text-[14px]">
            <tbody>
              {visibles.map((p) => (
                <tr key={`${p.tienda}-${p.numero}`} className="border-t border-[#eef2f8] first:border-t-0">
                  <td className="px-4 py-2">
                    <div className="font-semibold">
                      Pedido {p.numero} · {p.proveedor_nombre ?? p.proveedor_codigo}
                    </div>
                    <div className="text-[12px] text-[#7a849c]">
                      {fecha(p.fecha)} · {p.lineas} líneas · {p.estado}
                      {p.ultima_propuesta ? ` · propuesta: ${ESTADOS[p.ultima_propuesta as Propuesta['estado']] ?? p.ultima_propuesta}` : ''}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{eur0(p.total)}</td>
                  <td className="px-4 py-2 text-right">
                    <button type="button" onClick={() => setSel(p)} className="inline-flex h-8 items-center gap-1 rounded-full bg-[#1d3a8a] px-3 text-[13px] font-semibold text-white hover:bg-[#16306f]">
                      <FileText size={13} /> {p.propuestas ? 'Ver propuesta' : 'Revisar propuesta'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function RevisarPedido({ pedido, onVolver }: { pedido: PedidoAbierto; onVolver: () => void }) {
  const [lista, setLista] = useState<Propuesta[] | null>(null)
  const [actual, setActual] = useState<Propuesta | null>(null)
  const [leyendo, setLeyendo] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const cargar = useCallback(async (abrirId?: number) => {
    const { data, error: e } = await supabase.rpc('fn_compras_propuestas', { p_tienda: pedido.tienda, p_numero: pedido.numero })
    if (e) return setError(e.message)
    const ps = ((data ?? []) as Propuesta[]).map(normalizarPropuesta)
    setLista(ps)
    setActual(ps.find((p) => p.id === abrirId) ?? ps.find((p) => p.estado === 'revisando') ?? ps.find((p) => p.estado !== 'anulada') ?? null)
  }, [pedido.tienda, pedido.numero])

  useEffect(() => {
    void cargar()
  }, [cargar])

  async function subir(f: File | undefined) {
    setError(null)
    if (!f) return
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') return setError('Sube el PDF del proveedor.')
    if (f.size > 8_000_000) return setError('El PDF pesa demasiado (máximo 8 MB).')
    setLeyendo(true)
    try {
      // Primero, el lector de «PDF a Excel» (proveedores homologados). Si falla o no reconoce al proveedor, lee la IA.
      let lector: LecturaLector | null = null
      try {
        lector = await leerConLector(f)
      } catch {
        lector = null
      }
      const { data, error: e } = await supabase.functions.invoke('propuesta-proveedor-ia', {
        body: { tienda: pedido.tienda, numero: pedido.numero, archivo: f.name, pdf_base64: await aBase64(f), lector: lector?.perfil && lector.filas.length ? lector : null },
      })
      if (e) throw new Error(e.message)
      if (!data?.ok) throw new Error(data?.error ?? 'La IA no ha contestado.')
      await cargar(Number(data.id))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer la propuesta.')
    } finally {
      setLeyendo(false)
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="rounded-2xl border border-[#e1e7f3] bg-white p-4 shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <button type="button" onClick={onVolver} className="text-[13px] text-[#5b6680] underline">
              ← Todos los pedidos
            </button>
            <h2 className="mt-1 text-[18px] font-bold">
              Pedido {pedido.numero} · {pedido.proveedor_nombre ?? pedido.proveedor_codigo}
            </h2>
            <div className="text-[13px] text-[#7a849c]">
              {fecha(pedido.fecha)} · {pedido.lineas} líneas · {eur0(pedido.total)}
            </div>
          </div>
          <label className={`flex h-10 cursor-pointer items-center gap-1.5 rounded-full px-4 text-[14px] font-semibold ${leyendo ? 'bg-[#c9d3e8] text-[#33415f]' : 'bg-[#1d3a8a] text-white hover:bg-[#16306f]'}`}>
            <Upload size={15} /> {leyendo ? 'Leyendo la propuesta… (hasta un minuto)' : actual ? 'Subir otra propuesta' : 'Subir la propuesta (PDF)'}
            <input type="file" accept=".pdf,application/pdf" className="hidden" disabled={leyendo} onChange={(e) => void subir(e.target.files?.[0])} />
          </label>
        </div>
        {error && <p className="mt-2 text-[14px] font-bold text-[#c42b1c]">{error}</p>}
        {lista && lista.length > 1 && (
          <div className="mt-2 flex flex-wrap gap-1.5 text-[13px]">
            {lista.map((p) => (
              <button key={p.id} type="button" onClick={() => setActual(p)} className={`rounded-full border px-2.5 py-0.5 ${actual?.id === p.id ? 'border-[#1d3a8a] bg-[#eef2fb] font-semibold' : 'border-[#d5dcec]'}`}>
                {fecha(p.creada_en.slice(0, 10))} · {ESTADOS[p.estado]}
              </button>
            ))}
          </div>
        )}
      </div>
      {lista && !actual && !leyendo && <p className="text-[14px] text-[#5b6680]">Todavía no se ha subido ninguna propuesta para este pedido.</p>}
      {actual && <Revision key={actual.id} p={actual} email={pedido.proveedor_email} onHecho={() => void cargar(actual.id)} />}
    </section>
  )
}

function Revision({ p, email, onHecho }: { p: Propuesta; email: string | null; onHecho: () => void }) {
  const [lineas, setLineas] = useState<LineaComp[]>(p.lineas)
  const [para, setPara] = useState(p.respuesta_para ?? email ?? '')
  const editable = p.estado === 'revisando'
  const propuesta = useMemo(() => textoRespuesta(p, lineas), [p, lineas])
  const [asunto, setAsunto] = useState(propuesta.asunto)
  const [texto, setTexto] = useState(propuesta.texto)
  const [tocado, setTocado] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (tocado) return
    setAsunto(propuesta.asunto)
    setTexto(propuesta.texto)
  }, [propuesta, tocado])

  const pendientes = lineas.filter((l) => l.decision == null).length
  const diferencias = lineas.filter((l) => l.tipo !== 'igual').length

  const decidir = (i: number, decision: 'aceptar' | 'reparo') => {
    setError(null)
    setLineas(lineas.map((l, j) => (j === i ? { ...l, decision, reparo: decision === 'reparo' ? (l.reparo ?? reparoPorDefecto(l)) : null } : l)))
  }

  async function responder(enviar: boolean) {
    setError(null)
    if (pendientes) return setError(`Falta decidir ${pendientes === 1 ? 'una línea' : `${pendientes} líneas`}: «Aceptar» o «Reparo».`)
    setEnviando(true)
    const { error: e } = await supabase.rpc('fn_compras_propuesta_responder', {
      p_id: p.id,
      p_tipo: propuesta.tipo,
      p_para: para,
      p_asunto: asunto,
      p_texto: texto,
      p_lineas: lineas,
      p_enviar: enviar,
    })
    setEnviando(false)
    if (e) return setError(e.message)
    onHecho()
  }

  async function anular() {
    setError(null)
    const { error: e } = await supabase.rpc('fn_compras_propuesta_anular', { p_id: p.id })
    if (e) return setError(e.message)
    onHecho()
  }

  return (
    <>
      <div className="rounded-2xl border border-[#e1e7f3] bg-white p-4 shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h3 className="text-[16px] font-bold">
            Propuesta {p.documento_numero ? `nº ${p.documento_numero}` : ''} {p.documento_fecha ? `del ${fecha(p.documento_fecha)}` : ''}
            <span className="ml-2 text-[13px] font-normal text-[#7a849c]">{p.archivo}</span>
          </h3>
          <span className="rounded-full bg-[#eef2fb] px-2.5 py-0.5 text-[13px] font-semibold">{ESTADOS[p.estado]}</span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5 text-[13px]">
          <span className="rounded-full bg-[#eef2fb] px-2.5 py-0.5">Pedido: {eur(p.total_pedido)}</span>
          <span className="rounded-full bg-[#eef2fb] px-2.5 py-0.5">Propuesta: {eur(p.total_propuesta)}</span>
          {p.resumen.portes ? <span className="rounded-full bg-[#fff4d6] px-2.5 py-0.5 text-[#7a5200]">Portes: {eur(p.resumen.portes)}</span> : null}
          {p.resumen.plazo_entrega ? <span className="rounded-full bg-[#eef2fb] px-2.5 py-0.5">Entrega: {p.resumen.plazo_entrega}</span> : null}
          <span className={`rounded-full px-2.5 py-0.5 font-semibold ${diferencias ? 'bg-[#fdecea] text-[#b3261e]' : 'bg-[#e6f4ea] text-[#127a12]'}`}>
            {diferencias ? `${diferencias} ${diferencias === 1 ? 'diferencia' : 'diferencias'}` : 'Todo coincide'}
          </span>
        </div>
        {p.avisos.length > 0 && (
          <ul className="mt-2 list-disc pl-5 text-[13px] text-[#7a5200]">
            {p.avisos.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="max-h-[60vh] overflow-auto rounded-2xl border border-[#e1e7f3] bg-white shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
        <table className="w-full border-collapse text-[14px]">
          <thead className="sticky top-0 z-10 bg-[#f4f7fc] text-left text-[12px] uppercase tracking-wide text-[#5b6680]">
            <tr>
              <th className="px-3 py-2">Artículo</th>
              <th className="px-3 py-2 text-right">Cantidad</th>
              <th className="px-3 py-2 text-right" title="Precio neto por unidad, con descuentos">Precio neto</th>
              <th className="px-3 py-2">Qué pasa</th>
              <th className="w-[240px] px-3 py-2">Decisión</th>
            </tr>
          </thead>
          <tbody>
            {lineas.map((l, i) => (
              <tr key={i} className="border-t border-[#eef2f8] align-top">
                <td className="px-3 py-2">
                  <div className="font-semibold">{l.descripcion_pedido ?? l.descripcion}</div>
                  <div className="text-[12px] text-[#7a849c]">
                    {l.linea_pedido ? `Línea ${l.linea_pedido}` : 'Fuera del pedido'}
                    {l.referencia ? ` · ref. ${l.referencia}` : ''}
                    {l.descripcion_pedido && l.descripcion !== l.descripcion_pedido ? ` · proveedor: ${l.descripcion}` : ''}
                    {l.confianza !== 'alta' && l.tipo !== 'falta' ? ` · emparejado con confianza ${l.confianza}` : ''}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {l.cant_pedida != null && <div className="text-[12px] text-[#7a849c]">pedido {uds(l.cant_pedida)}</div>}
                  <div className={l.cant_propuesta != null && l.cant_pedida != null && l.cant_propuesta !== l.cant_pedida ? 'font-semibold text-[#7a5200]' : ''}>{uds(l.cant_propuesta)}</div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {l.neto_pedido != null && <div className="text-[12px] text-[#7a849c]">pactado {eur(l.neto_pedido)}</div>}
                  <div className={l.diferencia_pct ? 'font-semibold text-[#b3261e]' : ''}>
                    {eur(l.neto_propuesto)}
                    {l.diferencia_pct ? ` (${l.diferencia_pct > 0 ? '+' : ''}${l.diferencia_pct.toLocaleString('de-DE')} %)` : ''}
                  </div>
                </td>
                <td className="px-3 py-2">
                  <span className={`inline-block rounded-full px-2 py-0.5 text-[12px] font-semibold ${TIPOS[l.tipo]?.c ?? ''}`}>{TIPOS[l.tipo]?.t ?? l.tipo}</span>
                  {l.nota && <div className="mt-0.5 text-[12px] text-[#5b6680]">{l.nota}</div>}
                </td>
                <td className="px-3 py-2">
                  {editable ? (
                    <>
                      <div className="flex gap-1">
                        <button type="button" onClick={() => decidir(i, 'aceptar')} className={`h-7 rounded-full border px-2.5 text-[12px] font-semibold ${l.decision === 'aceptar' ? 'border-[#127a12] bg-[#e6f4ea] text-[#127a12]' : 'border-[#d5dcec]'}`}>
                          Aceptar
                        </button>
                        <button type="button" onClick={() => decidir(i, 'reparo')} className={`h-7 rounded-full border px-2.5 text-[12px] font-semibold ${l.decision === 'reparo' ? 'border-[#b3261e] bg-[#fdecea] text-[#b3261e]' : 'border-[#d5dcec]'}`}>
                          Reparo
                        </button>
                      </div>
                      {l.decision === 'reparo' && (
                        <input
                          value={l.reparo ?? ''}
                          onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, reparo: e.target.value } : x)))}
                          aria-label="Qué se le dice al proveedor"
                          className="mt-1 h-8 w-full rounded-lg border border-[#c9d3e8] px-2 text-[12px]"
                        />
                      )}
                    </>
                  ) : (
                    <span className="text-[12px]">{l.decision === 'reparo' ? `Reparo: ${l.reparo ?? ''}` : l.decision === 'aceptar' ? 'Aceptada' : ''}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editable ? (
        <div className="rounded-2xl border border-[#e1e7f3] bg-white p-4 shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[16px] font-bold">{propuesta.tipo === 'confirmar' ? 'Confirmación al proveedor' : 'Reparos al proveedor'}</h3>
            {diferencias > 0 && pendientes > 0 && (
              <button type="button" onClick={() => (setError(null), setLineas(lineas.map((l) => (l.decision == null ? { ...l, decision: 'aceptar' } : l))))} className="text-[13px] text-[#1d3a8a] underline">
                Aceptar todo lo que falta por decidir
              </button>
            )}
          </div>
          <div className="mt-2 grid gap-2 text-[14px]">
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-[#33415f]">Para</span>
              <input value={para} onChange={(e) => setPara(e.target.value)} placeholder="correo del proveedor" className="h-9 rounded-lg border border-[#c9d3e8] px-2" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-[#33415f]">Asunto</span>
              <input value={asunto} onChange={(e) => (setTocado(true), setAsunto(e.target.value))} className="h-9 rounded-lg border border-[#c9d3e8] px-2" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-[#33415f]">Texto</span>
              <textarea value={texto} onChange={(e) => (setTocado(true), setTexto(e.target.value))} rows={9} className="rounded-lg border border-[#c9d3e8] p-2" />
            </label>
            {tocado && (
              <button type="button" onClick={() => setTocado(false)} className="justify-self-start text-[13px] text-[#5b6680] underline">
                Volver al texto automático
              </button>
            )}
          </div>
          {error && <p className="mt-2 text-[14px] font-bold text-[#c42b1c]">{error}</p>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => void anular()} className="text-[13px] text-[#5b6680] underline">
              Descartar esta lectura
            </button>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={() => void responder(false)} disabled={enviando} title="Guarda lo decidido sin mandar correo (por ejemplo, si se lo has dicho por teléfono)" className="h-10 rounded-full border border-[#d5dcec] px-4 text-[14px] font-semibold hover:bg-[#f1f5fd] disabled:opacity-50">
                Guardar sin enviar
              </button>
              <button type="button" onClick={() => void responder(true)} disabled={enviando} className="flex h-10 items-center gap-1.5 rounded-full bg-[#1d3a8a] px-5 text-[14px] font-semibold text-white hover:bg-[#16306f] disabled:opacity-50">
                <Send size={15} /> {enviando ? 'Enviando…' : propuesta.tipo === 'confirmar' ? 'Enviar confirmación' : 'Enviar reparos'}
              </button>
            </div>
          </div>
        </div>
      ) : (
        p.estado !== 'anulada' && (
          <div className="rounded-2xl border border-[#e1e7f3] bg-white p-4 text-[14px] shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
            <div className="font-semibold">
              {ESTADOS[p.estado]} el {p.respondida_en ? fecha(p.respondida_en.slice(0, 10)) : ''}
              {p.respondida_por ? ` por ${p.respondida_por}` : ''}
            </div>
            <div className="text-[13px] text-[#5b6680]">
              {p.respuesta_para ? `Correo a ${p.respuesta_para}: ${p.correo_enviado_en ? `enviado el ${fecha(p.correo_enviado_en.slice(0, 10))}` : p.correo_error ? `error: ${p.correo_error}` : 'en la cola, sale en unos minutos'}` : 'Guardado sin enviar correo.'}
            </div>
            {p.respuesta_texto && <pre className="mt-2 whitespace-pre-wrap rounded-lg bg-[#f4f7fc] p-2 font-sans text-[13px]">{p.respuesta_texto}</pre>}
          </div>
        )
      )}
    </>
  )
}
