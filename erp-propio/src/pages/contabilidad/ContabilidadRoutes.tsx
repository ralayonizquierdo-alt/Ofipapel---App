import { useState } from 'react'
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
import { BalanceSituacionPage } from './BalanceSituacionPage'
import { EjercicioBar } from './EjercicioBar'
import { ejercicioContable, fijarEjercicioContable } from './contabModel'

/** Rutas del menú Contabilidad (todas bajo /contabilidad/…), con la barra del ejercicio arriba. */
export function ContabilidadRoutes() {
  const [anio, setAnio] = useState(ejercicioContable())
  // Al cambiar de ejercicio (o cerrarlo / reabrirlo) se vuelven a montar las pantallas con sus fechas.
  const [vuelta, setVuelta] = useState(0)
  const elegir = (a: number) => {
    fijarEjercicioContable(a)
    setAnio(a)
    setVuelta((v) => v + 1)
  }
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <EjercicioBar anio={anio} onAnio={elegir} />
      <ContabilidadPantallas key={`${anio}-${vuelta}`} />
    </div>
  )
}

function ContabilidadPantallas() {
  return (
    <Routes>
      <Route path="generar" element={<GenerarAsientosPage />} />
      <Route path="pendientes" element={<DiarioPage key="errores" modo="errores" />} />
      <Route path="diario" element={<DiarioPage key="diario" />} />
      <Route path="plan-cuentas" element={<PlanCuentasPage />} />
      <Route path="mayor" element={<MayorPage />} />
      <Route path="sumas-saldos" element={<SumasSaldosPage />} />
      <Route path="perdidas-ganancias" element={<PerdidasGananciasPage />} />
      <Route path="balance-situacion" element={<BalanceSituacionPage />} />
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
