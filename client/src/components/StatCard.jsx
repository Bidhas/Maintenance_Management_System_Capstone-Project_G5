import { useRef } from 'react';

/** Glass stat tile with the gentle tilt-on-hover. `tone`: cy | am | vi | gr2 | rd */
export default function StatCard({ label, value, hint, tone = 'cy', loading }) {
  const ref = useRef(null);
  function move(e) {
    const el = ref.current; if (!el) return;
    const b = el.getBoundingClientRect();
    el.style.setProperty('--ry', `${((e.clientX - b.left) / b.width - 0.5) * 8}deg`);
    el.style.setProperty('--rx', `${-((e.clientY - b.top) / b.height - 0.5) * 8}deg`);
  }
  function leave() { const el = ref.current; if (el) { el.style.setProperty('--rx', '0deg'); el.style.setProperty('--ry', '0deg'); } }
  return (
    <div ref={ref} className="g stat" data-tilt onMouseMove={move} onMouseLeave={leave}>
      <span className="mu sm">{label}</span>
      <b className={tone}>{loading ? '…' : value}</b>
      {hint && !loading && <small className="mu">{hint}</small>}
    </div>
  );
}
