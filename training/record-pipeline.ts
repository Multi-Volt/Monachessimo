// The coach's judgment of one move, as Play does it when it refuses a move:
// the same searches, the same explanation, the narrated line and the
// long-term reason, ending in one A6 record.
import type { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { parseUci } from 'chessops/util';
import type { SearchRequest, SearchResult } from '../src/engine/engine';
import { negate, type Score } from '../src/engine/eval';
import { findThreat } from '../src/engine/threat';
import { judgeMove } from '../src/play/coach';
import { explainMove } from '../src/play/explain';
import { enrichLine, narrateLine } from '../src/play/narrate';
import { longTermReason, REASON_PLIES } from '../src/play/reason';
import { buildRecord, withLine, type ExplanationRecord } from '../src/play/record';

export type Search = (req: SearchRequest) => Promise<SearchResult>;

/**
 * The record for `uci` played in `before`, or undefined when the move is
 * not an inaccuracy or worse. Search settings match Play.tsx.
 */
export async function recordFor(
  search: Search,
  before: Chess,
  uci: string,
  ply: number,
): Promise<ExplanationRecord | undefined> {
  const move = parseUci(uci);
  if (!move || !before.isLegal(move)) return undefined;
  const fen = makeFen(before.toSetup());
  const t = await search({ fen, depth: 14, movetime: 1500, multipv: 3 });
  const best = t.lines[0]?.score;
  if (!best) return undefined;

  const after = before.clone();
  after.play(move);
  if (after.isEnd()) return undefined;
  const inLines = t.lines.find((l) => l.pv[0] === uci);
  let played: Score;
  let reply: string[];
  if (inLines) {
    played = inLines.score;
    reply = inLines.pv.slice(1);
  } else {
    const r = await search({ fen: makeFen(after.toSetup()), depth: 14, movetime: 1200 });
    if (!r.lines[0]) return undefined;
    played = negate(r.lines[0].score);
    reply = r.lines[0].pv;
  }
  const verdict = judgeMove(best, played);
  if (!verdict.class) return undefined;

  const threat = await findThreat(search, fen, best);
  const explanation = explainMove({
    before,
    uci,
    reply,
    lines: t.lines,
    best,
    played,
    verdict,
    ply,
    threat,
  });
  const record = buildRecord({ before, uci, reply, verdict, explanation, threat });

  const shown = [uci, ...reply.slice(0, 5)];
  const steps = await enrichLine(before, shown, narrateLine(before, shown, before.turn), search);
  const reason = longTermReason(
    before,
    before.turn,
    [uci, ...reply.slice(0, REASON_PLIES)],
    t.lines[0]?.pv ?? [],
  );
  return withLine(record, steps, reason);
}
