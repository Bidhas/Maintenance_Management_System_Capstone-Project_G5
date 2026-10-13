const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const isTest = process.env.NODE_ENV === 'test';

module.exports = {
  isTest,
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT || '5000', 10),
  databaseUrl: isTest
    ? process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
    : process.env.DATABASE_URL,
  databaseSsl: process.env.DATABASE_SSL === 'true',
  jwtSecret: process.env.JWT_SECRET || (isTest ? 'test-secret' : 'dev-only-change-me'),
  clientOrigin: process.env.CLIENT_ORIGIN || 'http://localhost:5173',
  appUrl: process.env.APP_URL || 'http://localhost:5173',
  uploadDir: path.resolve(__dirname, '..', process.env.UPLOAD_DIR || 'uploads'),
  maxUploadBytes: 5 * 1024 * 1024,
  smtp: {
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.SMTP_FROM || 'CMMS Facility Ops <no-reply@cmms.local>',
  },
  cloudinaryConfigured: !!(process.env.CLOUDINARY_URL || process.env.CLOUDINARY_CLOUD_NAME),
};
