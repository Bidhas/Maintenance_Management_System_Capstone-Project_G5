import { useEffect, useRef, useState } from 'react';

const GIS_SRC = 'https://accounts.google.com/gsi/client';

/** Loads Google's script once (shared by every mount) and resolves when window.google.accounts.id exists. */
let gisPromise;
function loadGis() {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisPromise) {
    gisPromise = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = GIS_SRC; s.async = true; s.defer = true;
      s.onload = resolve;
      s.onerror = () => { gisPromise = null; reject(new Error('Could not load Google sign-in')); };
      document.head.appendChild(s);
    });
  }
  return gisPromise;
}

/**
 * Renders Google's official "Sign in with Google" button.
 *  - clientId:  from /api/auth/config (so no rebuild is needed to change it)
 *  - onCredential(idToken): called when the person picks an account; we send the token to OUR server to verify
 *  - hostedDomain: hint so Google's account chooser prefers college accounts (a hint only — the server enforces the rule)
 * If Google's script is blocked (offline / firewall) the `failed` message is shown instead of a blank gap.
 */
export default function GoogleButton({ clientId, onCredential, hostedDomain }) {
  const box = useRef(null);
  const cb = useRef(onCredential);
  const [failed, setFailed] = useState(false);
  useEffect(() => { cb.current = onCredential; }, [onCredential]);

  useEffect(() => {
    let cancelled = false;
    loadGis().then(() => {
      if (cancelled || !box.current) return;
      window.google.accounts.id.initialize({
        client_id: clientId,
        callback: (resp) => cb.current?.(resp.credential),
        hd: hostedDomain || undefined,
        ux_mode: 'popup',
        auto_select: false,
      });
      window.google.accounts.id.renderButton(box.current, { theme: 'filled_blue', size: 'large', text: 'continue_with', shape: 'pill', width: 320, logo_alignment: 'left' });
    }).catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [clientId, hostedDomain]);

  if (failed) return <p className="text-sm text-mu">Google sign-in could not load. Check your internet connection or try a different network, then refresh.</p>;
  return <div ref={box} className="flex justify-center min-h-[44px]" />;
}
