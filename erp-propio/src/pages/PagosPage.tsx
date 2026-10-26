import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Banknote } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DataTable, type Column } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { FormField, TextInput, SelectInput } from '../components/FormField'

const TIENDA = '01'

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

interface Pago {
  tienda_terminal_codigo: string
  codigo_pago: number
  concepto: string | null
  receptor_nombre: string | null
  importe_pagado: number | null
  tipo_pago: string | null
  fecha: string
}

interface Proveedor {
  codigo: string
  nombre: string
}

export function PagosPage() {
  const [rows, setRows] = useState<Pago[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [concepto, setConcepto] = useState('')
  const [proveedorCodigo, setProveedorCodigo] = useState('')
  const [receptorNombre, setReceptorNombre] = useState('')
  const [importe, setImporte] = useState('')
  const [tipoPago, setTipoPago] = useState('efectivo')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [{ data }, { data: prov }] = await Promise.all([
      supabase
        .from('pago_proveedor')
        .select('tienda_terminal_codigo, codigo_pago, concepto, receptor_nombre, importe_pagado, tipo_pago, fecha')
        .order('fecha', { ascending: false })
        .limit(50),
      supabase.from('proveedor').select('codigo, nombre').order('nombre'),
    ])
    setRows(data ?? [])
    setProveedores(prov ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const { data: codigoPago, error: numeroError } = await supabase.rpc('fn_siguiente_numero', {
      p_tienda: TIENDA,
      p_tipo_documento: 'pago_proveedor',
      p_serie: '',
    })
    if (numeroError) {
      setSaving(false)
      setError(numeroError.message)
      return
    }

    const proveedorElegido = proveedores.find((p) => p.codigo === proveedorCodigo)

    const { error: insertError } = await supabase.from('pago_proveedor').insert({
      tienda_terminal_codigo: TIENDA,
      codigo_pago: codigoPago,
      receptor_codigo: proveedorCodigo || null,
      receptor_nombre: proveedorElegido?.nombre ?? receptorNombre,
      concepto,
      importe_pagado: Number(importe) || 0,
      estado_pago: 'pagado',
      fecha: hoy(),
      fecha_pago: hoy(),
      tipo_pago: tipoPago,
    })
    if (insertError) {
      setSaving(false)
      setError(insertError.message)
      return
    }

    const { data: numeroMov } = await supabase.rpc('fn_siguiente_numero', {
      p_tienda: TIENDA,
      p_tipo_documento: 'caja',
      p_serie: '',
    })
    if (numeroMov) {
      await supabase.from('movimiento_caja').insert({
        tienda_terminal_codigo: TIENDA,
        numero: numeroMov,
        fecha: hoy(),
        es_ingreso: false,
        gasto: Number(importe) || 0,
        concepto,
        documento: 'pago_proveedor',
        ajeno_tienda_codigo: TIENDA,
        ajeno_codigo: codigoPago,
      })
    }

    setSaving(false)
    setOpen(false)
    setConcepto('')
    setProveedorCodigo('')
    setReceptorNombre('')
    setImporte('')
    setTipoPago('efectivo')
    load()
  }

  const columns: Column<Pago>[] = [
    { header: 'Nº', cell: (r) => <span className="font-mono text-xs">{r.tienda_terminal_codigo}-{r.codigo_pago}</span> },
    { header: 'Concepto', cell: (r) => r.concepto ?? '—' },
    { header: 'Beneficiario', cell: (r) => r.receptor_nombre ?? '—' },
    { header: 'Importe', cell: (r) => (r.importe_pagado != null ? `${r.importe_pagado.toFixed(2)} €` : '—') },
    {
      header: 'Forma de pago',
      cell: (r) => <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{r.tipo_pago ?? '—'}</span>,
    },
    { header: 'Fecha', cell: (r) => new Date(r.fecha).toLocaleDateString('es-ES') },
  ]

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pagos y gastos</h1>
          <p className="mt-1 text-sm text-slate-400">Pagos a proveedor o gastos de caja, numerados de forma atómica.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={16} /> Nuevo pago
        </button>
      </div>

      <div className="mt-4">
        <DataTable columns={columns} rows={rows} rowKey={(r) => `${r.tienda_terminal_codigo}-${r.codigo_pago}`} loading={loading} emptyMessage="Sin pagos registrados todavía." />
      </div>

      {open && (
        <Modal title="Nuevo pago" onClose={() => setOpen(false)}>
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <FormField label="Concepto *">
              <TextInput required value={concepto} onChange={(e) => setConcepto(e.target.value)} placeholder="Factura de luz, compra de material…" />
            </FormField>
            <FormField label="Proveedor (opcional)">
              <SelectInput value={proveedorCodigo} onChange={(e) => setProveedorCodigo(e.target.value)}>
                <option value="">— Sin proveedor (gasto general) —</option>
                {proveedores.map((p) => (
                  <option key={p.codigo} value={p.codigo}>
                    {p.nombre}
                  </option>
                ))}
              </SelectInput>
            </FormField>
            {!proveedorCodigo && (
              <FormField label="Beneficiario *">
                <TextInput required value={receptorNombre} onChange={(e) => setReceptorNombre(e.target.value)} />
              </FormField>
            )}
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Importe (€) *">
                <TextInput required type="number" step="0.01" value={importe} onChange={(e) => setImporte(e.target.value)} />
              </FormField>
              <FormField label="Forma de pago *">
                <SelectInput required value={tipoPago} onChange={(e) => setTipoPago(e.target.value)}>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta</option>
                  <option value="transferencia">Transferencia</option>
                </SelectInput>
              </FormField>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={saving} className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              <Banknote size={16} /> {saving ? 'Guardando…' : 'Registrar pago'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
