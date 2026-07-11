import { useState } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import type { Apartment, ApartmentType } from '../types'
import Modal from '../components/ui/Modal'
import PageHeader from '../components/ui/PageHeader'

const TYPE_LABELS: Record<ApartmentType, string> = {
  '1BR': '1 Dormitorio', '2BR': '2 Dormitorios',
  '2BR_ATICO': 'Ático (2 Dorm.)', '3BR': '3 Dormitorios',
}

export default function ApartmentsConfig() {
  const { apartments, updateApartment, deleteApartment } = useData()
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Apartment | null>(null)

  function handleDelete(id: string) {
    if (!confirm('¿Eliminar este apartamento?')) return
    deleteApartment(id)
  }

  function toggleActive(a: Apartment) {
    updateApartment(a.id, { active: !a.active })
  }

  return (
    <div className="p-6">
      <PageHeader
        title="Apartamentos"
        subtitle="Gestión de propiedades"
        actions={
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus size={16} /> Nuevo apartamento
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {apartments.map(apt => (
          <div key={apt.id} className={`bg-white rounded-xl border shadow-sm p-5 ${apt.active ? 'border-slate-200' : 'border-slate-100 opacity-60'}`}>
            <div className="flex items-start justify-between mb-3">
              <div>
                <h3 className="font-semibold text-slate-800">{apt.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{TYPE_LABELS[apt.type]} · ID: {apt.id}</p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" checked={apt.active} onChange={() => toggleActive(apt)} className="sr-only peer" />
                <div className="w-9 h-5 bg-slate-200 peer-checked:bg-blue-600 rounded-full transition-colors peer-checked:after:translate-x-4 after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-4 after:w-4 after:transition-all" />
              </label>
            </div>
            {apt.notes && <p className="text-xs text-slate-500 mb-3">{apt.notes}</p>}
            <div className="flex gap-2 mt-3 pt-3 border-t border-slate-100">
              <button onClick={() => { setEditing(apt); setShowForm(true) }}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-blue-600 px-2 py-1 rounded hover:bg-slate-100">
                <Pencil size={12} /> Editar
              </button>
              <button onClick={() => handleDelete(apt.id)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-red-600 px-2 py-1 rounded hover:bg-slate-100">
                <Trash2 size={12} /> Eliminar
              </button>
            </div>
          </div>
        ))}
      </div>

      {showForm && (
        <AptForm editing={editing} onClose={() => setShowForm(false)} />
      )}
    </div>
  )
}

function AptForm({ editing, onClose }:
  { editing: Apartment | null; onClose: () => void }) {
  const { addApartment, updateApartment } = useData()
  const [id, setId] = useState(editing?.id || '')
  const [name, setName] = useState(editing?.name || '')
  const [bedrooms, setBedrooms] = useState(editing?.bedrooms || 1)
  const [type, setType] = useState<ApartmentType>(editing?.type || '1BR')
  const [notes, setNotes] = useState(editing?.notes || '')

  function handleSave() {
    if (!name.trim() || !id.trim()) return alert('Completa nombre e ID')
    if (editing) {
      updateApartment(editing.id, { name, bedrooms, type, notes })
    } else {
      addApartment({ id, name, bedrooms, type, active: true, notes })
    }
    onClose()
  }

  return (
    <Modal title={editing ? 'Editar apartamento' : 'Nuevo apartamento'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">ID único *</label>
            <input value={id} onChange={e => setId(e.target.value)} disabled={!!editing}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
              placeholder="Ej: 104, P3, ATICO..." />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nombre *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
              placeholder="Ej: Apartamento 104" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Tipo</label>
            <select value={type} onChange={e => setType(e.target.value as ApartmentType)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Habitaciones</label>
            <input type="number" value={bedrooms} onChange={e => setBedrooms(Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" min="1" max="10" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Notas</label>
          <input value={notes} onChange={e => setNotes(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Observaciones opcionales" />
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            {editing ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
