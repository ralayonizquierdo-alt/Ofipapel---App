import { procesosIniciales, type Procesos } from '../../ventas/gestores/comun'

export const CLAVE_OPCIONES = 'gw.gestorPedidosProveedor.opciones'

export interface OpcionesGestorCompras {
  mostrarConfirmacion: boolean
  mostrarLiquidacion: boolean
  refrescarAlCerrar: boolean
  refrescoAuto: boolean
  segundos: number
  eliminarPropuestas: boolean
  colorearEstadoPedido: boolean
  colorearProveedorPropuestas: boolean
  colorearProveedorArticulos: boolean
  colorearEstadoPeticiones: boolean
  procesos: Procesos
}

export const OPCIONES_DEFECTO: OpcionesGestorCompras = {
  mostrarConfirmacion: false,
  mostrarLiquidacion: false,
  refrescarAlCerrar: false,
  refrescoAuto: false,
  segundos: 0,
  eliminarPropuestas: false,
  colorearEstadoPedido: true,
  colorearProveedorPropuestas: true,
  colorearProveedorArticulos: true,
  colorearEstadoPeticiones: true,
  procesos: procesosIniciales,
}

/** Estados de pedido_proveedor (check de la BD) con su etiqueta y color de GeminisWin. */
export const ESTADOS_PEDIDO: { value: string; label: string; boton: string; bg: string; fg: string }[] = [
  { value: 'pendiente', label: 'Pendiente', boton: 'Pendiente', bg: '#7a1f5c', fg: '#fff' },
  { value: 'pendiente_confirmar', label: 'Pend. Conf.', boton: 'Pend. Confirmar', bg: '#1d2a8c', fg: '#fff' },
  { value: 'confirmado', label: 'Confirmado', boton: 'Confirmado', bg: '#d42d62', fg: '#fff' },
  { value: 'conformado', label: 'Conformado', boton: 'Conformado', bg: '#e07a1f', fg: '#fff' },
  { value: 'pendiente_entrega', label: 'Pend. Entrega', boton: 'Pend. Entrega', bg: '#1f7fc2', fg: '#fff' },
  { value: 'recepcionado', label: 'Recepcionado', boton: 'Recepcionado', bg: '#2a9d5a', fg: '#fff' },
  { value: 'liquidado', label: 'Liquidado', boton: 'Liquidado', bg: '#6d6d6d', fg: '#fff' },
]

/** Estados de peticion (check de la BD) con su etiqueta de GeminisWin y color de la rejilla. */
export const ESTADOS_PETICION: { value: string; label: string; boton: string; bg?: string; fg?: string }[] = [
  { value: 'pendiente', label: 'Pendiente', boton: 'Pendiente', bg: '#b8f0d8', fg: '#000' },
  { value: 'atendida', label: 'Atendida', boton: 'Atendida', bg: '#12bcd4', fg: '#fff' },
  { value: 'parcial_tramitada', label: 'Parcial Tr.', boton: 'Parcial Tr.', bg: '#9a8be0', fg: '#000' },
  { value: 'parcial_resuelta', label: 'Parc. Res.', boton: 'Parc. Res.', bg: '#7cb6f2', fg: '#000' },
  { value: 'tramitada', label: 'Tramitada', boton: 'Tramitada', bg: '#c23fc8', fg: '#fff' },
  { value: 'resuelta', label: 'Resuelta', boton: 'Resuelta', bg: '#1f7fc2', fg: '#fff' },
  { value: 'entregada', label: 'Entregada', boton: 'Entregada', bg: '#8a4fd0', fg: '#fff' },
  { value: 'anulada', label: 'Anulada', boton: 'Anulada', bg: '#d6d6d6', fg: '#000' },
]

const PALETA = ['#d9c6f5', '#c7ecdf', '#f7dcc3', '#c9e0f7', '#f5c9dd', '#e3ecc4', '#f7efc2', '#dcd6f0', '#c6f2d6', '#f0d6d6']

/** Color estable por proveedor para colorear propuestas y artículos. */
export function colorProveedor(codigo: string | null | undefined) {
  if (!codigo) return undefined
  const n = [...codigo].reduce((s, c) => s * 31 + c.charCodeAt(0), 7)
  return PALETA[Math.abs(n) % PALETA.length]
}

export const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export function fechaHoraEs(v: string | null | undefined) {
  if (!v) return ''
  const d = new Date(v)
  if (Number.isNaN(d.getTime())) return v
  return `${d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' })} ${d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`
}
