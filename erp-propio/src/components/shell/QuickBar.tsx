import { useCallback, useEffect, useState } from 'react'
import type { LucideIcon } from 'lucide-react'
import { usePermisos } from '../../lib/PermisosContext'
import { COLOR_SECCION } from './secciones'
import {
  Archive,
  Banknote,
  Boxes,
  Calculator,
  DatabaseZap,
  HandCoins,
  LayoutDashboard,
  LogOut,
  NotebookText,
  RefreshCcw,
  ShoppingBasket,
  ShoppingCart,
  UserRoundPlus,
  UserRoundX,
  Users,
  Wrench,
} from 'lucide-react'

export interface QuickItem {
  label: string
  description: string
  icon: LucideIcon
  color: string
  to?: string
  action?: 'signout' | 'hacer-copia'
}

// Barra lateral de accesos rápidos de GeminisWin, en el mismo orden que el original.
export const QUICK_ITEMS: QuickItem[] = [
  // Añadido (no está en GeminisWin): Panel de Control, la pantalla inicial.
  { label: 'Panel', description: 'Panel de Control', icon: LayoutDashboard, color: '#1f4e9c', to: '/resumen' },
  { label: 'Camb. Empl.', description: 'Cambiar Empleado', icon: UserRoundPlus, color: '#2f6fb5', action: 'signout' },
  { label: 'Cerrar Empl.', description: 'Cerrar Empleado', icon: UserRoundX, color: '#c0392b', action: 'signout' },
  { label: 'Clientes', description: 'Clientes', icon: Users, color: COLOR_SECCION.clientes, to: '/clientes' },
  { label: 'Pedidos', description: 'Pedidos de Clientes', icon: ShoppingBasket, color: COLOR_SECCION.pedidos, to: '/pedidos' },
  { label: 'Pagos', description: 'Gestor de Pagos de Clientes', icon: HandCoins, color: COLOR_SECCION.pagos, to: '/gestor-cobros-clientes' },
  { label: 'Caja', description: 'Caja', icon: Calculator, color: COLOR_SECCION.caja, to: '/caja' },
  { label: 'Ventas', description: 'TPV / Ventas', icon: Banknote, color: COLOR_SECCION.ventas, to: '/tpv' },
  { label: 'Reparaciones', description: 'Reparaciones', icon: Wrench, color: '#6b4f9e', to: '/reparaciones' },
  { label: 'Facturación', description: 'Facturas', icon: NotebookText, color: COLOR_SECCION.facturacion, to: '/facturacion' },
  { label: 'Compras', description: 'Pedidos a Proveedores', icon: ShoppingCart, color: COLOR_SECCION.compras, to: '/pedidos-proveedor' },
  { label: 'Artículos', description: 'Artículos', icon: Boxes, color: COLOR_SECCION.articulos, to: '/articulos' },
  { label: 'Traspasos', description: 'Traspasos entre Almacenes', icon: RefreshCcw, color: COLOR_SECCION.traspasos, to: '/traspasos' },
  { label: 'Reparar BD', description: 'Reparar Base de Datos', icon: DatabaseZap, color: '#2e7d32' },
  { label: 'Copia', description: 'Copia de Seguridad', icon: Archive, color: '#c99a1b', action: 'hacer-copia' },
  { label: 'Salir', description: 'Salir', icon: LogOut, color: '#1f4e9c', action: 'signout' },
]

export type LadoBarra = 'izquierda' | 'derecha' | 'arriba' | 'abajo'
const CLAVE_LADO = 'erp.barraAccesos.lado'

/** Lado de la pantalla donde va la barra de accesos (se recuerda en este navegador). */
export function useLadoBarra(): [LadoBarra, (l: LadoBarra) => void] {
  const [lado, setLado] = useState<LadoBarra>(() => {
    try {
      const v = localStorage.getItem(CLAVE_LADO)
      return v === 'derecha' || v === 'arriba' || v === 'abajo' ? v : 'izquierda'
    } catch {
      return 'izquierda'
    }
  })
  const cambiar = useCallback((l: LadoBarra) => {
    setLado(l)
    try {
      localStorage.setItem(CLAVE_LADO, l)
    } catch {
      /* sin almacenamiento: vale para esta sesión */
    }
  }, [])
  return [lado, cambiar]
}

/** Lado más cercano al puntero: donde se acopla la barra al soltarla. */
function ladoMasCercano(x: number, y: number): LadoBarra {
  const d = { izquierda: x, derecha: window.innerWidth - x, arriba: y, abajo: window.innerHeight - y }
  return (Object.keys(d) as LadoBarra[]).reduce((a, b) => (d[b] < d[a] ? b : a))
}

/**
 * Barra de accesos rápidos. Como en GeminisWin, se coge por el asa punteada y se suelta junto a
 * cualquier borde de la pantalla (izquierda, derecha, arriba o abajo); mientras se arrastra, el
 * borde donde quedará se marca en azul.
 */
export function QuickBar({
  onRun,
  onHover,
  lado,
  onLado,
}: {
  onRun: (i: QuickItem) => void
  onHover: (text: string | null) => void
  lado: LadoBarra
  onLado: (l: LadoBarra) => void
}) {
  const { puedeRuta } = usePermisos()
  const [destino, setDestino] = useState<LadoBarra | null>(null)
  const horizontal = lado === 'arriba' || lado === 'abajo'

  useEffect(() => {
    if (!destino) return
    const mover = (e: PointerEvent) => setDestino(ladoMasCercano(e.clientX, e.clientY))
    const soltar = (e: PointerEvent) => {
      onLado(ladoMasCercano(e.clientX, e.clientY))
      setDestino(null)
    }
    const cancelar = (e: KeyboardEvent) => e.key === 'Escape' && setDestino(null)
    window.addEventListener('pointermove', mover)
    window.addEventListener('pointerup', soltar)
    window.addEventListener('keydown', cancelar)
    return () => {
      window.removeEventListener('pointermove', mover)
      window.removeEventListener('pointerup', soltar)
      window.removeEventListener('keydown', cancelar)
    }
  }, [destino, onLado])

  const borde = { izquierda: 'border-r', derecha: 'border-l', arriba: 'border-b', abajo: 'border-t' }[lado]
  return (
    <div
      className={`flex flex-none items-stretch border-[var(--gw-border)] bg-[var(--gw-face)] ${borde} ${
        horizontal ? 'h-[62px] flex-row overflow-x-auto px-1' : 'w-[72px] flex-col overflow-y-auto py-1'
      }`}
    >
      <div
        title="Arrastra para colocar la barra en otro lado de la pantalla"
        onPointerDown={(e) => {
          if (e.button !== 0) return
          e.preventDefault()
          setDestino(lado)
        }}
        className={`flex-none cursor-move touch-none ${horizontal ? 'mr-1 w-[8px]' : 'mb-1 h-[8px]'} bg-[radial-gradient(#808080_1px,transparent_1.2px)] bg-[length:4px_4px]`}
      />
      {QUICK_ITEMS.map((q) => {
        const construida = Boolean(q.to || q.action)
        // En gris también lo que el grupo de acceso no permite.
        const enabled = construida && (!q.to || puedeRuta(q.to))
        const motivo = construida ? 'Sin permiso: tu grupo de acceso no tiene esta opción' : 'Aún no disponible en el ERP propio'
        const Icon = q.icon
        return (
          <button
            key={q.label}
            type="button"
            disabled={!enabled}
            title={enabled ? q.description : motivo}
            onClick={() => onRun(q)}
            onMouseEnter={() => onHover(enabled ? q.description : `${q.description} — ${motivo}`)}
            onMouseLeave={() => onHover(null)}
            className={`flex flex-none flex-col items-center justify-center gap-[2px] border border-transparent hover:border-[var(--gw-border)] hover:bg-[#e5f1fb] disabled:opacity-45 disabled:hover:border-transparent disabled:hover:bg-transparent ${
              horizontal ? 'w-[72px]' : 'py-[4px]'
            }`}
          >
            <Icon size={30} color={q.color} fill={q.color} fillOpacity={0.16} strokeWidth={2.1} absoluteStrokeWidth />
            <span className="whitespace-nowrap text-[11px] leading-[12px] text-black">{q.label}</span>
          </button>
        )
      })}
      {destino && <MarcaDestino lado={destino} />}
    </div>
  )
}

/** Franja azul semitransparente en el borde donde se acoplará la barra al soltarla. */
function MarcaDestino({ lado }: { lado: LadoBarra }) {
  const pos = {
    izquierda: 'left-0 top-0 h-full w-[72px]',
    derecha: 'right-0 top-0 h-full w-[72px]',
    arriba: 'left-0 top-0 h-[62px] w-full',
    abajo: 'bottom-0 left-0 h-[62px] w-full',
  }[lado]
  return (
    <div className="pointer-events-none fixed inset-0 z-[200] cursor-move">
      <div className={`absolute ${pos} border-2 border-[#0078d7] bg-[#0078d7]/25`} />
    </div>
  )
}
