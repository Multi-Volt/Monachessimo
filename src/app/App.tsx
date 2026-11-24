const SOURCE_URL = 'https://github.com/Multi-Volt/Monachessimo';

export function App() {
  return (
    <main class="page">
      <h1>Monachessimo</h1>
      <p class="lead">
        A chess trainer that studies your own games. It runs Stockfish in your browser, finds the
        mistakes you repeat, and builds practice from them.
      </p>
      <p class="status" role="status">
        This is an early build. Game import and training are not ready yet.
      </p>
      <p>
        Your games and analysis will stay on this device. The app has no accounts and no tracking.
      </p>
      <footer>
        <p>
          Free software under the GPL-3.0-or-later license. <a href={SOURCE_URL}>Read the source</a>
          .
        </p>
      </footer>
    </main>
  );
}
