import type { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import type { Color } from 'chessops/types';
import { pvToSan } from '../chess/san';
import type { TagName } from '../detectors';
import type { Threat } from '../engine/threat';
import { causeMarks, causeText, type Cause, type Mark } from './cause';
import type { MoveClass, Verdict } from './coach';
import type { MoveExplanation } from './explain';
import type { LineStep } from './narrate';
import type { LongTermReason } from './reason';

/** Bump when a field changes meaning or is removed; adding an optional field keeps it. */
export const RECORD_VERSION = 1;

/**
 * Everything the coach knows about one judged move, as plain data. The UI
 * renders from it, and the exporter writes it as one JSON line, so a later
 * phrasing model reads exactly what the templates read.
 */
export interface ExplanationRecord {
  version: typeof RECORD_VERSION;
  /** The position before the move, and the side that played it. */
  fen: string;
  side: Color;
  move: { uci: string; san: string };
  verdict: {
    class: MoveClass | null;
    /** Centipawns lost against the best move. */
    cost: number;
    /** Winning chances lost, 0 to 1. */
    drop: number;
  };
  /** The opponent's threat before the move, from the null-move search. */
  threat?: { uci: string; san: string; gain: number };
  cause?: Cause;
  /** The opponent's best line after the move, in UCI. */
  reply: string[];
  /** One step per move of the refuting line; empty until narrated. */
  line: LineStep[];
  reason?: LongTermReason;
  tags: TagName[];
  /** Board marks for the verdict: the cause's, or the reply's arrow. */
  marks: Mark[];
  /** The template sentences, as shown. */
  sentences: {
    headline: string;
    points: string[];
    cause?: string;
    reason?: string;
  };
}

/** The record of a judged move, from the same inputs the coach used. */
export function buildRecord(args: {
  before: Chess;
  uci: string;
  reply: readonly string[];
  verdict: Verdict;
  explanation: MoveExplanation;
  threat?: Threat | undefined;
}): ExplanationRecord {
  const { before, uci, reply, verdict, explanation: e } = args;
  const fen = makeFen(before.toSetup());
  const san = pvToSan(fen, [uci], 1)[0] ?? uci;
  const marks: Mark[] = e.cause ? causeMarks(e.cause) : [];
  if (!marks.length && reply[0])
    marks.push({ orig: reply[0].slice(0, 2), dest: reply[0].slice(2, 4), brush: 'red' });
  const threat = args.threat
    ? {
        uci: args.threat.uci,
        san: threatSan(before, args.threat.uci) ?? args.threat.uci,
        gain: args.threat.gain,
      }
    : undefined;
  return {
    version: RECORD_VERSION,
    fen,
    side: before.turn,
    move: { uci, san },
    verdict: { class: verdict.class, cost: verdict.cpLoss, drop: verdict.drop },
    ...(threat ? { threat } : {}),
    ...(e.cause ? { cause: e.cause } : {}),
    reply: [...reply],
    line: [],
    tags: e.tags,
    marks,
    sentences: {
      headline: e.headline,
      points: e.points,
      ...(e.cause ? { cause: causeText(e.cause) } : {}),
    },
  };
}

/** The threat's SAN: it is the opponent's move with the player passing. */
function threatSan(before: Chess, uci: string): string | undefined {
  const passed = before.clone();
  passed.turn = passed.turn === 'white' ? 'black' : 'white';
  passed.epSquare = undefined;
  return pvToSan(makeFen(passed.toSetup()), [uci], 1)[0];
}

/** Adds the narrated line and the long-term reason once they are known. */
export function withLine(
  r: ExplanationRecord,
  line: LineStep[],
  reason?: LongTermReason,
): ExplanationRecord {
  return {
    ...r,
    line,
    ...(reason ? { reason } : {}),
    sentences: { ...r.sentences, ...(reason ? { reason: reason.text } : {}) },
  };
}

/** One JSON line per record, for training data. */
export function toJsonl(records: readonly ExplanationRecord[]): string {
  return records.map((r) => JSON.stringify(r)).join('\n') + (records.length ? '\n' : '');
}
