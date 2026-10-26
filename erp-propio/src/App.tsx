import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { ArticulosListPage } from './pages/articulos/ArticulosListPage'
import { ArticuloFichaPage } from './pages/articulos/ArticuloFichaPage'
import { ClienteFichaPage } from './pages/clientes/ClienteFichaPage'
import { ClientesListPage } from './pages/clientes/ClientesListPage'
import { ProveedorFichaPage } from './pages/proveedores/ProveedorFichaPage'
import { ProveedoresListPage } from './pages/proveedores/ProveedoresListPage'
import { AlmacenesPage } from './pages/AlmacenesPage'
import { TiendasPage } from './pages/TiendasPage'
import { EmpleadosPage } from './pages/EmpleadosPage'
import { StockPage } from './pages/StockPage'
import { ComprasPage } from './pages/ComprasPage'
import { PedidoFichaPage } from './pages/ventas/pedidos/PedidoFichaPage'
import { PresupuestosPage } from './pages/ventas/pedidos/PresupuestosPage'
import { TpvPage } from './pages/ventas/tpv/TpvPage'
import { VentaFichaPage } from './pages/ventas/ventas/VentaFichaPage'
import { RepartoFichaPage } from './pages/ventas/repartos/RepartoFichaPage'
import { GestorPedidosPage } from './pages/ventas/gestores/GestorPedidosPage'
import { GestorPresupuestosPage } from './pages/ventas/gestores/GestorPresupuestosPage'
import { NumeroSerieFichaPage } from './pages/ventas/series/NumeroSerieFichaPage'
import { ReparacionFichaPage } from './pages/ventas/reparaciones/ReparacionFichaPage'
import { VendedorFichaPage } from './pages/ventas/vendedores/VendedorFichaPage'
import { RepartidorFichaPage } from './pages/ventas/maestros/RepartidorFichaPage'
import { ZonaFichaPage } from './pages/ventas/maestros/ZonaFichaPage'
import { RutaFichaPage } from './pages/ventas/maestros/RutaFichaPage'
import { FamiliaFichaPage } from './pages/almacen/FamiliaFichaPage'
import { MarcaFichaPage } from './pages/almacen/MarcaFichaPage'
import { PlantillaTarifaFichaPage } from './pages/almacen/PlantillaTarifaFichaPage'
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
            <Route path="/" element={null} />
            <Route path="/resumen" element={<DashboardPage />} />
            <Route path="/articulos" element={<ArticuloFichaPage />} />
            <Route path="/articulos/lista" element={<ArticulosListPage />} />
            <Route path="/articulos/:codigo" element={<ArticuloFichaPage />} />
            <Route path="/clientes" element={<ClienteFichaPage />} />
            <Route path="/clientes/lista" element={<ClientesListPage />} />
            <Route path="/clientes/:codigo" element={<ClienteFichaPage />} />
            <Route path="/proveedores" element={<ProveedorFichaPage />} />
            <Route path="/proveedores/lista" element={<ProveedoresListPage />} />
            <Route path="/proveedores/:codigo" element={<ProveedorFichaPage />} />
            <Route path="/almacenes" element={<AlmacenesPage />} />
            <Route path="/tiendas" element={<TiendasPage />} />
            <Route path="/empleados" element={<EmpleadosPage />} />
            <Route path="/stock" element={<StockPage />} />
            <Route path="/traspasos" element={<TraspasosPage />} />
            <Route path="/inventario" element={<InventarioPage />} />
            <Route path="/compras" element={<ComprasPage />} />
            <Route path="/pedidos/*" element={<PedidoFichaPage />} />
            <Route path="/presupuestos/*" element={<PresupuestosPage />} />
            <Route path="/tpv/*" element={<TpvPage />} />
            <Route path="/ventas/*" element={<VentaFichaPage />} />
            <Route path="/caja" element={<VentasPage />} />
            <Route path="/repartos/*" element={<RepartoFichaPage />} />
            <Route path="/gestor-pedidos" element={<GestorPedidosPage />} />
            <Route path="/gestor-presupuestos" element={<GestorPresupuestosPage />} />
            <Route path="/numeros-serie/*" element={<NumeroSerieFichaPage />} />
            <Route path="/reparaciones/*" element={<ReparacionFichaPage />} />
            <Route path="/vendedores/*" element={<VendedorFichaPage tipo="vendedor" />} />
            <Route path="/tecnicos/*" element={<VendedorFichaPage tipo="tecnico" />} />
            <Route path="/repartidores/*" element={<RepartidorFichaPage />} />
            <Route path="/zonas-territoriales/*" element={<ZonaFichaPage />} />
            <Route path="/rutas-reparto/*" element={<RutaFichaPage />} />
            <Route path="/familias/*" element={<FamiliaFichaPage />} />
            <Route path="/marcas/*" element={<MarcaFichaPage />} />
            <Route path="/plantillas-tarifas/*" element={<PlantillaTarifaFichaPage />} />
            <Route path="/pagos" element={<PagosPage />} />
            <Route path="/facturacion" element={<FacturacionPage />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
