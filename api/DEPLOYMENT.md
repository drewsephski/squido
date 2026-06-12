# Squido Cloud API — Deployment Guide

This document covers setting up and deploying the Squido Cloud API
(Cloudflare Workers + D1 + R2) for production.

---

## Prerequisites

- Node.js >= 22
- A Cloudflare account with Workers paid plan (D1 requires paid)
- A GitHub OAuth App (for user authentication)
- Stripe account (optional, for billing)

---

## 1. Install Dependencies

```bash
cd api
npm install
```

---

## 2. Create Cloudflare Resources

### 2a. Login to Cloudflare

```bash
npx wrangler login
```

### 2b. Create D1 Database

```bash
npx wrangler d1 create squido-cloud
```

This outputs a database ID. Add it to `wrangler.toml`:

```toml
[[d1_databases]]
binding = "DB"
database_name = "squido-cloud"
database_id = "your-database-id-here"  # <-- paste here
```

### 2c. Create R2 Bucket

```bash
npx wrangler r2 bucket create squido-sessions
```

---

## 3. Run Database Migrations

```bash
# Local (development)
npm run migrate:local

# Production
npm run migrate:prod
```

The migration creates these tables:
- `users` — GitHub-authenticated user accounts
- `sessions` — Agent session metadata
- `session_entries` — Raw JSONL entries (with FTS5 full-text search)
- `session_shares` — Shareable view links
- `oauth_states` — OAuth device flow tracking

---

## 4. Configure Secrets

### 4a. Create a GitHub OAuth App

1. Go to https://github.com/settings/developers
2. Click "New OAuth App"
3. Set:
   - **Application name**: Squido Cloud
   - **Homepage URL**: `https://squidagent.app`
   - **Authorization callback URL**: `https://app.squidagent.app/dashboard/auth/callback`
4. Note the Client ID and Client Secret

### 4b. Set Wrangler Secrets

```bash
echo "your_client_id" | npx wrangler secret put GITHUB_CLIENT_ID
echo "your_client_secret" | npx wrangler secret put GITHUB_CLIENT_SECRET
echo "your_jwt_secret" | npx wrangler secret put JWT_SECRET
```

Optional (for billing):
```bash
echo "sk_live_..." | npx wrangler secret put STRIPE_SECRET_KEY
echo "whsec_..." | npx wrangler secret put STRIPE_WEBHOOK_SECRET
```

---

## 5. Local Development

Create a `.dev.vars` file (copy from `.dev.vars.example`):

```bash
cp .dev.vars.example .dev.vars
# Fill in your development secrets
```

Run the dev server:

```bash
npm run dev
```

The API will be available at `http://localhost:8787`.
The dashboard dev server runs on `http://localhost:5173` (from `web-ui/`).

### Local D1

The first time you run `npm run dev`, Wrangler creates a local SQLite
database for D1. Run migrations against it:

```bash
npm run migrate:local
```

---

## 6. Production Deploy

### 6a. Deploy the Worker

```bash
npm run deploy
```

This deploys to the `squido-cloud-api` Worker on Cloudflare's global network.

### 6b. Configure Custom Domain

In the Cloudflare Dashboard -> Workers & Pages -> `squido-cloud-api`:
- Add a custom domain: `api.squidagent.app`
- Set up SSL/TLS (automatic with Cloudflare)

### 6c. Update Dashboard Config

In `web-ui/src/dashboard/api.ts`, set:

```typescript
export const API_BASE_URL = "https://api.squidagent.app";
```

---

## 7. Verify Deployment

```bash
# Health check
curl https://api.squidagent.app/v1/health

# Should return:
# { "status": "ok", "version": "0.1.0", "timestamp": "..." }
```

---

## 8. Stripe Billing Setup (Optional)

1. Create products in Stripe Dashboard:
   - **Pro** ($15/month): `prod_pro_monthly`
   - **Team** ($30/user/month): `prod_team_monthly`

2. Update `productIdToTier()` in `src/routes/account.ts` with your product IDs

3. Set Stripe secrets via `wrangler secret put`

4. Configure the Stripe webhook endpoint:
   - URL: `https://api.squidagent.app/v1/account/billing/webhook`
   - Events: `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`

---

## Architecture Notes

```
Client (CLI)                    Client (Dashboard)
    |                                |
    v                                v
api.squidagent.app (Workers)    app.squidagent.app (Pages)
    |                                |
    v                                |
  D1 (metadata)                      |
  R2 (session blobs)                 |
    |                                |
    +------ Stripe (billing) --------+
```

- The CLI pushes session data via the API (device OAuth flow)
- The Dashboard pulls data for viewing (web OAuth flow)
- Both share the same user database and session storage
- Public share links bypass auth using a view token
