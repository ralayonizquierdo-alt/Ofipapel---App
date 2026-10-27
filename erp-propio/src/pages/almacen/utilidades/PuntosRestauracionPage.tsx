import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { History, Plus, RotateCcw } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { GwCheck, GwInput, GwSelect, formatGw } from '../../../components/gw'
import { CodigoBuscar, Grupo, IN, L } from '../../../components/gw/GwInformeArticulos'
import { AvisoSinCaptura, BotonCerrar, Paginador, descargarCsv, fechaEs, msgError, useAlmacenes, useF4, useTiendas } from './comun'

// Almacén → Puntos de Restauración Stock. SIN CAPTURA de GeminisWin: hecha con las tablas
// punto_restauracion_stock(+_linea) (STKPTRT/STKPTRTD), las mismas que usan los Inventarios, y el
// estilo de los informes calcados. Crear un punto guarda el stock actual (por almacén o de todos,
// opcionalmente por rango de artículos); se compara con el stock de ahora y «Restaurar» genera
// movimientos de regularización por la diferencia (fn_punto_restauracion_restaurar), en una
// transacción. Ajustar cuando llegue la captura.

interface Punto {
  tienda_terminal_codigo: string
  numero: number
  fecha: string
  concepto: string | null
  almacen_desde_codigo: string | null
  origen_tipo: string | null
  origen_numero: number | null
  fecha_hora_restaurado: string | null
  creado_en: string
  lineas: number
}
interface Comp {
  numero_linea: number
  articulo_codigo: string
  descripcion: string | null
  almacen_codigo: string
  cantidad_punto: number
  cantidad_actual: number
  diferencia: number
  total_filas: number
  total_diferencias: number
}

const PAGINA = 300

export function PuntosRestauracionPage() {
  const navigate = useNavigate()
  const almacenes = useAlmacenes()
  const tiendas = useTiendas()
  const cerrar = useCallback(() => navigate('/'), [navigate])
  useF4(cerrar)
  const [tienda, setTienda] = useState('')
  const [almacen, setAlmacen] = useState('')
  const [concepto, setConcepto] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [soloStock, setSoloStock] = useState(true)
  const [puntos, setPuntos] = useState<Punto[]>([])
  const [sel, setSel] = useState<Punto | null>(null)
  const [comp, setComp] = useState<Comp[]>([])
  const [desdeFila, setDesdeFila] = useState(0)
  const [soloDif, setSoloDif] = useState(true)
  const [msg, setMsg] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)

  useEffect(() => {
    if (!tienda && tiendas[0]) setTienda(tiendas[0].codigo)
  }, [tiendas, tienda])

  const cargarPuntos = useCallback(async () => {
    const { data, error } = await supabase
      .from('punto_restauracion_stock')
      .select(
        'tienda_terminal_codigo, numero, fecha, concepto, almacen_desde_codigo, origen_tipo, origen_numero, fecha_hora_restaurado, creado_en, punto_restauracion_stock_linea(count)',
      )
      .order('creado_en', { ascending: false })
      .limit(300)
    if (error) return setMsg(error.message)
    setPuntos(
      ((data ?? []) as Record<string, unknown>[]).map((r) => ({
        ...(r as unknown as Punto),
        lineas: Number(((r.punto_restauracion_stock_linea as { count: number }[] | undefined) ?? [])[0]?.count ?? 0),
      })),
    )
  }, [])
  useEffect(() => {
    cargarPuntos()
  }, [cargarPuntos])

  const cargarComp = useCallback(async () => {
    if (!sel) return setComp([])
    const { data, error } = await supabase.rpc('fn_punto_restauracion_comparar', {
      p_tienda: sel.tienda_terminal_codigo,
      p_numero: sel.numero,
      p_solo_diferencias: soloDif,
      p_limite: PAGINA,
      p_desplazamiento: desdeFila,
    })
    if (error) return setMsg(error.message)
    setComp((data ?? []) as Comp[])
  }, [sel, soloDif, desdeFila])
  useEffect(() => {
    cargarComp()
  }, [cargarComp])

  async function crear() {
    setMsg(null)
    if (!tienda) return setMsg('Indica la tienda.')
    if (
      !confirm(
        `¿Crear un punto de restauración con el stock actual de ${almacen ? `el almacén ${almacen}` : 'TODOS los almacenes'}${desde || hasta ? ` (artículos ${desde || '…'} a ${hasta || '…'})` : ''}?`,
      )
    )
      return
    setOcupado(true)
    try {
      const { data, error } = await supabase.rpc('fn_punto_restauracion_crear', {
        p_tienda: tienda,
        p_almacen: almacen || null,
        p_concepto: concepto || `Punto de restauración ${new Date().toLocaleString('es-ES')}`,
        p_art_desde: desde || null,
        p_art_hasta: hasta || null,
        p_solo_con_stock: soloStock,
      })
      if (error) throw error
      await cargarPuntos()
      setMsg(`Creado el punto de restauración ${tienda}-${data}.`)
      setConcepto('')
    } catch (e) {
      setMsg(`Error: ${msgError(e)}`)
    } finally {
      setOcupado(false)
    }
  }

  async function restaurar() {
    if (!sel) return
    const n = Number(comp[0]?.total_diferencias ?? 0)
    if (!n) return setMsg('El stock ya coincide con el del punto: no hay nada que restaurar.')
    let forzar = false
    if (sel.fecha_hora_restaurado) {
      if (!confirm(`Este punto YA se restauró el ${fechaEs(sel.fecha_hora_restaurado, true)}. ¿Restaurarlo otra vez?`)) return
      forzar = true
    }
    if (
      !confirm(
        `¿Restaurar el punto ${sel.tienda_terminal_codigo}-${sel.numero}?\n\nSe generarán movimientos de regularización en ${n} artículo(s)/almacén para dejar el stock como estaba en el punto.`,
      )
    )
      return
    setOcupado(true)
    try {
      const { data, error } = await supabase.rpc('fn_punto_restauracion_restaurar', { p_tienda: sel.tienda_terminal_codigo, p_numero: sel.numero, p_forzar: forzar })
      if (error) throw error
      setMsg(`Punto restaurado: ${data} movimiento(s) de regularización.`)
      await cargarPuntos()
      setSel((s) => (s ? { ...s, fecha_hora_restaurado: new Date().toISOString() } : s))
      await cargarComp()
    } catch (e) {
      setMsg(`Error: ${msgError(e)}`)
    } finally {
      setOcupado(false)
    }
  }

  async function csv() {
    if (!sel) return
    const { data } = await supabase.rpc('fn_punto_restauracion_comparar', {
      p_tienda: sel.tienda_terminal_codigo,
      p_numero: sel.numero,
      p_solo_diferencias: soloDif,
      p_limite: 1000,
      p_desplazamiento: 0,
    })
    descargarCsv(
      `punto_restauracion_${sel.tienda_terminal_codigo}-${sel.numero}.csv`,
      ['Almacén', 'Artículo', 'Descripción', 'Stock en el punto', 'Stock actual', 'Diferencia'],
      ((data ?? []) as Comp[]).map((c) => [c.almacen_codigo, c.articulo_codigo, c.descripcion, c.cantidad_punto, c.cantidad_actual, c.diferencia]),
    )
  }

  const total = Number(comp[0]?.total_filas ?? 0)
  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <Grupo
        titulo="Crear Punto de Restauración con el Stock Actual"
        derecha={
          <span className="ml-auto">
            <AvisoSinCaptura />
          </span>
        }
      >
        <div className="grid grid-cols-[90px_220px_minmax(0,1fr)_170px_170px_auto_auto] items-end gap-2">
          <label className="flex flex-col">
            <span className={L}>Tienda</span>
            <GwSelect className={IN} value={tienda} onChange={(e) => setTienda(e.target.value)}>
              {tiendas.map((t) => (
                <option key={t.codigo}>{t.codigo}</option>
              ))}
            </GwSelect>
          </label>
          <label className="flex flex-col">
            <span className={L}>Almacén</span>
            <GwSelect className={IN} value={almacen} onChange={(e) => setAlmacen(e.target.value)}>
              <option value="">Todos los Almacenes</option>
              {almacenes.map((a) => (
                <option key={a.codigo} value={a.codigo}>
                  {a.codigo} {a.nombre}
                </option>
              ))}
            </GwSelect>
          </label>
          <label className="flex flex-col">
            <span className={L}>Concepto</span>
            <GwInput className={IN} value={concepto} maxLength={60} onChange={(e) => setConcepto(e.target.value)} />
          </label>
          <label className="flex flex-col">
            <span className={L}>Artículo desde</span>
            <CodigoBuscar value={desde} lookup="articulo" onChange={setDesde} />
          </label>
          <label className="flex flex-col">
            <span className={L}>Artículo hasta</span>
            <CodigoBuscar value={hasta} lookup="articulo" onChange={setHasta} />
          </label>
          <GwCheck label={<span className={L}>Solo con stock</span>} checked={soloStock} onChange={setSoloStock} className="mb-1" />
          <button type="button" className="gw-btn !h-[30px] !gap-1 !text-[15px]" disabled={ocupado} onClick={crear}>
            <Plus size={15} /> Crear Punto
          </button>
        </div>
      </Grupo>

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,0.95fr)_minmax(0,1.25fr)] gap-2">
        <Grupo titulo="Puntos de Restauración" className="flex min-h-0 flex-col">
          <div className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid">
              <thead className="sticky top-0">
                <tr>
                  <th>Ti.</th>
                  <th className="!text-right">Nº</th>
                  <th>Fecha</th>
                  <th>Concepto</th>
                  <th>Alm.</th>
                  <th className="!text-right">Líneas</th>
                  <th>Restaurado</th>
                </tr>
              </thead>
              <tbody>
                {puntos.map((p) => {
                  const activo = sel?.tienda_terminal_codigo === p.tienda_terminal_codigo && sel.numero === p.numero
                  return (
                    <tr
                      key={`${p.tienda_terminal_codigo}-${p.numero}`}
                      className={activo ? 'gw-selected' : ''}
                      onClick={() => {
                        setSel(p)
                        setDesdeFila(0)
                        setMsg(null)
                      }}
                    >
                      <td>{p.tienda_terminal_codigo}</td>
                      <td className="text-right">{p.numero}</td>
                      <td>{fechaEs(p.creado_en, true)}</td>
                      <td className="max-w-[220px] truncate" title={p.concepto ?? ''}>
                        {p.concepto ?? (p.origen_tipo === 'inventario' ? `Inventario ${p.origen_numero}` : '')}
                      </td>
                      <td>{p.almacen_desde_codigo ?? 'Todos'}</td>
                      <td className="text-right">{p.lineas.toLocaleString('es-ES')}</td>
                      <td>{p.fecha_hora_restaurado ? fechaEs(p.fecha_hora_restaurado, true) : ''}</td>
                    </tr>
                  )
                })}
                {!puntos.length && (
                  <tr>
                    <td colSpan={7} className="text-center text-[#6d6d6d]">
                      No hay puntos de restauración.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Grupo>
        <Grupo
          titulo={sel ? `Punto ${sel.tienda_terminal_codigo}-${sel.numero}: stock del punto frente al actual` : 'Elige un punto para compararlo con el stock actual'}
          className="flex min-h-0 flex-col"
          derecha={
            <span className="ml-auto">
              <GwCheck label={<span className={L}>Solo diferencias</span>} checked={soloDif} onChange={(v) => (setSoloDif(v), setDesdeFila(0))} />
            </span>
          }
        >
          <div className="min-h-0 flex-1 overflow-auto border border-[var(--gw-border)] bg-white">
            <table className="gw-grid">
              <thead className="sticky top-0">
                <tr>
                  <th>Alm.</th>
                  <th>Artículo</th>
                  <th>Descripción</th>
                  <th className="!text-right">En el punto</th>
                  <th className="!text-right">Actual</th>
                  <th className="!text-right">Diferencia</th>
                </tr>
              </thead>
              <tbody>
                {comp.map((c) => (
                  <tr key={c.numero_linea}>
                    <td>{c.almacen_codigo}</td>
                    <td>{c.articulo_codigo}</td>
                    <td className="max-w-[260px] truncate">{c.descripcion}</td>
                    <td className="text-right">{formatGw(c.cantidad_punto, 3)}</td>
                    <td className="text-right">{formatGw(c.cantidad_actual, 3)}</td>
                    <td className={`text-right font-bold ${c.diferencia ? 'text-[#1a4fd0]' : ''}`}>{formatGw(c.diferencia, 3)}</td>
                  </tr>
                ))}
                {sel && !comp.length && (
                  <tr>
                    <td colSpan={6} className="text-center text-[#6d6d6d]">
                      {soloDif ? 'El stock actual coincide con el del punto.' : 'El punto no tiene líneas.'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="mt-1 flex items-center gap-2">
            <Paginador desde={desdeFila} pagina={PAGINA} total={total} onIr={setDesdeFila} />
            <span className="text-[14px]">
              Con diferencia: <b>{Number(comp[0]?.total_diferencias ?? 0).toLocaleString('es-ES')}</b>
            </span>
          </div>
        </Grupo>
      </div>
      {msg && <div className={`text-[13px] ${msg.startsWith('Error') ? 'text-[#c42b1c]' : 'text-[#127a12]'}`}>{msg}</div>}
      <div className="flex items-stretch gap-2 border-t border-[var(--gw-border-light)] pr-[64px] pt-1">
        <div className="flex w-[175px] flex-none items-center px-1 text-[16px] leading-[19px]">Pulse F4 para cerrar la ventana</div>
        <span className="flex-1" />
        <button type="button" className="gw-btn !h-[46px] !w-[150px] !gap-1.5 !text-[17px]" disabled={!sel} onClick={csv}>
          <History size={16} /> CSV
        </button>
        <button type="button" className="gw-btn !h-[46px] !w-[170px] !gap-1.5 !text-[17px]" disabled={!sel || ocupado} onClick={restaurar}>
          <RotateCcw size={16} className="text-[#c42b1c]" /> Restaurar
        </button>
        <BotonCerrar onClick={cerrar} />
      </div>
    </div>
  )
}
