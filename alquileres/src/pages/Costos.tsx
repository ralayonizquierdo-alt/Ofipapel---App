import { useState } from 'react'
import { Plus, Pencil, Trash2, Upload, Wrench } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useData } from '../contexts/DataContext'
import type { Expense, Apartment, ExpenseType } from '../types'
import { formatDate } from '../lib/dateUtils'
import { EXPENSE_LABELS, EXPENSE_DEDUCIBILIDAD, deducibleGasto, deducibleReparacion, redondea } from '../lib/deducible'
import Modal from '../components/ui/Modal'
import PageHeader from '../components/ui/PageHeader'
import ImportarExcel from '../components/ImportarExcel'

const EXPENSE_TYPE_LABELS = EXPENSE_LABELS

/** Las reparaciones se guardan aparte (con proveedor y factura) pero aquí se
 *  listan como un concepto más, para tener todo el gasto en una sola pantalla. */
type FiltroTipo = ExpenseType | 'reparaciones' | ''

interface Linea {
  id: string
  origen: 'gasto' | 'reparacion'
  apartmentId: string
  fecha?: string
  tipo: ExpenseType | 'reparaciones'
  etiqueta: string
  descripcion: string
  proveedor?: string
  importe: number
  deducible: number
  regla: '100%' | 'por ocupación'
  asiento?: string
  gasto?: Expense
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
  const { expenses, repairs, apartments: allApartments, deleteExpense, reservations } = useData()
  const apartments = sortApartments(allApartments)
  const [filterApt, setFilterApt] = useState('')
  const [filterYear, setFilterYear] = useState('')
  const [filterType, setFilterType] = useState<FiltroTipo>('')
  const [showForm, setShowForm] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [editing, setEditing] = useState<Expense | null>(null)

  const lineas: Linea[] = [
    ...expenses.map((e): Linea => ({
      id: e.id, origen: 'gasto', apartmentId: e.apartmentId, fecha: e.expenseDate,
      tipo: e.expenseType, etiqueta: EXPENSE_LABELS[e.expenseType],
      descripcion: e.description, proveedor: e.supplier,
      importe: e.amount || 0, deducible: deducibleGasto(e, reservations),
      regla: EXPENSE_DEDUCIBILIDAD[e.expenseType] === 'directo' ? '100%' : 'por ocupación',
      asiento: e.entryNumber, gasto: e,
    })),
    ...repairs.map((r): Linea => ({
      id: r.id, origen: 'reparacion', apartmentId: r.apartmentId, fecha: r.repairDate,
      tipo: 'reparaciones', etiqueta: 'Reparaciones y conservación',
      descripcion: r.item, proveedor: r.supplier,
      importe: r.amount || 0, deducible: deducibleReparacion(r, reservations),
      regla: 'por ocupación', asiento: r.entryNumber,
    })),
  ]

  const years = [...new Set(lineas.map(l => l.fecha?.slice(0, 4)).filter(Boolean))].sort((a, b) => b!.localeCompare(a!))

  const filtered = lineas
    .filter(l => !filterApt || l.apartmentId === filterApt)
    .filter(l => !filterYear || l.fecha?.startsWith(filterYear))
    .filter(l => !filterType || l.tipo === filterType)
    .sort((a, b) => (b.fecha || '').localeCompare(a.fecha || ''))

  const totalFiltered = filtered.reduce((s, l) => s + l.importe, 0)
  const totalDeducible = redondea(filtered.reduce((s, l) => s + l.deducible, 0))

  function getAptName(id: string) { return apartments.find(a => a.id === id)?.name || id }
  function handleDelete(id: string) {
    if (!confirm('¿Eliminar este gasto?')) return
    deleteExpense(id)
  }

  const byApt = apartments.map(a => ({
    apt: a,
    total: filtered.filter(l => l.apartmentId === a.id).reduce((s, l) => s + l.importe, 0)
  })).filter(x => x.total > 0)

  return (
    <div className="p-6">
      <PageHeader
        title="Gastos"
        subtitle={`${filtered.length} registros · Total: ${totalFiltered.toLocaleString('es-ES')} € · Deducible: ${totalDeducible.toLocaleString('es-ES')} €`}
        actions={
          <div className="flex gap-2">
            <button onClick={() => setShowImport(true)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-200 text-slate-700 rounded-lg text-sm font-medium hover:border-blue-300 hover:text-blue-700">
              <Upload size={16} /> Importar Excel
            </button>
            <button onClick={() => { setEditing(null); setShowForm(true) }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
              <Plus size={16} /> Nuevo gasto
            </button>
          </div>
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
        <select value={filterType} onChange={e => setFilterType(e.target.value as FiltroTipo)}
          className="border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white">
          <option value="">Todos los conceptos</option>
          {(Object.keys(EXPENSE_TYPE_LABELS) as ExpenseType[]).map(k => (
            <option key={k} value={k}>{EXPENSE_TYPE_LABELS[k]}</option>
          ))}
          <option value="reparaciones">Reparaciones y conservación</option>
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
              <th className="text-right py-3 px-4 font-medium text-slate-600">Deducible</th>
              <th className="text-left py-3 px-4 font-medium text-slate-600">Nº Asiento</th>
              <th className="py-3 px-4"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(l => (
              <tr key={`${l.origen}-${l.id}`} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="py-2.5 px-4 font-medium text-slate-700 text-xs">{getAptName(l.apartmentId)}</td>
                <td className="py-2.5 px-4 text-slate-500 text-xs whitespace-nowrap">{formatDate(l.fecha)}</td>
                <td className="py-2.5 px-4">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    l.origen === 'reparacion' ? 'bg-amber-100 text-amber-800' : 'bg-orange-100 text-orange-700'
                  }`}>
                    {l.origen === 'reparacion' && <Wrench size={10} className="inline mr-1 -mt-0.5" />}
                    {l.etiqueta}
                  </span>
                </td>
                <td className="py-2.5 px-4 text-slate-700">{l.descripcion}</td>
                <td className="py-2.5 px-4 text-slate-500 text-xs">{l.proveedor || '—'}</td>
                <td className="py-2.5 px-4 text-right font-semibold text-orange-700">
                  {l.importe ? `${l.importe.toLocaleString('es-ES')} €` : '—'}
                </td>
                <td className="py-2.5 px-4 text-right text-xs">
                  <span className="font-semibold text-slate-700">
                    {redondea(l.deducible).toLocaleString('es-ES')} €
                  </span>
                  <span className="block text-[10px] text-slate-400">{l.regla}</span>
                </td>
                <td className="py-2.5 px-4 text-slate-400 text-xs">{l.asiento || '—'}</td>
                <td className="py-2.5 px-4">
                  <div className="flex items-center gap-1 justify-end">
                    {l.origen === 'gasto' ? (
                      <>
                        <button onClick={() => { setEditing(l.gasto!); setShowForm(true) }}
                          className="p-1.5 text-slate-300 hover:text-blue-600 rounded"><Pencil size={13} /></button>
                        <button onClick={() => handleDelete(l.id)}
                          className="p-1.5 text-slate-300 hover:text-red-600 rounded"><Trash2 size={13} /></button>
                      </>
                    ) : (
                      <Link to="/reparaciones" title="Se edita en Reparaciones"
                        className="text-[10px] text-slate-400 hover:text-blue-600 whitespace-nowrap">
                        ver en Reparaciones
                      </Link>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={9} className="py-8 text-center text-slate-400 text-sm">No hay gastos registrados</td></tr>
            )}
          </tbody>
          {filtered.length > 0 && (
            <tfoot className="border-t-2 border-slate-200 bg-slate-50">
              <tr>
                <td colSpan={5} className="py-3 px-4 text-sm font-semibold text-slate-700">TOTAL</td>
                <td className="py-3 px-4 text-right font-bold text-orange-700">{totalFiltered.toLocaleString('es-ES')} €</td>
                <td className="py-3 px-4 text-right font-bold text-slate-700">{totalDeducible.toLocaleString('es-ES')} €</td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {showImport && <ImportarExcel onClose={() => setShowImport(false)} />}

      {showForm && (
        <ExpenseForm
          key={editing?.id || 'new'}
          apartments={apartments}
          editing={editing}
          onClose={() => setShowForm(false)}
        />
      )}
    </div>
  )
}

function ExpenseForm({ apartments, editing, onClose }:
  { apartments: Apartment[]; editing: Expense | null; onClose: () => void }) {
  const { addExpense, updateExpense } = useData()
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
    if (editing) updateExpense(editing.id, data)
    else addExpense(data)
    onClose()
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
