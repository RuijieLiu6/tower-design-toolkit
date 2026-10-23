import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Root from './Root'
import { resolveInitialRoute } from './lib/route'
import './index.css'

// Landing page first (#/start), unless the user chose to skip it; #/guided and #/customize open directly.
resolveInitialRoute()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
