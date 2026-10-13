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
        secure: config.smtp.port === 465,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      })
    : nodemailer.createTransport({ jsonTransport: true }); // no SMTP configured: emails are logged only
  return transporter;
}

async function sendEmail(to, subject, text) {
  if (config.isTest) return;
  try {
    const info = await getTransporter().sendMail({ from: config.smtp.from, to, subject, text });
    if (!config.smtp.host) console.log(`[email:dev] to=${to} subject="${subject}"`);
    return info;
  } catch (err) {
    // Failed delivery must never block the underlying action (US-24)
    console.error('Email failed:', err.message);
  }
}

/**
 * Create an in-app notification (a row in NOTIFICATION) and send an email,
 * honouring both the system-wide toggles and the recipient's own preferences.
 */
async function notify({ role, id, requestId, title, message, type = 'Update' }) {
  try {
    const { table, idCol } = ROLES[role];
    const cols = role === 'admin' ? 'email, TRUE AS email_notifications, TRUE AS inapp_notifications'
                                  : 'email, email_notifications, inapp_notifications';
    const { rows } = await query(`SELECT ${cols} FROM ${table} WHERE ${idCol} = $1`, [id]);
    const rec = rows[0];
    if (!rec) return;
    const settings = await getSettings();

    if (settings.notify_inapp_enabled && rec.inapp_notifications) {
      await query(
        `INSERT INTO notification (request_id, message, recipient_role, recipient_id, title, type)
         VALUES ($1,$2,$3,$4,$5,$6)`,
        [requestId, message, role, id, title, type]
      );
    }
    if (settings.notify_email_enabled && rec.email_notifications) {
      // fire and forget
      sendEmail(rec.email, `[CMMS] ${title}`, `${message}\n\nOpen CMMS: ${config.appUrl}`);
    }
  } catch (err) {
    console.error('notify failed:', err.message);
  }
}

/** Notifies every active admin about a request. */
async function notifyAdmins(requestId, title, message, type) {
  const { rows } = await query('SELECT admin_id FROM admin WHERE is_active');
  await Promise.all(rows.map((a) => notify({ role: 'admin', id: a.admin_id, requestId, title, message, type })));
}

module.exports = { notify, notifyAdmins, sendEmail };
