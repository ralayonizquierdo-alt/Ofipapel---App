import { useState } from 'react'
import { ShieldCheck, Plus, Trash2 } from 'lucide-react'
import { useDatabase, useCollection } from '../lib/DatabaseContext'
import DataTable, { type Column } from '../components/DataTable'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import FormField, { inputClass } from '../components/FormField'
import type { AppUser, UserRole } from '../types'

const ROLES: UserRole[] = ['Administración', 'Comercial', 'Almacén', 'Contabilidad']
const emptyForm = { nombre: '', usuario: '', rol: 'Comercial' as UserRole }

export default function UsuariosPage() {
  const { db } = useDatabase()
  const { items: users, add, update, remove } = useCollection('users')
  const [rolFiltro, setRolFiltro] = useState('')
  const [selected, setSelected] = useState<AppUser | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const rows = rolFiltro ? users.filter((u) => u.rol === rolFiltro) : users

  const columns: Column<AppUser>[] = [
    { key: 'nombre', label: 'Usuario', sortValue: (u) => u.nombre },
    { key: 'usuario', label: 'Login', sortValue: (u) => u.usuario },
    { key: 'rol', label: 'Rol', render: (u) => <Badge label={u.rol} />, sortValue: (u) => u.rol },
    { key: 'acceso', label: 'Último acceso', sortValue: (u) => u.ultimoAcceso },
    { key: 'estado', label: 'Estado', render: (u) => <Badge label={u.activo ? 'Activo' : 'Inactivo'} /> },
  ]

  function openEdit(u: AppUser) {
    setSelected(u)
    setForm({ nombre: u.nombre, usuario: u.usuario, rol: u.rol })
  }
  function openCreate() {
    setForm(emptyForm)
    setCreating(true)
  }
  function closeModal() {
    setSelected(null)
    setCreating(false)
  }
  function save() {
    if (selected) {
      update(selected.id, form)
    } else {
      add({ id: `usr-${Date.now()}`, ...form, ultimoAcceso: '—', activo: true })
    }
    closeModal()
  }
  function toggleActivo() {
    if (!selected) return
    update(selected.id, { activo: !selected.activo })
    closeModal()
  }
  function handleDelete() {
    if (!selected) return
    remove(selected.id)
    closeModal()
  }

  const modalOpen = selected !== null || creating

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
            <ShieldCheck size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Usuarios y permisos</h1>
        </div>
        <Badge label="Activo (Fase 1)" />
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">
        {users.length} usuarios · {db.salesReps.length} comerciales, {db.locations.filter((l) => l.tipo === 'Almacén').length} almacenes con encargado
      </p>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(u) => u.id}
        searchableText={(u) => `${u.nombre} ${u.usuario}`}
        onRowClick={openEdit}
        pageSize={14}
        filters={
          <select value={rolFiltro} onChange={(e) => setRolFiltro(e.target.value)} className={`${inputClass} max-w-[200px]`}>
            <option value="">Todos los roles</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        }
        actions={
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
            <Plus size={15} /> Nuevo usuario
          </button>
        }
      />

      {modalOpen && (
        <Modal
          title={selected ? selected.nombre : 'Nuevo usuario'}
          onClose={closeModal}
          footer={
            <>
              {selected && (
                <>
                  <button onClick={toggleActivo} className="mr-auto px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                    {selected.activo ? 'Desactivar' : 'Activar'}
                  </button>
                  <button onClick={handleDelete} className="flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                    <Trash2 size={14} /> Eliminar
                  </button>
                </>
              )}
              <button onClick={closeModal} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
                Cancelar
              </button>
              <button onClick={save} className="px-4 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
                Guardar
              </button>
            </>
          }
        >
          <FormField label="Nombre">
            <input className={inputClass} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </FormField>
          <FormField label="Usuario (login)">
            <input className={inputClass} value={form.usuario} onChange={(e) => setForm({ ...form, usuario: e.target.value })} />
          </FormField>
          <FormField label="Rol">
            <select className={inputClass} value={form.rol} onChange={(e) => setForm({ ...form, rol: e.target.value as UserRole })}>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </FormField>
        </Modal>
      )}
    </div>
  )
}
