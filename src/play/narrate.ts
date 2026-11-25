import type { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import type { Role, Square } from 'chessops/types';
import { makeSquare, opposite } from 'chessops/util';
import { pvToSan } from '../chess/san';
import { attacksFrom, balance, isCapture, normalMove, playLine, see } from '../detectors/board';
import type { SearchRequest, SearchResult } from '../engine/engine';
import { toCp } from '../engine/eval';
import { findThreat, nullMoveFen } from '../engine/threat';
import { features } from '../strategy/features';

export type StepKind = 'mate' | 'capture' | 'recapture' | 'check' | 'threat' | 'forced' | 'quiet';

export interface LineStep {
  /** The move in UCI and SAN, and who played it. */
  uci: string;
  san: string;
  byPlayer: boolean;
  kind: StepKind;
  /** One sentence, in the coach's voice: "my" is the opponent, "your" the player. */
  text: string;
}

/** Centipawns between the best and second-best reply for a move to count as forced. */
export const FORCED_CP = 150;

function listRoles(pos: Chess, squares: Square[], owner: 'your' | 'my'): string {
  const names = squares.map((sq) => `${owner} ${pos.board.getRole(sq)} on ${makeSquare(sq)}`);
  return names.length <= 1
    ? (names[0] ?? '')
    : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

/** The material balance after a trade, from the player's side. */
function materialNote(pos: Chess, me: Chess['turn']): string {
  const d = balance(pos, me);
  if (d === 0) return 'material is even';
  return d > 0 ? `you are ${d} up` : `you are ${-d} down`;
}

/**
 * One sentence per move of a line, read from the board: captures,
 * recaptures, checks and new attacks. Forced replies and the aim of quiet
 * moves need the engine; `enrichLine` adds them.
 */
export function narrateLine(start: Chess, line: readonly string[], me: Chess['turn']): LineStep[] {
  const positions = playLine(start, line);
  const sans = pvToSan(makeFen(start.toSetup()), line, line.length);
  const out: LineStep[] = [];
  for (let i = 0; i + 1 < positions.length; i++) {
    const before = positions[i]!;
    const after = positions[i + 1]!;
    const uci = line[i]!;
    const m = normalMove(uci)!;
    const san = sans[i] ?? uci;
    const byPlayer = before.turn === me;
    const mover = after.board.getRole(m.to) as Role;
    const piece = byPlayer ? `your ${mover}` : `my ${mover}`;
    const Piece = byPlayer ? `Your ${mover}` : `My ${mover}`;
    const step = (kind: StepKind, text: string) => out.push({ uci, san, byPlayer, kind, text });

    if (after.isCheckmate()) {
      step('mate', byPlayer ? `${san}, and you give checkmate.` : `${san}. Checkmate.`);
      continue;
    }
    if (isCapture(before, m)) {
      const victim = before.board.getRole(m.to) ?? 'pawn';
      const prev = i > 0 ? normalMove(line[i - 1]) : undefined;
      const check = after.isCheck() ? ', with check' : '';
      // A recapture answers a capture on the same square.
      if (prev && prev.to === m.to && isCapture(positions[i - 1]!, prev)) {
        const note = materialNote(after, me);
        step(
          'recapture',
          byPlayer
            ? `You take back on ${makeSquare(m.to)}${check}, and ${note}.`
            : `I take back on ${makeSquare(m.to)}${check}, and ${note}.`,
        );
      } else {
        step(
          'capture',
          byPlayer
            ? `${Piece} takes my ${victim} on ${makeSquare(m.to)}${check}.`
            : `${Piece} takes your ${victim} on ${makeSquare(m.to)}${check}.`,
        );
      }
      continue;
    }
    if (after.isCheck()) {
      step(
        'check',
        byPlayer
          ? `${Piece} gives check from ${makeSquare(m.to)}.`
          : `Check from ${piece} on ${makeSquare(m.to)}, so you have no time for anything else.`,
      );
      continue;
    }
    // Pieces the moved piece now attacks that would be lost.
    const victimSide = byPlayer ? opposite(me) : me;
    const targets = [...attacksFrom(after, m.to).intersect(after.board[victimSide])].filter(
      (sq) => after.board.getRole(sq) !== 'king' && see(after, sq, before.turn) > 0,
    );
    if (targets.length) {
      step(
        'threat',
        byPlayer
          ? `${Piece} now attacks ${listRoles(after, targets, 'my')}.`
          : `Now ${piece} attacks ${listRoles(after, targets, 'your')}.`,
      );
      continue;
    }
    // A rook that reaches an open file, or a plain move.
    const f0 = features(before, before.turn);
    const f1 = features(after, before.turn);
    const file = 'abcdefgh'[m.to % 8];
    if (mover === 'rook' && f1.rooksOnOpenFiles > f0.rooksOnOpenFiles)
      step('quiet', `${Piece} moves to the open ${file}-file.`);
    else step('quiet', byPlayer ? `You play ${san}.` : `I play ${san}.`);
  }
  return out;
}

type Search = (req: SearchRequest) => Promise<SearchResult>;

/**
 * Adds what the engine knows: a player move that is the only one that does
 * not lose (MultiPV 2), and what a quiet opponent move threatens (null-move
 * search). Short searches, cached per position by the caller's search.
 */
export async function enrichLine(
  start: Chess,
  line: readonly string[],
  steps: LineStep[],
  search: Search,
  movetime = 300,
): Promise<LineStep[]> {
  const positions = playLine(start, line);
  const out = [...steps];
  for (let i = 0; i < out.length; i++) {
    const s = out[i]!;
    const before = positions[i]!;
    const after = positions[i + 1]!;
    if (s.byPlayer && s.kind !== 'mate' && s.kind !== 'capture' && s.kind !== 'recapture') {
      const r = await search({ fen: makeFen(before.toSetup()), movetime, multipv: 2 });
      const [a, b] = r.lines;
      if (a && b && a.pv[0] === s.uci && toCp(a.score) - toCp(b.score) >= FORCED_CP) {
        const what = s.text.replace(/\.$/, '');
        out[i] = {
          ...s,
          kind: 'forced',
          text: `${what}. You have to: anything else loses about ${((toCp(a.score) - toCp(b.score)) / 100).toFixed(1)} pawns.`,
        };
      }
    } else if (!s.byPlayer && s.kind === 'quiet' && !after.isEnd()) {
      const now = await search({ fen: makeFen(after.toSetup()), movetime });
      const current = now.lines[0]?.score;
      if (!current) continue;
      const t = await findThreat(search, makeFen(after.toSetup()), current, { movetime });
      if (!t) continue;
      const passed = nullMoveFen(makeFen(after.toSetup()));
      const tSan = passed ? pvToSan(passed, [t.uci], 1)[0] : undefined;
      if (tSan)
        out[i] = {
          ...s,
          kind: 'threat',
          text: `${s.text.replace(/\.$/, '')}, threatening ${tSan}.`,
        };
    }
  }
  return out;
}
