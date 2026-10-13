const { query } = require('../db');

const DEFAULTS = {
  sla_high_hours: '4',
  sla_medium_hours: '24',
  sla_low_hours: '72',
  notify_email_enabled: 'true',
  notify_inapp_enabled: 'true',
};

async function getSettings(client) {
  const run = client ? client.query.bind(client) : query;
  const { rows } = await run('SELECT key, value FROM system_setting');
  const map = { ...DEFAULTS };
  for (const r of rows) map[r.key] = r.value;
  return {
    sla_hours: {
      High: Number(map.sla_high_hours),
      Medium: Number(map.sla_medium_hours),
      Low: Number(map.sla_low_hours),
    },
    notify_email_enabled: map.notify_email_enabled === 'true',
    notify_inapp_enabled: map.notify_inapp_enabled === 'true',
  };
}

async function saveSettings(client, values) {
  const run = client ? client.query.bind(client) : query;
  for (const [key, value] of Object.entries(values)) {
    await run(
      `INSERT INTO system_setting (key, value) VALUES ($1, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`,
      [key, String(value)]
    );
  }
}

module.exports = { getSettings, saveSettings, DEFAULTS };
