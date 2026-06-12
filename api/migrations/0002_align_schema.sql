-- Migration 0002: Align schema with API route expectations
-- Renames session_entries -> entries, session_fts -> entries_fts,
-- adds missing columns, fixes types

-- Rename and extend entries table
ALTER TABLE session_entries RENAME TO entries_old;

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

INSERT INTO entries (id, session_id, entry_type, parent_id, timestamp, payload, created_at)
    SELECT id, session_id, entry_type, parent_id, timestamp, payload, created_at FROM entries_old;

DROP TABLE entries_old;

CREATE INDEX IF NOT EXISTS idx_entries_session_id ON entries(session_id);
CREATE INDEX IF NOT EXISTS idx_entries_entry_type ON entries(entry_type);
CREATE INDEX IF NOT EXISTS idx_entries_created_at ON entries(created_at);

-- Rebuild FTS table
DROP TABLE IF EXISTS session_fts;

CREATE VIRTUAL TABLE IF NOT EXISTS entries_fts USING fts5(
    content,
    entry_type UNINDEXED,
    session_id UNINDEXED,
    entry_id UNINDEXED,
    content='entries',
    content_rowid='rowid'
);

-- FTS sync triggers
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

-- Add missing columns to sessions
ALTER TABLE sessions ADD COLUMN system_prompt TEXT;
ALTER TABLE sessions ADD COLUMN updated_at TEXT;

-- Rename modified_at to updated_at (SQLite doesn't support column rename directly)
-- Use a workaround: copy data
CREATE TABLE sessions_new (
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

INSERT INTO sessions_new SELECT
    id, user_id, local_session_id, local_cwd, session_version, name,
    parent_session_id, system_prompt, message_count, first_message_preview,
    model_used, provider_used, total_tokens, total_turns, file_size_bytes,
    disk_migration_result, created_at, COALESCE(modified_at, created_at)
FROM sessions;

DROP TABLE sessions;
ALTER TABLE sessions_new RENAME TO sessions;

CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);

-- Update oauth_states: add device_code_hash column, change expires_at to INTEGER
ALTER TABLE oauth_states ADD COLUMN device_code_hash TEXT;

-- Clean up expired CSRF states
DELETE FROM oauth_states WHERE expires_at < CAST(strftime('%s', 'now') AS INTEGER);

-- Update users: ensure created_at defaults
UPDATE users SET created_at = datetime('now') WHERE created_at IS NULL;
UPDATE users SET updated_at = datetime('now') WHERE updated_at IS NULL;
