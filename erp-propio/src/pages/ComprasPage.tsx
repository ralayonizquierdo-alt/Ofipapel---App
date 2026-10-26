import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Trash2, PackageCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DataTable, type Column } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { FormField, TextInput, SelectInput } from '../components/FormField'

const TIENDA = '01' // única tienda sembrada por ahora — cuando haya selector de tienda real, se sustituye

interface Pedido {
  tienda_terminal_codigo: string
  numero: number
  estado: string
  total: number | null
  almacen_codigo: string | null
  proveedor: { nombre: string } | null
  fecha_hora: string
}

interface Proveedor {
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
  precio_compra: string
}

export function ComprasPage() {
  const [rows, setRows] = useState<Pedido[]>([])
  const [proveedores, setProveedores] = useState<Proveedor[]>([])
  const [almacenes, setAlmacenes] = useState<Almacen[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [proveedorCodigo, setProveedorCodigo] = useState('')
  const [almacenCodigo, setAlmacenCodigo] = useState('')
  const [lineas, setLineas] = useState<LineaForm[]>([{ articulo_codigo: '', cantidad: '', precio_compra: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recepcionando, setRecepcionando] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    const [{ data }, { data: prov }, { data: alm }] = await Promise.all([
      supabase
        .from('pedido_proveedor')
        .select('tienda_terminal_codigo, numero, estado, total, almacen_codigo, fecha_hora, proveedor:proveedor_codigo(nombre)')
        .order('fecha_hora', { ascending: false })
        .limit(100),
      supabase.from('proveedor').select('codigo, nombre').order('nombre'),
      supabase.from('almacen').select('codigo, nombre').order('codigo'),
    ])
    setRows((data as unknown as Pedido[]) ?? [])
    setProveedores(prov ?? [])
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
      p_tipo_documento: 'pedido_proveedor',
      p_serie: '',
    })
    if (numeroError) {
      setSaving(false)
      setError(numeroError.message)
      return
    }

    const { error: cabeceraError } = await supabase.from('pedido_proveedor').insert({
      tienda_terminal_codigo: TIENDA,
      numero,
      proveedor_codigo: proveedorCodigo,
      almacen_codigo: almacenCodigo,
      estado: 'pendiente',
    })
    if (cabeceraError) {
      setSaving(false)
      setError(cabeceraError.message)
      return
    }

    const lineasValidas = lineas.filter((l) => l.articulo_codigo && l.cantidad)
    if (lineasValidas.length > 0) {
      const { error: lineasError } = await supabase.from('pedido_proveedor_linea').insert(
        lineasValidas.map((l, i) => ({
          tienda_terminal_codigo: TIENDA,
          numero,
          linea: i + 1,
          articulo_codigo: l.articulo_codigo,
          cantidad: Number(l.cantidad),
          precio_compra: l.precio_compra ? Number(l.precio_compra) : null,
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
    setProveedorCodigo('')
    setAlmacenCodigo('')
    setLineas([{ articulo_codigo: '', cantidad: '', precio_compra: '' }])
    load()
  }

  async function handleRecepcionar(pedido: Pedido) {
    setRecepcionando(pedido.numero)
    setError(null)

    const { data: lineasPedido, error: lineasError } = await supabase
      .from('pedido_proveedor_linea')
      .select('articulo_codigo, cantidad')
      .eq('tienda_terminal_codigo', pedido.tienda_terminal_codigo)
      .eq('numero', pedido.numero)
    if (lineasError) {
      setRecepcionando(null)
      setError(lineasError.message)
      return
    }

    if (lineasPedido && lineasPedido.length > 0 && pedido.almacen_codigo) {
      const { error: stockError } = await supabase.from('movimiento_stock').insert(
        lineasPedido.map((l, i) => ({
          tipo_movimiento: 'compra',
          sentido: 1,
          almacen_codigo: pedido.almacen_codigo,
          articulo_codigo: l.articulo_codigo,
          cantidad: l.cantidad,
          documento_origen_tipo: 'pedido_proveedor',
          documento_origen_tienda_codigo: pedido.tienda_terminal_codigo,
          documento_origen_numero: pedido.numero,
          documento_origen_linea: i + 1,
          tienda_terminal_codigo: pedido.tienda_terminal_codigo,
        })),
      )
      if (stockError) {
        setRecepcionando(null)
        setError(stockError.message)
        return
      }
    }

    const { error: updateError } = await supabase
      .from('pedido_proveedor')
      .update({
        estado: 'recepcionado',
        recibido: true,
        stock_movido: true,
        fecha_recepcion: new Date().toISOString().slice(0, 10),
      })
      .eq('tienda_terminal_codigo', pedido.tienda_terminal_codigo)
      .eq('numero', pedido.numero)
    if (updateError) {
      setRecepcionando(null)
      setError(updateError.message)
      return
    }

    setRecepcionando(null)
    load()
  }

  const columns: Column<Pedido>[] = [
    { header: 'Número', cell: (r) => <span className="font-mono text-xs">{r.tienda_terminal_codigo}-{r.numero}</span> },
    { header: 'Proveedor', cell: (r) => r.proveedor?.nombre ?? '—' },
    {
      header: 'Estado',
      cell: (r) => <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">{r.estado}</span>,
    },
    { header: 'Total', cell: (r) => (r.total != null ? `${r.total.toFixed(2)} €` : '—') },
    { header: 'Fecha', cell: (r) => new Date(r.fecha_hora).toLocaleString('es-ES') },
    {
      header: '',
      cell: (r) =>
        r.estado === 'recepcionado' || r.estado === 'liquidado' ? null : (
          <button
            type="button"
            onClick={() => handleRecepcionar(r)}
            disabled={recepcionando === r.numero}
            className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
          >
            <PackageCheck size={14} /> {recepcionando === r.numero ? 'Recepcionando…' : 'Recepcionar'}
          </button>
        ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Compras</h1>
          <p className="mt-1 text-sm text-slate-400">
            Fase 3 — pedido a proveedor, numerado de forma atómica real (<code>fn_siguiente_numero</code>).
          </p>
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
        <DataTable columns={columns} rows={rows} rowKey={(r) => `${r.tienda_terminal_codigo}-${r.numero}`} loading={loading} emptyMessage="Sin pedidos a proveedor todavía." />
      </div>

      {open && (
        <Modal title="Nuevo pedido a proveedor" onClose={() => setOpen(false)} widthClass="max-w-2xl">
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Proveedor *">
                <SelectInput required value={proveedorCodigo} onChange={(e) => setProveedorCodigo(e.target.value)}>
                  <option value="">— Elige —</option>
                  {proveedores.map((p) => (
                    <option key={p.codigo} value={p.codigo}>
                      {p.nombre}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="Almacén de recepción *">
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
                  onClick={() => setLineas((ls) => [...ls, { articulo_codigo: '', cantidad: '', precio_compra: '' }])}
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
                      step="0.001"
                      placeholder="Precio compra"
                      value={l.precio_compra}
                      onChange={(e) => updateLinea(i, { precio_compra: e.target.value })}
                      className="w-32"
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

