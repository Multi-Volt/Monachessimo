/* global process */
// Generates tests/fixtures/perf-games.ndjson: 50 synthetic rated games in
// Lichess NDJSON form, for timing the analysis pipeline. Each game is
// Stockfish self-play at low depth, picking among the top three moves with
// a fixed seed, so games look like human games with real mistakes.
// Usage: node scripts/make-perf-games.mjs
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import { makeSanAndPlay } from 'chessops/san';
import { parseUci } from 'chessops/util';

const require = createRequire(import.meta.url);
const enginePath = require.resolve('stockfish/bin/stockfish-19-lite-single.js');
const engine = require(enginePath)();
let onLine = () => {};
engine.listener = (l) => onLine(l);

function send(cmd, until) {
  return new Promise((resolve) => {
    const lines = [];
    onLine = (l) => {
      lines.push(l);
      if (until(l)) resolve(lines);
    };
    engine.processCommand(cmd);
  });
}

let seed = 20261124;
const rand = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

// Clocks use their own sequence so the moves stay the same as before clocks were added.
let clockSeed = 7;
const clockRand = () => (clockSeed = (clockSeed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;

/**
 * Remaining clock after each ply, in centiseconds, for a 3-minute game with
 * no increment. In two games of three, TestPlayer runs short of time near
 * the end.
 */
function makeClocks(plies, game) {
  const left = [18000, 18000];
  const userSide = game % 2 === 0 ? 0 : 1;
  const hurried = game % 3 === 1 ? -1 : userSide;
  const out = [];
  for (let ply = 0; ply < plies; ply++) {
    const side = ply % 2;
    const share = side === hurried ? 1.9 : 0.8;
    const spend = Math.round((100 + clockRand() * 500) * share * (ply > 20 ? 1.4 : 1));
    left[side] = Math.max(60, left[side] - spend);
    out.push(left[side]);
  }
  return out;
}

await send('uci', (l) => l === 'uciok');
engine.processCommand('setoption name MultiPV value 3');
await send('isready', (l) => l === 'readyok');

const games = [];
for (let g = 0; g < 50; g++) {
  const pos = Chess.default();
  const san = [];
  const plies = 60 + Math.floor(rand() * 40);
  while (san.length < plies && !pos.isEnd()) {
    engine.processCommand(`position fen ${makeFen(pos.toSetup())}`);
    const out = await send('go depth 5', (l) => l.startsWith('bestmove'));
    const moves = new Map();
    for (const l of out) {
      const m = /multipv (\d) .* pv (\S+)/.exec(l);
      if (m) moves.set(Number(m[1]), m[2]);
    }
    const r = rand();
    const pick = r < 0.7 ? 1 : r < 0.9 ? 2 : 3;
    const uci = moves.get(pick) ?? moves.get(1);
    if (!uci) break;
    san.push(makeSanAndPlay(pos, parseUci(uci)));
  }
  const userWhite = g % 2 === 0;
  const opp = { user: { name: `Opponent${g}`, id: `opponent${g}` }, rating: 1500 };
  const me = { user: { name: 'TestPlayer', id: 'testplayer' }, rating: 1500 };
  games.push({
    id: `perf${String(g).padStart(4, '0')}`,
    rated: true,
    variant: 'standard',
    speed: 'blitz',
    status: 'resign',
    createdAt: 1_790_000_000_000 - g * 3_600_000,
    winner: g % 3 === 0 ? 'white' : 'black',
    moves: san.join(' '),
    clock: { initial: 180, increment: 0 },
    clocks: makeClocks(san.length, g),
    players: userWhite ? { white: me, black: opp } : { white: opp, black: me },
  });
  process.stdout.write(`game ${g + 1}: ${san.length} plies\n`);
}
writeFileSync(
  'tests/fixtures/perf-games.ndjson',
  games.map((g) => JSON.stringify(g)).join('\n') + '\n',
);
engine.terminate?.();
process.exit(0);
