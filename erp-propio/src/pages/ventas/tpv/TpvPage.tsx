import { VentaDocumento } from '../ventas/VentaDocumento'

/** Ventas → TPV / Ventas: empieza una venta nueva y pide el empleado al entrar, como GeminisWin. */
export function TpvPage() {
  return <VentaDocumento modoInicial="alta" pedirEmpleado />
}
