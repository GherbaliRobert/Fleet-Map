import { render } from 'preact';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import '@fontsource/nunito/800.css';
import 'leaflet/dist/leaflet.css';
import './theme/tokens.css';
import './theme/global.css';
import { App } from './App';
import { getTheme } from './lib/storage';
import { API_BASE } from './api/client';

getTheme().then((t) => document.documentElement.setAttribute('data-theme', t || 'dark')).catch(() => {});

// Raportare erori de client → backend (apar în „Erori recente" + Sentry dacă e configurat). Throttle 10/sesiune.
let _erN = 0;
function _reportErr(message?: string, stack?: string) {
  if (_erN >= 10 || !message) return; _erN++;
  try {
    fetch(API_BASE + '/api/client-error', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true,
      body: JSON.stringify({ source: 'mobile', message: String(message).slice(0, 1000), stack: stack ? String(stack).slice(0, 4000) : null, url: location.hash || '' }),
    }).catch(() => {});
  } catch (e) { /* nimic */ }
}
window.addEventListener('error', (e: any) => { if (e && e.message) _reportErr(e.message, e.error && e.error.stack); });
window.addEventListener('unhandledrejection', (e: any) => { const r = e && e.reason; _reportErr('unhandledrejection: ' + (r && r.message ? r.message : String(r)), r && r.stack); });

render(<App />, document.getElementById('app')!);

// Intro animat (o singură dată, la lansare) → se estompează după ce aplicația e montată.
try {
  const _intro = document.getElementById('ra-intro');
  if (_intro) {
    setTimeout(() => {
      _intro.classList.add('ra-hide');
      setTimeout(() => { try { _intro.remove(); } catch (e) { /* noop */ } }, 550);
    }, 1450); // lasă animația pin+ripple+wordmark să se deruleze
  }
} catch (e) { /* noop */ }
