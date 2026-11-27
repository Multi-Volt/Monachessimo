import { createStore } from './store';

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

/** Hue in degrees and saturation and lightness from 0 to 1. */
function toHsl(hex: string): [number, number, number] {
  const [r, g, b] = toRgb(hex).map((v) => v / 255) as [number, number, number];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h =
    max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}

function fromHsl(h: number, s: number, l: number): string {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return toHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

export interface Tokens {
  bg: string;
  card: string;
  raised: string;
  text: string;
  text2: string;
  muted: string;
  hairline: string;
  hairlineStrong: string;
  accent: string;
  onAccent: string;
}

export interface ThemeColors {
  light: Tokens;
  dark: Tokens;
}

/** Contrast targets: primary text, secondary text and muted text against every surface. */
export const TARGETS = { text: 12, text2: 7, muted: 4.5, accent: 4.5 } as const;

/**
 * Moves the lightness of a color one step at a time toward black (`dir` -1)
 * or white (`dir` 1) until it meets `min` contrast against every surface.
 */
function reach(
  h: number,
  s: number,
  l: number,
  dir: 1 | -1,
  min: number,
  surfaces: string[],
): string {
  for (let x = l; x >= 0 && x <= 1; x += dir * 0.01) {
    const c = fromHsl(h, s, x);
    if (surfaces.every((b) => contrast(c, b) >= min)) return c;
  }
  return dir < 0 ? '#000000' : '#ffffff';
}

function alpha(hex: string, a: number): string {
  const [r, g, b] = toRgb(hex);
  return `rgb(${r} ${g} ${b} / ${a})`;
}

/**
 * A full palette in the board's hue. Surfaces and text form one neutral
 * ramp with a small amount of the hue, so nothing clashes with the board.
 * Text roles meet fixed contrast targets on every surface. The accent is
 * the board hue at real saturation; a gray board gets a monochrome accent.
 */
export function themeFor(c: BoardColors): ThemeColors {
  const [h, sat] = toHsl(c.dark);
  const gray = sat < 0.08;
  const n = gray ? 0 : Math.min(0.14, sat * 0.35);
  const accentS = gray ? 0 : Math.max(0.45, Math.min(0.75, sat * 1.4));

  const build = (mode: 'light' | 'dark'): Tokens => {
    const light = mode === 'light';
    const bg = fromHsl(h, n, light ? 0.97 : 0.09);
    const card = fromHsl(h, n, light ? 0.995 : 0.12);
    const raised = fromHsl(h, n, light ? 0.925 : 0.17);
    const surfaces = [bg, card, raised];
    const dir = light ? -1 : 1;
    const text = reach(h, n, light ? 0.14 : 0.9, dir, TARGETS.text, surfaces);
    const text2 = reach(h, n, light ? 0.34 : 0.74, dir, TARGETS.text2, surfaces);
    const muted = reach(h, n, light ? 0.44 : 0.62, dir, TARGETS.muted, surfaces);
    let accent: string;
    let onAccent: string;
    if (gray) {
      // No hue to borrow: buttons take the primary text color.
      accent = text;
      onAccent = bg;
    } else {
      onAccent = light ? '#ffffff' : fromHsl(h, n, 0.07);
      accent = reach(h, accentS, light ? 0.45 : 0.62, dir, TARGETS.accent, [onAccent, ...surfaces]);
    }
    return {
      bg,
      card,
      raised,
      text,
      text2,
      muted,
      hairline: alpha(text, 0.1),
      hairlineStrong: alpha(text, 0.22),
      accent,
      onAccent,
    };
  };
  return { light: build('light'), dark: build('dark') };
}

const THEME_VARS = {
  bg: 'bg',
  card: 'card',
  raised: 'raised',
  text: 'text',
  text2: 'text-2',
  muted: 'muted',
  hairline: 'hairline',
  hairlineStrong: 'hairline-strong',
  accent: 'accent',
  onAccent: 'on-accent',
} as const satisfies Record<keyof Tokens, string>;

/** Applies the colors to every board, and lets the theme follow them. */
/**
 * Whether boards are 3D for a player who has not chosen: yes, except in a
 * browser driven by automation, such as the end-to-end tests, which draws
 * without a GPU and tests the 3D board where it chooses it.
 */
export function defaultThree(): boolean {
  return !(typeof navigator !== 'undefined' && navigator.webdriver);
}

/** How boards look: flat or in 3D, and the square colors the 3D board paints. */
export const boardLook = createStore<{ three: boolean; colors: BoardColors }>({
  three: false,
  colors: DEFAULT_BOARD,
});

export function applyBoardColors(c: BoardColors | undefined): void {
  const colors = c && isHexColor(c.light) && isHexColor(c.dark) ? c : DEFAULT_BOARD;
  boardLook.set({ colors });
  const root = document.documentElement.style;
  root.setProperty('--sq-light', colors.light);
  root.setProperty('--sq-dark', colors.dark);
  root.setProperty('--coord', coordInk(colors));
  const isDefault = colors.light === DEFAULT_BOARD.light && colors.dark === DEFAULT_BOARD.dark;
  const theme = themeFor(colors);
  for (const [key, name] of Object.entries(THEME_VARS) as [keyof Tokens, string][]) {
    // The default board keeps the designed Bottega theme exactly.
    if (isDefault) {
      root.removeProperty(`--theme-${name}-light`);
      root.removeProperty(`--theme-${name}-dark`);
    } else {
      root.setProperty(`--theme-${name}-light`, theme.light[key]);
      root.setProperty(`--theme-${name}-dark`, theme.dark[key]);
    }
  }
}
