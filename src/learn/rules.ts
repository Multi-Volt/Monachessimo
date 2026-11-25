// The rules of the lesson tasks, kept free of the UI so the content test runs
// every lesson through the same code the page uses. Ported from Patzer's
// `learn/engine.ts` (MIT, see THIRD_PARTY.md), from chess.js to chessops.

import { Chess } from 'chessops/chess';
import { makeFen, parseFen } from 'chessops/fen';
import { makeSan } from 'chessops/san';
import type { NormalMove, Square } from 'chessops/types';
import { makeSquare, parseSquare, parseUci, roleToChar } from 'chessops/util';
import type { MoveStep, PlayStep, Side, Sq, StarsStep, StepDef } from './types';

// ---- Positions ---------------------------------------------------------------

/**
 * A position from a lesson FEN. The first lessons use boards without kings,
 * "a rook on an empty board", which chessops' validation refuses; its move
 * generator copes, since with no king nothing can be in check.
 */
export function board(fen: string): Chess {
  const setup = parseFen(fen);
  if (setup.isErr) throw new Error(`Bad FEN: ${fen}`);
  const checked = Chess.fromSetup(setup.value);
  if (checked.isOk) return checked.value;
  const pos = Chess.default();
  (pos as unknown as { setupUnchecked(s: unknown): void }).setupUnchecked(setup.value);
  return pos;
}

export const fenOf = (pos: Chess): string => makeFen(pos.toSetup());

export function sideToMove(fen: string): Side {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

/** The same position with `side` to move, without an en passant square. */
export function withTurn(fen: string, side: Side): string {
  const parts = fen.split(' ');
  parts[1] = side === 'white' ? 'w' : 'b';
  parts[3] = '-';
  return parts.join(' ');
}

export interface Played {
  fen: string;
  from: Sq;
  to: Sq;
  san: string;
  captured: boolean;
  promotion: boolean;
}

/** Plays a UCI move; undefined when it is illegal. Castling is given as the king's move. */
export function play(fen: string, uci: string): Played | undefined {
  const pos = board(fen);
  const m = parseUci(uci) as NormalMove | undefined;
  if (!m || !('from' in m)) return undefined;
  const move = castleMove(pos, m);
  if (!pos.isLegal(move)) return undefined;
  const san = makeSan(pos, move);
  const captured =
    pos.board.has(m.to) || (pos.board.getRole(m.from) === 'pawn' && m.to === pos.epSquare);
  pos.play(move);
  return {
    fen: fenOf(pos),
    from: makeSquare(m.from),
    to: makeSquare(m.to),
    san,
    captured,
    promotion: !!m.promotion,
  };
}

/** chessops castles by king onto rook; lessons write e1g1. Translate. */
function castleMove(pos: Chess, m: NormalMove): NormalMove {
  if (pos.board.getRole(m.from) !== 'king' || Math.abs(m.from - m.to) !== 2) return m;
  const rook = m.to > m.from ? m.from + 3 : m.from - 4;
  return pos.board.getRole(rook) === 'rook' && pos.board.getColor(rook) === pos.turn
    ? { from: m.from, to: rook }
    : m;
}

/** The UCI of a chessops move in lesson form: castling as the king's two-square move. */
export function lessonUci(pos: Chess, m: NormalMove): string {
  let to = m.to;
  if (pos.board.getRole(m.from) === 'king' && pos.board.getColor(m.to) === pos.turn)
    to = m.to > m.from ? m.from + 2 : m.from - 2;
  return makeSquare(m.from) + makeSquare(to) + (m.promotion ? roleToChar(m.promotion) : '');
}

/**
 * One move of an explanation's demo. A demo may move the same side twice, so
 * whoever owns the piece moves it.
 */
export function demoMove(fen: string, uci: string): Played | undefined {
  const owner = board(fen).board.get(parseSquare(uci.slice(0, 2))!);
  if (!owner) return undefined;
  return play(sideToMove(fen) === owner.color ? fen : withTurn(fen, owner.color), uci);
}

/** Every legal move, in lesson UCI. */
export function legalMoves(fen: string): string[] {
  const pos = board(fen);
  const out: string[] = [];
  for (const [from, dests] of pos.allDests()) {
    for (const to of dests) {
      const m = { from, to };
      const last = Math.floor(to / 8) === (pos.turn === 'white' ? 7 : 0);
      if (pos.board.getRole(from) === 'pawn' && last)
        for (const p of ['queen', 'rook', 'bishop', 'knight'] as const)
          out.push(lessonUci(pos, { ...m, promotion: p }));
      else out.push(lessonUci(pos, m));
    }
  }
  return [...new Set(out)];
}

/** Legal destinations of one piece, as square names. */
export function destsOf(fen: string, sq: Sq): Sq[] {
  return [
    ...new Set(
      legalMoves(fen)
        .filter((u) => u.startsWith(sq))
        .map((u) => u.slice(2, 4)),
    ),
  ];
}

export const isCheckmate = (fen: string): boolean => board(fen).isCheckmate();
export const isStalemate = (fen: string): boolean => board(fen).isStalemate();
export const inCheck = (fen: string): boolean => board(fen).isCheck();

/** The pieces of one side, square name to piece letter. */
export function piecesOf(fen: string, side: Side): Map<Sq, string> {
  const pos = board(fen);
  const out = new Map<Sq, string>();
  for (const sq of pos.board[side]) {
    const role = pos.board.getRole(sq)!;
    out.set(makeSquare(sq), role === 'knight' ? 'n' : role[0]!);
  }
  return out;
}

// ---- Stars -------------------------------------------------------------------
//
// One piece walks the board collecting stars; the other side never moves.
// The mover keeps the turn, and captures are only allowed onto a star.

export interface StarsState {
  fen: string;
  /** Where the moving piece stands now. */
  at: Sq;
  left: Sq[];
  moves: number;
}

export function starsStart(step: StarsStep): StarsState {
  const at = step.piece ?? [...piecesOf(step.fen, sideToMove(step.fen)).keys()][0]!;
  return { fen: step.fen, at, left: [...step.stars], moves: 0 };
}

/** Squares the walking piece may go to. */
export function starsDests(state: StarsState): Sq[] {
  const pos = board(state.fen);
  const from = parseSquare(state.at)!;
  const last = pos.turn === 'white' ? 7 : 0;
  const isPawn = pos.board.getRole(from) === 'pawn';
  return [...pos.dests(from)]
    .filter((to: Square) => !(isPawn && Math.floor(to / 8) === last))
    .filter((to) => !pos.board.has(to) || state.left.includes(makeSquare(to)))
    .filter((to) => pos.board.getColor(to) !== pos.turn)
    .map(makeSquare);
}

export function starsMove(state: StarsState, to: Sq): StarsState | undefined {
  if (!starsDests(state).includes(to)) return undefined;
  const r = play(state.fen, state.at + to);
  if (!r) return undefined;
  return {
    fen: withTurn(r.fen, sideToMove(state.fen)),
    at: to,
    left: state.left.filter((s) => s !== to),
    moves: state.moves + 1,
  };
}

/**
 * Breadth-first search for the fewest moves that collect every star left,
 * and the first move of such a path, for the hint. Undefined when impossible.
 */
export function shortestStars(
  state: StarsState,
): { moves: number; first: Sq | undefined } | undefined {
  if (!state.left.length) return { moves: 0, first: undefined };
  const key = (s: StarsState) => `${s.at}|${[...s.left].sort().join(',')}`;
  const seen = new Set([key(state)]);
  let frontier: { s: StarsState; first: Sq }[] = [{ s: state, first: '' }];
  for (let depth = 1; frontier.length && depth <= 40; depth++) {
    const next: typeof frontier = [];
    for (const { s, first } of frontier) {
      for (const to of starsDests(s)) {
        const n = starsMove(s, to)!;
        const f = depth === 1 ? to : first;
        if (!n.left.length) return { moves: depth, first: f };
        const k = key(n);
        if (!seen.has(k)) {
          seen.add(k);
          next.push({ s: n, first: f });
        }
      }
    }
    frontier = next;
  }
  return undefined;
}

export function solveStars(step: StarsStep): number | undefined {
  return shortestStars(starsStart(step))?.moves;
}

// ---- Find the move -----------------------------------------------------------

/** The position the player sees first: after the opponent's `pre` move. */
export function moveStepStart(step: MoveStep): { fen: string; lastMove?: [Sq, Sq] } {
  if (!step.pre) return { fen: step.fen };
  const r = play(step.fen, step.pre)!;
  return { fen: r.fen, lastMove: [r.from, r.to] };
}

/**
 * The side the player moves in a step: in a puzzle step, the side after the
 * opponent's `pre` move, not the side to move in the stored position.
 */
export function playerSide(step: StepDef): Side | undefined {
  if (step.type === 'move') return sideToMove(moveStepStart(step).fen);
  return 'fen' in step && step.fen ? sideToMove(step.fen) : undefined;
}

/** Is `uci`, played in `fen` at line index `index`, a right answer? */
export function isRightMove(step: MoveStep, index: number, fen: string, uci: string): boolean {
  const r = play(fen, uci);
  if (!r) return false;
  const goal = step.goal ?? 'line';
  if (goal === 'check') return inCheck(r.fen);
  if (goal === 'mate' && isCheckmate(r.fen)) return true;
  if (uci === step.line[index]) return true;
  return index === 0 && !!step.accept?.includes(uci);
}

/** After a right move: is the task solved? A mate always ends it, as on Lichess. */
export function moveStepDone(step: MoveStep, index: number, fenAfter: string): boolean {
  if ((step.goal ?? 'line') === 'check') return true;
  if (isCheckmate(fenAfter)) return true;
  return index + 1 >= step.line.length;
}

/** Why a legal but wrong move is wrong, when the position can tell. */
export function wrongReason(
  step: MoveStep,
  fen: string,
  uci: string,
): 'stalemate' | 'onlyCheck' | 'noCheck' | undefined {
  const r = play(fen, uci);
  if (!r) return undefined;
  if (isStalemate(r.fen)) return 'stalemate';
  const goal = step.goal ?? 'line';
  if (goal === 'mate' && inCheck(r.fen)) return 'onlyCheck';
  if (goal === 'check' && !inCheck(r.fen)) return 'noCheck';
  return undefined;
}

// ---- Play it out -------------------------------------------------------------

export type PlayResult = 'won' | 'stalemate' | 'draw' | 'lost' | 'limit';

/** The position after the player's move. Undefined means play on. */
export function judgeOwnMove(
  step: PlayStep,
  after: Played,
  ownMoves: number,
): PlayResult | undefined {
  const pos = board(after.fen);
  if (pos.isCheckmate()) return 'won';
  if (pos.isStalemate()) return 'stalemate';
  if (pos.isInsufficientMaterial()) return 'draw';
  if (step.goal === 'promote' && after.promotion) {
    // A new queen that is taken at once was never really won.
    const taken = legalMoves(after.fen).some((u) => u.slice(2, 4) === after.to);
    if (!taken) return 'won';
  }
  if (ownMoves >= step.limit) return 'limit';
  return undefined;
}

/** The position after the engine's reply: a piece lost for nothing ends the try. */
export function judgeReply(reply: Played): PlayResult | undefined {
  if (reply.captured && !legalMoves(reply.fen).some((u) => u.slice(2, 4) === reply.to))
    return 'lost';
  const pos = board(reply.fen);
  if (pos.isStalemate() || pos.isInsufficientMaterial()) return 'draw';
  return undefined;
}

// ---- Rewards -----------------------------------------------------------------

/** 3 stars without a slip (a mistake, a hint or the solution), 2 with a few, 1 for finishing. */
export function lessonStars(tasks: number, flawed: number): 1 | 2 | 3 {
  if (flawed <= 0) return 3;
  if (flawed <= Math.max(1, Math.floor(tasks / 3))) return 2;
  return 1;
}
