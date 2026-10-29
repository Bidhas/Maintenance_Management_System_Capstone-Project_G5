const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const config = require('./config');
const { errorHandler } = require('./middleware/common');

const app = express();
app.disable('x-powered-by');
// Helmet's default Content-Security-Policy would block Google's sign-in script and popup in production
// (the React app is served by this same server). These are the minimum extra allowances Google needs.
// 'same-origin-allow-popups' lets the Google popup talk back to our page.
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
      frameSrc: ["'self'", 'https://accounts.google.com/gsi/'],
      connectSrc: ["'self'", 'https://accounts.google.com/gsi/'],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style', 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
      imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
      mediaSrc: ["'self'", 'blob:'],
    },
  },
}));
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(config.uploadDir));

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/requests', require('./routes/requests.admin'));
app.use('/api/requests', require('./routes/requests.work'));
app.use('/api/requests', require('./routes/requests.escalate'));
app.use('/api/requests', require('./routes/requests.followup'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/technicians', require('./routes/technicians'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/blocks', require('./routes/blocks'));
app.use('/api/users', require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/settings', require('./routes/settings'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/maintenance-log', require('./routes/maintenanceLog'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/escalations', require('./routes/escalations'));

// Serve the built React app in production (single-service deploy on Render)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (_req, res, next) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => { if (err) next(); });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

module.exports = app;
