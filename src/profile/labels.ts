import type { TagName } from '../detectors/types';

/** Words shown for each tag. Each `summary` completes "You often…". */
export const TAG_INFO: Record<TagName, { label: string; summary: string }> = {
  hangingPiece: {
    label: 'Leaving pieces unprotected',
    summary: 'leave a piece where it can be taken for free',
  },
  missedCapture: { label: 'Missing free material', summary: 'miss a capture that wins material' },
  trappedPiece: { label: 'Pieces getting trapped', summary: 'put a piece where it has no way out' },
  forkMissed: { label: 'Missing forks', summary: 'miss a move that attacks two pieces at once' },
  forkAllowed: { label: 'Walking into forks', summary: 'allow a fork against two of your pieces' },
  pinMissed: { label: 'Missing pins', summary: 'miss a pin that wins material or freezes a piece' },
  pinAllowed: {
    label: 'Walking into pins',
    summary: 'line up a piece in front of a more valuable one',
  },
  skewerMissed: {
    label: 'Missing skewers',
    summary: 'miss an attack through one piece onto another',
  },
  skewerAllowed: {
    label: 'Walking into skewers',
    summary: 'line up your king or queen in front of another piece',
  },
  discoveredAttack: {
    label: 'Discovered attacks',
    summary: 'miss or allow an attack uncovered by moving a piece',
  },
  backRank: { label: 'Back-rank mates', summary: 'miss or allow mate on the back rank' },
  mateMissed: { label: 'Missing mates', summary: 'miss a forced mate in five moves or fewer' },
  mateAllowed: { label: 'Allowing mates', summary: 'allow a forced mate in five moves or fewer' },
  quietSetupMissed: {
    label: 'Missing quiet setup moves',
    summary: 'miss a quiet move that sets up a tactic',
  },
  sacrificeMissed: { label: 'Missing sacrifices', summary: 'miss a sacrifice that works' },
  kingSafety: {
    label: 'Weakening your king',
    summary: 'weaken the pawns or defenders around your king',
  },
  pawnStructure: {
    label: 'Damaging your pawns',
    summary: 'leave isolated, doubled or backward pawns',
  },
  pieceActivity: { label: 'Passive pieces', summary: 'make your pieces less active' },
  openingError: { label: 'Opening mistakes', summary: 'go wrong in the first ten moves' },
  conversionFailure: { label: 'Not converting wins', summary: 'let a winning position slip' },
  timeTrouble: {
    label: 'Mistakes in time trouble',
    summary: 'make serious mistakes with little time left',
  },
  'endgame:pawn': { label: 'Pawn endgames', summary: 'go wrong in king and pawn endgames' },
  'endgame:rook': { label: 'Rook endgames', summary: 'go wrong in rook endgames' },
  'endgame:minor': {
    label: 'Minor piece endgames',
    summary: 'go wrong in bishop and knight endgames',
  },
  'endgame:queen': { label: 'Queen endgames', summary: 'go wrong in queen endgames' },
};
