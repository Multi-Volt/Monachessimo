import { useEffect, useState } from 'preact/hooks';
import { useRunner, useServices } from '../../ui/hooks';
import { useStore } from '../../ui/store';
import { formatDuration } from '../../ui/format';
import { cancelImport, importState } from '../importState';
import { href } from '../router';

export function Progress() {
  const services = useServices();
  const runner = useRunner(services);
  const imp = useStore(importState);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!imp.waitingUntil) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [imp.waitingUntil]);

  const site = imp.source === 'chesscom' ? 'Chess.com' : 'Lichess';

  return (
    <section class="screen" aria-labelledby="progress-title">
      <h1 id="progress-title">Import and analysis</h1>

      <div class="panel" aria-live="polite">
        <h2>Import</h2>
        {imp.status === 'idle' && <p>No import is running.</p>}
        {imp.status === 'running' && (
          <>
            <p>
              Downloading games for {imp.username} from {site}. {imp.count} new games so far.
            </p>
            {imp.waitingUntil && imp.waitingUntil > now && (
              <p class="notice">
                {site} asked us to slow down. Continuing in{' '}
                {Math.ceil((imp.waitingUntil - now) / 1000)} seconds.
              </p>
            )}
            <button type="button" class="button" onClick={cancelImport}>
              Stop import
            </button>
          </>
        )}
        {imp.status === 'done' && (
          <p>
            Imported {imp.count} new {imp.count === 1 ? 'game' : 'games'} for {imp.username}.
          </p>
        )}
        {imp.status === 'error' && (
          <p class="error-text" role="alert">
            {imp.error} <a href={href()}>Try again</a>
          </p>
        )}
      </div>

      <div class="panel" aria-live="polite">
        <h2>Analysis</h2>
        {!runner && <p>Starting the engine…</p>}
        {runner && <RunnerView state={runner} />}
        {runner && services && (
          <div class="row">
            {runner.status === 'running' ? (
              <button type="button" class="button" onClick={() => void services.runner.pause()}>
                Pause
              </button>
            ) : (
              <button
                type="button"
                class="button button--primary"
                onClick={async () => {
                  await services.runner.enqueuePending();
                  services.runner.start();
                }}
              >
                {runner.status === 'paused' ? 'Resume' : 'Analyze stored games'}
              </button>
            )}
            <a class="button" href={href('games')}>
              Open games
            </a>
          </div>
        )}
      </div>
    </section>
  );
}

function RunnerView({ state }: { state: NonNullable<ReturnType<typeof useRunner>> }) {
  const pct = state.total ? Math.round((state.done / state.total) * 100) : 0;
  if (state.status === 'error')
    return (
      <p class="error-text" role="alert">
        Analysis stopped: {state.error}
      </p>
    );
  if (state.status === 'idle' && state.gamesTotal === 0)
    return <p>Every stored game is analyzed.</p>;
  if (state.status === 'idle')
    return (
      <p>
        Finished. Analyzed {state.gamesDone} of {state.gamesTotal} games.
      </p>
    );
  return (
    <>
      <p>
        Game {Math.min(state.gamesDone + 1, state.gamesTotal)} of {state.gamesTotal}
        {state.status === 'paused' ? ', paused' : ''}.
        {state.phase === 'deep' ? ' Checking flagged moves more deeply.' : ''}
      </p>
      <label class="progress">
        <span class="visually-hidden">Current game</span>
        <progress max={100} value={pct} />
        <span>{pct}%</span>
      </label>
      {state.etaMs !== undefined && state.status === 'running' && (
        <p class="hint">Time left: {formatDuration(state.etaMs)}. Keep this tab open.</p>
      )}
      {state.status === 'paused' && (
        <p class="hint">Progress is saved. You can close the tab and resume later.</p>
      )}
    </>
  );
}
