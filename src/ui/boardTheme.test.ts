import { describe, expect, it } from 'vitest';
import { BOARD_PRESETS, contrast, coordInk, isHexColor, TARGETS, themeFor } from './boardTheme';

describe('board colors', () => {
  it('every preset is a pair of hex colors', () => {
    for (const { colors } of Object.values(BOARD_PRESETS))
      expect(isHexColor(colors.light) && isHexColor(colors.dark)).toBe(true);
  });

  it('picks coordinate ink that reads on the squares', () => {
    expect(coordInk({ light: '#eeeed2', dark: '#769656' })).toBe('#2e2112');
    expect(coordInk({ light: '#333333', dark: '#111111' })).toBe('#fbf7f0');
  });

  it('rejects anything but a 6-digit hex color', () => {
    expect(isHexColor('#a1b2c3')).toBe(true);
    expect(isHexColor('red')).toBe(false);
  });
});

// Presets plus awkward custom boards: near-white, near-black, neon, gray.
const BOARDS = [
  ...Object.values(BOARD_PRESETS).map((p) => p.colors),
  { light: '#ffffff', dark: '#f0f0f0' },
  { light: '#202020', dark: '#000000' },
  { light: '#ffff00', dark: '#ff00ff' },
  { light: '#dddddd', dark: '#777777' },
  { light: '#c0e8ff', dark: '#0a3d91' },
];

describe('theme from board colors', () => {
  for (const board of BOARDS) {
    it(`meets every contrast target for ${board.light} and ${board.dark}`, () => {
      const t = themeFor(board);
      for (const mode of [t.light, t.dark]) {
        for (const surface of [mode.bg, mode.card, mode.raised]) {
          expect(contrast(mode.text, surface)).toBeGreaterThanOrEqual(TARGETS.text);
          expect(contrast(mode.text2, surface)).toBeGreaterThanOrEqual(TARGETS.text2);
          expect(contrast(mode.muted, surface)).toBeGreaterThanOrEqual(TARGETS.muted);
          expect(contrast(mode.accent, surface)).toBeGreaterThanOrEqual(TARGETS.accent);
        }
        expect(contrast(mode.onAccent, mode.accent)).toBeGreaterThanOrEqual(4.5);
      }
    });
  }

  it('gives a colorful board a colorful accent and a gray board a neutral one', () => {
    const green = themeFor(BOARD_PRESETS.green!.colors).light.accent;
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(green.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ];
    expect(g).toBeGreaterThan(r + 20);
    expect(g).toBeGreaterThan(b + 20);
    const gray = themeFor(BOARD_PRESETS.gray!.colors).light.accent;
    expect(gray.slice(1, 3)).toBe(gray.slice(3, 5));
  });

  it('gives the blue board a blue accent, not a gray one', () => {
    const blue = themeFor(BOARD_PRESETS.blue!.colors).dark.accent;
    const [r, , b] = [1, 3, 5].map((i) => parseInt(blue.slice(i, i + 2), 16)) as [
      number,
      number,
      number,
    ];
    expect(b).toBeGreaterThan(r + 30);
  });
});
