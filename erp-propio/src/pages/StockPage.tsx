import { useEffect, useState, type FormEvent } from 'react'
import { Plus } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DataTable, type Column } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { FormField, TextInput, SelectInput } from '../components/FormField'

interface StockRow {
  articulo_codigo: string
  almacen_codigo: string
  cantidad_actual: number
  cantidad_reservada: number
  cantidad_disponible: number
  articulo: { descripcion: string } | null
  almacen: { nombre: string } | null
}

interface Almacen {
  codigo: string
  nombre: string
}

const emptyForm = {
  articulo_codigo: '',
  almacen_codigo: '',
  tipo_movimiento: 'regularizacion',
  sentido: '1',
  cantidad: '',
  observaciones: '',
}

export function StockPage() {
  const [rows, setRows] = useState<StockRow[]>([])
  const [almacenes, setAlmacenes] = useState<Almacen[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [{ data }, { data: alm }] = await Promise.all([
      supabase
        .from('articulo_almacen_stock')
        .select('articulo_codigo, almacen_codigo, cantidad_actual, cantidad_reservada, cantidad_disponible, articulo:articulo_codigo(descripcion), almacen:almacen_codigo(nombre)')
        .order('actualizado_en', { ascending: false })
        .limit(200),
      supabase.from('almacen').select('codigo, nombre').order('codigo'),
    ])
    setRows((data as unknown as StockRow[]) ?? [])
    setAlmacenes(alm ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    const { error } = await supabase.from('movimiento_stock').insert({
      tipo_movimiento: form.tipo_movimiento,
      sentido: Number(form.sentido),
      almacen_codigo: form.almacen_codigo,
      articulo_codigo: form.articulo_codigo,
      cantidad: Number(form.cantidad),
      documento_origen_tipo: 'manual_pantalla_stock',
      observaciones: form.observaciones || null,
    })
    setSaving(false)
    if (error) {
      setError(error.message)
      return
    }
    setOpen(false)
    setForm(emptyForm)
    load()
  }

  const columns: Column<StockRow>[] = [
    { header: 'Artículo', cell: (r) => <span className="font-mono text-xs">{r.articulo_codigo}</span> },
    { header: 'Descripción', cell: (r) => r.articulo?.descripcion ?? '—' },
    { header: 'Almacén', cell: (r) => r.almacen?.nombre ?? r.almacen_codigo },
    { header: 'Actual', cell: (r) => r.cantidad_actual },
    { header: 'Reservado', cell: (r) => r.cantidad_reservada },
    { header: 'Disponible', cell: (r) => <strong>{r.cantidad_disponible}</strong> },
  ]

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Stock</h1>
          <p className="mt-1 text-sm text-slate-400">
            Fase 2 — saldo mantenido automáticamente por el trigger de <code>movimiento_stock</code>, nunca editado a mano.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={16} /> Nuevo movimiento
        </button>
      </div>

      <div className="mt-4">
        <DataTable columns={columns} rows={rows} rowKey={(r) => `${r.articulo_codigo}-${r.almacen_codigo}`} loading={loading} emptyMessage="Sin stock registrado todavía." />
      </div>

      {open && (
        <Modal title="Nuevo movimiento de stock" onClose={() => setOpen(false)}>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <FormField label="Código de artículo *">
              <TextInput required value={form.articulo_codigo} onChange={(e) => setForm({ ...form, articulo_codigo: e.target.value })} />
            </FormField>
            <FormField label="Almacén *">
              <SelectInput required value={form.almacen_codigo} onChange={(e) => setForm({ ...form, almacen_codigo: e.target.value })}>
                <option value="">— Elige —</option>
                {almacenes.map((a) => (
                  <option key={a.codigo} value={a.codigo}>
                    {a.codigo} — {a.nombre}
                  </option>
                ))}
              </SelectInput>
            </FormField>
            <FormField label="Tipo de movimiento">
              <SelectInput value={form.tipo_movimiento} onChange={(e) => setForm({ ...form, tipo_movimiento: e.target.value })}>
                <option value="regularizacion">Regularización</option>
                <option value="compra">Compra</option>
                <option value="venta">Venta</option>
                <option value="traspaso">Traspaso</option>
                <option value="inventario">Inventario</option>
                <option value="devolucion_cliente">Devolución de cliente</option>
                <option value="devolucion_proveedor">Devolución a proveedor</option>
              </SelectInput>
            </FormField>
            <FormField label="Sentido">
              <SelectInput value={form.sentido} onChange={(e) => setForm({ ...form, sentido: e.target.value })}>
                <option value="1">Entrada (+)</option>
                <option value="-1">Salida (-)</option>
              </SelectInput>
            </FormField>
            <FormField label="Cantidad *">
              <TextInput required type="number" step="0.001" min="0.001" value={form.cantidad} onChange={(e) => setForm({ ...form, cantidad: e.target.value })} />
            </FormField>
            <FormField label="Observaciones">
              <TextInput value={form.observaciones} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
            </FormField>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={saving} className="mt-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Guardando…' : 'Registrar movimiento'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
