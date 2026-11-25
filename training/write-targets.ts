// Writes a target text for each exported record with a local model served
// by llama.cpp's llama-server, and keeps only texts that pass the checker.
//
// Two tiers: a small fast model writes everything, then a larger one
// rewrites only what the small one got wrong, as the checker sees it.
//
//   llama-server -m small.gguf --jinja -ngl 99 -c 32768 -np 16 --port 8091
//   node --experimental-transform-types --import ./training/register.mjs \
//     training/write-targets.ts --in training/data/records.jsonl \
//     --out training/data/targets-tier1.jsonl --parallel 16
//   (restart llama-server with the larger model)
//   ... write-targets.ts --in training/data/records.jsonl \
//     --only-failed training/data/targets-tier1.jsonl \
//     --out training/data/targets-tier2.jsonl --parallel 8
//
// Each line of the output holds the record id, the model that wrote it, the
// fact sheet, the text, the checker's problems and, with --review, the
// writer's own review. A text with problems is retried twice; the last try
// is kept with its problems. The output is appended to and resumes after a
// stop. --skip FILE leaves out records that already have a passing text there.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { appendFile } from 'node:fs/promises';
import { checkPhrasing, factSheet } from '../src/play/phrasing';
import type { ExplanationRecord } from '../src/play/record';

export const SYSTEM = `You are a chess coach. You played the opponent's side, and you explain to the player why their move was a mistake.

You get the coach's notes on one move. Rewrite them as two to four short sentences that one person would say out loud.

Rules:
- Use only facts from the notes. Never add a square, piece, move, number, threat or pattern that the notes do not state.
- Speak as the opponent: "I" and "my" are the opponent, "you" and "your" are the player.
- Keep who did what exactly as in the notes. A piece the notes call "my" stays "my", a piece they call "your" stays "your". "You play" is the player's move, "I play" is the opponent's.
- Say a move is forced only when the notes say "You have to". Say who is ahead in material only as the notes say it.
- Plain words, one idea per sentence. Write every move in words, never in notation: "rook to h8", "knight takes e5", "queen takes on f7, with check", "pawn to d5", "castles". Squares stay as they are, like e5.
- If the notes list patterns, name the most important one once, the way a coach teaches it, and show it on the board: "That is a fork: my knight attacks your king and your rook at once." Never name a pattern the notes do not list.
- Lead with what goes wrong, then what happens next, then the long-term cost if the notes give one. Pick the facts that matter most; you do not need all of them.
- Never name a better move for the player.
- No dashes, no parentheses, no exclamation marks, no lists, no filler words such as "great", "simply", "crucial" or "unfortunately".
- Reply with the sentences only.`;

export const REVIEW = `You check a chess coach's text against the coach's notes. The notes are the only truth.

Answer WRONG if the text does any of these:
- states something the notes do not say, or a reason they do not give;
- gives a piece or a move to the wrong side ("my" is the opponent, "your" is the player);
- changes the order of the moves, or says a move is forced when the notes do not say "You have to";
- states a different material result or a different class of move than the notes.
Leaving facts out is fine. Plain retelling of a fact in other words is fine.

Reply with OK, or with WRONG and the wrong claim in a few words.`;

/**
 * Worked examples, notes then answer. The first was written by hand; the
 * others by DeepSeek V4.1 Flash (MIT), which kept closest to the notes of
 * the writers compared, with their moves then put in words by hand.
 */
const EXAMPLES: [string, string][] = [
  [
    `Bg5 is a blunder: it costs about 3.1 pawns.
Why: Your bishop on g5 can be taken by my pawn for free.
Patterns: a hanging piece.
Fact: I answer hxg5, taking your bishop on g5.
What happens next:
- You play Bg5.
- My pawn takes your bishop on g5.
Long term: 6 moves later you have 3 pawns less material than after a better move.`,
    `Bishop to g5 leaves your bishop hanging: my pawn can take it for free, and I do with pawn takes g5. Six moves on, you have three pawns less than after a better move.`,
  ],
  [
    `exf6 is a blunder: it turns the game around.
Patterns: a forced mate.
Fact: It allows mate in 2.
What happens next:
- Your pawn takes my rook on f6.
- Check from my rook on e1, so you have no time for anything else.
- Your king now attacks my rook on e1.
- Rf1#. Checkmate.
Long term: My pieces head for your king: Re1+, Rf1#, and it ends in checkmate.`,
    `Pawn takes f6 wins my rook, but it turns the game around. It allows mate in two. My rook checks on e1, so you have no time for anything else, and rook to f1 is checkmate.`,
  ],
  [
    `Ba4 is an inaccuracy: it costs about 1.6 pawns.
Why: My rook pins your bishop on a4 to your rook behind it.
Patterns: a pin.
Fact: I answer Ra3, attacking your pawn on a2, which has no safe square.
Fact: In the line that follows you lose a pawn.
What happens next:
- You play Ba4.
- Now my rook attacks your pawn on a2.
- You play Kg1.
- My rook takes your pawn on a2.
- Your rook now attacks my pawn on b6.
- My rook moves to the open d-file.
Long term: Nothing can defend your pawn on c2 with a pawn, so it becomes a target.`,
    `Bishop to a4 walks into a pin: my rook pins your bishop on a4 to your rook behind it. I answer rook to a3, attacking your pawn on a2, which has no safe square, and I take it next. Your pawn on c2 becomes a target because nothing can defend it with a pawn.`,
  ],
  [
    `Ne7 is a mistake: it costs about 1.3 pawns.
Fact: This move ignores my threat of e5.
Fact: I answer e5, attacking your pawn on d6 and your pawn on f6.
Fact: In the line that follows you lose a pawn, a pawn, and you win a pawn.
What happens next:
- You play Ne7.
- Now my pawn attacks your pawn on d6 and your pawn on f6.
- Your pawn takes my pawn on e5.
- I take back on e5, and material is even.
- You play d5. You have to: anything else loses about 1.9 pawns.
- My bishop takes your pawn on g6.
Long term: 10 moves later you have 1 pawn less material than after a better move.`,
    `Knight to e7 ignores my threat of pawn to e5. I play it, attacking your pawn on d6 and your pawn on f6. You then have to play pawn to d5, since anything else loses about 1.9 pawns, and my bishop takes your pawn on g6.`,
  ],
];

function args() {
  const a = process.argv.slice(2);
  const get = (k: string) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    input: get('--in') ?? 'training/data/records.jsonl',
    out: get('--out') ?? 'training/data/targets.jsonl',
    server: get('--server') ?? 'http://127.0.0.1:8091',
    parallel: Number(get('--parallel') ?? 8),
    limit: Number(get('--limit') ?? Infinity),
    /** Tier two: write only records whose text in this file fails the checker or is missing. */
    onlyFailed: get('--only-failed'),
    /** Skip records that already have a passing text in these files (comma separated), from the current notes. */
    skip: get('--skip'),
    tries: Number(get('--tries') ?? 3),
    /** Let the writer reason before it answers: slower, and checked to be more accurate. */
    think: a.includes('--think'),
    /** Only review texts already written in --in, which then holds target lines. */
    reviewOnly: a.includes('--review-only'),
    /** Review each text right after writing it. Slower: the slots lose their cached prompt. */
    review: a.includes('--review'),
  };
}

/** Posts to the server, waiting out a server that is loading or briefly down. */
async function post(url: string, body: unknown): Promise<Response> {
  for (let wait = 2_000; ; wait = Math.min(wait * 2, 60_000)) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => undefined);
    if (res && res.status !== 503) return res;
    console.error(`Server not ready (${res?.status ?? 'no connection'}), retrying.`);
    await new Promise((r) => setTimeout(r, wait));
  }
}

async function complete(
  server: string,
  sheet: string,
  temperature: number,
  think: boolean,
): Promise<{ text: string; model: string }> {
  const res = await post(`${server}/v1/chat/completions`, {
    messages: [
      { role: 'system', content: SYSTEM },
      ...EXAMPLES.flatMap(([notes, text]) => [
        { role: 'user', content: notes },
        { role: 'assistant', content: text },
      ]),
      { role: 'user', content: sheet },
    ],
    temperature,
    top_p: 0.95,
    top_k: 20,
    max_tokens: think ? 6000 : 300,
    chat_template_kwargs: { enable_thinking: think },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = (await res.json()) as {
    model: string;
    choices: { message: { content: string } }[];
  };
  const text = (body.choices[0]?.message.content ?? '').replace(/<think>[\s\S]*?<\/think>/g, '');
  return { text: text.trim(), model: body.model };
}

export interface TargetLine {
  id: string;
  sheet: string;
  text: string;
}

/**
 * The texts in a targets file that still pass, by record id: written from
 * the record's current notes and accepted by the current checker. The
 * checker grows stricter over time, so its old verdicts are not trusted.
 */
export function passing(files: string, sheets: Map<string, string>): Set<string> {
  const ok = new Set<string>();
  for (const file of files.split(',')) {
    // The last text written for a record is the one that counts.
    const last = new Map<string, TargetLine>();
    for (const l of readFileSync(file, 'utf8').split('\n'))
      if (l) last.set((JSON.parse(l) as TargetLine).id, JSON.parse(l) as TargetLine);
    for (const t of last.values())
      if (t.sheet === sheets.get(t.id) && !targetProblems(t.sheet, t.text).length) ok.add(t.id);
  }
  return ok;
}

/** Words that show a text named a pattern from the notes' "Patterns:" line. */
const PATTERN_WORD: Record<string, RegExp> = {
  'a fork': /\bfork/i,
  'a pin': /\bpin(s|ned|ning)?\b/i,
  'a skewer': /\bskewer/i,
  'a discovered attack': /\bdiscovered\b/i,
  'a back rank mate': /\bback rank\b/i,
  'a forced mate': /\bmate\b|\bcheckmate/i,
  'a hanging piece': /\bhanging\b|\bfor free\b|\bunprotected\b/i,
};

/**
 * The checker's problems, plus one that only matters for training: when the
 * notes name a pattern, a target names it too, so the phone model learns to
 * teach tactics by name. A text without it goes to the larger writer.
 */
export function targetProblems(sheet: string, text: string): string[] {
  const problems = checkPhrasing(sheet, text);
  const first = /^Patterns: ([^,.\n]+)/m.exec(sheet)?.[1];
  const word = first ? PATTERN_WORD[first] : undefined;
  if (word && !word.test(text)) problems.push(`pattern not named: ${first}`);
  return problems;
}

/** The writer's second reading: undefined when the text is faithful, else what is wrong. */
async function review(server: string, sheet: string, text: string): Promise<string | undefined> {
  const res = await post(`${server}/v1/chat/completions`, {
    messages: [
      { role: 'system', content: REVIEW },
      { role: 'user', content: `Notes:\n${sheet}\n\nText:\n${text}` },
    ],
    temperature: 0,
    max_tokens: 60,
    chat_template_kwargs: { enable_thinking: false },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  const body = (await res.json()) as { choices: { message: { content: string } }[] };
  const answer = (body.choices[0]?.message.content ?? '').trim();
  return /^OK\b/i.test(answer) ? undefined : answer;
}

/** Reviews written texts only, to measure the reviewer against known answers. */
async function reviewOnly(o: ReturnType<typeof args>) {
  const rows = readFileSync(o.input, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { id: string; sheet: string; text: string });
  for (const r of rows)
    console.log(`${r.id}\t${(await review(o.server, r.sheet, r.text)) ?? 'OK'}`);
}

async function main() {
  const o = args();
  if (o.reviewOnly) return reviewOnly(o);
  if (!existsSync(o.out)) writeFileSync(o.out, '');
  const records = readFileSync(o.input, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as { id: string; record: ExplanationRecord });
  const sheets = new Map(records.map((r) => [r.id, factSheet(r.record)]));
  // Done means written from the record's current notes; changed notes are written again.
  const done = new Set<string>();
  for (const l of readFileSync(o.out, 'utf8').split('\n')) {
    if (!l) continue;
    const t = JSON.parse(l) as TargetLine;
    if (t.sheet === sheets.get(t.id)) done.add(t.id);
  }
  const skip = o.skip ? passing(o.skip, sheets) : new Set<string>();
  const firstTier = o.onlyFailed ? passing(o.onlyFailed, sheets) : new Set<string>();
  const todo = records
    .filter((r) => !done.has(r.id) && !skip.has(r.id) && !firstTier.has(r.id))
    .slice(0, o.limit);
  if (o.onlyFailed) console.log(`${todo.length} records failed or are missing in ${o.onlyFailed}.`);

  const started = Date.now();
  let n = 0;
  let passed = 0;
  let next = 0;
  const worker = async () => {
    while (next < todo.length) {
      const { id, record } = todo[next++]!;
      const sheet = sheets.get(id) ?? factSheet(record);
      let text = '';
      let model = '';
      let problems: string[] = [];
      let tries = 0;
      while (tries < o.tries) {
        tries++;
        ({ text, model } = await complete(o.server, sheet, 0.6 + 0.1 * (tries - 1), o.think));
        problems = targetProblems(sheet, text);
        if (!problems.length) break;
      }
      // The review is stored, not used to retry: it also rejects good texts.
      const verdict =
        o.review && !problems.length ? await review(o.server, sheet, text) : undefined;
      n++;
      if (!problems.length) passed++;
      const line = {
        id,
        writer: model,
        sheet,
        text,
        problems,
        tries,
        ...(o.review ? { review: verdict ?? 'OK' } : {}),
      };
      await appendFile(o.out, JSON.stringify(line) + '\n');
      if (n % 25 === 0) {
        const s = (Date.now() - started) / 1000;
        console.log(
          `${n}/${todo.length} written, ${((100 * passed) / n).toFixed(1)}% pass, ${(n / s).toFixed(2)}/s`,
        );
      }
    }
  };
  await Promise.all(Array.from({ length: o.parallel }, worker));
  const min = (Date.now() - started) / 60_000;
  console.log(`Wrote ${n} texts in ${min.toFixed(1)} min, ${passed} pass the checker.`);
}

// Run only as a script, so the merge step can reuse the checks above.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main();
