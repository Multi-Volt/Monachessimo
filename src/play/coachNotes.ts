// The coach's notes on a judged move, in the second version: what a person
// can see two or three moves ahead, spoken beside the player ("you", "your
// opponent"), with the material result already worked out in points. A
// writer model turns them into a few friendly sentences; it never has to
// count material or look further than the notes do.
//
// The window runs from the move to the payoff: the last capture in the first
// moves of the line, with any recapture that follows at once, or a mate that
// comes soon. A line with no capture shows the move, the reply and the
// player's answer.
import type { Chess } from 'chessops/chess';
import { makeFen } from 'chessops/fen';
import type { Role } from 'chessops/types';
import { fromFen, normalMove, playUci, VALUE } from '../detectors/board';
import { pvToSan } from '../chess/san';
import type { ExplanationRecord } from './record';
import { lineTactics } from '../detectors/lineTactics';
import { checkPhrasing } from './phrasing';
import { sanWords } from '../chess/words';
import { coachVoice, spellMoves } from './voice';

export { coachVoice, sanWords, spellMoves };

/** Half-moves the payoff may take: the move and two moves by each side. */
const WINDOW_PLIES = 5;
/** A mate is shown when it comes within this many half-moves. */
const MATE_PLIES = 9;
/** A line with no capture shows the move, the reply and the player's answer. */
const QUIET_PLIES = 3;
/**
 * A mistake whose cost is not in material within the window is followed
 * this far, to the move where the player is first two points down.
 */
const LOSS_PLIES = 11;

const NAME: Record<Role, string> = {
  pawn: 'pawn',
  knight: 'knight',
  bishop: 'bishop',
  rook: 'rook',
  queen: 'queen',
  king: 'king',
};

const points = (n: number) => `${n} point${n === 1 ? '' : 's'}`;

interface Ply {
  uci: string;
  san: string;
  byPlayer: boolean;
  /** The piece this move takes, if any. */
  took?: Role;
  mate: boolean;
}

/** The line from the move on, played out, until it stops being legal. */
function playOut(r: ExplanationRecord): { plies: Ply[]; start: Chess } {
  const start = fromFen(r.fen);
  const ucis = [r.move.uci, ...r.reply];
  const plies: Ply[] = [];
  let pos = start;
  for (const [i, uci] of ucis.entries()) {
    const m = normalMove(uci);
    const next = playUci(pos, uci);
    if (!m || !next) break;
    // Castling is the king moving onto its own rook in chessops: not a capture.
    const own = pos.board.getColor(m.to) === pos.turn;
    const took = own
      ? undefined
      : (pos.board.getRole(m.to) ??
        (pos.board.getRole(m.from) === 'pawn' && m.to === pos.epSquare ? 'pawn' : undefined));
    plies.push({
      uci,
      san: pvToSan(makeFen(pos.toSetup()), [uci], 1)[0] ?? uci,
      byPlayer: i % 2 === 0,
      ...(took ? { took } : {}),
      mate: next.isCheckmate(),
    });
    pos = next;
  }
  return { plies, start };
}

/** How many half-moves of the line the notes show. */
/**
 * How many half-moves of the line the notes show. `balance[i]` is the
 * player's material lead after i half-moves. `serious` is true for a
 * mistake or a blunder, whose cost the notes must reach.
 */
export function windowLength(
  plies: readonly Ply[],
  balance: readonly number[],
  serious: boolean,
): number {
  const mate = plies.findIndex((p) => p.mate);
  if (mate >= 0 && mate < MATE_PLIES) return mate + 1;
  let end = -1;
  for (let i = 0; i < Math.min(WINDOW_PLIES, plies.length); i++) if (plies[i]!.took) end = i;
  const n = end < 0 ? Math.min(QUIET_PLIES, plies.length) : settle(plies, end + 1);
  if (serious && balance[n]! >= balance[0]!) {
    // Follow the line to where the player gives back two points or more.
    const floor = Math.min(balance[0]!, balance[n]!) - 2;
    const giveBack = balance[n]! - 2;
    for (let k = n + 1; k <= Math.min(LOSS_PLIES, plies.length); k++)
      if (balance[k]! <= Math.max(floor, giveBack)) return settle(plies, k);
    // No loss in reach: show the opponent's next move and the answer to it.
    return Math.min(n + 2, plies.length);
  }
  return n;
}

/** Extends a window that ends on a capture by the recaptures on the same square. */
function settle(plies: readonly Ply[], n: number): number {
  while (
    n < plies.length &&
    plies[n]!.took &&
    plies[n]!.uci.slice(2, 4) === plies[n - 1]!.uci.slice(2, 4)
  )
    n++;
  return n;
}

/** "a knight (3 points) and a pawn (1 point)" */
function listPieces(roles: Role[]): string {
  const parts = roles.map((r) => `a ${NAME[r]} (${points(VALUE[r])})`);
  return parts.length <= 1
    ? (parts[0] ?? '')
    : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** Where the player stands in material, in words. */
function standing(n: number): string {
  if (n === 0) return 'even in material';
  return `${points(Math.abs(n))} ${n > 0 ? 'ahead' : 'behind'}`;
}

/** One line of "What happens next", from the narration when there is one. */
function stepText(r: ExplanationRecord, i: number, p: Ply): string {
  const narrated = r.line[i]?.uci === p.uci ? r.line[i]!.text : undefined;
  const who = p.byPlayer ? 'You play' : 'Your opponent plays';
  if (!narrated) return `${who} ${p.san}.${p.mate ? ' Checkmate.' : ''}`;
  // Narration of a mate is bare notation, "Qg7#. Checkmate."
  const bare = narrated.startsWith(p.san) ? `${who} ${narrated}` : narrated;
  return coachVoice(bare);
}

/** The coach's notes for a judged move. */
export function coachNotes(r: ExplanationRecord): string {
  const { plies, start } = playOut(r);
  const balance = [materialOf(start, r.side)];
  let pos = start;
  for (const p of plies) {
    pos = playUci(pos, p.uci) ?? pos;
    balance.push(materialOf(pos, r.side));
  }
  const serious = r.verdict.class === 'mistake' || r.verdict.class === 'blunder';
  const n = windowLength(plies, balance, serious);
  const shown = plies.slice(0, n);
  const out = [`Your move: ${r.move.san}. Verdict: ${article(r.verdict.class)}.`];

  // Tactics come from the line itself, each confirmed by what it wins, with
  // a sentence from the board. The older cause sentence is used only when
  // no tactic is found, and only when the line does not contradict it.
  const paysOff = shown.some((p) => p.mate) || balance[n]! <= balance[0]! - 2;
  const tactics = paysOff
    ? lineTactics(
        start,
        plies.map((p) => p.uci),
        n,
      ).slice(0, 2)
    : [];
  const loses = balance[n]! < balance[0]!;
  const cause =
    !tactics.length &&
    r.sentences.cause &&
    (loses || !/lose material|for free/.test(r.sentences.cause))
      ? r.sentences.cause
      : undefined;
  const names = tactics.map((t) => `a ${t.kind}`);
  if (!names.length && shown.some((p) => p.mate && !p.byPlayer)) names.push('a forced mate');
  if (names.length) out.push(`Patterns: ${names.join(', ')}.`);
  for (const t of tactics) out.push(`How: ${t.text}`);
  if (cause) out.push(`Why: ${coachVoice(cause)}`);
  // Records exported before threats had to be concrete can hold a quiet
  // "threat"; only a capture, a check or a mate is one.
  if (
    r.threat &&
    /[x+#]/.test(r.threat.san) &&
    r.sentences.points.some((p) => p.startsWith('This move ignores'))
  )
    out.push(`Ignored threat: before your move, your opponent threatened ${r.threat.san}.`);

  if (shown.length) {
    out.push('What happens next:');
    for (const [i, p] of shown.entries()) out.push(`- ${stepText(r, i, p)}`);
  }

  const mate = shown.find((p) => p.mate);
  if (mate) {
    const moves = Math.ceil(shown.length / 2);
    out.push(
      mate.byPlayer
        ? 'Result: you give checkmate.'
        : `Result: your opponent gives checkmate${moves > 1 ? ` in ${moves} moves` : ''}.`,
    );
    return out.join('\n');
  }

  const lost = shown.filter((p) => !p.byPlayer && p.took).map((p) => p.took!);
  const won = shown.filter((p) => p.byPlayer && p.took).map((p) => p.took!);
  const before = balance[0]!;
  const after = balance[n]!;
  const change = after - before;
  if (!lost.length && !won.length) {
    out.push('Result: no material changes hands.');
    // Nothing a beginner can see goes wrong: say so rather than invent a reason.
    if (!serious && !cause) {
      out.push("Coach's take: the move is okay, just not the best; there were better options.");
      return out.join('\n');
    }
  } else {
    const parts = [
      ...(lost.length ? [`you lose ${listPieces(lost)}`] : []),
      ...(won.length ? [`you win ${listPieces(won)}`] : []),
    ];
    const net =
      change === 0
        ? 'so it is an even trade'
        : `so you are ${points(Math.abs(change))} ${change < 0 ? 'down' : 'up'}`;
    out.push(`Result: ${parts.join(' and ')}, ${net}.`);
  }
  if (!serious && change >= 0 && !cause) {
    if (change !== 0)
      out.push(
        `Where it leaves you: you were ${standing(before)}, and now you are ${standing(after)}.`,
      );
    out.push("Coach's take: the move is okay, just not the best; there were better options.");
    return out.join('\n');
  }
  const hidden = serious && change >= 0;
  if (change !== 0)
    out.push(
      `Where it leaves you: you were ${standing(before)}, and now you are ${standing(after)}${hidden ? ', but your position gets much harder' : ''}.`,
    );
  else if (serious)
    // The engine sees a cost the line does not show in material within reach.
    out.push(
      'Where it leaves you: material stays level for now, but your position gets much harder.',
    );
  return out.join('\n');
}

const article = (c: string | null) => (!c ? 'fine' : `${c === 'inaccuracy' ? 'an' : 'a'} ${c}`);

/** The player's material minus the opponent's, in points. */
function materialOf(pos: Chess, side: Chess['turn']): number {
  let sum = 0;
  for (const sq of pos.board.occupied) {
    const role = pos.board.getRole(sq)!;
    if (role === 'king') continue;
    sum += (pos.board.getColor(sq) === side ? 1 : -1) * VALUE[role];
  }
  return sum;
}

/**
 * Notes or a text in the coach's voice, moved back to the opponent's voice
 * the phrasing checker reads: "your opponent's knight" is "my knight".
 */
function opponentVoice(text: string): string {
  return text
    .replace(/^Your move: (\S+)\. Verdict: (an? \w+|fine)\./m, '$1 is $2.')
    .replace(
      /before your move, your opponent threatened (\S+)/g,
      'This move ignores my threat of $1',
    )
    .replace(/\bYour opponent plays\b/g, 'I play')
    .replace(/\byour opponent plays\b/g, 'I play')
    .replace(/\b[Yy]our opponent takes back\b/g, 'I take back')
    .replace(/\b[Yy]our opponent answers\b/g, 'I answer')
    .replace(/\bYour opponent['’]s\b/g, 'My')
    .replace(/\byour opponent['’]s\b/g, 'my')
    .replace(/\bYour opponent\b/g, 'I')
    .replace(/\byour opponent\b/g, 'me')
    .replace(/\btheir\b/g, 'my');
}

/**
 * Checks a coach text against its notes: the phrasing checker's rules on
 * facts, owners, moves and copy, plus material in points, never in pawns.
 * Returns the problems; an empty list passes.
 */
export function checkCoachText(notes: string, text: string): string[] {
  // A checkmate is always of the player's king, though the notes do not say so.
  let facts = /Checkmate\./.test(notes) ? `${notes}\nFact: your king is checkmated.` : notes;
  // A promotion in notation names the new piece: "d8=Q" is a queen.
  for (const m of notes.matchAll(/=([QRBN])/g))
    facts += `\nFact: a pawn becomes a ${{ Q: 'queen', R: 'rook', B: 'bishop', N: 'knight' }[m[1]!]}.`;
  const problems = checkPhrasing(opponentVoice(facts), opponentVoice(text));
  problems.push(...wrongMaterialClaims(notes, text));
  problems.push(...wrongMoveOrOwner(notes, text));
  if (
    /\b(\d+|one|two|three|four|five|six|seven|eight|nine|ten) pawns? (up|down|ahead|behind|of)\b/i.test(
      text,
    )
  )
    problems.push('units: pawns');
  return problems;
}

const ROLES = 'pawn|knight|bishop|rook|queen';

/** Pieces the Result line says the player loses and wins. */
function resultRoles(notes: string): { lose: Set<string>; win: Set<string> } {
  const line = /^Result: (.*)$/m.exec(notes)?.[1] ?? '';
  const part = (verb: string) => {
    const span = new RegExp(`you ${verb} (.*?)(?: and you |, so|$)`).exec(line)?.[1] ?? '';
    return new Set([...span.matchAll(new RegExp(`\\b(${ROLES})\\b`, 'g'))].map((m) => m[1]!));
  };
  const lose = part('lose');
  const win = part('win');
  // Captures told in the line count too, as in mate notes with no tally.
  const role = `(${ROLES})`;
  for (const m of notes.matchAll(new RegExp(`^- Your \\w+ takes your opponent's ${role}`, 'gm')))
    win.add(m[1]!);
  for (const m of notes.matchAll(new RegExp(`^- Your opponent's \\w+ takes your ${role}`, 'gm')))
    lose.add(m[1]!);
  return { lose, win };
}

/**
 * "Wins a queen" and "you lose a rook" in a text must match the Result line:
 * a writer that turns "attacks your queen" into "wins a queen" is wrong.
 */
function wrongMaterialClaims(notes: string, text: string): string[] {
  const { lose, win } = resultRoles(notes);
  const out: string[] = [];
  const t = text.toLowerCase();
  const won = new RegExp(
    `\\b(?:win|wins|won|winning|grabs?) (?:a|an|the|your opponent['’]s|their) (${ROLES})`,
    'g',
  );
  for (const m of t.matchAll(won)) if (!win.has(m[1]!)) out.push(`claim: wins ${m[1]}`);
  const lost = new RegExp(
    `\\b(?:lose|loses|lost|losing|give away|gives away) (?:a|an|your) (${ROLES})`,
    'g',
  );
  for (const m of t.matchAll(lost)) if (!lose.has(m[1]!)) out.push(`claim: loses ${m[1]}`);
  // "For free" only when the player gets nothing back.
  const result = /^Result: (.*)$/m.exec(notes)?.[1] ?? '';
  if (/\bfor free\b/.test(t) && /even trade|no material|points? up/.test(result))
    out.push('claim: for free');
  return out;
}

/**
 * The text must name the player's move as the notes do, say a checkmate is
 * one, and give "your knight on d5" the owner the notes give the piece on
 * that square.
 */
function wrongMoveOrOwner(notes: string, text: string): string[] {
  const out: string[] = [];
  const t = text.toLowerCase();
  const san = /^Your move: (\S+?)\. Verdict/m.exec(notes)?.[1];
  if (san) {
    // "knight takes d5", without the check or the promotion's new piece.
    const words = sanWords(san, true).replace(/ with check$|, becoming .*$/, '');
    const named = /^castles/.test(words) ? /castl/.test(t) : t.includes(words);
    if (!named) out.push(`move: yours, ${words}`);
  }
  if (/Checkmate\.|gives checkmate/.test(notes) && !/\bcheckmate|\bmate\b/.test(t))
    out.push('mate: not said');
  const spelled = spellMoves(notes);
  const said = (owner: string, role: string, square: string) =>
    new RegExp(`(?<!opponent's )\\b${owner} ${role} on ${square}\\b`, 'i').test(spelled);
  const owners = new RegExp(
    `\\b(your opponent['’]s|their|your) (${ROLES}) on ([a-h][1-8])\\b`,
    'g',
  );
  for (const m of t.matchAll(owners)) {
    const [, who, role, square] = m;
    const mine = who === 'your';
    const right = mine ? said('your', role!, square!) : said("your opponent's", role!, square!);
    const wrong = mine ? said("your opponent's", role!, square!) : said('your', role!, square!);
    if (wrong && !right) out.push(`owner: ${who} ${role} on ${square}`);
  }
  return out;
}
