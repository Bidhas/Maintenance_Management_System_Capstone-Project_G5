class AppError extends Error {
  constructor(status, message, extra = {}) {
    super(message);
    this.status = status;
    this.extra = extra;
  }
}

const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const requestCode = (id) => `WO-${String(id).padStart(4, '0')}`;

module.exports = { AppError, wrap, requestCode };
