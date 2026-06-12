# Squido Commercialization — Glossary

## Products & Platform

- **Squido CLI** — the open-source terminal-based coding agent. Fully functional offline. MIT-licensed.
- **Session Hub** — the cloud sync and dashboard layer. Optional, additive. Users opt in.
- **Code Review Agent** — Phase 2 product. A GitHub/GitLab app that runs Squido agents on every PR.
- **Multi-Agent Teams** — Phase 3 product. Orchestrate teams of specialist agents.

## Session Hub Concepts

- **Session** — a single Squido agent conversation. Stored locally as a `.jsonl` file with tree branching (forks, clones). Synced to cloud on opt-in.
- **Session Entry** — one line in the JSONL file. Types: `session`, `message`, `tool_call`, `thinking_level_change`, `model_change`, `compaction`, `branch_summary`, `custom`, `custom_message`, `label`, `session_info`.
- **Sync** — the process of pushing new session entries to the cloud after each agent turn and on session end. Incremental, tracks `last_synced_entry_id`.
- **Turn** — one agent loop iteration. Emits `turn_end` event which triggers a sync batch.

## Cloud Infrastructure

- **Cloud API** — Hono application deployed on Cloudflare Workers. Serves the Session Hub backend.
- **Cloud Storage** — D1 (metadata tables), R2 (raw session JSONL blobs), optional Meilisearch or Postgres full-text search.
- **Cloud Dashboard** — extends the existing `web-ui/` Vite + React app with authenticated `/dashboard/*` routes.
- **Cloud Auth** — GitHub OAuth primary, API key fallback. Token stored in `AuthStorage` alongside LLM provider credentials.

## Business Model

- **Freemium** — Free tier (100 sessions/month, 7-day retention, 1 user). Pro ($15/mo, unlimited, 1yr retention, advanced search). Team ($30/user/mo, shared browsing, SSO).
- **CLI is free** — always. All cloud features are the monetization layer.
