// D4 — this import is first and is not optional. Ant Design 5's static
// message / notification / Modal.confirm APIs still call the React 18 render
// API; without the patch they throw at runtime rather than at build time, which
// means the failure shows up in a toast nobody tested and not in CI.
import '@ant-design/v5-patch-for-react-19'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import './index.css'

const container = document.getElementById('root')
if (!container) throw new Error('Root element #root is missing from index.html')

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
