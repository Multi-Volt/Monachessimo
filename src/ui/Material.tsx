import { h } from 'preact';
import type { Board as ChessBoard } from 'chessops/board';
import type { Color, Role } from 'chessops/types';

const START: Record<Exclude<Role, 'king'>, number> = {
  queen: 1,
  rook: 2,
  bishop: 2,
  knight: 2,
  pawn: 8,
};
const VALUE: Record<Exclude<Role, 'king'>, number> = {
  queen: 9,
  rook: 5,
  bishop: 3,
  knight: 3,
  pawn: 1,
};
const ROLES = ['queen', 'rook', 'bishop', 'knight', 'pawn'] as const;

export interface Captured {
  /** Pieces of the other side that `color` has taken, most valuable first. */
  pieces: Exclude<Role, 'king'>[];
  /** Material lead in pawns, 0 when not ahead. */
  lead: number;
}

/**
 * Pieces each side has taken, counted against a full starting set. A promoted
 * piece makes up for a missing one, as on Lichess.
 */
export function captured(board: ChessBoard): Record<Color, Captured> {
  const count = (color: Color, role: Exclude<Role, 'king'>) =>
    board[color].intersect(board[role]).size();
  const score = (color: Color) => ROLES.reduce((s, r) => s + count(color, r) * VALUE[r], 0);
  const takenFrom = (victim: Color) =>
    ROLES.flatMap((r) =>
      Array<Exclude<Role, 'king'>>(Math.max(0, START[r] - count(victim, r))).fill(r),
    );
  const diff = score('white') - score('black');
  return {
    white: { pieces: takenFrom('black'), lead: Math.max(0, diff) },
    black: { pieces: takenFrom('white'), lead: Math.max(0, -diff) },
  };
}

const NAMES: Record<Exclude<Role, 'king'>, [string, string]> = {
  queen: ['queen', 'queens'],
  rook: ['rook', 'rooks'],
  bishop: ['bishop', 'bishops'],
  knight: ['knight', 'knights'],
  pawn: ['pawn', 'pawns'],
};

function describe(who: string, c: Captured): string {
  if (!c.pieces.length) return `${who} have taken nothing.`;
  const groups = ROLES.map((r) => [r, c.pieces.filter((p) => p === r).length] as const)
    .filter(([, n]) => n > 0)
    .map(([r, n]) => `${n} ${NAMES[r][n === 1 ? 0 : 1]}`);
  return `${who} have taken ${groups.join(', ')}${c.lead ? `, ${c.lead} ahead in material` : ''}.`;
}

/** One row of taken pieces, drawn with the board's own piece set. */
export function MaterialRow({
  side,
  taken,
  label,
}: {
  side: Color;
  taken: Captured;
  label: string;
}) {
  const victim = side === 'white' ? 'black' : 'white';
  return (
    <div class="material">
      <span class="visually-hidden">{describe(label, taken)}</span>
      <span class="material__pieces cg-wrap" aria-hidden="true">
        {taken.pieces.map((r, i) =>
          h('piece', {
            key: i,
            class: `${r} ${victim}${taken.pieces[i + 1] !== r ? ' material__last' : ''}`,
          }),
        )}
      </span>
      {taken.lead > 0 && <span class="material__lead num">+{taken.lead}</span>}
    </div>
  );
}
