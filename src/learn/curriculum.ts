import type { CourseDef, LessonDef, LevelDef, LevelId, Side } from './types';

export interface LessonRef {
  lesson: LessonDef;
  course: CourseDef;
  level: LevelDef;
  /** Position in the whole curriculum, which is also the suggested order. */
  order: number;
}

export interface Curriculum {
  levels: LevelDef[];
  lessons: LessonRef[];
  byId: Map<string, LessonRef>;
  courseById: Map<string, { course: CourseDef; level: LevelDef }>;
}

export const LEVEL_IDS: readonly LevelId[] = ['basics', 'beginner', 'intermediate', 'advanced'];

export const LEVEL_TEXT: Record<LevelId, { title: string; desc: string }> = {
  basics: { title: 'New to chess', desc: 'The board, the pieces and every rule you need to play.' },
  beginner: {
    title: 'Beginner',
    desc: 'Basic checkmates, first tactics, defending, and how to start a game.',
  },
  intermediate: {
    title: 'Intermediate',
    desc: 'Sharper tactics, mating patterns and pawn endgames.',
  },
  advanced: {
    title: 'Advanced',
    desc: 'Quiet moves, zugzwang, rare mating patterns, mate in four, and rook, queen and minor-piece endgames.',
  },
};

export function buildCurriculum(levels: LevelDef[]): Curriculum {
  const lessons: LessonRef[] = [];
  const courseById = new Map<string, { course: CourseDef; level: LevelDef }>();
  for (const level of levels)
    for (const course of level.courses) {
      courseById.set(course.id, { course, level });
      for (const lesson of course.lessons)
        lessons.push({ lesson, course, level, order: lessons.length });
    }
  return { levels, lessons, byId: new Map(lessons.map((r) => [r.lesson.id, r])), courseById };
}

/** Lesson texts: `courses.<id>.title|desc`, and `<lessonId>.<key>`. */
export type LessonTexts = Record<string, Record<string, unknown>>;

export interface LearnContent {
  curriculum: Curriculum;
  texts: LessonTexts;
}

let content: Promise<LearnContent> | undefined;

/** Loads the lessons on demand, outside the main bundle. */
export function loadLearn(): Promise<LearnContent> {
  content ??= Promise.all([
    import('./content/basics.json'),
    import('./content/beginner.json'),
    import('./content/intermediate.json'),
    import('./content/advanced.json'),
    import('./text/en.json'),
  ]).then(([a, b, c, d, en]) => ({
    curriculum: buildCurriculum([a, b, c, d].map((m) => m.default as unknown as LevelDef)),
    texts: en.default as unknown as LessonTexts,
  }));
  return content;
}

/** A lesson text with `{{side}}` filled in; empty when missing. */
export function lessonText(texts: LessonTexts, lesson: string, key: string, side?: Side): string {
  const raw = texts[lesson]?.[key];
  if (typeof raw !== 'string') return '';
  return raw.replace(/{{\s*side\s*}}/g, side === 'black' ? 'Black' : 'White');
}

export function courseText(texts: LessonTexts, course: string): { title: string; desc: string } {
  const c = (texts.courses as Record<string, { title: string; desc: string }> | undefined)?.[
    course
  ];
  return c ?? { title: course, desc: '' };
}
