CREATE TABLE password_reset_tokens (id bigserial PRIMARY KEY,user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,token_hash char(64) UNIQUE NOT NULL,expires_at timestamptz NOT NULL,used_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX password_reset_tokens_lookup_idx ON password_reset_tokens(token_hash,expires_at) WHERE used_at IS NULL;
