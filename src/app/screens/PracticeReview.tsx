import { useEffect, useMemo, useState } from 'preact/hooks';
import { CLASS_LABEL, CLASS_SYMBOL } from '../../analysis/summary';
import { cachedSearch } from '../../analysis/runner';
import { pvToSan, uciSquares } from '../../chess/san';
import { endText } from '../../play/coach';
import { finishedGames, saveFinished, type PracticeGame } from '../../play/data';
import { LABEL_NAME, LABEL_SYMBOL } from '../../ui/badges';
import { positions, reviewPractice } from '../../play/review';
import { Board, kingState } from '../../ui/Board';
import { EvalBar, whiteScore } from '../../ui/EvalBar';
import { EvalGraph } from '../../ui/EvalGraph';
import { formatDate } from '../../ui/format';
import { useAsync, useServices } from '../../ui/hooks';
import { href } from '../router';

/** Move number label for ply `i` of a game whose first position is `startFen`. */
function label(startFen: string, i: number): string {
  const [, turn, , , , full] = startFen.split(' ');
  const blackFirst = turn === 'b';
  const ply = i + (blackFirst ? 1 : 0);
  const n = Number(full ?? 1) + Math.floor(ply / 2);
  return ply % 2 === 0 ? `${n}.` : `${n}...`;
}

/**
 * Replays a finished practice game: the board with check and mate marked,
 * the moves with the coach's notes, and an engine review of every move.
 */
export function PracticeReview({ id }: { id: string }) {
  const services = useServices();
  const data = useAsync(async () => {
    if (!services) return undefined;
    return (await finishedGames(services.repo)).find((g) => g.id === id) ?? null;
  }, [services, id]);
  if (data.status !== 'ok' || data.value === undefined) return <p class="screen">Loading…</p>;
  if (!data.value)
    return (
      <section class="screen">
        <h1>Game not found</h1>
        <p>
          Finished practice games are kept on this device; the last 30 are stored.{' '}
          <a href={href('games')}>Back to your games</a>
        </p>
      </section>
    );
  return <ReviewBody game={data.value} />;
}

function ReviewBody({ game: initial }: { game: PracticeGame }) {
  const services = useServices()!;
  const [game, setGame] = useState(initial);
  const [pos, setPos] = useState(initial.moves.length);
  const [progress, setProgress] = useState<string>();
  const fens = useMemo(() => positions(game.startFen, game.moves), [game.id]);
  const sans = useMemo(() => pvToSan(game.startFen, game.moves, game.moves.length), [game.id]);
  const firstToMove = game.startFen.split(' ')[1] === 'b' ? 'black' : 'white';
  const sideAt = (i: number) => ((i % 2 === 0) === (firstToMove === 'white') ? 'white' : 'black');
  const coachNotes = new Map(
    (game.refusals ?? []).filter((r) => r.accepted).map((r) => [r.ply, r]),
  );

  // Review the game with the engine once, then keep the result.
  useEffect(() => {
    if (game.review) return;
    let live = true;
    void reviewPractice(
      game.startFen,
      game.moves,
      game.you,
      cachedSearch(services.repo, services.pool),
      (d, t) =>
        live ? setProgress(`Reviewing with the engine: ${d} of ${t} positions`) : undefined,
    ).then(async (review) => {
      if (!live) return;
      const next = { ...game, review };
      setGame(next);
      setProgress(undefined);
      await saveFinished(services.repo, next);
    });
    return () => {
      live = false;
    };
  }, [game.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 1));
      if (e.key === 'ArrowRight') setPos((p) => Math.min(game.moves.length, p + 1));
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [game.moves.length]);

  const review = game.review;
  const labels = new Map(game.yourMoves.filter((m) => m.label).map((m) => [m.ply, m.label!]));
  const classAt = (ply: number) => review?.classes[ply] ?? coachNotes.get(ply)?.class ?? null;
  const yourPlies = game.moves.map((_, i) => i).filter((i) => sideAt(i) === game.you);
  const blunders = yourPlies.filter((i) => classAt(i) === 'blunder');
  const mistakes = yourPlies.filter((i) => classAt(i) === 'mistake');
  const state = kingState(fens[pos]!);
  const end = game.end;

  return (
    <section class="screen screen--review" aria-labelledby="practice-review-title">
      <h1 id="practice-review-title">
        Practice game review
        <span class="subtitle">
          {formatDate(game.startedAt)} · from {game.source?.label ?? 'the starting position'} ·{' '}
          {end ? (end.kind === 'resigned' ? 'you resigned' : endText(end, game.you)) : 'unfinished'}
        </span>
      </h1>

      <Board
        fen={fens[pos]!}
        orientation={game.you}
        lastMove={pos > 0 ? uciSquares(game.moves[pos - 1]!) : undefined}
        label={
          pos === 0
            ? 'Start position.'
            : `Position after ${label(game.startFen, pos - 1)} ${sans[pos - 1]}.`
        }
      />
      {state !== 'none' && (
        <p class="check-notice" role="status">
          {state === 'mate'
            ? `Checkmate. ${sideAt(pos) === game.you ? 'You were mated.' : 'You won.'}`
            : `${sideAt(pos) === game.you ? 'You are' : 'Your opponent is'} in check.`}
        </p>
      )}
      {review?.evals[pos] && (
        <EvalBar
          score={whiteScore(review.evals[pos]!, sideAt(pos))}
          label="Evaluation of this position"
        />
      )}

      <div class="row row--nav" role="group" aria-label="Move navigation">
        <button type="button" class="button" onClick={() => setPos(0)} disabled={pos === 0}>
          Start
        </button>
        <button type="button" class="button" onClick={() => setPos(pos - 1)} disabled={pos === 0}>
          Back
        </button>
        <button
          type="button"
          class="button"
          onClick={() => setPos(pos + 1)}
          disabled={pos === game.moves.length}
        >
          Next
        </button>
        <button
          type="button"
          class="button"
          onClick={() => setPos(game.moves.length)}
          disabled={pos === game.moves.length}
        >
          End
        </button>
      </div>

      {review ? (
        <EvalGraph
          evals={review.evals}
          marks={blunders}
          minorMarks={mistakes}
          current={pos}
          onSelect={setPos}
          firstToMove={firstToMove}
        />
      ) : (
        <p class="notice">{progress ?? 'Starting the engine review…'}</p>
      )}

      {pos > 0 && !classAt(pos - 1) && labels.get(pos - 1) && (
        <div class="panel panel--good" role="note">
          <p>
            <span class={`tag tag--praise tag--${labels.get(pos - 1)}`}>
              {LABEL_SYMBOL[labels.get(pos - 1)!]} {LABEL_NAME[labels.get(pos - 1)!]}
            </span>{' '}
            {label(game.startFen, pos - 1)} {sans[pos - 1]}
          </p>
        </div>
      )}
      {pos > 0 && classAt(pos - 1) && sideAt(pos - 1) === game.you && (
        <div class={`panel panel--${classAt(pos - 1)}`} role="note">
          <p>
            <span class={`tag tag--${classAt(pos - 1)}`}>
              {CLASS_SYMBOL[classAt(pos - 1)!]} {CLASS_LABEL[classAt(pos - 1)!]}
            </span>{' '}
            {label(game.startFen, pos - 1)} {sans[pos - 1]}
            {review?.best[pos - 1] && review.best[pos - 1] !== game.moves[pos - 1]
              ? `. The engine preferred ${pvToSan(fens[pos - 1]!, [review.best[pos - 1]!], 1)[0]}.`
              : '.'}
          </p>
          {coachNotes.get(pos - 1) && (
            <p class="hint">The coach let this move through during the game.</p>
          )}
        </div>
      )}

      <div class="panel">
        <h2>Moves</h2>
        <ol class="move-list">
          {sans.map((s, i) => {
            const cls = sideAt(i) === game.you ? classAt(i) : null;
            const startsRow = sideAt(i) === 'white' || i === 0;
            return (
              <li key={i} class={sideAt(i) === 'white' ? 'move move--white' : 'move move--black'}>
                {startsRow && <span class="move__num">{label(game.startFen, i)}</span>}
                {i === 0 && sideAt(0) === 'black' && <span class="move__btn" aria-hidden="true" />}
                <button
                  type="button"
                  class={`move__btn${pos === i + 1 ? ' is-current' : ''}${cls ? ` move--${cls}` : ''}`}
                  aria-current={pos === i + 1 ? 'step' : undefined}
                  onClick={() => setPos(i + 1)}
                >
                  {s}
                  {cls
                    ? CLASS_SYMBOL[cls]
                    : labels.get(i) && labels.get(i) !== 'good' && labels.get(i) !== 'excellent'
                      ? LABEL_SYMBOL[labels.get(i)!]
                      : ''}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      <p class="row">
        <a class="button" href={href('play')}>
          New practice game
        </a>
        <a class="button" href={href('games')}>
          All games
        </a>
      </p>
    </section>
  );
}
