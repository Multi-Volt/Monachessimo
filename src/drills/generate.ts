import { moveHints } from '../chess/hints';
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
import type { Drill, DrillType, PlanChoice } from './types';
import { balance, isQuiet, playLine } from '../detectors/board';
import { setupPayoff, type Payoff } from '../detectors/setup';
import { describeChanges } from '../strategy/explain';
import { features } from '../strategy/features';
import { moverOf } from '../analysis/positions';
import { winningChances } from '../engine/eval';
import { WINNING } from '../detectors';

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

function goalFor(
  type: DrillType,
  tags: TagName[],
  playedSan: string,
  label: string,
  clockLeft?: string,
): string {
  if (type === 'time')
    return `With ${clockLeft} left you played ${label} ${playedSan}. Find a safer move.`;
  if (type === 'setup') return 'Find the quiet move that sets up a tactic.';
  if (type === 'sacrifice') return 'Find the sacrifice that works.';
  if (type === 'missed') {
    if (tags.includes('mateMissed')) return 'Find the forced mate.';
    if (tags.includes('sacrificeMissed')) return 'Find the sacrifice that works.';
    if (tags.includes('quietSetupMissed')) return 'Find the quiet move that sets up a tactic.';
    return 'Find the move that wins material.';
  }
  return `You played ${label} ${playedSan}. Find a better move.`;
}

const STRATEGY_TAGS: TagName[] = ['kingSafety', 'pawnStructure', 'pieceActivity'];

/** Clock as m:ss from centiseconds. */
export function formatClock(cs: number): string {
  const s = Math.max(0, Math.round(cs / 100));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** Seconds the player spent on each of their moves, from the clock record. */
export function secondsPerMove(game: Game): (number | undefined)[] {
  const inc = game.timeControl?.increment ?? 0;
  const init = (game.timeControl?.initial ?? 0) * 100;
  return game.uci.map((_, ply) => {
    const after = game.clocks?.[ply];
    const before = ply >= 2 ? game.clocks?.[ply - 2] : init || undefined;
    if (after === undefined || before === undefined) return undefined;
    return Math.max(0, (before - after) / 100 + inc);
  });
}

function payoffText(kind: Payoff, san: string): string {
  switch (kind) {
    case 'mate':
      return `${san} is mate.`;
    case 'fork':
      return `${san} is a fork.`;
    case 'pin':
      return `${san} pins a piece.`;
    case 'skewer':
      return `${san} is a skewer.`;
    case 'material':
      return `${san} wins material.`;
  }
}

/** Facts measured from the position and the engine lines. */
function explain(
  review: PlyReview,
  fen: string,
  tags: TagName[],
  type: DrillType,
  game: Game,
): string[] {
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
  if (type === 'setup') {
    const p = setupPayoff(pos, best.pv);
    const line = pvToSan(fen, best.pv, 3);
    if (p && line.length === 3)
      out.push(`${line[0]} is quiet. After ${line[1]}, ${payoffText(p.kind, line[2]!)}`);
  }
  if (type === 'sacrifice') {
    const positions = playLine(pos, best.pv, 4);
    const me = pos.turn;
    const start = balance(pos, me);
    const down = Math.max(...positions.slice(1).map((p) => start - balance(p, me)));
    if (down > 0)
      out.push(
        `In that line you are up to ${down} ${down === 1 ? 'pawn' : 'pawns'} of material down, and the engine still rates the position ${formatScore(best.score)} for you.`,
      );
  }
  if (tags.some((t) => STRATEGY_TAGS.includes(t))) {
    const after = playLine(pos, review.playedPv, 2).at(-1)!;
    const changes = describeChanges(features(pos, pos.turn), features(after, pos.turn));
    if (changes.length)
      out.push(
        `After ${review.san}${playedLine[1] ? ` and ${playedLine[1]}` : ''}: ${changes.join(' ')}`,
      );
  }
  if (type === 'time') {
    const spent = secondsPerMove(game);
    const mine = spent.filter(
      (x, ply) => x !== undefined && moverOf(ply) === game.userColor,
    ) as number[];
    const avg = mine.length ? mine.reduce((a, b) => a + b, 0) / mine.length : undefined;
    const here = spent[review.ply];
    if (here !== undefined && avg !== undefined)
      out.push(
        `You spent ${Math.round(here)} seconds on this move. Your average in this game was ${Math.round(avg)} seconds.`,
      );
  }
  if (review.class)
    out.push(`The game move was classed as a ${CLASS_LABEL[review.class].toLowerCase()}.`);
  return out;
}

function hints(review: PlyReview, fen: string, tags: TagName[]): string[] {
  const out: string[] = [];
  const theme = tags.map((t) => THEME_HINT[t]).find(Boolean);
  out.push(theme ?? 'Before you move, check what your opponent can do next.');
  const best = review.lines[0]?.pv[0];
  if (best) return moveHints(fen, best, { first: out[0]! });
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
    const type: DrillType = plyTags.includes('timeTrouble')
      ? 'time'
      : plyTags.includes('sacrificeMissed')
        ? 'sacrifice'
        : plyTags.includes('quietSetupMissed')
          ? 'setup'
          : plyTags.some((t) => MISSED_TAGS.includes(t))
            ? 'missed'
            : 'replay';
    const clockBefore = r.ply >= 2 ? game.clocks?.[r.ply - 2] : undefined;
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
      goal: goalFor(
        type,
        plyTags,
        r.san,
        moveLabel(r.ply),
        clockBefore === undefined ? undefined : formatClock(clockBefore),
      ),
      accepted,
      line: best.pv,
      bestScore: best.score,
      hints: hints(r, fen, plyTags),
      explanation: explain(r, fen, plyTags, type, game),
      tags: plyTags,
      rating,
      source: { gameId: game.id, ply: r.ply, played: r.uci, playedSan: r.san },
      createdAt: now,
    });
  }
  return out;
}

/** Candidate moves for a plan drill, at least three. */
export function planChoices(review: PlyReview, fen: string): PlanChoice[] {
  const pos = fromFen(fen);
  const me = pos.turn;
  const base = features(pos, me);
  const choices: PlanChoice[] = review.lines
    .filter((l) => l.pv[0])
    .map((l) => {
      const after = playLine(pos, l.pv, 2).at(-1)!;
      const san = pvToSan(fen, l.pv, 2);
      return {
        uci: l.pv[0]!,
        san: san[0]!,
        score: l.score,
        changes: describeChanges(base, features(after, me)),
        ...(san[1] ? { reply: san[1] } : {}),
        ...(l.pv[0] === review.uci ? { played: true } : {}),
      };
    });
  if (!choices.some((c) => c.uci === review.uci)) {
    const after = playLine(pos, review.playedPv, 2).at(-1)!;
    const san = pvToSan(fen, review.playedPv, 2);
    choices.push({
      uci: review.uci,
      san: review.san,
      score: review.playedScore,
      changes: describeChanges(base, features(after, me)),
      ...(san[1] ? { reply: san[1] } : {}),
      played: true,
    });
  }
  return choices;
}

/**
 * Plan drills: the player's mistakes where the engine's top lines are not
 * captures or checks, so the choice is about the position, not a tactic.
 */
export function planDrillsFromGame(
  game: Game,
  a: GameAnalysis,
  tags: TagRecord[],
  now: number,
): Drill[] {
  const fens = replay(game.uci);
  const out: Drill[] = [];
  for (const r of a.reviews) {
    if (!r.class || r.lines.length < 3) continue;
    const fen = fens[r.ply]!;
    const pos = fromFen(fen);
    const quiet = r.lines.every((l) => {
      const m = normalMove(l.pv[0]);
      return m && pos.isLegal(m) && isQuiet(pos, m);
    });
    if (!quiet) continue;
    const choices = planChoices(r, fen);
    if (choices.length < 3) continue;
    // Shuffle by a fixed rule so the best move is not always first.
    const order = [...choices].sort((x, y) => (x.uci < y.uci ? -1 : 1));
    const best = r.lines[0]!;
    out.push({
      id: `plan:${positionKey(fen)}`,
      type: 'plan',
      fen,
      side: r.mover,
      goal: 'Pick the best plan.',
      accepted: choices
        .filter((c) => acceptable(c.score, best.score))
        .map((c) => ({ uci: c.uci, score: c.score })),
      line: best.pv,
      bestScore: best.score,
      choices: order,
      hints: [],
      explanation: [`In the game you played ${moveLabel(r.ply)} ${r.san}.`],
      tags: tags.filter((t) => t.gameId === game.id && t.ply === r.ply).map((t) => t.tag),
      rating: (game.userColor === 'white' ? game.white : game.black).rating ?? START_RATING,
      source: { gameId: game.id, ply: r.ply, played: r.uci, playedSan: r.san },
      createdAt: now,
    });
  }
  return out;
}

/** Material lead, in pawns, a conversion position needs. */
export const MATERIAL_LEAD = 2;

/** Stockfish Skill Level for a conversion opponent: weaker for lower ratings. */
export function conversionSkill(rating: number): number {
  return Math.max(1, Math.min(10, Math.round((rating - 900) / 150)));
}

/**
 * Conversion drill: the first position in a game where the player, to move,
 * is clearly winning in two positions in a row and already at least two
 * pawns of material up.
 */
export function conversionDrillFromGame(
  game: Game,
  a: GameAnalysis,
  tags: TagRecord[],
  now: number,
): Drill | undefined {
  const fens = replay(game.uci);
  const failed = tags.some((t) => t.gameId === game.id && t.tag === 'conversionFailure');
  for (let ply = 0; ply + 2 < a.evals.length; ply++) {
    if (moverOf(ply) !== game.userColor) continue;
    const now0 = a.evals[ply];
    const next = a.evals[ply + 2];
    if (!now0 || !next) continue;
    if (winningChances(now0) < WINNING || winningChances(next) < WINNING) continue;
    if (now0.kind === 'mate') continue;
    const fen = fens[ply]!;
    // The win must already be on the board, not a capture still to make.
    if (balance(fromFen(fen), game.userColor) < MATERIAL_LEAD) continue;
    const rating = (game.userColor === 'white' ? game.white : game.black).rating ?? START_RATING;
    return {
      id: `conversion:${positionKey(fen)}`,
      type: 'conversion',
      fen,
      side: game.userColor,
      goal: 'You are winning. Win it against the engine.',
      accepted: [],
      line: a.best[ply] ? [a.best[ply]!] : [],
      bestScore: now0,
      hints: [],
      explanation: [
        `This position comes from your game, where the engine rated it ${formatScore(now0)} for you${failed ? ' and the game was not won' : ''}.`,
      ],
      tags: failed ? ['conversionFailure'] : [],
      rating,
      opponentSkill: conversionSkill(rating),
      source: { gameId: game.id, ply, played: game.uci[ply]!, playedSan: game.san[ply]! },
      createdAt: now,
    };
  }
  return undefined;
}
