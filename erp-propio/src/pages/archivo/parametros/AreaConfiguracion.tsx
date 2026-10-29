// Parámetros → Configuración: accesos a las fichas de configuración (empresa, tiendas, periodos…)
// y, debajo, lo que cada tienda/terminal propone por defecto y la configuración de empresa,
// VeriFactu y web (ConfiguracionTiendas).

import { useNavigate } from 'react-router-dom'
import { ConfiguracionTiendas } from '../ParametrosPage'

const FICHAS: { to: string; icono: string; titulo: string; texto: string }[] = [
  { to: '/empresa', icono: '🏢', titulo: 'Datos de Empresa', texto: 'Nombre, CIF, dirección, correo' },
  { to: '/tiendas', icono: '🏬', titulo: 'Tiendas y terminales', texto: 'Almacén, cliente de contado, contadores' },
  { to: '/utilidades/ejercicios', icono: '📅', titulo: 'Periodos', texto: 'Periodo en curso y periodos cerrados' },
  { to: '/empleados', icono: '👥', titulo: 'Empleados', texto: 'Fichas, grupo y contraseña' },
  { to: '/grupos-acceso', icono: '🛡️', titulo: 'Grupos de acceso', texto: 'Qué opciones tiene cada grupo' },
  { to: '/formas-pago', icono: '💳', titulo: 'Formas de pago', texto: 'Vencimientos y cobro' },
  { to: '/monedas', icono: '💱', titulo: 'Monedas', texto: 'Cotizaciones y decimales' },
  { to: '/bancos', icono: '🏦', titulo: 'Códigos bancarios', texto: 'Bancos y sucursales' },
  { to: '/codigos-postales', icono: '📮', titulo: 'Códigos postales', texto: 'Poblaciones y provincias' },
  { to: '/contabilidad/configuracion', icono: '📒', titulo: 'Configuración contable', texto: 'Cuentas y subcuentas' },
  { to: '/web/configuracion', icono: '🌐', titulo: 'Conexión con la web', texto: 'WooCommerce' },
]

export function AreaConfiguracion() {
  const navigate = useNavigate()
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-1.5">
        {FICHAS.map((f) => (
          <button key={f.to} type="button" className="gw-boton-barra h-[58px] justify-start gap-3 px-3 text-left" onClick={() => navigate(f.to)}>
            <span className="text-[26px]">{f.icono}</span>
            <span className="flex flex-col">
              <span className="text-[15px] font-bold">{f.titulo}</span>
              <span className="text-[12px] text-[#555]">{f.texto}</span>
            </span>
          </button>
        ))}
      </div>
      <ConfiguracionTiendas />
    </div>
  )
}
