import { useMemo, useState } from 'react'
import { Users, Plus, Trash2 } from 'lucide-react'
import { useDatabase, useCollection } from '../lib/DatabaseContext'
import DataTable, { type Column } from '../components/DataTable'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import FormField, { inputClass } from '../components/FormField'
import { formatEUR, formatDate } from '../lib/format'
import type { Client, ClienteTipo } from '../types'

const emptyForm = {
  nombre: '',
  tipo: 'Mayorista' as ClienteTipo,
  tarifa: 'Tarifa B',
  comercialId: '',
  cif: '',
  telefono: '',
  email: '',
  direccion: '',
}

export default function ClientesPage() {
  const { db } = useDatabase()
  const { items: clients, add, update, remove } = useCollection('clients')
  const [tipoFiltro, setTipoFiltro] = useState('')
  const [selected, setSelected] = useState<Client | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)

  const repById = useMemo(() => new Map(db.salesReps.map((r) => [r.id, r])), [db.salesReps])
  const salesByClient = useMemo(() => {
    const map = new Map<string, typeof db.sales>()
    db.sales.forEach((s) => {
      const arr = map.get(s.clienteId) ?? []
      arr.push(s)
      map.set(s.clienteId, arr)
    })
    return map
  }, [db.sales])

  const rows = tipoFiltro ? clients.filter((c) => c.tipo === tipoFiltro) : clients

  const columns: Column<Client>[] = [
    { key: 'nombre', label: 'Cliente', sortValue: (c) => c.nombre },
    { key: 'tipo', label: 'Tipo', render: (c) => <Badge label={c.tipo} />, sortValue: (c) => c.tipo },
    { key: 'tarifa', label: 'Tarifa', sortValue: (c) => c.tarifa },
    { key: 'comercial', label: 'Comercial', render: (c) => repById.get(c.comercialId)?.nombre ?? '—', sortValue: (c) => repById.get(c.comercialId)?.nombre ?? '' },
    { key: 'zona', label: 'Zona', sortValue: (c) => c.zona },
    { key: 'saldo', label: 'Saldo pendiente', align: 'right', render: (c) => formatEUR(c.saldoPendiente), sortValue: (c) => c.saldoPendiente },
    { key: 'ultimo', label: 'Últ. pedido', render: (c) => formatDate(c.ultimoPedido), sortValue: (c) => c.ultimoPedido },
  ]

  function openEdit(c: Client) {
    setSelected(c)
    setForm({ nombre: c.nombre, tipo: c.tipo, tarifa: c.tarifa, comercialId: c.comercialId, cif: c.cif, telefono: c.telefono, email: c.email, direccion: c.direccion })
  }

  function openCreate() {
    setForm({ ...emptyForm, comercialId: db.salesReps[0]?.id ?? '' })
    setCreating(true)
  }

  function closeModal() {
    setSelected(null)
    setCreating(false)
  }

  function save() {
    const rep = repById.get(form.comercialId)
    const payload = {
      nombre: form.nombre,
      tipo: form.tipo,
      tarifa: form.tipo === 'Minorista' ? 'PVP' : form.tarifa,
      comercialId: form.comercialId,
      zona: rep?.zona ?? '',
      cif: form.cif,
      telefono: form.telefono,
      email: form.email,
      direccion: form.direccion,
    }
    if (selected) {
      update(selected.id, payload)
    } else {
      add({ id: `cli-${Date.now()}`, ...payload, saldoPendiente: 0, ultimoPedido: new Date().toISOString().slice(0, 10) })
    }
    closeModal()
  }

  function handleDelete() {
    if (!selected) return
    remove(selected.id)
    closeModal()
  }

  const modalOpen = selected !== null || creating
  const historial = selected ? (salesByClient.get(selected.id) ?? []).slice(0, 6) : []

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
            <Users size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Clientes</h1>
        </div>
        <Badge label="Activo (Fase 1)" />
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">{clients.length} clientes · Fichas, tarifas y condiciones comerciales</p>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(c) => c.id}
        searchableText={(c) => `${c.nombre} ${c.cif} ${c.zona} ${repById.get(c.comercialId)?.nombre ?? ''}`}
        onRowClick={openEdit}
        pageSize={14}
        filters={
          <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value)} className={`${inputClass} max-w-[180px]`}>
            <option value="">Todos los tipos</option>
            <option value="Mayorista">Mayorista</option>
            <option value="Minorista">Minorista</option>
          </select>
        }
        actions={
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
            <Plus size={15} /> Nuevo cliente
          </button>
        }
      />

      {modalOpen && (
        <Modal
          title={selected ? selected.nombre : 'Nuevo cliente'}
          subtitle={selected ? `${selected.cif} · ${selected.zona}` : undefined}
          wide={Boolean(selected)}
          onClose={closeModal}
          footer={
            <>
              {selected && (
                <button onClick={handleDelete} className="mr-auto flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
                  <Trash2 size={14} /> Eliminar
                </button>
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
          <div className={selected ? 'grid grid-cols-2 gap-x-6' : ''}>
            <div>
              <FormField label="Nombre / Razón social">
                <input className={inputClass} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              </FormField>
              <div className="grid grid-cols-2 gap-x-4">
                <FormField label="Tipo">
                  <select className={inputClass} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as ClienteTipo })}>
                    <option value="Mayorista">Mayorista</option>
                    <option value="Minorista">Minorista</option>
                  </select>
                </FormField>
                <FormField label="Tarifa">
                  <select
                    className={inputClass}
                    value={form.tarifa}
                    disabled={form.tipo === 'Minorista'}
                    onChange={(e) => setForm({ ...form, tarifa: e.target.value })}
                  >
                    <option value="Tarifa A">Tarifa A</option>
                    <option value="Tarifa B">Tarifa B</option>
                    <option value="Tarifa C">Tarifa C</option>
                    <option value="PVP">PVP</option>
                  </select>
                </FormField>
              </div>
              <FormField label="Comercial asignado">
                <select className={inputClass} value={form.comercialId} onChange={(e) => setForm({ ...form, comercialId: e.target.value })}>
                  {db.salesReps.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.nombre} · {r.zona}
                    </option>
                  ))}
                </select>
              </FormField>
              <div className="grid grid-cols-2 gap-x-4">
                <FormField label="CIF / NIF">
                  <input className={inputClass} value={form.cif} onChange={(e) => setForm({ ...form, cif: e.target.value })} />
                </FormField>
                <FormField label="Teléfono">
                  <input className={inputClass} value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
                </FormField>
              </div>
              <FormField label="Email">
                <input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
              </FormField>
              <FormField label="Dirección">
                <input className={inputClass} value={form.direccion} onChange={(e) => setForm({ ...form, direccion: e.target.value })} />
              </FormField>
            </div>
            {selected && (
              <div>
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Historial de pedidos</div>
                <div className="border border-slate-200 rounded-lg overflow-hidden">
                  {historial.length === 0 && <div className="px-3 py-4 text-sm text-slate-400">Sin pedidos registrados.</div>}
                  {historial.map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-3 py-2 border-b border-slate-100 last:border-0 text-sm">
                      <div>
                        <div className="text-slate-700">{s.id}</div>
                        <div className="text-xs text-slate-400">{formatDate(s.fecha)}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-slate-700">{formatEUR(s.total)}</div>
                        <Badge label={s.estado} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </Modal>
      )}
    </div>
  )
}
