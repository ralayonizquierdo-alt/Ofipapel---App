import { useMemo } from 'react'
import { Landmark, CheckCircle2, Clock } from 'lucide-react'
import { useDatabase } from '../lib/DatabaseContext'
import Badge from '../components/Badge'
import { formatEUR } from '../lib/format'

function quarterOf(iso: string): string {
  const month = Number(iso.slice(5, 7))
  const year = iso.slice(0, 4)
  const q = Math.ceil(month / 3)
  return `${year} T${q}`
}

export default function FiscalidadPage() {
  const { db } = useDatabase()

  const porTrimestre = useMemo(() => {
    const map = new Map<string, { repercutido: number; soportado: number }>()
    db.invoices.forEach((inv) => {
      const q = quarterOf(inv.fecha)
      const acc = map.get(q) ?? { repercutido: 0, soportado: 0 }
      acc.repercutido += inv.iva
      map.set(q, acc)
    })
    db.purchases
      .filter((p) => p.estado === 'Recibido')
      .forEach((p) => {
        const base = p.lineas.reduce((sum, l) => sum + l.cantidad * l.precioUnit, 0)
        const iva = p.total - base
        const q = quarterOf(p.fecha)
        const acc = map.get(q) ?? { repercutido: 0, soportado: 0 }
        acc.soportado += iva
        map.set(q, acc)
      })
    return [...map.entries()]
      .map(([q, v]) => ({ trimestre: q, ...v, resultado: v.repercutido - v.soportado }))
      .sort((a, b) => (a.trimestre < b.trimestre ? 1 : -1))
  }, [db.invoices, db.purchases])

  const cumplimiento = [
    { nombre: 'Facturación electrónica', estado: 'Activo' as const },
    { nombre: 'Veri*Factu', estado: 'Pendiente' as const },
    { nombre: 'Suministro Inmediato de Información (SII)', estado: 'Pendiente' as const },
  ]

  return (
    <div>
      <div className="flex items-start justify-between mb-1">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center">
            <Landmark size={20} className="text-slate-700" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Fiscalidad</h1>
        </div>
        <Badge label="Activo (Fase 2)" />
      </div>
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">IVA trimestral y estado de cumplimiento normativo</p>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium text-slate-700">IVA por trimestre (modelo 303)</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="text-left px-4 py-2">Trimestre</th>
              <th className="text-right px-4 py-2">IVA repercutido</th>
              <th className="text-right px-4 py-2">IVA soportado</th>
              <th className="text-right px-4 py-2">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {porTrimestre.map((t) => (
              <tr key={t.trimestre} className="border-b border-slate-100 last:border-0">
                <td className="px-4 py-2.5">{t.trimestre}</td>
                <td className="px-4 py-2.5 text-right">{formatEUR(t.repercutido)}</td>
                <td className="px-4 py-2.5 text-right">{formatEUR(t.soportado)}</td>
                <td className={`px-4 py-2.5 text-right font-medium ${t.resultado >= 0 ? 'text-red-600' : 'text-emerald-600'}`}>
                  {t.resultado >= 0 ? `${formatEUR(t.resultado)} a ingresar` : `${formatEUR(Math.abs(t.resultado))} a devolver`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium text-slate-700">Estado de cumplimiento normativo</div>
        {cumplimiento.map((c) => (
          <div key={c.nombre} className="flex items-center justify-between px-4 py-3 border-b border-slate-100 last:border-0">
            <span className="text-sm text-slate-700">{c.nombre}</span>
            <span className={`inline-flex items-center gap-1.5 text-xs font-medium px-2 py-0.5 rounded-full ${c.estado === 'Activo' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
              {c.estado === 'Activo' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
              {c.estado}
            </span>
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-400 mt-3">
        Veri*Factu y SII se muestran como pendientes de implementar — su desarrollo debe priorizarse antes de operar en producción, conforme a la normativa vigente en España.
      </p>
    </div>
  )
}
