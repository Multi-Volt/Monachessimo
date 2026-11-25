import type { ExplanationRecord } from './record';

/**
 * The input of the phrasing model, and the only facts its text may use: the
 * template sentences of a record, in reading order. Training and the app
 * build it with this one function.
 */
export function factSheet(r: ExplanationRecord): string {
  const out = [r.sentences.headline];
  if (r.sentences.cause) out.push(`Why: ${r.sentences.cause}`);
  for (const p of r.sentences.points) {
    if (p === r.sentences.cause) continue;
    out.push(`Fact: ${opponentVoice(p).replace(/: [^:]*\.$/, '.')}`);
  }
  if (r.line.length) {
    out.push('What happens next:');
    for (const s of r.line) out.push(`- ${s.text}`);
  }
  if (r.reason && r.reason.kind !== 'unknown') out.push(`Long term: ${r.reason.text}`);
  return out.join('\n');
}

/** The verdict points speak of "your opponent"; the coach is the opponent. */
function opponentVoice(text: string): string {
  return text
    .replace(/^Your opponent's best answer is/, 'My best answer is')
    .replace(/^Your opponent answers/, 'I answer');
}

const SAN = /\b(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?)[+#]?/g;
const SQUARE = /^[a-h][1-8]$/;
const NUMBER = /\b\d+(?:\.\d+)?\b/g;
const WORD_NUMBERS: Record<string, string> = {
  one: '1',
  two: '2',
  three: '3',
  four: '4',
  five: '5',
  six: '6',
  seven: '7',
  eight: '8',
  nine: '9',
  ten: '10',
  eleven: '11',
  twelve: '12',
  thirteen: '13',
  fourteen: '14',
  fifteen: '15',
  sixteen: '16',
  seventeen: '17',
  eighteen: '18',
  nineteen: '19',
  twenty: '20',
};
const PIECES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
const ROLE_OF: Record<string, string> = {
  K: 'king',
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
};
/** Pattern words: each needs the same word in the facts. */
const PATTERNS = [
  'blunder',
  'mistake',
  'inaccuracy',
  'fork',
  'pin',
  'skewer',
  'mate',
  'checkmate',
  'back rank',
  'discovered',
  'sacrifice',
  'trap',
  'promot',
  'en passant',
  'castl',
  'stalemate',
  'zugzwang',
  'outpost',
  'isolated',
  'doubled',
  'backward',
  'passed',
];
/** Words that add nothing, from the copy rules. */
const FILLER = [
  'great',
  "let's",
  'unfortunately',
  'crucial',
  'simply',
  'remember',
  'note that',
  'essentially',
  'basically',
  'overall',
  'in summary',
  'important',
  'key ',
  'definitely',
  'clearly',
  'obviously',
  'actually',
];

export interface PhrasingFacts {
  sans: Set<string>;
  squares: Set<string>;
  numbers: Set<string>;
  pieces: Set<string>;
  patterns: Set<string>;
}

const stripCheck = (s: string) => s.replace(/[+#]$/, '');

/** What a text names: moves, squares, numbers, pieces and pattern words. */
function named(text: string): PhrasingFacts {
  const sans = new Set<string>();
  const squares = new Set<string>();
  const pieces = new Set<string>();
  let rest = text;
  for (const m of text.match(SAN) ?? []) {
    const s = stripCheck(m);
    if (SQUARE.test(s)) squares.add(s);
    else {
      sans.add(s);
      const role = ROLE_OF[s[0]!];
      if (role) pieces.add(role);
      else if (!s.startsWith('O-O')) pieces.add('pawn');
    }
    for (const sq of s.match(/[a-h][1-8]/g) ?? []) squares.add(sq);
    rest = rest.replace(m, ' ');
  }
  const lower = rest.toLowerCase();
  const numbers = new Set(lower.match(NUMBER) ?? []);
  for (const [w, n] of Object.entries(WORD_NUMBERS))
    if (new RegExp(`\\b${w}\\b`).test(lower)) numbers.add(n);
  for (const p of PIECES) if (new RegExp(`\\b${p}s?\\b`).test(lower)) pieces.add(p);
  const patterns = new Set(PATTERNS.filter((p) => lower.includes(p)));
  // Castling in notation names castling in words.
  if ([...sans].some((s) => s.startsWith('O-O'))) patterns.add('castl');
  return { sans, squares, numbers, pieces, patterns };
}

type Owner = 'my' | 'your';
const OTHER: Record<Owner, Owner> = { my: 'your', your: 'my' };
const ROLE = '(pawn|knight|bishop|rook|queen|king)s?';

/**
 * Who owns which piece, as "my knight" and "my knight g5". From phrases
 * like "your pawn on e5" and "your e5 pawn", and in the fact sheet also
 * from moves: a move in a line that starts "You" or "Your" is the
 * player's, one that starts "I" or "My" is the opponent's, and so is the
 * move after "my threat of".
 */
function owned(text: string, sheet: boolean): { pairs: Set<string>; triples: Set<string> } {
  const pairs = new Set<string>();
  const triples = new Set<string>();
  const add = (o: Owner, role: string, sq?: string) => {
    pairs.add(`${o} ${role}`);
    if (sq) triples.add(`${o} ${role} ${sq}`);
  };
  const fromSan = (o: Owner, san: string) => {
    const s = stripCheck(san);
    if (SQUARE.test(s) || s.startsWith('O-O')) return;
    const dest = s.replace(/=[QRBN]$/, '').slice(-2);
    add(o, ROLE_OF[s[0]!] ?? 'pawn', dest);
  };
  for (const raw of text.split('\n')) {
    const line = raw.replace(/^(- |Fact: |Why: |Long term: )/, '');
    const lower = line.toLowerCase();
    for (const m of lower.matchAll(new RegExp(`\\b(my|your) ${ROLE}(?: on ([a-h][1-8]))?`, 'g')))
      add(m[1] as Owner, m[2]!, m[3]);
    for (const m of lower.matchAll(new RegExp(`\\b(my|your) ([a-h][1-8]) ${ROLE}`, 'g')))
      add(m[1] as Owner, m[3]!, m[2]);
    if (!sheet) continue;
    const subject: Owner | undefined = /^(You|Your)\b/.test(line)
      ? 'your'
      : /^(I|My)\b/.test(line)
        ? 'my'
        : undefined;
    const sans = line.match(SAN) ?? [];
    if (subject) for (const m of sans) fromSan(subject, m);
    // The headline starts with the player's move.
    if (raw === text.split('\n')[0] && sans[0]) fromSan('your', sans[0]);
    for (const m of line.matchAll(/my threat of (\S+?)[.,]?(?:\s|$)/g)) fromSan('my', m[1]!);
    // A bare square played as a move is a pawn move: "I play h5", "I answer e5".
    for (const m of line.matchAll(
      /\b(You play|I play|I answer|My best answer is|my threat of) ([a-h][1-8])\b/g,
    ))
      add(m[1]!.startsWith('You') ? 'your' : 'my', 'pawn', m[2]);
  }
  return { pairs, triples };
}

/** A move as "your pawn x e5" or "my knight - h6"; owner or role "*" when unknown. */
type MoveFact = { owner: Owner | '*'; role: string; capture: boolean; dest: string };

const ROLE_WORDS = 'pawn|knight|bishop|rook|queen|king';

/** A SAN move as a fact; undefined for castling. */
function sanFact(owner: Owner | '*', san: string): MoveFact | undefined {
  const s = stripCheck(san).replace(/=[QRBN]$/, '');
  if (s.startsWith('O-O') || !/[a-h][1-8]$/.test(s)) return undefined;
  return { owner, role: ROLE_OF[s[0]!] ?? 'pawn', capture: s.includes('x'), dest: s.slice(-2) };
}

/**
 * The moves the fact sheet states, with who made them and whether each
 * took something: the headline move, "You play" and "I play" lines, answers
 * and threats, and narrated captures such as "Your pawn takes my pawn on e5".
 */
function sheetMoves(sheet: string): MoveFact[] {
  const out: MoveFact[] = [];
  const push = (f: MoveFact | undefined) => f && out.push(f);
  const lines = sheet.split('\n');
  push(sanFact('your', lines[0]!.split(' ')[0]!));
  for (const raw of lines) {
    const line = raw.replace(/^(- |Fact: |Why: |Long term: )/, '');
    const subject: Owner | '*' = /^(You|Your)\b/.test(line)
      ? 'your'
      : /^(I|My)\b/.test(line)
        ? 'my'
        : '*';
    for (const m of line.matchAll(/\b(?:You|I) play (\S+?)[.,]?(?=\s|$)/g))
      push(sanFact(subject, m[1]!));
    for (const m of line.matchAll(
      /\b(?:I answer|My best answer is|my threat of) (\S+?)[.,]?(?=\s|$)/g,
    ))
      push(sanFact('my', m[1]!));
    for (const m of line.matchAll(/\bthreatening (\S+?)[.,]?(?=\s|$)/g))
      push(sanFact(subject, m[1]!));
    for (const m of line.matchAll(
      new RegExp(`\\b(my|your) (${ROLE_WORDS}) takes (?:my|your) \\w+ on ([a-h][1-8])`, 'gi'),
    ))
      out.push({
        owner: m[1]!.toLowerCase() as Owner,
        role: m[2]!.toLowerCase(),
        capture: true,
        dest: m[3]!,
      });
    for (const m of line.matchAll(/\b(You|I) take back on ([a-h][1-8])/g))
      out.push({ owner: m[1] === 'You' ? 'your' : 'my', role: '*', capture: true, dest: m[2]! });
    for (const m of line.matchAll(
      new RegExp(`Check from (my|your) (${ROLE_WORDS}) on ([a-h][1-8])`, 'g'),
    ))
      out.push({ owner: m[1] as Owner, role: m[2]!, capture: false, dest: m[3]! });
    const lead = /^([KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=[QRBN])?[+#]?)\./.exec(line);
    if (lead) push(sanFact('*', lead[1]!));
  }
  return out;
}

/**
 * Moves a text states in words, "you play pawn to e5" or "my knight takes on
 * b5", with the owner read from the nearest "you", "your", "I", "me" or
 * "my" before it in the same clause.
 */
function textMoves(text: string): MoveFact[] {
  const out: MoveFact[] = [];
  for (const sentence of text.toLowerCase().split(/[.;:?]/)) {
    const re = new RegExp(`\\b(${ROLE_WORDS}) (to|takes(?: on)?) ([a-h][1-8])\\b`, 'g');
    for (const m of sentence.matchAll(re)) {
      // The owner comes from the same clause; a comma starts a new one.
      const clause = sentence.slice(sentence.lastIndexOf(',', m.index) + 1, m.index);
      const before = clause.match(/\b(you|your|i|me|my)\b/g)?.at(-1);
      const owner: Owner | '*' = !before
        ? '*'
        : before === 'you' || before === 'your'
          ? 'your'
          : 'my';
      // "Rook to g8, taking your rook" tells a capture too.
      const after = sentence.slice(m.index + m[0].length);
      const capture = m[2] !== 'to' || /^,?\s*(taking|capturing)\b/.test(after);
      out.push({ owner, role: m[1]!, capture, dest: m[3]! });
    }
  }
  return out;
}

/**
 * A stated move the sheet contradicts: the sheet has that piece arriving on
 * that square, but never in the way the text says, or never by that side.
 */
function wrongMoves(sheet: string, text: string): string[] {
  const facts = sheetMoves(sheet);
  const out: string[] = [];
  for (const t of textMoves(text)) {
    const same = facts.filter((f) => f.dest === t.dest && (f.role === '*' || f.role === t.role));
    if (!same.length) continue;
    const fits = same.some(
      (f) => f.capture === t.capture && (f.owner === '*' || t.owner === '*' || f.owner === t.owner),
    );
    if (!fits)
      out.push(
        `move: ${t.owner === '*' ? '' : `${t.owner} `}${t.role} ${t.capture ? 'takes' : 'to'} ${t.dest}`,
      );
  }
  return out;
}

/**
 * Checks a phrasing of a record. The text may name only moves, squares,
 * numbers, pieces and patterns found in the fact sheet, says moves in words
 * rather than notation, and must follow the copy rules: two to four sentences, no dashes, no exclamation marks, no
 * parentheses, no filler. Returns the problems; an empty list passes.
 */
export function checkPhrasing(sheet: string, text: string): string[] {
  const facts = named(sheet);
  // Notation in the sheet names things a text may say in words: "Qg7#" a
  // checkmate, "b8=Q" a promotion, and a bare "f3" played as a move a pawn.
  if (/[a-h][1-8]#/.test(sheet)) facts.patterns.add('mate').add('checkmate');
  if (/=[QRBN]/.test(sheet)) facts.patterns.add('promot');
  if (/(^|\b(?:play|answer|answer is|threat of|threatening) )[a-h][1-8]\b/m.test(sheet))
    facts.pieces.add('pawn');
  const said = named(text);
  const problems: string[] = [];
  const extra = (kind: keyof PhrasingFacts) =>
    [...said[kind]].filter((x) => !facts[kind].has(x)).map((x) => `${kind}: ${x}`);
  for (const k of ['sans', 'squares', 'numbers', 'pieces', 'patterns'] as const)
    problems.push(...extra(k));
  // Moves are said in words, "rook to h8"; notation is for the board, not for speech.
  for (const san of said.sans) problems.push(`notation: ${san}`);
  // A move given to the wrong side, or a capture told as a plain move.
  problems.push(...wrongMoves(sheet, text));
  // "You have to" means this move and no other; "something else" turns it around.
  // Check signs read out as words: "pawn to e6 plus".
  if (/\b(plus|hash|sharp)\b/i.test(text)) problems.push('notation: sign in words');
  if (/\b(have to|must) (play|find|make) (something|anything) else\b/i.test(text))
    problems.push('forced: inverted');
  // Whose piece: a claim the facts contradict, or an owner they never give.
  const known = owned(sheet, true);
  const claims = owned(text, false);
  for (const t of claims.triples) {
    const [o, role, sq] = t.split(' ') as [Owner, string, string];
    if (!known.triples.has(t) && known.triples.has(`${OTHER[o]} ${role} ${sq}`))
      problems.push(`owner: ${t}`);
  }
  for (const pr of claims.pairs) if (!known.pairs.has(pr)) problems.push(`owner: ${pr}`);
  if (/[‒-―−]|\s-\s|--/.test(text)) problems.push('dash');
  if (text.includes('!')) problems.push('exclamation mark');
  if (/[()[\]]/.test(text)) problems.push('parentheses');
  if (/<\/?think>/.test(text)) problems.push('reasoning left in');
  const lower = ` ${text.toLowerCase()} `;
  for (const f of FILLER) if (lower.includes(f)) problems.push(`filler: ${f.trim()}`);
  const sentences = text
    .trim()
    .split(/(?<=[.?])\s+/)
    .filter(Boolean).length;
  if (sentences < 2 || sentences > 4) problems.push(`${sentences} sentences`);
  if (text.length > 600) problems.push('too long');
  return problems;
}
