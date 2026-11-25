// Checks texts a trained model wrote for held-out records: the share that
// passes the app's checker, the share that also names the listed pattern,
// and the most common problems.
//
//   node --experimental-transform-types --import ./training/register.mjs \
//     training/check-texts.ts training/data/runs/r1/heldout.jsonl
import { readFileSync } from 'node:fs';
import { checkPhrasing } from '../src/play/phrasing';
import { targetProblems } from './write-targets';

const file = process.argv[2];
if (!file) throw new Error('Usage: check-texts.ts FILE');
const rows = readFileSync(file, 'utf8')
  .split('\n')
  .filter(Boolean)
  .map((l) => JSON.parse(l) as { id: string; sheet: string; text: string });

let app = 0;
let target = 0;
const tally = new Map<string, number>();
for (const r of rows) {
  if (!checkPhrasing(r.sheet, r.text).length) app++;
  const problems = targetProblems(r.sheet, r.text);
  if (!problems.length) target++;
  // Group by kind: "move: knight takes e5 ..." counts as "move".
  for (const p of new Set(problems.map((p) => p.split(':')[0]!)))
    tally.set(p, (tally.get(p) ?? 0) + 1);
}
const pct = (n: number) => `${((100 * n) / rows.length).toFixed(1)}%`;
console.log(`${rows.length} texts`);
console.log(`  ${pct(app)} pass the app's checker`);
console.log(`  ${pct(target)} also name the listed pattern`);
for (const [p, n] of [...tally].sort((a, b) => b[1] - a[1])) console.log(`  ${n}\t${p}`);
