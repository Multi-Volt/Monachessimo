import { chessgroundDests } from 'chessops/compat';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import type { Square } from 'chessops/types';
import { parseSquare, parseUci } from 'chessops/util';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { standardUci } from '../../chess/uci';
import { uciSquares, uciToSan, pvToSan } from '../../chess/san';
import type { TagName } from '../../detectors';
import { fromFen } from '../../detectors/board';
import { negate } from '../../engine/eval';
import { acceptable, judge } from '../../drills/answers';
import { getRating, recordPracticeDay, saveRating, syncDrills } from '../../drills/data';
import { updateRating } from '../../drills/rating';
import { newReview, schedule } from '../../drills/scheduler';
import { buildSession, dayKey, SESSION_SIZE, streak } from '../../drills/session';
import { themeDrills } from '../../puzzles/loader';
import type { Drill, Grade, ReviewState } from '../../drills/types';
import { TAG_INFO } from '../../profile/labels';
import { PlanDrill } from '../drills/PlanDrill';
import { ConversionDrill } from '../drills/ConversionDrill';
import { balance, playLine } from '../../detectors/board';
import { Board } from '../../ui/Board';
import { formatDate, formatScore } from '../../ui/format';
import { useAsync, useServices } from '../../ui/hooks';
import { Tally } from '../../ui/Tally';
import { href } from '../router';

interface Outcome {
  id: string;
  grade: Grade;
}

export function Train({ tag }: { tag?: TagName | undefined }) {
  const services = useServices();
  const [run, setRun] = useState(0);
  const data = useAsync(async () => {
    if (!services) return undefined;
    const { profile, drills, reviews } = await syncDrills(
      services.repo,
      services.settings.analysis,
    );
    const priority = profile.weaknesses.filter((w) => w.ranked).map((w) => w.tag);
    const now = Date.now();
    const rating = await getRating(services.repo);
    const session = buildSession(drills, reviews, now, {
      ...(tag ? { tag } : {}),
      priority,
    });
    // Fill the rest of the session with Lichess puzzles for the same weaknesses.
    const room = SESSION_SIZE - session.length;
    const themeTags = tag ? [tag] : priority.slice(0, 3);
    if (room > 0 && themeTags.length) {
      const seen = new Set([...reviews.keys(), ...drills.map((x) => x.id)]);
      const puzzles = await themeDrills(
        themeTags,
        rating.rating,
        seen,
        Math.ceil(room / themeTags.length),
        now,
      );
      const picked = puzzles.slice(0, room);
      await services.repo.putDrills(picked);
      session.push(...picked);
    }
    const games = new Map(profile.games.map((g) => [g.id, g]));
    const nextDue = [...reviews.values()]
      .map((r) => r.due)
      .filter((d) => d > Date.now())
      .sort((a, b) => a - b)[0];
    return {
      session,
      reviews,
      games,
      total: drills.length,
      nextDue,
      rating,
    };
  }, [services, tag, run]);

  if (data.status === 'error')
    return (
      <p class="screen error-text" role="alert">
        Could not build a session: {data.error}
      </p>
    );
  if (data.status === 'loading' || !services || !data.value)
    return <p class="screen">Preparing your drills…</p>;
  const d = data.value;
  const title = tag ? (TAG_INFO[tag]?.label ?? 'Practice') : 'Daily practice';

  if (d.session.length === 0)
    return (
      <section class="screen" aria-labelledby="train-title">
        <h1 id="train-title">{title}</h1>
        {d.total === 0 ? (
          <p>
            Drills come from mistakes in your analyzed games. Import and analyze some games first.{' '}
            <a href={href('import')}>Import games</a>
          </p>
        ) : (
          <p>
            Nothing is due right now.
            {d.nextDue ? ` The next drill is due ${formatDue(d.nextDue)}.` : ''}
          </p>
        )}
        {tag && (
          <p>
            <a href={href('train')}>Go to daily practice</a>
          </p>
        )}
      </section>
    );

  return (
    <Session
      key={run}
      title={title}
      drills={d.session}
      reviews={d.reviews}
      games={d.games}
      startRating={d.rating.rating}
      onRestart={() => setRun((r) => r + 1)}
    />
  );
}

/** How long a wrong move stays on the board before the piece goes back. */
const WRONG_MS = 900;

/** A correct answer in a time drill that took longer than this counts as "hard". */
const SLOW_MS = 30_000;

function LineStepper(props: {
  drill: Drill;
  positions: ReturnType<typeof playLine>;
  step: number | undefined;
  onStep: (n: number | undefined) => void;
  total: number;
}) {
  const { drill, step, positions } = props;
  const line = drill.solution ?? drill.line;
  const sans = pvToSan(drill.fen, line, props.total);
  const start = fromFen(drill.fen);
  const at = step !== undefined ? positions[step] : undefined;
  const diff = at ? balance(at, drill.side) - balance(start, drill.side) : 0;
  const label =
    drill.type === 'sacrifice' ? 'Does it work? Step through the line' : 'Step through the line';
  if (step === undefined)
    return (
      <p>
        <button type="button" class="button" onClick={() => props.onStep(0)}>
          {label}
        </button>
      </p>
    );
  return (
    <div class="panel stepper">
      <p class="num">
        {step === 0 ? 'Start position.' : `After ${sans.slice(0, step).join(' ')}.`} Material:{' '}
        {diff === 0
          ? 'even with the start'
          : diff > 0
            ? `${diff} up on the start`
            : `${-diff} down on the start`}
        .{at?.isCheckmate() ? ' Checkmate.' : ''}
      </p>
      <div class="row">
        <button
          type="button"
          class="button"
          disabled={step === 0}
          onClick={() => props.onStep(step - 1)}
        >
          Back
        </button>
        <button
          type="button"
          class="button"
          disabled={step >= Math.min(sans.length, positions.length - 1)}
          onClick={() => props.onStep(step + 1)}
        >
          Forward
        </button>
        <button type="button" class="button" onClick={() => props.onStep(undefined)}>
          Done
        </button>
      </div>
    </div>
  );
}

function formatDue(t: number): string {
  const min = Math.round((t - Date.now()) / 60000);
  if (min < 60) return `in ${Math.max(1, min)} minutes`;
  if (min < 36 * 60) return `in ${Math.round(min / 60)} hours`;
  return `on ${formatDate(t)}`;
}

type Phase =
  | { kind: 'solving' }
  | { kind: 'checking'; uci: string }
  | { kind: 'wrong'; uci: string; reason: string }
  | { kind: 'solved'; uci: string }
  | { kind: 'shown' };

function Session(props: {
  title: string;
  drills: Drill[];
  reviews: Map<string, ReviewState>;
  games: Map<string, import('../../import/types').Game>;
  startRating: number;
  onRestart: () => void;
}) {
  const services = useServices()!;
  const [queue, setQueue] = useState(props.drills);
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>({ kind: 'solving' });
  const [hintsUsed, setHintsUsed] = useState(0);
  const [failed, setFailed] = useState(false);
  const [typed, setTyped] = useState('');
  const [typedError, setTypedError] = useState<string>();
  const [outcomes, setOutcomes] = useState<Outcome[]>([]);
  const [rating, setRating] = useState(props.startRating);
  /** Moves already played in a multi-move puzzle, both sides. */
  const [applied, setApplied] = useState<string[]>([]);
  /** Set when a plan or conversion drill has ended. */
  const [specialDone, setSpecialDone] = useState(false);
  /** Position in the solution line while stepping through it, after the drill. */
  const [lineStep, setLineStep] = useState<number>();
  const [startedAt, setStartedAt] = useState(Date.now());
  /** Why the last move was wrong, shown while the player tries again. */
  const [tryAgain, setTryAgain] = useState<string>();
  const [elapsed, setElapsed] = useState(0);
  const drill = queue[index];

  const pos = useMemo(() => {
    if (!drill) return undefined;
    const p = fromFen(drill.fen);
    for (const u of applied) {
      const m = parseUci(u);
      if (m && p.isLegal(m)) p.play(m);
    }
    return p;
  }, [drill, applied]);
  const fullLine = drill ? (drill.solution ?? drill.line) : [];
  const stepPositions = useMemo(
    () =>
      drill && lineStep !== undefined
        ? playLine(fromFen(drill.fen), fullLine, fullLine.length)
        : [],
    [drill, lineStep !== undefined],
  );
  const shownFen = useMemo(() => {
    if (!drill || !pos) return '';
    if (lineStep !== undefined && stepPositions[lineStep])
      return makeFen(stepPositions[lineStep]!.toSetup());
    if (phase.kind === 'wrong' || phase.kind === 'solved' || phase.kind === 'checking') {
      const p = pos.clone();
      const m = parseUci(phase.uci);
      if (m && p.isLegal(m)) p.play(m);
      return makeFen(p.toSetup());
    }
    return makeFen(pos.toSetup());
  }, [drill, pos, phase, lineStep, stepPositions]);

  // A visible timer for time-awareness drills.
  useEffect(() => {
    if (drill?.type !== 'time') return;
    const t = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 1000);
    return () => clearInterval(t);
  }, [drill, startedAt]);

  useEffect(() => {
    setTryAgain(undefined);
    setApplied([]);
    setSpecialDone(false);
    setLineStep(undefined);
    setStartedAt(Date.now());
    setElapsed(0);
    setHintsUsed(0);
    setFailed(false);
    setTyped('');
    setTypedError(undefined);
    setPhase({ kind: 'solving' });
  }, [index]);

  if (!drill || !pos)
    return (
      <SessionEnd
        outcomes={outcomes}
        rating={rating}
        start={props.startRating}
        onRestart={props.onRestart}
      />
    );

  const finish = async (grade: Grade) => {
    const now = Date.now();
    const prev = props.reviews.get(drill.id) ?? newReview(drill.id, now);
    const next = schedule(prev, grade, now);
    props.reviews.set(drill.id, next);
    await services.repo.putReview(next);
    const r = updateRating(rating, drill.rating, grade);
    setRating(r);
    await saveRating(services.repo, r, now);
    setOutcomes((o) => [...o, { id: drill.id, grade }]);
    // A miss comes back once more at the end of this session.
    if (grade === 'fail' && !queue.slice(index + 1).some((q) => q.id === drill.id))
      setQueue((q) => [...q, drill]);
  };

  const submit = async (uci: string) => {
    if (phase.kind !== 'solving') return;
    if (drill.solution) return submitStep(drill.solution, uci);
    let verdict = judge(drill, uci);
    setPhase({ kind: 'checking', uci });
    if (verdict === 'unknown') {
      const after = pos.clone();
      after.play(parseUci(uci)!);
      if (after.isCheckmate()) verdict = 'correct';
      else {
        const r = await services.pool.search({
          fen: makeFen(after.toSetup()),
          depth: 14,
          movetime: 1500,
        });
        const score = r.lines[0] ? negate(r.lines[0].score) : { kind: 'cp' as const, value: 0 };
        verdict = acceptable(score, drill.bestScore) ? 'correct' : 'wrong';
      }
    }
    if (verdict === 'correct') {
      setPhase({ kind: 'solved', uci });
      const slow = drill.type === 'time' && Date.now() - startedAt > SLOW_MS;
      await finish(failed ? 'fail' : hintsUsed > 0 || slow ? 'hard' : 'good');
    } else {
      setFailed(true);
      const san = uciToSan(fenNow, uci);
      const reason =
        drill.source?.played === uci
          ? `${san} is the move from your game.`
          : `${san} gives away more than the best move.`;
      showWrong(uci, reason);
    }
  };

  /** Shows a wrong move on the board for a moment, then puts the piece back. */
  const showWrong = (uci: string, reason: string) => {
    setPhase({ kind: 'wrong', uci, reason });
    setTryAgain(reason);
    setTimeout(
      () => setPhase((p) => (p.kind === 'wrong' && p.uci === uci ? { kind: 'solving' } : p)),
      WRONG_MS,
    );
  };

  /** One move of a multi-move puzzle. Only the listed move counts, or any mate on the last move. */
  const submitStep = async (solution: string[], uci: string) => {
    const step = applied.length;
    const after = pos.clone();
    after.play(parseUci(uci)!);
    const last = step >= solution.length - 1;
    const ok = uci === solution[step] || (last && after.isCheckmate());
    const fenNow = makeFen(pos.toSetup());
    if (!ok) {
      setFailed(true);
      showWrong(uci, `${uciToSan(fenNow, uci)} is not the solution.`);
      return;
    }
    if (last) {
      setPhase({ kind: 'solved', uci });
      await finish(failed ? 'fail' : hintsUsed > 0 ? 'hard' : 'good');
      return;
    }
    setPhase({ kind: 'checking', uci });
    await new Promise((r) => setTimeout(r, 350));
    setApplied((a) => [...a, uci, solution[step + 1]!]);
    setPhase({ kind: 'solving' });
  };

  const onBoardMove = (orig: string, dest: string) => {
    const from = parseSquare(orig)!;
    const to = parseSquare(dest)!;
    const role = pos.board.getRole(from);
    const lastRank = drill.side === 'white' ? 7 : 0;
    const promotion = role === 'pawn' && Math.floor(to / 8) === lastRank ? 'queen' : undefined;
    const move = { from: from as Square, to: to as Square, ...(promotion ? { promotion } : {}) };
    void submit(standardUci(pos, move as never));
  };

  const onTyped = (e: Event) => {
    e.preventDefault();
    const text = typed.trim();
    const m = parseSan(pos, text) ?? parseUci(text.toLowerCase());
    if (!m || !pos.isLegal(m)) {
      setTypedError(
        `${text || 'That'} is not a legal move here. Use SAN like Nf3 or UCI like g1f3.`,
      );
      return;
    }
    setTypedError(undefined);
    void submit(standardUci(pos, m));
  };

  const showAnswer = async () => {
    setPhase({ kind: 'shown' });
    await finish('fail');
  };
  const fenNow = makeFen(pos.toSetup());
  const nextBest = drill.solution ? drill.solution[applied.length]! : drill.line[0]!;

  const game = drill.source ? props.games.get(drill.source.gameId) : undefined;
  const opp = game ? (game.userColor === 'white' ? game.black : game.white) : undefined;
  const special = !!drill.choices || drill.type === 'conversion';
  const done = special ? specialDone : phase.kind === 'solved' || phase.kind === 'shown';
  const onSpecialDone = (g: Grade) => {
    setSpecialDone(true);
    void finish(g);
  };
  const bestSan = uciToSan(fenNow, nextBest);
  const lastMove =
    phase.kind === 'wrong' || phase.kind === 'solved' || phase.kind === 'checking'
      ? uciSquares(phase.uci)
      : applied.length
        ? uciSquares(applied[applied.length - 1]!)
        : undefined;
  const shapes =
    phase.kind === 'shown' || (phase.kind === 'solved' && phase.uci !== nextBest)
      ? [{ orig: uciSquares(nextBest)[0], dest: uciSquares(nextBest)[1], brush: 'green' }]
      : [];

  return (
    <section class="screen screen--drill" aria-labelledby="drill-title" data-drill-id={drill.id}>
      <p class="drill__count num">
        {props.title} · {Math.min(index + 1, queue.length)} of {queue.length}
      </p>
      <h1 id="drill-title" class="drill__goal">
        {drill.goal}
      </h1>
      <p class="hint">
        {drill.side === 'white' ? 'White' : 'Black'} to move
        {game && opp ? ` · from your game vs ${opp.name}, ${formatDate(game.playedAt)}` : ''}
      </p>
      {drill.type === 'time' && !done && (
        <p class="notice num" role="timer" aria-live="off">
          Time on this drill: {elapsed} s. Aim for under {SLOW_MS / 1000} s.
        </p>
      )}

      {drill.choices ? (
        <PlanDrill key={`${drill.id}@${index}`} drill={drill} onDone={onSpecialDone} />
      ) : drill.type === 'conversion' ? (
        <ConversionDrill key={`${drill.id}@${index}`} drill={drill} onDone={onSpecialDone} />
      ) : (
        <>
          <Board
            fen={shownFen}
            orientation={drill.side}
            lastMove={lastMove}
            shapes={shapes as never}
            movable={
              phase.kind === 'solving'
                ? {
                    color: drill.side,
                    dests: chessgroundDests(pos) as unknown as Map<string, string[]>,
                  }
                : undefined
            }
            onMove={onBoardMove}
            label={
              lineStep !== undefined
                ? `Engine line, after ${lineStep} of ${fullLine.length} moves`
                : `Drill position, ${drill.side} to move. Drag or tap a piece to move it, or type a move below.`
            }
          />

          {lineStep === undefined && !done && (
            <p class="hint board-help">Drag a piece, or tap it and then tap where it goes.</p>
          )}
          {phase.kind === 'solving' && (
            <details class="move-type">
              <summary>Type a move instead</summary>
              <form class="move-input" onSubmit={onTyped}>
                <label for="typed-move">Type a move</label>
                <div class="row">
                  <input
                    id="typed-move"
                    type="text"
                    autoComplete="off"
                    autoCapitalize="none"
                    spellcheck={false}
                    placeholder="Nf3 or g1f3"
                    value={typed}
                    onInput={(e) => setTyped(e.currentTarget.value)}
                    aria-describedby={typedError ? 'typed-error' : undefined}
                  />
                  <button type="submit" class="button">
                    Play
                  </button>
                </div>
                {typedError && (
                  <p id="typed-error" class="error-text" role="alert">
                    {typedError}
                  </p>
                )}
              </form>
            </details>
          )}

          <div aria-live="polite">
            {phase.kind === 'checking' && (
              <p class="notice">
                {drill.solution
                  ? `${uciToSan(fenNow, phase.uci)} is right. Your opponent replies.`
                  : `Checking ${uciToSan(fenNow, phase.uci)} with the engine…`}
              </p>
            )}
            {tryAgain && (phase.kind === 'wrong' || phase.kind === 'solving') && (
              <div class="panel panel--mistake" role="status">
                <p>
                  <strong>Not this one.</strong> {tryAgain} Try another move.
                </p>
              </div>
            )}
            {phase.kind === 'solved' && (
              <div class="panel panel--good" role="status">
                <p>
                  <strong>Correct.</strong>{' '}
                  {drill.solution
                    ? `${uciToSan(fenNow, phase.uci)} completes the puzzle.`
                    : `${uciToSan(fenNow, phase.uci)} keeps ${formatScore(drill.bestScore)}${
                        phase.uci !== nextBest ? `. The engine's first choice was ${bestSan}.` : '.'
                      }`}
                </p>
              </div>
            )}
            {phase.kind === 'shown' && (
              <div class="panel panel--mistake" role="status">
                <p>
                  <strong>The answer is {bestSan}.</strong>{' '}
                  {drill.solution ? 'Solution' : 'Engine line'}:{' '}
                  {pvToSan(
                    fenNow,
                    drill.solution ? drill.solution.slice(applied.length) : drill.line,
                    8,
                  ).join(' ')}
                  .
                </p>
              </div>
            )}
          </div>

          {!done && hintsUsed > 0 && (
            <ol class="hint-list">
              {drill.hints.slice(0, hintsUsed).map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ol>
          )}

          <div class="row row--actions">
            {!done && hintsUsed < drill.hints.length - 1 && (
              <button
                type="button"
                class="button"
                onClick={() => setHintsUsed((h) => h + 1)}
                disabled={phase.kind === 'checking'}
              >
                {hintsUsed === 0 ? 'Hint' : 'Another hint'}
              </button>
            )}
            {!done && (
              <button
                type="button"
                class="button"
                onClick={() => void showAnswer()}
                disabled={phase.kind === 'checking'}
              >
                Show answer
              </button>
            )}
          </div>
          {done && fullLine.length > 1 && (
            <LineStepper
              drill={drill}
              positions={stepPositions}
              step={lineStep}
              onStep={setLineStep}
              total={fullLine.length}
            />
          )}
        </>
      )}

      <div class="row row--actions">
        {done && (
          <button
            type="button"
            class="button button--primary"
            onClick={() => setIndex((i) => i + 1)}
          >
            {index + 1 < queue.length ? 'Next drill' : 'Finish'}
          </button>
        )}
      </div>

      {done && (
        <div class="panel">
          <h2>Why</h2>
          {drill.explanation.map((p) => (
            <p key={p}>{p}</p>
          ))}
          {drill.tags.length > 0 && (
            <p class="hint">Patterns: {drill.tags.map((t) => TAG_INFO[t].label).join(', ')}</p>
          )}
          {game && drill.source && (
            <p>
              <a href={href('game', game.id, String(drill.source.ply))}>
                Open this position in the game
              </a>
            </p>
          )}
        </div>
      )}
    </section>
  );
}

function SessionEnd(props: {
  outcomes: Outcome[];
  rating: number;
  start: number;
  onRestart: () => void;
}) {
  const services = useServices();
  const [days, setDays] = useState<string[]>();
  useEffect(() => {
    if (!services) return;
    void recordPracticeDay(services.repo, dayKey(Date.now())).then(setDays);
  }, [services]);
  const count = (g: Grade) => props.outcomes.filter((o) => o.grade === g).length;
  const s = days ? streak(days, Date.now()) : 0;
  const diff = props.rating - props.start;
  return (
    <section class="screen" aria-labelledby="end-title">
      <h1 id="end-title">Session done</h1>
      <ul class="plain-list num">
        <li>
          <span>Solved first try</span> <span>{count('good')}</span>
        </li>
        <li>
          <span>Solved with a hint</span> <span>{count('hard')}</span>
        </li>
        <li>
          <span>Missed</span> <span>{count('fail')}</span>
        </li>
        <li>
          <span>Puzzle rating</span>
          <span>
            {props.rating} ({diff >= 0 ? '+' : '−'}
            {Math.abs(diff)})
          </span>
        </li>
      </ul>
      {count('fail') > 0 && (
        <p>Missed positions come back in ten minutes, and again tomorrow until you solve them.</p>
      )}
      {days && (
        <div class="streak">
          <Tally count={s} label={`${s} ${s === 1 ? 'day' : 'days'} of practice in a row`} />
          <p class="hint">
            {s} {s === 1 ? 'day' : 'days'} of practice in a row
          </p>
        </div>
      )}
      <div class="row">
        <a class="button button--primary" href={href()}>
          Back to your weaknesses
        </a>
        <button type="button" class="button" onClick={props.onRestart}>
          Check for more drills
        </button>
      </div>
    </section>
  );
}
