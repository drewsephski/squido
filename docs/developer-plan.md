# Developer Plan: Squido Commercialization

## Overview

Three-phase plan to productize Squido. Each phase builds on the previous.

- **Phase 1**: Session Hub — cloud sync + dashboard for browsing/searching/sharing sessions
- **Phase 2**: Code Review Agent — GitHub app that runs Squido agents on PRs
- **Phase 3**: Multi-Agent Teams — orchestrate teams of specialist agents

---

## Phase 1: Session Hub

### Goal

An optional cloud layer for the Squido CLI. Users opt in, their session data syncs to the cloud, and they get a web dashboard for searching, browsing, and sharing sessions. This is the monetization foundation.

### Architecture

```
  +---------------------+        +------------------------+
  | Squido CLI (local)  |  --->  | Cloud API (Workers)   |
  | - cloud/ module     |  push  | - Hono REST API        |
  | - AuthStorage       |  turn  | - D1 (metadata)        |
  | - session-manager   |  sync  | - R2 (raw JSONL blobs) |
  | - settings-manager  |        +-----------+------------+
  +---------------------+                    |
                                             v
                              +---------------------------+
                              | Dashboard (web-ui/)       |
                              | - Vite + React            |
                              | - Session list + detail   |
                              | - Full-text search        |
                              | - Sharing                 |
                              | - Account settings        |
                              +---------------------------+
```

### CLI Changes

#### New package: `packages/cloud/`

Location: `packages/cloud/` within the monorepo. Separate package to keep cloud concerns out of the open-source CLI core.

**Exit strategy**: The CLI depends on `@drewsepsi/squido-cloud` as a peer dependency. Open-source users don't install it. Cloud users install with a `squido cloud enable` command that pulls it in.

**Module structure**:

```
packages/cloud/
  src/
    client.ts          # SquidoCloudClient — fetch wrapper, auth, retry
    sync.ts            # SessionSync — incremental sync engine
    auth.ts            # CloudAuth — GitHub OAuth device flow + token management
    serializer.ts      # SessionEntry -> API payload serialization
    settings.ts        # Cloud-specific settings (sync.enabled, account info)
    index.ts           # Public API
  package.json
```

**Key components**:

1. **`SquidoCloudClient`** (`client.ts`)
   - Wraps `fetch()` with base URL, auth header, timeout, retry
   - Methods: `postEntries()`, `getSession()`, `listSessions()`, `search()`, `getAccount()`
   - API endpoint: `https://api.squidagent.app/v1/`

2. **`SessionSync`** (`sync.ts`)
   - Hooks into the agent event stream via `agent.subscribe()`
   - On `turn_end`: reads unsynced entries from the JSONL file, POSTs a batch to the cloud
   - On session end / graceful shutdown: flush remaining entries
   - Tracks sync state in `<sessionDir>/.sync-state`: `{ lastSyncedEntryId, syncedAt }`
   - Handles offline gracefully: queue entries locally, retry on next turn

3. **`CloudAuth`** (`auth.ts`)
   - `login()`: starts GitHub OAuth device flow, stores token via `AuthStorage`
   - `logout()`: removes cloud token from `AuthStorage`
   - `getToken()`: returns valid token (auto-refresh if expired)
   - Token stored in `auth.json` under key `cloud`

4. **`serializer.ts`**
   - Maps local `SessionEntry` types to a serializable API payload
   - Handles diff: only sends entries since `lastSyncedEntryId`
   - Batches: max 100 entries per request

**Integration points in existing CLI**:

| Change | File | What to do |
|--------|------|------------|
| Settings | `packages/cli/src/core/settings-manager.ts` | Add `cloud` settings block: `{ enabled, accountEmail, lastSyncedAt }` |
| Slash commands | `packages/cli/src/core/slash-commands.ts` | Add `cloud` command entry |
| Agent event loop | `packages/cli/src/core/agent-session-services.ts` (or equivalent) | After `turn_end`, call `sync.trySync()` |
| Auth storage | `packages/cli/src/core/auth-storage.ts` | No changes needed — stores any key-value credential already |
| Config paths | `packages/cli/src/config.ts` | Add `getCloudSyncStatePath()` for `.sync-state` files |

**Slash commands added**:

```
/cloud login        — GitHub OAuth login to Squido Cloud
/cloud logout       — Disconnect from Squido Cloud
/cloud enable       — Enable automatic session sync
/cloud disable      — Disable session sync
/cloud status       — Show sync state: account, last sync, pending entries
/cloud sessions     — Open cloud dashboard session list in browser
```

**Settings added** (`settings.json`):

```json
{
  "cloud": {
    "enabled": false,
    "syncOnShutdown": true
  }
}
```

**Per-project opt-out**: `.squido/no-cloud-sync` marker file. When present, sync is skipped for sessions in that project.

### Cloud API

**Stack**: Hono on Cloudflare Workers. D1 for metadata, R2 for blob storage.

**Endpoints**:

```
POST   /v1/auth/github/start     — Start OAuth device flow
POST   /v1/auth/github/callback  — Complete OAuth, return session token
GET    /v1/auth/me               — Get current user info

GET    /v1/sessions              — List user's sessions (paginated, filterable)
GET    /v1/sessions/:id          — Get session detail with entries
DELETE /v1/sessions/:id          — Delete a session
PATCH  /v1/sessions/:id          — Update session metadata (name, etc.)

POST   /v1/sessions/:id/entries  — Sync new entries (batch)
GET    /v1/sessions/:id/entries  — Get entries (with pagination, filtering)

GET    /v1/search                — Full-text search across sessions
POST   /v1/sessions/:id/share    — Create share link
DELETE /v1/sessions/:id/share/:shareId  — Revoke share link

GET    /v1/account               — Account info (tier, usage stats)
GET    /v1/account/billing       — Manage subscription (Stripe portal link)
```

**Data model** (D1):

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE,
  github_id TEXT UNIQUE,
  github_login TEXT,
  display_name TEXT,
  tier TEXT DEFAULT 'free',           -- 'free' | 'pro' | 'team'
  stripe_customer_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  local_session_id TEXT,              -- original local session ID
  local_cwd TEXT,                     -- working directory at session start
  session_version INTEGER DEFAULT 3,
  name TEXT,
  parent_session_id TEXT,
  message_count INTEGER DEFAULT 0,
  first_message_preview TEXT,
  model_used TEXT,
  provider_used TEXT,
  total_tokens INTEGER DEFAULT 0,
  total_turns INTEGER DEFAULT 0,
  file_size_bytes INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  modified_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE session_entries (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  entry_id TEXT NOT NULL,             -- original entry ID from local file
  entry_type TEXT NOT NULL,           -- 'message' | 'tool_call' | 'thinking_level_change' | etc.
  parent_id TEXT,
  timestamp TEXT,
  payload TEXT NOT NULL,              -- JSON blob of type-specific fields
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE
);

CREATE INDEX idx_session_entries_session ON session_entries(session_id);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE session_shares (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  view_token TEXT UNIQUE NOT NULL,
  is_public INTEGER DEFAULT 0,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id)
);
```

**Full-text search**: Use D1's FTS5 extension for built-in full-text search on session entries. If performance degrades at scale, migrate to Meilisearch or Turso's embedded search.

### Dashboard (web-ui/)

**Stack**: Extend existing `web-ui/` Vite + React app. Add routes under `/dashboard/*`.

**New routes**:

```
/dashboard              — Session list (table, searchable, filterable by date/model)
/dashboard/sessions/:id — Session detail view (message timeline + tool calls)
/dashboard/share/:token — Public shared session view (no auth required)
/dashboard/settings     — Account settings, subscription management
/dashboard/billing      — Stripe customer portal (manage plan, payment method)
```

**New components needed**:

```
src/
  dashboard/
    DashboardLayout.tsx       — Layout with sidebar, auth guard
    SessionList.tsx           — Paginated, searchable session table
    SessionDetail.tsx         — Message timeline view with entry expansion
    SessionTimeline.tsx       — Visual timeline of messages + tool calls
    SessionSearch.tsx         — Full-text search bar with results
    ShareDialog.tsx           — Create/manage share links
    AccountSettings.tsx       — Profile, preferences, connected accounts
    BillingPage.tsx           — Plan display, upgrade/downgrade, Stripe portal
    CloudLoginPage.tsx        — OAuth login page (handles redirect callback)
    hooks/
      useApi.ts               — Fetch wrapper with auth handling
      useSessions.ts          — Session list/detail data hooks
      useSearch.ts            — Search query hook with debounce
      useAccount.ts           — User account data hook
    api/
      client.ts               — API client, auth token management
      sessions.ts             — Session API functions
      search.ts               — Search API functions
      account.ts              — Account/billing API functions
  components/
    AuthGuard.tsx             — Protects dashboard routes, redirects to login
    EmptyState.tsx            — Empty state placeholder
    Pagination.tsx            — Reusable pagination component
    SearchInput.tsx           — Styled search input with clear
    Timestamp.tsx             — Relative time + full date display
    Badge.tsx                 — Tier badge (Free/Pro/Team)
    MarkdownRenderer.tsx      — Renders agent markdown output (reuse marked)
```

**Auth flow in dashboard**:
1. User clicks "Sign in with GitHub" on `/dashboard/login`
2. Redirected to `https://api.squidagent.app/v1/auth/github/start`
3. GitHub OAuth redirects back to `/dashboard/auth/callback?code=...`
4. Dashboard calls `POST /v1/auth/github/callback`, gets session token
5. Token stored in `localStorage` (or HttpOnly cookie for production)
6. `AuthGuard` component checks for valid token on every route change

### Infrastructure Setup

**Cloudflare**:
- Workers: Hono API server
- D1: Session metadata database
- R2: Raw session file storage (for blob-level access, backup)
- Queues: Optional async processing (reindex, compaction)
- Pages or Workers static asset serving: Dashboard frontend

**Stripe**:
- Products: Free, Pro ($15/mo), Team ($30/user/mo)
- Webhook handler: `POST /v1/billing/webhook` on Workers
- Customer portal for self-serve plan management

**Domains**:
- `api.squidagent.app` — Cloud API (Workers)
- `app.squidagent.app` — Dashboard (Pages or Workers static)
- Existing `squidagent.app` remains the marketing site

### Development Timeline

| Step | Effort | Dependencies |
|------|--------|-------------|
| 1. Scaffold `packages/cloud/` with `SquidoCloudClient` | 2 days | None |
| 2. Implement `CloudAuth` (GitHub OAuth device flow) | 2 days | Cloud API auth endpoints |
| 3. Implement `SessionSync` (turn-based sync engine) | 3 days | item 1, agent event stream |
| 4. Add `cloud` slash commands + settings integration | 2 days | items 1-3 |
| 5. Deploy Cloud API (Workers + D1 + R2) | 5 days | Hono, schema design |
| 6. Dashboard: session list + detail views | 5 days | items 1, 5 |
| 7. Dashboard: full-text search | 3 days | item 5 (FTS5) |
| 8. Dashboard: session sharing | 2 days | items 5, 6 |
| 9. Dashboard: auth flow + account settings | 3 days | item 5, GitHub OAuth app |
| 10. Billing integration (Stripe) | 3 days | item 5 |
| 11. End-to-end testing + polish | 3 days | all above |
| **Total Phase 1** | **~30 days** | |

---

## Phase 2: Code Review / CI Agent

### Goal

A GitHub App that runs Squido agents on every pull request. The agent checks out the PR branch, runs tools (lint, test, typecheck, build), analyzes diffs, and posts structured review comments. Can also auto-fix and push fixes.

### Architecture

```
GitHub PR opened/updated
        |
        v
GitHub App Webhook -> Cloud API
        |
        v
  Spawn Squido Agent (sandboxed)
  - Checkout PR branch
  - Analyze diff
  - Execute tools (lint/test/build)
  - Generate review
        |
        v
Post review comments to PR
        |
        v
  Optional: auto-fix and push
```

### Key Components

**GitHub App** (`packages/code-review/`):
- Webhook handler for `pull_request.opened`, `pull_request.synchronize`
- Creates check runs with status updates
- Posts review comments (file-level + summary)
- Comment thread for agent responses to PR feedback

**Agent sandbox**:
- Ephemeral execution environment (Fly.io machine or GitHub Codespace)
- Pre-configured with: git, node, npm/pnpm, common linters
- Tool restrictions: `read`, `edit`, `bash`, `write`, `grep`, `find`, `ls` (no `grep_app` which is user-interactive)
- Time limit per review (configurable, default 5 min)

**Review pipeline**:
1. Clone repo at PR ref
2. Read diff (`git diff main...HEAD`)
3. Run analysis tools (lint, typecheck, test — configured per repo)
4. Agent analyzes the diff + tool output, generates review
5. Post comments on individual lines + summary on the PR
6. (Optional) Agent creates fix commits and pushes

**Pricing**:
- Free: public repos, 100 reviews/month
- Pro: $50/mo — private repos, 500 reviews/month, auto-fix
- Enterprise: custom — on-prem option, unlimited reviews, SSO

### Timeline

| Step | Effort |
|------|--------|
| GitHub App setup (webhooks, permissions, installation) | 3 days |
| Sandbox provisioning (Fly.io machines) | 3 days |
| Agent review pipeline (checkout, analyze, comment) | 5 days |
| Auto-fix capability (git push from agent) | 2 days |
| Dashboard integration (review history, config) | 3 days |
| Billing + plan enforcement | 2 days |
| **Total Phase 2** | **~18 days** |

---

## Phase 3: Multi-Agent Teams

### Goal

Orchestrate teams of specialist agents. A "staff engineer" agent plans the work, delegates to "specialist" agents (frontend, backend, test, docs), and reviews their output. The user interacts with the team as a whole.

### Architecture

```
User -> "Staff Engineer" Agent
           |
      Plans task, splits into subtasks
           |
     +-----+------+------+------+
     |     |      |      |      |
   Frontend Backend Test  Docs   (specialist agents)
     |     |      |      |      |
     +-----+------+------+------+
           |
      "Staff Engineer" Agent
      Reviews, integrates, presents
```

### Key Components

**Agent team runtime** (`packages/agent-team/`):
- `TeamOrchestrator` — manages agent lifecycle, task routing, dependency resolution
- `SpecialistAgent` — an agent instance with a role-specific system prompt + tool set
- `TeamSession` — shared context across all agents in the team
- `ArtifactManager` — cross-agent artifact sharing (generated code, test results, docs)

**Tools**:
- `delegate(task, specialist)` — spawn subtask to a specialist, await result
- `review(artifact)` — request another agent to review output
- `merge(artifacts)` — combine outputs from multiple specialists
- `share(context)` — broadcast context to all agents in the team

**Dashboard additions**:
- Team session visualization (branching agent tree)
- Per-agent cost/token tracking
- Agent chat log per specialist

### Timeline

| Step | Effort |
|------|--------|
| Agent team protocol design (message passing, context sharing) | 5 days |
| `TeamOrchestrator` implementation | 5 days |
| `SpecialistAgent` wrapper with role-based tools | 3 days |
| Artifact manager (cross-agent shared context) | 3 days |
| Dashboard: team session visualization | 3 days |
| Dashboard: per-agent analytics | 2 days |
| **Total Phase 3** | **~21 days** |

---

## Dependencies & Prerequisites

| Before Phase 2 | Before Phase 3 |
|----------------|----------------|
| Phase 1 is live | Phase 1 is live |
| GitHub App infra | Phase 2 is live (sandbox infra reused) |
| Sandbox execution infra | Agent team protocol designed |

## Risk Register

| Risk | Phase | Mitigation |
|------|-------|------------|
| Low adoption of Session Hub | 1 | Make CLI sync seamless (auto-enable after login, zero-config). Free tier generous enough to hook users. |
| Session data sensitivity concerns | 1 | Server-side encryption at rest. Publish security whitepaper. Enterprise tier gets client-side encryption option. |
| CI Agent crowded market (Copilot, CodeRabbit, etc.) | 2 | Squido's edge: Squido can execute arbitrary tools (run tests, check builds), not just comment on diffs. |
| Infra cost at scale | 1 | Workers + D1 scale well. R2 is cheap. Largest cost will be sandbox compute in Phase 2. |
| OSS community fork without cloud | 1 | Keep CLI fully functional offline. Cloud is additive value, not gating. |

## Key Metrics

| Phase | Metric | Target (Month 3) |
|-------|--------|------------------|
| 1 | Cloud sign-ups | 500 |
| 1 | Paid conversions | 5% (25 paid users) |
| 1 | Sessions synced per day | 2,000 |
| 1 | Monthly recurring revenue | $500-$1,000 |
| 2 | Repos installed | 50 |
| 2 | Reviews completed | 1,000 |
| 3 | Team sessions created | 100 |

---

## Immediate Next Steps

1. Create the `packages/cloud/` workspace in the monorepo
2. Deploy the Hono API skeleton to Cloudflare Workers (health endpoint + empty routes)
3. Set up D1 database with migrations
4. Implement `SquidoCloudClient` + `CloudAuth` in the CLI
5. Build the dashboard landing page (`/dashboard` with auth gate)
