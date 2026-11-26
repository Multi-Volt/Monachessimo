import { useEffect, useRef, useState } from 'preact/hooks';
import { loadModel, modelState, phrase } from '../play/coachModel';
import type { ExplanationRecord } from '../play/record';
import { useStore } from './store';

/** How long an answer may take before the template's text stays. */
const BUDGET_MS = 90_000;

export interface Phrased {
  /** The model's accepted wording, once there is one. */
  text?: string;
  /** What the model is doing instead, for a line under the template. */
  status?: string;
}

/**
 * The model's wording of `record` when the player turned the model on, and
 * otherwise a short status: downloading, writing, refused by the checker,
 * too slow, or failed to load. Pass the record only once it is final, so
 * the model writes each explanation once.
 */
export function usePhrased(record: ExplanationRecord | undefined, enabled: boolean): Phrased {
  const { state } = useStore(modelState);
  const [result, setResult] = useState<{ key: string; text?: string; slow?: boolean }>();
  // A record is built afresh on each render; its contents say when it changed.
  const key = record ? JSON.stringify(record) : undefined;
  const latest = useRef(record);
  latest.current = record;

  useEffect(() => {
    if (enabled) void loadModel().catch(() => undefined);
  }, [enabled]);

  const ready = enabled && state.kind === 'ready';
  useEffect(() => {
    const r = latest.current;
    if (!ready || !key || !r) return;
    const abort = new AbortController();
    let slow = false;
    const budget = setTimeout(() => {
      slow = true;
      abort.abort();
    }, BUDGET_MS);
    void phrase(r, abort.signal)
      .then((text) => setResult({ key, ...(text ? { text } : {}) }))
      .catch(() => {
        if (slow) setResult({ key, slow: true });
      });
    return () => {
      clearTimeout(budget);
      abort.abort();
    };
  }, [ready, key]);

  if (!enabled || !key) return {};
  if (state.kind === 'loading')
    return {
      status: `The model is downloading, ${Math.round((100 * state.loaded) / Math.max(1, state.total))}%.`,
    };
  if (state.kind === 'failed') return { status: `The model could not load: ${state.message}` };
  if (state.kind !== 'ready') return { status: 'The model is starting.' };
  if (!result || result.key !== key) return { status: 'The model is writing.' };
  if (result.text) return { text: result.text };
  return {
    status: result.slow
      ? 'The model took too long, so the notes stay.'
      : "The model's wording did not match the notes, so the notes stay.",
  };
}
