import type { DrawShape } from 'chessground/draw';
import type { Board as ChessBoard } from 'chessops/board';
import { chessgroundDests } from 'chessops/compat';
import type { Color, Role } from 'chessops/types';
import { makeSquare, parseSquare, parseUci } from 'chessops/util';
import { h } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { pvToSan, uciSquares } from '../../chess/san';
import { standardUci } from '../../chess/uci';
import { fromFen, playLine } from '../../detectors/board';
import type { SearchResult } from '../../engine/engine';
import { negate, type Score } from '../../engine/eval';
import { findThreat, type Threat } from '../../engine/threat';
import {
  applyTyped,
  boardOf,
  checkFen,
  fenFromBoard,
  fenOf,
  fenToHash,
  hashToFen,
  INITIAL_FEN,
  pieceLetter,
  pieceName,
  place,
  READING_ORDER,
  type Placement,
} from '../../lab/position';
import { judgeMove } from '../../play/coach';
import { explainMove } from '../../play/explain';
import { nullMoveFen } from '../../engine/threat';
import { isCapture, normalMove } from '../../detectors/board';
import { praiseMove } from '../../play/praise';
import { buildRecord } from '../../play/record';
import { arrow, LABEL_NAME, LABEL_SYMBOL, type MoveLabel } from '../../ui/badges';
import { Board } from '../../ui/Board';
import { SpeakButton } from '../../ui/SpeakButton';
import { EvalBar, whiteScore } from '../../ui/EvalBar';
import { formatScore } from '../../ui/format';
import { useServices } from '../../ui/hooks';
import { TypedMove } from '../drills/ConversionDrill';
import { href, navigate } from '../router';
import { MoveText, moveText } from '../../chess/words';

const DEPTHS = [12, 16, 20] as const;
const LINE_COUNTS = [1, 2, 3] as const;
const ROLES: Role[] = ['king', 'queen', 'rook', 'bishop', 'knight', 'pawn'];

/** The coach's word on a move tried in the Lab. */
interface Tried {
  ply: number;
  tone: MoveLabel | 'neutral';
  title: string;
  points: string[];
}

/**
 * A position sandbox: set up or paste a position, analyse it on the device,
 * see the threat, try moves and hear what the coach thinks of them, then
 * play it out. The position lives in the URL hash so it can be shared.
 */
export function Lab({ initialFen }: { initialFen?: string | undefined }) {
  const services = useServices();
  const [startFen, setStartFen] = useState(() => hashToFen(initialFen) ?? INITIAL_FEN);
  const [moves, setMoves] = useState<string[]>([]);
  const [cursor, setCursor] = useState(0);
  const [editing, setEditing] = useState(false);
  const [orientation, setOrientation] = useState<Color>(() => fromFen(startFen).turn);
  const [depth, setDepth] = useState<(typeof DEPTHS)[number]>(16);
  const [multipv, setMultipv] = useState<(typeof LINE_COUNTS)[number]>(3);
  const [analysis, setAnalysis] = useState<SearchResult>();
  const [threat, setThreat] = useState<{ fen: string; threat: Threat }>();
  const [tried, setTried] = useState<Tried>();
  const [fenText, setFenText] = useState('');
  const [fenError, setFenError] = useState<string>();

  const positions = useMemo(
    () => playLine(fromFen(startFen), moves, moves.length),
    [startFen, moves],
  );
  const pos = positions[cursor] ?? positions[0]!;
  const fen = fenOf(pos);
  const sans = useMemo(() => pvToSan(startFen, moves, moves.length), [startFen, moves]);

  // The position goes in the hash without adding history entries.
  useEffect(() => {
    history.replaceState(null, '', href('lab', fenToHash(fen)));
  }, [fen]);

  // Analysis of the shown position, then the threat behind it.
  useEffect(() => {
    if (!services || editing || pos.isEnd()) {
      setAnalysis(undefined);
      return;
    }
    const ctrl = new AbortController();
    setAnalysis(undefined);
    setThreat(undefined);
    void (async () => {
      try {
        const r = await services.pool.search({ fen, depth, multipv }, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setAnalysis(r);
        const current = r.lines[0]?.score;
        if (!current || pos.isCheck()) return;
        const t = await findThreat((q) => services.pool.search(q, ctrl.signal), fen, current);
        if (!ctrl.signal.aborted && t) setThreat({ fen, threat: t });
      } catch {
        // Aborted by a newer position.
      }
    })();
    return () => ctrl.abort();
  }, [services, fen, depth, multipv, editing]);

  const load = (next: string) => {
    setStartFen(next);
    setMoves([]);
    setCursor(0);
    setTried(undefined);
    setOrientation(fromFen(next).turn);
  };

  const play = async (uci: string) => {
    const before = pos;
    const beforeFen = fen;
    const ply = cursor;
    setMoves([...moves.slice(0, cursor), uci]);
    setCursor(cursor + 1);
    setTried({ ply: ply + 1, tone: 'neutral', title: 'Checking the move…', points: [] });
    if (!services) return;
    // Judge the move against the engine, as in a practice game.
    const t =
      analysis?.fen === beforeFen && analysis.lines.length >= 2
        ? analysis
        : await services.pool.search({ fen: beforeFen, depth: 14, movetime: 1500, multipv: 3 });
    const best = t.lines[0]?.score ?? { kind: 'cp' as const, value: 0 };
    const after = before.clone();
    after.play(parseUci(uci)!);
    const inLines = t.lines.find((l) => l.pv[0] === uci);
    let played: Score;
    let reply: string[] = [];
    if (after.isCheckmate()) played = { kind: 'mate', value: 1 };
    else if (after.isEnd()) played = { kind: 'cp', value: 0 };
    else if (inLines) {
      played = inLines.score;
      reply = inLines.pv.slice(1);
    } else {
      const r = await services.pool.search({ fen: fenOf(after), depth: 14, movetime: 1200 });
      played = r.lines[0] ? negate(r.lines[0].score) : { kind: 'cp', value: 0 };
      reply = r.lines[0]?.pv ?? [];
    }
    const verdict = judgeMove(best, played);
    let word: Tried;
    if (verdict.class) {
      const why = explainMove({
        before,
        uci,
        reply,
        lines: t.lines,
        best,
        played,
        verdict,
        ply,
        threat: threat?.fen === beforeFen ? threat.threat : undefined,
      });
      const record = buildRecord({ before, uci, reply, verdict, explanation: why });
      word = {
        ply: ply + 1,
        tone: verdict.class,
        title: record.sentences.headline,
        points: record.sentences.points,
      };
    } else {
      const praise = praiseMove({ before, uci, lines: t.lines, played, verdict });
      const san = pvToSan(beforeFen, [uci], 1)[0] ?? uci;
      word = praise
        ? { ply: ply + 1, tone: praise.label, title: praise.headline, points: praise.points }
        : { ply: ply + 1, tone: 'neutral', title: `${MoveText(san)} is fine.`, points: [] };
    }
    setTried((cur) => (cur?.ply === ply + 1 ? word : cur));
  };

  const onBoardMove = (orig: string, dest: string) => {
    const from = parseSquare(orig);
    const to = parseSquare(dest);
    if (from === undefined || to === undefined) return;
    const promotion = pos.board.getRole(from) === 'pawn' && (dest[1] === '8' || dest[1] === '1');
    void play(standardUci(pos, { from, to, ...(promotion ? { promotion: 'queen' } : {}) }));
  };

  if (editing)
    return (
      <Editor
        fen={fen}
        onCancel={() => setEditing(false)}
        onDone={(next) => {
          load(next);
          setEditing(false);
        }}
      />
    );

  const turnWord = pos.turn === 'white' ? 'White' : 'Black';
  const best = analysis?.fen === fen ? analysis.lines : [];
  const shownThreat = threat?.fen === fen ? labThreat(fen, threat.threat) : undefined;
  const shapes: DrawShape[] = [];
  const top = best[0]?.pv[0];
  if (top) {
    const [a, b] = uciSquares(top);
    shapes.push(arrow(a, b, 'blue'));
  }
  if (threat?.fen === fen && shownThreat) {
    const [a, b] = uciSquares(threat.threat.uci);
    shapes.push(arrow(a, b, 'red'));
  }
  const shownTried = tried?.ply === cursor ? tried : undefined;
  const last = cursor > 0 ? uciSquares(moves[cursor - 1]!) : undefined;
  const status = pos.isCheckmate()
    ? `Checkmate. ${pos.turn === 'white' ? 'Black' : 'White'} wins.`
    : pos.isStalemate()
      ? 'Stalemate.'
      : pos.isInsufficientMaterial()
        ? 'Draw by insufficient material.'
        : `${turnWord} to move${pos.isCheck() ? ', in check' : ''}.`;

  return (
    <section class="screen screen--drill screen--lab" aria-labelledby="lab-title">
      <h1 id="lab-title">Lab</h1>
      <p class="play__status" role="status">
        {status}
      </p>

      {sans.length > 0 && (
        <ol class="move-strip num" aria-label="Moves">
          {sans.map((s, i) => (
            <li key={i}>
              <button
                type="button"
                class={`lab__ply${i + 1 === cursor ? ' is-current' : ''}`}
                aria-current={i + 1 === cursor ? 'step' : undefined}
                onClick={() => setCursor(i + 1)}
              >
                {s}
              </button>
            </li>
          ))}
        </ol>
      )}

      <Board
        fen={fen}
        orientation={orientation}
        lastMove={last}
        shapes={shapes}
        movable={
          pos.isEnd()
            ? undefined
            : { color: pos.turn, dests: chessgroundDests(pos) as unknown as Map<string, string[]> }
        }
        onMove={onBoardMove}
        label={`Lab board. ${status}`}
      />

      <div class="row lab__nav">
        <button type="button" class="button" disabled={cursor === 0} onClick={() => setCursor(0)}>
          Start
        </button>
        <button
          type="button"
          class="button"
          disabled={cursor === 0}
          onClick={() => setCursor(cursor - 1)}
        >
          Back
        </button>
        <button
          type="button"
          class="button"
          disabled={cursor >= moves.length}
          onClick={() => setCursor(cursor + 1)}
        >
          Forward
        </button>
        <button
          type="button"
          class="button"
          onClick={() => setOrientation(orientation === 'white' ? 'black' : 'white')}
        >
          Flip
        </button>
      </div>

      {shownTried && (
        <div class={`coach coach--${shownTried.tone}`} role="status" aria-live="polite">
          <span class="coach__badge" aria-hidden="true">
            {shownTried.tone === 'neutral' ? '♞' : LABEL_SYMBOL[shownTried.tone]}
          </span>
          <div class="coach__body">
            {shownTried.tone !== 'neutral' && (
              <p class="coach__label">{LABEL_NAME[shownTried.tone]}</p>
            )}
            <div class="coach__head">
              <p class="coach__title">{shownTried.title}</p>
              <SpeakButton
                text={[shownTried.title, shownTried.points[0]].filter(Boolean).join(' ')}
              />
            </div>
            {shownTried.points.length > 0 && (
              <ul class="verdict__points">
                {shownTried.points.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <TypedMove disabled={pos.isEnd()} fen={fen} onMove={(u) => void play(u)} />

      <div class="panel lab__analysis">
        <h2>Engine</h2>
        <div class="row lab__settings">
          <label>
            Depth{' '}
            <select
              value={depth}
              onChange={(e) => setDepth(Number(e.currentTarget.value) as (typeof DEPTHS)[number])}
            >
              {DEPTHS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
          <label>
            Lines{' '}
            <select
              value={multipv}
              onChange={(e) =>
                setMultipv(Number(e.currentTarget.value) as (typeof LINE_COUNTS)[number])
              }
            >
              {LINE_COUNTS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        </div>
        {pos.isEnd() ? (
          <p class="hint">The game is over in this position.</p>
        ) : !services ? (
          <p class="hint">Loading the engine…</p>
        ) : !best.length ? (
          <p class="hint" role="status">
            Thinking to depth {depth}…
          </p>
        ) : (
          <>
            <EvalBar score={whiteScore(best[0]!.score, pos.turn)} label="Evaluation" />
            <ol class="lab__lines">
              {best.map((l) => {
                const lineSans = pvToSan(fen, l.pv, 8);
                return (
                  <li key={l.multipv}>
                    <button
                      type="button"
                      class="lab__line"
                      onClick={() => void play(l.pv[0]!)}
                      aria-label={`Play ${lineSans[0]}. Line: ${lineSans.join(' ')}, ${formatScore(whiteScore(l.score, pos.turn))}`}
                    >
                      <span class="lab__score num">
                        {formatScore(whiteScore(l.score, pos.turn))}
                      </span>
                      <span class="lab__pv num">{lineSans.join(' ')}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
            <p class="hint">Depth {best[0]!.depth}. Tap a line to play its first move.</p>
          </>
        )}
        {shownThreat && (
          <p class="lab__threat">
            <strong>Threat.</strong> {shownThreat}
          </p>
        )}
      </div>

      <div class="row">
        <button type="button" class="button" onClick={() => setEditing(true)}>
          Edit position
        </button>
        <button
          type="button"
          class="button button--primary"
          disabled={pos.isEnd()}
          onClick={() => navigate('play', 'fen', fen)}
        >
          Play from here
        </button>
      </div>

      <details class="move-type">
        <summary>Paste a FEN</summary>
        <form
          class="move-input"
          onSubmit={(e) => {
            e.preventDefault();
            const r = checkFen(fenText);
            if (!r.ok) {
              setFenError(r.error);
              return;
            }
            setFenError(undefined);
            setFenText('');
            load(fenOf(r.pos));
          }}
        >
          <label for="lab-fen">FEN</label>
          <input
            id="lab-fen"
            type="text"
            autoComplete="off"
            spellcheck={false}
            value={fenText}
            placeholder={fen}
            onInput={(e) => setFenText(e.currentTarget.value)}
          />
          <button type="submit" class="button">
            Load
          </button>
        </form>
        {fenError && (
          <p class="error-text" role="alert">
            {fenError}
          </p>
        )}
        <p class="hint lab__fen num">{fen}</p>
      </details>
    </section>
  );
}

/** The threat in neutral words: the Lab has no "you" and "me". */
function labThreat(fen: string, threat: Threat): string | undefined {
  const passed = nullMoveFen(fen);
  const m = normalMove(threat.uci);
  if (!passed || !m) return undefined;
  const pos = fromFen(passed);
  const side = pos.turn === 'white' ? 'White' : 'Black';
  const san = pvToSan(passed, [threat.uci], 1)[0] ?? threat.uci;
  const lead = `If it were ${side}'s move, ${side} would play ${moveText(san)}`;
  if (threat.score.kind === 'mate' && threat.score.value > 0)
    return threat.score.value === 1 ? `${lead}, and it is mate.` : `${lead}, with mate to follow.`;
  if (isCapture(pos, m))
    return `${lead}, taking the ${pos.board.getRole(m.to) ?? 'pawn'} on ${makeSquare(m.to)}.`;
  return `${lead}.`;
}

/** Board editor: tap a piece, then squares; or type edits like Ke1. */
function Editor(props: { fen: string; onDone: (fen: string) => void; onCancel: () => void }) {
  const [board, setBoard] = useState<ChessBoard>(() => boardOf(props.fen));
  const [turn, setTurn] = useState<Color>(() => fromFen(props.fen).turn);
  const [brush, setBrush] = useState<Placement>({ color: 'white', role: 'pawn' });
  const [typed, setTyped] = useState('');
  const [error, setError] = useState<string>();
  const fen = fenFromBoard(board, turn);
  const check = checkFen(fen);

  const brushes: Placement[] = [
    ...(['white', 'black'] as const).flatMap((color) => ROLES.map((role) => ({ color, role }))),
    null,
  ];
  const same = (a: Placement, b: Placement) =>
    a === b || (!!a && !!b && a.color === b.color && a.role === b.role);

  return (
    <section class="screen screen--lab" aria-labelledby="edit-title">
      <h1 id="edit-title">Edit position</h1>
      <p class="hint">Choose a piece, then tap squares to place it. The eraser clears a square.</p>
      <div class="lab-editor__palette cg-wrap" role="radiogroup" aria-label="Piece to place">
        {brushes.map((b) => (
          <button
            key={b ? pieceLetter(b) : 'x'}
            type="button"
            role="radio"
            aria-checked={same(b, brush)}
            class={`lab-editor__brush${same(b, brush) ? ' is-active' : ''}`}
            aria-label={b ? pieceName(b) : 'Eraser'}
            onClick={() => setBrush(b)}
          >
            {b ? h('piece', { class: `${b.color} ${b.role}` }) : <span aria-hidden="true">✕</span>}
          </button>
        ))}
      </div>

      <div class="lab-editor__board cg-wrap" role="grid" aria-label="Board to edit">
        {READING_ORDER.map((sq) => {
          const p = board.get(sq);
          const dark = (Math.floor(sq / 8) + (sq % 8)) % 2 === 0;
          return (
            <button
              key={sq}
              type="button"
              role="gridcell"
              class={`lab-editor__square${dark ? ' is-dark' : ''}`}
              aria-label={`${makeSquare(sq)}, ${pieceName(p)}`}
              onClick={() => {
                setBoard(place(board, sq, same(brush, p ?? null) ? null : brush));
              }}
            >
              {p && h('piece', { class: `${p.color} ${p.role}` })}
            </button>
          );
        })}
      </div>

      <fieldset class="lab-editor__turn">
        <legend>Side to move</legend>
        {(['white', 'black'] as const).map((c) => (
          <label key={c}>
            <input type="radio" name="lab-turn" checked={turn === c} onChange={() => setTurn(c)} />{' '}
            {c === 'white' ? 'White' : 'Black'}
          </label>
        ))}
      </fieldset>

      <form
        class="move-input"
        onSubmit={(e) => {
          e.preventDefault();
          const r = applyTyped(board, typed);
          if (!r.ok) {
            setError(r.error);
            return;
          }
          setError(undefined);
          setTyped('');
          setBoard(r.board);
        }}
      >
        <label for="lab-typed">Type edits</label>
        <input
          id="lab-typed"
          type="text"
          autoComplete="off"
          spellcheck={false}
          value={typed}
          placeholder="Ke1 qd8 xd4"
          onInput={(e) => setTyped(e.currentTarget.value)}
        />
        <button type="submit" class="button">
          Apply
        </button>
      </form>
      {error && (
        <p class="error-text" role="alert">
          {error}
        </p>
      )}

      <div class="row">
        <button type="button" class="button" onClick={() => setBoard(boardOf(INITIAL_FEN))}>
          Start position
        </button>
        <button
          type="button"
          class="button"
          onClick={() => setBoard(boardOf('8/8/8/8/8/8/8/8 w - - 0 1'))}
        >
          Clear board
        </button>
      </div>
      <p class="hint lab__fen num">{fen}</p>
      {!check.ok && (
        <p class="error-text" role="status">
          {check.error}
        </p>
      )}
      <div class="row">
        <button type="button" class="button" onClick={props.onCancel}>
          Cancel
        </button>
        <button
          type="button"
          class="button button--primary"
          disabled={!check.ok}
          onClick={() => props.onDone(fen)}
        >
          Done
        </button>
      </div>
    </section>
  );
}
