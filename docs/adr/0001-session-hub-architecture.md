# ADR 0001: Session Hub Architecture

**Date**: 2026-06-12

**Status**: Accepted

## Context

Squido is an open-source (MIT) coding agent CLI. We want to build a commercial cloud layer on top of it. The first product is Session Hub: an optional cloud sync and dashboard that lets users browse, search, and share their agent sessions.

The key architectural question: how does the cloud layer relate to the open-source CLI?

## Decision

We will build Session Hub as:

1. **CLI-side**: A separate `packages/cloud/` npm workspace (`@drewsepsi/squido-cloud`) that the CLI depends on as an optional peer dependency. The CLI core remains fully functional offline.
2. **Cloud API**: Hono on Cloudflare Workers with D1 (metadata) and R2 (blob storage).
3. **Dashboard**: Extended into the existing `web-ui/` Vite + React app under `/dashboard/*` routes.

## Alternatives Considered

### Alternative A: Build cloud features directly into the open-source CLI

- **Pro**: No package boundary, simpler local development
- **Con**: Bloats the OSS install. Cloud-auth code, sync logic, and API client shipping to every user. Harder to maintain OSS vs proprietary boundary.
- **Verdict**: Rejected. Keeping a clean boundary between OSS and proprietary code is critical for both license hygiene and user trust.

### Alternative B: Cloud API on Next.js with Postgres (Neon)

- **Pro**: Single framework for dashboard + API, richer Postgres features (pgvector, full-text search)
- **Con**: Higher hosting cost, more operational overhead, slower cold starts. D1 is sufficient for Phase 1 metadata volume.
- **Verdict**: Deferred. Phase 1 data volume (< 100K sessions) fits D1 comfortably. Migrate to Postgres if/when search or query patterns demand it.

### Alternative C: New separate dashboard app (Next.js)

- **Pro**: Cleaner separation from marketing site, SSR benefits for SEO on public share pages
- **Con**: Duplicated infra (another build, deploy, domain). The marketing site is already Vite + React. Adding routes is simpler.
- **Verdict**: Deferred. If the dashboard grows complex enough to need SSR or becomes a separate product, split it. For Phase 1, extension is cheaper and faster.

### Alternative D: Client-side encryption for all session data

- **Pro**: Strongest privacy story, no trust required from cloud provider
- **Con**: Kills full-text search (unless we ship a WASM search index client-side). Adds complexity to key management. Our target users already trust GitHub, Linear, Notion with their code.
- **Verdict**: Deferred to Enterprise tier. Standard server-side encryption for Phase 1.

## Consequences

**Positive**:
- CLI stays pure OSS. No cloud code in the MIT-licensed packages.
- Users who don't want the cloud have zero changes to their workflow.
- Cloud sync is decoupled from the agent loop — the `packages/cloud/` package hooks into existing events without modifying core agent code.
- Workers + D1 means near-zero cost at low volume and scales well.

**Negative**:
- Users who want cloud sync need an extra install step (or an auto-install on `squido cloud enable`).
- D1 has less mature full-text search than Postgres. May need to migrate or add a search service (Meilisearch/Turso) later.
- Vite SPA for the dashboard means no SSR for public share pages (SEO impact is minimal — shares are authenticated views).

## Compliance Notes

- Server-side encryption at rest for all session data.
- Users can delete sessions from cloud (DELETE endpoint + cascading entry deletion).
- Session data retention matches subscription tier (free: 7 days, pro: 1 year).
- GDPR deletion requests handled via user-initiated account deletion in dashboard.
