const app = require('./app');
const config = require('./config');
const { processQueue } = require('./services/routing');

app.listen(config.port, () => {
  console.log(`CMMS API listening on http://localhost:${config.port}`);
});

// Retry anything stuck in the routing pool every minute — catches requests that
// couldn't be auto-assigned earlier because of a duty window or a weekly cap, in
// case either has since changed. Skipped in tests so it doesn't keep the process alive.
if (!config.isTest) {
  setInterval(() => processQueue().catch((e) => console.error('processQueue tick:', e.message)), 60000);
}
