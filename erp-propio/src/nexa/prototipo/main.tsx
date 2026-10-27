import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../../index.css'
import { PrototipoNexa } from './PrototipoNexa'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PrototipoNexa />
  </StrictMode>,
)
