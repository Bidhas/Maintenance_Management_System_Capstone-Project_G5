const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const path = require('path');
const config = require('./config');
const { errorHandler } = require('./middleware/common');

const app = express();
app.disable('x-powered-by');
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: config.clientOrigin, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use('/uploads', express.static(config.uploadDir));

app.get('/api/health', (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/requests', require('./routes/requests'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/categories', require('./routes/categories'));
app.use('/api/blocks', require('./routes/blocks'));
app.use('/api/notifications', require('./routes/notifications'));

// Serve the built React app in production (single-service deploy on Render)
const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get(/^(?!\/api).*/, (_req, res, next) => {
  res.sendFile(path.join(clientDist, 'index.html'), (err) => { if (err) next(); });
});

app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

module.exports = app;
