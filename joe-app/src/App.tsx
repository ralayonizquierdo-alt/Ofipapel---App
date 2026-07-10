import { useState } from 'react'
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

export default function App() {
  const [unlocked, setUnlocked] = useState(false)
  const [showWelcome, setShowWelcome] = useState(true)

  if (!unlocked) return <PinScreen onUnlock={() => setUnlocked(true)} />

  return (
    <BrowserRouter basename="/Ofipapel---App/joe">
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
