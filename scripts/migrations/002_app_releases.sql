-- Android direct-distribution metadata only. APK files remain in Cloudinary
-- raw storage and are never stored in PostgreSQL.
CREATE TABLE IF NOT EXISTS app_releases (
  id UUID PRIMARY KEY,
  platform TEXT NOT NULL CHECK (platform = 'android'),
  version_name TEXT NOT NULL,
  version_code INTEGER NOT NULL CHECK (version_code > 0),
  release_notes TEXT,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  cloudinary_public_id TEXT NOT NULL,
  file_size BIGINT,
  sha256 TEXT NOT NULL CHECK (sha256 ~ '^[A-Fa-f0-9]{64}$'),
  is_active BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (platform, version_code)
);

-- At most one release can be live. Transactions may briefly have no active
-- row internally while replacing a release; that state is never committed.
CREATE UNIQUE INDEX IF NOT EXISTS app_releases_one_active_android_idx
  ON app_releases (platform)
  WHERE platform = 'android' AND is_active = TRUE;

CREATE INDEX IF NOT EXISTS app_releases_android_history_idx
  ON app_releases (platform, created_at DESC);
