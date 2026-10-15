import { useCallback, useEffect, useRef, useState } from 'react';
import { apiError } from '../lib/api';

/**
 * Runs `fn` on mount and whenever `deps` change. Returns { data, error, loading, reload }.
 * `reload()` re-runs without flashing the loading state.
 */
export default function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: '', loading: true });
  const fnRef = useRef(fn);
  fnRef.current = fn;
  const seq = useRef(0);

  const run = useCallback(async (silent) => {
    const id = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: true, error: '' }));
    try {
      const data = await fnRef.current();
      if (id === seq.current) setState({ data, error: '', loading: false });
    } catch (err) {
      if (id === seq.current) setState((s) => ({ data: silent ? s.data : null, error: apiError(err).message, loading: false }));
    }
  }, []);

  useEffect(() => { run(false); }, deps); // eslint-disable-line react-hooks/exhaustive-deps
  const reload = useCallback(() => run(true), [run]);
  return { ...state, reload };
}
