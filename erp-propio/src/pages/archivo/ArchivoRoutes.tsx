import { Navigate, Route, Routes } from 'react-router-dom'
import { ParametrosAvatarPage } from './parametros/ParametrosAvatarPage'
import { ZonaServicioFichaPage } from './ZonaServicioFichaPage'
import { CargaCotizacionPage } from './CargaCotizacionPage'
import { ImportarPage } from './ImportarPage'
import { AuditoriaPage } from './AuditoriaPage'
import { TextosLegalesPage } from './TextosLegalesPage'

/** Ventanas de Archivo sin captura bajo /archivo/…: Parámetros, Zonas de servicio, Carga Cotización, Importar, Auditoría y Textos legales. */
export function ArchivoRoutes() {
  return (
    <Routes>
      <Route path="parametros" element={<ParametrosAvatarPage />} />
      <Route path="zonas-servicio/*" element={<ZonaServicioFichaPage />} />
      <Route path="carga-cotizacion" element={<CargaCotizacionPage />} />
      <Route path="importar" element={<ImportarPage />} />
      <Route path="auditoria" element={<AuditoriaPage />} />
      <Route path="textos-legales" element={<TextosLegalesPage />} />
      <Route path="*" element={<Navigate to="/archivo/parametros" replace />} />
    </Routes>
  )
}
