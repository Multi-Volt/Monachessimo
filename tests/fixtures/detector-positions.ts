import type { TagName } from '../../src/detectors/types';

/**
 * Positions for detector tests. Each has the move played and the tags that
 * must and must not fire. Engine lines come from detector-lines.json, built
 * by running the detector tests with UPDATE_FIXTURES=1.
 */
export interface DetectorFixture {
  name: string;
  fen: string;
  played: string;
  /** Ply number in the game. Defaults to 40, outside the opening. */
  ply?: number;
  clockBefore?: number;
  initialSeconds?: number;
  has: TagName[];
  not: TagName[];
}

export const FIXTURES: DetectorFixture[] = [
  // Hanging pieces
  {
    name: 'Black queen to h4 hangs to the knight',
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    played: 'd8h4',
    ply: 3,
    has: ['hangingPiece', 'openingError'],
    not: ['forkAllowed', 'mateAllowed', 'pinAllowed', 'backRank', 'timeTrouble', 'endgame:pawn'],
  },
  {
    name: 'Queen to h5 hangs to the knight on f6',
    fen: 'rnbqkb1r/pppp1ppp/5n2/4p3/4P3/2N5/PPPP1PPP/R1BQKBNR w KQkq - 2 3',
    played: 'd1h5',
    ply: 4,
    has: ['hangingPiece', 'openingError'],
    not: ['forkMissed', 'mateMissed', 'skewerAllowed', 'sacrificeMissed', 'endgame:queen'],
  },
  {
    name: 'Rook to d3 hangs to the bishop',
    fen: '6k1/5ppp/8/8/2b5/8/5PPP/3R2K1 w - - 0 1',
    played: 'd1d3',
    has: ['hangingPiece'],
    not: ['openingError', 'mateAllowed', 'forkAllowed', 'endgame:rook', 'endgame:pawn'],
  },

  // Missed captures
  {
    name: 'Ignores the queen hanging on h4',
    fen: 'rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3',
    played: 'a2a3',
    ply: 4,
    has: ['missedCapture'],
    not: ['hangingPiece', 'forkMissed', 'mateMissed', 'pinMissed', 'quietSetupMissed'],
  },
  {
    name: 'Ignores the rook hanging on d3',
    fen: '6k1/5ppp/8/8/2B5/3r4/5PPP/6K1 w - - 0 1',
    played: 'g2g3',
    has: ['missedCapture'],
    not: [
      'pieceActivity',
      'pawnStructure',
      'kingSafety',
      'hangingPiece',
      'trappedPiece',
      'sacrificeMissed',
      'openingError',
    ],
  },
  {
    name: 'Ignores the knight on d5, attacked by the e4 pawn',
    fen: 'rnbqkb1r/pppppppp/8/3n4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 1 3',
    played: 'g1f3',
    ply: 4,
    has: ['missedCapture', 'openingError'],
    not: ['hangingPiece', 'forkMissed', 'discoveredAttack', 'mateAllowed'],
  },

  // Trapped pieces
  {
    name: 'Bishop takes a7 and gets trapped by b6',
    fen: '2k5/ppp2ppp/6n1/8/8/4B3/PPP2PPP/6K1 w - - 0 1',
    played: 'e3a7',
    has: ['trappedPiece', 'endgame:minor'],
    not: ['hangingPiece', 'mateAllowed', 'forkAllowed', 'endgame:pawn'],
  },
  {
    name: 'Knight takes a7 and cannot get out',
    fen: 'r3k3/pp1b1ppp/8/1N6/8/8/PPP2PPP/4K2R w - - 0 1',
    played: 'b5a7',
    has: ['trappedPiece', 'hangingPiece'],
    not: ['skewerAllowed', 'openingError', 'mateAllowed', 'endgame:minor'],
  },
  {
    name: 'Black bishop takes a2 and gets trapped by b3',
    fen: '6k1/ppp2ppp/4b3/8/8/5N2/PPP2PPP/2K5 b - - 0 1',
    played: 'e6a2',
    has: ['trappedPiece', 'endgame:minor'],
    not: ['hangingPiece', 'pinAllowed', 'mateAllowed'],
  },

  // Forks
  {
    name: 'Misses Nc7+ forking king and queen',
    fen: 'q3k3/8/8/1N6/8/8/5PPP/6K1 w - - 0 1',
    played: 'g2g3',
    has: ['forkMissed'],
    not: [
      'pieceActivity',
      'pawnStructure',
      'missedCapture',
      'pinMissed',
      'skewerMissed',
      'mateMissed',
      'hangingPiece',
    ],
  },
  {
    name: 'Misses the pawn fork d5',
    fen: '4k3/pp3ppp/2n1n3/8/3P4/8/PP3PPP/2B1K3 w - - 0 1',
    played: 'e1e2',
    has: ['forkMissed', 'endgame:minor'],
    not: ['pinMissed', 'mateMissed', 'endgame:pawn', 'sacrificeMissed'],
  },
  {
    name: 'Misses Qe4+ forking king and rook',
    fen: 'r7/6pk/8/7n/8/8/5PPP/4Q1K1 w - - 0 1',
    played: 'h2h3',
    has: ['forkMissed'],
    not: ['missedCapture', 'mateMissed', 'pinMissed', 'endgame:queen'],
  },
  {
    name: 'Queen to a8 allows Nc7+',
    fen: '3qk3/8/8/1N6/8/8/5PPP/6K1 b - - 0 1',
    played: 'd8a8',
    has: ['forkAllowed'],
    not: ['forkMissed', 'mateAllowed', 'pinAllowed', 'hangingPiece'],
  },
  {
    name: 'Nc6 walks into the pawn fork d5',
    fen: '1n2k3/pp3ppp/4n3/8/3P4/8/PP3PPP/2B1K3 b - - 0 1',
    played: 'b8c6',
    has: ['forkAllowed'],
    not: ['mateAllowed', 'skewerAllowed', 'pinAllowed'],
  },
  {
    name: 'Rook to a8 allows Qe4+',
    fen: '8/r5pk/8/7n/8/8/5PPP/4Q1K1 b - - 0 1',
    played: 'a7a8',
    has: ['forkAllowed'],
    not: ['forkMissed', 'mateAllowed', 'backRank', 'openingError'],
  },

  // Pins
  {
    name: 'Misses Re1 pinning the queen to the king',
    fen: '4k3/8/8/4q3/8/8/5PPP/R4K2 w - - 0 1',
    played: 'h2h3',
    has: ['pinMissed'],
    not: ['skewerMissed', 'forkMissed', 'mateMissed', 'missedCapture'],
  },
  {
    name: 'Misses Bb5 pinning the rook to the king',
    fen: '4k3/3r4/8/8/8/8/4BPPP/6K1 w - - 0 1',
    played: 'g2g3',
    has: ['pinMissed'],
    not: ['skewerMissed', 'forkMissed', 'missedCapture', 'mateMissed'],
  },
  {
    name: 'Misses Bb5 pinning the queen, the bishop guarded by a4',
    fen: '4k3/3q4/8/8/P7/8/4BPPP/6K1 w - - 0 1',
    played: 'g2g3',
    has: ['pinMissed'],
    not: ['forkMissed', 'missedCapture', 'mateMissed', 'skewerMissed'],
  },
  {
    name: 'Queen to e5 allows Re1 pinning it',
    fen: '4k3/8/8/8/8/2q5/5PPP/R4K2 b - - 0 1',
    played: 'c3e5',
    has: ['pinAllowed'],
    not: ['forkAllowed', 'mateAllowed', 'skewerAllowed', 'hangingPiece'],
  },
  {
    name: 'Rook to d7 allows Bb5 pinning it',
    fen: '4k3/r7/8/8/8/8/4BPPP/6K1 b - - 0 1',
    played: 'a7d7',
    has: ['pinAllowed'],
    not: ['forkAllowed', 'mateAllowed', 'hangingPiece'],
  },
  {
    name: 'Queen to d7 allows Bb5 pinning it',
    fen: '4k3/8/2q5/8/P7/8/4BPPP/6K1 b - - 0 1',
    played: 'c6d7',
    has: ['pinAllowed'],
    not: ['forkAllowed', 'mateAllowed', 'skewerAllowed'],
  },

  // Skewers
  {
    name: 'Misses Ra6+ skewering king and rook',
    fen: '8/8/2k4r/4ppp1/8/8/5PPP/R5K1 w - - 0 1',
    played: 'g2g3',
    has: ['skewerMissed', 'endgame:rook'],
    not: ['pinMissed', 'forkMissed', 'mateMissed', 'missedCapture'],
  },
  {
    name: 'Misses Bc4+ skewering king and queen',
    fen: '6q1/8/4k3/8/8/8/4BPPP/6K1 w - - 0 1',
    played: 'h2h3',
    has: ['skewerMissed'],
    not: ['pieceActivity', 'pawnStructure', 'kingSafety', 'pinMissed', 'forkMissed', 'mateMissed'],
  },
  {
    name: 'Misses Be4 skewering queen and rook',
    fen: 'r5k1/5ppp/2q5/8/8/3B1P2/6PP/3Q3K w - - 0 1',
    played: 'h2h3',
    has: ['skewerMissed'],
    not: ['pieceActivity', 'pinMissed', 'mateMissed', 'backRank'],
  },
  {
    name: 'King to c6 allows Ra6+ skewer',
    fen: '8/2k5/7r/4ppp1/8/8/5PPP/R5K1 b - - 0 1',
    played: 'c7c6',
    has: ['skewerAllowed', 'endgame:rook'],
    not: ['pinAllowed', 'forkAllowed', 'mateAllowed'],
  },
  {
    name: 'King to e6 allows Bc4+ skewer',
    fen: '6q1/3k4/8/8/8/8/4BPPP/6K1 b - - 0 1',
    played: 'd7e6',
    has: ['skewerAllowed'],
    not: ['pinAllowed', 'forkAllowed', 'mateAllowed'],
  },
  {
    name: 'Rook to h6 allows Ra6+ skewer',
    fen: '8/8/2k5/4ppp1/8/7r/5PPP/R5K1 b - - 0 1',
    played: 'h3h6',
    has: ['skewerAllowed', 'endgame:rook'],
    not: ['pinAllowed', 'forkAllowed', 'hangingPiece'],
  },

  // Discovered attacks
  {
    name: 'Misses Nc6+, a discovered check that wins the queen',
    fen: '3qk3/8/8/4N3/8/8/5PPP/4R1K1 w - - 0 1',
    played: 'g2g3',
    has: ['discoveredAttack'],
    not: ['pinMissed', 'skewerMissed', 'mateAllowed'],
  },
  {
    name: 'Misses Nd6+, a discovered check that wins the queen',
    fen: '8/6pk/8/8/2q1N3/8/5PPP/1B4K1 w - - 0 1',
    played: 'h2h3',
    has: ['discoveredAttack'],
    not: ['pinMissed', 'mateMissed', 'backRank'],
  },
  {
    name: 'King to e8 allows a discovered check',
    fen: '3q1k2/8/8/4N3/8/8/5PPP/4R1K1 b - - 0 1',
    played: 'f8e8',
    has: ['discoveredAttack'],
    not: ['pinAllowed', 'skewerAllowed', 'mateAllowed'],
  },

  // Mates
  {
    name: 'Misses Rd8, back-rank mate',
    fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    played: 'h2h3',
    has: ['mateMissed', 'backRank', 'endgame:rook'],
    not: ['mateAllowed', 'forkMissed', 'sacrificeMissed', 'hangingPiece'],
  },
  {
    name: 'Queens face off: misses Qxe8 mate',
    fen: '4q1k1/5ppp/8/8/8/8/5PPP/4Q1K1 w - - 0 1',
    played: 'h2h3',
    has: ['mateMissed', 'backRank', 'endgame:queen'],
    not: ['forkMissed', 'pinMissed', 'sacrificeMissed', 'endgame:rook'],
  },
  {
    name: 'Queens face off: Black misses Qxe1 mate',
    fen: '4q1k1/5ppp/8/8/8/8/5PPP/4Q1K1 b - - 0 1',
    played: 'h7h6',
    has: ['mateMissed', 'backRank', 'endgame:queen'],
    not: ['forkMissed', 'skewerMissed', 'endgame:pawn'],
  },
  {
    name: 'Queen to e5 hangs to the queen on a5',
    fen: '6k1/5pp1/7p/q7/8/8/5PPP/4Q1K1 w - - 0 1',
    played: 'e1e5',
    has: ['hangingPiece', 'missedCapture', 'endgame:queen'],
    not: ['mateMissed', 'endgame:rook', 'endgame:minor', 'openingError'],
  },
  {
    name: 'Misses Qxf7 mate',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4',
    played: 'd2d3',
    ply: 6,
    has: ['mateMissed', 'openingError'],
    not: ['backRank', 'mateAllowed', 'sacrificeMissed', 'endgame:queen'],
  },
  {
    name: 'Rook leaves the back rank and allows Re8 mate',
    fen: 'r5k1/5ppp/8/8/8/8/5PPP/4R1K1 b - - 0 1',
    played: 'a8a2',
    has: ['mateAllowed', 'backRank', 'endgame:rook'],
    not: ['mateMissed', 'forkAllowed', 'hangingPiece'],
  },
  {
    name: "Fool's mate: g4 allows Qh4",
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/8/5P2/PPPPP1PP/RNBQKBNR w KQkq - 0 2',
    played: 'g2g4',
    ply: 2,
    has: ['mateAllowed', 'openingError'],
    not: ['backRank', 'mateMissed', 'hangingPiece', 'forkAllowed'],
  },
  {
    name: "Scholar's mate: Nf6 allows Qxf7",
    fen: 'r1bqkbnr/pppp1ppp/2n5/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 3 3',
    played: 'g8f6',
    ply: 5,
    has: ['mateAllowed', 'openingError'],
    not: ['pawnStructure', 'pieceActivity', 'backRank', 'mateMissed', 'pinAllowed'],
  },

  // Quiet setups and sacrifices
  {
    name: 'Misses d5, attacking the knight pinned to the king',
    fen: '4k3/ppp1pppp/2n5/1B6/3P4/8/PPP2PPP/6K1 w - - 0 1',
    played: 'h2h3',
    has: ['quietSetupMissed'],
    not: ['forkMissed', 'pinMissed', 'missedCapture', 'sacrificeMissed', 'mateMissed'],
  },
  {
    name: 'Misses d4, attacking the knight pinned to the king',
    fen: '6k1/ppp2ppp/8/3p4/1b6/2N5/PPP1PPPP/4K3 b - - 0 1',
    played: 'h7h6',
    has: ['quietSetupMissed'],
    not: ['forkMissed', 'pinMissed', 'missedCapture', 'mateMissed'],
  },
  {
    name: 'Misses f4, attacking the knight pinned on the e-file',
    fen: 'r3k3/ppp3pp/3p4/4n3/8/8/PPP2PPP/1N2R1K1 w - - 0 1',
    played: 'h2h3',
    has: ['quietSetupMissed'],
    not: ['forkMissed', 'pinMissed', 'skewerMissed', 'sacrificeMissed'],
  },
  {
    name: 'Misses the queen sacrifice Qxd8+ and back-rank mate',
    fen: '2rr2k1/5ppp/q7/8/8/3Q4/5PPP/3R2K1 w - - 0 1',
    played: 'h2h3',
    has: ['sacrificeMissed', 'mateMissed', 'backRank'],
    not: ['quietSetupMissed', 'forkMissed', 'openingError'],
  },
  {
    name: 'Black misses Qg1+, the smothered mate sacrifice',
    fen: '6k1/5ppp/8/2q5/8/7n/6PP/3R3K b - - 0 1',
    played: 'h7h6',
    has: ['sacrificeMissed', 'mateMissed'],
    not: ['quietSetupMissed', 'backRank', 'pinMissed'],
  },
  {
    name: 'Misses Qg8+, the smothered mate sacrifice',
    fen: '3r3k/6pp/7N/8/2Q5/8/5PPP/6K1 w - - 0 1',
    played: 'h2h3',
    has: ['sacrificeMissed', 'mateMissed'],
    not: ['backRank', 'quietSetupMissed', 'missedCapture'],
  },

  // Strategy features. These positions come from the generated games in
  // perf-games.ndjson; each tag matches a feature change listed in the name.
  {
    name: 'Kh8 lets the pawn shield in front of the castled king fall',
    fen: 'r1bq1rk1/p3bppp/2p1pN2/8/1PB5/P2QP3/1B3PPP/R4RK1 b - - 0 16',
    played: 'g8h8',
    has: ['kingSafety'],
    not: ['pawnStructure', 'openingError', 'endgame:minor', 'sacrificeMissed'],
  },
  {
    name: 'Nf4 opens a file beside the castled king',
    fen: 'r4rk1/2pbbq2/3pp3/1p1n1pPn/p2P1P2/P1P3N1/1PBQ2PB/K3R2R b - - 4 24',
    played: 'h5f4',
    has: ['kingSafety'],
    not: ['openingError', 'mateAllowed', 'backRank', 'endgame:rook'],
  },
  {
    name: 'Kf8 leaves the king with more attackers than defenders',
    fen: 'r1b1k2r/pp3ppp/4p3/2q5/6Q1/3BR3/P1P2PPP/R5K1 b kq - 2 15',
    played: 'e8f8',
    has: ['kingSafety'],
    not: ['openingError', 'forkAllowed', 'trappedPiece', 'endgame:queen'],
  },
  {
    name: 'Queen to c5 leaves the a-pawn isolated after Qxb7',
    fen: '2r1k2r/pp3ppp/2q1p3/8/1Q6/3R3P/P1P2PP1/R5K1 b - - 2 21',
    played: 'c6c5',
    has: ['pawnStructure'],
    not: ['openingError', 'kingSafety', 'mateAllowed', 'endgame:queen'],
  },
  {
    name: 'Bc5 lets the b3 pawn go and isolates the a-pawn',
    fen: '3b2k1/5pp1/7p/8/Pp1B4/1P5P/2b1NPP1/6K1 w - - 7 31',
    played: 'd4c5',
    has: ['pawnStructure', 'endgame:minor'],
    not: ['kingSafety', 'openingError', 'mateMissed', 'endgame:pawn'],
  },
  {
    name: 'dxe5 doubles the e-pawns',
    fen: 'rnbqkb1r/pppp1ppp/8/4p3/2PPn3/5P2/PP2P1PP/RNBQKBNR w KQkq - 0 4',
    played: 'd4e5',
    ply: 6,
    has: ['pawnStructure', 'openingError'],
    not: ['endgame:minor', 'backRank', 'timeTrouble'],
  },
  {
    name: 'Bxh7+ throws away the bishop pair and its activity',
    fen: 'r1b2rk1/1p4pp/p1q1pp2/P2pn3/5BP1/3B4/1PP3KP/R3Q1R1 w - - 0 18',
    played: 'd3h7',
    has: ['pieceActivity'],
    not: ['openingError', 'endgame:minor', 'mateMissed', 'pawnStructure'],
  },
  {
    name: 'Bf8 retreats and loses eight squares of mobility',
    fen: '2k1r2r/ppqn2p1/2p1pn2/3p3p/1bPP4/P2bBB1P/1P1NN1P1/2R1QRK1 b - - 0 19',
    played: 'b4f8',
    has: ['pieceActivity'],
    not: ['kingSafety', 'openingError', 'mateAllowed', 'endgame:minor', 'timeTrouble'],
  },
  {
    name: 'Na5 puts the knight on the rim',
    fen: '2kr1b1r/p2q1npp/2N1bp2/8/2pPp3/1P2P3/PBPNQ1PP/2K1RR2 w - - 1 19',
    played: 'c6a5',
    has: ['pieceActivity'],
    not: ['openingError', 'mateMissed', 'endgame:minor', 'backRank'],
  },

  // Pawn endgames
  {
    name: 'King steps back and gives up the opposition',
    fen: '4k3/8/4K3/4P3/8/8/8/8 w - - 0 1',
    played: 'e6d5',
    has: ['endgame:pawn'],
    not: [
      'endgame:rook',
      'endgame:minor',
      'endgame:queen',
      'hangingPiece',
      'trappedPiece',
      'discoveredAttack',
    ],
  },
  {
    name: 'King move instead of running with the a-pawn',
    fen: '8/8/8/P3k3/8/8/8/K7 w - - 0 1',
    played: 'a1b2',
    has: ['endgame:pawn'],
    not: ['endgame:rook', 'endgame:minor', 'mateMissed', 'trappedPiece', 'discoveredAttack'],
  },
  {
    name: 'Black king move instead of pushing the h-pawn',
    fen: 'k7/8/8/8/3K3p/8/8/8 b - - 0 1',
    played: 'a8b7',
    has: ['endgame:pawn'],
    not: ['endgame:queen', 'endgame:minor', 'forkMissed', 'trappedPiece', 'discoveredAttack'],
  },

  // Time trouble
  {
    name: 'Rook blunder with 20 seconds of 5 minutes left',
    fen: '6k1/5ppp/8/8/2b5/8/5PPP/3R2K1 w - - 0 1',
    played: 'd1d3',
    clockBefore: 2000,
    initialSeconds: 300,
    has: ['timeTrouble', 'hangingPiece'],
    not: ['openingError'],
  },
  {
    name: 'Queen blunder with 25 seconds of 5 minutes left',
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    played: 'd8h4',
    ply: 3,
    clockBefore: 2500,
    initialSeconds: 300,
    has: ['timeTrouble'],
    not: ['mateAllowed'],
  },
  {
    name: 'Rook blunder with 50 seconds of 10 minutes left',
    fen: '6k1/5ppp/8/8/2b5/8/5PPP/3R2K1 w - - 0 1',
    played: 'd1d3',
    clockBefore: 5000,
    initialSeconds: 600,
    has: ['timeTrouble'],
    not: ['openingError'],
  },
  {
    name: 'Same rook blunder with two minutes left',
    fen: '6k1/5ppp/8/8/2b5/8/5PPP/3R2K1 w - - 0 1',
    played: 'd1d3',
    clockBefore: 12000,
    initialSeconds: 300,
    has: ['hangingPiece'],
    not: ['timeTrouble'],
  },
  {
    name: 'Same queen blunder with four minutes left',
    fen: 'rnbqkbnr/pppp1ppp/8/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R b KQkq - 1 2',
    played: 'd8h4',
    ply: 3,
    clockBefore: 24000,
    initialSeconds: 300,
    has: ['hangingPiece'],
    not: ['timeTrouble'],
  },
  {
    name: 'Missed mate in a daily game without a clock',
    fen: '6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1',
    played: 'h2h3',
    has: ['mateMissed'],
    not: ['timeTrouble'],
  },
];
