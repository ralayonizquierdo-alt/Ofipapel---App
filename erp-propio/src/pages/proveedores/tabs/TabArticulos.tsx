import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../../lib/supabase'
import { Binoculars, ChevronFirst, ChevronLast, Play } from 'lucide-react'
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
  articulo: { descripcion: string; precio_liquidado: number | null; familia_codigo: string | null } | null
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
  const [verFiltro, setVerFiltro] = useState(false)

  useEffect(() => {
    if (!proveedorCodigo) return
    let vivo = true
    const t = setTimeout(async () => {
      const f = filtro.trim().replace(/[,%()"]/g, ' ').trim()
      let q = supabase
        .from('articulo_proveedor')
        .select('articulo_codigo, codigo_compra, coste_puro, coste_neto, coste_bruto, ultima_compra_fecha, articulo:articulo_codigo(descripcion, precio_liquidado, familia_codigo)', {
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

  const idx = rows.findIndex((r) => r.articulo_codigo === sel)
  const mover = (i: number) => rows[i] && setSel(rows[i].articulo_codigo)
  const nb =
    'flex h-[26px] w-[84px] items-center justify-center border-r border-[var(--gw-border-light)] text-[#1d3a8a] last:border-r-0 hover:bg-[#e5f1fb] disabled:text-[#9a9a9a] disabled:hover:bg-transparent'

  return (
    <div className="flex flex-col gap-1" title="Artículos del proveedor (ARTPROV / ARTDPROV)">
      {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[#a4262c]">{error}</div>}
      <div className="h-[250px] overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th style={{ width: 150 }}>Cod. Interno</th>
              <th>Descripción</th>
              <th style={{ width: 160 }}>Cod. Compra</th>
              <th style={{ width: 80 }}>Familia</th>
              <th style={{ width: 100 }} className="text-right!">Coste</th>
              <th style={{ width: 110 }} className="text-right!">Coste bruto</th>
              <th style={{ width: 110 }} className="text-right!">Coste líquido</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr
                key={r.articulo_codigo}
                className={sel === r.articulo_codigo ? 'gw-selected' : ''}
                onClick={() => setSel(r.articulo_codigo)}
                onDoubleClick={() => navigate(`/articulos/${encodeURIComponent(r.articulo_codigo)}`)}
                title={r.ultima_compra_fecha ? `Última compra: ${fecha(r.ultima_compra_fecha)}` : undefined}
              >
                <td>{r.articulo_codigo}</td>
                <td>{r.articulo?.descripcion ?? ''}</td>
                <td>{r.codigo_compra ?? ''}</td>
                <td>{r.articulo?.familia_codigo ?? ''}</td>
                <td className="text-right">{c3(r.coste_neto)}</td>
                <td className="text-right">{c3(r.coste_bruto)}</td>
                <td className="text-right">{c3(r.articulo?.precio_liquidado)}</td>
              </tr>
            ))}
            <FilasVacias cols={7} ocupadas={rows.length} total={10} />
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex border border-[var(--gw-border)] bg-[var(--gw-face)]">
          <button type="button" className={nb} title="Primero" disabled={!rows.length} onClick={() => mover(0)}>
            <ChevronFirst size={14} strokeWidth={3} />
          </button>
          <button type="button" className={nb} title="Anterior" disabled={idx <= 0} onClick={() => mover(idx - 1)}>
            <Play size={10} className="rotate-180" fill="currentColor" />
          </button>
          <button type="button" className={nb} title="Siguiente" disabled={idx < 0 || idx >= rows.length - 1} onClick={() => mover(idx + 1)}>
            <Play size={10} fill="currentColor" />
          </button>
          <button type="button" className={nb} title="Último" disabled={!rows.length} onClick={() => mover(rows.length - 1)}>
            <ChevronLast size={14} strokeWidth={3} />
          </button>
          <button type="button" className={nb} title="Buscar" onClick={() => setVerFiltro((v) => !v)}>
            <Binoculars size={14} />
          </button>
        </div>
        {verFiltro && (
          <GwInput
            autoFocus
            className="!w-[300px]"
            placeholder="Código interno, código de compra o descripción"
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
          />
        )}
        {total > rows.length && <span className="gw-label text-[#1a4fd0]">Se muestran {rows.length} de {total}: usa el buscador para acotar.</span>}
      </div>
    </div>
  )
}
