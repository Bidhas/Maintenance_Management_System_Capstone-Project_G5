// College e-mail rules (Sprint 6, spec item 1 & 6).
//   Student : 02250345.cst@rub.edu.bt   -> digits, then ".cst@rub.edu.bt"
//   Staff   : dorjiphuntsho.cst@rub.edu.bt -> a name, then ".cst@rub.edu.bt"   (teachers and other staff)
// The pattern is the ONLY thing that decides student vs staff, and the only gate for new accounts.
const config = require('../config');

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const domain = () => esc(config.allowedEmailDomain);

/** Classify an email: 'Student' | 'Staff' | null (not allowed). */
function classifyCollegeEmail(email) {
  const e = String(email || '').trim().toLowerCase();
  if (new RegExp(`^\\d{4,12}\\.cst@${domain()}$`).test(e)) return 'Student';
  if (new RegExp(`^[a-z][a-z0-9._-]*\\.cst@${domain()}$`).test(e)) return 'Staff';
  return null;
}

/** "02250345.cst@rub.edu.bt" -> "02250345" (used as the student's college id). */
const collegeIdFromEmail = (email) => (/^(\d+)\.cst@/i.exec(email || '') || [])[1] || null;

module.exports = { classifyCollegeEmail, collegeIdFromEmail };
