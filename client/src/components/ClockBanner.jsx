import { formatDateTime } from '../lib/format';

/**
 * Shows the two working-hour windows (Sprint 6): Main technicians 8 AM–5 PM, Volunteers 7–9 PM, every day.
 * Says so when the admin's demo clock is simulating a different time.
 */
export default function ClockBanner({ duty }) {
  if (!duty?.main) return null;
  const simulated = Math.abs(new Date(duty.now).getTime() - Date.now()) > 5 * 60 * 1000;
  const when = new Date(duty.now).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit', timeZone: duty.tz });
  const open = duty.main.open || duty.volunteer.open;
  const next = [duty.main.next, duty.volunteer.next].filter(Boolean).sort()[0];
  return (
    <div className="g banner">
      <span className={`pulse${open ? ' on' : ''}`} />
      <div className="grow">
        <b>{open ? `${duty.main.open ? 'Main technicians' : 'Volunteer technicians'} are on duty now` : 'No technicians are on duty right now'}</b>
        <div className="mu sm">
          Main technicians {duty.main.hours} · Volunteers {duty.volunteer.hours}, every day.
          {!open && next ? ` Next shift starts ${formatDateTime(next)}.` : ''}
        </div>
      </div>
      <span className="mu sm nowrap">{simulated ? `Demo clock: ${when}` : when}</span>
    </div>
  );
}
