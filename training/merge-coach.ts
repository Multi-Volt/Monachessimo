// Builds the phone model's training set from the coach texts (write-coach):
// the notes in words as the prompt, the text as the answer.
//
//   node --experimental-transform-types --import ./training/register.mjs \
//     training/merge-coach.ts --records training/data/v2-all.jsonl \
//     --texts training/data/v2-coach.jsonl --out training/data/set-v2
//
// The notes are built again from each record with the current code, and a
// text is kept only if it passes checkCoachText against them, so a text
// written from notes that have since changed is checked against what the
// model will read. Held-out records are chosen by a hash of their id, so the
// split stays the same as texts are added; every held-out record is kept,
// with or without a passing text, since the model writes its own. Writes
// train.jsonl and heldout.jsonl under --out, one {id, sheet, facts, text}
// per line: sheet is what the model reads, facts what the checker reads.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { checkCoachText, coachNotes, spellMoves } from '../src/play/coachNotes';
import type { ExplanationRecord } from '../src/play/record';

function args() {
  const a = process.argv.slice(2);
  const get = (k: string) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    records: get('--records') ?? 'training/data/v2-all.jsonl',
    texts: (get('--texts') ?? 'training/data/v2-coach.jsonl').split(','),
    out: get('--out') ?? 'training/data/set-v2',
    heldout: Number(get('--heldout') ?? 0.04),
  };
}

/** FNV-1a, for a split that depends only on the id. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const lines = (f: string) => readFileSync(f, 'utf8').split('\n').filter(Boolean);

function main() {
  const o = args();
  const facts = new Map<string, string>();
  for (const l of lines(o.records)) {
    const r = JSON.parse(l) as { id: string; record: ExplanationRecord };
    facts.set(r.id, coachNotes(r.record));
  }
  // The last passing text for each record wins.
  const texts = new Map<string, string>();
  let seen = 0;
  let changed = 0;
  let failed = 0;
  for (const f of o.texts)
    for (const l of lines(f)) {
      const t = JSON.parse(l) as { id: string; facts?: string; text: string };
      const notes = facts.get(t.id);
      if (!notes) continue;
      seen++;
      if (t.facts !== undefined && t.facts !== notes) changed++;
      if (checkCoachText(notes, t.text).length) failed++;
      else texts.set(t.id, t.text);
    }
  const train: string[] = [];
  const held: string[] = [];
  for (const [id, notes] of facts) {
    const isHeld = hash(id) / 2 ** 32 < o.heldout;
    const text = texts.get(id);
    if (!isHeld && !text) continue;
    const line = JSON.stringify({ id, sheet: spellMoves(notes), facts: notes, text: text ?? '' });
    (isHeld ? held : train).push(line);
  }
  mkdirSync(o.out, { recursive: true });
  writeFileSync(`${o.out}/train.jsonl`, train.join('\n') + '\n');
  writeFileSync(`${o.out}/heldout.jsonl`, held.join('\n') + '\n');
  console.log(
    `${seen} texts, ${changed} written from notes that have changed, ${failed} fail now. ` +
      `${train.length} train, ${held.length} held out.`,
  );
}

main();
