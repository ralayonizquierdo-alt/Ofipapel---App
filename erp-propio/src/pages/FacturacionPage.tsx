import { useEffect, useState, type FormEvent } from 'react'
import { Plus, ShieldCheck } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { DataTable, type Column } from '../components/DataTable'
import { Modal } from '../components/Modal'
import { FormField, TextInput, SelectInput } from '../components/FormField'

const TIENDA = '01'

// VeriFactu: la huella, el encadenado, el QR y el NIF del emisor (empresa.cif de la
// tienda) los pone la BASE DE DATOS al insertar la factura (trigger
// trg_factura_verifactu_alta → fn_verifactu_registrar). Aquí no se calcula nada.

interface Factura {
  tienda_terminal_codigo: string
  numero: number
  serie: string
  n_factura: number
  total: number | null
  estado_envio_aeat: string
  huella: string | null
  fecha_factura: string
  cliente: { nombre: string } | null
}

interface Serie {
  tienda_terminal_codigo: string
  serie: string
  descripcion: string | null
  activa_verifactu: boolean
}

interface Cliente {
  codigo: string
  nombre: string
}

export function FacturacionPage() {
  const [facturas, setFacturas] = useState<Factura[]>([])
  const [loadingFacturas, setLoadingFacturas] = useState(true)
  const [series, setSeries] = useState<Serie[]>([])
  const [clientes, setClientes] = useState<Cliente[]>([])

  const [openSerie, setOpenSerie] = useState(false)
  const [serieCodigo, setSerieCodigo] = useState('')
  const [serieDescripcion, setSerieDescripcion] = useState('')
  const [serieDigitoControl, setSerieDigitoControl] = useState('')
  const [savingSerie, setSavingSerie] = useState(false)
  const [errorSerie, setErrorSerie] = useState<string | null>(null)

  const [openFactura, setOpenFactura] = useState(false)
  const [clienteCodigo, setClienteCodigo] = useState('')
  const [serieFacturaCodigo, setSerieFacturaCodigo] = useState('')
  const [descripcionOperacion, setDescripcionOperacion] = useState('')
  const [baseImponible, setBaseImponible] = useState('')
  const [igicPct, setIgicPct] = useState('7')
  const [savingFactura, setSavingFactura] = useState(false)
  const [errorFactura, setErrorFactura] = useState<string | null>(null)

  async function loadFacturas() {
    setLoadingFacturas(true)
    const { data } = await supabase
      .from('factura')
      .select('tienda_terminal_codigo, numero, serie, n_factura, total, estado_envio_aeat, huella, fecha_factura, cliente:cliente_codigo(nombre)')
      .order('numero', { ascending: false })
      .limit(50)
    setFacturas((data as unknown as Factura[]) ?? [])
    setLoadingFacturas(false)
  }

  async function loadSeries() {
    const { data } = await supabase
      .from('serie_facturacion')
      .select('tienda_terminal_codigo, serie, descripcion, activa_verifactu')
      .order('serie')
    setSeries(data ?? [])
  }

  async function loadClientes() {
    const { data } = await supabase.from('cliente').select('codigo, nombre').order('nombre')
    setClientes(data ?? [])
  }

  useEffect(() => {
    loadFacturas()
    loadSeries()
    loadClientes()
  }, [])

  async function handleCrearSerie(e: FormEvent) {
    e.preventDefault()
    setSavingSerie(true)
    setErrorSerie(null)

    const { error } = await supabase.from('serie_facturacion').insert({
      tienda_terminal_codigo: TIENDA,
      serie: serieCodigo.toUpperCase(),
      descripcion: serieDescripcion || null,
      digito_control: serieDigitoControl,
      tipo_factura_defecto: 'F1',
      es_serie_rectificativas: false,
      activa_verifactu: true,
    })
    if (error) {
      setSavingSerie(false)
      setErrorSerie(error.message)
      return
    }

    setSavingSerie(false)
    setOpenSerie(false)
    setSerieCodigo('')
    setSerieDescripcion('')
    setSerieDigitoControl('')
    loadSeries()
  }

  const base = Number(baseImponible) || 0
  const igic = Number(igicPct) || 0
  const cuotaIgic = Math.round(base * igic) / 100
  const importeTotal = base + cuotaIgic

  async function handleCrearFactura(e: FormEvent) {
    e.preventDefault()
    setSavingFactura(true)
    setErrorFactura(null)

    const { data: numero, error: numeroError } = await supabase.rpc('fn_siguiente_numero', {
      p_tienda: TIENDA,
      p_tipo_documento: 'factura',
      p_serie: '',
    })
    if (numeroError) {
      setSavingFactura(false)
      setErrorFactura(numeroError.message)
      return
    }

    const { data: nFactura, error: nFacturaError } = await supabase.rpc('fn_siguiente_numero', {
      p_tienda: TIENDA,
      p_tipo_documento: 'factura',
      p_serie: serieFacturaCodigo,
    })
    if (nFacturaError) {
      setSavingFactura(false)
      setErrorFactura(nFacturaError.message)
      return
    }

    const ahora = new Date()
    const { error: facturaError } = await supabase.from('factura').insert({
      tienda_terminal_codigo: TIENDA,
      numero,
      serie: serieFacturaCodigo,
      n_factura: nFactura,
      cliente_codigo: clienteCodigo,
      fecha_factura: ahora.toLocaleDateString('sv-SE'),
      estado: 'emitida',
      total_base: base,
      total_igic: cuotaIgic,
      total: importeTotal,
      es_factura_global: false,
      tipo_factura: 'F1',
      observaciones: descripcionOperacion || null,
    })
    if (facturaError) {
      setSavingFactura(false)
      setErrorFactura(facturaError.message)
      return
    }

    const { error: tramoError } = await supabase.from('factura_impuesto_tramo').insert({
      tienda_terminal_codigo: TIENDA,
      numero,
      tramo: 1,
      tipo_pct: igic,
      base_imponible: base,
      cuota_igic: cuotaIgic,
    })
    if (tramoError) {
      setSavingFactura(false)
      setErrorFactura(tramoError.message)
      return
    }

    setSavingFactura(false)
    setOpenFactura(false)
    setClienteCodigo('')
    setSerieFacturaCodigo('')
    setDescripcionOperacion('')
    setBaseImponible('')
    setIgicPct('7')
    loadFacturas()
  }

  const columns: Column<Factura>[] = [
    { header: 'Factura', cell: (r) => <span className="font-mono text-xs">{r.serie}-{r.n_factura}</span> },
    { header: 'Cliente', cell: (r) => r.cliente?.nombre ?? '—' },
    { header: 'Total', cell: (r) => (r.total != null ? `${r.total.toFixed(2)} €` : '—') },
    {
      header: 'Huella',
      cell: (r) =>
        r.huella ? (
          <span className="inline-flex items-center gap-1 font-mono text-xs text-emerald-700">
            <ShieldCheck size={13} /> {r.huella.slice(0, 12)}…
          </span>
        ) : (
          '—'
        ),
    },
    {
      header: 'Estado AEAT',
      cell: (r) => <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">{r.estado_envio_aeat}</span>,
    },
    { header: 'Fecha', cell: (r) => new Date(r.fecha_factura).toLocaleDateString('es-ES') },
  ]

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Facturación</h1>
          <p className="mt-1 text-sm text-slate-400">
            Huella Veri*Factu (art. 137 Orden HAC/1177/2024) calculada y encadenada en la base de datos. Ver «Registros VeriFactu».
          </p>
        </div>
        <button
          type="button"
          disabled={series.length === 0}
          onClick={() => setOpenFactura(true)}
          className="flex items-center gap-1.5 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Plus size={16} /> Nueva factura
        </button>
      </div>

      {series.length === 0 && !openSerie && (
        <div className="mt-4 flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
          <p className="text-sm text-amber-800">No hay ninguna serie de facturación creada todavía.</p>
          <button
            type="button"
            onClick={() => setOpenSerie(true)}
            className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
          >
            Crear serie
          </button>
        </div>
      )}

      <div className="mt-4">
        <DataTable columns={columns} rows={facturas} rowKey={(r) => `${r.tienda_terminal_codigo}-${r.numero}`} loading={loadingFacturas} emptyMessage="Sin facturas todavía." />
      </div>

      {openSerie && (
        <Modal title="Crear serie de facturación" onClose={() => setOpenSerie(false)}>
          <form onSubmit={handleCrearSerie} className="flex flex-col gap-4">
            <FormField label="Código de serie *">
              <TextInput required value={serieCodigo} onChange={(e) => setSerieCodigo(e.target.value)} placeholder="A" />
            </FormField>
            <FormField label="Descripción">
              <TextInput value={serieDescripcion} onChange={(e) => setSerieDescripcion(e.target.value)} placeholder="Facturación general" />
            </FormField>
            <FormField label="Dígito de control *">
              <TextInput required value={serieDigitoControl} onChange={(e) => setSerieDigitoControl(e.target.value)} />
            </FormField>
            {errorSerie && <p className="text-sm text-red-600">{errorSerie}</p>}
            <button type="submit" disabled={savingSerie} className="mt-2 rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white hover:bg-amber-700 disabled:opacity-50">
              {savingSerie ? 'Creando…' : 'Crear serie'}
            </button>
          </form>
        </Modal>
      )}

      {openFactura && (
        <Modal title="Nueva factura" onClose={() => setOpenFactura(false)} widthClass="max-w-2xl">
          <form onSubmit={handleCrearFactura} className="flex flex-col gap-4">
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
              <FormField label="Serie *">
                <SelectInput required value={serieFacturaCodigo} onChange={(e) => setSerieFacturaCodigo(e.target.value)}>
                  <option value="">— Elige —</option>
                  {series.map((s) => (
                    <option key={s.serie} value={s.serie}>
                      {s.serie} {s.descripcion ? `— ${s.descripcion}` : ''}
                    </option>
                  ))}
                </SelectInput>
              </FormField>
            </div>

            <FormField label="Descripción de la operación *">
              <TextInput required value={descripcionOperacion} onChange={(e) => setDescripcionOperacion(e.target.value)} placeholder="Venta de material de oficina" />
            </FormField>

            <div className="grid grid-cols-2 gap-4">
              <FormField label="Base imponible (€) *">
                <TextInput required type="number" step="0.01" value={baseImponible} onChange={(e) => setBaseImponible(e.target.value)} />
              </FormField>
              <FormField label="IGIC (%) *">
                <TextInput required type="number" step="0.01" value={igicPct} onChange={(e) => setIgicPct(e.target.value)} />
              </FormField>
            </div>

            <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Cuota IGIC: <span className="font-semibold text-slate-800">{cuotaIgic.toFixed(2)} €</span> · Total:{' '}
              <span className="font-semibold text-slate-800">{importeTotal.toFixed(2)} €</span>
            </div>

            {errorFactura && <p className="text-sm text-red-600">{errorFactura}</p>}
            <button type="submit" disabled={savingFactura} className="mt-2 rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50">
              {savingFactura ? 'Calculando huella y guardando…' : 'Emitir factura'}
            </button>
          </form>
        </Modal>
      )}
    </div>
  )
}
