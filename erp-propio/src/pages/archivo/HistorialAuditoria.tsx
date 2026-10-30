// Botón «🕘 Historial» en la barra de título de cada ficha (Luis, 30/10/2026): solo para super
// administradores, enseña los cambios de esa ficha (y de sus líneas) con el mismo diseño que
// Archivo → Auditoría. La ficha se saca de la dirección de la ventana (/clientes/ZZ001,
// /pedidos/01/30…). La consulta queda apuntada (fn_auditoria_historial).

import { useState } from 'react'
import { GwWindow } from '../../components/gw'
import { supabase } from '../../lib/supabase'
import { usePermisos } from '../../lib/PermisosContext'
import { DetalleAuditoria, TablaAuditoria, exportarExcel, imprimirAuditoria, pantalla, type Fila } from './auditoriaComun'

/** Dirección de la ventana → tabla y nº de partes de la clave. */
const FICHAS: [string, string, number][] = [
  ['/clientes/', 'cliente', 1],
  ['/proveedores/', 'proveedor', 1],
  ['/articulos/', 'articulo', 1],
  ['/empleados/', 'empleado', 1],
  ['/familias/', 'familia', 1],
  ['/marcas/', 'marca', 1],
  ['/vendedores/', 'vendedor', 1],
  ['/repartidores/', 'repartidor', 1],
  ['/formas-pago/', 'forma_pago', 1],
  ['/tiendas/', 'tienda_terminal', 1],
  ['/transportistas/', 'transportista', 1],
  ['/pedidos-proveedor/', 'pedido_proveedor', 2],
  ['/pedidos/', 'pedido_cliente', 2],
  ['/presupuestos/', 'pedido_cliente', 2],
  ['/ventas/', 'venta', 2],
  ['/repartos/', 'reparto', 2],
  ['/traspasos/', 'traspaso_almacen', 2],
  ['/peticiones/', 'peticion', 2],
  ['/cobros-clientes/', 'cobro_cliente', 2],
]

/** Ficha de la ventana actual, o null si la dirección no es la de una ficha concreta. */
export function fichaDeRuta(pathname: string): { tabla: string; pk: string } | null {
  for (const [prefijo, tabla, partes] of FICHAS) {
    if (!pathname.startsWith(prefijo)) continue
    const trozos = pathname.slice(prefijo.length).split('/').filter(Boolean).map(decodeURIComponent)
    if (trozos.length !== partes || trozos.some((t) => t === 'lista' || t === 'nuevo')) return null
    return { tabla, pk: trozos.join('-') }
  }
  return null
}

export function BotonHistorial({ pathname }: { pathname: string }) {
  const { superAdmin } = usePermisos()
  const [abierto, setAbierto] = useState<{ tabla: string; pk: string } | null>(null)
  const [filas, setFilas] = useState<Fila[] | null>(null)
  const [sel, setSel] = useState<Fila | null>(null)
  const [error, setError] = useState<string | null>(null)
  const ficha = fichaDeRuta(pathname)
  if (!superAdmin || !ficha) return null

  const abrir = async () => {
    setAbierto(ficha)
    setFilas(null)
    setError(null)
    const { data, error: e } = await supabase.rpc('fn_auditoria_historial', { p_tabla: ficha.tabla, p_pk: ficha.pk })
    if (e) return setError(e.message)
    const l = (data as Fila[]) ?? []
    setFilas(l)
    setSel(l[0] ?? null)
  }

  return (
    <>
      <button
        type="button"
        className="mr-1 rounded-[3px] border border-white/60 bg-white/85 px-2 text-[12px] font-bold text-[#1d3a8a] hover:bg-white"
        title="Historial de cambios de esta ficha (solo super administradores)"
        onMouseDown={(e) => e.stopPropagation()}
        onClick={() => void abrir()}
      >
        🕘 Historial
      </button>
      {abierto && (
        <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/25 pt-8" onKeyDown={(e) => e.key === 'Escape' && setAbierto(null)}>
          <GwWindow title={`Historial · ${pantalla(abierto.tabla)} ${abierto.pk}`} onClose={() => setAbierto(null)} className="w-[1400px] max-w-[98vw]">
            <div className="flex flex-col gap-1.5 text-[13px]">
              <div className="flex items-center gap-2">
                <span className="text-[12px] text-[#555]">{filas ? `${filas.length} apunte(s), del más reciente al más antiguo` : 'Cargando…'}</span>
                <span className="flex-1" />
                <button
                  type="button"
                  className="gw-btn"
                  disabled={!filas?.length}
                  onClick={() => filas && exportarExcel(filas, `historial-${abierto.tabla}-${abierto.pk}`)}
                >
                  📊 Excel
                </button>
                <button
                  type="button"
                  className="gw-btn"
                  disabled={!filas?.length}
                  onClick={() => filas && imprimirAuditoria(filas, `Historial · ${pantalla(abierto.tabla)} ${abierto.pk}`)}
                >
                  🖨 Imprimir / PDF
                </button>
              </div>
              {error && <div className="font-bold text-[#c42b1c]">{error}</div>}
              <div className="flex gap-0">
                <div className="min-w-0 flex-1">
                  <TablaAuditoria filas={filas ?? []} sel={sel} onSel={setSel} className="h-[60vh]" />
                </div>
                <div className="h-[60vh] w-[320px] flex-none overflow-auto border border-l-2 border-[var(--gw-border)] border-l-[#1d3a8a] bg-white">
                  <DetalleAuditoria fila={sel} />
                </div>
              </div>
            </div>
          </GwWindow>
        </div>
      )}
    </>
  )
}
