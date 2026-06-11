import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './app/App'
import './i18n'
import './app/global.css'

const root = ReactDOM.createRoot(document.getElementById('root')!)

// §32 FigureLab — dev-only animation tuning bench (?fxlab=1). The dynamic import keeps it
// (and everything it pulls in) out of the production bundle entirely.
if (import.meta.env.DEV && new URLSearchParams(location.search).get('fxlab') === '1') {
  void import('./ui/fx/scene/FigureLab').then(({ FigureLab }) => {
    root.render(
      <React.StrictMode>
        <FigureLab />
      </React.StrictMode>,
    )
  })
} else {
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>,
  )
}
