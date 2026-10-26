import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatGw } from '../../components/gw'
import { FilasVacias } from '../../components/gw/GwGridParts'
import type { ModoFicha } from './useFichaMaestro'

/** Recuadro de imagen de GeminisWin: la imagen ajustada o un aspa si no hay ninguna. */
export function ImagenRecuadro({ url, alto = 170 }: { url: string | null; alto?: number }) {
  const [rota, setRota] = useState(false)
  useEffect(() => setRota(false), [url])
  const limpia = url?.trim() || null
  return (
    <div className="relative overflow-hidden border border-[var(--gw-border)] bg-[var(--gw-face)]" style={{ height: alto }}>
      {limpia && !rota ? (
        <img src={limpia} alt="" className="h-full w-full object-contain" onError={() => setRota(true)} />
      ) : (
        <svg className="absolute inset-0 h-full w-full" preserveAspectRatio="none" viewBox="0 0 100 100" aria-label="Sin imagen">
          <line x1="0" y1="0" x2="100" y2="100" stroke="#9a9a9a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
          <line x1="100" y1="0" x2="0" y2="100" stroke="#9a9a9a" strokeWidth="0.5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
    </div>
  )
}

/** Línea bajo la barra de navegación: orden, nº de registro y modo, como en Artículos y Clientes. */
export function PieEstado({
  orden,
  idx,
  total,
  mode,
  que,
  porNombre = 'por descripción',
}: {
  orden: 'codigo' | 'nombre'
  idx: number
  total: number
  mode: ModoFicha
  que: string
  porNombre?: string
}) {
  return (
    <div className="text-[11px] text-[#444]">
      Orden: {orden === 'codigo' ? 'por código' : porNombre}
      {idx >= 0 ? ` · Registro ${idx + 1} de ${total}` : ''}
      {mode === 'alta' ? ` · Alta de ${que}` : mode === 'edicion' ? ' · Modificando' : ''}
    </div>
  )
}

interface ArticuloFila {
  codigo_interno: string
  descripcion: string
  pvp: number | null
  coste_neto: number | null
  activo: boolean
}

/** Rejilla de solo lectura con los artículos que usan un maestro (familia, marca, plantilla…). */
export function ArticulosDe({ columna, valor, titulo }: { columna: string; valor: string; titulo: string }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState<ArticuloFila[]>([])
  const [total, setTotal] = useState(0)
  const [sel, setSel] = useState(0)
  const [cargando, setCargando] = useState(true)

  useEffect(() => {
    if (!valor) return
    setCargando(true)
    supabase
      .from('articulo')
      .select('codigo_interno, descripcion, pvp, coste_neto, activo', { count: 'exact' })
      .eq(columna, valor)
      .order('codigo_interno')
      .limit(500)
      .then(({ data, count }) => {
        setRows((data ?? []) as ArticuloFila[])
        setTotal(count ?? 0)
        setSel(0)
        setCargando(false)
      })
  }, [columna, valor])

  const abrir = (r?: ArticuloFila) => r && navigate(`/articulos/${encodeURIComponent(r.codigo_interno)}`)

  return (
    <div className="flex flex-col gap-1" title={titulo}>
      <div className="h-[262px] overflow-y-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: '18%' }}>Código Interno</th>
              <th>Descripción</th>
              <th style={{ width: 110 }} className="text-right!">
                PVP General
              </th>
              <th style={{ width: 110 }} className="text-right!">
                Coste Neto
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr
                key={r.codigo_interno}
                className={i === sel ? 'gw-selected' : r.activo ? '' : 'text-[#8a8a8a]'}
                onClick={() => setSel(i)}
                onDoubleClick={() => abrir(r)}
              >
                <td>{r.codigo_interno}</td>
                <td>{r.descripcion}</td>
                <td className="text-right">{formatGw(r.pvp ?? 0, 3)}</td>
                <td className="text-right">{formatGw(r.coste_neto ?? 0, 3)}</td>
              </tr>
            ))}
            <FilasVacias cols={4} ocupadas={rows.length} total={11} />
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3 text-[13px]">
        <span className="text-[#1a4fd0]">
          {cargando ? 'Cargando…' : `Nº Artículos: ${total}${total > rows.length ? ` (se muestran ${rows.length})` : ''}`}
        </span>
        <button type="button" className="gw-btn" disabled={!rows[sel]} onClick={() => abrir(rows[sel])}>
          Ir al Artículo
        </button>
      </div>
    </div>
  )
}
