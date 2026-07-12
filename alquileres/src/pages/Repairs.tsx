import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { repairStorage, apartmentStorage } from '../lib/storage'
import type { Repair, Apartment } from '../types'
import { formatDate } from '../lib/dateUtils'
import Modal from '../components/ui/Modal'
import PageHeader from '../components/ui/PageHeader'

const APT_ORDER = ['104', '105', '106', '203', '204', '402', 'P3', 'AP2B', 'JXXIII']

function sortApartments(apts: Apartment[]): Apartment[] {
  return [...apts].sort((a, b) => {
    const ai = APT_ORDER.indexOf(a.id)
    const bi = APT_ORDER.indexOf(b.id)
    if (ai === -1 && bi === -1) return a.id.localeCompare(b.id)
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })
}

export default function Repairs() {
  const [repairs, setRepairs] = useState<Repair[]>([])
  const [apartments, setApartments] = useState<Apartment[]>([])
  const [filterApt, setFilterApt] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Repair | null>(null)

  function reload() { repairStorage.getAll().then(setRepairs) }
  useEffect(() => {
    reload()
    apartmentStorage.getAll().then(apts => setApartments(sortApartments(apts)))
  }, [])

  const years = [...new Set(repairs.map(r => r.repairDate?.slice(0, 4)).filter(Boolean))].sort((a, b) => b!.localeCompare(a!))

  const filtered = repairs
    .filter(r => !filterApt || r.apartmentId === filterApt)
    .filter(r => !filterYear || r.repairDate?.startsWith(filterYear))
    .sort((a, b) => (b.repairDate || '').localeCompare(a.repairDate || ''))

  const totalFiltered = filtered.reduce((s, r) => s + (r.amount || 0), 0)

  function getAptName(id: string) { return apartments.find(a => a.id === id)?.name || id }
  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar?')) return
    await repairStorage.delete(id)
    reload()
  }

  // Group by apartment for totals
  const byApt = apartments.map(a => ({
    apt: a,
    total: filtered.filter(r => r.apartmentId === a.id).reduce((s, r) => s + (r.amount || 0), 0)
  })).filter(x => x.total > 0)

  return (
    <div className="p-6">
      <PageHeader
        title="Reparaciones y Mantenimiento"
        subtitle={`${filtered.length} registros · Total: ${totalFiltered.toLocaleString('es-ES')} €`}
        actions={
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus size={16} /> Nueva reparación
          </button>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 mb-5">
        <select value={filterApt} onChange={e => setFilterApt(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Todos los apartamentos</option>
          {apartments.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={filterYear} onChange={e => setFilterYear(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Todos los años</option>
          {years.map(y => <option key={y} value={y!}>{y}</option>)}
        </select>
      </div>

      {/* Totals by apartment */}
      {byApt.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {byApt.map(({ apt, total }) => (
            <div key={apt.id} className="bg-white rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">{apt.name}</p>
              <p className="text-lg font-bold text-red-700 mt-0.5">{total.toLocaleString('es-ES')} €</p>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Apartamento</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Fecha</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Descripción</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Proveedor</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Documento</th>
              <th className="text-right py-3 px-4 font-medium text-slate-600">Importe</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Nº Asiento</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2.5 px-4 font-medium text-slate-700 text-xs">{getAptName(r.apartmentId)}</td>
                <td className="py-2.5 px-4 text-slate-500 text-xs whitespace-nowrap">{formatDate(r.repairDate)}</td>
                <td className="py-2.5 px-4 text-slate-700">{r.item}</td>
                <td className="py-2.5 px-4 text-slate-500 text-xs">{r.supplier || '—'}</td>
                <td className="py-2.5 px-4 text-slate-500 text-xs">{r.document || '—'}</td>
                <td className="py-2.5 px-4 text-right font-semibold text-red-700">
                  {r.amount ? `${r.amount.toLocaleString('es-ES')} €` : '—'}
                </td>
                <td className="py-2.5 px-4 text-slate-400 text-xs">{r.entryNumber || '—'}</td>
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => { setEditing(r); setShowForm(true) }}
                      className="p-1.5 text-slate-300 hover:text-blue-600 rounded"><Pencil size={13} /></button>
                    <button onClick={() => handleDelete(r.id)}
                      className="p-1.5 text-slate-300 hover:text-red-600 rounded"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-slate-400 text-sm">No hay registros</td></tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={5} className="py-3 px-4 text-sm font-semibold text-slate-700">TOTAL</td>
                <td className="py-3 px-4 text-right font-bold text-red-700">{totalFiltered.toLocaleString('es-ES')} €</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showForm && (
        <RepairForm
          apartments={apartments}
          editing={editing}
          onClose={() => setShowForm(false)}
          onSave={() => { setShowForm(false); reload() }}
        />
      )}
    </div>
  )
}

function RepairForm({ apartments, editing, onClose, onSave }:
  { apartments: Apartment[]; editing: Repair | null; onClose: () => void; onSave: () => void }) {
  const [aptId, setAptId] = useState(editing?.apartmentId || apartments[0]?.id || '')
  const [repairDate, setRepairDate] = useState(editing?.repairDate || '')
  const [item, setItem] = useState(editing?.item || '')
  const [supplier, setSupplier] = useState(editing?.supplier || '')
  const [document, setDocument] = useState(editing?.document || '')
  const [amount, setAmount] = useState(editing?.amount || 0)
  const [entryNumber, setEntryNumber] = useState(editing?.entryNumber || '')

  async function handleSave() {
    if (!item.trim()) return alert('Introduce una descripción')
    const data = { apartmentId: aptId, repairDate: repairDate || undefined, item, supplier, document, amount, entryNumber }
    if (editing) await repairStorage.update(editing.id, data)
    else await repairStorage.add(data)
    onSave()
  }

  return (
    <Modal title={editing ? 'Editar reparación' : 'Nueva reparación'} onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Apartamento *</label>
            <select value={aptId} onChange={e => setAptId(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
              {apartments.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Fecha</label>
            <input type="date" value={repairDate} onChange={e => setRepairDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Descripción (menaje) *</label>
          <input value={item} onChange={e => setItem(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" placeholder="Ej: Lavadora AEG 7KG" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Proveedor</label>
            <input value={supplier} onChange={e => setSupplier(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nº Documento</label>
            <input value={document} onChange={e => setDocument(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Importe (€)</label>
            <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" step="0.01" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Nº Asiento contable</label>
            <input value={entryNumber} onChange={e => setEntryNumber(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={handleSave} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">
            {editing ? 'Guardar' : 'Añadir'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
