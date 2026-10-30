import { Navigate, Route, Routes } from 'react-router-dom'
import { ParametrosAvatarPage } from './parametros/ParametrosAvatarPage'
import { ZonaServicioFichaPage } from './ZonaServicioFichaPage'
import { CargaCotizacionPage } from './CargaCotizacionPage'
import { ImportarPage } from './ImportarPage'
import { AuditoriaPage } from './AuditoriaPage'

/** Ventanas de Archivo sin captura bajo /archivo/…: Parámetros, Zonas de servicio, Carga Cotización, Importar y Auditoría. */
export function ArchivoRoutes() {
  return (
    <Routes>
      <Route path="parametros" element={<ParametrosAvatarPage />} />
      <Route path="zonas-servicio/*" element={<ZonaServicioFichaPage />} />
      <Route path="carga-cotizacion" element={<CargaCotizacionPage />} />
      <Route path="importar" element={<ImportarPage />} />
      <Route path="auditoria" element={<AuditoriaPage />} />
      <Route path="*" element={<Navigate to="/archivo/parametros" replace />} />
    </Routes>
  )
}
