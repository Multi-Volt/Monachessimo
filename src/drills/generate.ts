import type { Role } from 'chessops/types';
import { makeSquare } from 'chessops/util';
import { CLASS_LABEL } from '../analysis/summary';
import { replay, moveLabel } from '../analysis/positions';
import type { GameAnalysis, PlyReview } from '../analysis/types';
import { pvToSan, uciToSan } from '../chess/san';
import { fromFen, normalMove } from '../detectors/board';
import { forkTargets } from '../detectors/motifs';
import type { TagName, TagRecord } from '../detectors';
import { positionKey } from '../engine/uci';
import type { Game } from '../import/types';
import { formatScore } from '../ui/format';
import { acceptable } from './answers';
import { START_RATING } from './rating';
import type { Drill, DrillType } from './types';

/** Tags that mean the player skipped a strong move, which makes a "missed chance" drill. */
export const MISSED_TAGS: TagName[] = [
  'missedCapture',
  'forkMissed',
  'pinMissed',
  'skewerMissed',
  'mateMissed',
  'quietSetupMissed',
  'sacrificeMissed',
];

const ROLE_NAME: Record<Role, string> = {
  pawn: 'pawn',
  knight: 'knight',
  bishop: 'bishop',
  rook: 'rook',
  queen: 'queen',
  king: 'king',
};

/** First hint for each tag: what to look for, never the move itself. */
const THEME_HINT: Partial<Record<TagName, string>> = {
  hangingPiece: 'Your move in the game left a piece undefended. Keep everything protected.',
  missedCapture: 'Something of your opponent is loose. Look at every capture.',
  trappedPiece: 'In the game one of your pieces ran out of squares. Keep your pieces free.',
  forkMissed: 'One move can attack two pieces at once.',
  forkAllowed: 'Your opponent has a fork in the air. Take it away first.',
  pinMissed: 'Look for a line through one piece onto a bigger one behind it.',
  pinAllowed: 'Do not line up a piece in front of a more valuable one.',
  skewerMissed: 'Attack a valuable piece with something behind it on the same line.',
  skewerAllowed: 'Keep your king and queen off open lines with a piece behind them.',
  discoveredAttack: 'Moving one piece can open a line for another.',
  backRank: 'Check the back rank.',
  mateMissed: 'There is a forced mate. Start with checks.',
  mateAllowed: 'Your opponent threatens mate. Stop it.',
  quietSetupMissed: 'The best move is quiet. It prepares a tactic for the next move.',
  sacrificeMissed: 'Giving up material works here.',
  kingSafety: 'Keep the pawns and pieces around your king in place.',
  pawnStructure: 'Avoid creating weak pawns.',
  pieceActivity: 'Keep your pieces active.',
  timeTrouble: 'You played this with little time left. Take a moment now.',
};

function goalFor(type: DrillType, tags: TagName[], playedSan: string, label: string): string {
  if (type === 'missed') {
    if (tags.includes('mateMissed')) return 'Find the forced mate.';
    if (tags.includes('sacrificeMissed')) return 'Find the sacrifice that works.';
    if (tags.includes('quietSetupMissed')) return 'Find the quiet move that sets up a tactic.';
    return 'Find the move that wins material.';
  }
  return `You played ${label} ${playedSan}. Find a better move.`;
}

/** Facts measured from the position and the engine lines. */
function explain(review: PlyReview, fen: string, tags: TagName[]): string[] {
  const best = review.lines[0]!;
  const bestSan = uciToSan(fen, best.pv[0]!);
  const playedLine = pvToSan(fen, review.playedPv, 4);
  const out = [
    `In the game you played ${review.san}${playedLine.length > 1 ? `, and the engine's answer was ${playedLine[1]}` : ''}. Your evaluation went from ${formatScore(best.score)} to ${formatScore(review.playedScore)}.`,
    `${bestSan} keeps ${formatScore(best.score)}. Engine line: ${pvToSan(fen, best.pv, 6).join(' ')}.`,
  ];
  const pos = fromFen(fen);
  const m = normalMove(best.pv[0]);
  if (m && tags.includes('forkMissed')) {
    const after = pos.clone();
    after.play(m);
    const targets = forkTargets(after, m.to).map(
      (sq) => `the ${ROLE_NAME[after.board.getRole(sq)!]} on ${makeSquare(sq)}`,
    );
    if (targets.length >= 2) out.push(`${bestSan} attacks ${targets.join(' and ')} at once.`);
  }
  if (tags.includes('mateMissed') && best.score.kind === 'mate')
    out.push(`It forces mate in ${best.score.value}.`);
  if (review.class)
    out.push(`The game move was classed as a ${CLASS_LABEL[review.class].toLowerCase()}.`);
  return out;
}

function hints(review: PlyReview, fen: string, tags: TagName[]): string[] {
  const out: string[] = [];
  const theme = tags.map((t) => THEME_HINT[t]).find(Boolean);
  out.push(theme ?? 'Before you move, check what your opponent can do next.');
  const pos = fromFen(fen);
  const m = normalMove(review.lines[0]?.pv[0]);
  if (m) {
    const role = pos.board.getRole(m.from)!;
    out.push(`Move a ${ROLE_NAME[role]}.`);
    out.push(`Move the ${ROLE_NAME[role]} on ${makeSquare(m.from)}.`);
    out.push(`The answer is ${uciToSan(fen, review.lines[0]!.pv[0]!)}.`);
  }
  return out;
}

/** Drills from one analyzed game: one per mistake or blunder the player made. */
export function drillsFromGame(
  game: Game,
  a: GameAnalysis,
  tags: TagRecord[],
  now: number,
): Drill[] {
  const fens = replay(game.uci);
  const userRating = (game.userColor === 'white' ? game.white : game.black).rating ?? START_RATING;
  const out: Drill[] = [];
  for (const r of a.reviews) {
    if (r.class !== 'mistake' && r.class !== 'blunder') continue;
    const best = r.lines[0];
    if (!best?.pv[0]) continue;
    const fen = fens[r.ply]!;
    const accepted = r.lines
      .filter((l) => l.pv[0] && l.pv[0] !== r.uci && acceptable(l.score, best.score))
      .map((l) => ({ uci: l.pv[0]!, score: l.score }));
    if (accepted.length === 0) continue;
    const plyTags = tags.filter((t) => t.gameId === game.id && t.ply === r.ply).map((t) => t.tag);
    const type: DrillType = plyTags.some((t) => MISSED_TAGS.includes(t)) ? 'missed' : 'replay';
    // Quiet moves and sacrifices are harder to see; obvious blunders are easier to fix.
    let rating = userRating;
    if (plyTags.includes('quietSetupMissed') || plyTags.includes('sacrificeMissed')) rating += 200;
    else if (type === 'missed') rating += 100;
    if (r.drop >= 0.8) rating -= 150;
    out.push({
      id: `${type}:${positionKey(fen)}`,
      type,
      fen,
      side: r.mover,
      goal: goalFor(type, plyTags, r.san, moveLabel(r.ply)),
      accepted,
      line: best.pv,
      bestScore: best.score,
      hints: hints(r, fen, plyTags),
      explanation: explain(r, fen, plyTags),
      tags: plyTags,
      rating,
      source: { gameId: game.id, ply: r.ply, played: r.uci, playedSan: r.san },
      createdAt: now,
    });
  }
  return out;
}
