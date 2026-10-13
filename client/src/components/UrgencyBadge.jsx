import { urgencyBadge, urgencyLabel } from '../lib/format';
export default function UrgencyBadge({ urgency }) {
  return <span className={urgencyBadge(urgency)}>{urgencyLabel(urgency)}</span>;
}
