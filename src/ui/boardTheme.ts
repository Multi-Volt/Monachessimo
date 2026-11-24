/** Square colors for every board in the app. */
export interface BoardColors {
  light: string;
  dark: string;
}

export const BOARD_PRESETS: Record<string, { label: string; colors: BoardColors }> = {
  olive: { label: 'Olive wood', colors: { light: '#ecdcbc', dark: '#ae8a5c' } },
  green: { label: 'Green', colors: { light: '#eeeed2', dark: '#769656' } },
  blue: { label: 'Blue', colors: { light: '#dee3e6', dark: '#8ca2ad' } },
  gray: { label: 'Gray', colors: { light: '#e4e4e4', dark: '#9a9a9a' } },
  walnut: { label: 'Walnut', colors: { light: '#e8cfa6', dark: '#8b5a2b' } },
  coral: { label: 'Coral', colors: { light: '#f2e6dc', dark: '#d08a6e' } },
};

export const DEFAULT_BOARD: BoardColors = BOARD_PRESETS.olive!.colors;

function toRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: [number, number, number]): string {
  return (
    '#' +
    [r, g, b]
      .map((v) =>
        Math.round(Math.max(0, Math.min(255, v)))
          .toString(16)
          .padStart(2, '0'),
      )
      .join('')
  );
}

/** `a` moved toward `b` by `t` (0 to 1). */
export function mix(a: string, b: string, t: number): string {
  const x = toRgb(a);
  const y = toRgb(b);
  return toHex([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]);
}

function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => {
    const x = v / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}

export function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Dark or light ink for coordinates, whichever reads better on both square colors. */
export function coordInk(c: BoardColors): string {
  const dark = '#2e2112';
  const light = '#fbf7f0';
  const worst = (ink: string) => Math.min(contrast(ink, c.light), contrast(ink, c.dark));
  return worst(dark) >= worst(light) ? dark : light;
}

export function isHexColor(s: string): boolean {
  return /^#[0-9a-f]{6}$/i.test(s);
}

/** The fixed text colors of each theme, which tinted surfaces must keep readable. */
const LIGHT = {
  bg: '#f8f4ec',
  card: '#fdfbf6',
  raised: '#f0e9dc',
  muted: '#72685c',
  onAccent: '#ffffff',
};
const DARK = {
  bg: '#171411',
  card: '#1f1b17',
  raised: '#29241f',
  muted: '#958b7c',
  onAccent: '#1d120c',
};
const AA = 4.5;

/** Moves `color` toward `target` until it reaches AA contrast against every color in `against`. */
function until(color: string, target: string, against: string[]): string {
  for (let t = 0; t <= 1.0001; t += 0.05) {
    const c = mix(color, target, t);
    if (against.every((x) => contrast(c, x) >= AA)) return c;
  }
  return target;
}

/** A surface tinted toward `tint`, as much as `max`, while muted text stays AA. */
function tinted(base: string, tint: string, max: number, muted: string): string {
  for (let t = max; t > 0; t -= 0.02) {
    const c = mix(base, tint, t);
    if (contrast(muted, c) >= AA) return c;
  }
  return base;
}

export interface ThemeColors {
  light: { bg: string; card: string; raised: string; accent: string };
  dark: { bg: string; card: string; raised: string; accent: string };
}

/**
 * Theme colors that follow the board loosely: the accent takes its hue from
 * the dark squares, and surfaces take a faint tint from the squares. Every
 * pair still meets WCAG AA.
 */
export function themeFor(c: BoardColors): ThemeColors {
  const light = {
    bg: tinted(LIGHT.bg, c.light, 0.35, LIGHT.muted),
    card: tinted(LIGHT.card, c.light, 0.15, LIGHT.muted),
    raised: tinted(LIGHT.raised, c.light, 0.35, LIGHT.muted),
    accent: '',
  };
  light.accent = until(c.dark, '#000000', [LIGHT.onAccent, light.bg, light.card]);
  const dark = {
    bg: tinted(DARK.bg, c.dark, 0.1, DARK.muted),
    card: tinted(DARK.card, c.dark, 0.1, DARK.muted),
    raised: tinted(DARK.raised, c.dark, 0.12, DARK.muted),
    accent: '',
  };
  dark.accent = until(c.dark, '#ffffff', [DARK.onAccent, dark.bg, dark.card]);
  return { light, dark };
}

const THEME_VARS = ['bg', 'card', 'raised', 'accent'] as const;

/** Applies the colors to every board, and lets the theme follow them. */
export function applyBoardColors(c: BoardColors | undefined): void {
  const colors = c && isHexColor(c.light) && isHexColor(c.dark) ? c : DEFAULT_BOARD;
  const root = document.documentElement.style;
  root.setProperty('--sq-light', colors.light);
  root.setProperty('--sq-dark', colors.dark);
  root.setProperty('--coord', coordInk(colors));
  const isDefault = colors.light === DEFAULT_BOARD.light && colors.dark === DEFAULT_BOARD.dark;
  const theme = themeFor(colors);
  for (const v of THEME_VARS) {
    // The default board keeps the designed Bottega theme exactly.
    if (isDefault) {
      root.removeProperty(`--theme-${v}-light`);
      root.removeProperty(`--theme-${v}-dark`);
    } else {
      root.setProperty(`--theme-${v}-light`, theme.light[v]);
      root.setProperty(`--theme-${v}-dark`, theme.dark[v]);
    }
  }
}
