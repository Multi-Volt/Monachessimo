import { describe, expect, it } from 'vitest';
import { TAGS } from '../detectors';
import basics from './content/basics.json';
import beginner from './content/beginner.json';
import intermediate from './content/intermediate.json';
import advanced from './content/advanced.json';
import { buildCurriculum } from './curriculum';
import type { LevelDef } from './types';
import { NO_LESSON, TAG_LESSONS } from './weakness';

const cur = buildCurriculum([basics, beginner, intermediate, advanced] as unknown as LevelDef[]);

describe('weakness to lesson mapping', () => {
  it('maps every tag to real lessons, except the ones with none on purpose', () => {
    for (const tag of TAGS) {
      const ids = TAG_LESSONS[tag];
      if (NO_LESSON.includes(tag)) expect(ids, tag).toEqual([]);
      else expect(ids.length, tag).toBeGreaterThan(0);
      for (const id of ids) expect(cur.byId.has(id), `${tag}: ${id}`).toBe(true);
    }
  });
});
