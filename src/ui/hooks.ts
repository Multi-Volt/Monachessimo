import { useEffect, useState } from 'preact/hooks';
import { getServices, type Services } from '../app/services';
import type { RunnerState } from '../analysis/runner';

export type Async<T> =
  { status: 'loading' } | { status: 'ok'; value: T } | { status: 'error'; error: string };

/**
 * Runs an async loader when deps change and returns its state. Until the
 * loader finishes for the current deps, the state is "loading", so a screen
 * never sees a result that belongs to earlier inputs.
 */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): Async<T> & { reload: () => void } {
  const [state, setState] = useState<{ result: Async<T>; deps: unknown[] }>({
    result: { status: 'loading' },
    deps: [],
  });
  const [tick, setTick] = useState(0);
  const current = [...deps, tick];
  useEffect(() => {
    let live = true;
    const forDeps = current;
    load().then(
      (value) => live && setState({ result: { status: 'ok', value }, deps: forDeps }),
      (err: unknown) =>
        live &&
        setState({
          result: { status: 'error', error: err instanceof Error ? err.message : String(err) },
          deps: forDeps,
        }),
    );
    return () => {
      live = false;
    };
  }, current);
  const fresh = state.deps.length === current.length && state.deps.every((d, i) => Object.is(d, current[i]));
  const result: Async<T> = fresh ? state.result : { status: 'loading' };
  return { ...result, reload: () => setTick((t) => t + 1) };
}

export function useServices(): Services | undefined {
  const [s, setS] = useState<Services>();
  useEffect(() => {
    void getServices().then(setS);
  }, []);
  return s;
}

export function useRunner(services: Services | undefined): RunnerState | undefined {
  const [state, setState] = useState<RunnerState>();
  useEffect(() => services?.runner.subscribe(setState), [services]);
  return state;
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(navigator.onLine);
    addEventListener('online', on);
    addEventListener('offline', on);
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', on);
    };
  }, []);
  return online;
}
