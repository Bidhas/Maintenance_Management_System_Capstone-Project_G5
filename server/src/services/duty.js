// Duty window: weekday evenings 7–9 PM, plus all day on weekends (Asia/Thimphu time),
// as specified. A technician's duty_override (true/false) takes priority over the
// schedule; null means "follow the automatic schedule."
const TZ = process.env.TZ_NAME || 'Asia/Thimphu';

// Dev/demo-only clock offset, so an admin can preview routing behaviour at different
// times of day without waiting for a real duty window. In-memory, resets on restart,
// never used outside the "simulate clock" admin control.
let simOffsetMs = 0;
const now = () => new Date(Date.now() + simOffsetMs);
function setSimClock(mode) {
  if (mode === 'live') { simOffsetMs = 0; return; }
  const base = new Date();
  for (let i = 0; i <= 200; i++) {
    const candidate = new Date(base.getTime() + i * 3600 * 1000);
    const { weekday, hour } = parts(candidate);
    const isWeekday = weekday !== 'Sat' && weekday !== 'Sun';
    if ((mode === 'duty-weekday' && isWeekday && hour === 20) ||
        (mode === 'offduty-weekday' && isWeekday && hour === 11) ||
        (mode === 'weekend' && weekday === 'Sat' && hour === 11)) {
      simOffsetMs = candidate.getTime() - base.getTime();
      return;
    }
  }
}

function parts(date) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  return { weekday: p.find((x) => x.type === 'weekday').value, hour: Number(p.find((x) => x.type === 'hour').value) };
}

/** Is `date` (default: the current — possibly simulated — time) inside the automatic duty window? */
function isDutyWindow(date = now()) {
  const { weekday, hour } = parts(date);
  return weekday === 'Sat' || weekday === 'Sun' || (hour >= 19 && hour < 21);
}

/** Is this technician row currently on duty, honouring their manual override? */
function isOnDuty(tech, date = now()) {
  return tech.duty_override === null || tech.duty_override === undefined ? isDutyWindow(date) : tech.duty_override;
}

/** ISO timestamp of the next time the automatic duty window opens (for "next review" messaging). */
function nextDutyWindow(date = now()) {
  if (isDutyWindow(date)) return date.toISOString();
  for (let i = 1; i <= 200; i++) {
    const candidate = new Date(date.getTime() + i * 3600 * 1000);
    if (isDutyWindow(candidate)) {
      candidate.setMinutes(0, 0, 0);
      return candidate.toISOString();
    }
  }
  return null;
}

module.exports = { isDutyWindow, isOnDuty, nextDutyWindow, now, setSimClock, TZ };
