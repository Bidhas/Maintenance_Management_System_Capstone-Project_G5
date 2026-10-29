/**
 * Sends ONE test email using the SMTP_* settings in server/.env, and tells you exactly what happened.
 *   npm run email:test -- someone@example.com
 * Use it right after filling in SMTP_HOST / SMTP_USER / SMTP_PASS, BEFORE relying on email notifications.
 */
const nodemailer = require('nodemailer');
const config = require('../src/config');

async function main() {
  const to = process.argv[2];
  if (!to) { console.error('Usage: npm run email:test -- you@example.com'); process.exit(1); }
  if (!config.smtp.host) { console.error('SMTP_HOST is not set in server/.env, so emails are only logged, never sent. Fill in the SMTP_* lines first.'); process.exit(1); }
  const t = nodemailer.createTransport({
    host: config.smtp.host, port: config.smtp.port, secure: config.smtp.port === 465,
    auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
    connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000,
  });
  try {
    await t.verify(); // checks host, port, TLS and the login WITHOUT sending anything
    console.log('SMTP connection and login OK.');
    const info = await t.sendMail({ from: config.smtp.from, to, subject: '[CampusCare] Test email', text: 'If you can read this, CampusCare email notifications work.' });
    console.log('Sent. Server replied:', info.response);
  } catch (err) {
    console.error('FAILED:', err.message);
    if (/Invalid login|535|Username and Password/i.test(err.message)) console.error('Hint: wrong user/password. For Gmail you need an App Password (needs 2-step verification), not your normal password.');
    if (/ETIMEDOUT|ECONNREFUSED|ENOTFOUND/i.test(err.message)) console.error('Hint: the network blocks this SMTP port (try port 465 or 587, or a hotspot), or SMTP_HOST is wrong.');
    process.exit(1);
  }
}
main();
