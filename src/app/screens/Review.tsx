import { useEffect, useMemo, useState } from 'preact/hooks';
import { CLASS_LABEL, CLASS_SYMBOL, worstMoves } from '../../analysis/summary';
import { replay, moveLabel } from '../../analysis/positions';
import { settingsKey, type PlyReview } from '../../analysis/types';
import { pvToSan, uciSquares, uciToSan } from '../../chess/san';
import { Board } from '../../ui/Board';
import { EvalGraph } from '../../ui/EvalGraph';
import { formatDate, formatScore } from '../../ui/format';
import { useAsync, useRunner, useServices } from '../../ui/hooks';
import { href } from '../router';

export function Review({
  gameId,
  initialPly,
}: {
  gameId: string;
  initialPly?: number | undefined;
}) {
  const services = useServices();
  const runner = useRunner(services);
  const data = useAsync(async () => {
    if (!services) return undefined;
    const game = await services.repo.getGame(gameId);
    if (!game) return null;
    const a = await services.repo.getAnalysis(gameId);
    const analysis = a?.settings === settingsKey(services.settings.analysis) ? a : undefined;
    return { game, analysis, fens: replay(game.uci) };
  }, [services, gameId, runner?.currentGameId === gameId ? runner.done : 0]);

  const [pos, setPos] = useState(initialPly ?? 0);
  const value = data.status === 'ok' ? data.value : undefined;
  const n = value ? value.game.uci.length : 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, select, textarea')) return;
      if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 1));
      if (e.key === 'ArrowRight') setPos((p) => Math.min(n, p + 1));
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [n]);

  const reviews = useMemo(
    () => new Map((value?.analysis?.reviews ?? []).filter((r) => r.class).map((r) => [r.ply, r])),
    [value],
  );

  if (data.status === 'loading' || !services) return <p class="screen">Loading game…</p>;
  if (data.status === 'error')
    return (
      <p class="screen error-text" role="alert">
        Could not load this game: {data.error}
      </p>
    );
  if (!value)
    return (
      <section class="screen">
        <h1>Game not found</h1>
        <p>
          This game is not stored on this device. <a href={href('games')}>Back to your games</a>
        </p>
      </section>
    );

  const { game, analysis, fens } = value;
  const here = reviews.get(pos);
  const lastMove = pos > 0 ? uciSquares(game.uci[pos - 1]!) : undefined;
  const shapes = here
    ? [
        { orig: uciSquares(here.uci)[0], dest: uciSquares(here.uci)[1], brush: 'red' },
        ...(here.lines[0]
          ? [
              {
                orig: uciSquares(here.lines[0].pv[0]!)[0],
                dest: uciSquares(here.lines[0].pv[0]!)[1],
                brush: 'green',
              },
            ]
          : []),
      ]
    : [];
  const opp = game.userColor === 'white' ? game.black : game.white;

  return (
    <section class="screen screen--review" aria-labelledby="review-title">
      <h1 id="review-title">
        You vs {opp.name}
        <span class="subtitle">
          {formatDate(game.playedAt)} · {game.speed} ·{' '}
          <a href={game.url} target="_blank" rel="noopener noreferrer">
            View on {game.source === 'lichess' ? 'Lichess' : 'Chess.com'}
          </a>
        </span>
      </h1>

      <Board
        fen={fens[pos]!}
        orientation={game.userColor}
        lastMove={lastMove}
        shapes={shapes as never}
        label={`Position after ${pos === 0 ? 'no moves' : `${moveLabel(pos - 1)} ${game.san[pos - 1]}`}`}
      />

      <div class="row row--nav" role="group" aria-label="Move navigation">
        <button type="button" class="button" onClick={() => setPos(0)} disabled={pos === 0}>
          Start
        </button>
        <button
          type="button"
          class="button"
          onClick={() => setPos(Math.max(0, pos - 1))}
          disabled={pos === 0}
        >
          Back
        </button>
        <button
          type="button"
          class="button"
          onClick={() => setPos(Math.min(n, pos + 1))}
          disabled={pos === n}
        >
          Next
        </button>
        <button type="button" class="button" onClick={() => setPos(n)} disabled={pos === n}>
          End
        </button>
      </div>

      {here && <MistakeDetail review={here} fen={fens[pos]!} />}

      {analysis ? (
        <EvalGraph
          evals={analysis.evals}
          marks={[...reviews.values()].filter((r) => r.class === 'blunder').map((r) => r.ply)}
          current={pos}
          onSelect={setPos}
        />
      ) : (
        <p class="notice">
          This game is not analyzed yet. <a href={href('analysis')}>See analysis progress</a>
        </p>
      )}

      {analysis && (
        <div class="panel">
          <h2>Your mistakes</h2>
          {worstMoves(analysis).length === 0 ? (
            <p>The engine found no inaccuracies, mistakes or blunders in your moves.</p>
          ) : (
            <ul class="mistake-list">
              {worstMoves(analysis).map((r) => (
                <li key={r.ply}>
                  <button type="button" class="mistake-row" onClick={() => setPos(r.ply)}>
                    <span class={`tag tag--${r.class}`}>
                      {CLASS_SYMBOL[r.class!]} {CLASS_LABEL[r.class!]}
                    </span>
                    <span>
                      {moveLabel(r.ply)} {r.san}: {formatScore(r.lines[0]?.score ?? r.playedScore)}{' '}
                      to {formatScore(r.playedScore)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div class="panel">
        <h2>Moves</h2>
        <ol class="move-list">
          {game.san.map((s, i) => {
            const r = reviews.get(i);
            return (
              <li key={i} class={i % 2 === 0 ? 'move move--white' : 'move move--black'}>
                {i % 2 === 0 && <span class="move__num">{i / 2 + 1}.</span>}
                <button
                  type="button"
                  class={`move__btn${pos === i + 1 ? ' is-current' : ''}${r ? ` move--${r.class}` : ''}`}
                  aria-current={pos === i + 1 ? 'step' : undefined}
                  onClick={() => setPos(i + 1)}
                >
                  {s}
                  {r?.class ? CLASS_SYMBOL[r.class] : ''}
                </button>
              </li>
            );
          })}
        </ol>
      </div>
    </section>
  );
}

function MistakeDetail({ review, fen }: { review: PlyReview; fen: string }) {
  const best = review.lines[0];
  const bestSan = best ? uciToSan(fen, best.pv[0]!) : undefined;
  const line = best ? pvToSan(fen, best.pv, 6).join(' ') : '';
  return (
    <div class={`panel panel--${review.class}`} role="note">
      <p>
        <strong>
          {moveLabel(review.ply)} {review.san}
          {review.class ? CLASS_SYMBOL[review.class] : ''}{' '}
          {review.class ? CLASS_LABEL[review.class].toLowerCase() : ''}.
        </strong>{' '}
        Your position went from {formatScore(best?.score ?? review.playedScore)} to{' '}
        {formatScore(review.playedScore)}.
      </p>
      {bestSan && (
        <p>
          Best was <strong>{bestSan}</strong>. Engine line: {line}
        </p>
      )}
      <p class="hint">Red arrow: your move. Green arrow: the engine's move.</p>
    </div>
  );
}
