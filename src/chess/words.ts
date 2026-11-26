// Moves in plain words for the coach: "Qxd5+" is "queen takes d5 with check".
const PIECE: Record<string, string> = {
  K: 'king',
  Q: 'queen',
  R: 'rook',
  B: 'bishop',
  N: 'knight',
};

/** "Qxd5+" as words: "queen takes d5 with check". */
export function sanWords(san: string, mateSaid = false): string {
  const m = /^(O-O(?:-O)?|([KQRBN])?([a-h])?[1-8]?(x)?([a-h][1-8])(?:=([QRBN]))?)([+#])?$/.exec(
    san,
  );
  if (!m) return san;
  const [, body, piece, , takes, to, promo, mark] = m;
  let out =
    body === 'O-O'
      ? 'castles kingside'
      : body === 'O-O-O'
        ? 'castles queenside'
        : `${piece ? PIECE[piece] : 'pawn'} ${takes ? 'takes' : 'to'} ${to}${promo ? `, becoming a ${PIECE[promo]}` : ''}`;
  if (mark === '+') out += ' with check';
  if (mark === '#' && !mateSaid) out += ' with checkmate';
  return out;
}

/** The move in words, to open a sentence: "Bishop to g4 with check". */
export function moveWords(san: string): string {
  const w = sanWords(san);
  return w.charAt(0).toUpperCase() + w.slice(1);
}
