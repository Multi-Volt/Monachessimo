import { describe, expect, it } from 'vitest';
import { BOARD_PRESETS, coordInk, isHexColor } from './boardTheme';

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
