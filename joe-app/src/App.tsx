import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Layout from './components/Layout'
import WelcomeModal from './components/WelcomeModal'
import PinScreen from './components/PinScreen'
import CalendarPage from './pages/CalendarPage'
import ShiftsPage from './pages/ShiftsPage'
import MusicPage from './pages/MusicPage'
import LimonPage from './pages/LimonPage'
import BusinessPage from './pages/BusinessPage'
import CoisinhasPage from './pages/CoisinhasPage'
import ConectarCuenta from './components/ConectarCuenta'
import { ensureSession, SinSesionError } from './lib/supabase'

export default function App() {
  const [unlocked, setUnlocked] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)
  // null = todavía comprobando. Sin este tercer estado, la pantalla de
  // conectar parpadearía un instante en cada arranque aunque ya haya sesión.
  const [conectado, setConectado] = useState<boolean | null>(null)

  useEffect(() => {
    ensureSession()
      .then(() => setConectado(true))
      .catch((err) => {
        if (err instanceof SinSesionError) {
          setConectado(false)
          return
        }
        // Un fallo de red no debe mandar a nadie a la pantalla de conectar:
        // la sesión guardada sigue ahí y se reintentará al recargar.
        console.error('No se pudo comprobar la sesión de Supabase:', err)
        setConectado(true)
      })
  }, [])

  if (conectado === null) return null
  if (!conectado) return <ConectarCuenta onConectado={() => setConectado(true)} />
  if (!unlocked) return <PinScreen onUnlock={() => setUnlocked(true)} />

  return (
    <BrowserRouter basename="/joe">
      {showWelcome && <WelcomeModal onClose={() => setShowWelcome(false)} />}
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Navigate to="/agenda" replace />} />
          <Route path="agenda" element={<CalendarPage />} />
          <Route path="turnos" element={<ShiftsPage />} />
          <Route path="musica" element={<MusicPage />} />
          <Route path="limon" element={<LimonPage />} />
          <Route path="empresa" element={<BusinessPage />} />
          <Route path="coisinhas" element={<CoisinhasPage />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
