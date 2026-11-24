import { render } from 'preact';
import { App } from './app/App';
import { startPwa } from './pwa/register';
import '@fontsource-variable/figtree';
import './ui/styles.css';

const root = document.getElementById('app');
if (!root) throw new Error('Missing #app element');
render(<App />, root);
void startPwa();
