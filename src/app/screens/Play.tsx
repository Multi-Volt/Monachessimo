import type { DrawShape } from 'chessground/draw';
import { gameAccuracy } from '../../play/accuracy';
import {
  arrow,
  badge,
  LABEL_COLOR,
  LABEL_ORDER,
  LABEL_NAME,
  LABEL_SYMBOL,
  ring,
  type MoveLabel,
} from '../../ui/badges';
import { positions } from '../../play/review';
import type { Mark } from '../../play/cause';
import { longTermReason, REASON_PLIES } from '../../play/reason';
import { lessonFor } from '../../learn/weakness';
import { buildRecord, toJsonl, withLine, type ExplanationRecord } from '../../play/record';
import { enrichLine, narrateLine, type LineStep } from '../../play/narrate';
import { findThreat, type Threat } from '../../engine/threat';
import { fromFen } from '../../detectors/board';
import type { TagName } from '../../detectors';
import { moveHints } from '../../chess/hints';
import { chessgroundDests } from 'chessops/compat';
import { makeFen } from 'chessops/fen';
import { parseSquare, parseUci } from 'chessops/util';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { moveLabel, replay } from '../../analysis/positions';
import { settingsKey } from '../../analysis/types';
import { pvToSan, uciSquares, uciToSan } from '../../chess/san';
import { standardUci } from '../../chess/uci';
import { getRating } from '../../drills/data';
import { Engine, type SearchResult } from '../../engine/engine';
import { negate, type Score } from '../../engine/eval';
import { workerTransport } from '../../engine/worker';
import type { Game, Side } from '../../import/types';
import {
  endText,
  gameEnd,
  judgeMove,
  refuses,
  type MoveClass,
  skillFor,
  skillLabel,
  STRICTNESS_TEXT,
  type Strictness,
  withArticle,
} from '../../play/coach';
import {
  addSummary,
  currentPosition,
  history,
  loadCurrent,
  saveFinished,
  practiceDrill,
  saveCurrent,
  type PracticeGame,
} from '../../play/data';
import { buildIndex, yourVisits, type Visit } from '../../play/positions';
import { praiseMove, type Praise } from '../../play/praise';
import { playLine } from '../../detectors/board';
import {
  compareLines,
  explainMove,
  threatNote,
  threatText,
  explanationText,
  type MoveExplanation,
} from '../../play/explain';
import { TAG_INFO } from '../../profile/labels';
import { Board } from '../../ui/Board';
import { SpeakButton } from '../../ui/SpeakButton';
import { usePhrased } from '../../ui/usePhrased';
import { MoveText, moveText } from '../../chess/words';
import { coachVoice, spellMoves } from '../../play/voice';
import { EvalGraph } from '../../ui/EvalGraph';
import { EvalBar, whiteScore } from '../../ui/EvalBar';
import { CLASS_LABEL, CLASS_SYMBOL } from '../../analysis/summary';
import { formatDate, formatScore } from '../../ui/format';
import { useAsync, useServices } from '../../ui/hooks';
import { TypedMove } from '../drills/ConversionDrill';
import { href, navigate } from '../router';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/**
 * A narrated step in the coach's voice with its moves in words. A step that
 * only names the move, which the label already shows, keeps just a mate.
 */
function stepWords(text: string): string {
  const t = coachVoice(text);
  if (/^(You play|Your opponent plays) \S+\.( Checkmate\.)?$/.test(t))
    return t.endsWith('Checkmate.') ? 'Checkmate.' : '';
  return spellMoves(t, true);
}

/** How long a refused move stays on the board before it goes back. */
/** Engine time for each of the opponent's moves. */
const OPPONENT_MS = 400;

/** Where a practice game starts, from the route. */
export type PlayRoute =
  { kind: 'new' } | { kind: 'fen'; fen: string } | { kind: 'game'; gameId: string; ply: number };

export function Play({ route }: { route: PlayRoute }) {
  const services = useServices();
  const [current, setCurrent] = useState<PracticeGame>();
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!services) return;
    void loadCurrent(services.repo).then((g) => {
      // A link to a new start position replaces a finished game but never a running one.
      setCurrent(route.kind === 'new' || !g?.end ? g : undefined);
      setLoaded(true);
    });
  }, [services]);

  if (!services || !loaded) return <p class="screen">Loading…</p>;
  if (current && !current.end && route.kind === 'new')
    return <GameView initial={current} onNew={() => setCurrent(undefined)} />;
  if (current?.end) return <GameView initial={current} onNew={() => setCurrent(undefined)} />;
  return <Setup route={route} onStart={setCurrent} />;
}

function Setup({ route, onStart }: { route: PlayRoute; onStart: (g: PracticeGame) => void }) {
  const services = useServices()!;
  const data = useAsync(async () => {
    const [games, analyses, rating] = await Promise.all([
      services.repo.allGames(),
      services.repo.allAnalyses(),
      getRating(services.repo),
    ]);
    const key = settingsKey(services.settings.analysis);
    const mistakes = analyses
      .filter((a) => a.settings === key)
      .flatMap((a) =>
        a.reviews
          .filter((r) => r.class === 'mistake' || r.class === 'blunder')
          .map((r) => ({ gameId: a.gameId, ply: r.ply })),
      );
    return { games, mistakes, rating: rating.rating };
  }, [services]);

  const [from, setFrom] = useState<'start' | 'game' | 'mistake'>(
    route.kind === 'game' ? 'game' : route.kind === 'fen' ? 'start' : 'start',
  );
  const [color, setColor] = useState<Side | 'random'>('random');
  const [gameId, setGameId] = useState(route.kind === 'game' ? route.gameId : '');
  const [ply, setPly] = useState(route.kind === 'game' ? route.ply : 0);
  const [skill, setSkill] = useState<number>();
  const [human, setHuman] = useState(true);
  const [maia, setMaia] = useState<number>();
  const [strictness, setStrictness] = useState<Strictness>('mistakes');

  if (data.status !== 'ok' || !data.value) return <p class="screen">Loading…</p>;
  const { games, mistakes, rating } = data.value;
  const level = skill ?? skillFor(rating);
  // Maia has networks from 1100 to 1900, every hundred.
  const maiaLevel = maia ?? Math.min(1900, Math.max(400, Math.round(rating / 100) * 100));
  const chosen = games.find((g) => g.id === gameId) ?? games[0];

  const start = async () => {
    let startFen = START_FEN;
    let you: Side = color === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : color;
    let source: PracticeGame['source'] = { label: 'the starting position' };
    if (route.kind === 'fen' && from === 'start') {
      startFen = route.fen;
      you = startFen.split(' ')[1] === 'b' ? 'black' : 'white';
      source = { label: 'a drill position' };
    } else if (from === 'game' && chosen) {
      const fens = replay(chosen.uci);
      const p = Math.min(ply, chosen.uci.length - 1);
      startFen = fens[p]!;
      you = chosen.userColor;
      // Start on the player's own move.
      if ((p % 2 === 0) !== (you === 'white') && p + 1 < fens.length) startFen = fens[p + 1]!;
      source = { label: `your game vs ${opponentOf(chosen)}`, gameId: chosen.id, ply: p };
    } else if (from === 'mistake' && mistakes.length) {
      const pick = mistakes[Math.floor(Math.random() * mistakes.length)]!;
      const g = games.find((x) => x.id === pick.gameId);
      if (g) {
        startFen = replay(g.uci)[pick.ply]!;
        you = g.userColor;
        source = { label: `where you went wrong vs ${opponentOf(g)}`, gameId: g.id, ply: pick.ply };
      }
    }
    const game: PracticeGame = {
      id: `practice-${Date.now()}`,
      startFen,
      you,
      moves: [],
      skill: level,
      ...(human ? { maia: maiaLevel } : {}),
      rating: Math.min(1900, Math.max(1100, Math.round(rating / 100) * 100)),
      strictness,
      startedAt: Date.now(),
      yourMoves: [],
      savedDrills: 0,
      source,
    };
    await saveCurrent(services.repo, game);
    onStart(game);
    // Show the game on the plain route, whatever start link led here.
    navigate('play');
  };

  return (
    <section class="screen" aria-labelledby="play-title">
      <h1 id="play-title">
        Practice game
        <span class="subtitle">
          Play a full game against Stockfish. The coach checks every move you make and sends weak
          ones back until you find a better one.
        </span>
      </h1>

      <div class="stack">
        <fieldset class="field">
          <legend>Start from</legend>
          {route.kind === 'fen' && (
            <label class="choice">
              <input
                type="radio"
                name="from"
                checked={from === 'start'}
                onChange={() => setFrom('start')}
              />
              <span>The drill position you came from</span>
            </label>
          )}
          {route.kind !== 'fen' && (
            <label class="choice">
              <input
                type="radio"
                name="from"
                checked={from === 'start'}
                onChange={() => setFrom('start')}
              />
              <span>The starting position</span>
            </label>
          )}
          <label class="choice">
            <input
              type="radio"
              name="from"
              checked={from === 'game'}
              disabled={games.length === 0}
              onChange={() => setFrom('game')}
            />
            <span>
              A move in one of your games{games.length === 0 ? '. Import games first.' : ''}
            </span>
          </label>
          <label class="choice">
            <input
              type="radio"
              name="from"
              checked={from === 'mistake'}
              disabled={mistakes.length === 0}
              onChange={() => setFrom('mistake')}
            />
            <span>
              Where you went wrong in a game
              {mistakes.length === 0 ? '. Analyze some games first.' : ''}
            </span>
          </label>
        </fieldset>

        {from === 'game' && chosen && (
          <GamePicker
            games={games}
            game={chosen}
            ply={Math.min(ply, chosen.uci.length - 1)}
            onGame={(id) => {
              setGameId(id);
              setPly(0);
            }}
            onPly={setPly}
          />
        )}

        {from === 'start' && route.kind !== 'fen' && (
          <fieldset class="field">
            <legend>You play</legend>
            <div class="segmented">
              {(['white', 'black', 'random'] as const).map((c) => (
                <label key={c} class="segmented__option">
                  <input
                    type="radio"
                    name="color"
                    checked={color === c}
                    onChange={() => setColor(c)}
                  />
                  <span>{c === 'random' ? 'Either' : c === 'white' ? 'White' : 'Black'}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        <fieldset class="field">
          <legend>Opponent</legend>
          <label class="choice">
            <input type="radio" name="opponent" checked={!human} onChange={() => setHuman(false)} />
            <span>Stockfish, set to a strength</span>
          </label>
          <label class="choice">
            <input type="radio" name="opponent" checked={human} onChange={() => setHuman(true)} />
            <span>Maia, which plays the moves people of a rating play</span>
          </label>
        </fieldset>
        {human ? (
          <div class="field">
            <label for="maia">Plays like a player rated {maiaLevel}</label>
            <input
              id="maia"
              type="range"
              min={400}
              max={1900}
              step={100}
              value={maiaLevel}
              onInput={(e) => setMaia(Number(e.currentTarget.value))}
            />
            <p class="hint">
              Suggested from your puzzle rating of {rating}. Downloads 1.2 MB the first time.
              {maiaLevel < 1100 &&
                ' Maia learned from players rated 1100 and up, so below that it plays its 1100 moves less carefully: an estimate of a weaker player, not one learned from their games.'}
            </p>
          </div>
        ) : (
          <div class="field">
            <label for="skill">
              Opponent strength: {skillLabel(level)}, Stockfish Skill Level {level}
            </label>
            <input
              id="skill"
              type="range"
              min={0}
              max={20}
              value={level}
              onInput={(e) => setSkill(Number(e.currentTarget.value))}
            />
            <p class="hint">Suggested from your puzzle rating of {rating}.</p>
          </div>
        )}

        <fieldset class="field">
          <legend>Coach</legend>
          {(Object.keys(STRICTNESS_TEXT) as Strictness[]).map((k) => (
            <label key={k} class="choice">
              <input
                type="radio"
                name="strict"
                checked={strictness === k}
                onChange={() => setStrictness(k)}
              />
              <span>{STRICTNESS_TEXT[k]}</span>
            </label>
          ))}
        </fieldset>

        <button type="button" class="button button--primary" onClick={() => void start()}>
          Start the game
        </button>
      </div>
    </section>
  );
}

/**
 * Chooses a start position in one of the player's games: a board preview,
 * the evaluation graph with the player's mistakes marked, the next move in
 * the game with its verdict, and steps by move or by mistake.
 */
function GamePicker(props: {
  games: Game[];
  game: Game;
  ply: number;
  onGame: (id: string) => void;
  onPly: (ply: number) => void;
}) {
  const services = useServices()!;
  const { game, ply } = props;
  const fens = useMemo(() => replay(game.uci), [game.id]);
  const analysis = useAsync(async () => {
    const a = await services.repo.getAnalysis(game.id);
    return a?.settings === settingsKey(services.settings.analysis) ? a : undefined;
  }, [game.id]);
  const a = analysis.status === 'ok' ? analysis.value : undefined;
  const reviews = new Map((a?.reviews ?? []).filter((r) => r.class).map((r) => [r.ply, r]));
  const blunders = [...reviews.values()].filter((r) => r.class === 'blunder').map((r) => r.ply);
  const mistakes = [...reviews.values()].filter((r) => r.class === 'mistake').map((r) => r.ply);
  const yourErrors = [...blunders, ...mistakes].sort((x, y) => x - y);
  const last = Math.max(0, game.uci.length - 1);
  const next = reviews.get(ply);
  const nextYours = (ply % 2 === 0) === (game.userColor === 'white');
  const prevError = [...yourErrors].reverse().find((p) => p < ply);
  const nextError = yourErrors.find((p) => p > ply);
  const go = (p: number) => props.onPly(Math.max(0, Math.min(last, p)));

  return (
    <div class="field game-picker">
      <label for="game">Game</label>
      <select id="game" value={game.id} onChange={(e) => props.onGame(e.currentTarget.value)}>
        {props.games.slice(0, 50).map((g) => (
          <option key={g.id} value={g.id}>
            {formatDate(g.playedAt)} vs {opponentOf(g)}, {g.speed}
          </option>
        ))}
      </select>

      <Board
        fen={fens[ply]!}
        orientation={game.userColor}
        lastMove={ply > 0 ? uciSquares(game.uci[ply - 1]!) : undefined}
        label={`Position after ${ply === 0 ? 'no moves' : `${moveLabel(ply - 1)} ${game.san[ply - 1]}`}`}
      />

      {a?.evals[ply] && (
        <EvalBar
          score={whiteScore(a.evals[ply]!, ply % 2 === 0 ? 'white' : 'black')}
          label="Evaluation of this position"
        />
      )}
      {a ? (
        <EvalGraph
          evals={a.evals}
          marks={blunders}
          minorMarks={mistakes}
          current={ply}
          onSelect={(p) => go(p)}
        />
      ) : (
        <p class="hint">This game is not analyzed yet, so mistakes are not marked.</p>
      )}

      <label for="ply">
        Start after {ply === 0 ? 'no moves' : `${moveLabel(ply - 1)} ${game.san[ply - 1]}`}
      </label>
      <input
        id="ply"
        type="range"
        min={0}
        max={last}
        value={ply}
        onInput={(e) => go(Number(e.currentTarget.value))}
      />

      <p class="game-picker__next" aria-live="polite">
        {ply >= game.uci.length ? (
          'The game ends here.'
        ) : (
          <>
            Next in your game: {moveLabel(ply)} {game.san[ply]}
            {next?.class ? CLASS_SYMBOL[next.class] : ''}
            {nextYours ? ' (your move)' : ` (${opponentOf(game)})`}.
            {next?.class && (
              <>
                {' '}
                <span class={`tag tag--${next.class}`}>{CLASS_LABEL[next.class]}</span> Your
                evaluation went from {formatScore(next.lines[0]?.score ?? next.playedScore)} to{' '}
                {formatScore(next.playedScore)}.
              </>
            )}
          </>
        )}
      </p>

      <div class="row row--nav" role="group" aria-label="Choose the start move">
        <button
          type="button"
          class="button"
          disabled={prevError === undefined}
          onClick={() => go(prevError!)}
        >
          Previous mistake
        </button>
        <button type="button" class="button" disabled={ply === 0} onClick={() => go(ply - 1)}>
          Back
        </button>
        <button type="button" class="button" disabled={ply >= last} onClick={() => go(ply + 1)}>
          Next
        </button>
        <button
          type="button"
          class="button"
          disabled={nextError === undefined}
          onClick={() => go(nextError!)}
        >
          Next mistake
        </button>
      </div>
    </div>
  );
}

const SHOW_EVAL_KEY = 'monachessimo.showEval';

/** Whether practice games show the evaluation; a per-device preference. */
function readShowEval(): boolean {
  try {
    return localStorage.getItem(SHOW_EVAL_KEY) !== 'no';
  } catch {
    return true;
  }
}

function writeShowEval(show: boolean): void {
  try {
    localStorage.setItem(SHOW_EVAL_KEY, show ? 'yes' : 'no');
  } catch {
    // Storage can be unavailable in private windows; the toggle still works for this visit.
  }
}

function opponentOf(g: Game): string {
  return (g.userColor === 'white' ? g.black : g.white).name;
}

type Phase =
  | { kind: 'thinking' }
  | { kind: 'your-move' }
  | { kind: 'checking'; uci: string }
  | { kind: 'refused'; uci: string; text: string }
  | { kind: 'opponent'; uci: string }
  | { kind: 'over' };

function GameView({ initial, onNew }: { initial: PracticeGame; onNew: () => void }) {
  const services = useServices()!;
  const [game, setGame] = useState(initial);
  const [phase, setPhase] = useState<Phase>({ kind: initial.end ? 'over' : 'thinking' });
  const [refusal, setRefusal] = useState<{ cls: MoveClass; record: ExplanationRecord }>();
  /** The last refused move and the opponent's best line after it. */
  const [refutation, setRefutation] = useState<{
    uci: string;
    reply: string[];
    /** The longer reply, for reading a plan from the opponent's moves. */
    full: string[];
    /** The engine's line from the same position, to compare the end against. */
    best: string[];
    /** Centipawns the move cost. */
    cost: number;
  }>();
  /** Step in "Show what happens": 1 is the refused move, then the reply line. */
  const [replayStep, setReplayStep] = useState<number>();
  /**
   * A short note about an accepted but imperfect move, with the notes for
   * the wording model once the narrated line is complete.
   */
  const [note, setNote] = useState<{
    cls: MoveClass;
    why: MoveExplanation;
    sheet?: ExplanationRecord;
  }>();
  /** What a good move did, shown until the next move. */
  const [praise, setPraise] = useState<Praise>();
  // How rarely players of the player's rating find the move just praised.
  const [rare, setRare] = useState<string>();
  const [hints, setHints] = useState(0);
  const [refusedHere, setRefusedHere] = useState(0);
  /** Latest evaluation from White's side, from the coach's search. */
  const [evalWhite, setEvalWhite] = useState<Score>();
  const [showEval, setShowEval] = useState(() => readShowEval());
  /** Resign needs a second tap, so a stray tap does not end the game. */
  const [confirmResign, setConfirmResign] = useState(false);
  const opponent = useRef<Engine | undefined>(undefined);
  const target = useRef<Promise<SearchResult> | undefined>(undefined);
  const savedHere = useRef(false);
  /** The opponent's threat in the current position, from the null-move search. */
  const [engineThreat, setEngineThreat] = useState<{ fen: string; threat: Threat }>();
  const threatRef = useRef<Threat | undefined>(undefined);
  /** The first try at the current move: its label and drop, for accuracy. */
  const firstTry = useRef<{ label: MoveLabel; drop: number } | undefined>(undefined);

  const pos = useMemo(() => currentPosition(game), [game]);
  const fen = makeFen(pos.toSetup());
  const yourTurn = pos.turn === game.you;

  const index = useAsync(async () => buildIndex(await services.repo.allGames()), [services]);
  const visits: Visit[] =
    index.status === 'ok' && index.value && yourTurn ? yourVisits(index.value, fen) : [];

  useEffect(() => {
    opponent.current = new Engine(workerTransport(), { uci: { 'Skill Level': game.skill } });
    return () => opponent.current?.terminate();
  }, [game.id]);

  const save = async (g: PracticeGame) => {
    setGame(g);
    await saveCurrent(services.repo, g);
  };

  const finish = async (g: PracticeGame, end: NonNullable<PracticeGame['end']>) => {
    const done = { ...g, end };
    await save(done);
    await saveFinished(services.repo, done);
    setPhase({ kind: 'over' });
    const result =
      end.kind === 'resigned'
        ? 'lost'
        : end.kind === 'checkmate'
          ? end.winner === g.you
            ? 'won'
            : 'lost'
          : 'drew';
    await addSummary(services.repo, {
      id: g.id,
      at: Date.now(),
      you: g.you,
      result,
      moves: g.yourMoves.length,
      firstTry: g.yourMoves.filter((m) => m.refused === 0 && !m.hinted).length,
      skill: g.skill,
      strictness: g.strictness,
    });
  };

  // Whose turn: start the coach's search on the player's turn, or let the opponent move.
  useEffect(() => {
    if (game.end) return;
    const end = gameEnd(pos, history(game));
    if (end) {
      void finish(game, end);
      return;
    }
    if (yourTurn) {
      target.current = services.pool.search({ fen, depth: 14, movetime: 1500, multipv: 3 });
      const side = pos.turn;
      setEngineThreat(undefined);
      threatRef.current = undefined;
      const here = fen;
      void target.current.then(async (t) => {
        if (!t.lines[0]) return;
        setEvalWhite(whiteScore(t.lines[0].score, side));
        // What the opponent would play if the player passed: the threat.
        const threat = await findThreat((r) => services.pool.search(r), here, t.lines[0].score);
        threatRef.current = threat;
        setEngineThreat(threat ? { fen: here, threat } : undefined);
      });
      setRefusedHere(0);
      setHints(0);
      savedHere.current = false;
      firstTry.current = undefined;
      setPhase({ kind: 'your-move' });
      return;
    }
    setPhase({ kind: 'thinking' });
    let live = true;
    void (async () => {
      await new Promise((r) => setTimeout(r, 250));
      // Maia picks the move a person of its rating would; Stockfish stands
      // in if its network cannot load.
      const human = game.maia
        ? await import('../../engine/maiaPlayer')
            .then((m) => m.maiaMove(game.maia!, game.startFen, game.moves))
            .catch(() => undefined)
        : undefined;
      const bestmove =
        human ?? (await opponent.current!.search({ fen, movetime: OPPONENT_MS })).bestmove;
      if (!live || !bestmove) return;
      setPhase({ kind: 'opponent', uci: bestmove });
      await save({ ...game, moves: [...game.moves, bestmove] });
    })();
    return () => {
      live = false;
    };
  }, [game.moves.length, game.end]);

  const submit = async (uci: string) => {
    if (phase.kind !== 'your-move') return;
    setPhase({ kind: 'checking', uci });
    setNote(undefined);
    setPraise(undefined);
    setRare(undefined);
    const t = await target.current!;
    const best = t.lines[0]?.score ?? { kind: 'cp' as const, value: 0 };
    const after = pos.clone();
    after.play(parseUci(uci)!);
    // Score of the played move and the opponent's best line after it.
    const inLines = t.lines.find((l) => l.pv[0] === uci);
    let played: Score;
    let reply: string[] = [];
    if (after.isCheckmate()) played = { kind: 'mate', value: 1 };
    else if (after.isEnd()) played = { kind: 'cp', value: 0 };
    else if (inLines) {
      played = inLines.score;
      reply = inLines.pv.slice(1);
    } else {
      const r = await services.pool.search({
        fen: makeFen(after.toSetup()),
        depth: 14,
        movetime: 1200,
      });
      played = r.lines[0] ? negate(r.lines[0].score) : { kind: 'cp', value: 0 };
      reply = r.lines[0]?.pv ?? [];
    }
    const verdict = judgeMove(best, played);
    const san = uciToSan(fen, uci);
    const why = verdict.class
      ? explainMove({
          before: pos,
          uci,
          reply,
          lines: t.lines,
          best,
          played,
          verdict,
          ply: game.moves.length,
          threat: threatRef.current,
        })
      : undefined;

    if (refuses(game.strictness, best, played)) {
      const text = why
        ? explanationText(why).join(' ')
        : `${san} is ${withArticle(verdict.class!)}.`;
      setRefusal({
        cls: verdict.class!,
        record: buildRecord({
          before: pos,
          uci,
          reply,
          verdict,
          explanation: why!,
          threat: threatRef.current,
        }),
      });
      setRefutation({
        uci,
        reply: reply.slice(0, 5),
        full: reply.slice(0, REASON_PLIES),
        best: t.lines[0]?.pv ?? [],
        cost: verdict.cpLoss,
      });
      setReplayStep(undefined);
      setRefusedHere((n) => n + 1);
      firstTry.current ??= { label: verdict.class!, drop: verdict.drop };
      setPhase({ kind: 'refused', uci, text });
      const record = { ply: game.moves.length, san, class: verdict.class!, tags: why?.tags ?? [] };
      let next = { ...game, refusals: [...(game.refusals ?? []), record] };
      // Save the position as a drill the first time a move is refused here.
      if (!savedHere.current) {
        savedHere.current = true;
        const rating = (await getRating(services.repo)).rating;
        const drill = practiceDrill(fen, game.you, uci, verdict.drop, t.lines, rating, Date.now());
        if (drill) {
          await services.repo.putDrills([
            {
              ...drill,
              tags: why?.tags ?? [],
              explanation: [...(why ? explanationText(why) : []), ...drill.explanation.slice(1)],
            },
          ]);
          next = { ...next, savedDrills: next.savedDrills + 1 };
        }
      }
      // The refused move stays on the board with the reply drawn, until the
      // player chooses to try again.
      await save(next);
      return;
    }
    setRefusal(undefined);
    setRefutation(undefined);
    setReplayStep(undefined);
    // A move the coach lets through can still be imperfect: say so.
    const noted = why && verdict.class ? { cls: verdict.class, why } : undefined;
    setNote(noted);
    if (noted && services.settings.coachModel) {
      // The same record a refusal gets, for the wording model.
      const rec = buildRecord({
        before: pos,
        uci,
        reply,
        verdict,
        explanation: noted.why,
        threat: threatRef.current,
      });
      const shown = [uci, ...reply.slice(0, 5)];
      const reason = longTermReason(
        pos,
        game.you,
        [uci, ...reply.slice(0, REASON_PLIES)],
        t.lines[0]?.pv ?? [],
      );
      void enrichLine(pos, shown, narrateLine(pos, shown, game.you), (r) =>
        services.pool.search(r),
      ).then((rich) =>
        setNote((n) => (n === noted ? { ...noted, sheet: withLine(rec, rich, reason) } : n)),
      );
    }
    const praise = praiseMove({ before: pos, uci, lines: t.lines, played, verdict });
    setPraise(praise);
    setRare(undefined);
    // A strong move that Maia says few players of this rating would find.
    const rating = game.rating;
    if (praise && rating && ['best', 'great', 'brilliant', 'excellent'].includes(praise.label)) {
      const before = game.moves;
      void import('../../engine/maiaPlayer')
        .then((m) => m.maiaChance(rating, game.startFen, before, uci))
        .then((p) => {
          if (p === undefined || p >= 0.25) return;
          const n = p < 0.01 ? 100 : Math.round(1 / p);
          setRare(
            n >= 100
              ? `Fewer than 1 in 100 players rated ${rating} find this.`
              : `Only about 1 in ${n} players rated ${rating} find this.`,
          );
        })
        .catch(() => undefined);
    }
    const label: MoveLabel | undefined = praise?.label ?? verdict.class ?? undefined;
    const first = firstTry.current ?? (label ? { label, drop: verdict.drop } : undefined);
    await save({
      ...game,
      moves: [...game.moves, uci],
      yourMoves: [
        ...game.yourMoves,
        {
          ply: game.moves.length,
          refused: refusedHere,
          hinted: hints > 0,
          ...(label ? { label } : {}),
          ...(first ? { first: first.label, drop: first.drop } : {}),
        },
      ],
      ...(verdict.class
        ? {
            refusals: [
              ...(game.refusals ?? []),
              {
                ply: game.moves.length,
                san,
                class: verdict.class,
                tags: why?.tags ?? [],
                accepted: true,
              },
            ],
          }
        : {}),
    });
  };

  // Index of the player's last move in the game, for "Take back".
  const firstMover = game.startFen.split(' ')[1] === 'b' ? 'black' : 'white';
  const moverAt = (i: number) => ((i % 2 === 0) === (firstMover === 'white') ? 'white' : 'black');
  const lastMine = (() => {
    for (let i = game.moves.length - 1; i >= 0; i--) if (moverAt(i) === game.you) return i;
    return -1;
  })();
  const canTakeBack = phase.kind === 'your-move' && replayStep === undefined && lastMine >= 0;

  /** Undoes the player's last move and the opponent's reply. */
  const takeBack = async () => {
    if (!canTakeBack) return;
    setNote(undefined);
    setPraise(undefined);
    setRare(undefined);
    setRefusal(undefined);
    setRefutation(undefined);
    await save({
      ...game,
      moves: game.moves.slice(0, lastMine),
      yourMoves: game.yourMoves.filter((m) => m.ply < lastMine),
      refusals: (game.refusals ?? []).filter((r) => !(r.accepted && r.ply >= lastMine)),
      takebacks: (game.takebacks ?? 0) + 1,
    });
  };

  const onBoardMove = (orig: string, dest: string) => {
    const from = parseSquare(orig)!;
    const to = parseSquare(dest)!;
    const lastRank = game.you === 'white' ? 7 : 0;
    const promo = pos.board.getRole(from) === 'pawn' && Math.floor(to / 8) === lastRank;
    void submit(standardUci(pos, { from, to, ...(promo ? { promotion: 'queen' } : {}) }));
  };

  // Hints come from the coach's search: the piece, then its square, then the move.
  const [hintText, setHintText] = useState<string[]>([]);
  const [hintMove, setHintMove] = useState<string>();
  useEffect(() => {
    if (phase.kind !== 'your-move' || !target.current) return;
    let live = true;
    void target.current.then((t) => {
      const best = t.lines[0]?.pv[0];
      if (!live || !best) return;
      setHintText(moveHints(fen, best, { answer: "The coach's move is" }));
      setHintMove(best);
    });
    return () => {
      live = false;
    };
  }, [phase.kind, fen]);

  const replayLine = refutation ? [refutation.uci, ...refutation.reply] : [];
  const replayPositions = useMemo(
    () => (refutation ? playLine(pos, replayLine, replayLine.length) : []),
    [refutation, fen],
  );
  const reason = useMemo(
    () =>
      refutation
        ? longTermReason(pos, game.you, [refutation.uci, ...refutation.full], refutation.best)
        : undefined,
    [refutation, fen],
  );
  const replaying =
    replayStep !== undefined && (phase.kind === 'your-move' || phase.kind === 'refused');

  // One sentence per move of the refuting line: from the board at once,
  // then forced replies and quiet threats from short engine searches.
  const [lineSteps, setLineSteps] = useState<LineStep[]>([]);
  /** The short searches have finished, so the line will not change. */
  const [lineDone, setLineDone] = useState(false);
  useEffect(() => {
    setLineDone(false);
    if (!refutation) {
      setLineSteps([]);
      return;
    }
    let live = true;
    const steps = narrateLine(pos, replayLine, game.you);
    setLineSteps(steps);
    void enrichLine(pos, replayLine, steps, (r) => services.pool.search(r)).then((rich) => {
      if (!live) return;
      setLineSteps(rich);
      setLineDone(true);
    });
    return () => {
      live = false;
    };
  }, [refutation, fen]);
  // The record the coach renders: the verdict, then the narrated line and
  // the long-term reason once they are known.
  const record = refusal ? withLine(refusal.record, lineSteps, reason) : undefined;
  // The on-device model's wording of the same record, when the player turned
  // it on, from the finished notes.
  const { text: phrased, status: modelStatus } = usePhrased(
    record && lineDone && phase.kind === 'refused' ? record : note?.sheet,
    !!services.settings.coachModel,
  );
  const shownFen = (() => {
    if (replaying && replayPositions[replayStep])
      return makeFen(replayPositions[replayStep]!.toSetup());
    if (phase.kind === 'checking' || phase.kind === 'refused') {
      const p = pos.clone();
      p.play(parseUci(phase.uci)!);
      return makeFen(p.toSetup());
    }
    return fen;
  })();
  const last =
    replaying && replayStep > 0
      ? uciSquares(replayLine[replayStep - 1]!)
      : phase.kind === 'checking' || phase.kind === 'refused'
        ? uciSquares(phase.uci)
        : game.moves.length
          ? uciSquares(game.moves[game.moves.length - 1]!)
          : undefined;
  const sans = pvToSan(game.startFen, game.moves, game.moves.length);
  const startPly =
    (Number(game.startFen.split(' ')[5] ?? 1) - 1) * 2 +
    (game.startFen.split(' ')[1] === 'b' ? 1 : 0);
  const labels = new Map(game.yourMoves.filter((m) => m.label).map((m) => [m.ply, m.label!]));

  if (game.end) return <Summary game={game} onNew={onNew} />;

  /** Back to the position before the refused move. */
  const tryAgain = () => {
    setReplayStep(undefined);
    setPhase({ kind: 'your-move' });
  };

  // What the opponent's last move threatens, shown on the player's turn.
  const lastIsTheirs = game.moves.length > 0 && moverAt(game.moves.length - 1) !== game.you;
  const lastSan = lastIsTheirs ? sans.at(-1) : undefined;
  const searchedThreat =
    yourTurn && engineThreat?.fen === fen
      ? threatText(fen, engineThreat.threat, lastSan)
      : undefined;
  const threat =
    searchedThreat ??
    (yourTurn && lastIsTheirs
      ? threatNote(
          fromFen(positions(game.startFen, game.moves.slice(0, -1)).at(-1)!),
          game.moves.at(-1)!,
        )
      : undefined);

  // Drawings on the board: badges for judged moves, arrows for replies and hints.
  const shapes: DrawShape[] = [];
  const squares = (u: string | undefined) => (u ? uciSquares(u) : undefined);
  if (phase.kind === 'refused' && refusal && !replaying) {
    const [, to] = uciSquares(phase.uci);
    shapes.push(badge(to, refusal.cls));
    shapes.push(...refusal.record.marks.map(markShape));
  } else if (replaying && replayStep! < replayLine.length) {
    const next = squares(replayLine[replayStep!]);
    if (next) shapes.push(arrow(next[0], next[1], 'red'));
  } else if (replaying && reason && replayStep === replayPositions.length - 1) {
    shapes.push(...reason.marks.map(markShape));
  } else if (phase.kind === 'thinking' && lastMine === game.moves.length - 1) {
    const l = labels.get(lastMine);
    if (l) shapes.push(badge(uciSquares(game.moves[lastMine]!)[1], l));
  } else if (phase.kind === 'your-move' && hintText.length) {
    const best = squares(hintMove);
    if (best && hints >= 2) shapes.push(ring(best[0], 'green'));
    if (best && hints >= hintText.length) shapes.push(arrow(best[0], best[1], 'green'));
  }

  // The coach bubble: one message at a time, short first, details on request.
  const coach = ((): {
    tone: MoveLabel | 'neutral';
    title: string;
    text?: string;
    points?: string[];
    tags?: TagName[];
  } => {
    if (phase.kind === 'checking')
      return { tone: 'neutral', title: `Checking ${moveText(uciToSan(fen, phase.uci))}…` };
    if (phase.kind === 'thinking') {
      if (praise)
        return {
          tone: praise.label,
          title: praise.headline,
          ...(rare ? { text: rare } : {}),
          points: praise.points,
        };
      if (note)
        return {
          tone: note.cls,
          title: `Accepted, but ${note.why.headline.charAt(0).toLowerCase()}${note.why.headline.slice(1)}`,
          ...(phrased && note.sheet ? { text: phrased } : {}),
          points: note.why.points,
          tags: note.why.tags,
        };
      return { tone: 'neutral', title: 'Your opponent is thinking.' };
    }
    if (refusal && (phase.kind === 'refused' || replaying))
      return phrased
        ? {
            // The model's sentences, with every point of the notes under "Why?".
            tone: refusal.cls,
            title: record!.sentences.headline,
            text: phrased,
            points: record!.sentences.points,
            tags: record!.tags,
          }
        : {
            tone: refusal.cls,
            title: record!.sentences.headline,
            ...(record!.sentences.points[0] ? { text: record!.sentences.points[0] } : {}),
            points: record!.sentences.points.slice(1),
            tags: record!.tags,
          };
    if (refusal)
      return {
        tone: refusal.cls,
        title: `Find a better move than ${moveText(uciToSan(fen, refutation?.uci ?? ''))}.`,
        ...(refusedHere >= 2 ? { text: 'Stuck? Tap Hint.' } : {}),
      };
    if (note)
      return {
        tone: note.cls,
        title: `Accepted, but ${note.why.headline.charAt(0).toLowerCase()}${note.why.headline.slice(1)}`,
        ...(phrased && note.sheet ? { text: phrased } : {}),
        points: note.why.points,
        tags: note.why.tags,
      };
    // The opponent's threat is the news on the player's turn; the verdict
    // on the player's last move moves under it.
    if (threat)
      return {
        tone: 'neutral',
        title: threat,
        ...(praise ? { text: `Your last move: ${praise.headline}` } : {}),
      };
    if (praise)
      return {
        tone: praise.label,
        title: praise.headline,
        ...(rare ? { text: rare } : {}),
        points: praise.points,
      };
    return { tone: 'neutral', title: 'Your move.' };
  })();

  return (
    <section class="screen screen--drill screen--play" aria-labelledby="game-title">
      <p class="drill__count">
        You play {game.you}
        {game.source ? ` · from ${game.source.label}` : ''} ·{' '}
        {game.maia
          ? `Maia ${game.maia}, plays like a player of that rating`
          : `${skillLabel(game.skill)} opponent, Skill Level ${game.skill}`}{' '}
        · {STRICTNESS_TEXT[game.strictness]}
      </p>
      <h1 id="game-title" class="play__status">
        {phase.kind === 'your-move' || phase.kind === 'refused' || phase.kind === 'checking'
          ? 'Your move'
          : 'Your opponent is thinking'}
      </h1>

      <MoveStrip sans={sans} startPly={startPly} labels={labels} />

      <Board
        fen={shownFen}
        orientation={game.you}
        lastMove={last}
        shapes={shapes}
        movable={
          phase.kind === 'your-move' && !replaying
            ? { color: game.you, dests: chessgroundDests(pos) as unknown as Map<string, string[]> }
            : undefined
        }
        onMove={onBoardMove}
        label={`Practice game, ${pos.turn} to move.`}
      />
      {showEval && evalWhite && <EvalBar score={evalWhite} label="Evaluation before your move" />}
      {pos.isCheck() && yourTurn && phase.kind === 'your-move' && (
        <p class="check-notice" role="status">
          You are in check.
        </p>
      )}

      <div class={`coach coach--${coach.tone}`} role="status" aria-live="polite">
        <span class="coach__badge" aria-hidden="true">
          {coach.tone === 'neutral' ? '♞' : LABEL_SYMBOL[coach.tone]}
        </span>
        <div class="coach__body">
          {coach.tone !== 'neutral' && <p class="coach__label">{LABEL_NAME[coach.tone]}</p>}
          <div class="coach__head">
            <p class="coach__title">{coach.title}</p>
            <SpeakButton
              text={
                // Status lines such as "Your move." are not read; verdicts and threats are.
                coach.tone === 'neutral' && coach.title !== threat
                  ? ''
                  : [coach.title, coach.text].filter(Boolean).join(' ')
              }
              // The template was read when it appeared; the model's later
              // wording replaces it quietly, to be read on a tap.
              auto={!phrased}
            />
          </div>
          {coach.text && <p class="coach__text">{coach.text}</p>}
          {modelStatus && coach.tone !== 'neutral' && (
            <p class="hint coach__model">{modelStatus}</p>
          )}
          {((coach.points?.length ?? 0) > 0 || (coach.tags?.length ?? 0) > 0) && (
            <details class="coach__why">
              <summary>Why?</summary>
              {(coach.points?.length ?? 0) > 0 && (
                <ul class="verdict__points">
                  {coach.points!.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              )}
              {(coach.tags?.length ?? 0) > 0 && (
                <p class="verdict__tags">
                  {coach.tags!.map((t) =>
                    lessonFor(t) ? (
                      <a
                        key={t}
                        class="chip"
                        href={href('learn', lessonFor(t)!)}
                        title="Open the lesson on this pattern"
                      >
                        {TAG_INFO[t].label}
                      </a>
                    ) : (
                      <span key={t} class="chip">
                        {TAG_INFO[t].label}
                      </span>
                    ),
                  )}
                </p>
              )}
            </details>
          )}
          {hints > 0 && phase.kind === 'your-move' && (
            <ol class="coach__hints">
              {hintText.slice(0, hints).map((h) => (
                <li key={h}>{h}</li>
              ))}
            </ol>
          )}
          {phase.kind === 'refused' && !replaying && (
            <div class="row coach__actions">
              <button type="button" class="button button--primary" onClick={tryAgain}>
                Try again
              </button>
              {replayLine.length > 1 && (
                <button type="button" class="button" onClick={() => setReplayStep(1)}>
                  Show what happens
                </button>
              )}
              {import.meta.env.DEV && record && (
                <button
                  type="button"
                  class="button"
                  onClick={() => void navigator.clipboard.writeText(toJsonl([record]))}
                >
                  Copy record (dev)
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {replaying && (
        <div class="panel stepper">
          <ol class="stepper__lines">
            {record!.line.slice(0, replayStep).map((st, k) => (
              <li key={st.uci + k} class={k === replayStep - 1 ? 'is-current' : ''}>
                <span class="stepper__san">{MoveText(st.san)}.</span> {stepWords(st.text)}
              </li>
            ))}
          </ol>
          {refutation && replayStep === replayPositions.length - 1 && (
            <div class="stepper__why">
              <p>
                <strong>Why this is worse.</strong> {record?.sentences.reason}
              </p>
              <p class="hint">Compared with a better move:</p>
              {(() => {
                const diffs = compareLines(pos, game.you, replayLine, refutation.best);
                return diffs.length ? (
                  <ul class="verdict__points">
                    {diffs.map((d) => (
                      <li key={d}>{d}</li>
                    ))}
                  </ul>
                ) : (
                  <p class="hint">
                    Material and the features the coach counts are the same. The difference is in
                    the engine's deeper search: try another move and compare.
                  </p>
                );
              })()}
            </div>
          )}
          <div class="row">
            <button
              type="button"
              class="button"
              disabled={replayStep <= 1}
              onClick={() => setReplayStep(replayStep - 1)}
            >
              Back
            </button>
            <button
              type="button"
              class="button"
              disabled={replayStep >= replayPositions.length - 1}
              onClick={() => setReplayStep(replayStep + 1)}
            >
              Forward
            </button>
            <button type="button" class="button button--primary stepper__done" onClick={tryAgain}>
              Try again
            </button>
          </div>
        </div>
      )}

      <div class="row play__actions">
        {phase.kind === 'your-move' && hints < hintText.length && (
          <button type="button" class="button" onClick={() => setHints((h) => h + 1)}>
            {hints === 0 ? 'Hint' : 'Another hint'}
          </button>
        )}
        {canTakeBack && (
          <button type="button" class="button" onClick={() => void takeBack()}>
            Take back
          </button>
        )}
        <button
          type="button"
          class="button"
          aria-pressed={showEval}
          onClick={() => {
            setShowEval(!showEval);
            writeShowEval(!showEval);
          }}
        >
          {showEval ? 'Hide evaluation' : 'Show evaluation'}
        </button>
        <button
          type="button"
          class="button button--danger"
          onClick={() =>
            confirmResign ? void finish(game, { kind: 'resigned' }) : setConfirmResign(true)
          }
          onBlur={() => setConfirmResign(false)}
        >
          {confirmResign ? 'Tap again to resign' : 'Resign'}
        </button>
      </div>

      <TypedMove disabled={phase.kind !== 'your-move'} fen={fen} onMove={(u) => void submit(u)} />

      {visits.length > 0 && (
        <div class="panel">
          <h2>From your games</h2>
          <p>
            You reached this position in {visits.length} {visits.length === 1 ? 'game' : 'games'}.
          </p>
          <ul class="plain-list">
            {visits.slice(0, 3).map((v) => (
              <li key={`${v.gameId}-${v.ply}`}>
                <a href={href('game', v.gameId, String(v.ply))}>
                  vs {v.opponent}, {formatDate(v.playedAt)}
                </a>
                <span class="hint">
                  you played {v.san} and {v.outcome}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function markShape(m: Mark): DrawShape {
  return m.dest ? arrow(m.orig, m.dest, m.brush) : ring(m.orig, m.brush);
}

/** The game's moves in one scrolling line, with a badge on each judged move of the player. */
function MoveStrip({
  sans,
  startPly,
  labels,
}: {
  sans: string[];
  startPly: number;
  labels: Map<number, MoveLabel>;
}) {
  const ref = useRef<HTMLOListElement>(null);
  useEffect(() => {
    ref.current?.scrollTo({ left: ref.current.scrollWidth });
  }, [sans.length]);
  if (!sans.length) return null;
  return (
    <ol class="move-strip num" ref={ref} aria-label="Moves">
      {sans.map((s, i) => {
        const ply = startPly + i;
        const l = labels.get(i);
        return (
          <li key={i}>
            {(ply % 2 === 0 || i === 0) && <span class="move-strip__num">{moveLabel(ply)}</span>}
            <span class="move-strip__san">
              {s}
              {l && (
                <span
                  class="move-strip__badge"
                  style={{ background: LABEL_COLOR[l] }}
                  title={LABEL_NAME[l]}
                >
                  {LABEL_SYMBOL[l]}
                </span>
              )}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** The patterns behind this game's weak moves, most frequent first. */
function PatternList({ game }: { game: PracticeGame }) {
  const counts = new Map<string, number>();
  for (const r of game.refusals ?? [])
    for (const t of r.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
  const weak = game.refusals ?? [];
  if (weak.length === 0) return <p>The coach found no weak moves in this game.</p>;
  return (
    <div class="panel">
      <h2>What to remember</h2>
      <ul class="plain-list">
        {weak.map((r) => (
          <li key={`${r.ply}-${r.san}`}>
            <span>
              {moveLabel(r.ply)} {r.san}
              {CLASS_SYMBOL[r.class]}
              {r.accepted ? ' (let through)' : ''}
            </span>
            <span class="hint">{CLASS_LABEL[r.class]}</span>
          </li>
        ))}
      </ul>
      {counts.size > 0 && (
        <p class="hint">
          Patterns:{' '}
          {[...counts]
            .sort((a, b) => b[1] - a[1])
            .map(([t, n]) => `${TAG_INFO[t as keyof typeof TAG_INFO].label} (${n})`)
            .join(', ')}
        </p>
      )}
    </div>
  );
}

function Summary({ game, onNew }: { game: PracticeGame; onNew: () => void }) {
  const services = useServices()!;
  const end = game.end!;
  const refused = game.yourMoves.filter((m) => m.refused > 0).length;
  const hinted = game.yourMoves.filter((m) => m.hinted).length;
  const accuracy = gameAccuracy(
    game.yourMoves.filter((m) => m.drop !== undefined).map((m) => m.drop!),
  );
  const counts = LABEL_ORDER.map(
    (l) => [l, game.yourMoves.filter((m) => m.first === l).length] as const,
  );
  const finalPos = currentPosition(game);
  const finalFen = makeFen(finalPos.toSetup());
  const newGame = async () => {
    await saveCurrent(services.repo, undefined);
    onNew();
    navigate('play');
  };
  return (
    <section class="screen" aria-labelledby="summary-title">
      <h1 id="summary-title">
        {end.kind === 'resigned' ? 'You resigned' : endText(end, game.you)}
        <span class="subtitle">
          Practice game from {game.source?.label ?? 'the starting position'}
        </span>
      </h1>
      <Board
        fen={finalFen}
        orientation={game.you}
        lastMove={game.moves.length ? uciSquares(game.moves[game.moves.length - 1]!) : undefined}
        label="Final position."
      />
      {accuracy !== undefined && (
        <div class="panel review-card">
          <p class="review-card__accuracy">
            <span class="review-card__number num">{accuracy.toFixed(1)}</span>
            <span>Accuracy on your first tries</span>
          </p>
          <ul class="review-card__counts">
            {counts.map(([l, n]) => (
              <li key={l}>
                <span
                  class="move-strip__badge"
                  style={{ background: LABEL_COLOR[l] }}
                  aria-hidden="true"
                >
                  {LABEL_SYMBOL[l]}
                </span>
                <span>{LABEL_NAME[l]}</span>
                <span class="num">{n}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <ul class="plain-list num">
        <li>
          <span>Your moves</span> <span>{game.yourMoves.length}</span>
        </li>
        <li>
          <span>Sent back by the coach</span> <span>{refused}</span>
        </li>
        <li>
          <span>Needed a hint</span> <span>{hinted}</span>
        </li>
        <li>
          <span>Moves taken back</span> <span>{game.takebacks ?? 0}</span>
        </li>
      </ul>
      <PatternList game={game} />
      {game.savedDrills > 0 && (
        <p>
          {game.savedDrills} {game.savedDrills === 1 ? 'position was' : 'positions were'} saved as
          drills. They come back in your daily practice until you get them right.
        </p>
      )}
      <div class="row">
        <a class="button button--primary" href={href('practice', game.id)}>
          Review this game
        </a>
        <button type="button" class="button" onClick={() => void newGame()}>
          New practice game
        </button>
        <a class="button" href={href('train')}>
          Daily practice
        </a>
      </div>
    </section>
  );
}
