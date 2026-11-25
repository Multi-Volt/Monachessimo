import { About } from './screens/About';
import { Dashboard } from './screens/Dashboard';
import { Train } from './screens/Train';
import { Play } from './screens/Play';
import { Lab } from './screens/Lab';
import { hashToFen } from '../lab/position';
import { PracticeReview } from './screens/PracticeReview';
import { WeaknessDetail } from './screens/WeaknessDetail';
import type { TagName } from '../detectors';
import { Connect } from './screens/Connect';
import { Games } from './screens/Games';
import { Progress } from './screens/Progress';
import { Stats } from './screens/Stats';
import { Review } from './screens/Review';
import { Settings } from './screens/Settings';
import { href, useRoute } from './router';
import { useOnline } from '../ui/hooks';
import { useStore } from '../ui/store';
import { applyUpdate, pwaState } from '../pwa/register';

const NAV = [
  { route: '', label: 'Home' },
  { route: 'train', label: 'Train' },
  { route: 'play', label: 'Play' },
  { route: 'lab', label: 'Lab' },
  { route: 'games', label: 'Games' },
];

export function App() {
  const route = useRoute();
  const online = useOnline();
  const pwa = useStore(pwaState);
  const [head = '', arg = '', arg2] = route;

  let screen;
  switch (head) {
    case '':
      screen = <Dashboard />;
      break;
    case 'import':
      screen = <Connect />;
      break;
    case 'practice':
      screen = <PracticeReview id={arg} />;
      break;
    case 'play':
      screen = (
        <Play
          // A new start link must not reuse the setup of the previous one.
          key={`${arg ?? ''}/${arg2 ?? ''}`}
          route={
            arg === 'fen' && arg2
              ? { kind: 'fen', fen: arg2 }
              : arg === 'game' && arg2 !== undefined
                ? { kind: 'game', gameId: arg2, ply: Number(route[3] ?? 0) }
                : { kind: 'new' }
          }
        />
      );
      break;
    case 'lab':
      screen = <Lab initialFen={hashToFen(arg)} />;
      break;
    case 'train':
      screen = <Train tag={arg ? (arg as TagName) : undefined} />;
      break;
    case 'weakness':
      screen = <WeaknessDetail tag={arg as TagName} />;
      break;
    case 'analysis':
      screen = <Progress />;
      break;
    case 'progress':
      screen = <Stats />;
      break;
    case 'games':
      screen = <Games />;
      break;
    case 'game':
      screen = <Review gameId={arg} initialPly={arg2 === undefined ? undefined : Number(arg2)} />;
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
        <span class="topbar__end">
          {!online && <span class="topbar__offline">Offline</span>}
          <a
            class={`topbar__link${head === 'settings' ? ' is-active' : ''}`}
            href={href('settings')}
            aria-current={head === 'settings' ? 'page' : undefined}
          >
            Settings
          </a>
        </span>
      </header>
      {pwa.needRefresh && (
        <div class="update-banner" role="status">
          <span>A new version of Monachessimo is ready.</span>
          <button type="button" class="button button--primary" onClick={() => void applyUpdate()}>
            Reload
          </button>
        </div>
      )}
      <main id="main" tabIndex={-1}>
        {screen}
      </main>
      <nav class="tabbar" aria-label="Main">
        {NAV.map((n) => {
          const active =
            head === n.route ||
            (n.route === 'games' && (head === 'game' || head === 'practice')) ||
            (n.route === '' &&
              (head === 'import' ||
                head === 'weakness' ||
                head === 'analysis' ||
                head === 'progress'));
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
