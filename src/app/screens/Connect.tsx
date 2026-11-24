import { useState } from 'preact/hooks';
import type { Source } from '../../import/types';
import { useAsync, useOnline, useServices } from '../../ui/hooks';
import { importState, startImport } from '../importState';
import { href, navigate } from '../router';

const GAME_COUNTS = [25, 50, 100, 200, 500];

export function Connect() {
  const services = useServices();
  const online = useOnline();
  const stored = useAsync(async () => {
    if (!services) return undefined;
    const games = await services.repo.allGames();
    const player = await services.repo.getMeta<{ source: Source; username: string }>('player');
    return { count: games.length, player };
  }, [services]);
  const last = stored.status === 'ok' ? stored.value?.player : undefined;

  const [source, setSource] = useState<Source>('lichess');
  const [username, setUsername] = useState('');
  const [max, setMax] = useState(100);
  const [touched, setTouched] = useState(false);
  const valid = /^[A-Za-z0-9_-]{2,30}$/.test(username.trim());

  const submit = (e: Event) => {
    e.preventDefault();
    setTouched(true);
    if (!valid || !online) return;
    void startImport(source, username.trim(), max);
    navigate('analysis');
  };

  return (
    <section class="screen" aria-labelledby="connect-title">
      <h1 id="connect-title">Train on your own games</h1>
      <p class="lead">
        Enter your username. Monachessimo downloads your recent games, analyzes them on this device,
        and finds the mistakes you repeat.
      </p>

      <form class="stack" onSubmit={submit} noValidate>
        <fieldset class="field">
          <legend>Site</legend>
          <div class="segmented">
            {(['lichess', 'chesscom'] as const).map((s) => (
              <label key={s} class="segmented__option">
                <input
                  type="radio"
                  name="source"
                  value={s}
                  checked={source === s}
                  onChange={() => setSource(s)}
                />
                <span>{s === 'lichess' ? 'Lichess' : 'Chess.com'}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div class="field">
          <label for="username">Username</label>
          <input
            id="username"
            name="username"
            type="text"
            inputMode="text"
            autoComplete="username"
            autoCapitalize="none"
            spellcheck={false}
            value={username}
            onInput={(e) => setUsername(e.currentTarget.value)}
            aria-invalid={touched && !valid}
            aria-describedby="username-error"
          />
          {touched && !valid && (
            <p id="username-error" class="error-text">
              Enter a username of 2 to 30 letters, numbers, dashes or underscores.
            </p>
          )}
        </div>

        <div class="field">
          <label for="max">Games to import</label>
          <select id="max" value={max} onChange={(e) => setMax(Number(e.currentTarget.value))}>
            {GAME_COUNTS.map((n) => (
              <option key={n} value={n}>
                {n} most recent
              </option>
            ))}
          </select>
          <p class="hint">
            Rated standard games only. Analysis of 100 games takes a while on a phone.
          </p>
        </div>

        {!online && (
          <p class="notice" role="status">
            You are offline. Connect to the internet to import games.
          </p>
        )}

        <button type="submit" class="button button--primary" disabled={!online}>
          Import games
        </button>
      </form>

      <p class="hint">
        Only your public games are requested from {source === 'lichess' ? 'Lichess' : 'Chess.com'}.
        Games and analysis stay in this browser.
      </p>

      {stored.status === 'ok' && stored.value && stored.value.count > 0 && (
        <p>
          {stored.value.count} games are stored
          {last ? ` for ${last.username}` : ''}. <a href={href()}>See your weaknesses</a>
        </p>
      )}
      {importState.get().status === 'running' && (
        <p>
          An import is running. <a href={href('analysis')}>See progress</a>
        </p>
      )}
    </section>
  );
}
