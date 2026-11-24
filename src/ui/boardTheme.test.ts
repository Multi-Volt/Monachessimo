import { describe, expect, it } from 'vitest';
import { BOARD_PRESETS, contrast, coordInk, isHexColor, themeFor } from './boardTheme';

describe('board colors', () => {
  it('every preset has light squares lighter than dark squares', () => {
    for (const { colors } of Object.values(BOARD_PRESETS)) {
      expect(isHexColor(colors.light) && isHexColor(colors.dark)).toBe(true);
      expect(parseInt(colors.light.slice(1), 16)).not.toBe(parseInt(colors.dark.slice(1), 16));
    }
  });

  it('picks coordinate ink that reads on the squares', () => {
    expect(coordInk({ light: '#eeeed2', dark: '#769656' })).toBe('#2e2112');
    expect(coordInk({ light: '#333333', dark: '#111111' })).toBe('#fbf7f0');
  });

  it('rejects anything but a 6-digit hex color', () => {
    expect(isHexColor('#a1b2c3')).toBe(true);
    expect(isHexColor('red')).toBe(false);
    expect(isHexColor('#fff')).toBe(false);
  });
});

describe('theme from board colors', () => {
  it('keeps every text pair at WCAG AA for every preset', () => {
    for (const { colors } of Object.values(BOARD_PRESETS)) {
      const t = themeFor(colors);
      expect(contrast('#ffffff', t.light.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.light.accent, t.light.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#72685c', t.light.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#1d120c', t.dark.accent)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(t.dark.accent, t.dark.bg)).toBeGreaterThanOrEqual(4.5);
      expect(contrast('#958b7c', t.dark.bg)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('takes the accent hue from the dark squares', () => {
    const t = themeFor(BOARD_PRESETS.green!.colors);
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(t.light.accent.slice(i, i + 2), 16));
    expect(g!).toBeGreaterThan(r!);
    expect(g!).toBeGreaterThan(b!);
  });
});
