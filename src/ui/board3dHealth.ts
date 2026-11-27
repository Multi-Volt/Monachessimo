// How well this device draws the 3D board. When the GPU drops the board,
// the next try draws a lighter one, and after that the flat board. The step
// and what failed are kept on the device, so Settings can say what happened
// and offer the full board again.
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

const KEY = 'monachessimo-board3d';

function read(): { quality: Board3dQuality; failure?: Board3dFailure } {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as {
      quality?: Board3dQuality;
      failure?: Board3dFailure;
    } | null;
    if (v?.quality === 'lite' || v?.quality === 'off')
      return { quality: v.quality, ...(v.failure ? { failure: v.failure } : {}) };
  } catch {
    // Storage can be blocked; the full board is tried then.
  }
  return { quality: 'full' };
}

export const board3dHealth = createStore<{ quality: Board3dQuality; failure?: Board3dFailure }>(
  read(),
);

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(board3dHealth.get()));
  } catch {
    // Kept for this visit only.
  }
}

/** The board failed at `failure.quality`: step down one level and remember why. */
export function board3dFailed(failure: Board3dFailure): void {
  const now = board3dHealth.get().quality;
  if (now === 'off') return;
  board3dHealth.set({ quality: failure.quality === 'full' ? 'lite' : 'off', failure });
  save();
}

/** Tries the full 3D board again, forgetting the last failure. */
export function resetBoard3d(): void {
  board3dHealth.set({ quality: 'full' });
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing kept.
  }
}
