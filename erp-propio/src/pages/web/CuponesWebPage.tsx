import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, RefreshCw } from 'lucide-react'
import { wc, type WcCupon } from '../../lib/woocommerce'
import { descargarCsv } from '../../lib/webMapeo'
import { fechaEs } from '../ventas/gestores/comun'
import { BotonPendiente, eur, Nota, Tabla, WebError, type Col } from './comun'

const TIPOS: Record<string, string> = { percent: '% sobre el carrito', fixed_cart: 'Importe fijo carrito', fixed_product: 'Importe fijo producto' }

export function estadoCupon(c: WcCupon, hoy = new Date().toISOString().slice(0, 10)) {
  if (c.date_expires && c.date_expires.slice(0, 10) < hoy) return 'Caducado'
  if (c.usage_limit && (c.usage_count ?? 0) >= c.usage_limit) return 'Agotado'
  return 'Activo'
}

/** Web → Ofertas y Cupones Web (consulta). */
export function CuponesWebPage() {
  const navigate = useNavigate()
  const [cupones, setCupones] = useState<WcCupon[] | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [estado, setEstado] = useState('Activo')
  const [sel, setSel] = useState(0)

  async function cargar() {
    setError(null)
    try {
      setCupones((await wc.todos<WcCupon>('coupons', {}, 10)).data ?? [])
    } catch (e) {
      setError(e)
      setCupones([])
    }
  }
  useEffect(() => {
    cargar()
  }, [])

  const filas = useMemo(() => (cupones ?? []).filter((c) => !estado || estadoCupon(c) === estado), [cupones, estado])
  const cols: Col<WcCupon>[] = [
    { key: 'code', label: 'Código', width: 140, value: (c) => c.code },
    { key: 'tipo', label: 'Tipo', width: 150, value: (c) => TIPOS[c.discount_type] ?? c.discount_type },
    { key: 'amount', label: 'Valor', width: 75, align: 'right', value: (c) => Number(c.amount), render: (c) => eur(Number(c.amount)) },
    { key: 'desc', label: 'Descripción', width: 250, value: (c) => c.description ?? '' },
    { key: 'cad', label: 'Caduca', width: 90, value: (c) => c.date_expires ?? null, render: (c) => fechaEs(c.date_expires) },
    { key: 'uso', label: 'Usos', width: 80, align: 'right', value: (c) => c.usage_count ?? 0, render: (c) => `${c.usage_count ?? 0}${c.usage_limit ? ` / ${c.usage_limit}` : ''}` },
    { key: 'min', label: 'Mínimo', width: 75, align: 'right', value: (c) => Number(c.minimum_amount || 0), render: (c) => (Number(c.minimum_amount) ? eur(Number(c.minimum_amount)) : '') },
    { key: 'envio', label: 'Envío gratis', width: 85, value: (c) => (c.free_shipping ? 'Sí' : '') },
    { key: 'ind', label: 'Uso individual', width: 95, value: (c) => (c.individual_use ? 'Sí' : '') },
    { key: 'est', label: 'Estado', width: 80, value: (c) => estadoCupon(c) },
  ]

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-none flex-wrap items-center gap-2">
        <span className="gw-label">Estado:</span>
        <select className="gw-input w-[140px]! flex-none" value={estado} onChange={(e) => setEstado(e.target.value)}>
          <option value="">Todos</option>
          <option>Activo</option>
          <option>Caducado</option>
          <option>Agotado</option>
        </select>
        <button type="button" className="gw-btn" onClick={cargar}>
          <RefreshCw size={14} /> Actualizar
        </button>
        <button type="button" className="gw-btn" disabled={!filas.length} onClick={() => descargarCsv('cupones-web.csv', cols.map((c) => c.label), filas.map((r) => cols.map((c) => c.value(r))))}>
          <FileDown size={14} /> Exportar CSV
        </button>
      </div>
      <WebError error={error} />
      <Nota>Cupones de la tienda online. Las ofertas de precio con fecha de cada artículo se comparan en «Precios Web». Al importar un pedido, sus cupones entran como descuento en línea.</Nota>
      <Tabla rows={filas} cols={cols} rowKey={(c) => String(c.id)} sel={sel} onSel={setSel} vacio={cupones ? 'Sin cupones.' : 'Cargando…'} />
      <div className="flex flex-none items-center gap-2">
        <BotonPendiente>Crear cupón en la web</BotonPendiente>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}
