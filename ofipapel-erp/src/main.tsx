import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'

declare const __USE_HASH_ROUTER__: boolean

// Static exports (opened directly as a file, no server) need HashRouter so
// navigation doesn't rely on the History API resolving real paths.
const Router = __USE_HASH_ROUTER__ ? HashRouter : BrowserRouter
const routerProps = __USE_HASH_ROUTER__ ? {} : { basename: '/erp' }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Router {...routerProps}>
      <App />
    </Router>
  </StrictMode>,
)
