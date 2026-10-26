import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DataTable, type Column } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { FormField, TextInput, SelectInput } from '../components/FormField'

const TIENDA = '01'

interface Pedido {
  tienda_terminal_codigo: string
  numero: number
  anulado: boolean
  entregado: boolean
  total: number | null
  fecha: string
  cliente: { nombre: string } | null
}

interface Cliente {
  codigo: string
  nombre: string
}

interface Almacen {
  codigo: string
  nombre: string
}

interface LineaForm {
  articulo_codigo: string
  cantidad: string
  precio: string
}

export function PedidosPage() {
  const [rows, setRows] = useState<Pedido[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [almacenes, setAlmacenes] = useState<Almacen[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [clienteCodigo, setClienteCodigo] = useState('')
  const [almacenCodigo, setAlmacenCodigo] = useState('')
  const [lineas, setLineas] = useState<LineaForm[]>([{ articulo_codigo: '', cantidad: '', precio: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [{ data }, { data: cli }, { data: alm }] = await Promise.all([
      supabase
        .from('pedido_cliente')
        .select('tienda_terminal_codigo, numero, anulado, entregado, total, fecha, cliente:cliente_codigo(nombre)')
        .order('fecha', { ascending: false })
        .limit(100),
      supabase.from('cliente').select('codigo, nombre').order('nombre'),
      supabase.from('almacen').select('codigo, nombre').order('codigo'),
    ])
    setRows((data as unknown as Pedido[]) ?? [])
    setClientes(cli ?? [])
    setAlmacenes(alm ?? [])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  function updateLinea(i: number, patch: Partial<LineaForm>) {
    setLineas((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const { data: numero, error: numeroError } = await supabase.rpc('fn_siguiente_numero', {
      p_tienda: TIENDA,
      p_tipo_documento: 'pedido_cliente',
      p_serie: '',
    })
    if (numeroError) {
      setSaving(false)
      setError(numeroError.message)
      return
    }

    const { error: cabeceraError } = await supabase.from('pedido_cliente').insert({
      tienda_terminal_codigo: TIENDA,
      numero,
      cliente_codigo: clienteCodigo,
      almacen_codigo: almacenCodigo,
    })
    if (cabeceraError) {
      setSaving(false)
      setError(cabeceraError.message)
      return
    }

    const lineasValidas = lineas.filter((l) => l.articulo_codigo && l.cantidad)
    if (lineasValidas.length > 0) {
      const { error: lineasError } = await supabase.from('pedido_cliente_linea').insert(
        lineasValidas.map((l, i) => ({
          tienda_terminal_codigo: TIENDA,
          numero,
          numero_linea: i + 1,
          articulo_codigo: l.articulo_codigo,
          cantidad: Number(l.cantidad),
          precio: l.precio ? Number(l.precio) : null,
        })),
      )
      if (lineasError) {
        setSaving(false)
        setError(lineasError.message)
        return
      }
    }

    setSaving(false)
    setOpen(false)
    setClienteCodigo('')
    setAlmacenCodigo('')
    setLineas([{ articulo_codigo: '', cantidad: '', precio: '' }])
    load()
  }

  const columns: Column<Pedido>[] = [
    { header: 'Número', cell: (r) => <span className="font-mono text-xs">{r.tienda_terminal_codigo}-{r.numero}</span> },
    { header: 'Cliente', cell: (r) => r.cliente?.nombre ?? '—' },
    {
      header: 'Estado',
      cell: (r) =>
        r.anulado ? (
          <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">Anulado</span>
        ) : r.entregado ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Entregado</span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Pendiente</span>
        ),
    },
    { header: 'Total', cell: (r) => (r.total != null ? `${r.total.toFixed(2)} €` : '—') },
    { header: 'Fecha', cell: (r) => new Date(r.fecha).toLocaleDateString('es-ES') },
  ]

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Pedidos de clientes</h1>
          <p className="mt-1 text-sm text-slate-400">Fase 4 — pedidos reales, numerados de forma atómica.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={16} /> Nuevo pedido
        </button>
      </div>

      <div className="mt-4">
        <DataTable columns={columns} rows={rows} rowKey={(r) => `${r.tienda_terminal_codigo}-${r.numero}`} loading={loading} emptyMessage="Sin pedidos de clientes todavía." />
      </div>

      {open && (
        <Modal title="Nuevo pedido de cliente" onClose={() => setOpen(false)} widthClass="max-w-2xl">
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Cliente *">
                <SelectInput required value={clienteCodigo} onChange={(e) => setClienteCodigo(e.target.value)}>
                  <option value="">— Elige —</option>
                  {clientes.map((c) => (
                    <option key={c.codigo} value={c.codigo}>
                      {c.nombre}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="Almacén *">
                <SelectInput required value={almacenCodigo} onChange={(e) => setAlmacenCodigo(e.target.value)}>
                  <option value="">— Elige —</option>
                  {almacenes.map((a) => (
                    <option key={a.codigo} value={a.codigo}>
                      {a.nombre}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Líneas</span>
                <button
                  type="button"
                  onClick={() => setLineas((ls) => [...ls, { articulo_codigo: '', cantidad: '', precio: '' }])}
                  className="text-xs font-medium text-indigo-600 hover:underline"
                >
                  + añadir línea
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {lineas.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <TextInput
                      placeholder="Código artículo"
                      value={l.articulo_codigo}
                      onChange={(e) => updateLinea(i, { articulo_codigo: e.target.value })}
                      className="flex-1"
                    />
                    <TextInput
                      type="number"
                      step="0.001"
                      placeholder="Cantidad"
                      value={l.cantidad}
                      onChange={(e) => updateLinea(i, { cantidad: e.target.value })}
                      className="w-28"
                    />
                    <TextInput
                      type="number"
                      step="0.01"
                      placeholder="Precio"
                      value={l.precio}
                      onChange={(e) => updateLinea(i, { precio: e.target.value })}
                      className="w-28"
                    />
                    {lineas.length > 1 && (
                      <button type="button" onClick={() => setLineas((ls) => ls.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-600">
                        <Trash2 size={16} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}
            <button type="submit" disabled={saving} className="mt-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {saving ? 'Guardando…' : 'Crear pedido'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
