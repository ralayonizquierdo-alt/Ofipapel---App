import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Calculator } from 'lucide-react'
import { supabase } from '../../../lib/supabase'
import { useMiAcceso } from '../../../lib/accesoEmpleado'
import { GwTabs, type GwTabDef } from '../../../components/gw'
import { GwOperativa } from '../../../components/gw/GwOperativa'
import { BotonCerrar, ModalGw, fechaEs, msgError, useF4 } from './comun'

// Almacén → Recalcular Stock, calcado de GeminisWin (capturas 02 y 03 del bloque 9, con clave especial).
// En GeminisWin es un submenú con cuatro procesos directos; aquí, una pantalla con los cuatro, con los
// mismos rótulos y en el mismo orden. Cada uno llama a su función de la base de datos (migración
// 20261113_recalcular_stock.sql): primero en modo comprobación (no cambia nada, solo cuenta), se enseña
// lo que cambiaría y, si se confirma, se aplica. Solo administradores: lo exige la base de datos.

type Proceso = 'stock' | 'lotes' | 'reservado' | 'pedido'

interface Resumen {
  proceso: Proceso
  aplicado: boolean
  revisados: number
  cambiados: number
  filas_cambiadas: number
  lineas_sin_apuntar?: number
  fichas_proveedor_cambiadas?: number
  registro: number | null
}

interface Opcion {
  proceso: Proceso
  /** Rótulo exacto del submenú de GeminisWin. */
  rotulo: string
  fn: string
  /** Qué recalcula y a partir de qué. */
  que: string
  /** Qué se cuenta en «revisados». */
  unidad: string
  /** Si tiene texto, la opción sale desactivada con este motivo. */
  desactivada?: string
}

const OPCIONES: Opcion[] = [
  {
    proceso: 'stock',
    rotulo: 'Recalcular Stock',
    fn: 'fn_recalcular_stock',
    que: 'Deja el stock de cada artículo en cada almacén igual a la suma de sus movimientos (compras, ventas, traspasos, regularizaciones e inventarios).',
    unidad: 'artículos',
  },
  {
    proceso: 'lotes',
    rotulo: 'Recalcular Stock de Lotes',
    fn: 'fn_recalcular_stock_lotes',
    que: 'Deja la cantidad de cada lote igual a la suma de sus entradas, salidas y regularizaciones (Control de Lotes → Consulta de movimientos).',
    unidad: 'artículos con lotes',
  },
  {
    proceso: 'reservado',
    rotulo: 'Recalcular Stock Reservado',
    fn: 'fn_recalcular_stock_reservado',
    que: 'Deja el reservado de cada artículo en cada almacén igual a las unidades que quedan por servir en los pedidos de cliente sin entregar (no cuentan presupuestos, reparaciones ni anulados).',
    unidad: 'artículos con reserva',
  },
  {
    proceso: 'pedido',
    rotulo: 'Recalcular Stock Pedido',
    fn: 'fn_recalcular_stock_pedido',
    que: 'Deja las unidades pedidas de cada artículo igual a las que quedan por recibir en los pedidos a proveedor sin recepcionar.',
    unidad: 'artículos con unidades pedidas',
    // Comprobado el 13/11/2026: 404 artículos traen unidades pedidas de GeminisWin y en el ERP solo hay
    // pedidos a proveedor pendientes para 10. Quitar este texto cuando esos pedidos estén cargados.
    desactivada:
      'Desactivado por ahora: los pedidos a proveedor que siguen pendientes en GeminisWin todavía no están en el ERP, y recalcular pondría a 0 las unidades pedidas que vienen de allí. Se activará cuando esos pedidos estén cargados.',
  },
]

const TABS: GwTabDef[][] = [
  [
    { key: 'procesos', label: 'Recalcular Stock' },
    { key: 'operativa', label: 'Operativa' },
  ],
]

interface Ultimo {
  proceso: Proceso
  ejecutado_en: string
  empleado_codigo: string | null
  revisados: number
  cambiados: number
}

const n = (v: number) => Number(v ?? 0).toLocaleString('es-ES')
const hayCambios = (r: Resumen) => r.filas_cambiadas + (r.fichas_proveedor_cambiadas ?? 0) > 0

export function RecalcularStockPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const { admin } = useMiAcceso()
  const cerrar = useCallback(() => navigate('/'), [navigate])
  useF4(cerrar)
  const [tab, setTab] = useState('procesos')
  const [ocupado, setOcupado] = useState<Proceso | null>(null)
  /** Comprobación hecha, a la espera de confirmar. */
  const [previa, setPrevia] = useState<{ op: Opcion; r: Resumen } | null>(null)
  const [hecho, setHecho] = useState<Partial<Record<Proceso, Resumen>>>({})
  const [error, setError] = useState<string | null>(null)
  const [ultimos, setUltimos] = useState<Partial<Record<Proceso, Ultimo>>>({})

  const cargarUltimos = useCallback(async () => {
    const { data } = await supabase
      .from('recalculo_stock_registro')
      .select('proceso, ejecutado_en, empleado_codigo, revisados, cambiados')
      .order('ejecutado_en', { ascending: false })
      .limit(40)
    const m: Partial<Record<Proceso, Ultimo>> = {}
    for (const u of (data ?? []) as Ultimo[]) if (!m[u.proceso]) m[u.proceso] = u
    setUltimos(m)
  }, [])
  useEffect(() => {
    if (admin) void cargarUltimos()
  }, [admin, cargarUltimos])

  /** Paso 1: comprobar (no cambia nada) y pedir confirmación con las cifras delante. */
  const comprobar = useCallback(async (op: Opcion) => {
    setOcupado(op.proceso)
    setError(null)
    try {
      const { data, error: e } = await supabase.rpc(op.fn, { p_aplicar: false })
      if (e) throw e
      setPrevia({ op, r: data as Resumen })
    } catch (e) {
      setError(msgError(e))
    } finally {
      setOcupado(null)
    }
  }, [])

  /** Paso 2: aplicar, ya confirmado. */
  async function aplicar() {
    if (!previa) return
    const { op } = previa
    setPrevia(null)
    setOcupado(op.proceso)
    setError(null)
    try {
      const { data, error: e } = await supabase.rpc(op.fn, { p_aplicar: true })
      if (e) throw e
      setHecho((h) => ({ ...h, [op.proceso]: data as Resumen }))
      void cargarUltimos()
    } catch (e) {
      setError(msgError(e))
    } finally {
      setOcupado(null)
    }
  }

  // Si se entra con ?proceso=stock|lotes|reservado|pedido (una opción del submenú por proceso, como en
  // GeminisWin) se lanza directamente la comprobación de ese proceso.
  const lanzado = useRef(false)
  useEffect(() => {
    if (!admin || lanzado.current) return
    const op = OPCIONES.find((o) => o.proceso === params.get('proceso'))
    if (op && !op.desactivada) {
      lanzado.current = true
      void comprobar(op)
    }
  }, [admin, params, comprobar])

  return (
    <div className="flex h-full min-h-0 flex-col gap-1">
      <GwTabs rows={TABS} active={tab} onChange={setTab}>
        {tab === 'operativa' ? (
          <GwOperativa
            bloques={[
              {
                titulo: 'Para qué sirve',
                notas: [
                  'El stock, el reservado y las unidades pedidas los lleva el programa solo, con cada venta, compra, traspaso o pedido. Estas opciones los rehacen desde cero a partir de los documentos, por si alguna vez no cuadran (cargas de datos, cortes, errores).',
                  'No crean movimientos ni tocan ningún documento: solo corrigen la cifra guardada.',
                ],
              },
              {
                titulo: 'Cómo se usa',
                pasos: [
                  'Pulsa «Recalcular» en la opción que quieras. El programa primero solo comprueba: no cambia nada.',
                  'Te dice cuántos artículos ha revisado y cuántos cambiarían. Si no cambia ninguno, todo cuadra y no hay nada que hacer.',
                  'Si hay cambios y estás conforme, pulsa «Aceptar». Entonces se aplican y sale el resumen.',
                ],
                notas: [
                  'Solo lo pueden usar los administradores, como en GeminisWin (clave especial).',
                  'Hazlo con las tiendas sin vender: mientras se recalcula el stock, las ventas esperan unos segundos.',
                  'Cada recálculo queda apuntado: quién lo lanzó, cuándo y el valor de antes y de después de cada cifra cambiada.',
                  'Si una cifra sale distinta de lo que hay en la estantería, no es cosa del recálculo: corrígela con Almacén → Regularización de Stock o con un inventario.',
                ],
              },
            ]}
          />
        ) : (
          <div className="flex flex-col gap-1.5 p-1">
            {!admin && (
              <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[14px] text-[#a4262c]">
                Recalcular el stock es solo para administradores. Si hace falta, pídeselo a gerencia.
              </div>
            )}
            {OPCIONES.map((op) => {
              const r = hecho[op.proceso]
              const u = ultimos[op.proceso]
              return (
                <fieldset key={op.proceso} className="gw-group !px-2 !pb-1.5 !pt-0.5" data-proceso={op.proceso}>
                  <legend className="!px-1 text-[16px] leading-[18px]">{op.rotulo}</legend>
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1 text-[15px] leading-[20px]">
                      <p>{op.que}</p>
                      {op.desactivada && <p className="mt-0.5 text-[14px] text-[#8a5a00]">{op.desactivada}</p>}
                      {r && (
                        <p className="mt-0.5 font-bold text-[#127a12]">
                          Hecho: {n(r.revisados)} {op.unidad} revisados, {n(r.cambiados)} cambiados.
                        </p>
                      )}
                      {!r && u && (
                        <p className="mt-0.5 text-[13px] text-[#555]">
                          Último recálculo: {fechaEs(u.ejecutado_en, true)}
                          {u.empleado_codigo ? ` por ${u.empleado_codigo}` : ''} · {n(u.revisados)} revisados, {n(u.cambiados)} cambiados.
                        </p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="gw-btn !h-[40px] !w-[170px] flex-none !gap-1.5 !text-[16px]"
                      disabled={!admin || !!op.desactivada || ocupado !== null}
                      title={op.desactivada ?? (admin ? op.rotulo : 'Solo para administradores')}
                      onClick={() => comprobar(op)}
                    >
                      <Calculator size={16} /> {ocupado === op.proceso ? 'Un momento…' : 'Recalcular'}
                    </button>
                  </div>
                </fieldset>
              )
            })}
            {error && <div className="border border-[#c42b1c] bg-[#fde7e9] px-2 py-1 text-[14px] text-[#a4262c]">No se ha podido recalcular: {error}</div>}
          </div>
        )}
      </GwTabs>
      <span className="flex-1" />
      <div className="flex items-stretch gap-2 border-t border-[var(--gw-border-light)] pr-[64px] pt-1">
        <div className="flex w-[175px] flex-none items-center px-1 text-[16px] leading-[19px]">Pulse F4 para cerrar la ventana</div>
        <span className="flex-1" />
        <BotonCerrar onClick={cerrar} />
      </div>

      {previa && (
        // hayCambios cuenta también las fichas por proveedor (solo las toca Recalcular Stock Pedido).
        <ModalGw titulo={previa.op.rotulo} onClose={() => setPrevia(null)} ancho={520}>
          <div className="flex flex-col gap-2 p-2 text-[15px] leading-[21px]">
            <p>
              Revisados: <b>{n(previa.r.revisados)}</b> {previa.op.unidad}. Cambiarían: <b>{n(previa.r.cambiados)}</b>
              {previa.r.filas_cambiadas !== previa.r.cambiados ? ` (${n(previa.r.filas_cambiadas)} cifras)` : ''}.
            </p>
            {!!previa.r.lineas_sin_apuntar && (
              <p className="text-[#8a5a00]">
                Hay {n(previa.r.lineas_sin_apuntar)} línea(s) de pedido que no se pueden contar porque su artículo o su almacén no existe. Revísalas en Ventas → Pedidos.
              </p>
            )}
            {!hayCambios(previa.r) ? (
              <p className="font-bold text-[#127a12]">Todo cuadra: no hay nada que cambiar.</p>
            ) : (
              <p>¿Recalcular ahora? La cifra guardada se sustituye por la que sale de los documentos. No se crean movimientos.</p>
            )}
            <div className="mt-1 flex justify-end gap-2">
              {hayCambios(previa.r) && (
                <button type="button" className="gw-btn !h-[34px] !w-[130px] !text-[16px]" onClick={aplicar}>
                  Aceptar
                </button>
              )}
              <button type="button" className="gw-btn !h-[34px] !w-[130px] !text-[16px]" autoFocus onClick={() => setPrevia(null)}>
                {hayCambios(previa.r) ? 'Cancelar' : 'Cerrar'}
              </button>
            </div>
          </div>
        </ModalGw>
      )}
    </div>
  )
}
