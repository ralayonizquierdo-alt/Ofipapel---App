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
import ModulePage from './components/ModulePage'
import { ALL_ITEMS } from './data/menu'

// Módulos de Fase 1 ya desarrollados en profundidad; el resto sigue como
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
