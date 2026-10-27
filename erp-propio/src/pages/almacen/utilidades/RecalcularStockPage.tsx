import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Calculator, Search } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwSelect, formatGw } from '../../../components/gw'
import { CodigoBuscar, Grupo, IN, L } from '../../../components/gw/GwInformeArticulos'
import { AvisoSinCaptura, BotonCerrar, Paginador, descargarCsv, msgError, useAlmacenes, useF4 } from './comun'

// Almacén → Recalcular Stock → Recalcular Stock desde Movimientos. SIN CAPTURA de GeminisWin
// (el submenú de GeminisWin no se ha visto: confirmar con Luis qué opciones tiene). Compara el
// stock guardado (articulo_almacen_stock) con la suma de movimiento_stock por artículo y
// almacén, enseña las diferencias y, con confirmación, deja el stock igual a la suma de
// movimientos en una transacción (fn_recalcular_stock_aplicar). No genera movimientos.

interface Dif {
  articulo_codigo: string
  descripcion: string | null
  almacen_codigo: string
  stock_actual: number
  stock_movimientos: number
  diferencia: number
  total_filas: number
}
const PAGINA = 300

export function RecalcularStockPage() {
  const navigate = useNavigate()
  const almacenes = useAlmacenes()
  const cerrar = useCallback(() => navigate('/'), [navigate])
  useF4(cerrar)
  const [almacen, setAlmacen] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [filas, setFilas] = useState<Dif[] | null>(null)
  const [desdeFila, setDesdeFila] = useState(0)
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  const args = () => ({ p_almacen: almacen || null, p_art_desde: desde || null, p_art_hasta: hasta || null })

  async function ver(pos = 0) {
    setOcupado(true)
    setMsg(null)
    try {
      const { data, error } = await supabase.rpc('fn_recalcular_stock_diferencias', { ...args(), p_limite: PAGINA, p_desplazamiento: pos })
      if (error) throw error
      setFilas((data ?? []) as Dif[])
      setDesdeFila(pos)
    } catch (e) {
      setMsg(`Error: ${msgError(e)}`)
    } finally {
      setOcupado(false)
    }
  }

  async function aplicar() {
    const n = Number(filas?.[0]?.total_filas ?? 0)
    if (!n) return setMsg('No hay diferencias: el stock coincide con los movimientos.')
    if (!confirm(`¿Recalcular el stock de ${n} artículo(s)/almacén?\n\nEl stock guardado pasará a ser la suma de sus movimientos. No se generan movimientos nuevos.`)) return
    setOcupado(true)
    try {
      const { data, error } = await supabase.rpc('fn_recalcular_stock_aplicar', args())
      if (error) throw error
      await ver(0)
      setMsg(`Stock recalculado: ${data} fila(s) corregida(s).`)
    } catch (e) {
      setMsg(`Error: ${msgError(e)}`)
    } finally {
      setOcupado(false)
    }
  }

  async function csv() {
    const { data } = await supabase.rpc('fn_recalcular_stock_diferencias', { ...args(), p_limite: 1000, p_desplazamiento: 0 })
    descargarCsv(
      'diferencias_stock.csv',
      ['Almacén', 'Artículo', 'Descripción', 'Stock guardado', 'Stock según movimientos', 'Diferencia'],
      ((data ?? []) as Dif[]).map((d) => [d.almacen_codigo, d.articulo_codigo, d.descripcion, d.stock_actual, d.stock_movimientos, d.diferencia]),
    )
  }

  const total = Number(filas?.[0]?.total_filas ?? 0)
  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <Grupo
        titulo="Recalcular el Stock desde los Movimientos"
        derecha={
          <span className="ml-auto">
            <AvisoSinCaptura />
          </span>
        }
      >
        <div className="grid grid-cols-[260px_200px_200px_auto] items-end gap-3">
          <label className="flex flex-col">
            <span className={L}>Almacén</span>
            <GwSelect className={IN} value={almacen} onChange={(e) => (setAlmacen(e.target.value), setFilas(null))}>
              <option value="">Todos los Almacenes</option>
              {almacenes.map((a) => (
                <option key={a.codigo} value={a.codigo}>
                  {a.codigo} {a.nombre}
                </option>
              ))}
            </GwSelect>
          </label>
          <label className="flex flex-col">
            <span className={L}>Artículo desde</span>
            <CodigoBuscar value={desde} lookup="articulo" onChange={(v) => (setDesde(v), setFilas(null))} />
          </label>
          <label className="flex flex-col">
            <span className={L}>Artículo hasta</span>
            <CodigoBuscar value={hasta} lookup="articulo" onChange={(v) => (setHasta(v), setFilas(null))} />
          </label>
          <button type="button" className="gw-btn !h-[30px] !w-[190px] !gap-1 !text-[15px]" disabled={ocupado} onClick={() => ver(0)}>
            <Search size={15} /> Ver diferencias
          </button>
        </div>
        <p className={`${L} mt-1 text-[#444]`}>
          El stock de cada artículo y almacén se mantiene solo con los movimientos; si alguna vez no cuadra (cargas de datos, errores), esta opción lo deja igual a la suma de sus
          movimientos.
        </p>
      </Grupo>
      <div className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white">
        <table className="gw-grid">
          <thead className="sticky top-0">
            <tr>
              <th>Almacén</th>
              <th>Cod. Interno</th>
              <th>Descripción</th>
              <th className="!text-right">Stock guardado</th>
              <th className="!text-right">Stock según movimientos</th>
              <th className="!text-right">Diferencia</th>
            </tr>
          </thead>
          <tbody>
            {(filas ?? []).map((d) => (
              <tr key={`${d.almacen_codigo}|${d.articulo_codigo}`}>
                <td>{d.almacen_codigo}</td>
                <td>{d.articulo_codigo}</td>
                <td className="max-w-[420px] truncate">{d.descripcion}</td>
                <td className="text-right">{formatGw(d.stock_actual, 3)}</td>
                <td className="text-right">{formatGw(d.stock_movimientos, 3)}</td>
                <td className="text-right font-bold text-[#1a4fd0]">{formatGw(d.diferencia, 3)}</td>
              </tr>
            ))}
            {filas && !filas.length && (
              <tr>
                <td colSpan={6} className="text-center text-[#127a12]">
                  Sin diferencias: el stock coincide con la suma de los movimientos.
                </td>
              </tr>
            )}
            {!filas && (
              <tr>
                <td colSpan={6} className="text-center text-[#6d6d6d]">
                  Pulsa «Ver diferencias».
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex items-center gap-2">
        <Paginador desde={desdeFila} pagina={PAGINA} total={total} onIr={(p) => ver(p)} />
        {msg && <span className={`text-[13px] ${msg.startsWith('Error') ? 'text-[#c42b1c]' : 'text-[#127a12]'}`}>{msg}</span>}
      </div>
      <div className="flex items-stretch gap-2 border-t border-[var(--gw-border-light)] pr-[64px] pt-1">
        <div className="flex w-[175px] flex-none items-center px-1 text-[16px] leading-[19px]">Pulse F4 para cerrar la ventana</div>
        <span className="flex-1" />
        <button type="button" className="gw-btn !h-[46px] !w-[150px] !text-[17px]" disabled={!total} onClick={csv}>
          CSV
        </button>
        <button type="button" className="gw-btn !h-[46px] !w-[170px] !gap-1.5 !text-[17px]" disabled={!total || ocupado} onClick={aplicar}>
          <Calculator size={16} /> Recalcular
        </button>
        <BotonCerrar onClick={cerrar} />
      </div>
    </div>
  )
}
