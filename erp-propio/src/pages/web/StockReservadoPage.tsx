import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { DoorOpen, FileDown, RefreshCw } from 'lucide-react'
import { descargarCsv } from '../../lib/webMapeo'
import { DIF, Nota, Tabla, WebError, type Col } from './comun'
import { cargarPendientesWeb, type PedidoPendiente } from './pendientes'

interface Fila {
  clave: string
  articulo: string
  descripcion: string
  almacen: string | null
  reservado: number
  pedidos: string[]
  disponible: number
  falta: number
}

/** Web → Stock Reservado por Pedidos Web: unidades comprometidas por pedidos web sin servir. */
export function StockReservadoPage() {
  const navigate = useNavigate()
  const [datos, setDatos] = useState<{ pedidos: PedidoPendiente[]; stock: Map<string, number> } | null>(null)
  const [error, setError] = useState<unknown>(null)
  const [sel, setSel] = useState(0)
  const [soloFaltan, setSoloFaltan] = useState(false)

  async function cargar() {
    setError(null)
    try {
      setDatos(await cargarPendientesWeb())
    } catch (e) {
      setError(e)
    }
  }
  useEffect(() => {
    cargar()
  }, [])

  const filas = useMemo(() => {
    const m = new Map<string, Fila>()
    for (const p of datos?.pedidos ?? [])
      for (const l of p.lineas) {
        if (l.pendiente <= 0) continue
        const k = `${l.articulo}|${l.almacen}`
        const f = m.get(k) ?? { clave: k, articulo: l.articulo, descripcion: l.descripcion, almacen: l.almacen, reservado: 0, pedidos: [], disponible: datos?.stock.get(k) ?? 0, falta: 0 }
        f.reservado += l.pendiente
        f.pedidos.push(`${p.tienda}/${p.numero} (web ${p.webId})`)
        m.set(k, f)
      }
    const out = [...m.values()].map((f) => ({ ...f, falta: Math.max(0, f.reservado - f.disponible) }))
    return soloFaltan ? out.filter((f) => f.falta > 0) : out
  }, [datos, soloFaltan])

  const cols: Col<Fila>[] = [
    { key: 'art', label: 'Artículo', width: 110, value: (f) => f.articulo },
    { key: 'desc', label: 'Descripción', width: 340, value: (f) => f.descripcion },
    { key: 'alm', label: 'Almacén', width: 70, value: (f) => f.almacen },
    { key: 'res', label: 'Reservado web', width: 105, align: 'right', value: (f) => f.reservado },
    { key: 'disp', label: 'Disponible', width: 90, align: 'right', value: (f) => f.disponible },
    { key: 'falta', label: 'Falta', width: 70, align: 'right', value: (f) => f.falta, cellStyle: (f) => (f.falta ? DIF : undefined) },
    { key: 'peds', label: 'Pedidos', width: 360, value: (f) => f.pedidos.join(', ') },
  ]
  const actual = filas[sel]

  return (
    <div className="flex h-full min-h-0 flex-col gap-1.5 text-[13px]">
      <div className="flex flex-none flex-wrap items-center gap-2">
        <button type="button" className="gw-btn" onClick={cargar}>
          <RefreshCw size={14} /> Actualizar
        </button>
        <label className="flex items-center gap-1">
          <input type="checkbox" checked={soloFaltan} onChange={(e) => setSoloFaltan(e.target.checked)} /> Solo los que no llegan
        </label>
        <button
          type="button"
          className="gw-btn"
          disabled={!filas.length}
          onClick={() => descargarCsv('stock-reservado-web.csv', cols.map((c) => c.label), filas.map((r) => cols.map((c) => c.value(r))))}
        >
          <FileDown size={14} /> Exportar CSV
        </button>
        <Nota>Suma de lo pendiente de servir de los pedidos web del ERP, frente al disponible de su almacén. No cambia nada en la web.</Nota>
      </div>
      <WebError error={error} />
      <Tabla rows={filas} cols={cols} rowKey={(f) => f.clave} sel={sel} onSel={setSel} vacio={datos ? 'No hay stock comprometido por pedidos web.' : 'Cargando…'} onOpen={(f) => navigate(`/articulos/${encodeURIComponent(f.articulo)}`)} />
      <div className="flex flex-none items-center gap-2">
        <button type="button" className="gw-btn" disabled={!actual} onClick={() => actual && navigate(`/articulos/${encodeURIComponent(actual.articulo)}`)}>
          Abrir artículo
        </button>
        <button type="button" className="gw-btn ml-auto" onClick={() => navigate('/')}>
          <DoorOpen size={14} /> Salir
        </button>
      </div>
    </div>
  )
}
