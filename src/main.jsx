import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import AutotestApp from './autotest/AutotestApp.jsx'

// Headless validation entry: ?autotest=1 boots straight into a race
// driven by AI and reports progress / errors into the DOM.
const params = new URLSearchParams(window.location.search)
const isAutotest = params.has('autotest')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {isAutotest ? <AutotestApp /> : <App />}
  </StrictMode>,
)
