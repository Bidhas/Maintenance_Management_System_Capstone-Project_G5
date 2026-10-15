import { STATUS_CLASS } from '../lib/ui';

export default function StatusPill({ status }) {
  return <span className={`chip ${STATUS_CLASS[status] || 'mu'}`}>{status}</span>;
}
