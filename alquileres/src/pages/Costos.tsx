import { useState, useEffect } from 'react'
import { Plus, Pencil, Trash2 } from 'lucide-react'
import { expenseStorage, apartmentStorage } from '../lib/storage'
import type { Expense, Apartment, ExpenseType } from '../types'
import { formatDate } from '../lib/dateUtils'
import Modal from '../components/ui/Modal'
import PageHeader from '../components/ui/PageHeader'

const EXPENSE_TYPE_LABELS: Record<ExpenseType, string> = {
  lavanderia: 'Lavandería',
  limpieza: 'Limpieza',
  luz: 'Luz',
  agua: 'Agua',
  impuestos: 'Impuestos',
  otro: 'Otro',
}

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

export default function Costos() {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [apartments, setApartments] = useState<Apartment[]>([])
  const [filterApt, setFilterApt] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterType, setFilterType] = useState<ExpenseType | ''>('')
  const [showForm, setShowForm] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)

  function reload() { setExpenses(expenseStorage.getAll()) }
  useEffect(() => { reload(); setApartments(sortApartments(apartmentStorage.getAll())) }, [])

  const years = [...new Set(expenses.map(e => e.expenseDate?.slice(0, 4)).filter(Boolean))].sort((a, b) => b!.localeCompare(a!))

  const filtered = expenses
    .filter(e => !filterApt || e.apartmentId === filterApt)
    .filter(e => !filterYear || e.expenseDate?.startsWith(filterYear))
    .filter(e => !filterType || e.expenseType === filterType)
    .sort((a, b) => (b.expenseDate || '').localeCompare(a.expenseDate || ''))

  const totalFiltered = filtered.reduce((s, e) => s + (e.amount || 0), 0)

  function getAptName(id: string) { return apartments.find(a => a.id === id)?.name || id }
  function handleDelete(id: string) {
    if (!confirm('¿Eliminar este gasto?')) return
    expenseStorage.delete(id)
    reload()
  }

  // Group by apartment for summary cards
  const byApt = apartments.map(a => ({
    apt: a,
    total: filtered.filter(e => e.apartmentId === a.id).reduce((s, e) => s + (e.amount || 0), 0)
  })).filter(x => x.total > 0)

  return (
    <div className="p-6">
      <PageHeader
        title="Costes de Producción"
        subtitle={`${filtered.length} registros · Total: ${totalFiltered.toLocaleString('es-ES')} €`}
        actions={
          <button onClick={() => { setEditing(null); setShowForm(true) }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus size={16} /> Nuevo gasto
          </button>
        }
      />

      {/* Filters */}
      <div className="flex gap-3 mb-5 flex-wrap">
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
        <select value={filterType} onChange={e => setFilterType(e.target.value as ExpenseType | '')}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Todos los tipos</option>
          {(Object.keys(EXPENSE_TYPE_LABELS) as ExpenseType[]).map(k => (
            <option key={k} value={k}>{EXPENSE_TYPE_LABELS[k]}</option>
          ))}
        </select>
      </div>

      {/* Summary cards */}
      {byApt.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          {byApt.map(({ apt, total }) => (
            <div key={apt.id} className="bg-white rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">{apt.name}</p>
              <p className="text-lg font-bold text-orange-700 mt-0.5">{total.toLocaleString('es-ES')} €</p>
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
              <th className="text-left py-3 px-4 font-medium text-slate-600">Tipo</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Descripción</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Proveedor</th>
              <th className="text-right py-3 px-4 font-medium text-slate-600">Importe</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Nº Asiento</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(e => (
              <tr key={e.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2.5 px-4 font-medium text-slate-700 text-xs">{getAptName(e.apartmentId)}</td>
                <td className="py-2.5 px-4 text-slate-500 text-xs whitespace-nowrap">{formatDate(e.expenseDate)}</td>
                <td className="py-2.5 px-4">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                    {EXPENSE_TYPE_LABELS[e.expenseType]}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-slate-700">{e.description}</td>
                <td className="py-2.5 px-4 text-slate-500 text-xs">{e.supplier || '—'}</td>
                <td className="py-2.5 px-4 text-right font-semibold text-orange-700">
                  {e.amount ? `${e.amount.toLocaleString('es-ES')} €` : '—'}
                </td>
                <td className="py-2.5 px-4 text-slate-400 text-xs">{e.entryNumber || '—'}</td>
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-1 justify-end">
                    <button onClick={() => { setEditing(e); setShowForm(true) }}
                      className="p-1.5 text-slate-300 hover:text-blue-600 rounded"><Pencil size={13} /></button>
                    <button onClick={() => handleDelete(e.id)}
                      className="p-1.5 text-slate-300 hover:text-red-600 rounded"><Trash2 size={13} /></button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="py-8 text-center text-slate-400 text-sm">No hay registros de gastos</td></tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={5} className="py-3 px-4 text-sm font-semibold text-slate-700">TOTAL</td>
                <td className="py-3 px-4 text-right font-bold text-orange-700">{totalFiltered.toLocaleString('es-ES')} €</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showForm && (
        <ExpenseForm
          key={editing?.id || 'new'}
          apartments={apartments}
          editing={editing}
          onClose={() => setShowForm(false)}
          onSave={() => { setShowForm(false); reload() }}
        />
      )}
    </div>
  )
}

function ExpenseForm({ apartments, editing, onClose, onSave }:
  { apartments: Apartment[]; editing: Expense | null; onClose: () => void; onSave: () => void }) {
  const [aptId, setAptId] = useState(editing?.apartmentId || apartments[0]?.id || '')
  const [expenseDate, setExpenseDate] = useState(editing?.expenseDate || '')
  const [expenseType, setExpenseType] = useState<ExpenseType>(editing?.expenseType || 'lavanderia')
  const [description, setDescription] = useState(editing?.description || '')
  const [supplier, setSupplier] = useState(editing?.supplier || '')
  const [amount, setAmount] = useState(editing?.amount || 0)
  const [entryNumber, setEntryNumber] = useState(editing?.entryNumber || '')

  function handleSave() {
    if (!description.trim()) return alert('Introduce una descripción')
    const data = {
      apartmentId: aptId,
      expenseDate: expenseDate || undefined,
      expenseType,
      description,
      supplier: supplier || undefined,
      amount,
      entryNumber: entryNumber || undefined,
    }
    if (editing) expenseStorage.update(editing.id, data)
    else expenseStorage.add(data)
    onSave()
  }

  return (
    <Modal title={editing ? 'Editar gasto' : 'Nuevo gasto de producción'} onClose={onClose}>
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
            <input type="date" value={expenseDate} onChange={e => setExpenseDate(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Tipo de gasto *</label>
          <select value={expenseType} onChange={e => setExpenseType(e.target.value as ExpenseType)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm">
            {(Object.keys(EXPENSE_TYPE_LABELS) as ExpenseType[]).map(k => (
              <option key={k} value={k}>{EXPENSE_TYPE_LABELS[k]}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Descripción *</label>
          <input value={description} onChange={e => setDescription(e.target.value)}
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
            placeholder="Ej: Lavandería Mayo semana 1" />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Proveedor</label>
            <input value={supplier} onChange={e => setSupplier(e.target.value)}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Importe (€)</label>
            <input type="number" value={amount} onChange={e => setAmount(Number(e.target.value))}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm" step="0.01" />
          </div>
          <div className="col-span-2">
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
