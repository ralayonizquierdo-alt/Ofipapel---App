import { useMemo, useState } from 'react'
import { Boxes } from 'lucide-react'
import { useDatabase } from '../lib/DatabaseContext'
import DataTable, { type Column } from '../components/DataTable'
import Badge from '../components/Badge'
import { inputClass } from '../components/FormField'
import { formatDate } from '../lib/format'
import type { Lote } from '../types'

function diasHasta(iso: string): number {
  return Math.round((new Date(iso).getTime() - Date.now()) / 86400000)
}

function estadoLote(iso: string): string {
  const dias = diasHasta(iso)
  if (dias < 0) return 'Caducado'
  if (dias <= 60) return 'Bajo mínimo'
  return 'OK'
}

export default function LotesPage() {
  const { db } = useDatabase()
  const [locationFiltro, setLocationFiltro] = useState('')
  const [soloAlertas, setSoloAlertas] = useState(false)

  const productById = useMemo(() => new Map(db.products.map((p) => [p.id, p])), [db.products])
  const locationById = useMemo(() => new Map(db.locations.map((l) => [l.id, l])), [db.locations])

  const rows = db.lotes
    .filter((l) => (locationFiltro ? l.locationId === locationFiltro : true))
    .filter((l) => (soloAlertas ? diasHasta(l.fechaCaducidad) <= 60 : true))

  const totalAlertas = db.lotes.filter((l) => diasHasta(l.fechaCaducidad) <= 60).length

  const columns: Column<Lote>[] = [
    { key: 'lote', label: 'Lote', sortValue: (l) => l.lote },
    { key: 'producto', label: 'Producto', render: (l) => productById.get(l.productoId)?.nombre ?? '—', sortValue: (l) => productById.get(l.productoId)?.nombre ?? '' },
    { key: 'ubicacion', label: 'Ubicación', render: (l) => locationById.get(l.locationId)?.nombre ?? '—', sortValue: (l) => locationById.get(l.locationId)?.nombre ?? '' },
    { key: 'unidades', label: 'Unidades', align: 'right', sortValue: (l) => l.unidades },
    { key: 'caducidad', label: 'Caducidad', render: (l) => formatDate(l.fechaCaducidad), sortValue: (l) => l.fechaCaducidad },
    { key: 'estado', label: 'Estado', render: (l) => <Badge label={estadoLote(l.fechaCaducidad)} />, sortValue: (l) => diasHasta(l.fechaCaducidad) },
  ]

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
            <Boxes size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Lotes y caducidad</h1>
        </div>
        <Badge label="Activo (Fase 2)" />
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">
        {db.lotes.length} lotes trazados · {totalAlertas} caducan en menos de 60 días
      </p>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(l) => l.id}
        searchableText={(l) => `${l.lote} ${productById.get(l.productoId)?.nombre ?? ''}`}
        pageSize={14}
        filters={
          <>
            <select value={locationFiltro} onChange={(e) => setLocationFiltro(e.target.value)} className={`${inputClass} max-w-[200px]`}>
              <option value="">Todas las ubicaciones</option>
              {db.locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.nombre}
                </option>
              ))}
            </select>
            <label className="flex items-center gap-2 text-sm text-slate-600 px-1">
              <input type="checkbox" checked={soloAlertas} onChange={(e) => setSoloAlertas(e.target.checked)} />
              Solo próximos a caducar
            </label>
          </>
        }
      />
    </div>
  )
}
