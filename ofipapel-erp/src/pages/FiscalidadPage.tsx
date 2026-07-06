import { useMemo, useState } from 'react'
import { Landmark, CheckCircle2, Clock, QrCode, Send } from 'lucide-react'
import QRCode from 'qrcode'
import { useDatabase, useCollection } from '../lib/DatabaseContext'
import { useVerifactuChain } from '../lib/useVerifactuChain'
import { VERIFACTU_EMISOR_NIF, VERIFACTU_EMISOR_NOMBRE, verifactuQrUrl } from '../lib/verifactu'
import DataTable, { type Column } from '../components/DataTable'
import Modal from '../components/Modal'
import Badge from '../components/Badge'
import { formatEUR, formatDate } from '../lib/format'
import type { Invoice } from '../types'

function quarterOf(iso: string): string {
  const month = Number(iso.slice(5, 7))
  const year = iso.slice(0, 4)
  const q = Math.ceil(month / 3)
  return `${year} T${q}`
}

function truncateHash(hash: string): string {
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`
}

export default function FiscalidadPage() {
  const { db } = useDatabase()
  const { items: envios, add: addEnvio, update: updateEnvio } = useCollection('verifactuEnvios')
  const chain = useVerifactuChain()
  const [selected, setSelected] = useState<Invoice | null>(null)
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)

  const clienteById = useMemo(() => new Map(db.clients.map((c) => [c.id, c])), [db.clients])
  const envioByInvoiceId = useMemo(() => new Map(envios.map((e) => [e.invoiceId, e])), [envios])

  const porTrimestre = useMemo(() => {
    const map = new Map<string, { repercutido: number; soportado: number }>()
    db.invoices.forEach((inv) => {
      const q = quarterOf(inv.fecha)
      const acc = map.get(q) ?? { repercutido: 0, soportado: 0 }
      acc.repercutido += inv.igic
      map.set(q, acc)
    })
    db.purchases
      .filter((p) => p.estado === 'Recibido')
      .forEach((p) => {
        const base = p.lineas.reduce((sum, l) => sum + l.cantidad * l.precioUnit, 0)
        const igic = p.total - base
        const q = quarterOf(p.fecha)
        const acc = map.get(q) ?? { repercutido: 0, soportado: 0 }
        acc.soportado += igic
        map.set(q, acc)
      })
    return [...map.entries()]
      .map(([q, v]) => ({ trimestre: q, ...v, resultado: v.repercutido - v.soportado }))
      .sort((a, b) => (a.trimestre < b.trimestre ? 1 : -1))
  }, [db.invoices, db.purchases])

  const cumplimiento = [
    { nombre: 'Facturación electrónica', estado: 'Activo' as const },
    { nombre: 'Veri*Factu (encadenado + QR)', estado: 'Activo' as const },
    { nombre: 'Suministro Inmediato de Información (SII)', estado: 'Pendiente' as const },
  ]

  const pendientesEnvio = envios.filter((e) => e.estado === 'Pendiente').length

  function envioFor(invoiceId: string) {
    return envioByInvoiceId.get(invoiceId) ?? { id: invoiceId, invoiceId, estado: 'Pendiente' as const, fechaEnvio: null }
  }

  function enviarAAeat(inv: Invoice) {
    const existing = envioByInvoiceId.get(inv.id)
    const fechaEnvio = new Date().toISOString().slice(0, 10)
    if (existing) updateEnvio(existing.id, { estado: 'Enviado', fechaEnvio })
    else addEnvio({ id: inv.id, invoiceId: inv.id, estado: 'Enviado', fechaEnvio })
  }

  async function verQr(inv: Invoice) {
    setSelected(inv)
    setQrDataUrl(null)
    const url = verifactuQrUrl(inv.id, inv.fecha, inv.total)
    const dataUrl = await QRCode.toDataURL(url, { margin: 1, width: 220 })
    setQrDataUrl(dataUrl)
  }

  const columns: Column<Invoice>[] = [
    { key: 'id', label: 'Factura', sortValue: (i) => i.id },
    { key: 'cliente', label: 'Cliente', render: (i) => clienteById.get(i.clienteId)?.nombre ?? 'Cliente eliminado', sortValue: (i) => clienteById.get(i.clienteId)?.nombre ?? '' },
    { key: 'total', label: 'Importe', align: 'right', render: (i) => formatEUR(i.total), sortValue: (i) => i.total },
    { key: 'hash', label: 'Huella (SHA-256)', render: (i) => (chain ? <span className="font-mono text-xs" title={chain.get(i.id)?.hash}>{truncateHash(chain.get(i.id)?.hash ?? '')}</span> : '…') },
    { key: 'hashAnt', label: 'Huella anterior', render: (i) => (chain ? <span className="font-mono text-xs text-slate-400" title={chain.get(i.id)?.hashAnterior ?? undefined}>{chain.get(i.id)?.hashAnterior ? truncateHash(chain.get(i.id)!.hashAnterior!) : '— (primera factura)'}</span> : '…') },
    { key: 'estadoAeat', label: 'Envío AEAT', render: (i) => <Badge label={envioFor(i.id).estado === 'Enviado' ? 'Enviado' : 'Pendiente'} /> },
    {
      key: 'acciones',
      label: '',
      render: (i) => (
        <div className="flex items-center gap-2">
          <button onClick={() => verQr(i)} className="flex items-center gap-1 text-xs text-slate-600 hover:text-slate-900">
            <QrCode size={13} /> QR
          </button>
          {envioFor(i.id).estado === 'Pendiente' && (
            <button onClick={() => enviarAAeat(i)} className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
              <Send size={13} /> Enviar
            </button>
          )}
        </div>
      ),
    },
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
      <p className="text-sm text-slate-500 mb-6 ml-[52px]">IGIC trimestral, Veri*Factu y estado de cumplimiento normativo</p>

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
        <div className="px-4 py-3 border-b border-slate-200 text-sm font-medium text-slate-700">IGIC por trimestre (modelo 420)</div>
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-500">
              <th className="text-left px-4 py-2">Trimestre</th>
              <th className="text-right px-4 py-2">IGIC repercutido</th>
              <th className="text-right px-4 py-2">IGIC soportado</th>
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

      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-6">
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
      <p className="text-xs text-slate-400 mb-6">
        El SII se muestra como pendiente de implementar. Veri*Factu genera huella SHA-256 encadenada y QR de verificación reales; el envío efectivo a la sede
        electrónica de la AEAT requiere certificado digital de empresa y se simula aquí.
      </p>

      <div className="text-sm font-semibold text-slate-900 mb-3">
        Registro Veri*Factu {pendientesEnvio > 0 && <span className="text-xs font-normal text-orange-600">· {pendientesEnvio} facturas pendientes de enviar</span>}
      </div>
      <DataTable
        columns={columns}
        rows={db.invoices}
        rowKey={(i) => i.id}
        searchableText={(i) => `${i.id} ${clienteById.get(i.clienteId)?.nombre ?? ''}`}
        pageSize={12}
      />

      {selected && (
        <Modal
          title={`Veri*Factu · ${selected.id}`}
          subtitle={clienteById.get(selected.clienteId)?.nombre}
          onClose={() => setSelected(null)}
          footer={
            <button onClick={() => setSelected(null)} className="px-3 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg">
              Cerrar
            </button>
          }
        >
          <div className="flex flex-col items-center text-center">
            {qrDataUrl ? <img src={qrDataUrl} alt="Código QR Veri*Factu" className="w-44 h-44" /> : <div className="w-44 h-44 flex items-center justify-center text-slate-300">Generando…</div>}
            <p className="text-xs text-slate-500 mt-3">Factura verificable en la sede electrónica de la AEAT</p>
            <div className="w-full text-left mt-4 text-xs space-y-1.5 bg-slate-50 rounded-lg p-3">
              <div>
                <span className="text-slate-400">Emisor:</span> {VERIFACTU_EMISOR_NOMBRE} ({VERIFACTU_EMISOR_NIF})
              </div>
              <div>
                <span className="text-slate-400">Fecha:</span> {formatDate(selected.fecha)}
              </div>
              <div>
                <span className="text-slate-400">Importe:</span> {formatEUR(selected.total)}
              </div>
              <div className="break-all">
                <span className="text-slate-400">Huella:</span> <span className="font-mono">{chain?.get(selected.id)?.hash}</span>
              </div>
              <div className="break-all">
                <span className="text-slate-400">Huella anterior:</span>{' '}
                <span className="font-mono">{chain?.get(selected.id)?.hashAnterior ?? '— (primera de la cadena)'}</span>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
