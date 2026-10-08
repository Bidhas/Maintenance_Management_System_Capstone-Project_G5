-- CampusCare database schema
-- Run with: psql -d campuscare -f server/db/schema.sql
-- NOTE: US-27 (full schema) is a shared task. Other tables (complaints, categories,
-- audit_log) will be added here by whoever owns that story.

CREATE TABLE IF NOT EXISTS users (
  id            BIGSERIAL    PRIMARY KEY,
  name          VARCHAR(100) NOT NULL,
  email         VARCHAR(100) NOT NULL UNIQUE,          -- stored in lowercase
  password_hash VARCHAR(255) NOT NULL,
  role          VARCHAR(30)  NOT NULL DEFAULT 'student'
                CHECK (role IN ('student', 'staff', 'technician', 'admin')),
  is_active     BOOLEAN      NOT NULL DEFAULT TRUE,    -- used later by US-16 (deactivate user)
  created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);
