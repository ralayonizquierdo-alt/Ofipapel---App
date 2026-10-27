import { Navigate, Route, Routes } from 'react-router-dom'
import { MovimientosArticulosPage } from './MovimientosArticulosPage'
import { ListadosArticulosPage } from './ListadosArticulosPage'
import { EtiquetasPage } from './EtiquetasPage'
import { CreacionRapidaArticulosPage } from './CreacionRapidaArticulosPage'

/** Rutas de las utilidades del menú Almacén (todas bajo /almacen/…). */
export function AlmacenUtilRoutes() {
  return (
    <Routes>
      <Route path="listados-articulos" element={<ListadosArticulosPage />} />
      <Route path="movimientos" element={<MovimientosArticulosPage />} />
      <Route path="etiquetas" element={<EtiquetasPage />} />
      <Route path="creacion-rapida/*" element={<CreacionRapidaArticulosPage />} />
      <Route path="*" element={<Navigate to="/almacen/listados-articulos" replace />} />
    </Routes>
  )
}
