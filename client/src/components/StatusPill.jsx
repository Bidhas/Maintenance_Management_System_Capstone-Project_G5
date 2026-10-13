import { STATUS_STYLE } from '../lib/format';
export default function StatusPill({ status }) {
  return <span className={`text-xs font-semibold ${STATUS_STYLE[status] || 'text-ink/60'}`}>{status}</span>;
}
