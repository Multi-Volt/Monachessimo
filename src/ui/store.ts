import { useEffect, useState } from 'preact/hooks';

export interface Store<T> {
  get(): T;
  set(patch: Partial<T>): void;
  subscribe(l: (v: T) => void): () => void;
}

/** Minimal observable value for state shared between screens. */
export function createStore<T extends object>(initial: T): Store<T> {
  let value = initial;
  const listeners = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(patch) {
      value = { ...value, ...patch };
      for (const l of listeners) l(value);
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

export function useStore<T>(store: Store<T>): T {
  const [v, setV] = useState(store.get());
  useEffect(() => {
    const off = store.subscribe(setV);
    // Pick up changes made between the first render and this effect.
    setV(store.get());
    return off;
  }, [store]);
  return v;
}
