import { useState } from 'preact/hooks';
import { lichessGameTime } from '../../import/lichess';
import { ImportError, type Source } from '../../import/types';
import { useAsync, useOnline, useServices } from '../../ui/hooks';
import { importState, startImport } from '../importState';
import { href, navigate } from '../router';

/** The most games one import fetches, so a phone can analyze them. */
const MAX_GAMES = 1000;
const DAY = 24 * 60 * 60 * 1000;

type Range = 'recent' | 'from' | 'between';

/** A range bound from a date, or on Lichess from a game link. */
async function bound(
  source: Source,
  date: string,
  link: string,
  end: boolean,
): Promise<number | undefined> {
  if (source === 'lichess' && link.trim()) {
    const t = await lichessGameTime(link);
    // The linked game itself is in the range.
    return end ? t + 1 : t;
  }
  if (!date) return undefined;
  const day = new Date(`${date}T00:00`).getTime();
  // A date counts the whole day.
  return end ? day + DAY : day;
}

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
  const [range, setRange] = useState<Range>('recent');
  const [fromDate, setFromDate] = useState('');
  const [fromLink, setFromLink] = useState('');
  const [toDate, setToDate] = useState('');
  const [toLink, setToLink] = useState('');
  const [rangeError, setRangeError] = useState<string>();
  const [touched, setTouched] = useState(false);
  const valid = /^[A-Za-z0-9_-]{2,30}$/.test(username.trim());
  const count = Math.min(MAX_GAMES, Math.max(1, Math.round(max) || 1));

  const submit = async (e: Event) => {
    e.preventDefault();
    setTouched(true);
    setRangeError(undefined);
    if (!valid || !online) return;
    if (range === 'recent') {
      void startImport(source, username.trim(), count);
      navigate('analysis');
      return;
    }
    let from: number | undefined;
    let to: number | undefined;
    try {
      from = await bound(source, fromDate, fromLink, false);
      to = range === 'between' ? await bound(source, toDate, toLink, true) : undefined;
    } catch (err) {
      setRangeError(err instanceof ImportError ? err.message : 'Could not read that game link.');
      return;
    }
    if (from === undefined) return setRangeError('Choose where the range starts.');
    if (range === 'between' && to === undefined)
      return setRangeError('Choose where the range ends.');
    if (to !== undefined && to <= from) return setRangeError('The range ends before it starts.');
    void startImport(
      source,
      username.trim(),
      MAX_GAMES,
      to !== undefined ? { from, to } : { from },
    );
    navigate('analysis');
  };
  const boundFields = (which: 'from' | 'to') => {
    const label = which === 'from' ? 'From' : 'To';
    const date = which === 'from' ? fromDate : toDate;
    const setDate = which === 'from' ? setFromDate : setToDate;
    const link = which === 'from' ? fromLink : toLink;
    const setLink = which === 'from' ? setFromLink : setToLink;
    return (
      <div class="field">
        <label for={`${which}-date`}>{label} the date</label>
        <input
          id={`${which}-date`}
          type="date"
          value={date}
          onInput={(e) => setDate(e.currentTarget.value)}
        />
        {source === 'lichess' && (
          <>
            <label for={`${which}-link`}>
              or {which === 'from' ? 'from' : 'to'} a Lichess game link
            </label>
            <input
              id={`${which}-link`}
              type="url"
              inputMode="url"
              autoCapitalize="none"
              spellcheck={false}
              placeholder="https://lichess.org/…"
              value={link}
              onInput={(e) => setLink(e.currentTarget.value)}
            />
          </>
        )}
      </div>
    );
  };

  return (
    <section class="screen" aria-labelledby="connect-title">
      <h1 id="connect-title">Train on your own games</h1>
      <p class="lead">
        Enter your username. Monachessimo downloads your recent games, analyzes them on this device,
        and finds the mistakes you repeat.
      </p>

      <form class="stack" onSubmit={(e) => void submit(e)} noValidate>
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

        <fieldset class="field">
          <legend>Games to import</legend>
          <label class="choice">
            <input
              type="radio"
              name="range"
              checked={range === 'recent'}
              onChange={() => setRange('recent')}
            />
            <span>The most recent games</span>
          </label>
          <label class="choice">
            <input
              type="radio"
              name="range"
              checked={range === 'from'}
              onChange={() => setRange('from')}
            />
            <span>From a game onward</span>
          </label>
          <label class="choice">
            <input
              type="radio"
              name="range"
              checked={range === 'between'}
              onChange={() => setRange('between')}
            />
            <span>From one game to another</span>
          </label>
        </fieldset>

        {range === 'recent' ? (
          <div class="field">
            <label for="max">How many</label>
            <input
              id="max"
              type="number"
              inputMode="numeric"
              min={1}
              max={MAX_GAMES}
              value={max}
              onInput={(e) => setMax(Number(e.currentTarget.value))}
            />
          </div>
        ) : (
          <>
            {boundFields('from')}
            {range === 'between' && boundFields('to')}
            <p class="hint">
              A date counts the whole day.
              {source === 'lichess'
                ? ' A game link starts or ends the range at that game, and it is included.'
                : ' Chess.com cannot look up one game by its link, so use dates.'}{' '}
              Up to {MAX_GAMES} games.
            </p>
          </>
        )}
        {rangeError && (
          <p class="error-text" role="alert">
            {rangeError}
          </p>
        )}
        <p class="hint">
          Rated standard games only. Analysis of 100 games takes a while on a phone.
        </p>

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
