import { useEffect, useRef, useState } from 'preact/hooks';
import { loadModel, modelState, phrase } from '../play/coachModel';
import type { ExplanationRecord } from '../play/record';
import { useStore } from './store';

/** How long an answer may take before the template's text stays. */
const BUDGET_MS = 90_000;

/**
 * The model's wording of `record` when the player turned the model on, or
 * undefined while there is none: still writing, refused by the checker,
 * too slow, or the model is off or still downloading. Pass the record only
 * once it is final, so the model writes each explanation once.
 */
export function usePhrased(
  record: ExplanationRecord | undefined,
  enabled: boolean,
): string | undefined {
  const { state } = useStore(modelState);
  const [result, setResult] = useState<{ key: string; text: string | undefined }>();
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
    const budget = setTimeout(() => abort.abort(), BUDGET_MS);
    void phrase(r, abort.signal)
      .then((text) => setResult({ key, text }))
      .catch(() => undefined);
    return () => {
      clearTimeout(budget);
      abort.abort();
    };
  }, [ready, key]);

  return ready && result && result.key === key ? result.text : undefined;
}
