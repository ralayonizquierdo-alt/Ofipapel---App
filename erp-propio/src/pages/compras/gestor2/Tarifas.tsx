// Gestor de Pedidos 2.0 → Tarifas, 18/11/2026 (migración 20261118_compras_tarifas.sql).
//
// Rober: «subir las tarifas de los proveedores para que el propio ERP diga qué proveedores son más baratos en
// artículos punteros que suelen compartir varios proveedores».
//  · Subir tarifa: Excel (.xlsx o .xls antiguo) o CSV de un proveedor. Se eligen las columnas (se adivinan por el
//    encabezado) y el ERP empareja cada línea por la referencia de compra de ese proveedor o por el código de barras.
//    No toca los costes de GeminisWin: las tarifas solo sirven para comparar.
//  · Qué cambia: precio de la tarifa frente al coste actual, y si otro proveedor lo tiene más barato.
//  · Comparativa: los artículos que más pesan con precio en dos o más proveedores, y cuánto se ahorraría al año.

import { useEffect, useMemo, useState } from 'react'
import { Upload } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { leerHoja } from '../../../lib/hojaCalculo'
import { leerExcelConLibreria } from '../../../lib/excelGeminiswin'

const num = (v: unknown) => Number(v ?? 0)
const eur = (n: number) => n.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 3 }) + ' €'
const eur0 = (n: number) => Math.round(n).toLocaleString('de-DE') + ' €'
const pct = (n: number) => `${n > 0 ? '+' : ''}${n.toLocaleString('de-DE', { maximumFractionDigits: 1 })} %`
const fecha = (iso: string | null) => (iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '')

/** «1.234,56 €», «1234.56», «12,5» → número; NaN si no lo es. */
function leerNumero(t: string): number {
  let s = (t ?? '').replace(/[€%\s]/g, '')
  if (!s) return NaN
  const coma = s.lastIndexOf(','), punto = s.lastIndexOf('.')
  if (coma >= 0 && punto >= 0) s = coma > punto ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  else if (coma >= 0) s = s.replace(/\./g, '').replace(',', '.')
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : NaN
}

type Campo = 'ref' | 'ean' | 'desc' | 'precio' | 'dto'
const CAMPOS: { k: Campo; t: string; obligatorio?: boolean }[] = [
  { k: 'ref', t: 'Referencia del proveedor' },
  { k: 'ean', t: 'Código de barras (EAN)' },
  { k: 'desc', t: 'Descripción' },
  { k: 'precio', t: 'Precio', obligatorio: true },
  { k: 'dto', t: 'Descuento %' },
]
const PISTAS: Record<Campo, RegExp> = {
  ref: /ref|c[oó]d(igo)?\.?\s*(prov|art|fab)|^c[oó]digo$|^art[ií]culo$|part.?n/i,
  ean: /ean|barras|gtin|upc/i,
  desc: /desc(rip)?|denomin|nombre|concepto/i,
  precio: /precio|p\.?v\.?d|tarifa|neto|coste|importe|pvp/i,
  dto: /dto|descuento|desc\.?\s*%/i,
}

/** Fila de encabezados: la primera (de las 15 primeras) en la que hay al menos dos nombres reconocibles. */
function adivinar(t: string[][]) {
  for (let i = 0; i < Math.min(15, t.length); i++) {
    const fila = t[i].map((c) => (c ?? '').trim())
    const m: Partial<Record<Campo, number>> = {}
    for (const { k } of CAMPOS) {
      const j = fila.findIndex((c, idx) => c && PISTAS[k].test(c) && !Object.values(m).includes(idx) && !(k === 'desc' && PISTAS.dto.test(c)))
      if (j >= 0) m[k] = j
    }
    if (Object.keys(m).length >= 2) return { cabecera: i, mapa: m }
  }
  return { cabecera: -1, mapa: {} as Partial<Record<Campo, number>> }
}

interface Prov {
  codigo: string
  nombre: string | null
}
interface Tarifa {
  id: number
  proveedor_codigo: string
  proveedor_nombre: string | null
  archivo: string | null
  fecha_tarifa: string
  filas: number
  emparejadas: number
  activa: boolean
  cargada_en: string
}
interface Cambio {
  articulo_codigo: string
  descripcion: string
  referencia: string | null
  emparejado_por: string | null
  precio_tarifa: number
  coste_actual: number | null
  diferencia_pct: number | null
  venta_12m: number | null
  impacto_anual: number | null
  mejor_otro_nombre: string | null
  mejor_otro_precio: number | null
}
interface Comp {
  articulo_codigo: string
  descripcion: string
  venta_12m: number
  proveedores: number
  habitual_nombre: string | null
  habitual_precio: number | null
  mejor_codigo: string | null
  mejor_nombre: string | null
  mejor_precio: number | null
  mejor_origen: string | null
  mejor_fecha: string | null
  ahorro_pct: number | null
  ahorro_anual: number | null
}

export function Tarifas() {
  const [provs, setProvs] = useState<Prov[]>([])
  const [tarifas, setTarifas] = useState<Tarifa[] | null>(null)
  const [vistaCambios, setVistaCambios] = useState<Tarifa | null>(null)
  const [comparativa, setComparativa] = useState(false)

  const cargarTarifas = () =>
    supabase.rpc('fn_compras_tarifas').then(({ data }) => setTarifas(((data ?? []) as Tarifa[]).map((t) => ({ ...t, filas: num(t.filas), emparejadas: num(t.emparejadas) }))))

  useEffect(() => {
    supabase
      .from('proveedor')
      .select('codigo, nombre')
      .order('nombre')
      .limit(2000)
      .then(({ data }) => setProvs((data ?? []) as Prov[]))
    void cargarTarifas()
  }, [])

  return (
    <section className="flex flex-col gap-4">
      <SubirTarifa
        provs={provs}
        onCargada={(t) => {
          void cargarTarifas()
          setVistaCambios(t)
        }}
      />

      {tarifas && tarifas.length > 0 && (
        <div className="rounded-2xl border border-[#e1e7f3] bg-white shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
          <h2 className="border-b border-[#e1e7f3] px-4 py-3 text-[17px] font-bold">Tarifas subidas</h2>
          <table className="w-full border-collapse text-[14px]">
            <tbody>
              {tarifas.map((t) => (
                <tr key={t.id} className="border-t border-[#eef2f8]">
                  <td className="px-4 py-2">
                    <div className="font-semibold">{t.proveedor_nombre ?? t.proveedor_codigo}</div>
                    <div className="text-[12px] text-[#7a849c]">
                      {t.archivo ?? ''} · subida el {fecha(t.cargada_en.slice(0, 10))}
                      {t.activa ? ' · la que vale' : ' · sustituida por una más nueva'}
                    </div>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">
                    {t.emparejadas.toLocaleString('de-DE')} de {t.filas.toLocaleString('de-DE')} emparejadas
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button type="button" onClick={() => setVistaCambios(t)} className="text-[13px] font-semibold text-[#1d3a8a] underline">
                      Ver qué cambia
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {vistaCambios && <Cambios t={vistaCambios} onCerrar={() => setVistaCambios(null)} />}

      <div className="rounded-2xl border border-[#e1e7f3] bg-white p-4 shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[17px] font-bold">¿Quién es más barato?</h2>
            <p className="text-[14px] text-[#5b6680]">Los artículos que más pesan con precio en dos o más proveedores: compras de los últimos 2 años y tarifas subidas.</p>
          </div>
          {!comparativa && (
            <button type="button" onClick={() => setComparativa(true)} className="h-9 rounded-full bg-[#1d3a8a] px-5 text-[14px] font-semibold text-white hover:bg-[#16306f]">
              Ver comparativa
            </button>
          )}
        </div>
        {comparativa && <Comparativa />}
      </div>
    </section>
  )
}

function SubirTarifa({ provs, onCargada }: { provs: Prov[]; onCargada: (t: Tarifa) => void }) {
  const [prov, setProv] = useState('')
  const [tabla, setTabla] = useState<string[][] | null>(null)
  const [archivo, setArchivo] = useState('')
  const [cabecera, setCabecera] = useState(-1)
  const [mapa, setMapa] = useState<Partial<Record<Campo, number>>>({})
  const [error, setError] = useState<string | null>(null)
  const [estado, setEstado] = useState<string | null>(null)
  const [subiendo, setSubiendo] = useState(false)

  const codigo = useMemo(() => {
    const t = prov.trim()
    const p = provs.find((x) => x.codigo === t || `${x.codigo} · ${x.nombre ?? ''}` === t)
    return p?.codigo ?? null
  }, [prov, provs])

  async function abrir(f: File | undefined) {
    setError(null)
    setEstado(null)
    setTabla(null)
    if (!f) return
    try {
      const t = /\.xlsx?$/i.test(f.name) ? await leerExcelConLibreria(f) : await leerHoja(f)
      if (!t.length) return setError('El fichero está vacío.')
      const g = adivinar(t)
      setArchivo(f.name)
      setTabla(t)
      setCabecera(g.cabecera)
      setMapa(g.mapa)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo leer el fichero.')
    }
  }

  const columnas = useMemo(() => {
    if (!tabla) return []
    const n = Math.max(...tabla.slice(0, 50).map((f) => f.length))
    const cab = cabecera >= 0 ? tabla[cabecera] : []
    return Array.from({ length: n }, (_, j) => ({ j, nombre: (cab[j] ?? '').trim() || `Columna ${j + 1}` }))
  }, [tabla, cabecera])

  const lineas = useMemo(() => {
    if (!tabla || mapa.precio == null) return []
    const v = (f: string[], k: Campo) => (mapa[k] != null ? (f[mapa[k]!] ?? '').trim() : '')
    return tabla
      .slice(cabecera + 1)
      .map((f, i) => ({ n: i + 1, r: v(f, 'ref'), e: v(f, 'ean'), d: v(f, 'desc'), p: leerNumero(v(f, 'precio')), dto: mapa.dto != null ? leerNumero(v(f, 'dto')) : 0 }))
      .filter((l) => Number.isFinite(l.p) && l.p >= 0 && (l.r || l.e))
      .map((l) => ({ ...l, dto: Number.isFinite(l.dto) ? l.dto : 0 }))
  }, [tabla, cabecera, mapa])

  async function subir() {
    setError(null)
    if (!codigo) return setError('Elige el proveedor de la lista.')
    if (!lineas.length) return setError('No hay líneas con precio y referencia o código de barras: revisa las columnas.')
    setSubiendo(true)
    try {
      const { data: id, error: e1 } = await supabase.rpc('fn_compras_tarifa_crear', { p_proveedor: codigo, p_archivo: archivo, p_fecha: null })
      if (e1) throw new Error(e1.message)
      for (let i = 0; i < lineas.length; i += 2000) {
        setEstado(`Subiendo ${Math.min(i + 2000, lineas.length).toLocaleString('de-DE')} de ${lineas.length.toLocaleString('de-DE')} líneas…`)
        const { error: e2 } = await supabase.rpc('fn_compras_tarifa_lineas', { p_tarifa: id, p_lineas: lineas.slice(i, i + 2000) })
        if (e2) throw new Error(e2.message)
      }
      const { data: r, error: e3 } = await supabase.rpc('fn_compras_tarifa_cerrar', { p_tarifa: id })
      if (e3) throw new Error(e3.message)
      const d = r as { filas: number; emparejadas: number; por_referencia: number; por_ean: number }
      setEstado(`Tarifa subida: ${d.emparejadas.toLocaleString('de-DE')} de ${d.filas.toLocaleString('de-DE')} líneas emparejadas con artículos (${d.por_referencia} por referencia, ${d.por_ean} por código de barras).`)
      setTabla(null)
      const p = provs.find((x) => x.codigo === codigo)
      onCargada({ id: Number(id), proveedor_codigo: codigo, proveedor_nombre: p?.nombre ?? null, archivo, fecha_tarifa: '', filas: d.filas, emparejadas: d.emparejadas, activa: true, cargada_en: new Date().toISOString() })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir la tarifa.')
      setEstado(null)
    } finally {
      setSubiendo(false)
    }
  }

  return (
    <div className="rounded-2xl border border-[#e1e7f3] bg-white p-4 shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
      <h2 className="text-[17px] font-bold">Subir tarifa de un proveedor</h2>
      <p className="mb-3 text-[14px] text-[#5b6680]">
        Excel (también el antiguo .xls) o CSV. Cada línea se empareja con el artículo por la referencia de ese proveedor o por el código de barras. No cambia los costes de GeminisWin: sirve para comparar.
      </p>
      <div className="flex flex-wrap items-end gap-3 text-[14px]">
        <label className="flex flex-col gap-1">
          <span className="font-semibold text-[#33415f]">Proveedor</span>
          <input list="tarifa-provs" value={prov} onChange={(e) => setProv(e.target.value)} placeholder="Código o nombre" className="h-9 w-[320px] max-w-full rounded-lg border border-[#c9d3e8] px-2" />
          <datalist id="tarifa-provs">
            {provs.map((p) => (
              <option key={p.codigo} value={`${p.codigo} · ${p.nombre ?? ''}`} />
            ))}
          </datalist>
        </label>
        <label className="flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-[#d5dcec] px-4 font-semibold hover:bg-[#f1f5fd]">
          <Upload size={15} /> {archivo && tabla ? archivo : 'Elegir fichero'}
          <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={(e) => void abrir(e.target.files?.[0])} />
        </label>
      </div>

      {tabla && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="flex flex-wrap items-end gap-3 text-[14px]">
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-[#33415f]">Fila de encabezados</span>
              <select value={cabecera} onChange={(e) => setCabecera(Number(e.target.value))} className="h-9 rounded-lg border border-[#c9d3e8] px-2">
                <option value={-1}>No tiene</option>
                {tabla.slice(0, 15).map((f, i) => (
                  <option key={i} value={i}>
                    Fila {i + 1}: {f.filter(Boolean).slice(0, 3).join(' · ').slice(0, 40)}
                  </option>
                ))}
              </select>
            </label>
            {CAMPOS.map(({ k, t, obligatorio }) => (
              <label key={k} className="flex flex-col gap-1">
                <span className="font-semibold text-[#33415f]">
                  {t}
                  {obligatorio ? ' *' : ''}
                </span>
                <select value={mapa[k] ?? ''} onChange={(e) => setMapa({ ...mapa, [k]: e.target.value === '' ? undefined : Number(e.target.value) })} className="h-9 max-w-[200px] rounded-lg border border-[#c9d3e8] px-2">
                  <option value="">—</option>
                  {columnas.map((c) => (
                    <option key={c.j} value={c.j}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <div className="overflow-auto rounded-xl border border-[#e1e7f3]">
            <table className="w-full border-collapse text-[13px]">
              <thead className="bg-[#f4f7fc] text-left text-[12px] uppercase tracking-wide text-[#5b6680]">
                <tr>
                  <th className="px-2 py-1.5">Referencia</th>
                  <th className="px-2 py-1.5">EAN</th>
                  <th className="px-2 py-1.5">Descripción</th>
                  <th className="px-2 py-1.5 text-right">Precio</th>
                  <th className="px-2 py-1.5 text-right">Dto.</th>
                </tr>
              </thead>
              <tbody>
                {lineas.slice(0, 6).map((l) => (
                  <tr key={l.n} className="border-t border-[#eef2f8]">
                    <td className="px-2 py-1.5">{l.r}</td>
                    <td className="px-2 py-1.5">{l.e}</td>
                    <td className="px-2 py-1.5">{l.d}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{eur(l.p)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{l.dto ? `${l.dto} %` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[14px] text-[#5b6680]">
              {lineas.length.toLocaleString('de-DE')} líneas con precio de {Math.max(0, tabla.length - cabecera - 1).toLocaleString('de-DE')} filas
            </span>
            <button type="button" onClick={() => void subir()} disabled={subiendo || !lineas.length || !codigo} className="h-10 rounded-full bg-[#1d3a8a] px-5 text-[15px] font-semibold text-white hover:bg-[#16306f] disabled:opacity-50">
              {subiendo ? 'Subiendo…' : 'Subir tarifa'}
            </button>
          </div>
        </div>
      )}
      {estado && (
        <p role="status" className="mt-2 text-[14px] font-bold text-[#127a12]">
          {estado}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-2 text-[14px] font-bold text-[#c42b1c]">
          {error}
        </p>
      )}
    </div>
  )
}

function Cambios({ t, onCerrar }: { t: Tarifa; onCerrar: () => void }) {
  const [filas, setFilas] = useState<Cambio[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    supabase.rpc('fn_compras_tarifa_cambios', { p_tarifa: t.id }).then(({ data, error: e }) => {
      if (e) return setError(e.message)
      setFilas(
        ((data ?? []) as Cambio[])
          .map((c) => ({ ...c, precio_tarifa: num(c.precio_tarifa), coste_actual: c.coste_actual == null ? null : num(c.coste_actual), diferencia_pct: c.diferencia_pct == null ? null : num(c.diferencia_pct), impacto_anual: c.impacto_anual == null ? null : num(c.impacto_anual), mejor_otro_precio: c.mejor_otro_precio == null ? null : num(c.mejor_otro_precio) }))
          .sort((a, b) => Math.abs(b.impacto_anual ?? 0) - Math.abs(a.impacto_anual ?? 0)),
      )
    })
  }, [t.id])
  const suben = (filas ?? []).filter((c) => (c.diferencia_pct ?? 0) > 0.5).length
  const bajan = (filas ?? []).filter((c) => (c.diferencia_pct ?? 0) < -0.5).length
  const otros = (filas ?? []).filter((c) => c.mejor_otro_precio != null).length

  return (
    <div className="rounded-2xl border border-[#e1e7f3] bg-white shadow-[0_1px_3px_rgba(20,40,90,0.08)]">
      <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#e1e7f3] px-4 py-3">
        <h2 className="text-[17px] font-bold">Qué cambia con la tarifa de {t.proveedor_nombre ?? t.proveedor_codigo}</h2>
        <button type="button" onClick={onCerrar} className="text-[13px] text-[#5b6680] underline">
          Cerrar
        </button>
      </div>
      {error && <p className="px-4 py-2 text-[14px] font-bold text-[#c42b1c]">{error}</p>}
      {!filas && !error && <p className="px-4 py-2 text-[14px] text-[#5b6680]">Cargando…</p>}
      {filas && (
        <>
          <p className="px-4 py-2 text-[14px] text-[#33415f]">
            {filas.length.toLocaleString('de-DE')} artículos · <b className="text-[#b42318]">{suben} suben</b> · <b className="text-[#127a12]">{bajan} bajan</b> · {otros} más baratos en otro proveedor
          </p>
          <div className="max-h-[55vh] overflow-auto">
            <table className="w-full border-collapse text-[14px]">
              <thead className="sticky top-0 bg-[#f4f7fc] text-left text-[12px] uppercase tracking-wide text-[#5b6680]">
                <tr>
                  <th className="px-3 py-2">Artículo</th>
                  <th className="px-3 py-2 text-right">Ahora</th>
                  <th className="px-3 py-2 text-right">Tarifa</th>
                  <th className="px-3 py-2 text-right">Cambio</th>
                  <th className="px-3 py-2 text-right" title="Diferencia de precio × lo vendido en 12 meses">Al año</th>
                  <th className="px-3 py-2">Más barato en</th>
                </tr>
              </thead>
              <tbody>
                {filas.slice(0, 500).map((c) => (
                  <tr key={c.articulo_codigo} className="border-t border-[#eef2f8]">
                    <td className="px-3 py-2">
                      <div className="font-semibold">{c.descripcion}</div>
                      <div className="text-[12px] text-[#7a849c]">
                        {c.articulo_codigo}
                        {c.referencia ? ` · ref. ${c.referencia}` : ''}
                        {c.emparejado_por === 'ean' ? ' · por código de barras' : ''}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.coste_actual != null ? eur(c.coste_actual) : '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{eur(c.precio_tarifa)}</td>
                    <td className={`px-3 py-2 text-right font-semibold tabular-nums ${(c.diferencia_pct ?? 0) > 0.5 ? 'text-[#b42318]' : (c.diferencia_pct ?? 0) < -0.5 ? 'text-[#127a12]' : ''}`}>{c.diferencia_pct != null ? pct(c.diferencia_pct) : ''}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{c.impacto_anual ? eur0(c.impacto_anual) : ''}</td>
                    <td className="px-3 py-2 text-[13px]">{c.mejor_otro_nombre ? `${c.mejor_otro_nombre}: ${eur(c.mejor_otro_precio ?? 0)}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

function Comparativa() {
  const [filas, setFilas] = useState<Comp[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    supabase.rpc('fn_compras_comparativa', { p_limite: 300, p_proveedor: null }).then(({ data, error: e }) => {
      if (e) return setError(e.message)
      setFilas(((data ?? []) as Comp[]).map((c) => ({ ...c, venta_12m: num(c.venta_12m), habitual_precio: c.habitual_precio == null ? null : num(c.habitual_precio), mejor_precio: c.mejor_precio == null ? null : num(c.mejor_precio), ahorro_pct: c.ahorro_pct == null ? null : num(c.ahorro_pct), ahorro_anual: c.ahorro_anual == null ? null : num(c.ahorro_anual) })))
    })
  }, [])
  const ahorro = (filas ?? []).reduce((s, c) => s + Math.max(0, c.ahorro_anual ?? 0), 0)
  const conAhorro = (filas ?? []).filter((c) => (c.ahorro_anual ?? 0) > 0).length

  if (error) return <p className="mt-2 text-[14px] font-bold text-[#c42b1c]">{error}</p>
  if (!filas) return <p className="mt-2 text-[14px] text-[#5b6680]">Comparando precios…</p>
  return (
    <div className="mt-3">
      <p className="mb-2 text-[14px] text-[#33415f]">
        {filas.length} artículos con varios proveedores · en <b>{conAhorro}</b> hay otro más barato que el habitual · ahorro posible <b>{eur0(ahorro)} al año</b> (con lo vendido en 12 meses). Comprueba que sea el mismo formato (caja, unidades) antes de cambiar.
      </p>
      <div className="max-h-[60vh] overflow-auto rounded-xl border border-[#e1e7f3]">
        <table className="w-full border-collapse text-[14px]">
          <thead className="sticky top-0 bg-[#f4f7fc] text-left text-[12px] uppercase tracking-wide text-[#5b6680]">
            <tr>
              <th className="px-3 py-2">Artículo</th>
              <th className="px-3 py-2">Habitual</th>
              <th className="px-3 py-2">Más barato</th>
              <th className="px-3 py-2 text-right">Ahorro</th>
              <th className="px-3 py-2 text-right">Al año</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((c) => {
              const otro = (c.ahorro_anual ?? 0) > 0
              return (
                <tr key={c.articulo_codigo} className="border-t border-[#eef2f8]">
                  <td className="px-3 py-2">
                    <div className="font-semibold">{c.descripcion}</div>
                    <div className="text-[12px] text-[#7a849c]">
                      {c.articulo_codigo} · vende {Math.round(c.venta_12m).toLocaleString('de-DE')} al año · {c.proveedores} proveedores
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[13px]">
                    {c.habitual_nombre ?? '—'}
                    <div className="tabular-nums">{c.habitual_precio != null ? eur(c.habitual_precio) : 'sin precio reciente'}</div>
                  </td>
                  <td className={`px-3 py-2 text-[13px] ${otro ? 'font-semibold text-[#127a12]' : 'text-[#5b6680]'}`}>
                    {otro ? c.mejor_nombre : 'El habitual'}
                    {otro && (
                      <div className="tabular-nums">
                        {eur(c.mejor_precio ?? 0)} <span className="font-normal text-[#7a849c]">({c.mejor_origen === 'Tarifa' ? 'tarifa' : 'última compra'}{c.mejor_fecha ? ` ${fecha(c.mejor_fecha)}` : ''})</span>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{otro && c.ahorro_pct != null ? `${c.ahorro_pct.toLocaleString('de-DE')} %` : ''}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{otro ? eur0(c.ahorro_anual ?? 0) : ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
