-- Adds the two-tier technician system (Main vs. Volunteer), gender-matched hostel
-- routing, duty windows, weekly caps, escalation, reopen, and requester suspension —
-- per the Oct 2026 feature specification. See docs/PROJECT_NOTES.md for the full
-- mapping of these additions back to that spec.

-- Technicians now have a tier. Volunteers are gender-matched to hostel buildings and
-- bound by a weekly job cap; Main Technicians are not. duty_override lets a
-- technician force themselves on/off the automatic schedule (null = follow the
-- automatic weekday-evening/weekend schedule).
ALTER TABLE technician ADD COLUMN tier VARCHAR(10) NOT NULL DEFAULT 'Main' CHECK (tier IN ('Main', 'Volunteer'));
ALTER TABLE technician ADD COLUMN gender CHAR(1) CHECK (gender IN ('M', 'F'));
ALTER TABLE technician ADD COLUMN duty_override BOOLEAN;
ALTER TABLE technician ADD COLUMN weekly_cap INTEGER NOT NULL DEFAULT 3 CHECK (weekly_cap > 0);

-- A block can now be marked a hostel, and buildings within it carry the gender used
-- for volunteer routing (null gender = not gender-specific, e.g. academic buildings).
ALTER TABLE block ADD COLUMN is_hostel BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE building (
  building_id SERIAL PRIMARY KEY,
  block_id    INTEGER NOT NULL REFERENCES block(block_id) ON DELETE CASCADE,
  name        VARCHAR(80) NOT NULL,
  gender      CHAR(1) CHECK (gender IN ('M', 'F')),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (block_id, name)
);

-- Requests now reference a building (for routing) and carry escalation / queue /
-- reopen state. 'Pending' remains the "unassigned / in the routing pool" status —
-- queue_reason explains *why* a pending request hasn't been auto-assigned yet.
ALTER TABLE request ADD COLUMN building_id INTEGER REFERENCES building(building_id);
ALTER TABLE request ADD COLUMN escalated BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE request ADD COLUMN queue_reason TEXT;
ALTER TABLE request ADD COLUMN reopen_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE request ADD COLUMN reopened_at TIMESTAMPTZ;

CREATE TABLE escalation (
  escalation_id SERIAL PRIMARY KEY,
  request_id    INTEGER NOT NULL REFERENCES request(request_id) ON DELETE CASCADE,
  from_tech_id  INTEGER REFERENCES technician(tech_id) ON DELETE SET NULL,
  to_tech_id    INTEGER REFERENCES technician(tech_id) ON DELETE SET NULL,
  reason        TEXT NOT NULL,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_escalation_request ON escalation(request_id);

-- A requester can be blocked from submitting new requests without touching their
-- account or history (distinct from is_active, which fully deactivates a login).
ALTER TABLE requester ADD COLUMN suspended_reason TEXT;
ALTER TABLE requester ADD COLUMN suspended_at TIMESTAMPTZ;

-- Suspension/reinstatement notices aren't about any one request, so notification.request_id
-- (originally NOT NULL) needs to allow account-level notices too.
ALTER TABLE notification ALTER COLUMN request_id DROP NOT NULL;

-- Make the audit log genuinely append-only at the database level, not just by
-- convention (no route in the app updates/deletes it, but this closes the door
-- even against a direct DB edit).
CREATE OR REPLACE FUNCTION audit_log_immutable() RETURNS TRIGGER AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_no_change ON audit_log;
CREATE TRIGGER audit_log_no_change
  BEFORE UPDATE OR DELETE ON audit_log
  FOR EACH ROW EXECUTE FUNCTION audit_log_immutable();
