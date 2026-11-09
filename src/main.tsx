import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { startOnFirstTap } from './ui/music';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { SpotifyDock } from './ui/spotify';
import './styles.css';

registerSW({ immediate: true });

const root = document.getElementById('root');
if (!root) throw new Error('missing #root');
startOnFirstTap();
createRoot(root).render(
  <StrictMode>
    <App />
    <SpotifyDock />
  </StrictMode>,
);
