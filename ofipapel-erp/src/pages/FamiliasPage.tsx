import { useMemo, useState } from 'react'
import { Boxes, Plus, Trash2, RefreshCw, X } from 'lucide-react'
import { useCollection } from '../lib/DatabaseContext'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import FormField, { inputClass } from '../components/FormField'
import { priceForMargin } from '../lib/pricing'
import { TARIFA_IDS } from '../types'
import type { Category, TarifaId } from '../types'

const emptyMargenes: Record<TarifaId, string> = { 'Tarifa 1': '45', 'Tarifa 2': '35', 'Tarifa 3': '28', 'Tarifa 6 (Mayor)': '20' }
const emptyForm = { numero: '1', nombre: '', margenMinorista: '80', margenes: emptyMargenes }

export default function FamiliasPage() {
  const { items: categories, add, update, remove } = useCollection('categories')
  const { items: subfamilias, add: addSubfamilia, update: updateSubfamilia, remove: removeSubfamilia } = useCollection('subfamilias')
  const { items: products, update: updateProduct } = useCollection('products')
  const [selected, setSelected] = useState<Category | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [recalculada, setRecalculada] = useState<string | null>(null)
  const [nuevaSubfamilia, setNuevaSubfamilia] = useState('')

  const subfamiliaById = useMemo(() => new Map(subfamilias.map((s) => [s.id, s])), [subfamilias])

  const productCountBySubfamilia = useMemo(() => {
    const map = new Map<string, number>()
    products.forEach((p) => map.set(p.subfamiliaId, (map.get(p.subfamiliaId) ?? 0) + 1))
    return map
  }, [products])

  const subfamiliaCountByFamilia = useMemo(() => {
    const map = new Map<string, number>()
    subfamilias.forEach((s) => map.set(s.familiaId, (map.get(s.familiaId) ?? 0) + 1))
    return map
  }, [subfamilias])

  const productCountByFamilia = useMemo(() => {
    const map = new Map<string, number>()
    products.forEach((p) => {
      const familiaId = subfamiliaById.get(p.subfamiliaId)?.familiaId
      if (!familiaId) return
      map.set(familiaId, (map.get(familiaId) ?? 0) + 1)
    })
    return map
  }, [products, subfamiliaById])

  function openEdit(c: Category) {
    setSelected(c)
    setForm({
      numero: String(c.numero),
      nombre: c.nombre,
      margenMinorista: String(c.margenMinorista),
      margenes: Object.fromEntries(TARIFA_IDS.map((t) => [t, String(c.margenes[t])])) as Record<TarifaId, string>,
    })
    setRecalculada(null)
    setNuevaSubfamilia('')
  }

  function openCreate() {
    const siguienteNumero = categories.length > 0 ? Math.max(...categories.map((c) => c.numero)) + 1 : 1
    setForm({ ...emptyForm, numero: String(siguienteNumero) })
    setCreating(true)
  }

  function closeModal() {
    setSelected(null)
    setCreating(false)
    setRecalculada(null)
    setNuevaSubfamilia('')
  }

  function save() {
    const payload = {
      numero: Number(form.numero) || 0,
      nombre: form.nombre,
      margenMinorista: Number(form.margenMinorista) || 0,
      margenes: Object.fromEntries(TARIFA_IDS.map((t) => [t, Number(form.margenes[t]) || 0])) as Record<TarifaId, number>,
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
    if ((productCountByFamilia.get(selected.id) ?? 0) > 0) return
    // Se eliminan también las subfamilias vacías que dependían de esta familia.
    subfamilias.filter((s) => s.familiaId === selected.id).forEach((s) => removeSubfamilia(s.id))
    remove(selected.id)
    closeModal()
  }

  function recalcularPrecios() {
    if (!selected) return
    const margenMinorista = Number(form.margenMinorista) || 0
    const margenes = form.margenes
    const subfamiliaIds = new Set(subfamilias.filter((s) => s.familiaId === selected.id).map((s) => s.id))
    let afectados = 0
    products
      .filter((p) => subfamiliaIds.has(p.subfamiliaId))
      .forEach((p) => {
        const pvp = priceForMargin(p.coste, margenMinorista)
        const tarifas = {} as Record<TarifaId, number>
        TARIFA_IDS.forEach((t) => {
          tarifas[t] = priceForMargin(p.coste, Number(margenes[t]) || 0)
        })
        updateProduct(p.id, { pvp, tarifas })
        afectados += 1
      })
    setRecalculada(`Precios recalculados en ${afectados} productos.`)
  }

  function agregarSubfamilia() {
    if (!selected || !nuevaSubfamilia.trim()) return
    const siguienteNumero = (subfamiliaCountByFamilia.get(selected.id) ?? 0) + 1
    addSubfamilia({ id: `sub-${Date.now()}`, familiaId: selected.id, numero: siguienteNumero, nombre: nuevaSubfamilia.trim() })
    setNuevaSubfamilia('')
  }

  function eliminarSubfamilia(id: string) {
    if ((productCountBySubfamilia.get(id) ?? 0) > 0) return
    removeSubfamilia(id)
  }

  const modalOpen = selected !== null || creating
  const puedeEliminarFamilia = selected ? (productCountByFamilia.get(selected.id) ?? 0) === 0 : false
  const subfamiliasDeFamilia = selected ? subfamilias.filter((s) => s.familiaId === selected.id) : []

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
        Familias numeradas con sus subfamilias, margen de beneficio por cada tarifa y recálculo masivo de precios
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
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
                <th className="text-left px-4 py-2.5">Nº</th>
                <th className="text-left px-4 py-2.5">Familia</th>
                <th className="text-right px-4 py-2.5">Subfamilias</th>
                <th className="text-right px-4 py-2.5">Productos</th>
                <th className="text-right px-4 py-2.5">Minorista</th>
                <th className="text-right px-4 py-2.5">Tarifa 1</th>
                <th className="text-right px-4 py-2.5">Tarifa 2</th>
                <th className="text-right px-4 py-2.5">Tarifa 3</th>
                <th className="text-right px-4 py-2.5">Tarifa 6 (Mayor)</th>
              </tr>
            </thead>
            <tbody>
              {[...categories]
                .sort((a, b) => a.numero - b.numero)
                .map((c) => (
                  <tr key={c.id} onClick={() => openEdit(c)} className="border-b border-slate-100 last:border-0 cursor-pointer hover:bg-slate-50">
                    <td className="px-4 py-2.5 text-slate-500 font-mono">{String(c.numero).padStart(2, '0')}</td>
                    <td className="px-4 py-2.5 text-slate-800 font-medium">{c.nombre}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{subfamiliaCountByFamilia.get(c.id) ?? 0}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">{(productCountByFamilia.get(c.id) ?? 0).toLocaleString('es-ES')}</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">+{c.margenMinorista}%</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">+{c.margenes['Tarifa 1']}%</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">+{c.margenes['Tarifa 2']}%</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">+{c.margenes['Tarifa 3']}%</td>
                    <td className="px-4 py-2.5 text-right text-slate-600">+{c.margenes['Tarifa 6 (Mayor)']}%</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {modalOpen && (
        <Modal
          title={selected ? `Editar familia ${String(selected.numero).padStart(2, '0')} · ${selected.nombre}` : 'Nueva familia'}
          subtitle={selected ? `${productCountByFamilia.get(selected.id) ?? 0} productos en ${subfamiliasDeFamilia.length} subfamilias` : undefined}
          wide
          onClose={closeModal}
          footer={
            <>
              {selected && (
                <button
                  onClick={handleDelete}
                  disabled={!puedeEliminarFamilia}
                  title={puedeEliminarFamilia ? undefined : 'No se puede eliminar una familia con productos asignados'}
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
          <div className="grid grid-cols-3 gap-x-4">
            <FormField label="Número de familia">
              <input type="number" className={inputClass} value={form.numero} onChange={(e) => setForm({ ...form, numero: e.target.value })} />
            </FormField>
            <FormField label="Nombre de la familia">
              <input className={`${inputClass} col-span-2`} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </FormField>
          </div>

          <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 mt-2">Tarifas de beneficio (% sobre coste)</div>
          <div className="grid grid-cols-5 gap-x-3">
            <FormField label="Minorista (PVP)">
              <input
                type="number"
                className={inputClass}
                value={form.margenMinorista}
                onChange={(e) => setForm({ ...form, margenMinorista: e.target.value })}
              />
            </FormField>
            {TARIFA_IDS.map((t) => (
              <FormField key={t} label={t}>
                <input
                  type="number"
                  className={inputClass}
                  value={form.margenes[t]}
                  onChange={(e) => setForm((f) => ({ ...f, margenes: { ...f.margenes, [t]: e.target.value } }))}
                />
              </FormField>
            ))}
          </div>

          {selected && (
            <div className="mb-4">
              <button
                onClick={recalcularPrecios}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-slate-700 border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                <RefreshCw size={14} /> Recalcular precios de todos los productos de la familia
              </button>
              {recalculada && <p className="text-xs text-emerald-600 mt-2">{recalculada}</p>}
            </div>
          )}

          {selected && (
            <div className="pt-4 border-t border-slate-100">
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Subfamilias</div>
              <div className="border border-slate-200 rounded-lg overflow-hidden mb-3">
                {subfamiliasDeFamilia.map((s) => (
                  <div key={s.id} className="flex items-center gap-2 px-3 py-2 border-b border-slate-100 last:border-0">
                    <span className="text-xs text-slate-400 font-mono w-6">{s.numero}</span>
                    <input
                      className="flex-1 text-sm border-none focus:outline-none focus:ring-1 focus:ring-slate-300 rounded px-1.5 py-0.5"
                      value={s.nombre}
                      onChange={(e) => updateSubfamilia(s.id, { nombre: e.target.value })}
                    />
                    <span className="text-xs text-slate-400">{productCountBySubfamilia.get(s.id) ?? 0} productos</span>
                    <button
                      onClick={() => eliminarSubfamilia(s.id)}
                      disabled={(productCountBySubfamilia.get(s.id) ?? 0) > 0}
                      title={(productCountBySubfamilia.get(s.id) ?? 0) > 0 ? 'No se puede eliminar una subfamilia con productos asignados' : undefined}
                      className="p-1 text-slate-400 hover:text-red-600 disabled:opacity-20 disabled:hover:text-slate-400"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                {subfamiliasDeFamilia.length === 0 && <div className="px-3 py-4 text-center text-slate-400 text-sm">Sin subfamilias todavía.</div>}
              </div>
              <div className="flex items-center gap-2">
                <input
                  className={inputClass}
                  placeholder="Nombre de la nueva subfamilia"
                  value={nuevaSubfamilia}
                  onChange={(e) => setNuevaSubfamilia(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && agregarSubfamilia()}
                />
                <button
                  onClick={agregarSubfamilia}
                  disabled={!nuevaSubfamilia.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-40 shrink-0"
                >
                  <Plus size={14} /> Añadir
                </button>
              </div>
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
