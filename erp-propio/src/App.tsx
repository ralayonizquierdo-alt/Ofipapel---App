import type { ReactNode } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { Layout } from './components/Layout'
import { LoginPage } from './pages/LoginPage'
import { DashboardPage } from './pages/DashboardPage'
import { ArticulosPage } from './pages/ArticulosPage'
import { ClientesPage } from './pages/ClientesPage'
import { ProveedoresPage } from './pages/ProveedoresPage'
import { ProximamentePage } from './pages/ProximamentePage'

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
            <Route path="/stock" element={<ProximamentePage titulo="Stock" fase="Fase 2" />} />
            <Route path="/compras" element={<ProximamentePage titulo="Compras" fase="Fase 3" />} />
            <Route path="/pedidos" element={<ProximamentePage titulo="Pedidos de clientes" fase="Fase 4" />} />
            <Route path="/ventas" element={<ProximamentePage titulo="Ventas / TPV" fase="Fase 5" />} />
            <Route path="/facturacion" element={<ProximamentePage titulo="Facturación" fase="Fase 6" />} />
          </Route>
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  )
}

export default App
