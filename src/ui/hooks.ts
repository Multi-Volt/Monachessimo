import { useEffect, useState } from 'preact/hooks';
import { getServices, type Services } from '../app/services';
import type { RunnerState } from '../analysis/runner';

export type Async<T> =
  { status: 'loading' } | { status: 'ok'; value: T } | { status: 'error'; error: string };

/** Runs an async loader when deps change and returns its state. */
export function useAsync<T>(
  load: () => Promise<T>,
  deps: unknown[],
): Async<T> & { reload: () => void } {
  const [state, setState] = useState<Async<T>>({ status: 'loading' });
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    setState({ status: 'loading' });
    load().then(
      (value) => live && setState({ status: 'ok', value }),
      (err: unknown) =>
        live &&
        setState({ status: 'error', error: err instanceof Error ? err.message : String(err) }),
    );
    return () => {
      live = false;
    };
  }, [...deps, tick]);
  return { ...state, reload: () => setTick((t) => t + 1) };
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
