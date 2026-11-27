import { describe, expect, it } from 'vitest';
import { board3dLevel, gpuDropsFullBoard } from './board3dHealth';

describe('3D board health', () => {
  it("knows the Pixel 10's PowerVR GPU drops the full board", () => {
    expect(
      gpuDropsFullBoard(
        'ANGLE (Imagination Technologies, PowerVR D-Series DXT-48-1536, OpenGL ES 3.2)',
      ),
    ).toBe(true);
    expect(gpuDropsFullBoard('ANGLE (Qualcomm, Adreno (TM) 750, OpenGL ES 3.2)')).toBe(false);
    expect(gpuDropsFullBoard(undefined)).toBe(false);
  });

  it('keeps a saved step and a forced full board', () => {
    expect(board3dLevel({ quality: 'off' })).toBe('off');
    expect(board3dLevel({ quality: 'lite' })).toBe('lite');
    expect(board3dLevel({ quality: 'full', forced: true })).toBe('full');
  });
});
