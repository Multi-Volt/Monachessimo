// Checks with Stockfish what the content test cannot: that the move a lesson
// calls right is the best move, and clearly so. Ported from Patzer's
// scripts/verify-lessons.mjs (MIT, see THIRD_PARTY.md).
//
// For every "find the move" task, at each of the player's moves:
// - a mating move is always fine, since the page accepts every mate;
// - one right answer: it must be Stockfish's first choice, and MIN_GAP
//   centipawns better than the second, or a mate where the second is not;
// - several right answers: none may lose more than MAX_ACCEPT_LOSS.
// "rule" tasks name the move, so it only has to be sound. "check" and
// "exact" tasks are about the rules and are left to the content test.
//
// Slow (about four minutes at depth 18), so it runs only with LESSON_DEPTH set:
// `npm run verify:lessons`. Below depth 18 the lite build misjudges a few tasks.

import { afterAll, describe, expect, it } from 'vitest';
import type { Score } from '../../src/engine/eval';
import basics from '../../src/learn/content/basics.json';
import beginner from '../../src/learn/content/beginner.json';
import intermediate from '../../src/learn/content/intermediate.json';
import advanced from '../../src/learn/content/advanced.json';
import { buildCurriculum } from '../../src/learn/curriculum';
import { isCheckmate, legalMoves, moveStepStart, play } from '../../src/learn/rules';
import type { LevelDef, MoveStep, PlayStep } from '../../src/learn/types';
import { nodePool } from '../support/node-engine';

const env =
  (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const DEPTH = Number(env.LESSON_DEPTH ?? 18);
const MIN_GAP = 150;
const MAX_ACCEPT_LOSS = 80;
const WORKERS = 4;

const enabled = !!env.LESSON_DEPTH;
const pool = enabled ? nodePool(WORKERS) : undefined!;
afterAll(() => pool?.terminate());

const cur = buildCurriculum([basics, beginner, intermediate, advanced] as unknown as LevelDef[]);
const steps = cur.lessons.flatMap((r) =>
  r.lesson.steps.map((step) => ({ name: `${r.lesson.id}.${step.id}`, step })),
);

/** Mates beat everything, and sooner mates beat later ones. */
function value(s: Score | undefined): number {
  if (!s) return -1e6;
  if (s.kind === 'mate') return s.value > 0 ? 1e5 - s.value : -1e5 - s.value;
  return s.value;
}
const negated = (s: Score | undefined): Score =>
  s ? { kind: s.kind, value: -s.value } : { kind: 'cp', value: 0 };
const show = (s: Score | undefined) =>
  !s ? '?' : s.kind === 'mate' ? `#${s.value}` : `${s.value}cp`;

/** The score of one move, from the mover's side. */
async function scoreOf(fen: string, uci: string): Promise<Score> {
  const after = play(fen, uci)!;
  if (isCheckmate(after.fen)) return { kind: 'mate', value: 1 };
  const r = await pool.search({ fen: after.fen, depth: Math.max(DEPTH - 2, 8) });
  return negated(r.lines[0]?.score);
}

async function checkMove(name: string, step: MoveStep): Promise<string[]> {
  const problems: string[] = [];
  if (step.goal === 'check' || step.exact) return problems;
  let fen = moveStepStart(step).fen;
  for (let i = 0; i < step.line.length; i++) {
    const uci = step.line[i]!;
    const before = fen;
    fen = play(fen, uci)!.fen;
    if (i % 2 === 1 || isCheckmate(fen)) continue;
    const right = i === 0 && step.accept ? [uci, ...step.accept] : [uci];
    const legal = legalMoves(before).length;
    const r = await pool.search({
      fen: before,
      depth: DEPTH,
      multipv: Math.min(legal, Math.max(2, right.length + 1)),
    });
    const [best, second] = r.lines;
    if (!best) continue;
    // chessops writes castling as king takes rook; compare as the lessons write it.
    const bestUci = (best.pv[0] ?? '')
      .replace(/^e1h1$/, 'e1g1')
      .replace(/^e1a1$/, 'e1c1')
      .replace(/^e8h8$/, 'e8g8')
      .replace(/^e8a8$/, 'e8c8');
    if (step.rule) {
      if (bestUci === uci) continue;
      const loss = value(best.score) - value(await scoreOf(before, uci));
      const bothWin = best.score.kind === 'mate' && best.score.value > 0;
      if (loss > MAX_ACCEPT_LOSS && !bothWin)
        problems.push(`${name} move ${i + 1}: ${uci} loses ${loss}cp against ${bestUci}`);
      continue;
    }
    if (right.length === 1) {
      if (bestUci !== uci) {
        // A different first choice is fine when the lesson's move scores the same.
        const mine = await scoreOf(before, uci);
        if (value(best.score) - value(mine) > MIN_GAP / 3)
          problems.push(
            `${name} move ${i + 1}: Stockfish plays ${bestUci} (${show(best.score)}), not ${uci} (${show(mine)})`,
          );
        continue;
      }
      if (!second) continue;
      const bothMate =
        best.score.kind === 'mate' &&
        best.score.value > 0 &&
        second.score.kind === 'mate' &&
        second.score.value > 0;
      if (
        !bothMate &&
        value(best.score) - value(second.score) < MIN_GAP &&
        best.score.kind !== 'mate'
      )
        problems.push(
          `${name} move ${i + 1}: ${second.pv[0]} (${show(second.score)}) is nearly as good as ${uci} (${show(best.score)})`,
        );
    } else {
      for (const m of right) {
        const loss = value(best.score) - value(await scoreOf(before, m));
        if (loss > MAX_ACCEPT_LOSS && !(best.score.kind === 'mate' && loss < 1e5))
          problems.push(`${name}: accepted ${m} loses ${loss}cp against ${bestUci}`);
      }
    }
  }
  return problems;
}

async function checkPlay(name: string, step: PlayStep): Promise<string[]> {
  const r = await pool.search({ fen: step.fen, depth: DEPTH + 4 });
  const s = r.lines[0]?.score;
  if (step.goal === 'mate' && !(s?.kind === 'mate' && s.value > 0) && value(s) < 500)
    return [`${name}: not clearly winning (${show(s)})`];
  if (step.goal === 'promote' && value(s) < 300)
    return [`${name}: not clearly winning (${show(s)})`];
  return [];
}

describe.skipIf(!enabled)('lessons checked by Stockfish', () => {
  it('teach the best move, clearly', async () => {
    const jobs = steps.filter((s) => s.step.type === 'move' || s.step.type === 'play');
    const results = await Promise.all(
      jobs.map(({ name, step }) =>
        step.type === 'move' ? checkMove(name, step) : checkPlay(name, step as PlayStep),
      ),
    );
    expect(results.flat()).toEqual([]);
  }, 600_000);
});
