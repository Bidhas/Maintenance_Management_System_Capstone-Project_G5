import { useEffect, useRef } from 'react';

/** Looping video background + gradient overlay + two slow-drifting glow blobs + a
 * cursor-follow radial glow. Mounted once, globally, behind everything (negative z-index). */
export function AmbientBackground() {
  return (
    <>
      <video id="vid" autoPlay muted loop playsInline poster="/logo.png">
        <source src="/bg.mp4" type="video/mp4" />
      </video>
      <div id="ov" />
      <div className="bl b1" />
      <div className="bl b2" />
      <div id="glow" />
    </>
  );
}

/** Global mouse-driven effects: tilt on any [data-tilt] element, and a ripple burst
 * on every .btn click. Mounted once near the root. */
export function AmbientEffects() {
  const raf = useRef(null);
  useEffect(() => {
    const onMove = (e) => {
      if (raf.current) return;
      raf.current = requestAnimationFrame(() => {
        raf.current = null;
        const glow = document.getElementById('glow');
        if (glow) glow.style.transform = `translate(${e.clientX}px, ${e.clientY}px)`;
        const card = e.target.closest && e.target.closest('[data-tilt]');
        if (card) {
          const r = card.getBoundingClientRect();
          card.style.setProperty('--ry', `${((e.clientX - r.left) / r.width - 0.5) * 10}deg`);
          card.style.setProperty('--rx', `${-((e.clientY - r.top) / r.height - 0.5) * 10}deg`);
        }
      });
    };
    const onClick = (e) => {
      const btn = e.target.closest && e.target.closest('.btn');
      if (!btn) return;
      const ripple = document.createElement('span');
      const rect = btn.getBoundingClientRect();
      ripple.className = 'rp';
      ripple.style.cssText = `width:30px;height:30px;left:${e.clientX - rect.left - 15}px;top:${e.clientY - rect.top - 15}px`;
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 600);
    };
    addEventListener('mousemove', onMove);
    addEventListener('click', onClick);
    return () => { removeEventListener('mousemove', onMove); removeEventListener('click', onClick); };
  }, []);
  return null;
}
