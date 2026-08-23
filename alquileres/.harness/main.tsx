import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import './h.css'
import Dashboard from '../src/pages/Dashboard'
createRoot(document.getElementById('root')!).render(
  <div className="bg-slate-50 min-h-screen"><MemoryRouter><Dashboard /></MemoryRouter></div>,
)
