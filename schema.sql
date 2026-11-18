CREATE TABLE IF NOT EXISTS heart_posts (
 id UUID PRIMARY KEY, payload JSONB NOT NULL, status TEXT NOT NULL DEFAULT 'draft',
 scheduled_at TIMESTAMPTZ, results JSONB NOT NULL DEFAULT '{}',
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS heart_due ON heart_posts(status, scheduled_at);
CREATE TABLE IF NOT EXISTS heart_media (id UUID PRIMARY KEY, payload JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE IF NOT EXISTS heart_login_attempts (key TEXT PRIMARY KEY, count INT NOT NULL, resets_at TIMESTAMPTZ NOT NULL);

-- Safe to apply once or repeatedly after the original v1 schema.
BEGIN;
CREATE TABLE IF NOT EXISTS heart_users (
 id UUID PRIMARY KEY, email TEXT NOT NULL UNIQUE CHECK(email=lower(email)),
 name TEXT NOT NULL, password_hash TEXT,
 role TEXT NOT NULL CHECK(role IN ('owner','admin','editor','viewer')),
 active BOOLEAN NOT NULL DEFAULT TRUE, networks JSONB NOT NULL DEFAULT '[]',
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK(role<>'owner' OR active=true)
);
CREATE UNIQUE INDEX IF NOT EXISTS heart_one_owner ON heart_users(role) WHERE role='owner';
CREATE TABLE IF NOT EXISTS heart_sessions (
 token_hash TEXT PRIMARY KEY,user_id UUID NOT NULL REFERENCES heart_users(id),
 expires_at TIMESTAMPTZ NOT NULL,created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS heart_sessions_user ON heart_sessions(user_id);
CREATE TABLE IF NOT EXISTS heart_invitations (
 token_hash TEXT PRIMARY KEY,user_id UUID NOT NULL REFERENCES heart_users(id),
 created_by UUID NOT NULL REFERENCES heart_users(id),expires_at TIMESTAMPTZ NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS heart_invite_user ON heart_invitations(user_id);
CREATE TABLE IF NOT EXISTS heart_audit (
 id BIGSERIAL PRIMARY KEY,actor_id UUID REFERENCES heart_users(id),action TEXT NOT NULL,
 target_id TEXT,details JSONB NOT NULL DEFAULT '{}',created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE heart_posts ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES heart_users(id);
ALTER TABLE heart_posts ADD COLUMN IF NOT EXISTS authorized_by UUID REFERENCES heart_users(id);
ALTER TABLE heart_posts ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
ALTER TABLE heart_media ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES heart_users(id);
-- Legacy scheduled/queued posts have no accountable approver: require a manager review.
UPDATE heart_posts SET status='pending_review',scheduled_at=NULL,revision=revision+1
 WHERE status IN ('queued','scheduled') AND authorized_by IS NULL;
COMMIT;
