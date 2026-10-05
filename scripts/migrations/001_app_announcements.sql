-- Run once against the verified production PostgreSQL database after a
-- provider snapshot has been created. This migration is additive and does not
-- seed, update, or remove existing data.
CREATE TABLE IF NOT EXISTS app_announcements (
  id UUID PRIMARY KEY,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  link TEXT,
  link_label TEXT,
  audience TEXT NOT NULL CHECK (audience IN ('all', 'authenticated', 'unauthenticated')),
  starts_at TIMESTAMPTZ NOT NULL,
  expires_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
  active BOOLEAN NOT NULL DEFAULT FALSE,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (expires_at IS NULL OR expires_at > starts_at)
);

CREATE INDEX IF NOT EXISTS app_announcements_active_window_idx
  ON app_announcements (status, active, starts_at, expires_at)
  WHERE deleted = FALSE;
