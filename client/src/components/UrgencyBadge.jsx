import { URGENCY_CLASS } from '../lib/ui';
import { urgencyLabel } from '../lib/format';

export default function UrgencyBadge({ urgency }) {
  return <span className={`chip ${URGENCY_CLASS[urgency] || 'mu'}`}>{urgencyLabel(urgency)}</span>;
}
