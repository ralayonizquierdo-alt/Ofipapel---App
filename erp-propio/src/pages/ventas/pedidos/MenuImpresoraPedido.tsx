// Impresora del documento de Pedidos de clientes (capturas ZIP 7, nº 67 y 68, 04/11/2026):
// GeminisWin abre un menú sobre el botón con «Pedidos · Proforma · Presupuesto · Etiquetas Artic. ·
// Etiqueta Reparto» y, al elegir el documento, un segundo menú pequeño «PAPEL A4 · PDF».
// PAPEL A4 abre el PDF en una pestaña para imprimirlo (Ctrl+P); PDF lo descarga.
// Los listados («Informes») siguen en el botón Listados de la barra y en Ventas → Listados.

import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { nombrePdf, presupuestoPdf, type DatosPdf } from './presupuestoPdf'

type Doc = 'pedido' | 'proforma' | 'presupuesto'

const OPCIONES: { k: Doc | 'etiquetas' | 'reparto'; label: string; titulo?: string; pendiente?: string }[] = [
  { k: 'pedido', label: 'Pedidos', titulo: 'PEDIDO' },
  { k: 'proforma', label: 'Proforma', titulo: 'FACTURA PROFORMA' },
  { k: 'presupuesto', label: 'Presupuesto', titulo: 'PRESUPUESTO' },
  { k: 'etiquetas', label: 'Etiquetas Artic.', pendiente: 'Pendiente: etiquetas de los artículos del pedido (de momento, Utilidades → Etiquetas)' },
  { k: 'reparto', label: 'Etiqueta Reparto', pendiente: 'Pendiente: etiqueta del bulto para el reparto (sin formato de GeminisWin todavía)' },
]

export function MenuImpresoraPedido({
  ancla,
  datos,
  onCerrar,
  onAviso,
}: {
  /** Rectángulo del botón de la impresora: el menú sale encima. */
  ancla: DOMRect
  datos: () => DatosPdf
  onCerrar: () => void
  onAviso: (texto: string) => void
}) {
  const [doc, setDoc] = useState<(typeof OPCIONES)[number] | null>(null)
  const [trabajando, setTrabajando] = useState(false)

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onCerrar()
    window.addEventListener('keydown', k)
    return () => window.removeEventListener('keydown', k)
  }, [onCerrar])

  async function sacar(formato: 'a4' | 'pdf') {
    if (!doc?.titulo) return
    setTrabajando(true)
    try {
      const d = { ...datos(), tituloDoc: doc.titulo }
      if (doc.k !== 'presupuesto') d.validoHasta = null
      const blob = await presupuestoPdf(d)
      const nombre = nombrePdf(d).replace(/^Presupuesto/, doc.label === 'Pedidos' ? 'Pedido' : doc.label)
      const url = URL.createObjectURL(blob)
      if (formato === 'a4') {
        const w = window.open(url, '_blank')
        if (!w) onAviso('El navegador ha bloqueado la ventana: permite las ventanas emergentes de esta web para imprimir en papel, o elige PDF.')
        else onAviso(`${doc.label}: se ha abierto en otra pestaña. Imprímelo con Ctrl+P en papel A4.`)
      } else {
        const a = document.createElement('a')
        a.href = url
        a.download = nombre
        a.click()
        onAviso(`${doc.label}: PDF descargado (${nombre}).`)
      }
      setTimeout(() => URL.revokeObjectURL(url), 60000)
      onCerrar()
    } catch (e) {
      onAviso(`No se ha podido sacar el documento: ${(e as Error).message}. Vuelve a intentarlo.`)
    } finally {
      setTrabajando(false)
    }
  }

  const ancho = 134
  const izq = Math.max(4, Math.min(ancla.left, window.innerWidth - ancho - 4))
  return createPortal(
    <div className="fixed inset-0 z-[80]" onMouseDown={onCerrar}>
      {!doc ? (
        <div
          className="absolute flex flex-col border border-[#7a7a7a] bg-white py-[2px] text-[15px] shadow-[2px_2px_4px_rgba(0,0,0,0.35)]"
          style={{ left: izq, bottom: window.innerHeight - ancla.top + 2, width: ancho }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {OPCIONES.map((o) => (
            <button
              key={o.k}
              type="button"
              disabled={!!o.pendiente}
              title={o.pendiente}
              className="px-2 py-[1px] text-left hover:bg-[#0078d7] hover:text-white disabled:text-[#9a9a9a] disabled:hover:bg-white"
              onClick={() => setDoc(o)}
            >
              {o.label}
            </button>
          ))}
        </div>
      ) : (
        <div
          className="absolute flex flex-col border border-[#7a7a7a] bg-white py-[1px] text-[11px] shadow-[2px_2px_4px_rgba(0,0,0,0.35)]"
          style={{ left: window.innerWidth / 2 - 30, top: window.innerHeight / 2 - 40, width: 60 }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button type="button" disabled={trabajando} className="px-1.5 text-left hover:bg-[#0078d7] hover:text-white" onClick={() => sacar('a4')}>
            PAPEL A4
          </button>
          <button type="button" disabled={trabajando} className="px-1.5 text-left hover:bg-[#0078d7] hover:text-white" onClick={() => sacar('pdf')}>
            PDF
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}
