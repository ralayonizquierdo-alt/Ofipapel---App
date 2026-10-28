import { Navigate, Route, Routes } from 'react-router-dom'
import { MovimientosArticulosPage } from './MovimientosArticulosPage'
import { ListadosArticulosPage } from './ListadosArticulosPage'
import { EtiquetasPage } from './EtiquetasPage'
import { CreacionRapidaArticulosPage } from './CreacionRapidaArticulosPage'
import { ModificacionBloquePage } from './ModificacionBloquePage'
import { PlusPage } from './PlusPage'
import { InventariarAlmacenPage } from './InventariarAlmacenPage'
import { PuntosRestauracionPage } from './PuntosRestauracionPage'
import { RecalcularStockPage } from './RecalcularStockPage'
import { EliminacionArticulosPage } from './EliminacionArticulosPage'
import { ControlLotesPage } from './ControlLotesPage'
import { StockCeroFamiliaPage } from './StockCeroFamiliaPage'
import { ArticulosEnBlancoPage } from './ArticulosEnBlancoPage'

/** Rutas de las utilidades del menú Almacén (todas bajo /almacen/…). */
export function AlmacenUtilRoutes() {
  return (
    <Routes>
      <Route path="listados-articulos" element={<ListadosArticulosPage />} />
      <Route path="movimientos" element={<MovimientosArticulosPage />} />
      <Route path="etiquetas" element={<EtiquetasPage />} />
      <Route path="creacion-rapida/*" element={<CreacionRapidaArticulosPage />} />
      <Route path="modificacion-bloque/*" element={<ModificacionBloquePage />} />
      <Route path="plus" element={<PlusPage />} />
      <Route path="inventariar" element={<InventariarAlmacenPage />} />
      {/* SIN CAPTURA de GeminisWin: ajustar cuando llegue */}
      <Route path="puntos-restauracion" element={<PuntosRestauracionPage />} />
      <Route path="recalcular-stock" element={<RecalcularStockPage />} />
      <Route path="eliminacion-articulos" element={<EliminacionArticulosPage />} />
      <Route path="lotes" element={<ControlLotesPage />} />
      {/* Del menú Utilidades */}
      <Route path="stock-cero-familia" element={<StockCeroFamiliaPage />} />
      <Route path="articulos-en-blanco" element={<ArticulosEnBlancoPage />} />
      <Route path="*" element={<Navigate to="/almacen/listados-articulos" replace />} />
    </Routes>
  )
}
