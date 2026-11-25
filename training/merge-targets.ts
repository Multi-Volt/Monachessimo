// Merges the written targets into the phone model's training set, and keeps
// a fixed held-out set of records the model never trains on.
//
//   node --experimental-transform-types --import ./training/register.mjs \
//     training/merge-targets.ts --records training/data/records.jsonl \
//     --targets training/data/targets-tier1.jsonl,training/data/targets-12b-first.jsonl,training/data/targets-tier2.jsonl \
//     --out training/data/set
//
// A record's text is the last one written for it in the last file that has a
// passing one, so a later tier wins over an earlier. The held-out records are
// chosen by a hash of their id, so the split stays the same as records are
// added. A line without a writer, from before lines named one, is credited
// to --writer. Writes train.jsonl and heldout.jsonl under --out, one
// {id, source, rating, phase, writer, sheet, text} per line; a held-out record
// has a text only when a writer got one past the checker.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { factSheet } from '../src/play/phrasing';
import type { ExplanationRecord } from '../src/play/record';
import { passing, type TargetLine } from './write-targets';

interface RecordLine {
  id: string;
  source: string;
  rating: number;
  phase: string;
  record: ExplanationRecord;
}

function args() {
  const a = process.argv.slice(2);
  const get = (k: string) => {
    const i = a.indexOf(k);
    return i >= 0 ? a[i + 1] : undefined;
  };
  return {
    records: get('--records') ?? 'training/data/records.jsonl',
    targets: (get('--targets') ?? '').split(',').filter(Boolean),
    out: get('--out') ?? 'training/data/set',
    heldout: Number(get('--heldout') ?? 1000),
    writer: get('--writer') ?? 'gemma-4-12B-it-Q8_0.gguf',
  };
}

/** FNV-1a, so the held-out choice depends only on the id. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

const jsonl = <T>(file: string): T[] =>
  readFileSync(file, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);

function main() {
  const o = args();
  const records = jsonl<RecordLine>(o.records);
  const sheets = new Map(records.map((r) => [r.id, factSheet(r.record)]));

  const chosen = new Map<string, TargetLine & { writer: string }>();
  const byFile: Record<string, number> = {};
  for (const file of o.targets) {
    const ok = passing(file, sheets);
    const last = new Map<string, TargetLine & { writer: string }>();
    for (const t of jsonl<TargetLine & { writer?: string }>(file))
      last.set(t.id, { ...t, writer: t.writer ?? o.writer });
    for (const id of ok) chosen.set(id, last.get(id)!);
    byFile[file] = ok.size;
  }

  const held = new Set(
    [...records]
      .sort((a, b) => hash(a.id) - hash(b.id))
      .slice(0, o.heldout)
      .map((r) => r.id),
  );
  const row = (r: RecordLine) => {
    const t = chosen.get(r.id);
    return JSON.stringify({
      id: r.id,
      source: r.source,
      rating: r.rating,
      phase: r.phase,
      writer: t?.writer,
      sheet: sheets.get(r.id),
      text: t?.text,
    });
  };
  const train = records.filter((r) => !held.has(r.id) && chosen.has(r.id));
  const heldout = records.filter((r) => held.has(r.id));
  mkdirSync(o.out, { recursive: true });
  writeFileSync(`${o.out}/train.jsonl`, train.map(row).join('\n') + '\n');
  writeFileSync(`${o.out}/heldout.jsonl`, heldout.map(row).join('\n') + '\n');

  const writers: Record<string, number> = {};
  for (const r of train) {
    const w = chosen.get(r.id)!.writer;
    writers[w] = (writers[w] ?? 0) + 1;
  }
  console.log(`${records.length} records, ${chosen.size} with a passing text.`);
  for (const [f, n] of Object.entries(byFile)) console.log(`  ${n} pass in ${f}`);
  console.log(`Train: ${train.length}, by writer: ${JSON.stringify(writers)}`);
  console.log(
    `Held out: ${heldout.length}, ${heldout.filter((r) => chosen.has(r.id)).length} with a text.`,
  );
}

main();
