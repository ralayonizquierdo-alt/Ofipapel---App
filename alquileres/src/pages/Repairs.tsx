import { useState } from 'react'
import { Plus, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import { useData } from '../contexts/DataContext'
import type { Repair, Apartment, DeletedRepair } from '../types'
import { formatDate } from '../lib/dateUtils'
import { hashPw, getStoredHash } from '../lib/passwordAuth'
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
  const { repairs, apartments: allApartments, deletedRepairs, deleteRepairWithAudit } = useData()
  const apartments = sortApartments(allApartments)
  const [filterApt, setFilterApt] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterDateFrom, setFilterDateFrom] = useState('')
  const [filterDateTo, setFilterDateTo] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Repair | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Repair | null>(null)

  const years = [...new Set(repairs.map(r => r.repairDate?.slice(0, 4)).filter(Boolean))].sort((a, b) => b!.localeCompare(a!))

  const filtered = repairs
    .filter(r => !filterApt || r.apartmentId === filterApt)
    .filter(r => !filterYear || r.repairDate?.startsWith(filterYear))
    .filter(r => !filterDateFrom || (r.repairDate && r.repairDate >= filterDateFrom))
    .filter(r => !filterDateTo || (r.repairDate && r.repairDate <= filterDateTo))
    .sort((a, b) => (b.repairDate || '').localeCompare(a.repairDate || ''))

  const totalFiltered = filtered.reduce((s, r) => s + (r.amount || 0), 0)

  const totalLabel = filterYear ? `Total año ${filterYear}` : 'Total general'

  function getAptName(id: string) { return apartments.find(a => a.id === id)?.name || id }

  const byApt = apartments.map(a => ({
    apt: a,
    total: filtered.filter(r => r.apartmentId === a.id).reduce((s, r) => s + (r.amount || 0), 0)
  })).filter(x => x.total > 0)

  const sortedDeletedRepairs = [...deletedRepairs].sort((a, b) => b.deletedAt.localeCompare(a.deletedAt))

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
      <div className="flex flex-wrap gap-3 mb-5">
        <select value={filterApt} onChange={e => setFilterApt(e.target.value)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Todos los apartamentos</option>
          {apartments.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select value={filterYear} onChange={e => { setFilterYear(e.target.value); setFilterDateFrom(''); setFilterDateTo('') }}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Todos los años</option>
          {years.map(y => <option key={y} value={y!}>{y}</option>)}
        </select>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Desde</span>
          <input type="date" value={filterDateFrom} onChange={e => { setFilterDateFrom(e.target.value); setFilterYear('') }}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-slate-500">Hasta</span>
          <input type="date" value={filterDateTo} onChange={e => { setFilterDateTo(e.target.value); setFilterYear('') }}
            className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white" />
        </div>
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
          <div className="col-span-2 bg-blue-50 rounded-lg border-2 border-blue-300 p-4 flex flex-col justify-center">
            <p className="text-xs font-semibold text-blue-600 uppercase tracking-wide">{totalLabel}</p>
            <p className="text-2xl font-bold text-blue-800 mt-1">{totalFiltered.toLocaleString('es-ES', { minimumFractionDigits: 2 })} €</p>
            <p className="text-xs text-blue-500 mt-0.5">{filtered.length} reparaciones</p>
          </div>
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
                <td className="py-2.5 px-4 text-right font-semibold text-red-700 whitespace-nowrap">
                  {r.amount ? `${r.amount.toLocaleString('es-ES')} €` : '—'}
                </td>
                <td className="py-2.5 px-4 text-slate-400 text-xs">{r.entryNumber || '—'}</td>
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => { setEditing(r); setShowForm(true) }}
                      className="p-1.5 text-slate-300 hover:text-blue-600 rounded"><Pencil size={13} /></button>
                    <button onClick={() => setDeleteTarget(r)}
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
                <td className="py-3 px-4 text-right font-bold text-red-700 whitespace-nowrap">{totalFiltered.toLocaleString('es-ES')} €</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* Deleted repairs audit log */}
      {sortedDeletedRepairs.length > 0 && (
        <div className="mt-8">
          <h2 className="text-sm font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-2">
            <AlertTriangle size={14} className="text-amber-500" />
            Registro de eliminaciones ({sortedDeletedRepairs.length})
          </h2>
          <div className="bg-white rounded-xl shadow-sm border border-amber-200 overflow-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-amber-100 bg-amber-50">
                <tr>
                  <th className="text-left py-2.5 px-4 font-medium text-slate-600 text-xs">Eliminado</th>
                  <th className="text-left py-2.5 px-4 font-medium text-slate-600 text-xs">Por</th>
                  <th className="text-left py-2.5 px-4 font-medium text-slate-600 text-xs">Apartamento</th>
                  <th className="text-left py-2.5 px-4 font-medium text-slate-600 text-xs">Fecha rep.</th>
                  <th className="text-left py-2.5 px-4 font-medium text-slate-600 text-xs">Descripción</th>
                  <th className="text-right py-2.5 px-4 font-medium text-slate-600 text-xs">Importe</th>
                  <th className="text-left py-2.5 px-4 font-medium text-slate-600 text-xs">Motivo</th>
                </tr>
              </thead>
              <tbody>
                {sortedDeletedRepairs.map((d: DeletedRepair) => (
                  <tr key={d.id} className="border-b border-amber-50 hover:bg-amber-50/50">
                    <td className="py-2 px-4 text-xs text-slate-500 whitespace-nowrap">{formatDate(d.deletedAt.slice(0, 10))}</td>
                    <td className="py-2 px-4 text-xs font-medium text-slate-700">{d.deletedBy}</td>
                    <td className="py-2 px-4 text-xs text-slate-500">{getAptName(d.apartmentId)}</td>
                    <td className="py-2 px-4 text-xs text-slate-500 whitespace-nowrap">{formatDate(d.repairDate)}</td>
                    <td className="py-2 px-4 text-xs text-slate-700">{d.item}</td>
                    <td className="py-2 px-4 text-xs text-right font-semibold text-red-700 whitespace-nowrap">
                      {d.amount ? `${d.amount.toLocaleString('es-ES')} €` : '—'}
                    </td>
                    <td className="py-2 px-4 text-xs text-amber-700 italic">{d.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showForm && (
        <RepairForm
          apartments={apartments}
          editing={editing}
          onClose={() => setShowForm(false)}
        />
      )}

      {deleteTarget && (
        <DeleteConfirmModal
          repair={deleteTarget}
          onConfirm={(reason, deletedBy) => {
            deleteRepairWithAudit(deleteTarget, reason, deletedBy)
            setDeleteTarget(null)
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  )
}

function DeleteConfirmModal({ repair, onConfirm, onClose }:
  { repair: Repair; onConfirm: (reason: string, deletedBy: string) => void; onClose: () => void }) {
  const [reason, setReason] = useState('')
  const [pw, setPw] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleConfirm() {
    if (!reason.trim()) { setError('Introduce el motivo de la eliminación'); return }
    if (!pw) { setError('Introduce la contraseña'); return }
    setLoading(true)
    const h = await hashPw(pw)
    if (h !== getStoredHash()) {
      setError('Contraseña incorrecta')
      setPw('')
      setLoading(false)
      return
    }
    const deletedBy = localStorage.getItem('aq_current_user') || 'Desconocido'
    onConfirm(reason.trim(), deletedBy)
  }

  return (
    <Modal title="Eliminar reparación" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-start gap-3 p-3 bg-red-50 rounded-lg border border-red-200">
          <AlertTriangle size={16} className="text-red-500 shrink-0 mt-0.5" />
          <div className="text-sm text-red-700">
            <p className="font-semibold">{repair.item}</p>
            {repair.amount && <p className="text-xs mt-0.5">{repair.amount.toLocaleString('es-ES')} €</p>}
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Motivo de la eliminación *</label>
          <textarea
            value={reason}
            onChange={e => { setReason(e.target.value); setError('') }}
            rows={2}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-400"
            placeholder="Indica el motivo..."
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Contraseña de acceso *</label>
          <input
            type="password"
            value={pw}
            onChange={e => { setPw(e.target.value); setError('') }}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400"
            placeholder="Contraseña"
            autoComplete="current-password"
          />
        </div>
        {error && <p className="text-red-500 text-xs">{error}</p>}
        <div className="flex justify-end gap-3 pt-1">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">Cancelar</button>
          <button onClick={handleConfirm} disabled={loading}
            className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700 font-medium disabled:opacity-60">
            {loading ? 'Verificando...' : 'Eliminar'}
          </button>
        </div>
      </div>
    </Modal>
  )
}

function RepairForm({ apartments, editing, onClose }:
  { apartments: Apartment[]; editing: Repair | null; onClose: () => void }) {
  const { addRepair, updateRepair } = useData()
  const [aptId, setAptId] = useState(editing?.apartmentId || apartments[0]?.id || '')
  const [repairDate, setRepairDate] = useState(editing?.repairDate || '')
  const [item, setItem] = useState(editing?.item || '')
  const [supplier, setSupplier] = useState(editing?.supplier || '')
  const [document, setDocument] = useState(editing?.document || '')
  const [amount, setAmount] = useState(editing?.amount || 0)
  const [entryNumber, setEntryNumber] = useState(editing?.entryNumber || '')

  function handleSave() {
    if (!item.trim()) return alert('Introduce una descripción')
    const data = { apartmentId: aptId, repairDate: repairDate || undefined, item, supplier, document, amount, entryNumber }
    if (editing) updateRepair(editing.id, data)
    else addRepair(data)
    onClose()
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
