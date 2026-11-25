// Writes coach texts from the second version of the notes (coachNotes) with
// a local model served by llama.cpp, checked by checkCoachText. A pilot
// takes a varied sample so the style can be read before bulk generation.
//
//   node --experimental-transform-types --import ./training/register.mjs \
//     training/write-coach.ts --in training/data/records.jsonl \
//     --out training/data/coach-pilot.jsonl --limit 100 --parallel 8
//
// The sample is spread over verdicts and kinds of notes (a tactic, a mate,
// a trade, a quiet move), in an order fixed by a hash of the record id. A
// text that fails the check is written again, up to --tries times; the last
// try is kept with its problems. Each output line holds the record id, the
// writer, the notes, the text, its problems and the number of tries.
import { readFileSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { checkCoachText, coachNotes } from '../src/play/coachNotes';
import type { ExplanationRecord } from '../src/play/record';

export const SYSTEM = `You are a friendly chess coach sitting beside a beginner. The player just made a move, and you explain in two or three short sentences what goes wrong with it, using only the facts in the notes.

Rules:
- Talk to the player as "you" and call the other side "your opponent".
- Tell it the way a person sees it, a move or two ahead: what the move allows, the idea your opponent uses, and what it costs.
- If the notes list a pattern, name it once and show it on the board, for example "That sets up a fork: your opponent's knight attacks your king and your rook at once."
- Say moves in plain words: "knight to f3", "bishop takes e5", "castles". Never use chess notation.
- Material: say only what the "Result" and "Where it leaves you" lines say, in points. Never work out material yourself and never measure anything in pawns.
- If the result is a checkmate, say so plainly.
- If the notes give a "Coach's take", say just that in your own words: the move is okay but not the best, and there were better options. Do not invent a reason or describe a threat that is not in the notes.
- Do not name a better move.
- Warm, plain words a beginner understands. No jargon, no exclamation marks, no dashes, no parentheses, no lists, and no filler words such as simply, just or really.`;

/** Worked examples, hand-written from real notes: a hanging piece, a fork, a mate, a quiet move. */
export const EXAMPLES: [string, string][] = [
  [
    `Your move: Bg5. Verdict: a blunder.
Why: Your bishop on g5 can be taken by your opponent's knight for free.
Patterns: a hanging piece.
What happens next:
- You play Bg5.
- Your opponent's knight takes your bishop on g5.
Result: you lose a bishop (3 points), so you are 3 points down.
Where it leaves you: you were even in material, and now you are 3 points behind.`,
    "Bishop to g5 puts your bishop where your opponent's knight can take it for free. That is a hanging piece: nothing guards the bishop, so you give away 3 points and fall 3 points behind.",
  ],
  [
    `Your move: Kf6. Verdict: a blunder.
Why: Your opponent's knight on d5 attacks your rook on b4 and your king on f6 at once.
Patterns: a fork.
What happens next:
- You play Kf6.
- Check from your opponent's knight on d5, so you have no time for anything else.
- Your king now attacks your opponent's knight on d5.
- Your opponent's knight takes your rook on b4.
- You take back on b4.
Result: you lose a rook (5 points) and you win a knight (3 points), so you are 2 points down.
Where it leaves you: you were 2 points ahead, and now you are even in material.`,
    "King to f6 walks into a fork: your opponent's knight jumps to d5 with check and attacks your rook on b4 at the same time. You have to answer the check, so the knight takes your rook, and taking back only wins a knight. You were 2 points ahead, and now the game is even again.",
  ],
  [
    `Your move: Nxb5. Verdict: a mistake.
Patterns: a back rank mate, a forced mate.
Ignored threat: before your move, your opponent threatened Rc8#.
What happens next:
- Your knight takes your opponent's knight on b5.
- Your opponent plays Rc8#. Checkmate.
Result: your opponent gives checkmate.`,
    'Knight takes b5 wins a piece, but it ignores the threat your opponent already had. Rook to c8 is checkmate: a back rank mate, where the rook checks your king along the back row and the king has nowhere to go.',
  ],
  [
    `Your move: Ng5. Verdict: an inaccuracy.
What happens next:
- Your knight now attacks your opponent's pawn on f7.
- Your opponent plays O-O, threatening Nd4.
- You play d3.
Result: no material changes hands.
Coach's take: the move is okay, just not the best; there were better options.`,
    'Knight to g5 is okay, but it is not the best move here. Nothing is lost, and the game goes on as before. There were better options in this position, so it is worth a second look next time.',
  ],
];

/** Records whose notes the examples were written from: never in a sample. */
const EXAMPLE_IDS = new Set(['p:1dc8C', 'p:00all', 'g:4fwbyq05:8']);

function args() {
  const a = process.argv.slice(2);
  const get = (k: string) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    input: get('--in') ?? 'training/data/records.jsonl',
    out: get('--out') ?? 'training/data/coach-pilot.jsonl',
    server: get('--server') ?? 'http://127.0.0.1:8091',
    limit: Number(get('--limit') ?? 100),
    parallel: Number(get('--parallel') ?? 8),
    tries: Number(get('--tries') ?? 3),
    skip: (get('--skip') ?? '').split(',').filter(Boolean),
  };
}

/** FNV-1a, for an order that depends only on the id. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** The kind of notes, so a sample covers each. */
function kind(r: ExplanationRecord, notes: string): string {
  if (/gives checkmate/.test(notes)) return 'mate';
  if (/Coach's take/.test(notes)) return 'quiet';
  if (/^Patterns:/m.test(notes)) return `tactic ${r.verdict.class}`;
  if (/even trade/.test(notes)) return 'trade';
  return `other ${r.verdict.class}`;
}

async function complete(server: string, notes: string): Promise<{ text: string; model: string }> {
  const messages = [{ role: 'system', content: SYSTEM }];
  for (const [n, t] of EXAMPLES)
    messages.push({ role: 'user', content: `Notes:\n${n}` }, { role: 'assistant', content: t });
  messages.push({ role: 'user', content: `Notes:\n${notes}` });
  const res = await fetch(`${server}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages,
      temperature: 0.3,
      max_tokens: 220,
      chat_template_kwargs: { enable_thinking: false },
    }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = (await res.json()) as { model: string; choices: { message: { content: string } }[] };
  return { text: (body.choices[0]?.message.content ?? '').trim(), model: body.model };
}

async function main() {
  const o = args();
  const skip = new Set([...EXAMPLE_IDS]);
  for (const f of o.skip)
    for (const l of readFileSync(f, 'utf8').split('\n'))
      if (l) skip.add((JSON.parse(l) as { id: string }).id);
  const rows = readFileSync(o.input, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { id: string; record: ExplanationRecord })
    .filter((r) => !skip.has(r.id))
    .sort((a, b) => hash(a.id) - hash(b.id));
  // Round robin over kinds, so a small sample is varied.
  const groups = new Map<string, { id: string; notes: string }[]>();
  for (const r of rows) {
    const notes = coachNotes(r.record);
    const k = kind(r.record, notes);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push({ id: r.id, notes });
  }
  const todo: { id: string; notes: string; kind: string }[] = [];
  for (let i = 0; todo.length < o.limit; i++) {
    let added = false;
    for (const [k, g] of groups)
      if (g[i] && todo.length < o.limit) {
        todo.push({ ...g[i]!, kind: k });
        added = true;
      }
    if (!added) break;
  }
  let n = 0;
  let passed = 0;
  const started = Date.now();
  const worker = async () => {
    while (todo.length) {
      const t = todo.shift()!;
      let text = '';
      let model = '';
      let problems: string[] = [];
      let tries = 0;
      while (tries < o.tries) {
        tries++;
        ({ text, model } = await complete(o.server, t.notes));
        problems = checkCoachText(t.notes, text);
        if (!problems.length) break;
      }
      n++;
      if (!problems.length) passed++;
      const line = { id: t.id, kind: t.kind, writer: model, notes: t.notes, text, problems, tries };
      await appendFile(o.out, JSON.stringify(line) + '\n');
      if (n % 10 === 0)
        console.log(
          `${n} written, ${((100 * passed) / n).toFixed(1)}% pass, ${(n / ((Date.now() - started) / 1000)).toFixed(2)}/s`,
        );
    }
  };
  await Promise.all(Array.from({ length: o.parallel }, worker));
  console.log(
    `Wrote ${n} texts in ${((Date.now() - started) / 60_000).toFixed(1)} min, ${passed} pass.`,
  );
}

await main();
