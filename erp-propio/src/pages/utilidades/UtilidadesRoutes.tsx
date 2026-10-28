import { Navigate, Route, Routes } from 'react-router-dom'
import { ExaminarPage } from './ExaminarPage'
import { EjerciciosPage } from './EjerciciosPage'

/** Ventanas de Utilidades y de Archivo → Periodos o Ejercicios (bajo /utilidades/…). SIN CAPTURA. */
export function UtilidadesRoutes() {
  return (
    <Routes>
      <Route path="examinar" element={<ExaminarPage />} />
      <Route path="ejercicios" element={<EjerciciosPage />} />
      <Route path="*" element={<Navigate to="/utilidades/examinar" replace />} />
    </Routes>
  )
}
