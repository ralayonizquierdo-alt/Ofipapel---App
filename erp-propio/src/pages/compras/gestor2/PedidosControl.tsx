// Gestor 2.0 → «Pedidos a proveedor» (Rober, 22/11/2026): control de TODOS los pedidos a proveedor en un sitio, los del
// ERP y los de GeminisWin (espejo), con los 4 estados que se usan: Pendiente, Pend. confirmar, Confirmado y Liquidado.
// Por defecto, los abiertos (los tres primeros). Cada pedido dice cuántos días lleva y si ya debería haber llegado
// (fecha del pedido + días de entrega del proveedor; en los del ERP, la fecha de llegada prevista si la tiene).
// Pulsar un pedido abre su ficha (la del ERP o la consulta de GeminisWin). Sustituye a la pestaña de pedidos del
// gestor antiguo.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RefreshCw, Search } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { todasLasFilas } from '../../../lib/todasLasFilas'

type Estado = 'pendiente' | 'pendiente_confirmar' | 'confirmado' | 'liquidado'
type Filtro = 'abiertos' | Estado | 'retrasados'

const ESTADOS: { k: Estado; texto: string; color: string; fondo: string }[] = [
  { k: 'pendiente', texto: 'Pendiente', color: '#7a1f5c', fondo: '#f8e7f1' },
  {
    k: 'pendiente_confirmar',
    texto: 'Pend. confirmar',
    color: '#1d2a8c',
    fondo: '#e6e9fb',
  },
  { k: 'confirmado', texto: 'Confirmado', color: '#a3123f', fondo: '#fde6ee' },
  { k: 'liquidado', texto: 'Liquidado', color: '#4b5563', fondo: '#eceef1' },
]

interface Fila {
  key: string
  origen: 'ERP' | 'GW'
  tienda: string
  numero: number
  fecha: string
  proveedor: string
  nombre: string
  estado: Estado
  total: number
  llegada: string | null
  dias: number
  retrasado: boolean
}

const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Atlantic/Canary' }).format(new Date())
const masDias = (iso: string, n: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86400000)
const fecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '')
const eur = (n: number) =>
  n.toLocaleString('de-DE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }) + ' €'
const eur0 = (n: number) => Math.round(n).toLocaleString('de-DE') + ' €'

/** Estado de GeminisWin → los 4 que se usan (Conformado y Pend. entrega cuentan como confirmados). */
function estadoGw(e: number | null, actualizado: boolean): Estado {
  if (actualizado || e === 6 || e === 7) return 'liquidado'
  if (e === 2) return 'pendiente_confirmar'
  if (e === 3 || e === 4 || e === 5) return 'confirmado'
  return 'pendiente'
}
function estadoErp(e: string | null): Estado {
  if (e === 'pendiente_confirmar' || e === 'confirmado' || e === 'liquidado') return e
  if (e === 'conformado' || e === 'pendiente_entrega') return 'confirmado'
  if (e === 'recepcionado') return 'liquidado'
  return 'pendiente'
}

export function PedidosControl() {
  const navigate = useNavigate()
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<Filtro>('abiertos')
  const [texto, setTexto] = useState('')
  const [meses, setMeses] = useState(3)

  const cargar = useCallback(async () => {
    setError(null)
    setFilas(null)
    const desde = masDias(hoy(), -31 * meses)
    const [erp, gw] = await Promise.all([
      todasLasFilas(() =>
        supabase
          .from('pedido_proveedor')
          .select('tienda_terminal_codigo, numero, fecha_hora, proveedor_codigo, estado, total, fecha_prevista, es_abono')
          .gte('fecha_hora', desde)
          .eq('es_abono', false)
          .order('fecha_hora')
          .order('numero'),
      ),
      todasLasFilas(() =>
        supabase
          .from('gw_pedido_proveedor')
          .select('oficina, numero, fecha_hora, proveedor_codigo, estado_pedido, total, actualizado, abono, recibido')
          .gte('fecha_hora', desde)
          .eq('abono', false)
          .order('fecha_hora')
          .order('numero'),
      ),
    ])
    if (erp.error || gw.error) {
      setError(erp.error ?? gw.error)
      setFilas([])
      return
    }
    const codigos = [...new Set([...(erp.data ?? []), ...(gw.data ?? [])].map((r) => r.proveedor_codigo).filter(Boolean) as string[])]
    const provs = new Map<string, { nombre: string; dias: number }>()
    for (let i = 0; i < codigos.length; i += 200) {
      const { data } = await supabase
        .from('proveedor')
        .select('codigo, nombre, dias_entrega')
        .in('codigo', codigos.slice(i, i + 200))
      for (const p of data ?? [])
        provs.set(p.codigo as string, {
          nombre: String(p.nombre ?? ''),
          dias: Number(p.dias_entrega) > 0 ? Number(p.dias_entrega) : 7,
        })
    }
    const h = hoy()
    const fila = (
      origen: 'ERP' | 'GW',
      tienda: string,
      numero: number,
      fh: string,
      prov: string,
      estado: Estado,
      total: number,
      prevista: string | null,
    ): Fila => {
      const f = fh.slice(0, 10)
      const p = provs.get(prov)
      const llegada = prevista ?? masDias(f, p?.dias ?? 7)
      return {
        key: `${origen}/${tienda}/${numero}`,
        origen,
        tienda,
        numero,
        fecha: f,
        proveedor: prov,
        nombre: p?.nombre ?? '',
        estado,
        total,
        llegada,
        dias: diasEntre(f, h),
        retrasado: estado !== 'liquidado' && estado !== 'pendiente' && llegada < h,
      }
    }
    const todas = [
      ...(erp.data ?? []).map((r) =>
        fila(
          'ERP',
          r.tienda_terminal_codigo,
          Number(r.numero),
          r.fecha_hora,
          r.proveedor_codigo ?? '',
          estadoErp(r.estado),
          Number(r.total ?? 0),
          r.fecha_prevista,
        ),
      ),
      ...(gw.data ?? []).map((r) =>
        fila(
          'GW',
          r.oficina,
          Number(r.numero),
          r.fecha_hora,
          r.proveedor_codigo ?? '',
          estadoGw(r.estado_pedido, !!r.actualizado || !!r.recibido),
          Number(r.total ?? 0),
          null,
        ),
      ),
    ]
    todas.sort((a, b) => b.fecha.localeCompare(a.fecha) || b.numero - a.numero)
    setFilas(todas)
  }, [meses])

  useEffect(() => {
    void cargar()
  }, [cargar])

  const cuenta = useMemo(() => {
    const c: Record<string, { n: number; importe: number }> = {}
    for (const f of filas ?? []) {
      for (const k of [f.estado, f.estado !== 'liquidado' ? 'abiertos' : '', f.retrasado ? 'retrasados' : '']) {
        if (!k) continue
        c[k] ??= { n: 0, importe: 0 }
        c[k].n++
        c[k].importe += f.total
      }
    }
    return c
  }, [filas])

  const vista = useMemo(() => {
    const t = texto.trim().toLowerCase()
    return (filas ?? []).filter(
      (f) =>
        (filtro === 'abiertos' ? f.estado !== 'liquidado' : filtro === 'retrasados' ? f.retrasado : f.estado === filtro) &&
        (!t || f.nombre.toLowerCase().includes(t) || f.proveedor.includes(t) || String(f.numero).includes(t)),
    )
  }, [filas, filtro, texto])

  const abrir = (f: Fila) =>
    navigate(
      f.origen === 'ERP' ? `/pedidos-proveedor/${encodeURIComponent(f.tienda)}/${f.numero}` : `/pedidos-geminiswin/${encodeURIComponent(f.tienda)}/${f.numero}`,
    )

  const boton = (k: Filtro, t: string) => (
    <button
      key={k}
      type="button"
      onClick={() => setFiltro(k)}
      aria-pressed={filtro === k}
      className={`h-8 rounded-full px-3 text-[13px] font-semibold ${filtro === k ? 'bg-[#1b2540] text-white' : 'border border-[#d5dcec] bg-white text-[#1b2540] hover:bg-[#f1f5fd]'}`}
    >
      {t} · {cuenta[k]?.n ?? 0}
    </button>
  )

  return (
    <section className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Dato titulo="Pedidos abiertos" valor={String(cuenta.abiertos?.n ?? 0)} sub={eur0(cuenta.abiertos?.importe ?? 0)} />
        <Dato titulo="Pendientes de enviar o de respuesta" valor={String(cuenta.pendiente?.n ?? 0)} sub={eur0(cuenta.pendiente?.importe ?? 0)} />
        <Dato
          titulo="Confirmados, en camino"
          valor={String((cuenta.confirmado?.n ?? 0) + (cuenta.pendiente_confirmar?.n ?? 0))}
          sub={eur0((cuenta.confirmado?.importe ?? 0) + (cuenta.pendiente_confirmar?.importe ?? 0))}
        />
        <Dato titulo="Ya deberían haber llegado" valor={String(cuenta.retrasados?.n ?? 0)} sub={eur0(cuenta.retrasados?.importe ?? 0)} alerta />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {boton('abiertos', 'Abiertos')}
        {ESTADOS.map((e) => boton(e.k, e.texto))}
        {boton('retrasados', 'Retrasados')}
        <span className="flex-1" />
        <label className="flex h-8 items-center gap-1.5 rounded-full border border-[#d5dcec] bg-white px-3 text-[13px]">
          <Search size={14} className="text-[#7a849c]" />
          <input value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Proveedor o nº" className="w-[150px] bg-transparent outline-none" />
        </label>
        <select
          value={meses}
          onChange={(e) => setMeses(Number(e.target.value))}
          className="h-8 rounded-full border border-[#d5dcec] bg-white px-2 text-[13px]"
          title="Desde cuándo"
        >
          <option value={1}>Último mes</option>
          <option value={3}>Últimos 3 meses</option>
          <option value={6}>Últimos 6 meses</option>
          <option value={12}>Último año</option>
        </select>
        <button
          type="button"
          onClick={() => void cargar()}
          className="flex h-8 items-center gap-1 rounded-full border border-[#d5dcec] bg-white px-3 text-[13px] font-semibold hover:bg-[#f1f5fd]"
        >
          <RefreshCw size={14} /> Actualizar
        </button>
      </div>

      {error && <p className="font-bold text-[#c42b1c]">{error}</p>}
      {filas === null && !error && <p className="text-[15px] text-[#5b6680]">Cargando los pedidos…</p>}

      {filas !== null && (
        <div className="overflow-x-auto rounded-2xl border border-[#e1e7f3] bg-white shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
          <table className="w-full min-w-[820px] border-collapse text-[14px]">
            <thead>
              <tr className="border-b border-[#e1e7f3] text-left text-[11px] font-bold uppercase tracking-wide text-[#5b6680]">
                <th className="px-4 py-2.5">Pedido</th>
                <th className="px-2 py-2.5">Fecha</th>
                <th className="px-2 py-2.5">Proveedor</th>
                <th className="px-2 py-2.5">Estado</th>
                <th className="px-2 py-2.5">Llegada prevista</th>
                <th className="px-4 py-2.5 text-right">Importe</th>
              </tr>
            </thead>
            <tbody>
              {vista.map((f) => {
                const e = ESTADOS.find((x) => x.k === f.estado)!
                return (
                  <tr key={f.key} onClick={() => abrir(f)} className="cursor-pointer border-b border-[#eef2f8] last:border-0 hover:bg-[#f6f9ff]">
                    <td className="whitespace-nowrap px-4 py-2">
                      <span
                        className={`mr-2 rounded px-1.5 py-0.5 text-[10px] font-bold ${f.origen === 'ERP' ? 'bg-[#e3f3e3] text-[#1A5C1A]' : 'bg-[#eef0f4] text-[#4b5563]'}`}
                        title={f.origen === 'ERP' ? 'Hecho en el ERP' : 'Hecho en GeminisWin'}
                      >
                        {f.origen === 'ERP' ? 'ERP' : 'GEMINIS'}
                      </span>
                      <b className="tabular-nums">
                        {f.tienda}-{f.numero}
                      </b>
                    </td>
                    <td className="whitespace-nowrap px-2 py-2 tabular-nums">
                      {fecha(f.fecha)} <span className="text-[12px] text-[#7a849c]">· hace {f.dias} d</span>
                    </td>
                    <td className="max-w-[340px] truncate px-2 py-2" title={f.nombre}>
                      {f.nombre || f.proveedor} <span className="text-[12px] text-[#7a849c]">{f.proveedor}</span>
                    </td>
                    <td className="px-2 py-2">
                      <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ color: e.color, background: e.fondo }}>
                        {e.texto}
                      </span>
                    </td>
                    <td className={`whitespace-nowrap px-2 py-2 tabular-nums ${f.retrasado ? 'font-bold text-[#c42b1c]' : ''}`}>
                      {f.estado === 'liquidado' ? '—' : fecha(f.llegada)}
                      {f.retrasado && <span className="ml-1 text-[12px]">· retrasado</span>}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-right font-semibold tabular-nums">{eur(f.total)}</td>
                  </tr>
                )
              })}
              {!vista.length && (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#5b6680]">
                    No hay pedidos con este filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function Dato({ titulo, valor, sub, alerta }: { titulo: string; valor: string; sub?: string; alerta?: boolean }) {
  return (
    <div className="rounded-2xl border border-[#e1e7f3] bg-white px-4 py-3 shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
      <div className="text-[13px] text-[#5b6680]">{titulo}</div>
      <div className={`text-[24px] font-bold tabular-nums ${alerta ? 'text-[#c42b1c]' : 'text-[#1b2540]'}`}>{valor}</div>
      {sub && <div className="text-[13px] font-semibold text-[#5b6680] tabular-nums">{sub}</div>}
    </div>
  )
}
