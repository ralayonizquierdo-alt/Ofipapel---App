import type { ReactNode } from 'react'
import { X } from 'lucide-react'
import { useArrastre } from './gw'

export function Modal({
  title,
  onClose,
  children,
  widthClass = 'max-w-lg',
}: {
  title: string
  onClose: () => void
  children: ReactNode
  widthClass?: string
}) {
  const { estilo, barra } = useArrastre()
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-slate-900/50 p-4 pt-12 backdrop-blur-sm">
      <div className={`w-full ${widthClass} rounded-2xl bg-white shadow-xl`} style={estilo}>
        <div className="flex cursor-move select-none items-center justify-between border-b border-slate-100 px-6 py-4" {...barra}>
          <h2 className="text-lg font-semibold text-slate-800">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            title="Cerrar"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
      </div>
    </div>
  )
}
