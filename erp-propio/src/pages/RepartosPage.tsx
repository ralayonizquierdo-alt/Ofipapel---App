import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Trash2, Truck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DataTable, type Column } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { FormField, TextInput, SelectInput } from '../components/FormField'

const TIENDA = '01'

const ESTADOS_REPARTO: Record<number, { label: string; className: string }> = {
  0: { label: 'Pendiente', className: 'bg-amber-50 text-amber-700' },
  1: { label: 'En curso', className: 'bg-indigo-50 text-indigo-700' },
  2: { label: 'Finalizado', className: 'bg-emerald-50 text-emerald-700' },
}

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

interface Reparto {
  tienda_terminal_codigo: string
  numero: number
  fecha: string
  estado: number | null
  total_ventas: number | null
  ruta: { descripcion: string } | null
  repartidor: { nombre: string } | null
}

interface RutaReparto {
  codigo: string
  descripcion: string
}

interface Repartidor {
  codigo: string
  nombre: string
}

interface LineaForm {
  ventaNumero: string
  direccion: string
  contacto: string
  telefonoMovil: string
}

export function RepartosPage() {
  const [rows, setRows] = useState<Reparto[]>([])
  const [rutas, setRutas] = useState<RutaReparto[]>([])
  const [repartidores, setRepartidores] = useState<Repartidor[]>([])
  const [loading, setLoading] = useState(true)
  const [open, setOpen] = useState(false)
  const [rutaCodigo, setRutaCodigo] = useState('')
  const [repartidorCodigo, setRepartidorCodigo] = useState('')
  const [fecha, setFecha] = useState(hoy())
  const [lineas, setLineas] = useState<LineaForm[]>([{ ventaNumero: '', direccion: '', contacto: '', telefonoMovil: '' }])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    const [{ data }, { data: rut }, { data: rep }] = await Promise.all([
      supabase
        .from('reparto')
        .select('tienda_terminal_codigo, numero, fecha, estado, total_ventas, ruta:ruta_codigo(descripcion), repartidor:repartidor_codigo(nombre)')
        .order('fecha', { ascending: false })
        .limit(50),
      supabase.from('ruta_reparto').select('codigo, descripcion').order('descripcion'),
      supabase.from('repartidor').select('codigo, nombre').order('nombre'),
    ])
    setRows((data as unknown as Reparto[]) ?? [])
    setRutas(rut ?? [])
    setRepartidores(rep ?? [])
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
      p_tipo_documento: 'reparto',
      p_serie: '',
    })
    if (numeroError) {
      setSaving(false)
      setError(numeroError.message)
      return
    }

    const { error: cabeceraError } = await supabase.from('reparto').insert({
      tienda_terminal_codigo: TIENDA,
      numero,
      ruta_codigo: rutaCodigo || null,
      repartidor_codigo: repartidorCodigo || null,
      fecha,
      estado: 0,
    })
    if (cabeceraError) {
      setSaving(false)
      setError(cabeceraError.message)
      return
    }

    const lineasValidas = lineas.filter((l) => l.ventaNumero)
    if (lineasValidas.length > 0) {
      const { error: lineasError } = await supabase.from('reparto_linea').insert(
        lineasValidas.map((l, i) => ({
          tienda_terminal_codigo: TIENDA,
          numero,
          venta_tienda_codigo: TIENDA,
          venta_numero: Number(l.ventaNumero),
          orden: i + 1,
          direccion: l.direccion || null,
          contacto: l.contacto || null,
          telefono_movil: l.telefonoMovil || null,
          estado: 'pendiente',
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
    setRutaCodigo('')
    setRepartidorCodigo('')
    setFecha(hoy())
    setLineas([{ ventaNumero: '', direccion: '', contacto: '', telefonoMovil: '' }])
    load()
  }

  const columns: Column<Reparto>[] = [
    { header: 'Número', cell: (r) => <span className="font-mono text-xs">{r.tienda_terminal_codigo}-{r.numero}</span> },
    { header: 'Ruta', cell: (r) => r.ruta?.descripcion ?? '—' },
    { header: 'Repartidor', cell: (r) => r.repartidor?.nombre ?? '—' },
    {
      header: 'Estado',
      cell: (r) => {
        const estado = ESTADOS_REPARTO[r.estado ?? 0] ?? ESTADOS_REPARTO[0]
        return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${estado.className}`}>{estado.label}</span>
      },
    },
    { header: 'Total ventas', cell: (r) => (r.total_ventas != null ? `${r.total_ventas.toFixed(2)} €` : '—') },
    { header: 'Fecha', cell: (r) => new Date(r.fecha).toLocaleDateString('es-ES') },
  ]

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Repartos</h1>
          <p className="mt-1 text-sm text-slate-400">Fase 4 — rutas de reparto reales, numeradas de forma atómica.</p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
        >
          <Plus size={16} /> Nuevo reparto
        </button>
      </div>

      <div className="mt-4">
        <DataTable columns={columns} rows={rows} rowKey={(r) => `${r.tienda_terminal_codigo}-${r.numero}`} loading={loading} emptyMessage="Sin repartos todavía." />
      </div>

      {open && (
        <Modal title="Nuevo reparto" onClose={() => setOpen(false)} widthClass="max-w-2xl">
          <form onSubmit={handleSave} className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-4">
              <FormField label="Ruta">
                <SelectInput value={rutaCodigo} onChange={(e) => setRutaCodigo(e.target.value)}>
                  <option value="">— Sin asignar —</option>
                  {rutas.map((r) => (
                    <option key={r.codigo} value={r.codigo}>
                      {r.descripcion}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="Repartidor">
                <SelectInput value={repartidorCodigo} onChange={(e) => setRepartidorCodigo(e.target.value)}>
                  <option value="">— Sin asignar —</option>
                  {repartidores.map((r) => (
                    <option key={r.codigo} value={r.codigo}>
                      {r.nombre}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
              <FormField label="Fecha *">
                <TextInput required type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </FormField>
            </div>

            {rutas.length === 0 && repartidores.length === 0 && (
              <p className="text-xs text-slate-400">
                Todavía no hay rutas ni repartidores dados de alta — el reparto se puede crear igualmente, sin asignar.
              </p>
            )}

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-slate-600">Paradas (ventas a repartir)</span>
                <button
                  type="button"
                  onClick={() => setLineas((ls) => [...ls, { ventaNumero: '', direccion: '', contacto: '', telefonoMovil: '' }])}
                  className="text-xs font-medium text-indigo-600 hover:underline"
                >
                  + añadir parada
                </button>
              </div>
              <div className="flex flex-col gap-2">
                {lineas.map((l, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <TextInput
                      type="number"
                      placeholder="Nº de venta"
                      value={l.ventaNumero}
                      onChange={(e) => updateLinea(i, { ventaNumero: e.target.value })}
                      className="w-28"
                    />
                    <TextInput
                      placeholder="Dirección (opcional)"
                      value={l.direccion}
                      onChange={(e) => updateLinea(i, { direccion: e.target.value })}
                      className="flex-1"
                    />
                    <TextInput
                      placeholder="Contacto"
                      value={l.contacto}
                      onChange={(e) => updateLinea(i, { contacto: e.target.value })}
                      className="w-32"
                    />
                    <TextInput
                      placeholder="Teléfono"
                      value={l.telefonoMovil}
                      onChange={(e) => updateLinea(i, { telefonoMovil: e.target.value })}
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
            <button type="submit" disabled={saving} className="mt-2 flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              <Truck size={16} /> {saving ? 'Guardando…' : 'Crear reparto'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
