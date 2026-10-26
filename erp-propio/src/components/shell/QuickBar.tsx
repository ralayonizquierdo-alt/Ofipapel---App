import type { LucideIcon } from 'lucide-react'
import {
  Archive,
  Banknote,
  Boxes,
  Calculator,
  DatabaseZap,
  HandCoins,
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
  action?: 'signout'
}

// Barra lateral de accesos rápidos de GeminisWin, en el mismo orden que el original.
export const QUICK_ITEMS: QuickItem[] = [
  { label: 'Camb. Empl.', description: 'Cambiar Empleado', icon: UserRoundPlus, color: '#2f6fb5', action: 'signout' },
  { label: 'Cerrar Empl.', description: 'Cerrar Empleado', icon: UserRoundX, color: '#c0392b', action: 'signout' },
  { label: 'Clientes', description: 'Clientes', icon: Users, color: '#b7791f', to: '/clientes' },
  { label: 'Pedidos', description: 'Pedidos de Clientes', icon: ShoppingBasket, color: '#2f8f2f', to: '/pedidos' },
  { label: 'Pagos', description: 'Pagos', icon: HandCoins, color: '#a8742a', to: '/pagos' },
  { label: 'Caja', description: 'Caja', icon: Calculator, color: '#5d6d7e', to: '/caja' },
  { label: 'Ventas', description: 'TPV / Ventas', icon: Banknote, color: '#3d7f5a', to: '/tpv' },
  { label: 'Reparaciones', description: 'Reparaciones', icon: Wrench, color: '#6b4f9e', to: '/reparaciones' },
  { label: 'Facturación', description: 'Facturas', icon: NotebookText, color: '#c0392b', to: '/facturacion' },
  { label: 'Compras', description: 'Pedidos a Proveedores', icon: ShoppingCart, color: '#8b4513', to: '/compras' },
  { label: 'Artículos', description: 'Artículos', icon: Boxes, color: '#c58a3a', to: '/articulos' },
  { label: 'Traspasos', description: 'Traspasos entre Almacenes', icon: RefreshCcw, color: '#e08a1e', to: '/traspasos' },
  { label: 'Reparar BD', description: 'Reparar Base de Datos', icon: DatabaseZap, color: '#2e7d32' },
  { label: 'Copia', description: 'Copia de Seguridad', icon: Archive, color: '#c99a1b' },
  { label: 'Salir', description: 'Salir', icon: LogOut, color: '#1f4e9c', action: 'signout' },
]

export function QuickBar({ onRun, onHover }: { onRun: (i: QuickItem) => void; onHover: (text: string | null) => void }) {
  return (
    <div className="flex w-[62px] flex-none flex-col items-stretch overflow-y-auto border-r border-[var(--gw-border)] bg-[var(--gw-face)] py-1">
      {QUICK_ITEMS.map((q) => {
        const enabled = Boolean(q.to || q.action)
        const Icon = q.icon
        return (
          <button
            key={q.label}
            type="button"
            disabled={!enabled}
            title={enabled ? q.description : 'Aún no disponible en el ERP propio'}
            onClick={() => onRun(q)}
            onMouseEnter={() => onHover(enabled ? q.description : `${q.description} — Aún no disponible en el ERP propio`)}
            onMouseLeave={() => onHover(null)}
            className="flex flex-col items-center gap-[1px] border border-transparent py-[3px] hover:border-[var(--gw-border)] hover:bg-[#e5f1fb] disabled:opacity-45 disabled:hover:border-transparent disabled:hover:bg-transparent"
          >
            <Icon size={24} color={q.color} strokeWidth={2} />
            <span className="text-[10px] leading-[11px] text-black">{q.label}</span>
          </button>
        )
      })}
    </div>
  )
}
