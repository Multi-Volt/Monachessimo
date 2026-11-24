import { chessgroundDests } from 'chessops/compat';
import { makeFen } from 'chessops/fen';
import { parseSan } from 'chessops/san';
import type { Square } from 'chessops/types';
import { makeSquare, parseSquare, parseUci } from 'chessops/util';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
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
import {
  firstTarget,
  goalFor,
  goalReached,
  goalText,
  MAX_MOVES,
  type StepTarget,
} from '../../drills/sequence';
import type { Score } from '../../engine/eval';
import { themeDrills } from '../../puzzles/loader';
import type { Drill, Grade, ReviewState } from '../../drills/types';
import { TAG_INFO } from '../../profile/labels';
import { PlanDrill } from '../drills/PlanDrill';
import { ConversionDrill } from '../drills/ConversionDrill';
import { balance, playLine } from '../../detectors/board';
import { Board } from '../../ui/Board';
import { formatDate } from '../../ui/format';
import { useAsync, useServices } from '../../ui/hooks';
import { Tally } from '../../ui/Tally';
import { href } from '../router';

interface Outcome {
  id: string;
  grade: Grade;
  /** How a move drill ended: material won, mate, position held, goal not reached, or puzzle done. */
  how?: 'won' | 'mate' | 'held' | 'partial' | 'puzzle';
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

/** One sentence on how a move drill ended, from what happened on the board. */
function outcomeText(
  how: Outcome['how'],
  moves: string[],
  start: ReturnType<typeof fromFen>,
  end: ReturnType<typeof fromFen>,
): string {
  const list = moves.join(', ');
  const gain = balance(end, start.turn) - balance(start, start.turn);
  switch (how) {
    case 'puzzle':
      return `${moves.at(-1) ?? ''} completes the puzzle.`;
    case 'mate':
      return `Checkmate in ${moves.length} ${moves.length === 1 ? 'move' : 'moves'}: ${list}.`;
    case 'won':
      return `You won ${gain} ${gain === 1 ? 'pawn' : 'pawns'} of material: ${list}.`;
    case 'partial':
      return `After ${moves.length} moves the material is not won yet, but your moves held up: ${list}.`;
    default:
      return moves.length > 1
        ? `You held the position for ${moves.length} moves: ${list}.`
        : `${list} holds the position.`;
  }
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
  | { kind: 'replying'; uci: string }
  | { kind: 'wrong'; uci: string; reason: string }
  | { kind: 'solved'; uci?: string; how: Outcome['how'] }
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
  /** Practice attempts after the first, from "Try again". */
  const [attempt, setAttempt] = useState(0);
  /** True once this drill's first attempt has been scored. */
  const [graded, setGraded] = useState(false);
  /** True while the player has followed the engine line exactly. */
  const [onLine, setOnLine] = useState(true);
  /** The engine's view of the current step, for hints and the answer. */
  const [stepTarget, setStepTarget] = useState<StepTarget>();
  const targets = useRef(new Map<string, Promise<StepTarget>>());
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
    if (
      phase.kind === 'wrong' ||
      phase.kind === 'solved' ||
      phase.kind === 'checking' ||
      phase.kind === 'replying'
    ) {
      const p = pos.clone();
      const m = phase.uci ? parseUci(phase.uci) : undefined;
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
    // Start each drill at the top, so the question and board are in view.
    if (index > 0) scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
    setAttempt(0);
    setGraded(false);
    setOnLine(true);
    setStepTarget(undefined);
    targets.current = new Map();
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

  // Look up the engine's move for the current step, for hints and the answer.
  const targetForRef = useRef<((fen: string, ply: number) => Promise<StepTarget>) | undefined>(
    undefined,
  );
  const currentFen = pos ? makeFen(pos.toSetup()) : '';
  useEffect(() => {
    if (!drill || !currentFen || !targetForRef.current) return;
    let live = true;
    setStepTarget(undefined);
    void targetForRef.current(currentFen, applied.length).then((t) => live && setStepTarget(t));
    return () => {
      live = false;
    };
  }, [currentFen, applied.length, attempt, drill]);

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
    // Only the first attempt at a drill counts. "Try again" is free practice.
    if (graded) return;
    setGraded(true);
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

  const step = applied.length;
  const goal = goalFor(drill);
  const fenNow = makeFen(pos.toSetup());
  const shownPosition = fromFen(shownFen);

  /** The engine's view of the current position, searched once and cached. */
  const targetFor = (fen: string, ply: number): Promise<StepTarget> => {
    if (ply === 0) return Promise.resolve(firstTarget(drill));
    if (drill.solution) {
      const best = drill.solution[ply]!;
      return Promise.resolve({ best, score: drill.bestScore, pv: drill.solution.slice(ply) });
    }
    let t = targets.current.get(fen);
    if (!t) {
      t = services.pool.search({ fen, depth: 14, movetime: 1500 }).then((r) => ({
        best: r.bestmove ?? r.lines[0]?.pv[0] ?? '',
        score: r.lines[0]?.score ?? { kind: 'cp' as const, value: 0 },
        pv: r.lines[0]?.pv ?? [],
      }));
      targets.current.set(fen, t);
    }
    return t;
  };

  targetForRef.current = targetFor;

  /** Ends the drill. `uci` is the player's last move when the board still needs it applied. */
  const complete = async (outcome: Outcome['how'], uci?: string) => {
    setPhase({ kind: 'solved', ...(uci ? { uci } : {}), how: outcome });
    const slow = drill.type === 'time' && Date.now() - startedAt > SLOW_MS;
    const partial = outcome === 'partial';
    await finish(failed ? 'fail' : hintsUsed > 0 || slow || partial ? 'hard' : 'good');
  };

  const submit = async (uci: string) => {
    if (phase.kind !== 'solving') return;
    if (drill.solution) return submitStep(drill.solution, uci);
    setPhase({ kind: 'checking', uci });
    const after = pos.clone();
    after.play(parseUci(uci)!);
    let ok: boolean;
    if (step === 0) {
      let verdict = judge(drill, uci);
      if (verdict === 'unknown')
        verdict =
          after.isCheckmate() || (await holds(after, drill.bestScore)) ? 'correct' : 'wrong';
      ok = verdict === 'correct';
    } else {
      const target = await targetFor(fenNow, step);
      ok = uci === target.best || after.isCheckmate() || (await holds(after, target.score));
    }
    if (!ok) {
      setFailed(true);
      const san = uciToSan(fenNow, uci);
      showWrong(
        uci,
        step === 0 && drill.source?.played === uci
          ? `${san} is the move from your game.`
          : `${san} gives away too much here.`,
      );
      return;
    }
    const made = step / 2 + 1;
    const start = fromFen(drill.fen);
    if (after.isCheckmate()) return complete('mate', uci);
    if (after.isEnd()) return complete('held', uci);
    if (goalReached(goal, start, after, made)) return complete('held', uci);
    // The opponent answers with its best move: along the engine line while
    // the player follows it, otherwise from a fresh search.
    const lineReply = onLine && uci === drill.line[step] ? drill.line[step + 1] : undefined;
    const reply =
      lineReply ??
      (await targetFor(makeFen(after.toSetup()), step + 1).then((t) => t.best || undefined));
    if (!reply) return complete('held', uci);
    setOnLine(!!lineReply);
    setPhase({ kind: 'replying', uci });
    await new Promise((r) => setTimeout(r, 350));
    const next = after.clone();
    next.play(parseUci(reply)!);
    setHintsUsed(0);
    setApplied((a) => [...a, uci, reply]);
    // The goal is checked after the opponent's answer, so material counts
    // only once it is really won.
    if (goal.kind === 'material' && goalReached(goal, start, next, made)) return complete('won');
    if (next.isEnd()) return complete('held');
    if (made >= MAX_MOVES) return complete('partial');
    setPhase({ kind: 'solving' });
  };

  /** True when the position after the player's move keeps the evaluation within tolerance. */
  const holds = async (after: ReturnType<typeof fromFen>, target: Score): Promise<boolean> => {
    if (after.isCheckmate()) return true;
    const r = await services.pool.search({
      fen: makeFen(after.toSetup()),
      depth: 14,
      movetime: 1500,
    });
    const score = r.lines[0] ? negate(r.lines[0].score) : { kind: 'cp' as const, value: 0 };
    return acceptable(score, target);
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
    const after = pos.clone();
    after.play(parseUci(uci)!);
    const last = step >= solution.length - 1;
    const ok = uci === solution[step] || (last && after.isCheckmate());
    if (!ok) {
      setFailed(true);
      showWrong(uci, `${uciToSan(fenNow, uci)} is not the solution.`);
      return;
    }
    if (last) return complete('puzzle', uci);
    setPhase({ kind: 'replying', uci });
    await new Promise((r) => setTimeout(r, 350));
    setHintsUsed(0);
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

  /** Starts the same drill again as practice. The schedule is not touched. */
  const retry = () => {
    setApplied([]);
    setOnLine(true);
    setTryAgain(undefined);
    setLineStep(undefined);
    setHintsUsed(0);
    setSpecialDone(false);
    setAttempt((a) => a + 1);
    setPhase({ kind: 'solving' });
  };

  const stepBest = stepTarget?.best;
  const nextBest = stepBest ?? (drill.solution ? drill.solution[step]! : drill.line[0]!);
  // Hints for the current move: the drill's ladder on the first move, the
  // piece and square of the engine's move after that.
  const stepHints = (() => {
    if (step === 0 || !stepBest) return drill.hints;
    const m = parseUci(stepBest);
    const from = m && 'from' in m ? m.from : undefined;
    const role = from !== undefined ? pos.board.getRole(from) : undefined;
    if (!role || from === undefined) return [];
    return [
      `Move a ${role}.`,
      `Move the ${role} on ${makeSquare(from)}.`,
      `The answer is ${uciToSan(fenNow, stepBest)}.`,
    ];
  })();
  // Every move the player made in this attempt, for the summary.
  const yourMoves =
    phase.kind === 'solved'
      ? (() => {
          const all = phase.uci ? [...applied, phase.uci] : applied;
          return pvToSan(drill.fen, all, all.length).filter((_, i) => i % 2 === 0);
        })()
      : [];

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
    phase.kind === 'wrong' ||
    phase.kind === 'solved' ||
    phase.kind === 'checking' ||
    phase.kind === 'replying'
      ? phase.uci
        ? uciSquares(phase.uci)
        : applied.length
          ? uciSquares(applied[applied.length - 1]!)
          : undefined
      : applied.length
        ? uciSquares(applied[applied.length - 1]!)
        : undefined;
  const shapes =
    phase.kind === 'shown'
      ? [{ orig: uciSquares(nextBest)[0], dest: uciSquares(nextBest)[1], brush: 'green' }]
      : [];

  return (
    <section
      class="screen screen--drill"
      aria-labelledby="drill-title"
      data-drill-id={drill.id}
      data-best={phase.kind === 'solving' ? stepTarget?.best : undefined}
    >
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
      {goalText(goal) && !done && <p class="drill__goal-detail">{goalText(goal)}</p>}
      {drill.type === 'time' && !done && (
        <p class="notice num" role="timer" aria-live="off">
          Time on this drill: {elapsed} s. Aim for under {SLOW_MS / 1000} s.
        </p>
      )}

      {drill.choices ? (
        <PlanDrill key={`${drill.id}@${index}#${attempt}`} drill={drill} onDone={onSpecialDone} />
      ) : drill.type === 'conversion' ? (
        <ConversionDrill
          key={`${drill.id}@${index}#${attempt}`}
          drill={drill}
          onDone={onSpecialDone}
        />
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
              <p class="notice">Checking {uciToSan(fenNow, phase.uci)}…</p>
            )}
            {phase.kind === 'replying' && (
              <p class="notice">
                {uciToSan(fenNow, phase.uci)} is good. Your opponent replies. Keep going.
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
                  <strong>{phase.how === 'partial' ? 'Good effort.' : 'Well played.'}</strong>{' '}
                  {outcomeText(phase.how, yourMoves, fromFen(drill.fen), shownPosition)}
                </p>
              </div>
            )}
            {phase.kind === 'shown' && (
              <div class="panel panel--mistake" role="status">
                <p>
                  <strong>The move here was {bestSan}.</strong>{' '}
                  {drill.solution ? 'Solution' : 'Engine line'} from here:{' '}
                  {pvToSan(
                    fenNow,
                    drill.solution ? drill.solution.slice(step) : (stepTarget?.pv ?? [nextBest]),
                    8,
                  ).join(' ')}
                  .
                </p>
              </div>
            )}
          </div>

          {!done && hintsUsed > 0 && (
            <ol class="hint-list">
              {stepHints.slice(0, hintsUsed).map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ol>
          )}

          <div class="row row--actions">
            {!done && hintsUsed < stepHints.length - 1 && (
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

      {done && (
        <div class="row row--actions">
          <button type="button" class="button" onClick={retry}>
            Try again
          </button>
          <button
            type="button"
            class="button button--primary"
            onClick={() => setIndex((i) => i + 1)}
          >
            {index + 1 < queue.length ? 'Next drill' : 'Finish'}
          </button>
        </div>
      )}
      {attempt > 0 && (
        <p class="hint">
          Practice try. Only your first try counts toward your schedule and rating.
        </p>
      )}

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
