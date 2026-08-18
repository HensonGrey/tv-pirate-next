-- Auth.js canonical tables plus the two app columns the guest model needs:
-- users.provider and users.last_activity_at.
-- see: docs/decisions/auth.md and docs/decisions/guest-cleanup.md

CREATE TABLE users (
    id text PRIMARY KEY,
    name text,
    email text UNIQUE,
    email_verified timestamptz,
    image text,
    provider text NOT NULL DEFAULT 'GUEST' CHECK (provider IN ('GUEST', 'GOOGLE')),
    created_at timestamptz NOT NULL DEFAULT now(),
    last_activity_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE accounts (
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type text NOT NULL,
    provider text NOT NULL,
    provider_account_id text NOT NULL,
    refresh_token text,
    access_token text,
    expires_at integer,
    token_type text,
    scope text,
    id_token text,
    session_state text,
    PRIMARY KEY (provider, provider_account_id)
);

CREATE TABLE sessions (
    session_token text PRIMARY KEY,
    user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires timestamptz NOT NULL
);

CREATE TABLE verification_tokens (
    identifier text NOT NULL,
    token text NOT NULL,
    expires timestamptz NOT NULL,
    PRIMARY KEY (identifier, token)
);

-- The guest sweep scans by provider + clock.
CREATE INDEX idx_users_provider_activity ON users (provider, last_activity_at);
CREATE INDEX idx_sessions_user ON sessions (user_id);
CREATE INDEX idx_accounts_user ON accounts (user_id);

-- Activity clock owned by the database: any write to a user-scoped table bumps
-- the owning user. Rule 5 in docs/decisions/migrations.md — every new
-- user-scoped table adds its own trigger.
CREATE FUNCTION touch_user_last_activity() RETURNS trigger AS $$
BEGIN
    UPDATE users SET last_activity_at = now() WHERE id = COALESCE(NEW.user_id, OLD.user_id);
    RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Sessions replace the old refresh_tokens table as the "user is still around"
-- signal: Auth.js refreshes the row on its updateAge cadence, so an open tab
-- keeps a guest alive. see: docs/decisions/auth.md
CREATE TRIGGER trg_sessions_touch
    AFTER INSERT OR UPDATE OR DELETE ON sessions
    FOR EACH ROW EXECUTE FUNCTION touch_user_last_activity();
