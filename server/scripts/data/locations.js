/**
 * The REAL campus locations, transcribed from "New Modifications to the system".
 * Pure data + tiny helpers — no database code here, so it can be unit-tested and edited safely.
 *
 * Shape of every block:
 *   { name, is_hostel, floors?: [{ name, gender?, rooms: [roomSpec...] }], rooms?: [roomSpec...] }
 *   - Hostels and the Staff Quarters use `floors` (a "floor" = floor of a hostel, or a quarter group).
 *   - Other buildings just have a flat `rooms` list.
 * A roomSpec is a string ("CR01") or { no, kitchen?, student? }.
 *   kitchen = true   -> room is a kitchen (numbers starting with K)
 *   student = true   -> students may select it (classrooms / learning spaces). Hostel rooms are always student-visible.
 */
const range = (prefix, from, to, pad = 0) =>
  Array.from({ length: to - from + 1 }, (_, i) => `${prefix}${String(from + i).padStart(pad, '0')}`);
const kitchens = (...nos) => nos.map((no) => ({ no, kitchen: true }));

// ---- Hostels. Each floor lists its rooms; K-prefixed rooms are kitchens -----------------
const floor = (n, rooms) => ({ name: `Floor ${n}`, rooms });
const HOSTELS_BOYS = [
  { name: 'RKA Hostel', floors: [
      floor(1, range('', 101, 112)), floor(2, range('', 201, 212)), floor(3, range('', 301, 312)), floor(4, range('', 401, 412))] },
  { name: 'RKB Hostel', floors: [
      floor(1, range('', 113, 124)), floor(2, range('', 213, 227)), floor(3, range('', 313, 324)), floor(4, range('', 413, 424))] },
  { name: 'HE Hostel', floors: [floor(1, range('', 101, 112)), floor(2, range('', 201, 233))] },
  { name: 'HA Hostel', floors: [floor(1, range('', 101, 113)), floor(2, range('', 201, 214)), floor(3, range('', 301, 314))] },
  { name: 'HB Hostel', floors: [floor(1, range('', 101, 113)), floor(2, range('', 201, 214)), floor(3, range('', 301, 314))] },
  { name: 'NK Hostel', floors: [
      floor(1, [...range('', 101, 108), ...kitchens('K101', 'K102')]),
      floor(2, [...range('', 201, 208), ...kitchens('K201', 'K202')]),
      floor(3, [...range('', 301, 308), ...kitchens('K301', 'K302')]),
      floor(4, [...range('', 401, 408), ...kitchens('K401', 'K402')])] },
  { name: 'LH Hostel', floors: [
      floor(1, range('', 101, 102)),
      floor(2, [...range('', 201, 207), ...kitchens('K201')]),
      floor(3, [...range('', 301, 309), ...kitchens('K301')]),
      floor(4, [...range('', 401, 407), ...kitchens('K401')]),
      floor(5, range('', 501, 502))] },
];
const HOSTELS_GIRLS = [
  { name: 'HC Hostel', floors: [floor(1, range('', 101, 113)), floor(2, range('', 201, 214)), floor(3, range('', 301, 314))] },
  { name: 'HD Hostel', floors: [floor(1, range('', 101, 113)), floor(2, range('', 201, 214)), floor(3, range('', 301, 314))] },
  { name: 'HF Hostel', floors: [floor(1, range('', 101, 124)), floor(2, range('', 201, 223)), floor(3, range('', 301, 323))] },
];

// ---- Staff quarters: groups A..H, each unit is a "room" ---------------------------------
const quarterGroup = (name, units) => ({ name: `Group ${name}`, rooms: units });
const STAFF_QUARTERS = {
  name: 'Staff Quarters', is_hostel: false,
  floors: [
    quarterGroup('A', range('A', 1, 12)),
    quarterGroup('B', range('B', 1, 12)),
    quarterGroup('C', range('C', 1, 6)),
    quarterGroup('D', range('D', 1, 6)),
    quarterGroup('E', range('E', 1, 6)),
    quarterGroup('F', [...range('F', 1, 6).map((x) => `${x}a`), ...range('F', 1, 6).map((x) => `${x}b`)]),
    quarterGroup('H', ['H1', 'H2']),
  ],
};

// ---- Other buildings ---------------------------------------------------------------------
const S = (no) => ({ no, student: true }); // student-visible (a class / learning space)
const ACADEMIC = {
  name: 'Academic Building', is_hostel: false,
  rooms: [...range('CR', 1, 13, 2).map(S), S('Engineering Mechanics Lab'), S('Teamwork Hall'), S('Smart Classroom'), 'GNH Hall'],
};
const LIBRARY = {
  name: 'Library Building', is_hostel: false,
  rooms: [
    'Book Room 1', 'Book Room 2', 'Reading Room GF', 'Reading Room FF', 'Counter Room', 'Training Hall 1', 'Training Hall 2',
    ...range('Staff Office ', 1, 11),
    ...range('CR', 14, 18, 2).map(S),
    ...range('Drawing Studio ', 1, 5).map(S),
    // "(check the numbers)" in the source document: seeded as ONE placeholder room — add the real
    // numbers in Settings > Locations > Rooms (bulk add) once confirmed.
    'Architecture Department Office',
    S('Renewable Lab'), "SSO's Office (Male)", "SSO's Office (Female)", 'Infirmary', 'Beauty Parlor',
  ],
};
const ADMINISTRATION = {
  name: 'Administration Building', is_hostel: false,
  rooms: [
    'Prayer Hall', 'President Office', 'PA Office', 'Integrity Hall', 'Administrative Assistant Office 1', 'Administrative Assistant Office 2',
    'DAA Office', "Accountant's Office", 'Finance Officer Office', "Administrative Officer's Office", 'Enterprise Hall', 'Exam Cell',
    // "(check the numbers)" entries: one placeholder each until the real room numbers are confirmed.
    'DRIL Office', 'ECE Faculty Office', 'Electrical Faculty Office', 'SHD Faculty Office', 'CEED Faculty Office',
    'DSA Office', 'Quality Hall', 'ICT Office', 'Carpentry and Electrician Office', 'Estate Manager Office', 'Plumber Office',
    "Barath Sir's Office", 'Site Engineer Office', "MED PL's Office", "Dorji Wangchuk's Office", 'GNH Canteen', 'Server Room',
    'Exam Paper Store', 'Store Incharge Office', 'Estate Store 1', 'Estate Store 2',
  ],
};

/** Final list the seed script loads. Gender is applied to every floor of a hostel. */
const BLOCKS = [
  ...HOSTELS_BOYS.map((h) => ({ ...h, is_hostel: true, gender: 'M' })),
  ...HOSTELS_GIRLS.map((h) => ({ ...h, is_hostel: true, gender: 'F' })),
  STAFF_QUARTERS, ACADEMIC, LIBRARY, ADMINISTRATION,
];

/** Normalise a roomSpec to { no, kitchen, student }. */
const spec = (r, isHostel) => {
  const o = typeof r === 'string' ? { no: r } : r;
  return { no: o.no, kitchen: !!o.kitchen, student: isHostel ? true : !!o.student };
};

module.exports = { BLOCKS, spec, range };
