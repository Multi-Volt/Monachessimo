// The lesson format, ported from Patzer (MIT, see THIRD_PARTY.md).
//
// Everything that decides whether a move is right lives in the language-free
// files in `content/`, and every text lives in `text/<lang>.json` under
// `<lessonId>.<stepId>`. A translation can never change what a lesson
// teaches, and `content.test.ts` checks every position and solution.

/** A square name, "e4". */
export type Sq = string;
export type Side = 'white' | 'black';

export type LevelId = 'basics' | 'beginner' | 'intermediate' | 'advanced';

export interface LevelDef {
  id: LevelId;
  courses: CourseDef[];
}

export interface CourseDef {
  id: string;
  /** A piece letter (K Q R B N P) shown as the course's badge. */
  icon: string;
  lessons: LessonDef[];
}

export interface LessonDef {
  id: string;
  icon: string;
  steps: StepDef[];
}

interface StepBase {
  /** Text key inside the lesson: `<lessonId>.<id>`, and `<id>_done`. */
  id: string;
  fen?: string;
  orientation?: Side;
  /** "e2e4" draws an arrow, "e2e4:red" in another brush. */
  arrows?: string[];
  /** "e4" circles a square, "e4:red" in another brush. */
  marks?: string[];
}

/** An explanation. The board, if any, may replay `demo` moves in a loop. */
export interface InfoStep extends StepBase {
  type: 'info';
  demo?: string[];
}

/**
 * Move one piece until every star is collected. Nothing moves back, and
 * captures are only allowed onto a star. `par` is the fewest moves that
 * collect them all; the content test recomputes it.
 */
export interface StarsStep extends StepBase {
  type: 'stars';
  fen: string;
  stars: Sq[];
  par: number;
  /** The piece that moves, when the side to move has more than one. */
  piece?: Sq;
}

/** Tap the right squares, all of them when there are several. */
export interface SquareStep extends StepBase {
  type: 'square';
  answer: Sq[];
  /** "Where can this piece go?": `answer` must be exactly its legal moves. */
  movesOf?: Sq;
}

/**
 * Find the move or the line. `line` alternates the player's moves and the
 * replies, starting and ending with the player's. With goal "mate" any
 * mating move is right; with goal "check" any check is.
 */
export interface MoveStep extends StepBase {
  type: 'move';
  fen: string;
  /** The opponent's move played first, so the player sees what just happened. */
  pre?: string;
  line: string[];
  goal?: 'line' | 'mate' | 'check';
  /** More first moves that are just as right as line[0]. */
  accept?: string[];
  /** Every legal move is in line[0] and accept. */
  exact?: boolean;
  /** The task names the move, so it has to be sound, not the strongest. */
  rule?: boolean;
  /** Lichess puzzle id this position comes from (CC0). */
  src?: string;
}

/** Play it out against the engine until the goal is reached. */
export interface PlayStep extends StepBase {
  type: 'play';
  fen: string;
  goal: 'mate' | 'promote';
  /** How many of the player's moves it may take. */
  limit: number;
}

/** A multiple-choice question; option texts are `<lessonId>.<id>_<option>`. */
export interface QuizStep extends StepBase {
  type: 'quiz';
  options: string[];
  answer: string;
}

export type StepDef = InfoStep | StarsStep | SquareStep | MoveStep | PlayStep | QuizStep;
export type TaskStep = Exclude<StepDef, InfoStep>;

export function isTask(step: StepDef): step is TaskStep {
  return step.type !== 'info';
}
