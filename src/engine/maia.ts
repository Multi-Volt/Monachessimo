// Maia: the move a human player of a given rating would make. The networks
// are Maia 1100 to 1900 (CSSLab, GPL-3.0), lc0 networks converted by
// scripts/convert-maia.py into public/maia/. This runs the network's policy
// in plain TypeScript: 112 input planes from the last eight positions,
// residual blocks with squeeze-excitation, and lc0's convolutional policy
// head, read through lc0's policy map. Maia is meant to be read at one node,
// with no search: the policy alone is the prediction.
import type { Chess } from 'chessops/chess';
import { makeSquare } from 'chessops/util';
import type { Color, Role, Square } from 'chessops/types';

export const MAIA_RATINGS = [1100, 1200, 1300, 1400, 1500, 1600, 1700, 1800, 1900] as const;

export interface MaiaNet {
  filters: number;
  blocks: number;
  seHidden: number;
  policyPlanes: number;
  weights: Float32Array;
}

export interface MaiaTables {
  /** lc0's 1858 policy moves, from the side to move's view. */
  moves: string[];
  /** For each of the 73x64 policy outputs, the index of its move or -1. */
  map: number[];
}

/** Half floats, as the converter stores them. */
function halfToFloat(h: number): number {
  const s = h & 0x8000 ? -1 : 1;
  const e = (h >> 10) & 0x1f;
  const f = h & 0x3ff;
  if (e === 0) return s * 2 ** -14 * (f / 1024);
  if (e === 31) return f ? NaN : s * Infinity;
  return s * 2 ** (e - 15) * (1 + f / 1024);
}

export function parseNet(buf: ArrayBuffer): MaiaNet {
  const view = new DataView(buf);
  const len = view.getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, len))) as Omit<
    MaiaNet,
    'weights'
  >;
  const n = (buf.byteLength - 4 - len) / 2;
  const weights = new Float32Array(n);
  for (let i = 0; i < n; i++) weights[i] = halfToFloat(view.getUint16(4 + len + 2 * i, true));
  return { ...header, weights };
}

const ROLES: Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
const PLANES = 112;

/** A position's key for repetitions: the board, the side to move and castling. */
function key(p: Chess): string {
  return `${[...p.board.occupied].map((s) => `${s}${p.board.getColor(s)![0]}${p.board.getRole(s)![0]}`).join('')}${p.turn}${p.castles.castlingRights.lo}:${p.castles.castlingRights.hi}`;
}

/**
 * The 112 input planes for the last position of `history`, oldest first,
 * as lc0's classical input: eight positions of 13 planes each, our pieces,
 * their pieces and a repetition plane, seen from the side to move, then
 * castling rights, the side to move, the fifty-move count, zeros and ones.
 * A game that did not start from the usual position repeats its first
 * position to fill the history, as lc0 does.
 */
export function encode(history: Chess[], fromStart: boolean): Float32Array {
  const out = new Float32Array(PLANES * 64);
  const now = history[history.length - 1]!;
  const us: Color = now.turn;
  const them: Color = us === 'white' ? 'black' : 'white';
  const flip = (s: Square) => (us === 'black' ? s ^ 56 : s);
  const keys = history.map(key);
  for (let i = 0; i < 8; i++) {
    let idx = history.length - 1 - i;
    if (idx < 0) {
      if (fromStart) break;
      idx = 0;
    }
    const p = history[idx]!;
    const base = i * 13 * 64;
    for (const [c, color] of [us, them].entries())
      for (const [r, role] of ROLES.entries())
        for (const s of p.board.pieces(color, role)) out[base + (c * 6 + r) * 64 + flip(s)] = 1;
    if (keys.slice(0, idx).includes(keys[idx]!)) out.fill(1, base + 12 * 64, base + 13 * 64);
  }
  const aux = 104 * 64;
  const rook = now.castles.rook;
  if (rook[us].a !== undefined) out.fill(1, aux, aux + 64);
  if (rook[us].h !== undefined) out.fill(1, aux + 64, aux + 128);
  if (rook[them].a !== undefined) out.fill(1, aux + 128, aux + 192);
  if (rook[them].h !== undefined) out.fill(1, aux + 192, aux + 256);
  if (us === 'black') out.fill(1, aux + 256, aux + 320);
  out.fill(now.halfmoves, aux + 320, aux + 384);
  out.fill(1, aux + 448, aux + 512);
  return out;
}

// For each square and each of the nine 3x3 kernel cells, the neighbouring
// square or -1 off the board: rank is the row, file the column.
const NEIGHBOUR = (() => {
  const t = new Int8Array(9 * 64);
  for (let k = 0; k < 9; k++)
    for (let s = 0; s < 64; s++) {
      const r = (s >> 3) + Math.floor(k / 3) - 1;
      const f = (s & 7) + (k % 3) - 1;
      t[k * 64 + s] = r >= 0 && r < 8 && f >= 0 && f < 8 ? r * 8 + f : -1;
    }
  return t;
})();

/** A 3x3 convolution, weights [out][in][3][3] from `at`, then its bias. */
function conv(
  input: Float32Array,
  inC: number,
  outC: number,
  w: Float32Array,
  at: number,
  relu: boolean,
): { out: Float32Array; next: number } {
  const out = new Float32Array(outC * 64);
  const bias = at + outC * inC * 9;
  for (let o = 0; o < outC; o++) {
    const acc = out.subarray(o * 64, o * 64 + 64);
    acc.fill(w[bias + o]!);
    for (let i = 0; i < inC; i++) {
      const src = i * 64;
      const wo = at + (o * inC + i) * 9;
      for (let k = 0; k < 9; k++) {
        const wv = w[wo + k]!;
        if (wv === 0) continue;
        const nb = k * 64;
        for (let s = 0; s < 64; s++) {
          const n = NEIGHBOUR[nb + s]!;
          if (n >= 0) acc[s]! += wv * input[src + n]!;
        }
      }
    }
    if (relu) for (let s = 0; s < 64; s++) if (acc[s]! < 0) acc[s] = 0;
  }
  return { out, next: bias + outC };
}

/** The network's 80x64 policy outputs for the input planes. */
export function forward(net: MaiaNet, planes: Float32Array): Float32Array {
  const C = net.filters;
  const H = net.seHidden;
  const w = net.weights;
  let { out: x, next } = conv(planes, PLANES, C, w, 0, true);
  for (let b = 0; b < net.blocks; b++) {
    const a = conv(x, C, C, w, next, true);
    const c = conv(a.out, C, C, w, a.next, false);
    next = c.next;
    // Squeeze-excitation: each channel's mean, through two dense layers,
    // gives a scale and a shift for that channel.
    const pooled = new Float32Array(C);
    for (let i = 0; i < C; i++) {
      let sum = 0;
      for (let s = 0; s < 64; s++) sum += c.out[i * 64 + s]!;
      pooled[i] = sum / 64;
    }
    const w1 = next;
    const b1 = w1 + H * C;
    const w2 = b1 + H;
    const b2 = w2 + 2 * C * H;
    next = b2 + 2 * C;
    const hidden = new Float32Array(H);
    for (let j = 0; j < H; j++) {
      let v = w[b1 + j]!;
      for (let i = 0; i < C; i++) v += w[w1 + j * C + i]! * pooled[i]!;
      hidden[j] = Math.max(0, v);
    }
    const y = new Float32Array(C * 64);
    for (let i = 0; i < C; i++) {
      let g = w[b2 + i]!;
      let be = w[b2 + C + i]!;
      for (let j = 0; j < H; j++) {
        g += w[w2 + i * H + j]! * hidden[j]!;
        be += w[w2 + (C + i) * H + j]! * hidden[j]!;
      }
      const scale = 1 / (1 + Math.exp(-g));
      for (let s = 0; s < 64; s++) {
        const v = scale * c.out[i * 64 + s]! + be + x[i * 64 + s]!;
        y[i * 64 + s] = v > 0 ? v : 0;
      }
    }
    x = y;
  }
  const p1 = conv(x, C, C, w, next, true);
  return conv(p1.out, C, net.policyPlanes, w, p1.next, false).out;
}

/**
 * The probability of each legal move in the last position of `history`,
 * best first, as UCI moves ("e1g1" for castling), and the share of the
 * network's policy that fell on legal moves, close to 1 for a sound reading.
 */
export function predict(
  net: MaiaNet,
  tables: MaiaTables,
  history: Chess[],
  fromStart: boolean,
): { moves: { uci: string; p: number }[]; legalShare: number } {
  const pos = history[history.length - 1]!;
  const raw = forward(net, encode(history, fromStart));
  const logits = new Float32Array(tables.moves.length).fill(-Infinity);
  for (let i = 0; i < tables.map.length; i++) {
    const m = tables.map[i]!;
    if (m >= 0) logits[m] = raw[i]!;
  }
  const index = new Map(tables.moves.map((m, i) => [m, i]));
  const black = pos.turn === 'black';
  const view = (s: Square) => makeSquare(black ? s ^ 56 : s);
  const king = pos.board.kingOf(pos.turn);
  const legal: { uci: string; logit: number }[] = [];
  for (const [from, dests] of pos.allDests()) {
    for (const to of dests) {
      const role = pos.board.getRole(from);
      // lc0 writes castling as the king taking its own rook.
      const castle =
        from === king && (pos.board[pos.turn].has(to) || Math.abs((to & 7) - (from & 7)) === 2);
      let target = to;
      if (castle && !pos.board[pos.turn].has(to)) target = (to & 7) > (from & 7) ? to + 1 : to - 2;
      const uciTo = castle ? ((target & 7) > (from & 7) ? from + 2 : from - 2) : to;
      const base = `${view(from)}${view(target)}`;
      const plain = `${makeSquare(from)}${makeSquare(uciTo)}`;
      if (role === 'pawn' && (to >> 3 === 7 || to >> 3 === 0)) {
        // Knight promotion is the plain move in lc0's list.
        for (const [suffix, nn] of [
          ['q', `${base}q`],
          ['r', `${base}r`],
          ['b', `${base}b`],
          ['n', base],
        ] as const) {
          const i = index.get(nn);
          if (i !== undefined) legal.push({ uci: plain + suffix, logit: logits[i]! });
        }
        continue;
      }
      const i = index.get(base);
      if (i !== undefined && !legal.some((l) => l.uci === plain))
        legal.push({ uci: plain, logit: logits[i]! });
    }
  }
  const max = Math.max(...legal.map((l) => l.logit));
  const exp = legal.map((l) => Math.exp(l.logit - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  let all = 0;
  for (const l of logits) if (l > -Infinity) all += Math.exp(l - max);
  return {
    moves: legal.map((l, i) => ({ uci: l.uci, p: exp[i]! / sum })).sort((a, b) => b.p - a.p),
    legalShare: sum / all,
  };
}
