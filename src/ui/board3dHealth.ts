// How well this device draws the 3D board. When the GPU drops the board,
// the next try draws a lighter one, and after that the flat board. The step
// and what failed are kept on the device, so Settings can say what happened
// and offer the full board again. GPUs known to drop the full board start
// on the lighter one.
import { createStore } from './store';

export type Board3dQuality = 'full' | 'lite' | 'off';

export interface Board3dFailure {
  /** The GPU, as the browser names it, when it says. */
  gpu?: string;
  /** The drawing buffer when it failed, in device pixels. */
  width: number;
  height: number;
  quality: 'full' | 'lite';
  at: number;
}

interface Health {
  quality: Board3dQuality;
  failure?: Board3dFailure;
  /** The player asked for the full board, so a GPU's reputation does not lower it. */
  forced?: boolean;
}

const KEY = 'monachessimo-board3d';

function read(): Health {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Health | null;
    if (v && (v.quality === 'lite' || v.quality === 'off' || v.forced))
      return {
        quality: v.quality,
        ...(v.failure ? { failure: v.failure } : {}),
        ...(v.forced ? { forced: true } : {}),
      };
  } catch {
    // Storage can be blocked; the full board is tried then.
  }
  return { quality: 'full' };
}

export const board3dHealth = createStore<Health>(read());

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(board3dHealth.get()));
  } catch {
    // Kept for this visit only.
  }
}

/** The board failed at `failure.quality`: step down one level and remember why. */
export function board3dFailed(failure: Board3dFailure): void {
  if (board3dHealth.get().quality === 'off') return;
  board3dHealth.set({ quality: failure.quality === 'full' ? 'lite' : 'off', failure });
  save();
}

/** Tries the full 3D board again, whatever the GPU, forgetting the last failure. */
export function resetBoard3d(): void {
  board3dHealth.set({ quality: 'full', forced: true });
  save();
}

let gpu: string | null | undefined;

/** The GPU's name as WebGL reports it, read once from a throwaway context. */
export function gpuName(): string | undefined {
  if (gpu === undefined) {
    gpu = null;
    try {
      const gl = document.createElement('canvas').getContext('webgl2');
      const info = gl?.getExtension('WEBGL_debug_renderer_info');
      if (gl && info) gpu = String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL));
      gl?.getExtension('WEBGL_lose_context')?.loseContext();
    } catch {
      // No WebGL, or it will not say.
    }
  }
  return gpu ?? undefined;
}

/**
 * GPUs that drop the full board: Imagination's PowerVR, in the Pixel 10
 * phones, lost the WebGL context while the full board was turned, even at
 * 886 by 886 pixels.
 */
export function gpuDropsFullBoard(name = gpuName()): boolean {
  return !!name && /PowerVR/i.test(name);
}

/** The level to draw at now: the saved one, or lighter on a GPU known to drop the full board. */
export function board3dLevel(h: Health = board3dHealth.get()): Board3dQuality {
  if (h.quality === 'full' && !h.forced && gpuDropsFullBoard()) return 'lite';
  return h.quality;
}
