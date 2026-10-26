import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { GwField, GwGroup, GwInput, formatGw } from '../../components/gw'

interface Fila {
  codigo_interno: string
  descripcion: string
  codigo_venta: string | null
  familia_codigo: string | null
  proveedor_habitual_codigo: string | null
  pvp: number | null
  coste_neto: number | null
  activo: boolean
}

const VACIO = { codigo: '', descripcion: '', barras: '', familia: '', proveedor: '' }

function limpio(s: string) {
  return s.trim().replace(/[,%()]/g, ' ')
}

/** «Lista / filtro» de Artículos al estilo GeminisWin: filtros arriba y rejilla navegable. */
export function ArticulosListPage() {
  const navigate = useNavigate()
  const [filtros, setFiltros] = useState(VACIO)
  const [rows, setRows] = useState<Fila[]>([])
  const [sel, setSel] = useState(0)
  const [cargando, setCargando] = useState(true)
  const gridRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const t = setTimeout(async () => {
      setCargando(true)
      let q = supabase
        .from('articulo')
        .select('codigo_interno, descripcion, codigo_venta, familia_codigo, proveedor_habitual_codigo, pvp, coste_neto, activo')
        .order('codigo_interno')
        .limit(500)
      if (limpio(filtros.codigo)) q = q.ilike('codigo_interno', `${limpio(filtros.codigo)}%`)
      if (limpio(filtros.descripcion)) q = q.ilike('descripcion', `%${limpio(filtros.descripcion)}%`)
      if (limpio(filtros.barras)) q = q.ilike('codigo_barras_principal', `%${limpio(filtros.barras)}%`)
      if (limpio(filtros.familia)) q = q.ilike('familia_codigo', `${limpio(filtros.familia)}%`)
      if (limpio(filtros.proveedor)) q = q.ilike('proveedor_habitual_codigo', `${limpio(filtros.proveedor)}%`)
      const { data } = await q
      setRows((data ?? []) as Fila[])
      setSel(0)
      setCargando(false)
    }, 250)
    return () => clearTimeout(t)
  }, [filtros])

  const abrir = (r?: Fila) => r && navigate(`/articulos/${encodeURIComponent(r.codigo_interno)}`)

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(s + 1, rows.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter') abrir(rows[sel])
  }

  useEffect(() => {
    gridRef.current?.querySelector('tr.gw-selected')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const campo = (key: keyof typeof VACIO, label: string, className = '') => (
    <GwField label={label} className={className}>
      <GwInput value={filtros[key]} onChange={(e) => setFiltros((f) => ({ ...f, [key]: e.target.value }))} onKeyDown={onKey} />
    </GwField>
  )

  return (
    <div className="flex flex-col gap-1.5" onKeyDown={onKey}>
      <GwGroup title="Filtro" className="grid grid-cols-[140px_minmax(0,1fr)_170px_110px_110px] gap-x-2">
        {campo('codigo', 'Código Interno')}
        {campo('descripcion', 'Descripción')}
        {campo('barras', 'Código de Barras')}
        {campo('familia', 'Familia')}
        {campo('proveedor', 'Proveedor')}
      </GwGroup>
      <div ref={gridRef} tabIndex={0} className="h-[calc(100vh-260px)] min-h-[240px] overflow-y-auto border border-[var(--gw-border)] bg-white outline-none">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 120 }}>Código Interno</th>
              <th>Descripción</th>
              <th style={{ width: 110 }}>Código Venta</th>
              <th style={{ width: 80 }}>Familia</th>
              <th style={{ width: 80 }}>Proveedor</th>
              <th style={{ width: 100 }} className="text-right!">
                PVP General
              </th>
              <th style={{ width: 100 }} className="text-right!">
                Coste Neto
              </th>
            </tr>
          </thead>
          <tbody>
            {!cargando && rows.length === 0 && (
              <tr>
                <td colSpan={7} className="text-center text-[#6d6d6d]">
                  Ningún artículo cumple el filtro.
                </td>
              </tr>
            )}
            {rows.map((r, i) => (
              <tr
                key={r.codigo_interno}
                className={i === sel ? 'gw-selected' : r.activo ? '' : 'text-[#8a8a8a]'}
                onClick={() => setSel(i)}
                onDoubleClick={() => abrir(r)}
              >
                <td>{r.codigo_interno}</td>
                <td>{r.descripcion}</td>
                <td>{r.codigo_venta ?? ''}</td>
                <td>{r.familia_codigo ?? ''}</td>
                <td>{r.proveedor_habitual_codigo ?? ''}</td>
                <td className="text-right">{formatGw(r.pvp ?? 0, 3)}</td>
                <td className="text-right">{formatGw(r.coste_neto ?? 0, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="gw-label flex-1">{cargando ? 'Buscando…' : `${rows.length} artículos${rows.length === 500 ? ' (se muestran los 500 primeros)' : ''}`}</span>
        <button type="button" className="gw-btn" onClick={() => navigate('/articulos/nuevo')}>
          Nuevo
        </button>
        <button type="button" className="gw-btn" disabled={!rows[sel]} onClick={() => abrir(rows[sel])}>
          Abrir ficha
        </button>
        <button type="button" className="gw-btn" onClick={() => navigate('/')}>
          Salir
        </button>
      </div>
    </div>
  )
}
