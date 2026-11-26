// Maia-2: the move a player of a given rating makes, from one network that
// takes both players' ratings, including below 1100. The model is Maia-2
// rapid (CSSLab, MIT), converted by scripts/convert-maia2.py and offered as
// a download. This runs its move head in plain TypeScript: 18 planes from the
// side to move's view, five residual blocks of 256 filters, a convolution to
// eight 64-square tokens, and two transformer layers whose queries shift with
// the ratings.
import type { Chess } from 'chessops/chess';
import { makeSquare } from 'chessops/util';
import type { Role, Square } from 'chessops/types';

interface Tensor {
  shape: number[];
  /** Weights, with int8 matrices already scaled back to floats. */
  data: Float32Array;
}

export interface Maia2Net {
  tensors: Map<string, Tensor>;
  moves: string[];
  index: Map<string, number>;
}

/** Maia-2's rating buckets: below 1100, each hundred to 1999, then 2000 and up. */
export function eloBucket(rating: number): number {
  if (rating < 1100) return 0;
  if (rating >= 2000) return 10;
  return 1 + Math.floor((rating - 1100) / 100);
}

export function parseMaia2(buf: ArrayBuffer, moves: string[]): Maia2Net {
  const view = new DataView(buf);
  const len = view.getUint32(0, true);
  const head = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 4, len))) as {
    tensors: { name: string; shape: number[]; kind: 'q8' | 'f32'; offset: number }[];
  };
  const base = 4 + len + ((4 - ((4 + len) % 4)) % 4);
  const tensors = new Map<string, Tensor>();
  for (const t of head.tensors) {
    const size = t.shape.reduce((a, b) => a * b, 1);
    const at = base + t.offset;
    let data: Float32Array;
    if (t.kind === 'f32') data = new Float32Array(buf.slice(at, at + 4 * size));
    else {
      const rows = t.shape[0]!;
      const cols = size / rows;
      const scale = new Float32Array(buf.slice(at, at + 4 * rows));
      const q = new Int8Array(buf, at + 4 * rows, size);
      data = new Float32Array(size);
      for (let r = 0; r < rows; r++) {
        const s = scale[r]!;
        for (let c = 0; c < cols; c++) data[r * cols + c] = q[r * cols + c]! * s;
      }
    }
    tensors.set(t.name, { shape: t.shape, data });
  }
  return { tensors, moves, index: new Map(moves.map((m, i) => [m, i])) };
}

const ROLES: Role[] = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

/**
 * The 18 planes, as Maia-2's board_to_tensor on a board mirrored so the side
 * to move is White: White's pieces, Black's pieces, a full turn plane,
 * castling rights (White's king side, queen side, then Black's), en passant.
 */
export function encode2(pos: Chess): Float32Array {
  const out = new Float32Array(18 * 64);
  const black = pos.turn === 'black';
  const sq = (s: Square) => (black ? s ^ 56 : s);
  const us = pos.turn;
  const them = black ? 'white' : 'black';
  for (const [r, role] of ROLES.entries()) {
    for (const s of pos.board.pieces(us, role)) out[r * 64 + sq(s)] = 1;
    for (const s of pos.board.pieces(them, role)) out[(6 + r) * 64 + sq(s)] = 1;
  }
  out.fill(1, 12 * 64, 13 * 64);
  const rook = pos.castles.rook;
  if (rook[us].h !== undefined) out.fill(1, 13 * 64, 14 * 64);
  if (rook[us].a !== undefined) out.fill(1, 14 * 64, 15 * 64);
  if (rook[them].h !== undefined) out.fill(1, 15 * 64, 16 * 64);
  if (rook[them].a !== undefined) out.fill(1, 16 * 64, 17 * 64);
  // chessops keeps an en passant square only when a pawn can take there.
  if (pos.epSquare !== undefined) out[17 * 64 + sq(pos.epSquare)] = 1;
  return out;
}

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

function conv(x: Float32Array, w: Tensor, b: Tensor, relu: boolean, skip?: Float32Array) {
  const [outC, inC] = w.shape as [number, number];
  const out = new Float32Array(outC * 64);
  const W = w.data;
  for (let o = 0; o < outC; o++) {
    const acc = out.subarray(o * 64, o * 64 + 64);
    acc.fill(b.data[o]!);
    for (let i = 0; i < inC; i++) {
      const src = i * 64;
      const wo = (o * inC + i) * 9;
      for (let k = 0; k < 9; k++) {
        const wv = W[wo + k]!;
        if (wv === 0) continue;
        const nb = k * 64;
        for (let s = 0; s < 64; s++) {
          const n = NEIGHBOUR[nb + s]!;
          if (n >= 0) acc[s]! += wv * x[src + n]!;
        }
      }
    }
    if (skip) for (let s = 0; s < 64; s++) acc[s]! += skip[o * 64 + s]!;
    if (relu) for (let s = 0; s < 64; s++) if (acc[s]! < 0) acc[s] = 0;
  }
  return out;
}

/** y = x W^T + b for each of `n` rows of x; W is [out][in]. */
function linear(x: Float32Array, n: number, w: Tensor, b?: Tensor): Float32Array {
  const [outD, inD] = w.shape as [number, number];
  const y = new Float32Array(n * outD);
  const W = w.data;
  for (let r = 0; r < n; r++)
    for (let o = 0; o < outD; o++) {
      let v = b ? b.data[o]! : 0;
      const wo = o * inD;
      const xo = r * inD;
      for (let i = 0; i < inD; i++) v += W[wo + i]! * x[xo + i]!;
      y[r * outD + o] = v;
    }
  return y;
}

function layerNorm(x: Float32Array, n: number, w: Tensor, b: Tensor): Float32Array {
  const d = w.shape[0]!;
  const y = new Float32Array(x.length);
  for (let r = 0; r < n; r++) {
    let mean = 0;
    for (let i = 0; i < d; i++) mean += x[r * d + i]!;
    mean /= d;
    let v = 0;
    for (let i = 0; i < d; i++) v += (x[r * d + i]! - mean) ** 2;
    const inv = 1 / Math.sqrt(v / d + 1e-5);
    for (let i = 0; i < d; i++)
      y[r * d + i] = (x[r * d + i]! - mean) * inv * w.data[i]! + b.data[i]!;
  }
  return y;
}

/** The error function, to 1.5e-7, for GELU. */
function erf(x: number): number {
  const s = Math.sign(x);
  const a = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * a);
  const y =
    1 -
    ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) *
      t *
      Math.exp(-a * a);
  return s * y;
}

const TOKENS = 8;
const HEADS = 16;
const HEAD_DIM = 64;

/** The move logits for the side to move, in Maia-2's move order. */
export function forward2(net: Maia2Net, planes: Float32Array, self: number, oppo: number) {
  const T = (k: string) => net.tensors.get(k)!;
  let x = conv(planes, T('cnn.in.w'), T('cnn.in.b'), true);
  for (let i = 0; i < 5; i++) {
    const a = conv(x, T(`cnn.${i}.1.w`), T(`cnn.${i}.1.b`), true);
    x = conv(a, T(`cnn.${i}.2.w`), T(`cnn.${i}.2.b`), true, x);
  }
  // Eight channels of 64 squares become eight tokens.
  const tokens = conv(x, T('cnn.last.w'), T('cnn.last.b'), false);
  const D = T('patch.w').shape[0]!;
  let h = layerNorm(
    linear(tokens, TOKENS, T('patch.w'), T('patch.b')),
    TOKENS,
    T('patch.ln.w'),
    T('patch.ln.b'),
  );
  const pos = T('pos').data;
  for (let i = 0; i < h.length; i++) h[i]! += pos[i]!;

  const elo = T('elo');
  const E = elo.shape[1]!;
  const eloEmb = new Float32Array(2 * E);
  eloEmb.set(elo.data.subarray(self * E, (self + 1) * E), 0);
  eloEmb.set(elo.data.subarray(oppo * E, (oppo + 1) * E), E);

  for (let L = 0; L < 2; L++) {
    const n = layerNorm(h, TOKENS, T(`t${L}.ln.w`), T(`t${L}.ln.b`));
    const qkv = linear(n, TOKENS, T(`t${L}.qkv.w`));
    const shift = linear(eloEmb, 1, T(`t${L}.eloq.w`));
    const inner = HEADS * HEAD_DIM;
    const att = new Float32Array(TOKENS * inner);
    const scale = 1 / Math.sqrt(HEAD_DIM);
    for (let hd = 0; hd < HEADS; hd++) {
      for (let i = 0; i < TOKENS; i++) {
        const scores = new Float32Array(TOKENS);
        let max = -Infinity;
        for (let j = 0; j < TOKENS; j++) {
          let s = 0;
          for (let d = 0; d < HEAD_DIM; d++) {
            const c = hd * HEAD_DIM + d;
            s += (qkv[i * 3 * inner + c]! + shift[c]!) * qkv[j * 3 * inner + inner + c]!;
          }
          scores[j] = s * scale;
          max = Math.max(max, scores[j]!);
        }
        let sum = 0;
        for (let j = 0; j < TOKENS; j++) sum += scores[j] = Math.exp(scores[j]! - max);
        for (let d = 0; d < HEAD_DIM; d++) {
          const c = hd * HEAD_DIM + d;
          let v = 0;
          for (let j = 0; j < TOKENS; j++)
            v += (scores[j]! / sum) * qkv[j * 3 * inner + 2 * inner + c]!;
          att[i * inner + c] = v;
        }
      }
    }
    const o = linear(att, TOKENS, T(`t${L}.out.w`), T(`t${L}.out.b`));
    for (let i = 0; i < h.length; i++) h[i]! += o[i]!;
    const f = layerNorm(h, TOKENS, T(`t${L}.ff.ln.w`), T(`t${L}.ff.ln.b`));
    const f1 = linear(f, TOKENS, T(`t${L}.ff1.w`), T(`t${L}.ff1.b`));
    for (let i = 0; i < f1.length; i++) f1[i] = 0.5 * f1[i]! * (1 + erf(f1[i]! / Math.SQRT2));
    const f2 = linear(f1, TOKENS, T(`t${L}.ff2.w`), T(`t${L}.ff2.b`));
    for (let i = 0; i < h.length; i++) h[i]! += f2[i]!;
  }
  h = layerNorm(h, TOKENS, T('tnorm.w'), T('tnorm.b'));
  const mean = new Float32Array(D);
  for (let t = 0; t < TOKENS; t++) for (let d = 0; d < D; d++) mean[d]! += h[t * D + d]! / TOKENS;
  return linear(layerNorm(mean, 1, T('last.w'), T('last.b')), 1, T('fc.w'), T('fc.b'));
}

/**
 * The probability of each legal move in `pos` for a player of `rating`
 * facing one of `opponent`, best first, as UCI moves.
 */
export function predict2(
  net: Maia2Net,
  pos: Chess,
  rating: number,
  opponent: number,
): { uci: string; p: number; logit: number }[] {
  const logits = forward2(net, encode2(pos), eloBucket(rating), eloBucket(opponent));
  const black = pos.turn === 'black';
  const view = (s: Square) => makeSquare(black ? s ^ 56 : s);
  const king = pos.board.kingOf(pos.turn);
  const legal: { uci: string; logit: number }[] = [];
  for (const [from, dests] of pos.allDests()) {
    for (const to of dests) {
      // chessops gives castling as the king taking its rook; Maia-2 and UCI
      // write the king's two-square step.
      const castle = from === king && pos.board[pos.turn].has(to);
      const target = castle ? ((to & 7) > (from & 7) ? from + 2 : from - 2) : to;
      const plain = `${makeSquare(from)}${makeSquare(target)}`;
      const seen = `${view(from)}${view(target)}`;
      const promo = pos.board.getRole(from) === 'pawn' && (target >> 3 === 7 || target >> 3 === 0);
      for (const p of promo ? ['q', 'r', 'b', 'n'] : ['']) {
        const i = net.index.get(seen + p);
        if (i !== undefined && !legal.some((l) => l.uci === plain + p))
          legal.push({ uci: plain + p, logit: logits[i]! });
      }
    }
  }
  const max = Math.max(...legal.map((l) => l.logit));
  const exp = legal.map((l) => Math.exp(l.logit - max));
  const sum = exp.reduce((a, b) => a + b, 0);
  return legal
    .map((l, i) => ({ uci: l.uci, p: exp[i]! / sum, logit: l.logit }))
    .sort((a, b) => b.p - a.p);
}
