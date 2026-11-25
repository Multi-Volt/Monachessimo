import type { DrawShape } from 'chessground/draw';
import type { Key } from 'chessground/types';
import { chessgroundDests } from 'chessops/compat';
import { parseSquare } from 'chessops/util';
import type { ComponentChildren } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { standardUci } from '../../chess/uci';
import {
  courseText,
  LEVEL_TEXT,
  lessonText,
  loadLearn,
  type LearnContent,
  type LessonRef,
} from '../../learn/curriculum';
import {
  board,
  demoMove,
  isCheckmate,
  isRightMove,
  judgeOwnMove,
  judgeReply,
  lessonStars,
  moveStepDone,
  moveStepStart,
  playerSide,
  play,
  shortestStars,
  sideToMove,
  starsDests,
  starsMove,
  starsStart,
  wrongReason,
  type PlayResult,
  type StarsState,
} from '../../learn/rules';
import {
  isTask,
  type InfoStep,
  type MoveStep,
  type PlayStep,
  type QuizStep,
  type SquareStep,
  type StarsStep,
  type StepDef,
} from '../../learn/types';
import type { LessonProgress } from '../../store/db';
import { arrow, ring } from '../../ui/badges';
import { Board } from '../../ui/Board';
import { SpeakButton } from '../../ui/SpeakButton';
import { useAsync, useServices } from '../../ui/hooks';
import { TypedMove } from '../drills/ConversionDrill';
import { href } from '../router';

/** `**bold**` in lesson texts, as <strong>. */
function Rich({ text }: { text: string }) {
  const parts = text.split(/\*\*(.+?)\*\*/g);
  return <>{parts.map((p, i) => (i % 2 ? <strong key={i}>{p}</strong> : p))}</>;
}

function Stars({ n, label }: { n: number; label?: string }) {
  return (
    <span class="learn__stars" aria-label={label ?? `${n} of 3 stars`} role="img">
      {[1, 2, 3].map((i) => (
        <span key={i} class={i <= n ? 'is-on' : ''} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}

function useLearn() {
  return useAsync(() => loadLearn(), []);
}

function useProgress() {
  const services = useServices();
  const [map, setMap] = useState<Map<string, LessonProgress>>(new Map());
  useEffect(() => {
    if (!services) return;
    void services.repo.allLessons().then((all) => setMap(new Map(all.map((p) => [p.id, p]))));
  }, [services]);
  return map;
}

/** The Learn tab: levels, courses and lessons with their stars. */
export function Learn({ lessonId }: { lessonId?: string | undefined }) {
  const content = useLearn();
  if (content.status === 'error')
    return (
      <section class="screen">
        <h1>Learn</h1>
        <p class="error-text">The lessons could not be loaded. Reload the page to try again.</p>
      </section>
    );
  if (content.status !== 'ok' || !content.value)
    return (
      <section class="screen">
        <h1>Learn</h1>
        <p>Loading the lessons…</p>
      </section>
    );
  if (lessonId) {
    const ref = content.value.curriculum.byId.get(lessonId);
    if (!ref)
      return (
        <section class="screen">
          <h1>Lesson not found</h1>
          <a href={href('learn')}>All lessons</a>
        </section>
      );
    return <LessonPlayer key={lessonId} content={content.value} lref={ref} />;
  }
  return <Overview content={content.value} />;
}

function Overview({ content }: { content: LearnContent }) {
  const progress = useProgress();
  const { curriculum, texts } = content;
  const next = curriculum.lessons.find((r) => !progress.get(r.lesson.id)?.stars);
  const earned = [...progress.values()].reduce((s, p) => s + p.stars, 0);
  const done = [...progress.values()].filter((p) => p.stars > 0).length;
  return (
    <section class="screen" aria-labelledby="learn-title">
      <h1 id="learn-title">
        Learn
        <span class="subtitle">
          Lessons from how the pieces move to tactics and endgames. {done} of{' '}
          {curriculum.lessons.length} lessons done, {earned} stars.
        </span>
      </h1>
      {next && (
        <a class="button button--primary" href={href('learn', next.lesson.id)}>
          {progress.get(next.lesson.id)?.step ? 'Continue' : 'Next lesson'}:{' '}
          {lessonText(texts, next.lesson.id, 'title')}
        </a>
      )}
      {curriculum.levels.map((level) => (
        <section key={level.id} class="learn__level" aria-labelledby={`level-${level.id}`}>
          <h2 id={`level-${level.id}`}>{LEVEL_TEXT[level.id].title}</h2>
          <p class="hint">{LEVEL_TEXT[level.id].desc}</p>
          {level.courses.map((course) => {
            const ct = courseText(texts, course.id);
            return (
              <details key={course.id} class="panel learn__course">
                <summary>
                  <span class="learn__course-title">{ct.title}</span>
                  <span class="hint num">
                    {course.lessons.filter((l) => progress.get(l.id)?.stars).length} of{' '}
                    {course.lessons.length}
                  </span>
                </summary>
                <p class="hint">{ct.desc}</p>
                <ul class="plain-list learn__lessons">
                  {course.lessons.map((l) => {
                    const p = progress.get(l.id);
                    return (
                      <li key={l.id}>
                        <a href={href('learn', l.id)}>{lessonText(texts, l.id, 'title')}</a>{' '}
                        <Stars n={p?.stars ?? 0} />
                      </li>
                    );
                  })}
                </ul>
              </details>
            );
          })}
        </section>
      ))}
    </section>
  );
}

/** Plays one lesson, step by step, and saves the progress after each step. */
function LessonPlayer({ content, lref }: { content: LearnContent; lref: LessonRef }) {
  const services = useServices();
  const { lesson } = lref;
  const steps = lesson.steps;
  const [index, setIndex] = useState(0);
  const [solved, setSolved] = useState(false);
  const flawed = useRef(new Set<number>());
  const [finished, setFinished] = useState<1 | 2 | 3>();
  const loaded = useRef(false);

  // Resume where the lesson was left.
  useEffect(() => {
    if (!services || loaded.current) return;
    loaded.current = true;
    void services.repo.getLesson(lesson.id).then((p) => {
      if (p && p.step > 0 && p.step < steps.length) setIndex(p.step);
    });
  }, [services]);

  const step = steps[index]!;
  const t = (key: string) => lessonText(content.texts, lesson.id, key, playerSide(step));
  const stepText = step.type === 'move' && step.src && !t(step.id) ? t('task') : t(step.id);
  const tasks = steps.filter(isTask).length;

  const save = async (nextStep: number, stars?: 1 | 2 | 3) => {
    if (!services) return;
    const old = await services.repo.getLesson(lesson.id);
    await services.repo.putLesson({
      id: lesson.id,
      step: nextStep,
      stars: Math.max(old?.stars ?? 0, stars ?? 0) as 0 | 1 | 2 | 3,
      updatedAt: Date.now(),
    });
  };

  const advance = () => {
    if (index + 1 >= steps.length) {
      const stars = lessonStars(tasks, flawed.current.size);
      setFinished(stars);
      void save(0, stars);
      return;
    }
    setIndex(index + 1);
    setSolved(false);
    void save(index + 1);
  };
  const flaw = () => flawed.current.add(index);

  const nextLesson = content.curriculum.lessons[lref.order + 1];
  if (finished)
    return (
      <section class="screen" aria-labelledby="lesson-title">
        <h1 id="lesson-title">{t('title')}</h1>
        <div class="panel learn__done" role="status">
          <p class="learn__done-title">Lesson complete</p>
          <Stars n={finished} />
          <p>
            {finished === 3
              ? 'Every task without a mistake, a hint or the solution.'
              : finished === 2
                ? 'A few slips. Repeat the lesson for the third star.'
                : 'Done. With fewer slips there are more stars next time.'}
          </p>
        </div>
        <div class="row">
          <button
            type="button"
            class="button"
            onClick={() => {
              flawed.current.clear();
              setFinished(undefined);
              setIndex(0);
              setSolved(false);
            }}
          >
            Again
          </button>
          <a class="button" href={href('learn')}>
            All lessons
          </a>
          {nextLesson && (
            <a class="button button--primary" href={href('learn', nextLesson.lesson.id)}>
              Next lesson
            </a>
          )}
        </div>
      </section>
    );

  const common = { text: stepText, onSolved: () => setSolved(true), onFlaw: flaw, t };
  return (
    <section class="screen screen--drill" aria-labelledby="lesson-title">
      <p class="drill__count">
        <a href={href('learn')}>{courseText(content.texts, lref.course.id).title}</a> · step{' '}
        {index + 1} of {steps.length}
      </p>
      <h1 id="lesson-title">{t('title')}</h1>
      <div class="learn__progress" aria-hidden="true">
        <span
          style={{ width: `${Math.round(((index + (solved ? 1 : 0)) / steps.length) * 100)}%` }}
        />
      </div>
      {step.type === 'info' && <InfoView key={index} step={step} {...common} />}
      {step.type === 'stars' && <StarsView key={index} step={step} {...common} />}
      {step.type === 'square' && <SquareView key={index} step={step} {...common} />}
      {step.type === 'move' && <MoveView key={index} step={step} {...common} />}
      {step.type === 'play' && <PlayView key={index} step={step} {...common} />}
      {step.type === 'quiz' && <QuizView key={index} step={step} {...common} />}
      <div class="row">
        {index > 0 && (
          <button
            type="button"
            class="button"
            onClick={() => {
              setIndex(index - 1);
              setSolved(false);
            }}
          >
            Back
          </button>
        )}
        <button
          type="button"
          class="button button--primary"
          disabled={isTask(step) && !solved}
          onClick={advance}
        >
          {index + 1 < steps.length ? 'Continue' : 'Finish lesson'}
        </button>
      </div>
    </section>
  );
}

interface ViewProps<S> {
  step: S;
  text: string;
  t: (key: string) => string;
  onSolved: () => void;
  onFlaw: () => void;
}

/** Arrows and marks written in a step, as board shapes. */
function stepShapes(step: StepDef): DrawShape[] {
  const out: DrawShape[] = [];
  for (const spec of step.arrows ?? []) {
    const [sq, brush = 'green'] = spec.split(':');
    out.push({ orig: sq!.slice(0, 2) as Key, dest: sq!.slice(2, 4) as Key, brush });
  }
  for (const spec of step.marks ?? []) {
    const [sq, brush = 'green'] = spec.split(':');
    out.push({ orig: sq as Key, brush });
  }
  return out;
}

const orientationOf = (step: StepDef) =>
  step.orientation ?? (step.fen ? sideToMove(step.fen) : 'white');

/** The words of a note: its strings and numbers, without markup. */
function wordsOf(c: ComponentChildren): string {
  if (typeof c === 'string' || typeof c === 'number') return String(c);
  if (Array.isArray(c)) return c.map(wordsOf).join('');
  if (c && typeof c === 'object' && 'props' in c)
    return wordsOf((c.props as { children?: ComponentChildren }).children);
  return '';
}

/** Feedback on a task, read aloud like the task text. `repeat` reads it again unchanged. */
function Note({
  tone,
  children,
  repeat,
}: {
  tone: 'good' | 'bad' | 'hint' | 'neutral';
  children: ComponentChildren;
  repeat?: unknown;
}) {
  return (
    <div class={`learn__note learn__note--${tone} learn__head`} role="status" aria-live="polite">
      <p>{children}</p>
      <SpeakButton text={wordsOf(children)} repeat={repeat} />
    </div>
  );
}

function InfoView({ step, text }: ViewProps<InfoStep>) {
  const [fen, setFen] = useState(step.fen);
  const [last, setLast] = useState<[string, string]>();
  // A demo replays its moves in a loop, a move every 1.2 seconds.
  useEffect(() => {
    if (!step.fen || !step.demo?.length) return;
    let i = 0;
    let cur = step.fen;
    const id = setInterval(() => {
      if (i >= step.demo!.length) {
        i = 0;
        cur = step.fen!;
        setFen(cur);
        setLast(undefined);
        return;
      }
      const r = demoMove(cur, step.demo![i]!);
      if (!r) return;
      cur = r.fen;
      setFen(cur);
      setLast([r.from, r.to]);
      i++;
    }, 1200);
    return () => clearInterval(id);
  }, [step]);
  return (
    <>
      <div class="learn__head">
        <p class="learn__text">
          <Rich text={text} />
        </p>
        <SpeakButton text={text} />
      </div>
      {fen && (
        <Board
          fen={fen}
          orientation={orientationOf(step)}
          lastMove={last}
          shapes={last ? [] : stepShapes(step)}
          material={false}
          label="Lesson board"
        />
      )}
    </>
  );
}

function starShape(sq: string): DrawShape {
  return {
    orig: sq as Key,
    customSvg: {
      html: '<polygon points="50,18 59,40 83,41 64,56 71,80 50,66 29,80 36,56 17,41 41,40" fill="#e6a400" stroke="#ffffff" stroke-width="3"/>',
    },
  };
}

function StarsView({ step, text, onSolved, onFlaw }: ViewProps<StarsStep>) {
  const [state, setState] = useState<StarsState>(() => starsStart(step));
  const [hint, setHint] = useState<string>();
  const done = state.left.length === 0;
  const move = (to: string) => {
    const n = starsMove(state, to);
    if (!n) return;
    setState(n);
    setHint(undefined);
    if (!n.left.length) {
      if (n.moves > step.par) onFlaw();
      onSolved();
    }
  };
  const dests = new Map([[state.at, starsDests(state)]]);
  const shapes = [...state.left.map(starShape)];
  if (hint) shapes.push(arrow(state.at, hint, 'green'));
  return (
    <>
      <div class="learn__head">
        <p class="learn__text">
          <Rich text={text} />
        </p>
        <SpeakButton text={text} />
      </div>
      <Board
        fen={state.fen}
        orientation={orientationOf(step)}
        shapes={shapes}
        material={false}
        movable={done ? undefined : { color: sideToMove(state.fen), dests }}
        onMove={(_, d) => move(d)}
        label={`Stars on ${state.left.join(', ') || 'no squares'}. Your piece is on ${state.at}.`}
      />
      {done ? (
        <Note tone="good">
          {state.moves <= step.par
            ? `All stars in ${state.moves} ${state.moves === 1 ? 'move' : 'moves'}.`
            : `All stars in ${state.moves} moves. It can be done in ${step.par}.`}
        </Note>
      ) : (
        <Note tone="neutral">
          Moves: {state.moves}. Stars left: {state.left.length}. Goal: {step.par}{' '}
          {step.par === 1 ? 'move' : 'moves'}.
        </Note>
      )}
      <TypedSquare
        label="Move the piece to"
        onSquare={(sq) =>
          dests.get(state.at)?.includes(sq)
            ? (move(sq), undefined)
            : `The piece cannot go to ${sq}.`
        }
        disabled={done}
      />
      <div class="row">
        {!done && (
          <button
            type="button"
            class="button"
            onClick={() => {
              onFlaw();
              setHint(shortestStars(state)?.first);
            }}
          >
            Hint
          </button>
        )}
        <button
          type="button"
          class="button"
          onClick={() => {
            setState(starsStart(step));
            setHint(undefined);
          }}
        >
          Start over
        </button>
      </div>
    </>
  );
}

/** The typed alternative for tapping a square. */
function TypedSquare(props: {
  label: string;
  onSquare: (sq: string) => string | undefined;
  disabled?: boolean;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  if (props.disabled) return null;
  return (
    <details class="move-type">
      <summary>Type a square instead</summary>
      <form
        class="move-input"
        onSubmit={(e) => {
          e.preventDefault();
          const sq = text.trim().toLowerCase();
          if (!/^[a-h][1-8]$/.test(sq)) {
            setError('Type a square like e4.');
            return;
          }
          setError(props.onSquare(sq));
          setText('');
        }}
      >
        <label for="learn-square">{props.label}</label>
        <input
          id="learn-square"
          type="text"
          autoComplete="off"
          spellcheck={false}
          value={text}
          onInput={(e) => setText(e.currentTarget.value)}
        />
        <button type="submit" class="button">
          Go
        </button>
      </form>
      {error && (
        <p class="error-text" role="alert">
          {error}
        </p>
      )}
    </details>
  );
}

function SquareView({ step, text, onSolved, onFlaw }: ViewProps<SquareStep>) {
  const fen = step.fen ?? '8/8/8/8/8/8/8/8 w - - 0 1';
  const [found, setFound] = useState<string[]>([]);
  const [wrong, setWrong] = useState<string>();
  const done = found.length === step.answer.length;
  const tap = (sq: string): string | undefined => {
    if (done || found.includes(sq)) return undefined;
    if (step.answer.includes(sq)) {
      const next = [...found, sq];
      setFound(next);
      setWrong(undefined);
      if (next.length === step.answer.length) onSolved();
      return undefined;
    }
    onFlaw();
    setWrong(sq);
    return `No, that is ${sq}.`;
  };
  const shapes = [
    ...stepShapes(step),
    ...found.map((s) => ring(s, 'green')),
    ...(wrong ? [ring(wrong, 'red')] : []),
  ];
  return (
    <>
      <div class="learn__head">
        <p class="learn__text">
          <Rich text={text} />
        </p>
        <SpeakButton text={text} />
      </div>
      <Board
        fen={fen}
        orientation={orientationOf(step)}
        shapes={shapes}
        material={false}
        onSelect={(sq) => void tap(sq)}
        label="Lesson board. Tap the squares the task asks for."
      />
      {done ? (
        <Note tone="good">Right.</Note>
      ) : wrong ? (
        <Note tone="bad">No, that is {wrong}.</Note>
      ) : step.answer.length > 1 ? (
        <Note tone="neutral">
          {found.length} of {step.answer.length} found
        </Note>
      ) : null}
      <TypedSquare label="Square" onSquare={tap} disabled={done} />
    </>
  );
}

function MoveView({ step, text, t, onSolved, onFlaw }: ViewProps<MoveStep>) {
  const start = useMemo(() => moveStepStart(step), [step]);
  const [fen, setFen] = useState(start.fen);
  const [last, setLast] = useState<[string, string] | undefined>(start.lastMove);
  const [index, setIndex] = useState(0);
  const [note, setNote] = useState<{ tone: 'good' | 'bad' | 'hint' | 'neutral'; text: string }>();
  const [hint, setHint] = useState(0);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  /** Bumped on a wrong move, so the board puts the piece back. */
  const [attempt, setAttempt] = useState(0);
  const me = sideToMove(start.fen);

  const tryMove = (uci: string) => {
    if (done || busy) return;
    if (!isRightMove(step, index, fen, uci)) {
      onFlaw();
      const why = wrongReason(step, fen, uci);
      setNote({
        tone: 'bad',
        text:
          why === 'stalemate'
            ? 'That is stalemate, a draw: the king cannot move but is not in check. Try again.'
            : why === 'onlyCheck'
              ? 'Check, but the king can still get away. Look for checkmate.'
              : why === 'noCheck'
                ? 'That move does not give check. Try again.'
                : 'Not that move. Try again.',
      });
      setAttempt((a) => a + 1);
      return;
    }
    const r = play(fen, uci)!;
    setFen(r.fen);
    setLast([r.from, r.to]);
    setHint(0);
    if (moveStepDone(step, index, r.fen)) {
      setDone(true);
      const doneText = t(`${step.id}_done`);
      setNote({
        tone: 'good',
        text: doneText || (isCheckmate(r.fen) ? 'Checkmate. Well done.' : 'Correct.'),
      });
      onSolved();
      return;
    }
    // The opponent's reply from the line.
    setNote({ tone: 'good', text: 'Good. Keep going.' });
    setBusy(true);
    const reply = step.line[index + 1]!;
    setTimeout(() => {
      const rr = play(r.fen, reply)!;
      setFen(rr.fen);
      setLast([rr.from, rr.to]);
      setIndex(index + 2);
      setBusy(false);
    }, 600);
  };

  const expected = step.line[index];
  const shapes: DrawShape[] = [];
  if (expected && hint >= 1) shapes.push(ring(expected.slice(0, 2), 'green'));
  if (expected && hint >= 2)
    shapes.push(arrow(expected.slice(0, 2), expected.slice(2, 4), 'green'));
  const pos = board(fen);
  /** Hints in words, one per tap: the piece, then where it goes. */
  const hintText = (level: number): string | undefined => {
    if (!expected) return undefined;
    const from = parseSquare(expected.slice(0, 2))!;
    const role = pos.board.getRole(from);
    if (!role) return undefined;
    const same = pos.board[pos.turn].intersect(pos.board[role]).size();
    const name = role[0]!.toUpperCase() + role.slice(1);
    if (level === 1)
      return same > 1 ? `Move the ${role} on ${expected.slice(0, 2)}.` : `Move your ${role}.`;
    return `${name} to ${expected.slice(2, 4)}.`;
  };
  return (
    <>
      <div class="learn__head">
        <p class="learn__text">
          <Rich text={text} />
        </p>
        <SpeakButton text={text} />
      </div>
      <Board
        key={attempt}
        fen={fen}
        orientation={step.orientation ?? me}
        lastMove={last}
        shapes={shapes.length ? shapes : index === 0 && !done ? stepShapes(step) : []}
        movable={
          done || busy || pos.turn !== me
            ? undefined
            : { color: me, dests: chessgroundDests(pos) as unknown as Map<string, string[]> }
        }
        onMove={(o, d) => {
          const from = parseSquare(o)!;
          const to = parseSquare(d)!;
          const promo = pos.board.getRole(from) === 'pawn' && (d[1] === '8' || d[1] === '1');
          tryMove(standardUci(pos, { from, to, ...(promo ? { promotion: 'queen' } : {}) }));
        }}
        label={`Lesson board. ${me === 'white' ? 'White' : 'Black'} to move.`}
      />
      {note && (
        <Note tone={note.tone} repeat={note}>
          {note.text}
        </Note>
      )}
      {step.src && <p class="hint">Puzzle {step.src} from the Lichess puzzle database (CC0).</p>}
      <TypedMove disabled={done || busy} fen={fen} onMove={tryMove} />
      {!done && (
        <div class="row">
          <button
            type="button"
            class="button"
            onClick={() => {
              onFlaw();
              const level = Math.min(2, hint + 1);
              setHint(level);
              const words = hintText(level);
              if (words) setNote({ tone: 'hint', text: words });
            }}
          >
            {hint === 0 ? 'Hint' : 'Show the move'}
          </button>
        </div>
      )}
    </>
  );
}

const PLAY_TEXT: Record<PlayResult, string> = {
  won: 'Done.',
  stalemate: 'Stalemate. The king cannot move but is not in check, so it is a draw. Try again.',
  draw: 'That is a draw now. Try again.',
  lost: 'Your opponent won a piece, so the win is gone. Try again.',
  limit: 'You used every move. Try again, it can be done faster.',
};

function PlayView({ step, text, onSolved, onFlaw }: ViewProps<PlayStep>) {
  const services = useServices();
  const me = sideToMove(step.fen);
  const [fen, setFen] = useState(step.fen);
  const [last, setLast] = useState<[string, string]>();
  const [own, setOwn] = useState(0);
  const [result, setResult] = useState<PlayResult>();
  const [thinking, setThinking] = useState(false);

  const restart = () => {
    setFen(step.fen);
    setLast(undefined);
    setOwn(0);
    setResult(undefined);
  };

  const tryMove = async (uci: string) => {
    if (result || thinking) return;
    const r = play(fen, uci);
    if (!r) return;
    setFen(r.fen);
    setLast([r.from, r.to]);
    const n = own + 1;
    setOwn(n);
    const judged = judgeOwnMove(step, r, n);
    if (judged) {
      setResult(judged);
      if (judged === 'won') onSolved();
      else onFlaw();
      return;
    }
    if (!services) return;
    setThinking(true);
    const s = await services.pool.search({ fen: r.fen, depth: 14, movetime: 800 });
    setThinking(false);
    const reply = s.lines[0]?.pv[0] ?? s.bestmove;
    if (!reply) return;
    const rr = play(r.fen, reply);
    if (!rr) return;
    setFen(rr.fen);
    setLast([rr.from, rr.to]);
    const j = judgeReply(rr);
    if (j) {
      setResult(j);
      onFlaw();
    }
  };

  const pos = board(fen);
  return (
    <>
      <div class="learn__head">
        <p class="learn__text">
          <Rich text={text} />
        </p>
        <SpeakButton text={text} />
      </div>
      <Board
        fen={fen}
        orientation={step.orientation ?? me}
        lastMove={last}
        movable={
          result || thinking || pos.turn !== me
            ? undefined
            : { color: me, dests: chessgroundDests(pos) as unknown as Map<string, string[]> }
        }
        onMove={(o, d) => {
          const from = parseSquare(o)!;
          const to = parseSquare(d)!;
          const promo = pos.board.getRole(from) === 'pawn' && (d[1] === '8' || d[1] === '1');
          void tryMove(standardUci(pos, { from, to, ...(promo ? { promotion: 'queen' } : {}) }));
        }}
        label={`Lesson board. Play it out as ${me}.`}
      />
      {result ? (
        <Note tone={result === 'won' ? 'good' : 'bad'}>
          {result === 'won'
            ? step.goal === 'mate'
              ? `Checkmate in ${own} ${own === 1 ? 'move' : 'moves'}.`
              : `Promoted, and the new piece is safe, in ${own} ${own === 1 ? 'move' : 'moves'}.`
            : PLAY_TEXT[result]}
        </Note>
      ) : (
        <Note tone="neutral">
          {thinking ? 'Your opponent is thinking…' : `Your moves: ${own} of ${step.limit}.`}
        </Note>
      )}
      <TypedMove disabled={!!result || thinking} fen={fen} onMove={(u) => void tryMove(u)} />
      {result && result !== 'won' && (
        <div class="row">
          <button type="button" class="button" onClick={restart}>
            Try again
          </button>
        </div>
      )}
    </>
  );
}

function QuizView({ step, text, t, onSolved, onFlaw }: ViewProps<QuizStep>) {
  const [picked, setPicked] = useState<string[]>([]);
  const right = picked.includes(step.answer);
  return (
    <>
      <div class="learn__head">
        <p class="learn__text">
          <Rich text={text} />
        </p>
        <SpeakButton text={text} />
      </div>
      {step.fen && (
        <Board
          fen={step.fen}
          orientation={orientationOf(step)}
          shapes={stepShapes(step)}
          material={false}
          label="Lesson board"
        />
      )}
      <div class="learn__options" role="group" aria-label="Answers">
        {step.options.map((o) => (
          <button
            key={o}
            type="button"
            class={`button${picked.includes(o) ? (o === step.answer ? ' is-right' : ' is-wrong') : ''}`}
            disabled={right || picked.includes(o)}
            onClick={() => {
              setPicked([...picked, o]);
              if (o === step.answer) onSolved();
              else onFlaw();
            }}
          >
            {t(`${step.id}_${o}`)}
          </button>
        ))}
      </div>
      {right ? (
        <Note tone="good">
          <Rich text={t(`${step.id}_done`)} />
        </Note>
      ) : picked.length > 0 ? (
        <Note tone="bad">Not quite. Try another answer.</Note>
      ) : null}
    </>
  );
}
