import type { TagName } from '../detectors';

/** Shard theme for each tag. Tags without a matching Lichess theme have none. */
export const TAG_THEME: Partial<Record<TagName, string>> = {
  hangingPiece: 'hangingPiece',
  missedCapture: 'hangingPiece',
  trappedPiece: 'trappedPiece',
  forkMissed: 'fork',
  forkAllowed: 'fork',
  pinMissed: 'pin',
  pinAllowed: 'pin',
  skewerMissed: 'skewer',
  skewerAllowed: 'skewer',
  discoveredAttack: 'discoveredAttack',
  backRank: 'backRankMate',
  mateMissed: 'mate',
  mateAllowed: 'defensiveMove',
  quietSetupMissed: 'quietMove',
  sacrificeMissed: 'sacrifice',
  kingSafety: 'kingsideAttack',
  openingError: 'opening',
  'endgame:pawn': 'pawnEndgame',
  'endgame:rook': 'rookEndgame',
  'endgame:minor': 'minorEndgame',
  'endgame:queen': 'queenEndgame',
};

/** Goal shown for a theme puzzle. */
export const THEME_GOAL: Record<string, string> = {
  hangingPiece: 'Win the loose piece.',
  trappedPiece: 'Trap a piece.',
  fork: 'Find the fork.',
  pin: 'Use the pin.',
  skewer: 'Find the skewer.',
  discoveredAttack: 'Find the discovered attack.',
  backRankMate: 'Mate on the back rank.',
  mate: 'Find the mate.',
  defensiveMove: 'Find the only defense.',
  quietMove: 'Find the quiet move.',
  sacrifice: 'Find the sacrifice.',
  kingsideAttack: 'Attack the king.',
  opening: 'Punish the opening mistake.',
  pawnEndgame: 'Win the pawn endgame.',
  rookEndgame: 'Find the best move in this rook endgame.',
  minorEndgame: 'Find the best move in this minor piece endgame.',
  queenEndgame: 'Find the best move in this queen endgame.',
};
