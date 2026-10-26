import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Trash2, ClipboardCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DataTable, type Column } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { FormField, TextInput, SelectInput } from '../components/FormField'

const TIENDA = '01'

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

interface Inventario {
  tienda_terminal_codigo: string
  numero: number
  nombre: string | null
  fecha: string
  estado: string
  almacen: { nombre: string } | null
}

interface Almacen {
  codigo: string
  nombre: string
}

interface LineaForm {
  articulo_codigo: string
  cantidadContada: string
}

export function InventarioPage() {
  const [rows, setRows] = useState<Inventario[]>([])
  const [almacenes, setAlmacenes] = useState<Almacen[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [nombre, setNombre] = useState('')
  const [almacenCodigo, setAlmacenCodigo] = useState('')
  const [lineas, setLineas] = useState<LineaForm[]>([{ articulo_codigo: '', cantidadContada: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cerrando, setCerrando] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    const [{ data }, { data: alm }] = await Promise.all([
      supabase
        .from('inventario')
        .select('tienda_terminal_codigo, numero, nombre, fecha, estado, almacen:almacen_codigo(nombre)')
        .order('fecha', { ascending: false })
        .limit(50),
      supabase.from('almacen').select('codigo, nombre').order('codigo'),
    ])
    setRows((data as unknown as Inventario[]) ?? [])
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
      p_tipo_documento: 'inventario',
      p_serie: '',
    })
    if (numeroError) {
      setSaving(false)
      setError(numeroError.message)
      return
    }

    const { error: cabeceraError } = await supabase.from('inventario').insert({
      tienda_terminal_codigo: TIENDA,
      numero,
      nombre: nombre || null,
      fecha: hoy(),
      almacen_codigo: almacenCodigo,
      estado: 'pendiente',
    })
    if (cabeceraError) {
      setSaving(false)
      setError(cabeceraError.message)
      return
    }

    const lineasValidas = lineas.filter((l) => l.articulo_codigo && l.cantidadContada)
    for (let i = 0; i < lineasValidas.length; i++) {
      const l = lineasValidas[i]
      const { data: stockActual } = await supabase
        .from('articulo_almacen_stock')
        .select('cantidad_actual')
        .eq('articulo_codigo', l.articulo_codigo)
        .eq('almacen_codigo', almacenCodigo)
        .maybeSingle()
      const stock = stockActual?.cantidad_actual ?? 0

      const { error: lineaError } = await supabase.from('inventario_linea').insert({
        tienda_terminal_codigo: TIENDA,
        numero,
        numero_linea: i + 1,
        articulo_codigo: l.articulo_codigo,
        almacen_codigo: almacenCodigo,
        cantidad_contada: Number(l.cantidadContada),
        stock_anterior: stock,
        stock_actual: stock,
        inventariada: false,
      })
      if (lineaError) {
        setSaving(false)
        setError(lineaError.message)
        return
      }
    }

    setSaving(false)
    setOpen(false)
    setNombre('')
    setAlmacenCodigo('')
    setLineas([{ articulo_codigo: '', cantidadContada: '' }])
    load()
  }

  async function handleCerrar(inv: Inventario) {
    setCerrando(inv.numero)
    setError(null)

    const { data: lineasInv, error: lineasError } = await supabase
      .from('inventario_linea')
      .select('articulo_codigo, almacen_codigo, cantidad_contada, stock_actual')
      .eq('tienda_terminal_codigo', inv.tienda_terminal_codigo)
      .eq('numero', inv.numero)
    if (lineasError) {
      setCerrando(null)
      setError(lineasError.message)
      return
    }

    const ajustes = (lineasInv ?? [])
      .map((l) => ({ ...l, diff: Number(l.cantidad_contada ?? 0) - Number(l.stock_actual ?? 0) }))
      .filter((l) => l.diff !== 0 && l.almacen_codigo)

    if (ajustes.length > 0) {
      const { error: stockError } = await supabase.from('movimiento_stock').insert(
        ajustes.map((l) => ({
          tipo_movimiento: 'inventario',
          sentido: l.diff > 0 ? 1 : -1,
          almacen_codigo: l.almacen_codigo,
          articulo_codigo: l.articulo_codigo,
          cantidad: Math.abs(l.diff),
          documento_origen_tipo: 'inventario',
          documento_origen_tienda_codigo: inv.tienda_terminal_codigo,
          documento_origen_numero: inv.numero,
          tienda_terminal_codigo: inv.tienda_terminal_codigo,
        })),
      )
      if (stockError) {
        setCerrando(null)
        setError(stockError.message)
        return
      }
    }

    const { error: lineasUpdateError } = await supabase
      .from('inventario_linea')
      .update({ inventariada: true })
      .eq('tienda_terminal_codigo', inv.tienda_terminal_codigo)
      .eq('numero', inv.numero)
    if (lineasUpdateError) {
      setCerrando(null)
      setError(lineasUpdateError.message)
      return
    }

    const { error: updateError } = await supabase
      .from('inventario')
      .update({ estado: 'inventariado' })
      .eq('tienda_terminal_codigo', inv.tienda_terminal_codigo)
      .eq('numero', inv.numero)
    if (updateError) {
      setCerrando(null)
      setError(updateError.message)
      return
    }

    setCerrando(null)
    load()
  }

  const columns: Column<Inventario>[] = [
    { header: 'Número', cell: (r) => <span className="font-mono text-xs">{r.tienda_terminal_codigo}-{r.numero}</span> },
    { header: 'Nombre', cell: (r) => r.nombre ?? '—' },
    { header: 'Almacén', cell: (r) => r.almacen?.nombre ?? '—' },
    {
      header: 'Estado',
      cell: (r) =>
        r.estado === 'inventariado' ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Inventariado</span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Pendiente</span>
        ),
    },
    { header: 'Fecha', cell: (r) => new Date(r.fecha).toLocaleDateString('es-ES') },
    {
      header: '',
      cell: (r) =>
        r.estado === 'inventariado' ? null : (
          <button
            type="button"
            onClick={() => handleCerrar(r)}
            disabled={cerrando === r.numero}
            className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
          >
            <ClipboardCheck size={14} /> {cerrando === r.numero ? 'Cerrando…' : 'Cerrar e inventariar'}
          </button>
        ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventario</h1>
          <p className="mt-1 text-sm text-slate-400">
            Recuento físico de stock — cerrar genera los ajustes de stock reales (sin tocar lo que ya coincide).
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={16} /> Nuevo inventario
        </button>
      </div>

      <div className="mt-4">
        <DataTable columns={columns} rows={rows} rowKey={(r) => `${r.tienda_terminal_codigo}-${r.numero}`} loading={loading} emptyMessage="Sin inventarios todavía." />
      </div>

      {open && (
        <Modal title="Nuevo inventario" onClose={() => setOpen(false)} widthClass="max-w-2xl">
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Nombre (opcional)">
                <TextInput value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Recuento trimestral" />
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
                <span className="text-sm font-medium text-slate-600">Líneas (cantidad contada físicamente)</span>
                <button
                  type="button"
                  onClick={() => setLineas((ls) => [...ls, { articulo_codigo: '', cantidadContada: '' }])}
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
                      placeholder="Cantidad contada"
                      value={l.cantidadContada}
                      onChange={(e) => updateLinea(i, { cantidadContada: e.target.value })}
                      className="w-36"
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
              {saving ? 'Guardando…' : 'Crear inventario'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
