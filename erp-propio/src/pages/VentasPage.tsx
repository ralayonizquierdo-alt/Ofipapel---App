import { useEffect, useState, type FormEvent } from 'react'
import { Plus, Trash2, Lock, Unlock } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { DataTable, type Column } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { FormField, TextInput, SelectInput } from '../components/FormField'

const TIENDA = '01'

function hoy() {
  return new Date().toISOString().slice(0, 10)
}

// Heurística temporal: rober@ofipapel.local -> ROBER (coincide con los empleados ya
// sembrados). Pendiente de un vínculo real auth.users <-> empleado (ver DECISIONES.md).
function empleadoCodigoDeSesion(email: string | undefined): string | null {
  if (!email) return null
  return email.split('@')[0].toUpperCase()
}

interface CajaSesion {
  tienda_terminal_codigo: string
  ejercicio: number
  fecha_apertura: string
  fondo_inicial: number | null
  cerrado: boolean
}

interface Venta {
  tienda_terminal_codigo: string
  numero: number
  total: number | null
  total_efectivo: number | null
  total_tarjeta: number | null
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

export function VentasPage() {
  const { session } = useAuth()
  const [caja, setCaja] = useState<CajaSesion | null>(null)
  const [loadingCaja, setLoadingCaja] = useState(true)
  const [ventas, setVentas] = useState<Venta[]>([])
  const [loadingVentas, setLoadingVentas] = useState(true)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [almacenes, setAlmacenes] = useState<Almacen[]>([])

  const [openCaja, setOpenCaja] = useState(false)
  const [fondoInicial, setFondoInicial] = useState('')
  const [savingCaja, setSavingCaja] = useState(false)
  const [cerrando, setCerrando] = useState(false)
  const [errorCaja, setErrorCaja] = useState<string | null>(null)

  const [openVenta, setOpenVenta] = useState(false)
  const [clienteCodigo, setClienteCodigo] = useState('')
  const [almacenCodigo, setAlmacenCodigo] = useState('')
  const [efectivo, setEfectivo] = useState('')
  const [tarjeta, setTarjeta] = useState('')
  const [lineas, setLineas] = useState<LineaForm[]>([{ articulo_codigo: '', cantidad: '', precio: '' }])
  const [savingVenta, setSavingVenta] = useState(false)
  const [errorVenta, setErrorVenta] = useState<string | null>(null)

  async function loadCaja() {
    setLoadingCaja(true)
    const { data } = await supabase
      .from('caja_apertura_cierre')
      .select('tienda_terminal_codigo, ejercicio, fecha_apertura, fondo_inicial, cerrado')
      .eq('tienda_terminal_codigo', TIENDA)
      .eq('cerrado', false)
      .order('ejercicio', { ascending: false })
      .limit(1)
      .maybeSingle()
    setCaja(data)
    setLoadingCaja(false)
  }

  async function loadVentas() {
    setLoadingVentas(true)
    const { data } = await supabase
      .from('venta')
      .select('tienda_terminal_codigo, numero, total, total_efectivo, total_tarjeta, fecha, cliente:cliente_codigo(nombre)')
      .eq('tienda_terminal_codigo', TIENDA)
      .order('numero', { ascending: false })
      .limit(50)
    setVentas((data as unknown as Venta[]) ?? [])
    setLoadingVentas(false)
  }

  async function loadCatalogos() {
    const [{ data: cli }, { data: alm }] = await Promise.all([
      supabase.from('cliente').select('codigo, nombre').order('nombre'),
      supabase.from('almacen').select('codigo, nombre').order('codigo'),
    ])
    setClientes(cli ?? [])
    setAlmacenes(alm ?? [])
  }

  useEffect(() => {
    loadCaja()
    loadVentas()
    loadCatalogos()
  }, [])

  async function handleAbrirCaja(e: FormEvent) {
    e.preventDefault()
    setSavingCaja(true)
    setErrorCaja(null)

    const { data: ultima } = await supabase
      .from('caja_apertura_cierre')
      .select('ejercicio')
      .eq('tienda_terminal_codigo', TIENDA)
      .order('ejercicio', { ascending: false })
      .limit(1)
      .maybeSingle()
    const ejercicio = (ultima?.ejercicio ?? 0) + 1

    const { error: insertError } = await supabase.from('caja_apertura_cierre').insert({
      tienda_terminal_codigo: TIENDA,
      ejercicio,
      fecha_apertura: new Date().toISOString(),
      cerrado: false,
      empleado_apertura_codigo: empleadoCodigoDeSesion(session?.user.email),
      fondo_inicial: Number(fondoInicial) || 0,
    })
    if (insertError) {
      setSavingCaja(false)
      setErrorCaja(insertError.message)
      return
    }

    setSavingCaja(false)
    setOpenCaja(false)
    setFondoInicial('')
    loadCaja()
  }

  async function handleCerrarCaja() {
    if (!caja) return
    setCerrando(true)
    setErrorCaja(null)

    const { data: ventasHoy, error: ventasError } = await supabase
      .from('venta')
      .select('total_efectivo, total_tarjeta')
      .eq('tienda_terminal_codigo', TIENDA)
      .gte('fecha', caja.fecha_apertura.slice(0, 10))
    if (ventasError) {
      setCerrando(false)
      setErrorCaja(ventasError.message)
      return
    }

    const totalEfectivo = (ventasHoy ?? []).reduce((acc, v) => acc + Number(v.total_efectivo ?? 0), 0)
    const totalTarjeta = (ventasHoy ?? []).reduce((acc, v) => acc + Number(v.total_tarjeta ?? 0), 0)
    const fondoInicialNum = Number(caja.fondo_inicial ?? 0)

    const { error: updateError } = await supabase
      .from('caja_apertura_cierre')
      .update({
        cerrado: true,
        fecha_cierre: new Date().toISOString(),
        empleado_cierre_codigo: empleadoCodigoDeSesion(session?.user.email),
        total_efectivo: totalEfectivo,
        total_tarjeta: totalTarjeta,
        total_ingreso: totalEfectivo + totalTarjeta,
        fondo_final: fondoInicialNum + totalEfectivo,
      })
      .eq('tienda_terminal_codigo', TIENDA)
      .eq('ejercicio', caja.ejercicio)
    if (updateError) {
      setCerrando(false)
      setErrorCaja(updateError.message)
      return
    }

    setCerrando(false)
    loadCaja()
  }

  function updateLinea(i: number, patch: Partial<LineaForm>) {
    setLineas((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)))
  }

  const lineasValidas = lineas.filter((l) => l.articulo_codigo && l.cantidad)
  const totalCalculado = lineasValidas.reduce((acc, l) => acc + Number(l.cantidad) * Number(l.precio || 0), 0)

  async function handleGuardarVenta(e: FormEvent) {
    e.preventDefault()
    setSavingVenta(true)
    setErrorVenta(null)

    const { data: numero, error: numeroError } = await supabase.rpc('fn_siguiente_numero', {
      p_tienda: TIENDA,
      p_tipo_documento: 'venta',
      p_serie: '',
    })
    if (numeroError) {
      setSavingVenta(false)
      setErrorVenta(numeroError.message)
      return
    }

    const { error: cabeceraError } = await supabase.from('venta').insert({
      tienda_terminal_codigo: TIENDA,
      numero,
      cliente_codigo: clienteCodigo,
      almacen_codigo: almacenCodigo,
      fecha: hoy(),
      total: totalCalculado,
      total_efectivo: Number(efectivo) || 0,
      total_tarjeta: Number(tarjeta) || 0,
    })
    if (cabeceraError) {
      setSavingVenta(false)
      setErrorVenta(cabeceraError.message)
      return
    }

    if (lineasValidas.length > 0) {
      const { error: lineasError } = await supabase.from('venta_linea').insert(
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
        setSavingVenta(false)
        setErrorVenta(lineasError.message)
        return
      }
    }

    const { data: numeroMov, error: numeroMovError } = await supabase.rpc('fn_siguiente_numero', {
      p_tienda: TIENDA,
      p_tipo_documento: 'caja',
      p_serie: '',
    })
    if (!numeroMovError) {
      await supabase.from('movimiento_caja').insert({
        tienda_terminal_codigo: TIENDA,
        numero: numeroMov,
        fecha: hoy(),
        es_ingreso: true,
        ingreso: totalCalculado,
        concepto: `Venta ${TIENDA}-${numero}`,
        documento: 'venta',
        ajeno_tienda_codigo: TIENDA,
        ajeno_codigo: numero,
        cliente_codigo: clienteCodigo,
      })
    }

    setSavingVenta(false)
    setOpenVenta(false)
    setClienteCodigo('')
    setAlmacenCodigo('')
    setEfectivo('')
    setTarjeta('')
    setLineas([{ articulo_codigo: '', cantidad: '', precio: '' }])
    loadVentas()
  }

  const columns: Column<Venta>[] = [
    { header: 'Número', cell: (r) => <span className="font-mono text-xs">{r.tienda_terminal_codigo}-{r.numero}</span> },
    { header: 'Cliente', cell: (r) => r.cliente?.nombre ?? '—' },
    { header: 'Efectivo', cell: (r) => (r.total_efectivo != null ? `${r.total_efectivo.toFixed(2)} €` : '—') },
    { header: 'Tarjeta', cell: (r) => (r.total_tarjeta != null ? `${r.total_tarjeta.toFixed(2)} €` : '—') },
    { header: 'Total', cell: (r) => (r.total != null ? `${r.total.toFixed(2)} €` : '—') },
    { header: 'Fecha', cell: (r) => new Date(r.fecha).toLocaleDateString('es-ES') },
  ]

  const sumaManual = (Number(efectivo) || 0) + (Number(tarjeta) || 0)

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Ventas / TPV</h1>
          <p className="mt-1 text-sm text-slate-400">Fase 5 — ticket de venta, caja y movimientos reales.</p>
        </div>
        <button
          type="button"
          disabled={!caja}
          onClick={() => setOpenVenta(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={16} /> Nueva venta
        </button>
      </div>

      <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4">
        {loadingCaja ? (
          <p className="text-sm text-slate-400">Comprobando estado de caja…</p>
        ) : caja ? (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-emerald-700">
              <Unlock size={16} />
              <span className="font-medium">
                Caja abierta (sesión {caja.ejercicio}) — fondo inicial {Number(caja.fondo_inicial ?? 0).toFixed(2)} € ·
                {' '}{new Date(caja.fecha_apertura).toLocaleString('es-ES')}
              </span>
            </div>
            <button
              type="button"
              onClick={handleCerrarCaja}
              disabled={cerrando}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              {cerrando ? 'Cerrando…' : 'Cerrar caja'}
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Lock size={16} />
              <span>No hay caja abierta — hace falta abrirla para vender.</span>
            </div>
            <button
              type="button"
              onClick={() => setOpenCaja(true)}
              className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700"
            >
              Abrir caja
            </button>
          </div>
        )}
        {errorCaja && <p className="mt-2 text-sm text-red-600">{errorCaja}</p>}
      </div>

      <div className="mt-4">
        <DataTable columns={columns} rows={ventas} rowKey={(r) => `${r.tienda_terminal_codigo}-${r.numero}`} loading={loadingVentas} emptyMessage="Sin ventas todavía." />
      </div>

      {openCaja && (
        <Modal title="Abrir caja" onClose={() => setOpenCaja(false)}>
          <form onSubmit={handleAbrirCaja} className="flex flex-col gap-4">
            <FormField label="Fondo inicial (€) *">
              <TextInput required type="number" step="0.01" value={fondoInicial} onChange={(e) => setFondoInicial(e.target.value)} />
            </FormField>
            {errorCaja && <p className="text-sm text-red-600">{errorCaja}</p>}
            <button type="submit" disabled={savingCaja} className="mt-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50">
              {savingCaja ? 'Abriendo…' : 'Abrir caja'}
            </button>
          </form>
        </Modal>
      )}

      {openVenta && (
        <Modal title="Nueva venta" onClose={() => setOpenVenta(false)} widthClass="max-w-2xl">
          <form onSubmit={handleGuardarVenta} className="flex flex-col gap-4">
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

            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Total calculado: <span className="font-semibold text-slate-800">{totalCalculado.toFixed(2)} €</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Cobrado en efectivo (€)">
                <TextInput type="number" step="0.01" value={efectivo} onChange={(e) => setEfectivo(e.target.value)} />
              </FormField>
              <FormField label="Cobrado con tarjeta (€)">
                <TextInput type="number" step="0.01" value={tarjeta} onChange={(e) => setTarjeta(e.target.value)} />
              </FormField>
            </div>
            {sumaManual.toFixed(2) !== totalCalculado.toFixed(2) && (efectivo || tarjeta) && (
              <p className="text-xs text-amber-600">
                El efectivo + tarjeta ({sumaManual.toFixed(2)} €) no coincide con el total ({totalCalculado.toFixed(2)} €).
              </p>
            )}

            {errorVenta && <p className="text-sm text-red-600">{errorVenta}</p>}
            <button type="submit" disabled={savingVenta} className="mt-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {savingVenta ? 'Guardando…' : 'Cobrar y guardar'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
