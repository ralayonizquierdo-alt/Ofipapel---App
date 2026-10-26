import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Trash2, ArrowRightLeft } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DataTable, type Column } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { FormField, TextInput, SelectInput } from '../components/FormField'

const TIENDA = '01'

interface Traspaso {
  tienda_terminal_codigo: string
  numero: number
  fecha: string
  confirmado: boolean
  almacen_origen: { nombre: string } | null
  almacen_destino: { nombre: string } | null
}

interface Almacen {
  codigo: string
  nombre: string
}

interface LineaForm {
  articulo_codigo: string
  cantidad: string
}

export function TraspasosPage() {
  const [rows, setRows] = useState<Traspaso[]>([])
  const [almacenes, setAlmacenes] = useState<Almacen[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [almacenOrigen, setAlmacenOrigen] = useState('')
  const [almacenDestino, setAlmacenDestino] = useState('')
  const [lineas, setLineas] = useState<LineaForm[]>([{ articulo_codigo: '', cantidad: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmando, setConfirmando] = useState<number | null>(null)

  async function load() {
    setLoading(true)
    const [{ data }, { data: alm }] = await Promise.all([
      supabase
        .from('traspaso_almacen')
        .select('tienda_terminal_codigo, numero, fecha, confirmado, almacen_origen:almacen_origen_codigo(nombre), almacen_destino:almacen_destino_codigo(nombre)')
        .order('fecha', { ascending: false })
        .limit(50),
      supabase.from('almacen').select('codigo, nombre').order('codigo'),
    ])
    setRows((data as unknown as Traspaso[]) ?? [])
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

    if (almacenOrigen === almacenDestino) {
      setSaving(false)
      setError('El almacén de origen y el de destino no pueden ser el mismo.')
      return
    }

    const { data: numero, error: numeroError } = await supabase.rpc('fn_siguiente_numero', {
      p_tienda: TIENDA,
      p_tipo_documento: 'traspaso_almacen',
      p_serie: '',
    })
    if (numeroError) {
      setSaving(false)
      setError(numeroError.message)
      return
    }

    const { error: cabeceraError } = await supabase.from('traspaso_almacen').insert({
      tienda_terminal_codigo: TIENDA,
      numero,
      fecha: new Date().toISOString(),
      almacen_origen_codigo: almacenOrigen,
      almacen_destino_codigo: almacenDestino,
      almacen_origen_ficticio: false,
      almacen_destino_ficticio: false,
      confirmado: false,
      stock_movido: false,
      es_multiple: false,
      encadena_segundo_traspaso: false,
    })
    if (cabeceraError) {
      setSaving(false)
      setError(cabeceraError.message)
      return
    }

    const lineasValidas = lineas.filter((l) => l.articulo_codigo && l.cantidad)
    if (lineasValidas.length > 0) {
      const { error: lineasError } = await supabase.from('traspaso_almacen_linea').insert(
        lineasValidas.map((l, i) => ({
          tienda_terminal_codigo: TIENDA,
          numero,
          linea: i + 1,
          articulo_codigo: l.articulo_codigo,
          cantidad: Number(l.cantidad),
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
    setAlmacenOrigen('')
    setAlmacenDestino('')
    setLineas([{ articulo_codigo: '', cantidad: '' }])
    load()
  }

  async function handleConfirmar(traspaso: Traspaso & { almacen_origen_codigo?: string; almacen_destino_codigo?: string }) {
    setConfirmando(traspaso.numero)
    setError(null)

    const [{ data: cabecera, error: cabeceraError }, { data: lineasTraspaso, error: lineasError }] = await Promise.all([
      supabase
        .from('traspaso_almacen')
        .select('almacen_origen_codigo, almacen_destino_codigo')
        .eq('tienda_terminal_codigo', traspaso.tienda_terminal_codigo)
        .eq('numero', traspaso.numero)
        .single(),
      supabase
        .from('traspaso_almacen_linea')
        .select('articulo_codigo, cantidad')
        .eq('tienda_terminal_codigo', traspaso.tienda_terminal_codigo)
        .eq('numero', traspaso.numero),
    ])
    if (cabeceraError || !cabecera) {
      setConfirmando(null)
      setError(cabeceraError?.message ?? 'No se encontró el traspaso.')
      return
    }
    if (lineasError) {
      setConfirmando(null)
      setError(lineasError.message)
      return
    }

    if (lineasTraspaso && lineasTraspaso.length > 0) {
      const movimientos = lineasTraspaso.flatMap((l, i) => [
        {
          tipo_movimiento: 'traspaso',
          sentido: -1,
          almacen_codigo: cabecera.almacen_origen_codigo,
          articulo_codigo: l.articulo_codigo,
          cantidad: l.cantidad,
          documento_origen_tipo: 'traspaso_almacen',
          documento_origen_tienda_codigo: traspaso.tienda_terminal_codigo,
          documento_origen_numero: traspaso.numero,
          documento_origen_linea: i + 1,
          tienda_terminal_codigo: traspaso.tienda_terminal_codigo,
        },
        {
          tipo_movimiento: 'traspaso',
          sentido: 1,
          almacen_codigo: cabecera.almacen_destino_codigo,
          articulo_codigo: l.articulo_codigo,
          cantidad: l.cantidad,
          documento_origen_tipo: 'traspaso_almacen',
          documento_origen_tienda_codigo: traspaso.tienda_terminal_codigo,
          documento_origen_numero: traspaso.numero,
          documento_origen_linea: i + 1,
          tienda_terminal_codigo: traspaso.tienda_terminal_codigo,
        },
      ])
      const { error: stockError } = await supabase.from('movimiento_stock').insert(movimientos)
      if (stockError) {
        setConfirmando(null)
        setError(stockError.message)
        return
      }
    }

    const { error: updateError } = await supabase
      .from('traspaso_almacen')
      .update({ confirmado: true, stock_movido: true })
      .eq('tienda_terminal_codigo', traspaso.tienda_terminal_codigo)
      .eq('numero', traspaso.numero)
    if (updateError) {
      setConfirmando(null)
      setError(updateError.message)
      return
    }

    setConfirmando(null)
    load()
  }

  const columns: Column<Traspaso>[] = [
    { header: 'Número', cell: (r) => <span className="font-mono text-xs">{r.tienda_terminal_codigo}-{r.numero}</span> },
    { header: 'Origen', cell: (r) => r.almacen_origen?.nombre ?? '—' },
    { header: 'Destino', cell: (r) => r.almacen_destino?.nombre ?? '—' },
    {
      header: 'Estado',
      cell: (r) =>
        r.confirmado ? (
          <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Confirmado</span>
        ) : (
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">Pendiente</span>
        ),
    },
    { header: 'Fecha', cell: (r) => new Date(r.fecha).toLocaleString('es-ES') },
    {
      header: '',
      cell: (r) =>
        r.confirmado ? null : (
          <button
            type="button"
            onClick={() => handleConfirmar(r)}
            disabled={confirmando === r.numero}
            className="flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline disabled:opacity-50"
          >
            <ArrowRightLeft size={14} /> {confirmando === r.numero ? 'Confirmando…' : 'Confirmar'}
          </button>
        ),
    },
  ]

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Traspasos entre almacenes</h1>
          <p className="mt-1 text-sm text-slate-400">Numerados de forma atómica; Confirmar mueve stock real en los dos sentidos.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={16} /> Nuevo traspaso
        </button>
      </div>

      <div className="mt-4">
        <DataTable columns={columns} rows={rows} rowKey={(r) => `${r.tienda_terminal_codigo}-${r.numero}`} loading={loading} emptyMessage="Sin traspasos todavía." />
      </div>

      {open && (
        <Modal title="Nuevo traspaso" onClose={() => setOpen(false)} widthClass="max-w-2xl">
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-4">
              <FormField label="Almacén origen *">
                <SelectInput required value={almacenOrigen} onChange={(e) => setAlmacenOrigen(e.target.value)}>
                  <option value="">— Elige —</option>
                  {almacenes.map((a) => (
                    <option key={a.codigo} value={a.codigo}>
                      {a.nombre}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="Almacén destino *">
                <SelectInput required value={almacenDestino} onChange={(e) => setAlmacenDestino(e.target.value)}>
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
                  onClick={() => setLineas((ls) => [...ls, { articulo_codigo: '', cantidad: '' }])}
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
              {saving ? 'Guardando…' : 'Crear traspaso'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
