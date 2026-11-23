// «Imprimir peticiones resueltas» (Rober, 23/11/2026): «cuando está resuelta (la mercancía ha llegado) es cuando hay que
// proponerla para imprimir: con ese pedido en papel el almacén separa la mercancía y la pone en ruta de reparto».
// Las resueltas (GeminisWin y ERP) de los últimos 60 días, separadas por el proveedor de la compra por la que llegaron.
// Cada proveedor sale en su hoja, con una casilla por línea para el almacén. Al terminar se marcan como impresas y dejan
// de contar en el globo rojo de la pestaña Peticiones. Datos: fn_peticiones_resueltas / fn_peticiones_marcar_impresas.

import { useCallback, useEffect, useMemo, useState } from 'react'
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

export function ImprimirResueltasDialog({ onClose }: { onClose: () => void }) {
  const [lineas, setLineas] = useState<Resuelta[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [conImpresas, setConImpresas] = useState(false)
  const [fuera, setFuera] = useState<Set<string>>(new Set())
  /** Lo que se acaba de mandar a la impresora, para preguntar si se marca como impreso. */
  const [impresas, setImpresas] = useState<Resuelta[] | null>(null)
  const [aviso, setAviso] = useState<string | null>(null)

  const cargar = useCallback(async () => {
    setError(null)
    setLineas(null)
    const { data, error: e } = await supabase.rpc('fn_peticiones_resueltas', { p_dias: 60, p_con_impresas: conImpresas })
    if (e) {
      setError(e.message)
      setLineas([])
      return
    }
    setLineas(((data ?? []) as Resuelta[]).map((l) => ({ ...l, cantidad: Number(l.cantidad ?? 0) })))
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

  const elegidos = grupos.filter((g) => !fuera.has(g.codigo))
  const nElegidas = elegidos.reduce((s, g) => s + g.lineas.length, 0)

  function alternar(codigo: string) {
    setFuera((f) => {
      const n = new Set(f)
      if (n.has(codigo)) n.delete(codigo)
      else n.add(codigo)
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
    <thead><tr><th class="c">✓</th><th>Cliente</th><th>Artículo</th><th>Descripción</th><th class="n">Cant.</th><th>Petición</th><th>Compra</th><th>Llegó</th><th>Concepto</th></tr></thead>
    <tbody>${g.lineas
      .map(
        (l) =>
          `<tr><td class="c">☐</td><td><b>${esc(l.cliente_nombre ?? l.cliente_codigo ?? '')}</b></td><td>${esc(l.referencia)}</td><td>${esc(l.descripcion)}</td><td class="n"><b>${uds(l.cantidad)}</b></td><td>${esc(l.oficina)}-${l.numero}</td><td>${esc(l.compra ?? '')}</td><td>${fecha(l.recibida_en)}</td><td>${esc(l.concepto ?? '')}</td></tr>`,
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
      th{background:#eee} .n{text-align:right;white-space:nowrap} .c{text-align:center;width:22px;font-size:14px}
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

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/20 pt-10" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
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
            {grupos.map((g) => (
              <article key={g.codigo || 'sin'} className="rounded border border-[#c9d3e8] bg-white">
                <header className="flex flex-wrap items-center gap-2 border-b border-[#e3e8f2] bg-[#f3f6fc] px-3 py-1.5">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!fuera.has(g.codigo)}
                      onChange={() => alternar(g.codigo)}
                      title="Incluir este proveedor al imprimir los marcados"
                    />
                    <b className={`text-[15px] ${g.codigo ? '' : 'text-[#a3123f]'}`}>{g.nombre}</b>
                  </label>
                  {g.codigo && <span className="text-[12px] text-[#7a849c]">{g.codigo}</span>}
                  <span className="text-[13px] text-[#5b6680]">
                    · {g.lineas.length} {g.lineas.length === 1 ? 'línea' : 'líneas'}
                  </span>
                  <span className="flex-1" />
                  <button type="button" className="gw-btn h-[26px]! px-2 text-[13px]!" onClick={() => imprimir([g])}>
                    <Printer size={14} className="text-[#1d3a8a]" /> Imprimir este
                  </button>
                </header>
                <table className="w-full border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] font-bold uppercase text-[#5b6680]">
                      <th className="px-3 py-1">Cliente</th>
                      <th className="px-2 py-1">Artículo</th>
                      <th className="px-2 py-1">Descripción</th>
                      <th className="px-2 py-1 text-right">Cant.</th>
                      <th className="px-2 py-1">Petición</th>
                      <th className="px-2 py-1">Compra</th>
                      <th className="px-3 py-1">Llegó</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.lineas.map((l) => (
                      <tr key={clave(l)} className={`border-t border-[#eef2f8] ${l.impresa_en ? 'text-[#8a93a8]' : ''}`}>
                        <td className="max-w-[240px] truncate px-3 py-1 font-semibold" title={l.cliente_nombre ?? ''}>
                          {l.cliente_nombre ?? l.cliente_codigo ?? '—'}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 tabular-nums">{l.referencia}</td>
                        <td className="max-w-[320px] px-2 py-1">
                          {l.descripcion}
                          {l.impresa_en && <span className="ml-1.5 text-[11px]">· impresa {fecha(l.impresa_en)}</span>}
                        </td>
                        <td className="px-2 py-1 text-right font-bold tabular-nums">{uds(l.cantidad)}</td>
                        <td className="whitespace-nowrap px-2 py-1 tabular-nums">
                          {l.oficina}-{l.numero}
                        </td>
                        <td className="whitespace-nowrap px-2 py-1 tabular-nums">{l.compra ?? '—'}</td>
                        <td className="whitespace-nowrap px-3 py-1 tabular-nums">{fecha(l.recibida_en)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </article>
            ))}
          </div>
        </div>
      </GwWindow>
    </div>
  )
}
