# Development Rules

Prioritize retrieval-led reasoning over pretrained-knowledge-led reasoning.

## Conversational Style

- Keep answers short and concise
- No emojis in commits, issues, PR comments, or code
- No fluff or cheerful filler text
- Technical prose only, be direct

## Code Quality

- No `any` unless absolutely necessary
- Use only erasable TypeScript syntax (no enums, no namespaces, no parameter properties)
- Never remove or downgrade code to fix type errors from outdated deps; upgrade the dep instead
- Biome manages formatting + linting: tab indent, indent width 3, line width 120
- Biome skips `test-sessions.ts` and `models.generated.ts` -- don't edit generated model files manually

## Build & Verify

- After any code change: `npm run check`. Fix all errors before committing.
- `npm run check` runs: Biome lint/format (`--write --error-on-warnings`) -> pinned-deps check -> TS relative-imports check -> shrinkwrap check -> `tsgo --noEmit` typecheck -> esbuild browser smoke test
- Never run `npm run build` or `npm test` unless explicitly requested
- Typechecking uses `tsgo` (not `tsc --noEmit`)
- All relative imports use `.ts` extensions during dev (`allowImportingTsExtensions` + `rewriteRelativeImportExtensions`)
- Biome lints with warnings-as-errors (`--error-on-warnings`), auto-formats, and only checks `packages/*/src/`, `packages/*/test/`, and `packages/cli/examples/` -- files outside those paths are skipped

## Monorepo Structure

- **npm workspaces** -- root `package.json` has workspace scripts; do not edit individual package manifests unless the change is scoped to that package. Uses `package-lock.json` (not pnpm even though `pnpm-lock.yaml` exists from before).
- **Install**: `npm install --ignore-scripts` (some optional deps have native build scripts).
- **Build order** (root `npm run build` handles this): `tui` -> `ai` -> `agent` -> `cloud` -> `cli` -> `review-agent` -> `web-ui`
- **Test runners**: `vitest` for ai, agent, cli, review-agent; `node --test` for tui
- **test.sh** runs the full test suite with all API keys unset -- use this for CI-like runs
- **`packages/ai/`** has two codegen scripts (`generate-models`, `generate-image-models`) that regenerate `models.generated.ts` and `image-models.generated.ts` -- run these when the model registry or provider list changes
- **`web-ui/`**: Vite + React app with its own `package-lock.json` and separate build (not in npm workspace during dev)
- **`api/`**: Cloudflare Worker (Hono + D1 + R2), not part of npm workspaces -- has its own `package.json`, `wrangler.toml`, and deploy commands (`npm run dev` / `npm run deploy`)

## Package Boundaries

| Package | Path | Purpose |
|---------|------|---------|
| tui | `packages/tui/` | Terminal rendering engine (differential rendering, Kitty/iTerm2 image protocol, `node --test` runner) |
| ai | `packages/ai/` | LLM provider abstraction -- 19+ providers, streaming, model registry with cost data, OAuth, image models |
| agent | `packages/agent/` | Agent runtime -- state machine, tool execution, context compaction, session persistence |
| cloud | `packages/cloud/` | Cloud sync client -- session push to the Cloudflare API (optional dep of cli) |
| cli | `packages/cli/` | Main CLI entrypoint (`squido`), interactive TUI mode, filesystem tools, extension system, RPC mode, SDK |
| review-agent | `packages/review-agent/` | GitHub PR review agent (GitHub Action) -- uses esbuild bundle for distribution |
| web-ui | `web-ui/` | Vite + React landing page + dashboard (separate build from npm workspaces) |

## Framework / Toolchain Quirks

- `tsconfig.base.json` uses `erasableSyntaxOnly: true` and `module: "Node16"`
- `@drewsepsi/squido-cli` is the published npm package name
- CLI entrypoint: `packages/cli/src/cli.ts` (shebang). The `bun/` directory has an alternate entry for standalone binary builds.
- The CLI is distributed as both an npm package and standalone binaries (`npm run build:binary` from packages/cli -- uses Bun to compile to native binaries for 6 platforms)
- Shrinkwrap generation (`npm run shrinkwrap:coding-agent`) produces a lockfile-based pinned dependency set at `packages/cli/npm-shrinkwrap.json` for standalone distribution
- All external deps must be pinned to exact versions (no ranges); enforced by `scripts/check-pinned-deps.mjs`
- No CI pipeline -- no `.github/workflows/`
- `opencode.json` only registers the browser plugin + MCP; no local instruction files referenced
- `scripts/` has helper scripts for release, versioning, profiling, stats

## Testing Quirks

- Tests in ai, agent, and cli that hit LLM providers require valid API keys in environment variables or `~/.pi/agent/auth.json`
- `test.sh` moves auth.json aside and unsets ~50 API key env vars -- only tests that do not need API keys will pass under this script
- Node.js >= 22.19.0 is required

## Additional Sources

- `docs/adr/` -- Architecture Decision Records
- `docs/agents/` -- Domain model, issue tracker config, triage labels
- `CONTEXT.md` -- Commercialization glossary (products, monetization, cloud infra concepts)
- `PRODUCT.md` -- Product identity, design principles, target users
- `api/DEPLOYMENT.md` -- Cloudflare Worker deployment guide

## License

MIT
