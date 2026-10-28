// SIN CAPTURA de GeminisWin: Utilidades → Examinar (F11). En GeminisWin examina y/o edita la
// tabla activa; en el ERP es un visor de SOLO LECTURA de cualquier tabla de la base de datos,
// para administradores: lista de tablas a la izquierda y rejilla paginada (100 filas) con filtro
// «contiene» por columna y orden al pulsar la cabecera. Lee con fn_examinar (SECURITY INVOKER,
// transacción de solo lectura y con la RLS del usuario). No escribe nada.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronFirst, ChevronLast, ChevronLeft, ChevronRight } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { useEsAdministrador } from '../archivo/comun'
import { Mensaje } from './comun'
import { cargarTablasErp, type TablaErp } from './datos'

const POR_PAGINA = 100

function celda(v: unknown): string {
  if (v == null) return ''
  if (typeof v === 'object') return JSON.stringify(v)
  if (typeof v === 'boolean') return v ? 'Sí' : 'No'
  return String(v)
}

export function ExaminarPage() {
  const admin = useEsAdministrador()
  const navigate = useNavigate()
  const [tablas, setTablas] = useState<TablaErp[]>([])
  const [buscaTabla, setBuscaTabla] = useState('')
  const [tabla, setTabla] = useState<string | null>(null)
  const [filtros, setFiltros] = useState<Record<string, string>>({})
  const [aplicados, setAplicados] = useState<Record<string, string>>({})
  const [orden, setOrden] = useState<{ col: string; desc: boolean } | null>(null)
  const [pagina, setPagina] = useState(0)
  const [datos, setDatos] = useState<{ total: number; filas: Record<string, unknown>[] } | null>(null)
  const [sel, setSel] = useState<number | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!admin) return
    cargarTablasErp()
      .then(setTablas)
      .catch((e: Error) => setError(e.message))
  }, [admin])

  const def = tablas.find((t) => t.tabla === tabla)
  const visibles = useMemo(() => tablas.filter((t) => t.tabla.includes(buscaTabla.trim().toLowerCase())), [tablas, buscaTabla])

  const cargar = useCallback(async () => {
    if (!tabla) return
    setCargando(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_examinar', {
      p_tabla: tabla,
      p_filtros: aplicados,
      p_orden: orden?.col ?? null,
      p_desc: orden?.desc ?? false,
      p_desde: pagina * POR_PAGINA,
      p_limite: POR_PAGINA,
    })
    setCargando(false)
    if (e) {
      setError(e.message)
      setDatos(null)
      return
    }
    setDatos(data as { total: number; filas: Record<string, unknown>[] })
    setSel(null)
  }, [tabla, aplicados, orden, pagina])

  useEffect(() => {
    cargar()
  }, [cargar])

  function abrirTabla(t: string) {
    setTabla(t)
    setFiltros({})
    setAplicados({})
    setOrden(null)
    setPagina(0)
    setDatos(null)
  }

  function aplicarFiltros() {
    setAplicados(Object.fromEntries(Object.entries(filtros).filter(([, v]) => v.trim() !== '')))
    setPagina(0)
  }

  const total = datos?.total ?? 0
  const ultima = Math.max(0, Math.ceil(total / POR_PAGINA) - 1)

  if (admin === false) {
    return (
      <div className="p-2 text-[12px]">
        <Mensaje texto="Examinar solo está disponible para los administradores." error />
      </div>
    )
  }

  const btnNav = 'gw-btn flex h-[22px] w-[26px] items-center justify-center !px-0'
  return (
    <div className="flex h-full min-h-[480px] gap-1.5 text-[12px]">
      {/* Tablas */}
      <div className="flex w-[220px] flex-none flex-col gap-1">
        <input className="gw-input" placeholder="Buscar tabla…" value={buscaTabla} onChange={(e) => setBuscaTabla(e.target.value)} />
        <div className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white">
          <table className="gw-grid">
            <thead className="sticky top-0">
              <tr>
                <th>Tabla</th>
                <th className="w-[56px] text-right">Filas≈</th>
              </tr>
            </thead>
            <tbody>
              {visibles.map((t) => (
                <tr key={t.tabla} className={t.tabla === tabla ? 'gw-selected' : 'cursor-default'} onClick={() => abrirTabla(t.tabla)}>
                  <td className="max-w-[150px] truncate">{t.tabla}</td>
                  <td className="text-right">{t.filas_estimadas?.toLocaleString('es-ES') ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button type="button" className="gw-btn" onClick={() => navigate('/')}>
          Salir
        </button>
      </div>

      {/* Rejilla */}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex h-[24px] flex-none items-center gap-1">
          <span className="font-bold">{tabla ?? 'Elige una tabla'}</span>
          {def && <span className="text-[#444]">· {def.columnas.length} columnas · clave {def.pk.length ? def.pk.join(', ') : '(sin clave)'}</span>}
          <span className="ml-2 border border-[#c9a400] bg-[#fff7cc] px-1.5 text-[11px]">Solo lectura</span>
          <span className="flex-1" />
          {tabla && (
            <>
              <button type="button" className="gw-btn" onClick={aplicarFiltros} title="Aplica los filtros escritos bajo las cabeceras (Intro)">
                Filtrar
              </button>
              <button
                type="button"
                className="gw-btn"
                disabled={!Object.keys(aplicados).length && !Object.values(filtros).some(Boolean)}
                onClick={() => {
                  setFiltros({})
                  setAplicados({})
                  setPagina(0)
                }}
              >
                Quitar filtros
              </button>
              <span className="ml-2 tabular-nums">
                {total ? `${(pagina * POR_PAGINA + 1).toLocaleString('es-ES')}-${Math.min(total, (pagina + 1) * POR_PAGINA).toLocaleString('es-ES')} de ${total.toLocaleString('es-ES')}` : '0 filas'}
              </span>
              <button type="button" className={btnNav} title="Primera página" disabled={pagina === 0} onClick={() => setPagina(0)}>
                <ChevronFirst size={14} />
              </button>
              <button type="button" className={btnNav} title="Página anterior" disabled={pagina === 0} onClick={() => setPagina((p) => p - 1)}>
                <ChevronLeft size={14} />
              </button>
              <button type="button" className={btnNav} title="Página siguiente" disabled={pagina >= ultima} onClick={() => setPagina((p) => p + 1)}>
                <ChevronRight size={14} />
              </button>
              <button type="button" className={btnNav} title="Última página" disabled={pagina >= ultima} onClick={() => setPagina(ultima)}>
                <ChevronLast size={14} />
              </button>
            </>
          )}
        </div>
        {error && <Mensaje texto={error} error />}
        <div className="relative min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white">
          {def && (
            <table className="gw-grid w-max min-w-full">
              <thead className="sticky top-0 z-[1]">
                <tr>
                  {def.columnas.map((c) => (
                    <th
                      key={c.nombre}
                      title={`${c.nombre} (${c.tipo}) · pulsa para ordenar`}
                      className="cursor-pointer hover:bg-[#e5f3ff]"
                      onClick={() => {
                        setOrden((o) => (o?.col === c.nombre ? (o.desc ? null : { col: c.nombre, desc: true }) : { col: c.nombre, desc: false }))
                        setPagina(0)
                      }}
                    >
                      {c.nombre}
                      {orden?.col === c.nombre ? (orden.desc ? ' ▼' : ' ▲') : ''}
                    </th>
                  ))}
                </tr>
                <tr>
                  {def.columnas.map((c) => (
                    <th key={c.nombre} className="!p-[1px]">
                      <input
                        className={`gw-input !h-[20px] w-full min-w-[60px] !text-[12px] ${aplicados[c.nombre] ? '!bg-[#fff7cc]' : ''}`}
                        value={filtros[c.nombre] ?? ''}
                        title={`Filtrar ${c.nombre} (contiene) · Intro`}
                        onChange={(e) => setFiltros((f) => ({ ...f, [c.nombre]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && aplicarFiltros()}
                      />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {datos?.filas.map((f, i) => (
                  <tr key={i} className={sel === i ? 'gw-selected' : ''} onClick={() => setSel(i)}>
                    {def.columnas.map((c) => {
                      const t = celda(f[c.nombre])
                      return (
                        <td key={c.nombre} className="max-w-[260px] truncate whitespace-nowrap" title={t.length > 30 ? t : undefined}>
                          {t}
                        </td>
                      )
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {cargando && <div className="absolute right-2 top-1 bg-white px-1 text-[#444]">Cargando…</div>}
        </div>
      </div>
    </div>
  )
}
