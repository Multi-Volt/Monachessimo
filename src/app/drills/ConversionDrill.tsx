import { chessgroundDests } from 'chessops/compat';
import { makeFen } from 'chessops/fen';
import { parseSquare, parseUci } from 'chessops/util';
import { useEffect, useRef, useState } from 'preact/hooks';
import { uciSquares } from '../../chess/san';
import { parseSan } from 'chessops/san';
import { standardUci } from '../../chess/uci';
import { fromFen } from '../../detectors/board';
import { Engine } from '../../engine/engine';
import { negate, winningChances, type Score } from '../../engine/eval';
import { workerTransport } from '../../engine/worker';
import type { Drill, Grade } from '../../drills/types';
import { Board } from '../../ui/Board';
import { SpeakButton } from '../../ui/SpeakButton';
import { formatScore } from '../../ui/format';
import { useServices } from '../../ui/hooks';

/** The drill ends as a loss when the player's winning chances fall below this (about +1.5). */
export const LOST_ADVANTAGE = winningChances({ kind: 'cp', value: 150 });
/** Most moves the player gets before the drill ends. */
export const MAX_MOVES = 30;

type State =
  { kind: 'thinking' } | { kind: 'your-move' } | { kind: 'over'; grade: Grade; text: string };

/**
 * Conversion practice: play a winning position out against Stockfish at a
 * low Skill Level. A full-strength check after each move judges progress.
 */
export function ConversionDrill({ drill, onDone }: { drill: Drill; onDone: (g: Grade) => void }) {
  const services = useServices()!;
  const [fen, setFen] = useState(drill.fen);
  const [last, setLast] = useState<[string, string]>();
  const [moves, setMoves] = useState(0);
  const [score, setScore] = useState<Score>(drill.bestScore);
  const [state, setState] = useState<State>({ kind: 'your-move' });
  const opponent = useRef<Engine | undefined>(undefined);

  useEffect(() => {
    opponent.current = new Engine(workerTransport(), {
      uci: { 'Skill Level': drill.opponentSkill ?? 5 },
    });
    return () => opponent.current?.terminate();
  }, [drill.id]);

  const end = (grade: Grade, text: string) => {
    setState({ kind: 'over', grade, text });
    onDone(grade);
  };

  const play = async (uci: string) => {
    if (state.kind !== 'your-move') return;
    const pos = fromFen(fen);
    pos.play(parseUci(uci)!);
    const n = moves + 1;
    setMoves(n);
    setFen(makeFen(pos.toSetup()));
    setLast(uciSquares(uci));
    if (pos.isCheckmate())
      return end(n <= MAX_MOVES ? 'good' : 'hard', 'Checkmate. You converted the win.');
    if (pos.isEnd()) return end('fail', 'The game ended in a draw.');
    setState({ kind: 'thinking' });

    // Judge the player's move at full strength, from the player's side.
    const check = await services.pool.search({
      fen: makeFen(pos.toSetup()),
      depth: 12,
      movetime: 800,
    });
    const mine = check.lines[0] ? negate(check.lines[0].score) : { kind: 'cp' as const, value: 0 };
    setScore(mine);
    if (winningChances(mine) < LOST_ADVANTAGE)
      return end(
        'fail',
        `Your advantage is gone: the engine rates the position ${formatScore(mine)}.`,
      );
    if (mine.kind === 'mate' && mine.value > 0 && mine.value <= 3)
      return end('good', `You have a forced mate in ${mine.value}. The win is secure.`);
    if (n >= MAX_MOVES)
      return end(
        'hard',
        `After ${MAX_MOVES} moves you are still winning, at ${formatScore(mine)}.`,
      );

    // The weakened engine answers.
    const reply = await opponent.current!.search({ fen: makeFen(pos.toSetup()), movetime: 300 });
    if (!reply.bestmove) return end('good', 'Your opponent has no moves left.');
    pos.play(parseUci(reply.bestmove)!);
    setFen(makeFen(pos.toSetup()));
    setLast(uciSquares(reply.bestmove));
    if (pos.isCheckmate()) return end('fail', 'You were checkmated.');
    if (pos.isEnd()) return end('fail', 'The game ended in a draw.');
    setState({ kind: 'your-move' });
  };

  const pos = fromFen(fen);
  const onMove = (orig: string, dest: string) => {
    const from = parseSquare(orig)!;
    const to = parseSquare(dest)!;
    const lastRank = drill.side === 'white' ? 7 : 0;
    const promo = pos.board.getRole(from) === 'pawn' && Math.floor(to / 8) === lastRank;
    void play(standardUci(pos, { from, to, ...(promo ? { promotion: 'queen' } : {}) }));
  };

  return (
    <>
      <p class="hint num">
        Move {Math.min(moves + 1, MAX_MOVES)} of {MAX_MOVES} · evaluation {formatScore(score)} for
        you · opponent at Stockfish Skill Level {drill.opponentSkill ?? 5}
      </p>
      <Board
        fen={fen}
        orientation={drill.side}
        lastMove={last}
        movable={
          state.kind === 'your-move'
            ? {
                color: drill.side,
                dests: chessgroundDests(pos) as unknown as Map<string, string[]>,
              }
            : undefined
        }
        onMove={onMove}
        label={`Conversion game, ${pos.turn} to move`}
      />
      {state.kind === 'your-move' && (
        <p class="hint board-help">Drag a piece, or tap it and then tap where it goes.</p>
      )}
      <TypedMove disabled={state.kind !== 'your-move'} fen={fen} onMove={(u) => void play(u)} />
      {state.kind === 'your-move' && moves > 0 && (
        <p>
          <button
            type="button"
            class="button"
            onClick={() => end('fail', 'You stopped the game here.')}
          >
            Stop here
          </button>
        </p>
      )}
      <div aria-live="polite">
        {state.kind === 'thinking' && <p class="notice">The engine is thinking…</p>}
        {state.kind === 'over' && (
          <div
            class={`panel ${state.grade === 'fail' ? 'panel--mistake' : 'panel--good'}`}
            role="status"
          >
            <div class="learn__head">
              <p>{state.text}</p>
              <SpeakButton text={state.text} />
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/** Text move entry, the accessible alternative to the board. */
export function TypedMove(props: {
  disabled: boolean;
  fen: string;
  onMove: (uci: string) => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string>();
  if (props.disabled) return null;
  return (
    <details class="move-type">
      <summary>Type a move instead</summary>
      <form
        class="move-input"
        onSubmit={(e) => {
          e.preventDefault();
          const pos = fromFen(props.fen);
          const t = text.trim();
          const m = parseSan(pos, t) ?? parseUci(t.toLowerCase());
          if (!m || !pos.isLegal(m)) {
            setError(`${t || 'That'} is not a legal move here. Use SAN like Nf3 or UCI like g1f3.`);
            return;
          }
          setError(undefined);
          setText('');
          props.onMove(standardUci(pos, m));
        }}
      >
        <label for="typed-move">Type a move</label>
        <div class="row">
          <input
            id="typed-move"
            type="text"
            autoComplete="off"
            autoCapitalize="none"
            spellcheck={false}
            placeholder="Nf3 or g1f3"
            value={text}
            onInput={(e) => setText(e.currentTarget.value)}
          />
          <button type="submit" class="button">
            Play
          </button>
        </div>
        {error && (
          <p class="error-text" role="alert">
            {error}
          </p>
        )}
      </form>
    </details>
  );
}
