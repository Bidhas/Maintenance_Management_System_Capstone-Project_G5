const express = require('express');
const pool = require('../db/pool');
const { hashPassword } = require('../utils/password');

const router = express.Router();

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Only these roles can self-register. Technician/admin accounts are created by an admin (US-16).
const SELF_REGISTER_ROLES = ['student', 'staff'];

// Validate the registration input. Returns an object of field errors ({} = valid).
function validateRegister(body) {
  const { name, email, password, role } = body || {};
  const errors = {};

  if (typeof name !== 'string' || name.trim().length < 2 || name.trim().length > 100) {
    errors.name = 'Name is required (2-100 characters).';
  }
  if (typeof email !== 'string' || !EMAIL_RE.test(email.trim())) {
    errors.email = 'A valid email address is required.';
  }
  if (
    typeof password !== 'string' ||
    password.length < 8 ||
    password.length > 72 || // bcrypt only uses the first 72 characters
    !/[A-Za-z]/.test(password) ||
    !/\d/.test(password)
  ) {
    errors.password = 'Password must be 8-72 characters and include a letter and a number.';
  }
  if (typeof role !== 'string' || !SELF_REGISTER_ROLES.includes(role)) {
    errors.role = 'Role must be either "student" or "staff".';
  }
  return errors;
}

// POST /api/auth/register   (US-01-T1)
router.post('/register', async (req, res) => {
  const errors = validateRegister(req.body);
  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ message: 'Validation failed.', errors });
  }

  const name = req.body.name.trim();
  const email = req.body.email.trim().toLowerCase();
  const { password, role } = req.body;

  try {
    const passwordHash = await hashPassword(password); // US-01-T2

    const { rows } = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [name, email, passwordHash, role]
    );

    // Never send password_hash back
    return res.status(201).json({
      message: 'Registration successful. Please log in.',
      user: rows[0],
    });
  } catch (err) {
    if (err.code === '23505') {
      // PostgreSQL "unique violation" = this email is already registered
      return res.status(409).json({ message: 'An account with this email already exists.' });
    }
    console.error('Register error:', err);
    return res.status(500).json({ message: 'Something went wrong. Please try again.' });
  }
});

// POST /api/auth/login will be added here (US-02)

module.exports = router;