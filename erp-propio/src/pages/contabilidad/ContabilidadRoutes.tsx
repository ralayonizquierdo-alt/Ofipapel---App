import { Navigate, Route, Routes } from 'react-router-dom'
import { PlanCuentasPage } from './PlanCuentasPage'
import { ConfiguracionContablePage } from './ConfiguracionContablePage'
import { GenerarAsientosPage } from './GenerarAsientosPage'
import { DiarioPage } from './DiarioPage'
import { MayorPage } from './MayorPage'
import { PerdidasGananciasPage, SumasSaldosPage } from './BalancesPage'
import { LibrosIgicPage, Modelo347Page, Modelo420Page, Modelo425Page } from './ImpuestosPage'
import { ExportarGestoriaPage } from './ExportarGestoriaPage'
import { ConciliacionPage } from './ConciliacionPage'
import { PrevisionTesoreriaPage } from './PrevisionTesoreriaPage'

/** Rutas del menú Contabilidad (todas bajo /contabilidad/…). */
export function ContabilidadRoutes() {
  return (
    <Routes>
      <Route path="generar" element={<GenerarAsientosPage />} />
      <Route path="pendientes" element={<DiarioPage key="errores" modo="errores" />} />
      <Route path="diario" element={<DiarioPage key="diario" />} />
      <Route path="plan-cuentas" element={<PlanCuentasPage />} />
      <Route path="mayor" element={<MayorPage />} />
      <Route path="sumas-saldos" element={<SumasSaldosPage />} />
      <Route path="perdidas-ganancias" element={<PerdidasGananciasPage />} />
      <Route path="libros-igic" element={<LibrosIgicPage />} />
      <Route path="modelo-420" element={<Modelo420Page />} />
      <Route path="modelo-425" element={<Modelo425Page />} />
      <Route path="modelo-347" element={<Modelo347Page />} />
      <Route path="conciliacion" element={<ConciliacionPage />} />
      <Route path="tesoreria" element={<PrevisionTesoreriaPage />} />
      <Route path="exportar" element={<ExportarGestoriaPage />} />
      <Route path="configuracion" element={<ConfiguracionContablePage />} />
      <Route path="*" element={<Navigate to="/contabilidad/diario" replace />} />
    </Routes>
  )
}
