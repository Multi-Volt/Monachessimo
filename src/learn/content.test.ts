// Every lesson, checked move by move: each position is loaded, each move is
// played, each "checkmate" is verified, and each star task is solved again.
// Ported from Patzer's content test (MIT, see THIRD_PARTY.md). Whether a
// lesson's move is the best one is checked with Stockfish in
// tests/unit/lessons.node.test.ts.

import { parseSquare } from 'chessops/util';
import { describe, expect, it } from 'vitest';
import { fromFen } from '../detectors/board';
import { lineTactics } from '../detectors/lineTactics';
import { checkFen } from '../lab/position';
import basics from './content/basics.json';
import beginner from './content/beginner.json';
import intermediate from './content/intermediate.json';
import advanced from './content/advanced.json';
import en from './text/en.json';
import { buildCurriculum, LEVEL_IDS } from './curriculum';
import {
  board,
  demoMove,
  destsOf,
  inCheck,
  isCheckmate,
  isRightMove,
  isStalemate,
  legalMoves,
  moveStepDone,
  moveStepStart,
  piecesOf,
  playerSide,
  play,
  sideToMove,
  solveStars,
  starsStart,
  withTurn,
} from './rules';
import type { LevelDef, MoveStep, StepDef } from './types';

const levels = [basics, beginner, intermediate, advanced] as unknown as LevelDef[];
const cur = buildCurriculum(levels);
const texts = en as unknown as Record<string, Record<string, unknown>>;

const SQUARE = /^[a-h][1-8]$/;
const BRUSHES = new Set([
  'green',
  'red',
  'blue',
  'yellow',
  'paleBlue',
  'paleGreen',
  'paleRed',
  'paleGrey',
]);

const text = (lesson: string, key: string): unknown => texts[lesson]?.[key];
const allSteps = cur.lessons.flatMap((r) =>
  r.lesson.steps.map((step) => ({ lesson: r.lesson.id, step })),
);
const ofType = <T extends StepDef['type']>(type: T) =>
  allSteps.filter((s) => s.step.type === type) as {
    lesson: string;
    step: Extract<StepDef, { type: T }>;
  }[];
const label = (s: { lesson: string; step: StepDef }) => `${s.lesson}.${s.step.id}`;

function strictFen(fen: string, name: string) {
  const r = checkFen(fen);
  expect(r.ok ? '' : r.error, `${name}: ${fen}`).toBe('');
}

describe('curriculum', () => {
  it('has the four levels in order', () => {
    expect(levels.map((l) => l.id)).toEqual([...LEVEL_IDS]);
  });

  it('uses unique, simple ids', () => {
    const ids = cur.lessons.map((r) => r.lesson.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(id).not.toBe('courses');
    }
    for (const r of cur.lessons) {
      const stepIds = r.lesson.steps.map((s) => s.id);
      expect(new Set(stepIds).size, r.lesson.id).toBe(stepIds.length);
      expect(
        r.lesson.steps.some((s) => s.type !== 'info'),
        `${r.lesson.id} has no task`,
      ).toBe(true);
    }
  });
});

describe('lesson texts (en)', () => {
  it('has a title and description for every course and lesson', () => {
    const courses = texts.courses as Record<string, { title?: string; desc?: string }>;
    for (const id of cur.courseById.keys()) {
      expect(courses[id]?.title, id).toBeTruthy();
      expect(courses[id]?.desc, id).toBeTruthy();
    }
    for (const r of cur.lessons) {
      expect(text(r.lesson.id, 'title'), r.lesson.id).toBeTruthy();
      expect(text(r.lesson.id, 'desc'), r.lesson.id).toBeTruthy();
    }
  });

  it('has the words for every step', () => {
    for (const s of allSteps) {
      const { lesson, step } = s;
      if (step.type === 'move' && step.src && !text(lesson, step.id))
        expect(text(lesson, 'task'), label(s)).toBeTruthy();
      else expect(text(lesson, step.id), label(s)).toBeTruthy();
      if (step.type === 'quiz') {
        for (const opt of step.options)
          expect(text(lesson, `${step.id}_${opt}`), `${label(s)}_${opt}`).toBeTruthy();
        expect(text(lesson, `${step.id}_done`), `${label(s)}_done`).toBeTruthy();
      }
    }
  });

  it('has no leftover keys, since a typo would never show', () => {
    for (const [lesson, entries] of Object.entries(texts)) {
      if (lesson === 'courses') {
        for (const id of Object.keys(entries)) expect(cur.courseById.has(id), id).toBe(true);
        continue;
      }
      const ref = cur.byId.get(lesson);
      expect(ref, `text for unknown lesson ${lesson}`).toBeDefined();
      const known = new Set(['title', 'desc', 'task']);
      for (const step of ref!.lesson.steps) {
        known.add(step.id);
        known.add(`${step.id}_done`);
        if (step.type === 'quiz') for (const opt of step.options) known.add(`${step.id}_${opt}`);
      }
      for (const key of Object.keys(entries)) expect(known.has(key), `${lesson}.${key}`).toBe(true);
    }
  });

  it('only fills in the side to move, and follows the copy rules', () => {
    for (const [lesson, entries] of Object.entries(texts)) {
      for (const [key, value] of Object.entries(entries)) {
        const s = typeof value === 'string' ? value : JSON.stringify(value);
        for (const m of s.match(/{{\s*(\w+)\s*}}/g) ?? [])
          expect(m, `${lesson}.${key}`).toBe('{{side}}');
        expect(s, `${lesson}.${key}`).not.toMatch(/[–—]/);
        // Exclamation marks only as chess annotation, after a move.
        expect(s.replace(/[A-Za-z0-9+#]!+/g, ''), `${lesson}.${key}`).not.toContain('!');
      }
    }
  });
});

describe('boards', () => {
  it('parses every position', () => {
    for (const s of allSteps)
      if (s.step.fen) expect(() => board(s.step.fen!), label(s)).not.toThrow();
  });

  it('draws only real squares and brushes', () => {
    for (const s of allSteps)
      for (const spec of [...(s.step.arrows ?? []), ...(s.step.marks ?? [])]) {
        const [sq, brush] = spec.split(':');
        expect(sq!.length === 2 || sq!.length === 4, `${label(s)} ${spec}`).toBe(true);
        expect(sq!.slice(0, 2), label(s)).toMatch(SQUARE);
        if (sq!.length === 4) expect(sq!.slice(2), label(s)).toMatch(SQUARE);
        if (brush) expect(BRUSHES.has(brush), `${label(s)} ${spec}`).toBe(true);
      }
  });

  it('only demonstrates legal moves', () => {
    for (const s of ofType('info')) {
      let fen = s.step.fen!;
      for (const uci of s.step.demo ?? []) {
        const r = demoMove(fen, uci);
        expect(r, `${label(s)} ${uci}`).toBeDefined();
        fen = r!.fen;
      }
    }
  });
});

describe('star tasks', () => {
  it('can be solved, and par is the true minimum', () => {
    for (const s of ofType('stars')) {
      const { step } = s;
      const own = piecesOf(step.fen, sideToMove(step.fen));
      if (step.piece) expect(own.has(step.piece), label(s)).toBe(true);
      else expect(own.size, `${label(s)}: say which piece moves`).toBe(1);
      for (const star of step.stars) {
        expect(star, label(s)).toMatch(SQUARE);
        expect(own.has(star), `${label(s)} star on own piece ${star}`).toBe(false);
      }
      expect(starsStart(step).left).toHaveLength(step.stars.length);
      expect(solveStars(step), label(s)).toBe(step.par);
    }
  }, 60_000);
});

describe('square tasks', () => {
  it('ask for real squares, and "where can it go" matches the rules', () => {
    for (const s of ofType('square')) {
      const { step } = s;
      expect(step.answer.length, label(s)).toBeGreaterThan(0);
      expect(new Set(step.answer).size, label(s)).toBe(step.answer.length);
      for (const sq of step.answer) expect(sq, label(s)).toMatch(SQUARE);
      if (step.movesOf) {
        const fen = step.fen!;
        const owner = board(fen).board.get(
          'abcdefgh'.indexOf(step.movesOf[0]!) + 8 * (Number(step.movesOf[1]) - 1),
        );
        expect(owner, label(s)).toBeTruthy();
        const dests = destsOf(withTurn(fen, owner!.color), step.movesOf);
        expect([...step.answer].sort(), label(s)).toEqual([...dests].sort());
      }
    }
  });
});

describe('quizzes', () => {
  it('have their answer among the options', () => {
    for (const s of ofType('quiz')) {
      expect(new Set(s.step.options).size, label(s)).toBe(s.step.options.length);
      expect(s.step.options.includes(s.step.answer), label(s)).toBe(true);
    }
  });
});

/** Replays a move task the way the page does; returns the final position. */
function replay(step: MoveStep, name: string): string {
  let fen = moveStepStart(step).fen;
  step.line.forEach((uci, i) => {
    const r = play(fen, uci);
    expect(r, `${name}: move ${i + 1} (${uci}) is illegal`).toBeDefined();
    if (i % 2 === 0) {
      expect(isRightMove(step, i, fen, uci), `${name}: move ${i + 1}`).toBe(true);
      const last = i === step.line.length - 1;
      expect(
        moveStepDone(step, i, r!.fen),
        `${name}: move ${i + 1} ends the task ${last ? 'too late' : 'too early'}`,
      ).toBe(last);
    }
    fen = r!.fen;
  });
  return fen;
}

describe('move tasks', () => {
  it('names the side that moves first, after the setup move', () => {
    // The task text fills {{side}} from the position the player sees.
    for (const s of ofType('move')) {
      const start = moveStepStart(s.step).fen;
      const first = s.step.line[0]!.slice(0, 2);
      const owner = board(start).board.get(parseSquare(first)!)?.color;
      expect(playerSide(s.step), label(s)).toBe(owner);
    }
  });

  it('are real positions whose lines are legal and end with your move', () => {
    for (const s of ofType('move')) {
      strictFen(s.step.fen, label(s));
      if (s.step.pre) expect(play(s.step.fen, s.step.pre), `${label(s)} pre`).toBeDefined();
      expect(s.step.line.length % 2, `${label(s)} must end with your move`).toBe(1);
      replay(s.step, label(s));
    }
  });

  it('really mate when they say so', () => {
    for (const s of ofType('move').filter((x) => x.step.goal === 'mate'))
      expect(isCheckmate(replay(s.step, label(s))), label(s)).toBe(true);
  });

  it('really check when they say so', () => {
    for (const s of ofType('move').filter((x) => x.step.goal === 'check')) {
      expect(s.step.line.length, label(s)).toBe(1);
      expect(inCheck(play(moveStepStart(s.step).fen, s.step.line[0]!)!.fen), label(s)).toBe(true);
    }
  });

  it('accept only legal alternatives, and "exact" lists every legal move', () => {
    for (const s of ofType('move').filter((x) => x.step.accept || x.step.exact)) {
      const { step } = s;
      const start = moveStepStart(step).fen;
      const right = [step.line[0]!, ...(step.accept ?? [])];
      for (const uci of right)
        expect(isRightMove(step, 0, start, uci), `${label(s)} ${uci}`).toBe(true);
      if (step.exact) expect(legalMoves(start).sort(), label(s)).toEqual([...right].sort());
    }
  });
});

describe('play-it-out tasks', () => {
  it('start from real positions that are not over', () => {
    for (const s of ofType('play')) {
      strictFen(s.step.fen, label(s));
      expect(board(s.step.fen).isEnd(), label(s)).toBe(false);
      expect(s.step.limit, label(s)).toBeGreaterThan(0);
      if (s.step.goal === 'promote')
        expect([...piecesOf(s.step.fen, sideToMove(s.step.fen)).values()], label(s)).toContain('p');
    }
  });
});

describe('the explanations tell the truth', () => {
  const find = (lesson: string, id: string) => {
    const step = cur.byId.get(lesson)?.lesson.steps.find((s) => s.id === id);
    expect(step, `${lesson}.${id}`).toBeDefined();
    return step!;
  };

  it('in the basics', () => {
    expect(isCheckmate(find('checkmate', 'intro').fen!)).toBe(true);
    const q1 = find('checkmate', 'q1').fen!;
    expect(inCheck(q1) && !isCheckmate(q1)).toBe(true);
    expect(isCheckmate(find('checkmate', 'q2').fen!)).toBe(true);
    expect(isStalemate(find('draw', 'stalemate').fen!)).toBe(true);
    expect(isStalemate(find('draw', 'q1').fen!)).toBe(true);
    expect(isCheckmate(find('draw', 'q2').fen!)).toBe(true);
    expect(board(find('draw', 'other').fen!).isInsufficientMaterial()).toBe(true);
    const avoid = find('draw', 'avoid') as MoveStep;
    expect(isStalemate(play(avoid.fen, 'c1c7')!.fen)).toBe(true);
    expect((find('promotion', 'queen') as MoveStep).line[0]).toMatch(/q$/);
  });

  it('in the mates', () => {
    const after = (fen: string, ...moves: string[]) =>
      moves.reduce((f, m) => demoMove(f, m)!.fen, fen);
    expect(isCheckmate(after(find('mate-in-one', 'intro').fen!, 'h1h8'))).toBe(true);
    expect(isCheckmate(after(find('back-rank', 'intro').fen!, 'e1e8'))).toBe(true);
    const luft = after(find('back-rank', 'luft').fen!, 'e1e8');
    expect(inCheck(luft) && !isCheckmate(luft)).toBe(true);
    const patt = find('queen-mate', 'patt').fen!;
    expect(isStalemate(after(patt, 'e7f7'))).toBe(true);
    expect(isCheckmate(after(patt, 'e7e8'))).toBe(true);
    for (const id of ['smothered', 'anastasia', 'arabian', 'mate-in-two', 'zugzwang', 'xray']) {
      const step = find(id, 'intro') as { fen: string; demo: string[] };
      expect(isCheckmate(after(step.fen, ...step.demo)), id).toBe(true);
    }
  });
});

// A tactic lesson teaches one idea: each puzzle's first tactic, read from its
// solution, is the lesson's own. A pin puzzle won by a fork teaches a fork.
const LESSON_TACTIC: Record<string, string> = {
  fork: 'fork',
  pin: 'pin',
  skewer: 'skewer',
  discovered: 'discovered attack',
  hanging: 'hanging piece',
  trapped: 'trapped piece',
  'back-rank': 'back rank mate',
  smothered: 'smothered mate',
};

describe('tactic lessons', () => {
  it('teach their own tactic in every puzzle', () => {
    for (const s of ofType('move')) {
      const kind = LESSON_TACTIC[s.lesson];
      const step = s.step as MoveStep & { pre?: string; line?: string[] };
      if (!kind || !step.pre || !step.line) continue;
      const found = lineTactics(fromFen(step.fen), [step.pre, ...step.line]);
      expect(found[0]?.kind, label(s)).toBe(kind);
    }
  });
});
