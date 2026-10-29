// In-app notifications + email (Nodemailer).
//
// Safety rules that keep this from ever breaking the app:
//   1. notify() NEVER throws — every failure is logged and swallowed.
//   2. Email is "fire and forget": we do not wait for the SMTP server before answering the user.
//   3. SMTP has short timeouts, so a dead mail server can't pile up hanging connections.
//   4. With no SMTP_HOST configured, emails are only printed to the console (dev) — nothing is sent.
//   5. Callers must invoke this AFTER their DB transaction commits (see notifyFlow.js).
const nodemailer = require('nodemailer');
const config = require('../config');
const { query } = require('../db');
const { ROLES } = require('../utils/roles');
const { getSettings } = require('./settings');

let transporter;
function getTransporter() {
  if (transporter) return transporter;
  transporter = config.smtp.host
    ? nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465, // 465 = implicit TLS; 587 = STARTTLS (handled automatically)
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
      })
    : nodemailer.createTransport({ jsonTransport: true }); // nothing configured: log only
  return transporter;
}

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Sends one email. Never throws. `link` is an absolute URL to the page the person should open. */
async function sendEmail(to, subject, text, link) {
  if (config.isTest) return;
  try {
    const open = link || config.appUrl;
    const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px">
      <h3 style="margin:0 0 8px">${esc(subject.replace(/^\[CampusCare\]\s*/, ''))}</h3>
      <p style="margin:0 0 16px;color:#333">${esc(text)}</p>
      <p><a href="${esc(open)}" style="background:#2563eb;color:#fff;padding:9px 16px;border-radius:8px;text-decoration:none">Open CampusCare</a></p>
      <p style="color:#888;font-size:12px">College of Science &amp; Technology — Maintenance Management. You can turn email notifications off on your Profile page.</p></div>`;
    const info = await getTransporter().sendMail({ from: config.smtp.from, to, subject, text: `${text}\n\nOpen CampusCare: ${open}`, html });
    if (!config.smtp.host) console.log(`[email:dev] to=${to} subject="${subject}"`);
    return info;
  } catch (err) {
    console.error('Email failed:', err.message); // a failed email must never block the underlying action
  }
}

/**
 * Create an in-app notification row and send an email, honouring the system-wide switches
 * (Settings) and the recipient's own preferences (Profile). Never throws.
 */
async function notify({ role, id, requestId, title, message, type = 'Update' }) {
  try {
    const { table, idCol } = ROLES[role];
    const cols = role === 'admin' ? 'email, TRUE AS email_notifications, TRUE AS inapp_notifications' : 'email, email_notifications, inapp_notifications';
    const { rows } = await query(`SELECT ${cols} FROM ${table} WHERE ${idCol} = $1 AND is_active`, [id]);
    const rec = rows[0];
    if (!rec) return;
    const settings = await getSettings();
    if (settings.notify_inapp_enabled && rec.inapp_notifications) {
      await query(
        `INSERT INTO notification (request_id, message, recipient_role, recipient_id, title, type) VALUES ($1,$2,$3,$4,$5,$6)`,
        [requestId ?? null, message, role, id, title, type]);
    }
    if (settings.notify_email_enabled && rec.email_notifications && rec.email) {
      const link = requestId ? `${config.appUrl}/requests/${requestId}` : `${config.appUrl}/notifications`;
      sendEmail(rec.email, `[CampusCare] ${title}`, message, link); // not awaited on purpose
    }
  } catch (err) {
    console.error('notify failed:', err.message);
  }
}

/** Notifies every active admin. Never throws. */
async function notifyAdmins(requestId, title, message, type) {
  try {
    const { rows } = await query('SELECT admin_id FROM admin WHERE is_active');
    await Promise.all(rows.map((a) => notify({ role: 'admin', id: a.admin_id, requestId, title, message, type })));
  } catch (err) {
    console.error('notifyAdmins failed:', err.message);
  }
}

module.exports = { notify, notifyAdmins, sendEmail };
