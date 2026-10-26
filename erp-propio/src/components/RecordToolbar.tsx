import {
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Search,
  List,
  Plus,
  Pencil,
  Trash2,
  LogOut,
  Save,
  XCircle,
} from 'lucide-react'

/**
 * Barra inferior común a todas las fichas de GeminisWin: primero · anterior ·
 * siguiente · último · buscar · lista/filtro · nuevo · modificar · eliminar · salir.
 * Reutilizable en cualquier pantalla con el mismo patrón (Artículos, Clientes...).
 */
export function RecordToolbar({
  mode,
  canNavigate,
  onFirst,
  onPrev,
  onNext,
  onLast,
  onSearch,
  onList,
  onNew,
  onEdit,
  onSave,
  onCancel,
  onDelete,
  onExit,
  saving,
}: {
  mode: 'consulta' | 'edicion' | 'alta'
  canNavigate: boolean
  onFirst?: () => void
  onPrev?: () => void
  onNext?: () => void
  onLast?: () => void
  onSearch?: () => void
  onList?: () => void
  onNew?: () => void
  onEdit?: () => void
  onSave?: () => void
  onCancel?: () => void
  onDelete?: () => void
  onExit?: () => void
  saving?: boolean
}) {
  const btn =
    'flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent'

  return (
    <div className="sticky bottom-0 flex flex-wrap items-center gap-1 rounded-xl border border-slate-200 bg-white px-2 py-1.5 shadow-sm">
      <button type="button" className={btn} disabled={!canNavigate} onClick={onFirst} title="Primero">
        <ChevronFirst size={16} />
      </button>
      <button type="button" className={btn} disabled={!canNavigate} onClick={onPrev} title="Anterior">
        <ChevronLeft size={16} />
      </button>
      <button type="button" className={btn} disabled={!canNavigate} onClick={onNext} title="Siguiente">
        <ChevronRight size={16} />
      </button>
      <button type="button" className={btn} disabled={!canNavigate} onClick={onLast} title="Último">
        <ChevronLast size={16} />
      </button>
      <span className="mx-1 h-5 w-px bg-slate-200" />
      <button type="button" className={btn} onClick={onSearch} title="Buscar">
        <Search size={16} /> Buscar
      </button>
      <button type="button" className={btn} onClick={onList} title="Lista">
        <List size={16} /> Lista
      </button>
      <span className="mx-1 h-5 w-px bg-slate-200" />
      {mode === 'consulta' && (
        <>
          <button type="button" className={btn} onClick={onNew} title="Nuevo">
            <Plus size={16} /> Nuevo
          </button>
          <button type="button" className={btn} onClick={onEdit} title="Modificar">
            <Pencil size={16} /> Modificar
          </button>
          <button type="button" className={`${btn} hover:bg-red-50 hover:text-red-600`} onClick={onDelete} title="Eliminar">
            <Trash2 size={16} /> Eliminar
          </button>
        </>
      )}
      {(mode === 'edicion' || mode === 'alta') && (
        <>
          <button
            type="button"
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-2 text-xs font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
            onClick={onSave}
          >
            <Save size={16} /> {saving ? 'Guardando…' : 'Guardar'}
          </button>
          <button type="button" className={btn} onClick={onCancel} title="Cancelar">
            <XCircle size={16} /> Cancelar
          </button>
        </>
      )}
      <span className="ml-auto" />
      <button type="button" className={btn} onClick={onExit} title="Salir">
        <LogOut size={16} /> Salir
      </button>
    </div>
  )
}
