import type { TagName } from '../detectors';

/**
 * The lessons that teach each weakness tag, best first. Data, so the test
 * can check every id against the curriculum. Time trouble has no lesson: no
 * board position teaches the clock.
 */
export const TAG_LESSONS: Record<TagName, string[]> = {
  hangingPiece: ['hanging', 'defend'],
  missedCapture: ['hanging'],
  trappedPiece: ['trapped'],
  forkMissed: ['fork'],
  forkAllowed: ['fork', 'defend'],
  pinMissed: ['pin'],
  pinAllowed: ['pin'],
  skewerMissed: ['skewer', 'xray'],
  skewerAllowed: ['skewer'],
  discoveredAttack: ['discovered', 'discovered-check', 'double-check'],
  backRank: ['back-rank'],
  mateMissed: ['mate-in-one', 'mate-in-two', 'mate-in-three'],
  mateAllowed: ['back-rank', 'exposed-king'],
  quietSetupMissed: ['quiet', 'only-move', 'intermezzo'],
  sacrificeMissed: ['deflection', 'attraction', 'defender', 'clearance'],
  kingSafety: ['king-safety', 'exposed-king'],
  pawnStructure: ['center', 'pawn-endgames'],
  pieceActivity: ['develop', 'rook-endgames'],
  openingError: ['center', 'develop', 'king-safety', 'traps'],
  conversionFailure: ['queen-mate', 'rook-mate', 'rook-endgames', 'minor-endgames'],
  timeTrouble: [],
  'endgame:pawn': ['pawn-endgames', 'opposition', 'square'],
  'endgame:rook': ['rook-endgames', 'lucena', 'philidor'],
  'endgame:minor': ['minor-endgames'],
  'endgame:queen': ['queen-endgames'],
};

/** Tags that have no lesson on purpose. */
export const NO_LESSON: readonly TagName[] = ['timeTrouble'];

/** The first lesson for a tag, if any. */
export const lessonFor = (tag: TagName): string | undefined => TAG_LESSONS[tag][0];
