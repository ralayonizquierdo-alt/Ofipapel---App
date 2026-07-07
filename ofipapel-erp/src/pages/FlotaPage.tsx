import { useEffect, useMemo, useState } from 'react'
import {
  Truck,
  Plus,
  Trash2,
  X,
  Upload,
  Wrench,
  CreditCard,
  CalendarClock,
  MapPin,
  AlertTriangle,
  FileText,
} from 'lucide-react'
import { useDatabase, useCollection } from '../lib/DatabaseContext'
import DataTable, { type Column } from '../components/DataTable'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import StatCard from '../components/StatCard'
import FormField, { inputClass } from '../components/FormField'
import { formatEUR, formatDate } from '../lib/format'
import { vehiclePlaceholderImageFor } from '../lib/placeholderImage'
import { ZONE_COORDS, ISLA_POR_ZONA, ISLAND_BOUNDS } from '../lib/geo'
import type { Vehicle, VehicleType, VehicleEstado, TipoGastoVehiculo, EstadoCitaVehiculo } from '../types'

const TIPOS_GASTO: TipoGastoVehiculo[] = ['Revisión periódica', 'ITV', 'Reparación', 'Neumáticos', 'Combustible', 'Seguro', 'Multa', 'Otros']

function diasHasta(fechaIso: string): number {
  return Math.round((new Date(fechaIso).getTime() - Date.now()) / 86400000)
}

function Thumbnail({ src, size = 32 }: { src?: string; size?: number }) {
  return <img src={src} alt="" style={{ width: size, height: size }} className="rounded-md object-cover border border-slate-200 bg-slate-50" />
}

// Bounding box aproximado de las islas donde opera la flota, para proyectar lat/lon en el lienzo del mapa.
const MAP_BOUNDS = { lonMin: -16.95, lonMax: -13.3, latMin: 27.55, latMax: 29.35 }
const MAP_W = 420
const MAP_H = 260

function project(lat: number, lon: number): { x: number; y: number } {
  const x = ((lon - MAP_BOUNDS.lonMin) / (MAP_BOUNDS.lonMax - MAP_BOUNDS.lonMin)) * (MAP_W - 40) + 20
  const y = MAP_H - (((lat - MAP_BOUNDS.latMin) / (MAP_BOUNDS.latMax - MAP_BOUNDS.latMin)) * (MAP_H - 40) + 20)
  return { x, y }
}

const ISLAS = [
  { nombre: 'Tenerife', lat: 28.27, lon: -16.62, rx: 60, ry: 42 },
  { nombre: 'Gran Canaria', lat: 27.98, lon: -15.6, rx: 42, ry: 38 },
  { nombre: 'Lanzarote', lat: 29.04, lon: -13.63, rx: 32, ry: 22 },
  { nombre: 'Fuerteventura', lat: 28.42, lon: -14.0, rx: 30, ry: 45 },
]

function FlotaMapa({ vehicles }: { vehicles: Vehicle[] }) {
  const [positions, setPositions] = useState(() => new Map(vehicles.map((v) => [v.id, { lat: v.ubicacion.lat, lon: v.ubicacion.lon, t: Date.now() }])))
  const [, setTick] = useState(0)

  useEffect(() => {
    const moveInterval = setInterval(() => {
      setPositions((prev) => {
        const next = new Map(prev)
        vehicles.forEach((v) => {
          if (v.estado !== 'En ruta') return
          const cur = next.get(v.id) ?? { lat: v.ubicacion.lat, lon: v.ubicacion.lon, t: Date.now() }
          next.set(v.id, { lat: cur.lat + (Math.random() - 0.5) * 0.01, lon: cur.lon + (Math.random() - 0.5) * 0.01, t: Date.now() })
        })
        return next
      })
    }, 4000)
    const clockInterval = setInterval(() => setTick((n) => n + 1), 1000)
    return () => {
      clearInterval(moveInterval)
      clearInterval(clockInterval)
    }
  }, [vehicles])

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium text-slate-700">Ubicación en vivo de la flota</div>
        <div className="flex items-center gap-3 text-xs text-slate-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-sky-500 inline-block" /> Furgón
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-purple-500 inline-block" /> Coche
          </span>
        </div>
      </div>
      <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} className="w-full h-auto">
        <rect width={MAP_W} height={MAP_H} rx="12" fill="#eff6ff" />
        {ISLAS.map((isla) => {
          const { x, y } = project(isla.lat, isla.lon)
          return (
            <g key={isla.nombre}>
              <ellipse cx={x} cy={y} rx={isla.rx} ry={isla.ry} fill="#dbeafe" stroke="#bfdbfe" />
              <text x={x} y={y + isla.ry + 12} textAnchor="middle" fontSize="9" fill="#64748b">
                {isla.nombre}
              </text>
            </g>
          )
        })}
        {vehicles.map((v) => {
          const pos = positions.get(v.id) ?? { lat: v.ubicacion.lat, lon: v.ubicacion.lon, t: Date.now() }
          const { x, y } = project(pos.lat, pos.lon)
          const color = v.tipo === 'Furgón de reparto' ? '#0284c7' : '#9333ea'
          const segsAgo = Math.max(0, Math.round((Date.now() - pos.t) / 1000))
          return (
            <g key={v.id}>
              {v.estado === 'En ruta' && <circle cx={x} cy={y} r="7" fill={color} opacity="0.25" />}
              <circle cx={x} cy={y} r="4" fill={v.estado === 'En ruta' ? color : '#94a3b8'}>
                <title>
                  {v.matricula} · {v.ubicacion.zona} · {v.estado} · actualizado hace {segsAgo}s
                </title>
              </circle>
            </g>
          )
        })}
      </svg>
      <p className="text-xs text-slate-400 mt-1">Ubicación simulada con fines de demostración — se actualiza cada pocos segundos.</p>
    </div>
  )
}

const ISLA_W = 320
const ISLA_H = 260

/** Mapa centrado en la isla del vehículo (su ubicación nunca sale de ahí), con las zonas de esa isla como referencia. */
function IslaMapa({ vehicle }: { vehicle: Vehicle }) {
  const isla = ISLA_POR_ZONA[vehicle.ubicacion.zona] ?? 'Tenerife'
  const bounds = ISLAND_BOUNDS[isla]
  const [pos, setPos] = useState({ lat: vehicle.ubicacion.lat, lon: vehicle.ubicacion.lon, t: Date.now() })
  const [, setTick] = useState(0)

  useEffect(() => {
    setPos({ lat: vehicle.ubicacion.lat, lon: vehicle.ubicacion.lon, t: Date.now() })
    if (vehicle.estado !== 'En ruta') return
    const moveInterval = setInterval(() => {
      setPos((cur) => ({ lat: cur.lat + (Math.random() - 0.5) * 0.006, lon: cur.lon + (Math.random() - 0.5) * 0.006, t: Date.now() }))
    }, 4000)
    const clockInterval = setInterval(() => setTick((n) => n + 1), 1000)
    return () => {
      clearInterval(moveInterval)
      clearInterval(clockInterval)
    }
  }, [vehicle.id, vehicle.estado, vehicle.ubicacion.lat, vehicle.ubicacion.lon])

  function projectIsla(lat: number, lon: number): { x: number; y: number } {
    const x = ((lon - bounds.lonMin) / (bounds.lonMax - bounds.lonMin)) * (ISLA_W - 50) + 25
    const y = ISLA_H - (((lat - bounds.latMin) / (bounds.latMax - bounds.latMin)) * (ISLA_H - 50) + 25)
    return { x, y }
  }

  const zonasDeLaIsla = Object.entries(ISLA_POR_ZONA).filter(([, i]) => i === isla).map(([zona]) => zona)
  const { x, y } = projectIsla(pos.lat, pos.lon)
  const color = vehicle.tipo === 'Furgón de reparto' ? '#0284c7' : '#9333ea'
  const segsAgo = Math.max(0, Math.round((Date.now() - pos.t) / 1000))

  return (
    <div className="bg-white border border-slate-200 rounded-xl p-4">
      <div className="text-sm font-medium text-slate-700 mb-2">Isla de {isla} — posición de {vehicle.matricula}</div>
      <svg viewBox={`0 0 ${ISLA_W} ${ISLA_H}`} className="w-full h-auto">
        <rect width={ISLA_W} height={ISLA_H} rx="12" fill="#eff6ff" />
        <ellipse cx={ISLA_W / 2} cy={ISLA_H / 2} rx={(ISLA_W - 50) / 2} ry={(ISLA_H - 50) / 2} fill="#dbeafe" stroke="#bfdbfe" />
        {zonasDeLaIsla.map((zona) => {
          const coords = ZONE_COORDS[zona]
          if (!coords) return null
          const p = projectIsla(coords.lat, coords.lon)
          return (
            <g key={zona}>
              <circle cx={p.x} cy={p.y} r="3" fill="#94a3b8" />
              <text x={p.x} y={p.y - 7} textAnchor="middle" fontSize="8" fill="#64748b">
                {zona}
              </text>
            </g>
          )
        })}
        {vehicle.estado === 'En ruta' && <circle cx={x} cy={y} r="9" fill={color} opacity="0.25" />}
        <circle cx={x} cy={y} r="5" fill={vehicle.estado === 'En ruta' ? color : '#94a3b8'} stroke="white" strokeWidth="1.5">
          <title>
            {vehicle.matricula} · {vehicle.ubicacion.zona} · {vehicle.estado} · actualizado hace {segsAgo}s
          </title>
        </circle>
      </svg>
      <p className="text-xs text-slate-400 mt-1">
        Ubicación simulada con fines de demostración — la posición real de este vehículo siempre está dentro de la isla de {isla}.
      </p>
    </div>
  )
}

const emptyForm = {
  tipo: 'Furgón de reparto' as VehicleType,
  marca: '',
  modelo: '',
  anio: '2024',
  matricula: '',
  fotoUrl: '',
  comercialId: '',
  kilometraje: '0',
  estado: 'En base' as VehicleEstado,
  fechaAlta: new Date().toISOString().slice(0, 10),
  itvUltima: new Date().toISOString().slice(0, 10),
  itvProxima: new Date().toISOString().slice(0, 10),
  seguroCompania: '',
  seguroPoliza: '',
  seguroVencimiento: new Date().toISOString().slice(0, 10),
  financiacionActiva: false,
  cuotaMensual: '0',
  cuotasPagadas: '0',
  cuotasTotales: '0',
}

const emptyGasto = { fecha: new Date().toISOString().slice(0, 10), tipo: 'Combustible' as TipoGastoVehiculo, descripcion: '', km: '', taller: '', importe: '0' }
const emptyCita = { fecha: new Date().toISOString().slice(0, 10), tipo: 'Revisión periódica' as TipoGastoVehiculo, descripcion: '' }

const TABS_NEW = [
  { id: 'general', label: 'General' },
  { id: 'documentacion', label: 'Documentación' },
  { id: 'financiacion', label: 'Financiación' },
] as const
const TABS_EXISTING = [
  ...TABS_NEW,
  { id: 'mantenimiento', label: 'Mantenimiento y gastos' },
  { id: 'citas', label: 'Citas' },
  { id: 'ubicacion', label: 'Ubicación' },
] as const

type TabId = (typeof TABS_EXISTING)[number]['id']

export default function FlotaPage() {
  const { db } = useDatabase()
  const { items: vehicles, add, update, remove } = useCollection('vehicles')
  const { items: gastos, add: addGasto } = useCollection('gastosVehiculos')
  const { items: citas, add: addCita, update: updateCita } = useCollection('citasVehiculos')

  const [selected, setSelected] = useState<Vehicle | null>(null)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [tipoFiltro, setTipoFiltro] = useState<'' | VehicleType>('')
  const [activeTab, setActiveTab] = useState<TabId>('general')
  const [gastoForm, setGastoForm] = useState(emptyGasto)
  const [citaForm, setCitaForm] = useState(emptyCita)

  const repById = useMemo(() => new Map(db.salesReps.map((r) => [r.id, r])), [db.salesReps])

  const stats = useMemo(() => {
    const enRuta = vehicles.filter((v) => v.estado === 'En ruta').length
    const itvProxima30 = vehicles.filter((v) => diasHasta(v.itvProxima) <= 30).length
    const gastoUltimoAnio = gastos.reduce((sum, g) => sum + g.importe, 0)
    const cuotaMensualTotal = vehicles.reduce((sum, v) => sum + (v.financiacion.activa ? v.financiacion.cuotaMensual : 0), 0)
    return { enRuta, itvProxima30, gastoUltimoAnio, cuotaMensualTotal }
  }, [vehicles, gastos])

  const filtered = tipoFiltro ? vehicles.filter((v) => v.tipo === tipoFiltro) : vehicles

  const columns: Column<Vehicle>[] = [
    { key: 'foto', label: '', render: (v) => <Thumbnail src={v.fotoUrl} /> },
    { key: 'tipo', label: 'Tipo', render: (v) => <Badge label={v.tipo} />, sortValue: (v) => v.tipo },
    { key: 'matricula', label: 'Matrícula', render: (v) => <span className="font-mono">{v.matricula}</span>, sortValue: (v) => v.matricula },
    { key: 'modelo', label: 'Marca / Modelo', render: (v) => `${v.marca} ${v.modelo} (${v.anio})`, sortValue: (v) => v.marca },
    { key: 'asignado', label: 'Asignado a', render: (v) => repById.get(v.comercialId)?.nombre ?? '—', sortValue: (v) => repById.get(v.comercialId)?.nombre ?? '' },
    { key: 'km', label: 'Kilometraje', align: 'right', render: (v) => `${v.kilometraje.toLocaleString('es-ES')} km`, sortValue: (v) => v.kilometraje },
    { key: 'estado', label: 'Estado', render: (v) => <Badge label={v.estado} /> },
    {
      key: 'itv',
      label: 'Próxima ITV',
      render: (v) => {
        const dias = diasHasta(v.itvProxima)
        return (
          <span className={dias < 0 ? 'text-red-600 font-medium' : dias <= 30 ? 'text-orange-600 font-medium' : 'text-slate-600'}>
            {formatDate(v.itvProxima)}
          </span>
        )
      },
      sortValue: (v) => v.itvProxima,
    },
  ]

  function openEdit(v: Vehicle) {
    setSelected(v)
    setForm({
      tipo: v.tipo,
      marca: v.marca,
      modelo: v.modelo,
      anio: String(v.anio),
      matricula: v.matricula,
      fotoUrl: v.fotoUrl ?? '',
      comercialId: v.comercialId,
      kilometraje: String(v.kilometraje),
      estado: v.estado,
      fechaAlta: v.fechaAlta,
      itvUltima: v.itvUltima,
      itvProxima: v.itvProxima,
      seguroCompania: v.seguroCompania,
      seguroPoliza: v.seguroPoliza,
      seguroVencimiento: v.seguroVencimiento,
      financiacionActiva: v.financiacion.activa,
      cuotaMensual: String(v.financiacion.cuotaMensual),
      cuotasPagadas: String(v.financiacion.cuotasPagadas),
      cuotasTotales: String(v.financiacion.cuotasTotales),
    })
    setActiveTab('general')
  }

  function openCreate() {
    setForm({ ...emptyForm, comercialId: db.salesReps[0]?.id ?? '' })
    setActiveTab('general')
    setCreating(true)
  }

  function closeModal() {
    setSelected(null)
    setCreating(false)
    setGastoForm(emptyGasto)
    setCitaForm(emptyCita)
  }

  function handleImageChange(file: File | undefined) {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => setForm((f) => ({ ...f, fotoUrl: String(reader.result) }))
    reader.readAsDataURL(file)
  }

  function save() {
    const zona = repById.get(form.comercialId)?.zona ?? db.locations[0]?.zona ?? ''
    const payload = {
      tipo: form.tipo,
      marca: form.marca,
      modelo: form.modelo,
      anio: Number(form.anio) || 2024,
      matricula: form.matricula,
      fotoUrl: form.fotoUrl || vehiclePlaceholderImageFor(form.tipo, form.matricula || 'nuevo'),
      comercialId: form.comercialId,
      kilometraje: Number(form.kilometraje) || 0,
      estado: form.estado,
      fechaAlta: form.fechaAlta,
      itvUltima: form.itvUltima,
      itvProxima: form.itvProxima,
      seguroCompania: form.seguroCompania,
      seguroPoliza: form.seguroPoliza,
      seguroVencimiento: form.seguroVencimiento,
      financiacion: {
        activa: form.financiacionActiva,
        cuotaMensual: Number(form.cuotaMensual) || 0,
        cuotasPagadas: Number(form.cuotasPagadas) || 0,
        cuotasTotales: Number(form.cuotasTotales) || 0,
      },
    }
    if (selected) {
      update(selected.id, payload)
    } else {
      add({
        id: `veh-${Date.now()}`,
        ...payload,
        ubicacion: { lat: 28.3, lon: -16.0, zona, actualizado: new Date().toISOString() },
      })
    }
    closeModal()
  }

  function handleDelete() {
    if (!selected) return
    remove(selected.id)
    closeModal()
  }

  function guardarGasto() {
    if (!selected) return
    addGasto({
      id: `gv-${Date.now()}`,
      vehiculoId: selected.id,
      fecha: gastoForm.fecha,
      tipo: gastoForm.tipo,
      descripcion: gastoForm.descripcion,
      km: gastoForm.km ? Number(gastoForm.km) : undefined,
      taller: gastoForm.taller || undefined,
      importe: Number(gastoForm.importe) || 0,
    })
    setGastoForm(emptyGasto)
  }

  function guardarCita() {
    if (!selected) return
    addCita({ id: `cv-${Date.now()}`, vehiculoId: selected.id, fecha: citaForm.fecha, tipo: citaForm.tipo, descripcion: citaForm.descripcion, estado: 'Pendiente' })
    setCitaForm(emptyCita)
  }

  function toggleCita(citaId: string, estado: EstadoCitaVehiculo) {
    updateCita(citaId, { estado: estado === 'Pendiente' ? 'Completada' : 'Pendiente' })
  }

  const modalOpen = selected !== null || creating
  const tabs = selected ? TABS_EXISTING : TABS_NEW
  const gastosVehiculo = selected ? gastos.filter((g) => g.vehiculoId === selected.id).sort((a, b) => (a.fecha < b.fecha ? 1 : -1)) : []
  const citasVehiculo = selected ? citas.filter((c) => c.vehiculoId === selected.id).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)) : []
  const gastoTotalVehiculo = gastosVehiculo.reduce((sum, g) => sum + g.importe, 0)
  const importePendienteFinanciacion = (Number(form.cuotasTotales) - Number(form.cuotasPagadas)) * Number(form.cuotaMensual)
  const itvDias = selected ? diasHasta(selected.itvProxima) : 0

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
            <Truck size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Flota de vehículos</h1>
        </div>
        <Badge label="Activo (Fase 2)" />
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">
        Control de los {vehicles.length} vehículos de la empresa: {vehicles.filter((v) => v.tipo === 'Furgón de reparto').length} furgones de reparto y{' '}
        {vehicles.filter((v) => v.tipo === 'Coche comercial').length} coches comerciales
      </p>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <StatCard icon={Truck} label="Vehículos en ruta" value={`${stats.enRuta} / ${vehicles.length}`} tone="good" />
        <StatCard icon={AlertTriangle} label="ITV en ≤ 30 días" value={String(stats.itvProxima30)} tone={stats.itvProxima30 > 0 ? 'warn' : 'default'} />
        <StatCard icon={Wrench} label="Gasto histórico registrado" value={formatEUR(stats.gastoUltimoAnio)} />
        <StatCard icon={CreditCard} label="Cuotas mensuales activas" value={formatEUR(stats.cuotaMensualTotal)} />
      </div>

      <div className="mb-6">
        <FlotaMapa vehicles={vehicles} />
      </div>

      <DataTable
        columns={columns}
        rows={filtered}
        rowKey={(v) => v.id}
        searchableText={(v) => `${v.matricula} ${v.marca} ${v.modelo} ${repById.get(v.comercialId)?.nombre ?? ''}`}
        onRowClick={openEdit}
        pageSize={14}
        filters={
          <select value={tipoFiltro} onChange={(e) => setTipoFiltro(e.target.value as '' | VehicleType)} className={`${inputClass} max-w-[220px]`}>
            <option value="">Todos los vehículos</option>
            <option value="Furgón de reparto">Furgones de reparto</option>
            <option value="Coche comercial">Coches comerciales</option>
          </select>
        }
        actions={
          <button onClick={openCreate} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800">
            <Plus size={15} /> Nuevo vehículo
          </button>
        }
      />

      {modalOpen && (
        <Modal
          title={selected ? `${selected.marca} ${selected.modelo} · ${selected.matricula}` : 'Nuevo vehículo'}
          subtitle={selected ? repById.get(selected.comercialId)?.nombre : undefined}
          wide
          onClose={closeModal}
          footer={
            <>
              {selected && (
                <button onClick={handleDelete} className="mr-auto flex items-center gap-1.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg">
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
          <div className="flex items-center gap-1 mb-4 border-b border-slate-100 -mt-1 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 -mb-px ${
                  activeTab === t.id ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-400 hover:text-slate-600'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === 'general' && (
            <div>
              <div className="flex items-center gap-3 mb-4">
                <Thumbnail src={form.fotoUrl || vehiclePlaceholderImageFor(form.tipo, form.matricula || 'preview')} size={64} />
                <div>
                  <label className="flex items-center gap-1.5 px-3 py-2 text-sm border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50 w-fit">
                    <Upload size={14} />
                    {form.fotoUrl ? 'Cambiar foto' : 'Añadir foto'}
                    <input type="file" accept="image/*" className="hidden" onChange={(e) => handleImageChange(e.target.files?.[0])} />
                  </label>
                  {form.fotoUrl && (
                    <button onClick={() => setForm((f) => ({ ...f, fotoUrl: '' }))} className="flex items-center gap-1 text-xs text-slate-400 hover:text-red-600 mt-1.5">
                      <X size={12} /> Quitar foto
                    </button>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-x-4">
                <FormField label="Tipo de vehículo">
                  <select className={inputClass} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as VehicleType })}>
                    <option value="Furgón de reparto">Furgón de reparto</option>
                    <option value="Coche comercial">Coche comercial</option>
                  </select>
                </FormField>
                <FormField label="Matrícula">
                  <input className={`${inputClass} font-mono`} value={form.matricula} onChange={(e) => setForm({ ...form, matricula: e.target.value })} />
                </FormField>
              </div>
              <div className="grid grid-cols-3 gap-x-4">
                <FormField label="Marca">
                  <input className={inputClass} value={form.marca} onChange={(e) => setForm({ ...form, marca: e.target.value })} />
                </FormField>
                <FormField label="Modelo">
                  <input className={inputClass} value={form.modelo} onChange={(e) => setForm({ ...form, modelo: e.target.value })} />
                </FormField>
                <FormField label="Año">
                  <input type="number" className={inputClass} value={form.anio} onChange={(e) => setForm({ ...form, anio: e.target.value })} />
                </FormField>
              </div>
              <div className="grid grid-cols-3 gap-x-4">
                <FormField label="Asignado a">
                  <select className={inputClass} value={form.comercialId} onChange={(e) => setForm({ ...form, comercialId: e.target.value })}>
                    {db.salesReps.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.nombre}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Kilometraje">
                  <input type="number" className={inputClass} value={form.kilometraje} onChange={(e) => setForm({ ...form, kilometraje: e.target.value })} />
                </FormField>
                <FormField label="Estado">
                  <select className={inputClass} value={form.estado} onChange={(e) => setForm({ ...form, estado: e.target.value as VehicleEstado })}>
                    <option value="En ruta">En ruta</option>
                    <option value="En base">En base</option>
                    <option value="Taller">Taller</option>
                  </select>
                </FormField>
              </div>
              <FormField label="Fecha de alta en la flota">
                <input type="date" className={inputClass} value={form.fechaAlta} onChange={(e) => setForm({ ...form, fechaAlta: e.target.value })} />
              </FormField>
            </div>
          )}

          {activeTab === 'documentacion' && (
            <div>
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 flex items-center gap-1.5">
                <FileText size={13} /> ITV
              </div>
              <div className="grid grid-cols-2 gap-x-4">
                <FormField label="Última ITV">
                  <input type="date" className={inputClass} value={form.itvUltima} onChange={(e) => setForm({ ...form, itvUltima: e.target.value })} />
                </FormField>
                <FormField label="Próxima ITV">
                  <input type="date" className={inputClass} value={form.itvProxima} onChange={(e) => setForm({ ...form, itvProxima: e.target.value })} />
                </FormField>
              </div>
              {selected && (itvDias < 0 ? (
                <p className="text-xs text-red-600 mb-3 flex items-center gap-1">
                  <AlertTriangle size={12} /> ITV vencida hace {Math.abs(itvDias)} días.
                </p>
              ) : itvDias <= 30 ? (
                <p className="text-xs text-orange-600 mb-3 flex items-center gap-1">
                  <AlertTriangle size={12} /> ITV próxima en {itvDias} días.
                </p>
              ) : null)}

              <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2 mt-3 flex items-center gap-1.5">
                <FileText size={13} /> Seguro
              </div>
              <div className="grid grid-cols-3 gap-x-4">
                <FormField label="Compañía">
                  <input className={inputClass} value={form.seguroCompania} onChange={(e) => setForm({ ...form, seguroCompania: e.target.value })} />
                </FormField>
                <FormField label="Nº de póliza">
                  <input className={inputClass} value={form.seguroPoliza} onChange={(e) => setForm({ ...form, seguroPoliza: e.target.value })} />
                </FormField>
                <FormField label="Vencimiento">
                  <input type="date" className={inputClass} value={form.seguroVencimiento} onChange={(e) => setForm({ ...form, seguroVencimiento: e.target.value })} />
                </FormField>
              </div>
            </div>
          )}

          {activeTab === 'financiacion' && (
            <div>
              <label className="flex items-center gap-2 text-sm text-slate-700 mb-3">
                <input type="checkbox" checked={form.financiacionActiva} onChange={(e) => setForm({ ...form, financiacionActiva: e.target.checked })} />
                Vehículo con financiación / renting activo
              </label>
              {form.financiacionActiva && (
                <>
                  <div className="grid grid-cols-3 gap-x-4">
                    <FormField label="Cuota mensual (€)">
                      <input type="number" step="0.01" className={inputClass} value={form.cuotaMensual} onChange={(e) => setForm({ ...form, cuotaMensual: e.target.value })} />
                    </FormField>
                    <FormField label="Cuotas pagadas">
                      <input type="number" className={inputClass} value={form.cuotasPagadas} onChange={(e) => setForm({ ...form, cuotasPagadas: e.target.value })} />
                    </FormField>
                    <FormField label="Cuotas totales">
                      <input type="number" className={inputClass} value={form.cuotasTotales} onChange={(e) => setForm({ ...form, cuotasTotales: e.target.value })} />
                    </FormField>
                  </div>
                  <div className="mt-1">
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>
                        {form.cuotasPagadas} / {form.cuotasTotales} cuotas pagadas
                      </span>
                      <span className="font-medium text-slate-700">Importe pendiente: {formatEUR(Math.max(0, importePendienteFinanciacion))}</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{ width: `${Math.min(100, (Number(form.cuotasPagadas) / Math.max(1, Number(form.cuotasTotales))) * 100)}%` }}
                      />
                    </div>
                  </div>
                </>
              )}
              {!form.financiacionActiva && <p className="text-sm text-slate-400">Vehículo en propiedad, sin cuotas pendientes.</p>}
            </div>
          )}

          {activeTab === 'mantenimiento' && selected && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium text-slate-400 uppercase tracking-wide">Histórico de mantenimiento y gastos</div>
                <div className="text-sm font-medium text-slate-700">Total: {formatEUR(gastoTotalVehiculo)}</div>
              </div>
              <div className="border border-slate-200 rounded-lg overflow-hidden mb-4 max-h-64 overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-slate-50">
                    <tr className="border-b border-slate-200 text-xs uppercase text-slate-500">
                      <th className="text-left px-3 py-2">Fecha</th>
                      <th className="text-left px-3 py-2">Tipo</th>
                      <th className="text-left px-3 py-2">Descripción</th>
                      <th className="text-right px-3 py-2">Km</th>
                      <th className="text-right px-3 py-2">Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gastosVehiculo.map((g) => (
                      <tr key={g.id} className="border-b border-slate-100 last:border-0">
                        <td className="px-3 py-2 text-slate-600">{formatDate(g.fecha)}</td>
                        <td className="px-3 py-2">
                          <Badge label={g.tipo} />
                        </td>
                        <td className="px-3 py-2 text-slate-700">
                          {g.descripcion}
                          {g.taller && <span className="text-slate-400"> · {g.taller}</span>}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500">{g.km ? g.km.toLocaleString('es-ES') : '—'}</td>
                        <td className="px-3 py-2 text-right font-medium">{formatEUR(g.importe)}</td>
                      </tr>
                    ))}
                    {gastosVehiculo.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-6 text-center text-slate-400">
                          Sin gastos registrados.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Añadir gasto</div>
              <div className="grid grid-cols-5 gap-x-3 items-end">
                <FormField label="Fecha">
                  <input type="date" className={inputClass} value={gastoForm.fecha} onChange={(e) => setGastoForm({ ...gastoForm, fecha: e.target.value })} />
                </FormField>
                <FormField label="Tipo">
                  <select className={inputClass} value={gastoForm.tipo} onChange={(e) => setGastoForm({ ...gastoForm, tipo: e.target.value as TipoGastoVehiculo })}>
                    {TIPOS_GASTO.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Descripción">
                  <input className={inputClass} value={gastoForm.descripcion} onChange={(e) => setGastoForm({ ...gastoForm, descripcion: e.target.value })} />
                </FormField>
                <FormField label="Km">
                  <input type="number" className={inputClass} value={gastoForm.km} onChange={(e) => setGastoForm({ ...gastoForm, km: e.target.value })} />
                </FormField>
                <FormField label="Importe (€)">
                  <input type="number" step="0.01" className={inputClass} value={gastoForm.importe} onChange={(e) => setGastoForm({ ...gastoForm, importe: e.target.value })} />
                </FormField>
              </div>
              <button onClick={guardarGasto} disabled={!gastoForm.descripcion} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-40">
                <Plus size={14} /> Añadir gasto
              </button>
            </div>
          )}

          {activeTab === 'citas' && selected && (
            <div>
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Próximas citas</div>
              <div className="border border-slate-200 rounded-lg overflow-hidden mb-4">
                {citasVehiculo.map((c) => (
                  <div key={c.id} className="flex items-center justify-between px-3 py-2.5 border-b border-slate-100 last:border-0 text-sm">
                    <div className="flex items-center gap-2">
                      <CalendarClock size={14} className="text-slate-400" />
                      <span className="text-slate-700">{formatDate(c.fecha)}</span>
                      <Badge label={c.tipo} />
                      <span className="text-slate-500">{c.descripcion}</span>
                    </div>
                    <button onClick={() => toggleCita(c.id, c.estado)} className="shrink-0">
                      <Badge label={c.estado} />
                    </button>
                  </div>
                ))}
                {citasVehiculo.length === 0 && <div className="px-3 py-6 text-center text-slate-400 text-sm">Sin citas programadas.</div>}
              </div>
              <div className="text-xs font-medium text-slate-400 uppercase tracking-wide mb-2">Añadir cita</div>
              <div className="grid grid-cols-3 gap-x-3 items-end">
                <FormField label="Fecha">
                  <input type="date" className={inputClass} value={citaForm.fecha} onChange={(e) => setCitaForm({ ...citaForm, fecha: e.target.value })} />
                </FormField>
                <FormField label="Tipo">
                  <select className={inputClass} value={citaForm.tipo} onChange={(e) => setCitaForm({ ...citaForm, tipo: e.target.value as TipoGastoVehiculo })}>
                    {TIPOS_GASTO.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </FormField>
                <FormField label="Descripción">
                  <input className={inputClass} value={citaForm.descripcion} onChange={(e) => setCitaForm({ ...citaForm, descripcion: e.target.value })} />
                </FormField>
              </div>
              <button onClick={guardarCita} disabled={!citaForm.descripcion} className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-slate-900 rounded-lg hover:bg-slate-800 disabled:opacity-40">
                <Plus size={14} /> Añadir cita
              </button>
            </div>
          )}

          {activeTab === 'ubicacion' && selected && (
            <div>
              <div className="flex items-center gap-2 mb-3 text-sm text-slate-700">
                <MapPin size={15} className="text-slate-400" />
                Zona habitual: <strong>{selected.ubicacion.zona}</strong>
              </div>
              <p className="text-xs text-slate-400 mb-3">
                Última posición conocida: {selected.ubicacion.lat.toFixed(4)}, {selected.ubicacion.lon.toFixed(4)} · simulada con fines de demostración.
              </p>
              <IslaMapa vehicle={selected} />
            </div>
          )}
        </Modal>
      )}
    </div>
  )
}
