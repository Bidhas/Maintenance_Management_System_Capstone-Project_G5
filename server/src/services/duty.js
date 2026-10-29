// Working hours (Asia/Thimphu time) — Sprint 6 rules:
//   • Volunteer technicians : 7 PM – 9 PM, every day of the week (weekdays AND weekends)
//   • Main technicians      : 8 AM – 5 PM, every day of the week
// A technician's duty_override (true/false) still beats the schedule; null = follow the schedule.
const TZ = process.env.TZ_NAME || 'Asia/Thimphu';

/** The one place the hours are defined. [startHour, endHour) in 24h local time. */
const HOURS = {
  Volunteer: { start: 19, end: 21, label: '7 PM – 9 PM' },
  Main: { start: 8, end: 17, label: '8 AM – 5 PM' },
};

// Dev/demo-only clock offset so an admin can preview behaviour at different times of day.
// In-memory only; resets on restart; never touches real data.
let simOffsetMs = 0;
const now = () => new Date(Date.now() + simOffsetMs);

function parts(date) {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(date);
  return { weekday: p.find((x) => x.type === 'weekday').value, hour: Number(p.find((x) => x.type === 'hour').value) };
}

/**
 * Simulated clock modes (admin demo control):
 *   live            real time
 *   main-hours      11 AM  -> Main technicians on duty, Volunteers off
 *   volunteer-hours  8 PM  -> Volunteers on duty, Mains off
 *   all-off          2 AM  -> nobody on duty
 * Legacy mode names used by older tests/UI are mapped onto the new ones.
 */
const MODE_HOUR = { 'main-hours': 11, 'volunteer-hours': 20, 'all-off': 2 };
const LEGACY = { 'duty-weekday': 'volunteer-hours', 'weekend': 'main-hours', 'offduty-weekday': 'all-off' };
function setSimClock(mode) {
  mode = LEGACY[mode] || mode;
  if (mode === 'live') { simOffsetMs = 0; return; }
  const target = MODE_HOUR[mode];
  if (target === undefined) return;
  const base = new Date();
  for (let i = 0; i <= 48; i++) {
    const candidate = new Date(base.getTime() + i * 3600 * 1000);
    if (parts(candidate).hour === target) { simOffsetMs = candidate.getTime() - base.getTime(); return; }
  }
}

/** Is `date` inside the working hours of this tier ('Main' | 'Volunteer')? */
function isWorkingHours(tier, date = now()) {
  const h = HOURS[tier === 'Volunteer' ? 'Volunteer' : 'Main'];
  const { hour } = parts(date);
  return hour >= h.start && hour < h.end;
}

/** Is this technician row on duty now? (manual override first, otherwise their tier's hours) */
function isOnDuty(tech, date = now()) {
  return tech.duty_override === null || tech.duty_override === undefined ? isWorkingHours(tech.tier, date) : tech.duty_override;
}

/** ISO time of the next moment this tier's working hours open (now if already open). */
function nextWindow(tier, date = now()) {
  if (isWorkingHours(tier, date)) return date.toISOString();
  for (let i = 1; i <= 48; i++) {
    const c = new Date(date.getTime() + i * 3600 * 1000);
    if (isWorkingHours(tier, c)) { c.setMinutes(0, 0, 0); return c.toISOString(); }
  }
  return null;
}

/** Everything the client banners need, in one object. */
function dutyInfo(date = now()) {
  return {
    now: date.toISOString(),
    tz: TZ,
    main: { open: isWorkingHours('Main', date), hours: HOURS.Main.label, next: nextWindow('Main', date) },
    volunteer: { open: isWorkingHours('Volunteer', date), hours: HOURS.Volunteer.label, next: nextWindow('Volunteer', date) },
    // kept for older client code: "is anyone on duty by schedule right now?"
    in_window: isWorkingHours('Main', date) || isWorkingHours('Volunteer', date),
    next_window: [nextWindow('Main', date), nextWindow('Volunteer', date)].filter(Boolean).sort()[0] || null,
  };
}

module.exports = { HOURS, isWorkingHours, isOnDuty, nextWindow, dutyInfo, now, setSimClock, TZ };
