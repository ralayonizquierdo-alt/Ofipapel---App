import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { ArticulosPage } from './pages/ArticulosPage'
import { ClientesPage } from './pages/ClientesPage'
import { ProveedoresPage } from './pages/ProveedoresPage'
import { AlmacenesPage } from './pages/AlmacenesPage'
import { TiendasPage } from './pages/TiendasPage'
import { EmpleadosPage } from './pages/EmpleadosPage'
import { StockPage } from './pages/StockPage'
import { ComprasPage } from './pages/ComprasPage'
import { PedidosPage } from './pages/PedidosPage'
import { RepartosPage } from './pages/RepartosPage'
import { VentasPage } from './pages/VentasPage'
import { PagosPage } from './pages/PagosPage'
import { TraspasosPage } from './pages/TraspasosPage'
import { InventarioPage } from './pages/InventarioPage'
import { FacturacionPage } from './pages/FacturacionPage'

function ProtectedArea() {
  const { session, loading } = useAuth()
  if (loading) return <div className="flex min-h-screen items-center justify-center text-sm text-slate-400">Cargando…</div>
  if (!session) return <Navigate to="/login" replace />
  return <Layout />
}

function PublicOnly({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  if (loading) return null
  if (session) return <Navigate to="/" replace />
  return <>{children}</>
}

function App() {
  return (
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<PublicOnly><LoginPage /></PublicOnly>} />
          <Route element={<ProtectedArea />}>
            <Route path="/" element={<DashboardPage />} />
            <Route path="/articulos" element={<ArticulosPage />} />
            <Route path="/clientes" element={<ClientesPage />} />
            <Route path="/proveedores" element={<ProveedoresPage />} />
            <Route path="/almacenes" element={<AlmacenesPage />} />
            <Route path="/tiendas" element={<TiendasPage />} />
            <Route path="/empleados" element={<EmpleadosPage />} />
            <Route path="/stock" element={<StockPage />} />
            <Route path="/traspasos" element={<TraspasosPage />} />
            <Route path="/inventario" element={<InventarioPage />} />
            <Route path="/compras" element={<ComprasPage />} />
            <Route path="/pedidos" element={<PedidosPage />} />
            <Route path="/repartos" element={<RepartosPage />} />
            <Route path="/ventas" element={<VentasPage />} />
            <Route path="/pagos" element={<PagosPage />} />
            <Route path="/facturacion" element={<FacturacionPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
