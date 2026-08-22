ALTER TABLE users ADD COLUMN password_hash TEXT;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN password_salt TEXT;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN password_iterations INTEGER;
--> statement-breakpoint
ALTER TABLE users ADD COLUMN updated_at TEXT;
--> statement-breakpoint
UPDATE users SET updated_at=created_at WHERE updated_at IS NULL;
--> statement-breakpoint
CREATE TABLE user_sessions (id TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,token_hash TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,last_used_at TEXT NOT NULL,user_agent TEXT NOT NULL);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_user_sessions_token ON user_sessions(token_hash);
--> statement-breakpoint
CREATE INDEX idx_user_sessions_user_expires ON user_sessions(user_id,expires_at);
--> statement-breakpoint
CREATE TABLE password_reset_tokens (id TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,token_hash TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,consumed_at TEXT);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_password_reset_hash ON password_reset_tokens(token_hash);
--> statement-breakpoint
CREATE INDEX idx_password_reset_user ON password_reset_tokens(user_id);
--> statement-breakpoint
CREATE TABLE email_verification_tokens (id TEXT PRIMARY KEY NOT NULL,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,token_hash TEXT NOT NULL,created_at TEXT NOT NULL,expires_at TEXT NOT NULL,consumed_at TEXT);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_email_verification_hash ON email_verification_tokens(token_hash);
--> statement-breakpoint
CREATE INDEX idx_email_verification_user ON email_verification_tokens(user_id);
--> statement-breakpoint
PRAGMA optimize;
