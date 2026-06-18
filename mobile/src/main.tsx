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

getTheme().then((t) => document.documentElement.setAttribute('data-theme', t || 'dark')).catch(() => {});

render(<App />, document.getElementById('app')!);
