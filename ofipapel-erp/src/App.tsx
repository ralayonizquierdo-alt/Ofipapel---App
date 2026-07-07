import type { ComponentType } from 'react'
import { Routes, Route } from 'react-router-dom'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import CatalogoPage from './pages/CatalogoPage'
import StockPage from './pages/StockPage'
import ClientesPage from './pages/ClientesPage'
import ProveedoresPage from './pages/ProveedoresPage'
import VentasPage from './pages/VentasPage'
import ComprasPage from './pages/ComprasPage'
import FacturacionPage from './pages/FacturacionPage'
import TiendaWebPage from './pages/TiendaWebPage'
import UsuariosPage from './pages/UsuariosPage'
import TPVPage from './pages/TPVPage'
import ContabilidadPage from './pages/ContabilidadPage'
import FiscalidadPage from './pages/FiscalidadPage'
import FamiliasPage from './pages/FamiliasPage'
import InformesPage from './pages/InformesPage'
import TransferenciasPage from './pages/TransferenciasPage'
import FlotaPage from './pages/FlotaPage'
import ModulePage from './components/ModulePage'
import { ALL_ITEMS } from './data/menu'

// Módulos de Fase 1 y 2 ya desarrollados en profundidad; el resto sigue como
// pantalla de referencia (ModulePage) hasta que se aborden en su fase.
const BUILT_PAGES: Record<string, ComponentType> = {
  catalogo: CatalogoPage,
  stock: StockPage,
  clientes: ClientesPage,
  proveedores: ProveedoresPage,
  ventas: VentasPage,
  compras: ComprasPage,
  facturacion: FacturacionPage,
  web: TiendaWebPage,
  usuarios: UsuariosPage,
  tpv: TPVPage,
  contabilidad: ContabilidadPage,
  fiscalidad: FiscalidadPage,
  familias: FamiliasPage,
  informes: InformesPage,
  multialmacen: TransferenciasPage,
  flota: FlotaPage,
}

function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        {ALL_ITEMS.filter((item) => item.id !== 'dashboard').map((item) => {
          const Page = BUILT_PAGES[item.id]
          return <Route key={item.id} path={item.path} element={Page ? <Page /> : <ModulePage item={item} />} />
        })}
      </Route>
    </Routes>
  )
}

export default App
