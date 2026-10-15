import { useEffect, useRef } from 'react';

/** Calls `fn` every `ms` milliseconds while the tab is open (pauses when hidden). */
export default function usePolling(fn, ms = 20000) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    const id = setInterval(() => { if (!document.hidden) ref.current(); }, ms);
    return () => clearInterval(id);
  }, [ms]);
}
