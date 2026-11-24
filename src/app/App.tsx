import { About } from './screens/About';
import { Connect } from './screens/Connect';
import { Games } from './screens/Games';
import { Progress } from './screens/Progress';
import { Review } from './screens/Review';
import { Settings } from './screens/Settings';
import { href, useRoute } from './router';
import { useOnline } from '../ui/hooks';

const NAV = [
  { route: '', label: 'Import' },
  { route: 'games', label: 'Games' },
  { route: 'settings', label: 'Settings' },
];

export function App() {
  const route = useRoute();
  const online = useOnline();
  const [head = '', arg = ''] = route;

  let screen;
  switch (head) {
    case '':
      screen = <Connect />;
      break;
    case 'progress':
      screen = <Progress />;
      break;
    case 'games':
      screen = <Games />;
      break;
    case 'game':
      screen = <Review gameId={arg} />;
      break;
    case 'settings':
      screen = <Settings />;
      break;
    case 'about':
      screen = <About />;
      break;
    default:
      screen = (
        <section class="screen">
          <h1>Page not found</h1>
          <p>
            <a href={href()}>Go to the start</a>
          </p>
        </section>
      );
  }

  return (
    <div class="app">
      <a class="skip-link" href="#main">
        Skip to content
      </a>
      <header class="topbar">
        <a class="topbar__name" href={href()}>
          Monachessimo
        </a>
        {!online && <span class="topbar__offline">Offline</span>}
      </header>
      <main id="main" tabIndex={-1}>
        {screen}
      </main>
      <nav class="tabbar" aria-label="Main">
        {NAV.map((n) => {
          const active = head === n.route || (n.route === 'games' && head === 'game');
          return (
            <a
              key={n.route}
              href={href(...(n.route ? [n.route] : []))}
              class={`tabbar__item${active ? ' is-active' : ''}`}
              aria-current={active ? 'page' : undefined}
            >
              {n.label}
            </a>
          );
        })}
      </nav>
    </div>
  );
}
