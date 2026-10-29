-- Sprint 6: Google sign-in, room-level locations, equipment log, pick-mode setting.
-- Written to be ADDITIVE ONLY (no drops, no data loss) so it is safe to run on the live
-- Supabase database that already holds data.

-- 1. Google sign-in --------------------------------------------------------------------
-- A person who signs in with Google has no password, so password_hash must be allowed to be NULL.
ALTER TABLE requester  ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE technician ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE admin      ALTER COLUMN password_hash DROP NOT NULL;

-- google_sub is Google's permanent, unique id for the person (the "sub" claim). We store it
-- the first time they sign in. Emails can change; "sub" never does.
ALTER TABLE requester  ADD COLUMN IF NOT EXISTS google_sub VARCHAR(64) UNIQUE;
ALTER TABLE technician ADD COLUMN IF NOT EXISTS google_sub VARCHAR(64) UNIQUE;
ALTER TABLE admin      ADD COLUMN IF NOT EXISTS google_sub VARCHAR(64) UNIQUE;

-- Emails are compared case-insensitively everywhere; enforce that at the database level too.
CREATE UNIQUE INDEX IF NOT EXISTS uq_requester_email_lower  ON requester  (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS uq_technician_email_lower ON technician (LOWER(email));
CREATE UNIQUE INDEX IF NOT EXISTS uq_admin_email_lower      ON admin      (LOWER(email));

-- 2. Rooms ------------------------------------------------------------------------------
-- block (e.g. "RKA Hostel")  ->  building (a floor, or a quarter group like "A")  ->  room.
-- student_visible = may a STUDENT pick this room when reporting a problem?
--   (students see hostel rooms and classrooms/learning spaces only)
CREATE TABLE IF NOT EXISTS room (
  room_id         SERIAL PRIMARY KEY,
  block_id        INTEGER NOT NULL REFERENCES block(block_id) ON DELETE CASCADE,
  building_id     INTEGER REFERENCES building(building_id) ON DELETE CASCADE,
  room_no         VARCHAR(60) NOT NULL,
  is_kitchen      BOOLEAN NOT NULL DEFAULT FALSE,
  student_visible BOOLEAN NOT NULL DEFAULT FALSE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);
-- NULL building_id must still be unique per block, hence COALESCE in the index.
CREATE UNIQUE INDEX IF NOT EXISTS uq_room_place ON room (block_id, COALESCE(building_id, 0), LOWER(room_no));
CREATE INDEX IF NOT EXISTS idx_room_block ON room (block_id);

-- 3. Equipment used on a job (recorded when the technician completes it) -----------------
ALTER TABLE request ADD COLUMN IF NOT EXISTS equipment_used TEXT;

-- 4. Assignment mode: 'pick' (technicians choose jobs from the board) or 'auto' ---------
INSERT INTO system_setting (key, value) VALUES ('assignment_mode', 'pick') ON CONFLICT (key) DO NOTHING;

-- 5. Real room names are longer than the old 20-character limit ("Administrative Assistant Office 1")
ALTER TABLE request ALTER COLUMN room_no TYPE VARCHAR(80);
