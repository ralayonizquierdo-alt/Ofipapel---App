import { NavLink } from 'react-router-dom'
import { RotateCcw } from 'lucide-react'
import { MENU_SECTIONS, PHASE_META } from '../data/menu'
import { useDatabase } from '../lib/DatabaseContext'

export default function Sidebar() {
  const { reset } = useDatabase()

  return (
    <aside className="w-72 shrink-0 h-screen sticky top-0 overflow-y-auto bg-slate-900 text-slate-200 flex flex-col">
      <div className="px-5 py-5 border-b border-slate-800">
        <div className="text-lg font-semibold text-white">Ofipapel ERP</div>
        <div className="text-xs text-slate-400 mt-0.5">Proyecto de gestión a medida</div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-6">
        {MENU_SECTIONS.map((section) => {
          const meta = PHASE_META[section.phase]
          return (
            <div key={section.phase}>
              <div className="flex items-center justify-between px-2 mb-2">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  {section.title}
                </span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${meta.color}`}>
                  {meta.label}
                </span>
              </div>
              <div className="space-y-0.5">
                {section.items.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.id}
                      to={item.path}
                      end={item.path === '/'}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                          isActive
                            ? 'bg-slate-800 text-white'
                            : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                        }`
                      }
                    >
                      <Icon size={16} className="shrink-0" />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  )
                })}
              </div>
            </div>
          )
        })}
      </nav>

      <div className="px-5 py-4 border-t border-slate-800">
        <p className="text-[11px] text-slate-500 mb-2">
          Prototipo interactivo — datos de ejemplo guardados en este navegador, sin base de datos real todavía
        </p>
        <button
          onClick={() => {
            if (confirm('¿Restaurar todos los datos de ejemplo? Se perderán los cambios hechos en esta sesión.')) reset()
          }}
          className="flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-white"
        >
          <RotateCcw size={12} /> Restaurar datos de ejemplo
        </button>
      </div>
    </aside>
  )
}
