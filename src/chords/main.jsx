import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './chords.css'
import App from './App.jsx'

createRoot(document.getElementById('chords-root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
