const SOURCE_URL = 'https://github.com/Multi-Volt/Monachessimo';

export function About() {
  return (
    <section class="screen prose" aria-labelledby="about-title">
      <h1 id="about-title">About Monachessimo</h1>
      <p>
        Monachessimo is a free chess trainer. It analyzes your own games with Stockfish on your
        device and builds practice from the mistakes you repeat.
      </p>

      <h2>Privacy</h2>
      <p>
        Your games, analysis and practice history stay in this browser. The app contacts only
        Lichess and Chess.com, and only to download the public games of the username you enter.
        There are no accounts, no cookies and no analytics.
      </p>

      <h2>License</h2>
      <p>
        Monachessimo is free software under the GNU General Public License, version 3 or later.{' '}
        <a href={SOURCE_URL}>The source code is on GitHub</a>.
      </p>

      <h2>Credits</h2>
      <ul>
        <li>
          <a href="https://stockfishchess.org">Stockfish</a>, compiled to WebAssembly by Nathan Rugg
          in <a href="https://github.com/nmrugg/stockfish.js">stockfish.js</a>. GPL-3.0.
        </li>
        <li>
          <a href="https://github.com/lichess-org/chessground">Chessground</a> and{' '}
          <a href="https://github.com/niklasf/chessops">chessops</a> from the Lichess project.
          GPL-3.0 or later.
        </li>
        <li>Chess pieces by Colin M.L. Burnett. GPL-2.0 or later.</li>
        <li>
          <a href="https://database.lichess.org/#puzzles">Lichess puzzle database</a>. CC0.
        </li>
        <li>
          Interface reviewed with <a href="https://github.com/heydamir/unslop">unslop</a> by Damir
          Sokolovsky (@heydamir). CC BY 4.0.
        </li>
        <li>
          <a href="https://preactjs.com">Preact</a> (MIT) and{' '}
          <a href="https://github.com/jakearchibald/idb">idb</a> (ISC).
        </li>
      </ul>
      <p>
        The full list is in <a href={`${SOURCE_URL}/blob/main/THIRD_PARTY.md`}>THIRD_PARTY.md</a>.
      </p>
    </section>
  );
}
