import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

console.warn('[POS DIAGNOSTIC ACTIVE]', {
  build: 'al-luluah-erp-fixed-v2-pos-drawer-diagnostic',
  entry: 'src/main.tsx',
  loadedAt: new Date().toISOString(),
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
