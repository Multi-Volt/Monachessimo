import { chessgroundDests } from 'chessops/compat';
import { makeFen } from 'chessops/fen';
import { makeSquare, parseSquare, parseUci } from 'chessops/util';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { moveLabel, replay } from '../../analysis/positions';
import { settingsKey } from '../../analysis/types';
import { pvToSan, uciSquares, uciToSan } from '../../chess/san';
import { standardUci } from '../../chess/uci';
import { getRating } from '../../drills/data';
import { Engine, type SearchResult } from '../../engine/engine';
import { negate } from '../../engine/eval';
import { workerTransport } from '../../engine/worker';
import type { Game, Side } from '../../import/types';
import {
  endText,
  gameEnd,
  moveDrop,
  refuses,
  skillFor,
  skillLabel,
  STRICTNESS_TEXT,
  type Strictness,
} from '../../play/coach';
import {
  addSummary,
  currentPosition,
  history,
  loadCurrent,
  practiceDrill,
  saveCurrent,
  type PracticeGame,
} from '../../play/data';
import { buildIndex, yourVisits, type Visit } from '../../play/positions';
import { Board } from '../../ui/Board';
import { formatDate } from '../../ui/format';
import { useAsync, useServices } from '../../ui/hooks';
import { TypedMove } from '../drills/ConversionDrill';
import { href, navigate } from '../router';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
/** How long a refused move stays on the board before it goes back. */
const REFUSED_MS = 900;
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
  const [strictness, setStrictness] = useState<Strictness>('mistakes');

  if (data.status !== 'ok' || !data.value) return <p class="screen">Loading…</p>;
  const { games, mistakes, rating } = data.value;
  const level = skill ?? skillFor(rating);
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
      strictness,
      startedAt: Date.now(),
      yourMoves: [],
      savedDrills: 0,
      source,
    };
    await saveCurrent(services.repo, game);
    onStart(game);
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
          <div class="field">
            <label for="game">Game</label>
            <select
              id="game"
              value={chosen.id}
              onChange={(e) => (setGameId(e.currentTarget.value), setPly(0))}
            >
              {games.slice(0, 50).map((g) => (
                <option key={g.id} value={g.id}>
                  {formatDate(g.playedAt)} vs {opponentOf(g)}, {g.speed}
                </option>
              ))}
            </select>
            <label for="ply">
              Start after {ply === 0 ? 'no moves' : `${moveLabel(ply - 1)} ${chosen.san[ply - 1]}`}
            </label>
            <input
              id="ply"
              type="range"
              min={0}
              max={Math.max(0, chosen.uci.length - 1)}
              value={Math.min(ply, chosen.uci.length - 1)}
              onInput={(e) => setPly(Number(e.currentTarget.value))}
            />
          </div>
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
  const [refusal, setRefusal] = useState<string>();
  const [hints, setHints] = useState(0);
  const [refusedHere, setRefusedHere] = useState(0);
  /** Resign needs a second tap, so a stray tap does not end the game. */
  const [confirmResign, setConfirmResign] = useState(false);
  const opponent = useRef<Engine | undefined>(undefined);
  const target = useRef<Promise<SearchResult> | undefined>(undefined);
  const savedHere = useRef(false);

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
      setRefusedHere(0);
      setHints(0);
      savedHere.current = false;
      setPhase({ kind: 'your-move' });
      return;
    }
    setPhase({ kind: 'thinking' });
    let live = true;
    void (async () => {
      await new Promise((r) => setTimeout(r, 250));
      const reply = await opponent.current!.search({ fen, movetime: OPPONENT_MS });
      if (!live || !reply.bestmove) return;
      setPhase({ kind: 'opponent', uci: reply.bestmove });
      await save({ ...game, moves: [...game.moves, reply.bestmove] });
    })();
    return () => {
      live = false;
    };
  }, [game.moves.length, game.end]);

  const submit = async (uci: string) => {
    if (phase.kind !== 'your-move') return;
    setPhase({ kind: 'checking', uci });
    const t = await target.current!;
    const best = t.lines[0]?.score ?? { kind: 'cp' as const, value: 0 };
    const after = pos.clone();
    after.play(parseUci(uci)!);
    let played = t.lines.find((l) => l.pv[0] === uci)?.score;
    if (!played) {
      if (after.isCheckmate()) played = { kind: 'mate', value: 1 };
      else if (after.isEnd()) played = { kind: 'cp', value: 0 };
      else {
        const r = await services.pool.search({
          fen: makeFen(after.toSetup()),
          depth: 12,
          movetime: 800,
        });
        played = r.lines[0] ? negate(r.lines[0].score) : { kind: 'cp', value: 0 };
      }
    }
    if (refuses(game.strictness, best, played)) {
      const drop = moveDrop(best, played);
      const san = uciToSan(fen, uci);
      const text = `${san} costs about ${Math.round(drop * 50)}% of your winning chances. Find a better move.`;
      setRefusal(text);
      setRefusedHere((n) => n + 1);
      setPhase({ kind: 'refused', uci, text });
      // Save the position as a drill the first time a move is refused here.
      if (!savedHere.current) {
        savedHere.current = true;
        const rating = (await getRating(services.repo)).rating;
        const drill = practiceDrill(fen, game.you, uci, drop, t.lines, rating, Date.now());
        if (drill) {
          await services.repo.putDrills([drill]);
          await save({ ...game, savedDrills: game.savedDrills + 1 });
        }
      }
      setTimeout(
        () => setPhase((p) => (p.kind === 'refused' && p.uci === uci ? { kind: 'your-move' } : p)),
        REFUSED_MS,
      );
      return;
    }
    setRefusal(undefined);
    await save({
      ...game,
      moves: [...game.moves, uci],
      yourMoves: [
        ...game.yourMoves,
        { ply: game.moves.length, refused: refusedHere, hinted: hints > 0 },
      ],
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
  useEffect(() => {
    if (phase.kind !== 'your-move' || !target.current) return;
    let live = true;
    void target.current.then((t) => {
      const best = t.lines[0]?.pv[0];
      if (!live || !best) return;
      const m = parseUci(best);
      const from = m && 'from' in m ? m.from : undefined;
      const role = from !== undefined ? pos.board.getRole(from) : undefined;
      setHintText(
        role && from !== undefined
          ? [
              `Move a ${role}.`,
              `Move the ${role} on ${makeSquare(from)}.`,
              `The coach's move is ${uciToSan(fen, best)}.`,
            ]
          : [],
      );
    });
    return () => {
      live = false;
    };
  }, [phase.kind, fen]);

  const shownFen = (() => {
    if (phase.kind === 'checking' || phase.kind === 'refused') {
      const p = pos.clone();
      p.play(parseUci(phase.uci)!);
      return makeFen(p.toSetup());
    }
    return fen;
  })();
  const last =
    phase.kind === 'checking' || phase.kind === 'refused'
      ? uciSquares(phase.uci)
      : game.moves.length
        ? uciSquares(game.moves[game.moves.length - 1]!)
        : undefined;
  const sans = pvToSan(game.startFen, game.moves, game.moves.length);
  const startPly =
    (Number(game.startFen.split(' ')[5] ?? 1) - 1) * 2 +
    (game.startFen.split(' ')[1] === 'b' ? 1 : 0);

  if (game.end) return <Summary game={game} onNew={onNew} />;

  return (
    <section class="screen screen--drill" aria-labelledby="game-title">
      <p class="drill__count">
        Practice game · {skillLabel(game.skill)} opponent, Skill Level {game.skill} ·{' '}
        {STRICTNESS_TEXT[game.strictness]}
      </p>
      <h1 id="game-title" class="drill__goal">
        {phase.kind === 'your-move' || phase.kind === 'refused' || phase.kind === 'checking'
          ? 'Your move'
          : 'Your opponent is thinking'}
      </h1>
      <p class="hint">
        You play {game.you}
        {game.source ? ` · from ${game.source.label}` : ''}
      </p>
      <Board
        fen={shownFen}
        orientation={game.you}
        lastMove={last}
        movable={
          phase.kind === 'your-move'
            ? { color: game.you, dests: chessgroundDests(pos) as unknown as Map<string, string[]> }
            : undefined
        }
        onMove={onBoardMove}
        label={`Practice game, ${pos.turn} to move.`}
      />
      {phase.kind === 'your-move' && (
        <p class="hint board-help">Drag a piece, or tap it and then tap where it goes.</p>
      )}
      <TypedMove disabled={phase.kind !== 'your-move'} fen={fen} onMove={(u) => void submit(u)} />

      <div aria-live="polite">
        {phase.kind === 'checking' && (
          <p class="notice">The coach is checking {uciToSan(fen, phase.uci)}…</p>
        )}
        {refusal && (phase.kind === 'refused' || phase.kind === 'your-move') && (
          <div class="panel panel--mistake" role="status">
            <p>
              <strong>Not good enough.</strong> {refusal}
            </p>
          </div>
        )}
      </div>

      {hints > 0 && phase.kind === 'your-move' && (
        <ol class="hint-list">
          {hintText.slice(0, hints).map((h) => (
            <li key={h}>{h}</li>
          ))}
        </ol>
      )}

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

      <div class="row row--actions">
        {phase.kind === 'your-move' && hints < hintText.length && (
          <button type="button" class="button" onClick={() => setHints((h) => h + 1)}>
            {hints === 0 ? 'Hint' : 'Another hint'}
          </button>
        )}
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

      {sans.length > 0 && (
        <div class="panel">
          <h2>Moves</h2>
          <p class="num">
            {sans
              .map((s, i) => {
                const ply = startPly + i;
                const label = ply % 2 === 0 || i === 0 ? `${moveLabel(ply)} ` : '';
                return label + s;
              })
              .join(' ')}
          </p>
        </div>
      )}
    </section>
  );
}

function Summary({ game, onNew }: { game: PracticeGame; onNew: () => void }) {
  const services = useServices()!;
  const end = game.end!;
  const firstTry = game.yourMoves.filter((m) => m.refused === 0 && !m.hinted).length;
  const refused = game.yourMoves.filter((m) => m.refused > 0).length;
  const hinted = game.yourMoves.filter((m) => m.hinted).length;
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
      <ul class="plain-list num">
        <li>
          <span>Your moves</span> <span>{game.yourMoves.length}</span>
        </li>
        <li>
          <span>Good on the first try</span> <span>{firstTry}</span>
        </li>
        <li>
          <span>Sent back by the coach</span> <span>{refused}</span>
        </li>
        <li>
          <span>Needed a hint</span> <span>{hinted}</span>
        </li>
      </ul>
      {game.savedDrills > 0 && (
        <p>
          {game.savedDrills} {game.savedDrills === 1 ? 'position was' : 'positions were'} saved as
          drills. They come back in your daily practice until you get them right.
        </p>
      )}
      <div class="row">
        <button type="button" class="button button--primary" onClick={() => void newGame()}>
          New practice game
        </button>
        <a class="button" href={href('train')}>
          Daily practice
        </a>
      </div>
    </section>
  );
}
