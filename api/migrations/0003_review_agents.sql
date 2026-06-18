-- Migration 0003: Review agent integration
-- Adds GitHub token storage, review agent configs, and review run history

-- Add encrypted GitHub access token column to users table
-- Stored as: base64(IV) : base64(ciphertext) (AES-GCM with GITHUB_TOKEN_ENCRYPTION_KEY)
ALTER TABLE users ADD COLUMN github_access_token_encrypted TEXT;

-- Review agent configurations
CREATE TABLE IF NOT EXISTS review_agents (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    repository TEXT NOT NULL,
    model TEXT NOT NULL DEFAULT 'deepseek-v4-flash',
    provider TEXT NOT NULL DEFAULT 'opencode-go',
    enabled INTEGER NOT NULL DEFAULT 1,
    config_path TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_review_agents_user_id ON review_agents(user_id);
CREATE INDEX IF NOT EXISTS idx_review_agents_repository ON review_agents(repository);

-- Review run history
CREATE TABLE IF NOT EXISTS review_runs (
    id TEXT PRIMARY KEY,
    agent_id TEXT REFERENCES review_agents(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    repository TEXT NOT NULL,
    pr_number INTEGER NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued',
    summary TEXT,
    finding_count INTEGER DEFAULT 0,
    tokens_used INTEGER DEFAULT 0,
    error_message TEXT,
    started_at TEXT DEFAULT (datetime('now')),
    completed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_review_runs_agent_id ON review_runs(agent_id);
CREATE INDEX IF NOT EXISTS idx_review_runs_user_id ON review_runs(user_id);
CREATE INDEX IF NOT EXISTS idx_review_runs_status ON review_runs(status);
