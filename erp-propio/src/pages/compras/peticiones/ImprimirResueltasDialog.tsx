// «Imprimir peticiones resueltas» (Rober, 23/11/2026): «cuando está resuelta (la mercancía ha llegado) es cuando hay que
// proponerla para imprimir: con ese pedido en papel el almacén separa la mercancía y la pone en ruta de reparto».
// Las resueltas (GeminisWin y ERP) de los últimos 60 días, separadas por el proveedor de la compra por la que llegaron.
// Cada proveedor sale en su hoja, con una casilla por línea para el almacén. Al terminar se marcan como impresas y dejan
// de contar en el globo rojo de la pestaña Peticiones. Datos: fn_peticiones_resueltas_doc / fn_peticiones_marcar_impresas.
// 25/11/2026 (Rober): casilla por línea (además de la del proveedor), importe y doble clic para ver el documento de origen:
// la venta si ya la hay y, si no, el pedido de cliente del que salió la petición (GeminisWin, solo consulta).

import { useCallback, useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import { Printer, X } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwWindow } from '../../../components/gw'
import { EVENTO_RESUELTAS } from './resueltas'

interface Resuelta {
  origen: 'GW' | 'ERP'
  oficina: string
  numero: number
  fecha: string
  articulo_codigo: string
  referencia: string
  descripcion: string
  cantidad: number
  cliente_codigo: string | null
  cliente_nombre: string | null
  concepto: string | null
  proveedor_codigo: string | null
  proveedor_nombre: string | null
  compra: string | null
  recibida_en: string | null
  almacen: string | null
  impresa_en: string | null
  /** Documento de origen: la venta si ya existe; si no, el pedido de cliente (solo peticiones de GeminisWin). */
  doc_tipo: 'venta' | 'pedido' | null
  doc_oficina: string | null
  doc_numero: number | null
  importe: number | null
}
interface Grupo {
  codigo: string
  nombre: string
  lineas: Resuelta[]
}

/** Globo rojo con el número dentro (como las notificaciones del móvil). Nada si es 0. */
export function Globo({ n, className = '' }: { n: number; className?: string }) {
  if (!n) return null
  return (
    <span
      className={`inline-flex h-[20px] min-w-[20px] items-center justify-center rounded-full bg-[#e0262b] px-1.5 text-[12px] font-bold leading-none text-white shadow ${className}`}
      title={`${n} ${n === 1 ? 'petición resuelta' : 'peticiones resueltas'} sin imprimir`}
    >
      {n > 99 ? '99+' : n}
    </span>
  )
}

const fecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '')
const uds = (n: number) => n.toLocaleString('de-DE', { maximumFractionDigits: 2 })
const esc = (s: string | null | undefined) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!)
const clave = (l: Resuelta) => `${l.origen}/${l.oficina}/${l.numero}`
/** Nº del pedido de cliente (o de la venta, si ya la hay) de la petición. */
const numPedido = (l: Resuelta) => (l.doc_tipo && l.doc_oficina && l.doc_numero != null ? `${l.doc_tipo === 'venta' ? 'Vta. ' : ''}${l.doc_oficina}-${l.doc_numero}` : '')
const euros = (n: number | null) => (n == null ? '' : `${n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`)

export function ImprimirResueltasDialog({ onClose }: { onClose: () => void }) {
  const [lineas, setLineas] = useState<Resuelta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conImpresas, setConImpresas] = useState(false)
  /** Líneas desmarcadas (no se imprimen con «Imprimir marcados» ni con «Imprimir este»). */
  const [fuera, setFuera] = useState<Set<string>>(new Set())
  /** Documento abierto con doble clic. */
  const [doc, setDoc] = useState<Resuelta | null>(null)
  /** Lo que se acaba de mandar a la impresora, para preguntar si se marca como impreso. */
  const [impresas, setImpresas] = useState<Resuelta[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    setLineas(null)
    const { data, error: e } = await supabase.rpc('fn_peticiones_resueltas_doc', { p_dias: 60, p_con_impresas: conImpresas })
    if (e) {
      setError(e.message)
      setLineas([])
      return
    }
    setLineas(
      ((data ?? []) as Resuelta[]).map((l) => ({
        ...l,
        cantidad: Number(l.cantidad ?? 0),
        importe: l.importe == null ? null : Number(l.importe),
        doc_numero: l.doc_numero == null ? null : Number(l.doc_numero),
      })),
    )
  }, [conImpresas])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const grupos = useMemo(() => {
    const m = new Map<string, Grupo>()
    for (const l of lineas ?? []) {
      const k = l.proveedor_codigo ?? ''
      const g = m.get(k) ?? { codigo: k, nombre: l.proveedor_nombre ?? (k || 'Sin proveedor'), lineas: [] }
      g.lineas.push(l)
      m.set(k, g)
    }
    return [...m.values()].sort((a, b) => (a.codigo === '' ? 1 : b.codigo === '' ? -1 : a.nombre.localeCompare(b.nombre)))
  }, [lineas])

  /** Cada proveedor solo con sus líneas marcadas (los que se quedan sin ninguna no salen). */
  const conMarcadas = (lista: Grupo[]) =>
    lista.map((g) => ({ ...g, lineas: g.lineas.filter((l) => !fuera.has(clave(l))) })).filter((g) => g.lineas.length)
  const elegidos = conMarcadas(grupos)
  const nElegidas = elegidos.reduce((s, g) => s + g.lineas.length, 0)

  function alternarLinea(l: Resuelta) {
    setFuera((f) => {
      const n = new Set(f)
      const k = clave(l)
      if (n.has(k)) n.delete(k)
      else n.add(k)
      return n
    })
  }
  /** La casilla del proveedor marca o desmarca todas sus líneas. */
  function alternarGrupo(g: Grupo) {
    setFuera((f) => {
      const n = new Set(f)
      const todas = g.lineas.every((l) => !n.has(clave(l)))
      for (const l of g.lineas) {
        if (todas) n.add(clave(l))
        else n.delete(clave(l))
      }
      return n
    })
  }

  /** Cada proveedor en su hoja: ventana nueva con las tablas y el diálogo de imprimir. */
  function imprimir(lista: Grupo[]) {
    if (!lista.length) return
    const w = window.open('', '_blank')
    if (!w) return setError('El navegador ha bloqueado la ventana: permite las ventanas emergentes de esta web para imprimir.')
    const hoy = fecha(new Date().toISOString())
    const hojas = lista
      .map(
        (g) => `<section>
  <h1>${esc(g.nombre)}${g.codigo ? ` <small>${esc(g.codigo)}</small>` : ''}</h1>
  <p class="sub">Peticiones de clientes RESUELTAS (mercancía recibida) · para separar y poner en reparto · ${g.lineas.length} ${g.lineas.length === 1 ? 'línea' : 'líneas'} · ${hoy}</p>
  <table>
    <thead><tr><th class="c">✓</th><th>Cliente</th><th class="ped">Nº pedido</th><th>Cód. venta</th><th>Ref. compra</th><th>Descripción</th><th class="n">Cant.</th><th>Petición</th><th>Llegó</th><th class="n">Importe</th></tr></thead>
    <tbody>${g.lineas
      .map(
        (l) =>
          `<tr><td class="c">☐</td><td><b>${esc(l.cliente_nombre ?? l.cliente_codigo ?? '')}</b></td><td class="ped">${esc(numPedido(l)) || '—'}</td><td><b>${esc(l.articulo_codigo)}</b></td><td>${esc(l.referencia)}</td><td>${esc(l.descripcion)}</td><td class="n"><b>${uds(l.cantidad)}</b></td><td>${esc(l.oficina)}-${l.numero}</td><td>${fecha(l.recibida_en)}</td><td class="n">${euros(l.importe)}${l.doc_tipo ? ` <small>${l.doc_tipo === 'venta' ? 'vta.' : 'ped.'}</small>` : ''}</td></tr>`,
      )
      .join('')}</tbody>
  </table>
</section>`,
      )
      .join('')
    w.document.write(`<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Peticiones resueltas para preparar</title><style>
      body{font-family:Arial,Helvetica,sans-serif;color:#111;margin:18px}
      section{page-break-after:always} section:last-child{page-break-after:auto}
      h1{font-size:18px;margin:0 0 2px} h1 small{font-size:12px;color:#666;font-weight:normal}
      .sub{font-size:11px;color:#555;margin:0 0 8px}
      table{width:100%;border-collapse:collapse;font-size:11px} th,td{border:1px solid #bbb;padding:4px 5px;text-align:left;vertical-align:top}
      th{background:#eee} .n{text-align:right;white-space:nowrap} td.ped{font-weight:bold;font-size:14px;white-space:nowrap} th.ped{white-space:nowrap} .c{text-align:center;width:22px;font-size:14px}
    </style></head><body>${hojas}<script>window.onload=function(){window.print()}<\/script></body></html>`)
    w.document.close()
    setImpresas(lista.flatMap((g) => g.lineas).filter((l) => !l.impresa_en))
  }

  async function marcarImpresas() {
    if (!impresas?.length) return setImpresas(null)
    const { data, error: e } = await supabase.rpc('fn_peticiones_marcar_impresas', {
      p_peticiones: impresas.map((l) => ({ origen: l.origen, oficina: l.oficina, numero: l.numero })),
    })
    if (e) return setError(e.message)
    setAviso(`Marcadas como impresas: ${Number(data ?? impresas.length)}. Ya no cuentan en el globo rojo.`)
    setImpresas(null)
    window.dispatchEvent(new Event(EVENTO_RESUELTAS))
    void cargar()
  }

  // En el body (portal), por encima de todo: dentro de la ventana del Gestor quedaba recortada y se movía al hacer scroll
  // por debajo de la barra de menús (vídeo de Rober, 25/11/2026).
  return createPortal(
    <div className="fixed inset-0 z-[400] flex items-start justify-center bg-black/20 pt-10" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title="Peticiones resueltas para preparar (por proveedor)" onClose={onClose} className="w-[1100px] max-w-[96vw]">
        <div className="flex max-h-[78vh] flex-col gap-2 text-[14px]">
          <div className="flex flex-wrap items-center gap-2">
            <span>
              {lineas === null ? (
                'Cargando…'
              ) : (
                <>
                  <b>{lineas.length}</b> {lineas.length === 1 ? 'petición resuelta' : 'peticiones resueltas'} de <b>{grupos.length}</b>{' '}
                  {grupos.length === 1 ? 'proveedor' : 'proveedores'}{' '}
                  {conImpresas ? '(últimos 60 días, también las ya impresas)' : 'sin imprimir (últimos 60 días)'}
                </>
              )}
            </span>
            <span className="flex-1" />
            <label className="flex items-center gap-1.5" title="Para volver a imprimir alguna">
              <input type="checkbox" checked={conImpresas} onChange={(e) => setConImpresas(e.target.checked)} /> Incluir las ya impresas
            </label>
            <button type="button" className="gw-btn h-[30px]! px-3 text-[14px]!" disabled={!nElegidas} onClick={() => imprimir(elegidos)}>
              <Printer size={15} className="text-[#1d3a8a]" /> Imprimir marcados ({nElegidas})
            </button>
          </div>

          {impresas && (
            <div className="flex flex-wrap items-center gap-2 rounded border border-[#e7c66b] bg-[#fff7dc] px-3 py-2">
              <span className="font-semibold">¿Ha salido bien la impresión?</span>
              <span className="text-[13px] text-[#5b4a10]">Si las marcas, dejan de salir como nuevas y bajan del globo rojo.</span>
              <span className="flex-1" />
              <button type="button" className="gw-btn h-[28px]! px-3 text-[14px]!" onClick={() => void marcarImpresas()} disabled={!impresas.length}>
                Sí, marcar {impresas.length} como impresas
              </button>
              <button type="button" className="gw-btn h-[28px]! px-3 text-[14px]!" onClick={() => setImpresas(null)}>
                <X size={14} /> No
              </button>
            </div>
          )}
          {aviso && <p className="font-semibold text-[#1A5C1A]">{aviso}</p>}
          {error && <p className="font-bold text-[#c42b1c]">{error}</p>}
          {lineas !== null && !grupos.length && !error && (
            <p className="rounded border border-dashed border-[#c9d3e8] bg-white p-6 text-center text-[#5b6680]">
              No hay peticiones resueltas por imprimir. 👍
            </p>
          )}

          <div className="flex min-h-0 flex-col gap-2 overflow-y-auto pr-1">
            {grupos.map((g) => {
              const marcadas = g.lineas.filter((l) => !fuera.has(clave(l))).length
              return (
              <article key={g.codigo || 'sin'} className="rounded border border-[#c9d3e8] bg-white">
                <header className="flex flex-wrap items-center gap-2 border-b border-[#e3e8f2] bg-[#f3f6fc] px-3 py-1.5">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={marcadas > 0}
                      ref={(el) => {
                        if (el) el.indeterminate = marcadas > 0 && marcadas < g.lineas.length
                      }}
                      onChange={() => alternarGrupo(g)}
                      title="Marcar o desmarcar todas las líneas de este proveedor"
                    />
                    <b className={`text-[15px] ${g.codigo ? '' : 'text-[#a3123f]'}`}>{g.nombre}</b>
                  </label>
                  {g.codigo && <span className="text-[12px] text-[#7a849c]">{g.codigo}</span>}
                  <span className="text-[13px] text-[#5b6680]">
                    · {g.lineas.length} {g.lineas.length === 1 ? 'línea' : 'líneas'}
                    {marcadas < g.lineas.length ? ` (${marcadas} marcadas)` : ''}
                  </span>
                  <span className="flex-1" />
                  <button type="button" className="gw-btn h-[26px]! px-2 text-[13px]!" disabled={!marcadas} onClick={() => imprimir(conMarcadas([g]))}>
                    <Printer size={14} className="text-[#1d3a8a]" /> Imprimir este
                  </button>
                </header>
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] font-bold uppercase text-[#5b6680]">
                      <th className="w-[26px] pl-3 py-1" />
                      <th className="px-2 py-1">Cliente</th>
                      <th className="px-2 py-1" title="Pedido de cliente del que salió la petición (o la venta, si ya la hay)">Nº pedido</th>
                      <th className="px-2 py-1">Cód. venta</th>
                      <th className="px-2 py-1">Ref. compra</th>
                      <th className="px-2 py-1">Descripción</th>
                      <th className="px-2 py-1 text-right">Cant.</th>
                      <th className="px-2 py-1">Petición</th>
                      <th className="px-2 py-1">Llegó</th>
                      <th className="px-3 py-1 text-right" title="Importe de la venta; si aún no hay venta, el del pedido de cliente">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.lineas.map((l) => (
                      <tr
                        key={clave(l)}
                        className={`cursor-default border-t border-[#eef2f8] hover:bg-[#f3f7ff] ${l.impresa_en ? 'text-[#8a93a8]' : ''} ${fuera.has(clave(l)) ? 'opacity-50' : ''}`}
                        onDoubleClick={() => setDoc(l)}
                        title={l.doc_tipo ? `Doble clic: ver ${l.doc_tipo === 'venta' ? 'la venta' : 'el pedido de cliente'} ${l.doc_oficina}-${l.doc_numero}` : 'No se ha encontrado la venta ni el pedido de esta petición'}
                      >
                        <td className="pl-3 py-1" onDoubleClick={(e) => e.stopPropagation()}>
                          <input type="checkbox" checked={!fuera.has(clave(l))} onChange={() => alternarLinea(l)} title="Imprimir esta línea" />
                        </td>
                        <td className="max-w-[240px] truncate px-2 py-1 font-semibold" title={l.cliente_nombre ?? ''}>
                          {l.cliente_nombre ?? l.cliente_codigo ?? '—'}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 text-[14px] font-bold tabular-nums">{numPedido(l) || '—'}</td>
                        <td className="whitespace-nowrap px-2 py-1 font-semibold tabular-nums">{l.articulo_codigo}</td>
                        <td className="whitespace-nowrap px-2 py-1 tabular-nums">{l.referencia}</td>
                        <td className="max-w-[320px] px-2 py-1">
                          {l.descripcion}
                          {l.impresa_en && <span className="ml-1.5 text-[11px]">· impresa {fecha(l.impresa_en)}</span>}
                        </td>
                        <td className="px-2 py-1 text-right font-bold tabular-nums">{uds(l.cantidad)}</td>
                        <td className="whitespace-nowrap px-2 py-1 tabular-nums">
                          {l.oficina}-{l.numero}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 tabular-nums">{fecha(l.recibida_en)}</td>
                        <td className="whitespace-nowrap px-3 py-1 text-right tabular-nums">
                          {euros(l.importe)}
                          {l.doc_tipo && <span className="ml-1 text-[10px] text-[#7a849c]">{l.doc_tipo === 'venta' ? 'vta.' : 'ped.'}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
              )
            })}
          </div>
        </div>
      </GwWindow>
      {doc && <DocumentoOrigen l={doc} onClose={() => setDoc(null)} />}
    </div>,
    document.body,
  )
}

interface DocCab {
  fecha: string | null
  cliente_codigo: string | null
  nombre: string | null
  total: number | null
  total_pagado: number | null
  total_pendiente: number | null
  forma_pago: string | number | null
  estado: string
}
interface DocLinea {
  linea: number
  articulo_codigo: string | null
  descripcion: string | null
  cantidad: number | null
  pvp: number | null
  descuento: number | null
  total: number
}

/** La venta o el pedido de cliente de GeminisWin de una petición, solo para mirar. */
function DocumentoOrigen({ l, onClose }: { l: Resuelta; onClose: () => void }) {
  const [cab, setCab] = useState<DocCab | null>(null)
  const [lineas, setLineas] = useState<DocLinea[]>([])
  const [error, setError] = useState<string | null>(null)
  const esVenta = l.doc_tipo === 'venta'

  useEffect(() => {
    if (!l.doc_tipo || !l.doc_oficina || l.doc_numero == null) return
    const ofi = l.doc_oficina
    const num = l.doc_numero
    void (async () => {
      const [c, ls] = esVenta
        ? await Promise.all([
            supabase.from('gw_venta').select('fecha, cliente_codigo, nombre, total, total_pagado, total_pendiente, forma_pago, factura_oficina, factura_id').eq('oficina', ofi).eq('id_venta', num).maybeSingle(),
            supabase.from('gw_venta_linea').select('linea, articulo_codigo, descripcion, cantidad, pvp, descuento, total_base, total_igic').eq('oficina', ofi).eq('id_venta', num).order('linea'),
          ])
        : await Promise.all([
            supabase.from('gw_pedido_cliente').select('fecha, cliente_codigo, nombre, total, total_pagado, total_pendiente, forma_pago, aceptado, preparado, entregado, liquidado, anulado').eq('oficina', ofi).eq('id_pedido', num).maybeSingle(),
            supabase.from('gw_pedido_cliente_linea').select('linea, articulo_codigo, descripcion, cantidad, pvp, descuento, total_base, total_igic').eq('oficina', ofi).eq('id_pedido', num).order('linea'),
          ])
      if (c.error || ls.error) return setError((c.error ?? ls.error)!.message)
      if (!c.data) return setError('No se encuentra el documento en los datos de GeminisWin.')
      const d = c.data as Record<string, unknown>
      const estado = esVenta
        ? d.factura_id ? `Facturada (${d.factura_oficina}-${d.factura_id})` : 'Sin facturar'
        : d.anulado ? 'Anulado' : d.liquidado ? 'Liquidado' : d.entregado ? 'Entregado' : d.preparado ? 'Preparado' : d.aceptado ? 'Aceptado' : 'Pendiente'
      setCab({
        fecha: (d.fecha as string) ?? null,
        cliente_codigo: (d.cliente_codigo as string) ?? null,
        nombre: (d.nombre as string) ?? null,
        total: d.total == null ? null : Number(d.total),
        total_pagado: d.total_pagado == null ? null : Number(d.total_pagado),
        total_pendiente: d.total_pendiente == null ? null : Number(d.total_pendiente),
        forma_pago: (d.forma_pago as string | number) ?? null,
        estado,
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
  }, [l, esVenta])

  const titulo = l.doc_tipo ? `${esVenta ? 'Venta' : 'Pedido de cliente'} ${l.doc_oficina}-${l.doc_numero} (GeminisWin, solo consulta)` : 'Documento de origen'
  return (
    <div className="fixed inset-0 z-[410] flex items-start justify-center bg-black/25 pt-16" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <GwWindow title={titulo} onClose={onClose} className="w-[860px] max-w-[95vw]">
        <div className="flex max-h-[72vh] flex-col gap-2 overflow-y-auto p-1 text-[14px]">
          {!l.doc_tipo ? (
            <p>
              No se ha encontrado la venta ni el pedido de cliente de esta petición ({l.oficina}-{l.numero}). Se buscan en GeminisWin por el mismo cliente y
              artículo en los 3 días antes de la petición.
            </p>
          ) : error ? (
            <p className="font-bold text-[#c42b1c]">{error}</p>
          ) : !cab ? (
            <p>Cargando…</p>
          ) : (
            <>
              {!esVenta && <p className="text-[13px] text-[#5b6680]">Esta petición aún no tiene venta: se enseña el pedido de cliente del que salió.</p>}
              <div className="grid grid-cols-[auto_1fr_auto_1fr] gap-x-4 gap-y-1">
                <span className="text-[#5b6680]">Cliente</span>
                <b>
                  {cab.cliente_codigo} · {cab.nombre ?? l.cliente_nombre}
                </b>
                <span className="text-[#5b6680]">Fecha</span>
                <span>{fecha(cab.fecha)}</span>
                <span className="text-[#5b6680]">Estado</span>
                <span>{cab.estado}</span>
                <span className="text-[#5b6680]">Total</span>
                <b>{euros(cab.total)}</b>
                <span className="text-[#5b6680]">Pagado</span>
                <span>{euros(cab.total_pagado)}</span>
                <span className="text-[#5b6680]">Pendiente</span>
                <span>{euros(cab.total_pendiente)}</span>
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
                    <tr key={x.linea} className={x.articulo_codigo === l.articulo_codigo ? 'font-bold' : ''}>
                      <td className="whitespace-nowrap">{x.articulo_codigo}</td>
                      <td>{x.descripcion}</td>
                      <td className="text-right tabular-nums">{x.cantidad == null ? '' : uds(x.cantidad)}</td>
                      <td className="text-right tabular-nums">{euros(x.pvp)}</td>
                      <td className="text-right tabular-nums">{x.descuento ? `${uds(x.descuento)} %` : ''}</td>
                      <td className="text-right tabular-nums">{euros(x.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-[12px] text-[#5b6680]">En negrita, la línea del artículo de la petición.</p>
            </>
          )}
        </div>
      </GwWindow>
    </div>
  )
}
