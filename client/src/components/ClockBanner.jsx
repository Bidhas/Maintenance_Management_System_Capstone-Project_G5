import { formatDateTime } from '../lib/format';

/** Shows whether the duty window is open right now (and says so when the demo clock is simulated). */
export default function ClockBanner({ duty }) {
  if (!duty) return null;
  const simulated = Math.abs(new Date(duty.now).getTime() - Date.now()) > 5 * 60 * 1000;
  const when = new Date(duty.now).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: duty.tz });
  return (
    <div className="g banner">
      <span className={`pulse${duty.in_window ? ' on' : ''}`} />
      <div className="grow">
        <b>{duty.in_window ? 'Technicians are on duty now' : 'Outside the duty window'}</b>
        <div className="mu sm">
          {duty.in_window
            ? 'New requests are assigned straight away.'
            : `Requests are queued and assigned automatically. Next window: ${formatDateTime(duty.next_window)}.`}
        </div>
      </div>
      <span className="mu sm nowrap">{simulated ? `Demo clock: ${when}` : when}</span>
    </div>
  );
}
