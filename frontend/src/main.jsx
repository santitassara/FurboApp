import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { AuthProvider } from './context/AuthContext.jsx';
import { GrupoProvider } from './context/GrupoContext.jsx';
import './index.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <GrupoProvider>
          <App />
        </GrupoProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>
);

// Registra el service worker para soporte PWA offline
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {
    // Service worker no disponible (desarrollo local o HTTP)
  });
}
