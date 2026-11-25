import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';

/**
 * Renders a screen that is loaded on first use, so screens most visits never
 * open stay out of the entry bundle.
 */
export function lazyScreen<P extends object>(
  load: () => Promise<ComponentType<P>>,
): ComponentType<P> {
  let cached: ComponentType<P> | undefined;
  return function LazyScreen(props: P) {
    const [C, setC] = useState(() => cached);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
      if (C) return;
      load()
        .then((c) => {
          cached = c;
          setC(() => c);
        })
        .catch(() => setFailed(true));
    }, []);
    if (failed)
      return (
        <section class="screen">
          <p class="error-text">This screen could not be loaded. Reload the page to try again.</p>
        </section>
      );
    if (!C)
      return (
        <section class="screen">
          <p>Loading…</p>
        </section>
      );
    return <C {...props} />;
  };
}
