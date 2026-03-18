import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { toast } from './hooks/useToast';
import App from './App';
import './index.css';

// Register service worker with auto-update
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    toast.info('New version available — reloading...', 5000);
    // Give user a moment to see the toast, then reload
    setTimeout(() => updateSW(true), 1500);
  },
  onOfflineReady() {
    toast.success('App ready to work offline');
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
