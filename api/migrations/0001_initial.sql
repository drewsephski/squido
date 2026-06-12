-- Migration 0001: Initial schema for Squido Cloud API

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE,
    github_id TEXT UNIQUE,
    github_login TEXT,
    display_name TEXT,
    avatar_url TEXT,
    tier TEXT DEFAULT 'free',
    stripe_customer_id TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Sessions table
CREATE TABLE IF NOT EXISTS sessions (
    id TEXT PRIMARY KEY,
    user_id TEXT REFERENCES users(id),
    local_session_id TEXT,
    local_cwd TEXT,
    session_version INTEGER DEFAULT 3,
    name TEXT,
    parent_session_id TEXT,
    system_prompt TEXT,
    message_count INTEGER DEFAULT 0,
    first_message_preview TEXT,
    model_used TEXT,
    provider_used TEXT,
    total_tokens INTEGER DEFAULT 0,
    total_turns INTEGER DEFAULT 0,
    file_size_bytes INTEGER DEFAULT 0,
    disk_migration_result TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

-- Session entries table (named "entries" for API route compatibility)
CREATE TABLE IF NOT EXISTS entries (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'user',
    content TEXT,
    entry_type TEXT,
    model_used TEXT,
    tokens_in INTEGER DEFAULT 0,
    tokens_out INTEGER DEFAULT 0,
    parent_id TEXT,
    timestamp TEXT,
    payload TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_entries_session_id ON entries(session_id);
CREATE INDEX IF NOT EXISTS idx_entries_entry_type ON entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at);

-- FTS5 virtual table for full-text search across entry content
CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
    content,
    entry_type UNINDEXED,
    session_id UNINDEXED,
    entry_id UNINDEXED,
    content='entries',
    content_rowid='rowid'
);

-- Triggers to keep FTS in sync
CREATE TRIGGER IF NOT EXISTS entries_fts_ai AFTER INSERT ON entries BEGIN
    INSERT INTO entries_fts(rowid, content, entry_type, session_id, entry_id)
    VALUES (new.rowid, new.content, new.entry_type, new.session_id, new.id);
END;

CREATE TRIGGER IF NOT EXISTS entries_fts_ad AFTER DELETE ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, content, entry_type, session_id, entry_id)
    VALUES ('delete', old.rowid, old.content, old.entry_type, old.session_id, old.id);
END;

CREATE TRIGGER IF NOT EXISTS entries_fts_au AFTER UPDATE ON entries BEGIN
    INSERT INTO entries_fts(entries_fts, rowid, content, entry_type, session_id, entry_id)
    VALUES ('delete', old.rowid, old.content, old.entry_type, old.session_id, old.id);
    INSERT INTO entries_fts(rowid, content, entry_type, session_id, entry_id)
    VALUES (new.rowid, new.content, new.entry_type, new.session_id, new.id);
END;

-- Session shares
CREATE TABLE IF NOT EXISTS session_shares (
    id TEXT PRIMARY KEY,
    session_id TEXT REFERENCES sessions(id) ON DELETE CASCADE,
    user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
    view_token TEXT UNIQUE NOT NULL,
    is_public INTEGER NOT NULL DEFAULT 0,
    expires_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_session_shares_session_id ON session_shares(session_id);
CREATE INDEX IF NOT EXISTS idx_session_shares_view_token ON session_shares(view_token);

-- GitHub OAuth state tracking (device code flow)
CREATE TABLE IF NOT EXISTS oauth_states (
    device_code TEXT PRIMARY KEY,
    device_code_hash TEXT,
    user_code TEXT,
    verification_uri TEXT,
    state TEXT DEFAULT 'pending',
    github_access_token TEXT,
    github_user_id TEXT,
    expires_at INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_oauth_states_state ON oauth_states(state);
