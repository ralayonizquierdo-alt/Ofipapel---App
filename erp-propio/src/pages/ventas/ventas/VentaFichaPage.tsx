import { useParams } from 'react-router-dom'
import { VentaDocumento } from './VentaDocumento'

/** Ventas → Ventas / Facturas: abre en consulta (/ventas/:tienda/:numero o la última venta). */
export function VentaFichaPage() {
  const params = useParams()
  const [tienda, numero] = (params['*'] ?? '').split('/').filter(Boolean)
  const n = numero && /^\d+$/.test(numero) ? Number(numero) : undefined
  return <VentaDocumento modoInicial="consulta" tiendaParam={tienda || undefined} numeroParam={n} />
}
