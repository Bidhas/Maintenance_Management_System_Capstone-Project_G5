const { query } = require('../db');

/** Record an action in the audit trail. Pass a transaction client to keep it atomic. */
async function audit(client, actor, action, entity, entityId, details) {
  const run = client ? client.query.bind(client) : query;
  await run(
    `INSERT INTO audit_log (actor_role, actor_id, actor_name, action, entity, entity_id, details)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [actor?.role || 'system', actor?.id ?? null, actor?.name || null, action, entity || null, entityId ?? null, details || null]
  );
}

module.exports = { audit };
