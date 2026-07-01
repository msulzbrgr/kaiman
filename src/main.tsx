import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { ensureSeed } from './db/db'
import './index.css'

ensureSeed().then(() => {
  ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
})
