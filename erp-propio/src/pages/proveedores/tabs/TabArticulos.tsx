import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { GwInput, formatGw } from '../../../components/gw'
import { FilasVacias } from '../../../components/gw/GwGridParts'
import type { ProveedorTabProps } from '../types'

const LIMITE = 200

interface Fila {
  articulo_codigo: string
  codigo_compra: string | null
  coste_puro: number | null
  coste_neto: number | null
  coste_bruto: number | null
  ultima_compra_fecha: string | null
  articulo: { descripcion: string; precio_liquidado: number | null } | null
}

function fecha(v: string | null) {
  if (!v) return ''
  const [a, m, d] = v.slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

const c3 = (v: number | null | undefined) => (v == null ? '' : formatGw(v, 3))

export function TabArticulos({ proveedor }: ProveedorTabProps) {
  const navigate = useNavigate()
  const proveedorCodigo = proveedor.codigo
  const [filtro, setFiltro] = useState('')
  const [rows, setRows] = useState<Fila[]>([])
  const [total, setTotal] = useState(0)
  const [sel, setSel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!proveedorCodigo) return
    let vivo = true
    const t = setTimeout(async () => {
      const f = filtro.trim().replace(/[,%()"]/g, ' ').trim()
      let q = supabase
        .from('articulo_proveedor')
        .select('articulo_codigo, codigo_compra, coste_puro, coste_neto, coste_bruto, ultima_compra_fecha, articulo:articulo_codigo(descripcion, precio_liquidado)', {
          count: 'exact',
        })
        .eq('proveedor_codigo', proveedorCodigo)
        .order('articulo_codigo')
        .limit(LIMITE)
      if (f) {
        // La descripción vive en articulo: se buscan antes los códigos que casan por descripción.
        const { data: porDesc } = await supabase.from('articulo').select('codigo_interno').ilike('descripcion', `%${f}%`).limit(500)
        const codigos = (porDesc ?? []).map((a) => `"${String(a.codigo_interno).replace(/"/g, '')}"`)
        const condiciones = [`articulo_codigo.ilike.%${f}%`, `codigo_compra.ilike.%${f}%`]
        if (codigos.length) condiciones.push(`articulo_codigo.in.(${codigos.join(',')})`)
        q = q.or(condiciones.join(','))
      }
      const { data, count, error: err } = await q
      if (!vivo) return
      setError(err ? err.message : null)
      setRows((data ?? []) as unknown as Fila[])
      setTotal(count ?? 0)
      setSel(null)
    }, 250)
    return () => {
      vivo = false
      clearTimeout(t)
    }
  }, [proveedorCodigo, filtro])

  return (
    <div className="flex flex-col gap-1" title="Artículos del proveedor (ARTPROV / ARTDPROV)">
      <div className="flex items-center gap-2">
        <span className="gw-label">Buscar:</span>
        <GwInput
          className="!w-[320px]"
          placeholder="Código interno, código de compra o descripción"
          value={filtro}
          onChange={(e) => setFiltro(e.target.value)}
        />
      </div>
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
      <div className="h-[280px] overflow-y-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 120 }}>Código Interno</th>
              <th>Descripción</th>
              <th style={{ width: 130 }}>Código de Compra</th>
              <th style={{ width: 90 }} className="text-right!">Coste Puro</th>
              <th style={{ width: 90 }} className="text-right!">Neto</th>
              <th style={{ width: 90 }} className="text-right!">Bruto</th>
              <th style={{ width: 90 }} className="text-right!">Líquido</th>
              <th style={{ width: 96 }}>Última Compra</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.articulo_codigo}
                className={sel === r.articulo_codigo ? 'gw-selected' : ''}
                onClick={() => setSel(r.articulo_codigo)}
                onDoubleClick={() => navigate(`/articulos/${encodeURIComponent(r.articulo_codigo)}`)}
              >
                <td>{r.articulo_codigo}</td>
                <td>{r.articulo?.descripcion ?? ''}</td>
                <td>{r.codigo_compra ?? ''}</td>
                <td className="text-right">{c3(r.coste_puro)}</td>
                <td className="text-right">{c3(r.coste_neto)}</td>
                <td className="text-right">{c3(r.coste_bruto)}</td>
                <td className="text-right">{c3(r.articulo?.precio_liquidado)}</td>
                <td>{fecha(r.ultima_compra_fecha)}</td>
              </tr>
            ))}
            <FilasVacias cols={8} ocupadas={rows.length} total={11} />
          </tbody>
        </table>
      </div>
      <span className="gw-label text-[#1a4fd0]">
        Nº Artículos: {total}
        {total > rows.length ? ` (se muestran ${rows.length}; usa el buscador para acotar)` : ''}
      </span>
    </div>
  )
}
