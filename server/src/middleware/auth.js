const jwt = require('jsonwebtoken');
const config = require('../config');
const { query } = require('../db');
const { AppError, wrap } = require('../utils/http');
const { ROLES, isRole } = require('../utils/roles');

const signToken = (user, remember = false) =>
  jwt.sign({ sub: user.id, role: user.role, name: user.name }, config.jwtSecret, {
    expiresIn: remember ? '7d' : '12h',
  });

/** Verifies the JWT, then confirms the account still exists and is active. */
const authenticate = wrap(async (req, _res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) throw new AppError(401, 'Authentication required');

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (err) {
    throw new AppError(401, err.name === 'TokenExpiredError' ? 'Session expired. Please sign in again.' : 'Invalid token');
  }
  if (!isRole(payload.role)) throw new AppError(401, 'Invalid token');

  const { table, idCol } = ROLES[payload.role];
  const { rows } = await query(`SELECT name, is_active FROM ${table} WHERE ${idCol} = $1`, [payload.sub]);
  if (!rows[0] || !rows[0].is_active) throw new AppError(401, 'Account not found or deactivated');

  req.user = { id: payload.sub, role: payload.role, name: rows[0].name };
  next();
});

/** Role guard: returns 403 if the authenticated role is not allowed (US-03). */
const requireRole = (...roles) => (req, _res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    return next(new AppError(403, 'You do not have permission to perform this action'));
  }
  next();
};

module.exports = { signToken, authenticate, requireRole };
