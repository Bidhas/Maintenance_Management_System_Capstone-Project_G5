-- CMMS schema. Follows "Physical Database Design (Revised)" and the ER diagram.
-- Columns marked [+] are additions the design documents did not list but the app needs
-- (authentication, timestamps, resolution details, etc.). See docs/DATABASE.md.

CREATE TABLE admin (
  admin_id       SERIAL PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  email          VARCHAR(100) NOT NULL UNIQUE,
  password_hash  VARCHAR(100) NOT NULL,                       -- [+]
  designation    VARCHAR(100),                                -- [+]
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,               -- [+]
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()           -- [+]
);

CREATE TABLE requester (
  user_id        SERIAL PRIMARY KEY,
  role           VARCHAR(30)  NOT NULL CHECK (role IN ('Student','Staff','Faculty')),
  name           VARCHAR(100) NOT NULL,
  phone          VARCHAR(20),
  email          VARCHAR(100) NOT NULL UNIQUE,
  password_hash  VARCHAR(100) NOT NULL,                       -- [+]
  college_id     VARCHAR(20) UNIQUE,                          -- [+] student / staff ID, usable for login
  programme      VARCHAR(100),                                -- [+]
  hostel_room    VARCHAR(100),                                -- [+]
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,          -- [+]
  inapp_notifications BOOLEAN NOT NULL DEFAULT TRUE,          -- [+]
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,               -- [+]
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()           -- [+]
);

CREATE TABLE technician (
  tech_id        SERIAL PRIMARY KEY,
  name           VARCHAR(100) NOT NULL,
  availability   VARCHAR(30) NOT NULL DEFAULT 'Available'
                 CHECK (availability IN ('Available','Busy','Off Duty')),
  admin_id       INTEGER NOT NULL REFERENCES admin(admin_id),  -- OVERSEES (ADMIN 1:N TECHNICIAN)
  email          VARCHAR(100) NOT NULL UNIQUE,                -- [+]
  phone          VARCHAR(20),                                 -- [+]
  password_hash  VARCHAR(100) NOT NULL,                       -- [+]
  location       VARCHAR(100),                                -- [+] base location shown on Technicians page
  email_notifications BOOLEAN NOT NULL DEFAULT TRUE,          -- [+]
  inapp_notifications BOOLEAN NOT NULL DEFAULT TRUE,          -- [+]
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,               -- [+]
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()           -- [+]
);

CREATE TABLE category (
  category_id    SERIAL PRIMARY KEY,
  category_name  VARCHAR(100) NOT NULL UNIQUE,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE                -- [+] soft-delete when requests reference it
);

-- QUALIFIED_FOR (TECHNICIAN N:N CATEGORY)
CREATE TABLE technician_category (
  tech_id        INTEGER NOT NULL REFERENCES technician(tech_id) ON DELETE CASCADE,
  category_id    INTEGER NOT NULL REFERENCES category(category_id) ON DELETE CASCADE,
  PRIMARY KEY (tech_id, category_id)
);

-- [+] Registered blocks (Settings > Locations). request.block stores the block name as in the design.
CREATE TABLE block (
  block_id       SERIAL PRIMARY KEY,
  block_name     VARCHAR(50) NOT NULL UNIQUE,
  hostels        INTEGER NOT NULL DEFAULT 0,
  rooms          INTEGER NOT NULL DEFAULT 0,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE request (
  request_id     SERIAL PRIMARY KEY,
  block          VARCHAR(50) NOT NULL,
  room_no        VARCHAR(20) NOT NULL,
  urgency        VARCHAR(20) NOT NULL CHECK (urgency IN ('Low','Medium','High')),
  status         VARCHAR(30) NOT NULL DEFAULT 'Pending'
                 CHECK (status IN ('Pending','Assigned','In Progress','Completed','Declined')), -- 'Declined' [+]
  user_id        INTEGER NOT NULL REFERENCES requester(user_id),            -- SUBMITS
  admin_id       INTEGER REFERENCES admin(admin_id),                        -- ASSIGNS (nullable)
  tech_id        INTEGER REFERENCES technician(tech_id),                    -- HANDLES (nullable)
  category_id    INTEGER NOT NULL REFERENCES category(category_id),         -- HAS
  title          VARCHAR(120) NOT NULL,                                     -- [+]
  description    TEXT NOT NULL,                                             -- [+]
  photo_url      TEXT,                                                      -- [+]
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),                        -- [+]
  assigned_at    TIMESTAMPTZ,                                               -- [+] first assignment
  started_at     TIMESTAMPTZ,                                               -- [+]
  completed_at   TIMESTAMPTZ,                                               -- [+]
  resolution_notes    TEXT,                                                 -- [+]
  time_spent_minutes  INTEGER CHECK (time_spent_minutes IS NULL OR time_spent_minutes > 0), -- [+]
  completion_photo_url TEXT,                                                -- [+]
  decline_reason TEXT,                                                      -- [+]
  rating         SMALLINT CHECK (rating BETWEEN 1 AND 5),                   -- [+] feedback
  feedback_comment TEXT                                                     -- [+]
);
CREATE INDEX idx_request_user    ON request(user_id);
CREATE INDEX idx_request_tech    ON request(tech_id);
CREATE INDEX idx_request_status  ON request(status);
CREATE INDEX idx_request_created ON request(created_at);

-- [+] Every status transition, timestamped (timeline + response-time metrics)
CREATE TABLE request_status_history (
  history_id     SERIAL PRIMARY KEY,
  request_id     INTEGER NOT NULL REFERENCES request(request_id) ON DELETE CASCADE,
  old_status     VARCHAR(30),
  new_status     VARCHAR(30) NOT NULL,
  changed_by_role VARCHAR(20) NOT NULL,
  changed_by_id  INTEGER,
  changed_by_name VARCHAR(100),
  note           TEXT,
  changed_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_history_request ON request_status_history(request_id);

-- NOTIFICATION (weak entity generated by REQUEST, 1:N). recipient_*, title, type, is_read are [+]
CREATE TABLE notification (
  notif_id       SERIAL PRIMARY KEY,
  request_id     INTEGER NOT NULL REFERENCES request(request_id) ON DELETE CASCADE,
  message        TEXT NOT NULL,
  timestamp      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  recipient_role VARCHAR(20) NOT NULL CHECK (recipient_role IN ('requester','technician','admin')),
  recipient_id   INTEGER NOT NULL,
  title          VARCHAR(100) NOT NULL,
  type           VARCHAR(20) NOT NULL DEFAULT 'Request' CHECK (type IN ('Request','Update','Completed')),
  is_read        BOOLEAN NOT NULL DEFAULT FALSE
);
CREATE INDEX idx_notification_recipient ON notification(recipient_role, recipient_id, is_read);

-- [+] Audit trail (US-25 / US-26)
CREATE TABLE audit_log (
  log_id         SERIAL PRIMARY KEY,
  actor_role     VARCHAR(20) NOT NULL,
  actor_id       INTEGER,
  actor_name     VARCHAR(100),
  action         VARCHAR(50) NOT NULL,
  entity         VARCHAR(30),
  entity_id      INTEGER,
  details        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_audit_created ON audit_log(created_at DESC);

-- [+] Key/value system configuration (US-19)
CREATE TABLE system_setting (
  key            VARCHAR(60) PRIMARY KEY,
  value          TEXT NOT NULL
);
