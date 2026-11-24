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
import { buildSession, dayKey, streak } from '../../drills/session';
import type { Drill, Grade, ReviewState } from '../../drills/types';
import { TAG_INFO } from '../../profile/labels';
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
    const session = buildSession(drills, reviews, Date.now(), {
      ...(tag ? { tag } : {}),
      priority,
    });
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
      rating: await getRating(services.repo),
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
  const drill = queue[index];

  const pos = useMemo(() => (drill ? fromFen(drill.fen) : undefined), [drill]);
  const shownFen = useMemo(() => {
    if (!drill || !pos) return '';
    if (phase.kind === 'wrong' || phase.kind === 'solved' || phase.kind === 'checking') {
      const p = pos.clone();
      const m = parseUci(phase.uci);
      if (m && p.isLegal(m)) p.play(m);
      return makeFen(p.toSetup());
    }
    return drill.fen;
  }, [drill, pos, phase]);

  useEffect(() => {
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
    if (phase.kind !== 'solving' && phase.kind !== 'wrong') return;
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
      await finish(failed ? 'fail' : hintsUsed > 0 ? 'hard' : 'good');
    } else {
      setFailed(true);
      const san = uciToSan(drill.fen, uci);
      const reason =
        drill.source?.played === uci
          ? `${san} is the move from your game.`
          : `${san} gives away more than the best move.`;
      setPhase({ kind: 'wrong', uci, reason });
    }
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

  const game = drill.source ? props.games.get(drill.source.gameId) : undefined;
  const opp = game ? (game.userColor === 'white' ? game.black : game.white) : undefined;
  const done = phase.kind === 'solved' || phase.kind === 'shown';
  const bestSan = uciToSan(drill.fen, drill.line[0]!);
  const lastMove =
    phase.kind === 'wrong' || phase.kind === 'solved' || phase.kind === 'checking'
      ? uciSquares(phase.uci)
      : undefined;
  const shapes =
    phase.kind === 'shown' || (phase.kind === 'solved' && phase.uci !== drill.line[0])
      ? [
          {
            orig: uciSquares(drill.line[0]!)[0],
            dest: uciSquares(drill.line[0]!)[1],
            brush: 'green',
          },
        ]
      : [];

  return (
    <section class="screen screen--drill" aria-labelledby="drill-title">
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
        label={`Drill position, ${drill.side} to move. Use the move box below to answer.`}
      />

      {phase.kind === 'solving' && (
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
      )}

      <div aria-live="polite">
        {phase.kind === 'checking' && (
          <p class="notice">Checking {uciToSan(drill.fen, phase.uci)} with the engine…</p>
        )}
        {phase.kind === 'wrong' && (
          <div class="panel panel--mistake" role="status">
            <p>
              <strong>Not this one.</strong> {phase.reason}
            </p>
          </div>
        )}
        {phase.kind === 'solved' && (
          <div class="panel panel--good" role="status">
            <p>
              <strong>Correct.</strong> {uciToSan(drill.fen, phase.uci)} keeps{' '}
              {formatScore(drill.bestScore)}
              {phase.uci !== drill.line[0] ? `. The engine's first choice was ${bestSan}.` : '.'}
            </p>
          </div>
        )}
        {phase.kind === 'shown' && (
          <div class="panel panel--mistake" role="status">
            <p>
              <strong>The answer is {bestSan}.</strong> Engine line:{' '}
              {pvToSan(drill.fen, drill.line, 6).join(' ')}.
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
        {!done && phase.kind === 'wrong' && (
          <button
            type="button"
            class="button button--primary"
            onClick={() => setPhase({ kind: 'solving' })}
          >
            Retry
          </button>
        )}
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
