import { useEffect, useState } from "react";

interface State<T> {
  data: T | null;
  error: string | null;
  loading: boolean;
}

/**
 * Fetch on dependency change, aborting stale requests. Keeps the previous data
 * while reloading so charts dim instead of flashing empty.
 */
export function useApi<T>(fetcher: (signal: AbortSignal) => Promise<T>, deps: unknown[]): State<T> {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: true });

  useEffect(() => {
    const ctrl = new AbortController();
    setState((s) => ({ ...s, loading: true, error: null }));
    fetcher(ctrl.signal)
      .then((data) => setState({ data, error: null, loading: false }))
      .catch((err: unknown) => {
        if (ctrl.signal.aborted) return;
        setState((s) => ({ ...s, error: err instanceof Error ? err.message : String(err), loading: false }));
      });
    return () => ctrl.abort();
  }, deps); // callers pass their own dependency list

  return state;
}
