const multer = require('multer');
const { ZodError } = require('zod');
const config = require('../config');
const { AppError } = require('../utils/http');

/** validate(zodSchema) -> replaces req.body with the parsed (trimmed / coerced) data. */
const validate = (schema) => (req, _res, next) => {
  const result = schema.safeParse(req.body || {});
  if (!result.success) return next(result.error);
  req.body = result.data;
  next();
};

const ALLOWED_IMAGES = ['image/jpeg', 'image/png', 'image/webp'];

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED_IMAGES.includes(file.mimetype)) {
      return cb(new AppError(400, 'Only JPG, PNG or WEBP images are allowed'));
    }
    cb(null, true);
  },
});

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  if (err instanceof ZodError) {
    const fields = {};
    for (const issue of err.issues) {
      const key = issue.path.join('.') || '_';
      if (!fields[key]) fields[key] = issue.message;
    }
    return res.status(400).json({ error: 'Please check the highlighted fields', fields });
  }
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image must be 5 MB or smaller' : err.message;
    return res.status(400).json({ error: msg });
  }
  if (err instanceof AppError) {
    return res.status(err.status).json({ error: err.message, ...err.extra });
  }
  if (err && err.code === '23505') {
    return res.status(409).json({ error: 'A record with those details already exists' });
  }
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  if (!config.isTest) console.error(err);
  res.status(500).json({ error: 'Something went wrong on the server' });
}

module.exports = { validate, upload, errorHandler };
