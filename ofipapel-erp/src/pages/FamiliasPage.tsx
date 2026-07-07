import { useMemo, useState } from 'react'
import { Boxes, Plus, Trash2, RefreshCw } from 'lucide-react'
import { useCollection } from '../lib/DatabaseContext'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import FormField, { inputClass } from '../components/FormField'
import { tarifasFor } from '../lib/seed'
import type { Category } from '../types'

const emptyForm = { nombre: '', margenMinorista: '80', margenMayorista: '30' }

export default function FamiliasPage() {
  const { items: categories, add, update, remove } = useCollection('categories')
  const { items: products, update: updateProduct } = useCollection('products')
  const [selected, setSelected] = useState<Category | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [recalculada, setRecalculada] = useState<string | null>(null)

  const productCountById = useMemo(() => {
    const map = new Map<string, number>()
    products.forEach((p) => map.set(p.categoriaId, (map.get(p.categoriaId) ?? 0) + 1))
    return map
  }, [products])

  function openEdit(c: Category) {
    setSelected(c)
    setForm({ nombre: c.nombre, margenMinorista: String(c.margenMinorista), margenMayorista: String(c.margenMayorista) })
    setRecalculada(null)
  }

  function openCreate() {
    setForm(emptyForm)
    setCreating(true)
  }

  function closeModal() {
    setSelected(null)
    setCreating(false)
    setRecalculada(null)
  }

  function save() {
    const payload = {
      nombre: form.nombre,
      margenMinorista: Number(form.margenMinorista) || 0,
      margenMayorista: Number(form.margenMayorista) || 0,
    }
    if (selected) {
      update(selected.id, payload)
    } else {
      add({ id: `cat-${Date.now()}`, ...payload })
    }
    closeModal()
  }

  function handleDelete() {
    if (!selected) return
    if ((productCountById.get(selected.id) ?? 0) > 0) return
    remove(selected.id)
    closeModal()
  }

  function recalcularPrecios() {
    if (!selected) return
    const margenMinorista = Number(form.margenMinorista) || 0
    const margenMayorista = Number(form.margenMayorista) || 0
    products
      .filter((p) => p.categoriaId === selected.id)
      .forEach((p) => {
        const pvp = Number((p.coste * (1 + margenMinorista / 100)).toFixed(2))
        const tarifaMayorista = Number((p.coste * (1 + margenMayorista / 100)).toFixed(2))
        updateProduct(p.id, { pvp, tarifas: tarifasFor(tarifaMayorista) })
      })
    setRecalculada(`Precios recalculados en ${productCountById.get(selected.id) ?? 0} productos.`)
  }

  const modalOpen = selected !== null || creating
  const puedeEliminar = selected ? (productCountById.get(selected.id) ?? 0) === 0 : false

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
            <Boxes size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Familias y tarifas</h1>
        </div>
        <Badge label="Activo (Fase 2)" />
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">
        Familias de productos, margen de beneficio por familia y recálculo masivo de precios (PVP y tarifas)
      </p>

      <div className="flex justify-end mb-4">
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800"
        >
          <Plus size={15} /> Nueva familia
        </button>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="text-left px-4 py-2.5">Familia</th>
              <th className="text-right px-4 py-2.5">Productos</th>
              <th className="text-right px-4 py-2.5">Margen minorista</th>
              <th className="text-right px-4 py-2.5">Margen mayorista</th>
            </tr>
          </thead>
          <tbody>
            {categories.map((c) => (
              <tr key={c.id} onClick={() => openEdit(c)} className="border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50">
                <td className="px-4 py-2.5 text-slate-800 font-medium">{c.nombre}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">{(productCountById.get(c.id) ?? 0).toLocaleString('es-ES')}</td>
                <td className="px-4 py-2.5 text-right text-slate-600">+{c.margenMinorista}%</td>
                <td className="px-4 py-2.5 text-right text-slate-600">+{c.margenMayorista}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {modalOpen && (
        <Modal
          title={selected ? `Editar familia · ${selected.nombre}` : 'Nueva familia'}
          subtitle={selected ? `${productCountById.get(selected.id) ?? 0} productos asignados` : undefined}
          onClose={closeModal}
          footer={
            <>
              {selected && (
                <button
                  onClick={handleDelete}
                  disabled={!puedeEliminar}
                  title={puedeEliminar ? undefined : 'No se puede eliminar una familia con productos asignados'}
                  className="mr-auto flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg disabled:opacity-30 disabled:hover:bg-transparent"
                >
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
          <FormField label="Nombre de la familia">
            <input className={inputClass} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
          </FormField>
          <div className="grid grid-cols-2 gap-x-4">
            <FormField label="Margen minorista (% sobre coste)">
              <input
                type="number"
                step="1"
                className={inputClass}
                value={form.margenMinorista}
                onChange={(e) => setForm({ ...form, margenMinorista: e.target.value })}
              />
            </FormField>
            <FormField label="Margen mayorista (% sobre coste)">
              <input
                type="number"
                step="1"
                className={inputClass}
                value={form.margenMayorista}
                onChange={(e) => setForm({ ...form, margenMayorista: e.target.value })}
              />
            </FormField>
          </div>

          {selected && (
            <div className="mt-2 pt-4 border-t border-slate-100">
              <p className="text-xs text-slate-500 mb-2">
                Aplica el margen configurado arriba al coste de cada producto de la familia, recalculando su PVP y sus 4 tarifas.
              </p>
              <button
                onClick={recalcularPrecios}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <RefreshCw size={14} /> Recalcular precios de la familia
              </button>
              {recalculada && <p className="text-xs text-emerald-600 mt-2">{recalculada}</p>}
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
