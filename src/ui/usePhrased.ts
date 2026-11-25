import { useEffect, useState } from 'preact/hooks';
import { loadModel, modelState, phrase } from '../play/coachModel';
import { useStore } from './store';

/** How long an answer may take before the template's text stays. */
const BUDGET_MS = 90_000;

/**
 * The model's wording of `sheet` when the player turned the model on, or
 * undefined while there is none: still writing, refused by the checker,
 * too slow, or the model is off or still downloading. Pass the sheet only
 * once it is final, so the model writes each explanation once.
 */
export function usePhrased(sheet: string | undefined, enabled: boolean): string | undefined {
  const { state } = useStore(modelState);
  const [result, setResult] = useState<{ sheet: string; text: string | undefined }>();

  useEffect(() => {
    if (enabled) void loadModel().catch(() => undefined);
  }, [enabled]);

  const ready = enabled && state.kind === 'ready';
  useEffect(() => {
    if (!ready || !sheet) return;
    const abort = new AbortController();
    const budget = setTimeout(() => abort.abort(), BUDGET_MS);
    void phrase(sheet, abort.signal)
      .then((text) => setResult({ sheet, text }))
      .catch(() => undefined);
    return () => {
      clearTimeout(budget);
      abort.abort();
    };
  }, [ready, sheet]);

  return ready && result && result.sheet === sheet ? result.text : undefined;
}
