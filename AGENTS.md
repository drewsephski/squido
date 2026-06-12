# Development Rules

Prioritize retrieval-led reasoning over pretrained-knowledge-led reasoning.

## Conversational Style

- Keep answers short and concise
- No emojis in commits, issues, PR comments, or code
- No fluff or cheerful filler text
- Technical prose only, be direct

## Code Quality

- Read files in full before wide-ranging changes
- No `any` unless absolutely necessary
- Use only erasable TypeScript syntax (no enums, no namespaces, no parameter properties)
- Never remove or downgrade code to fix type errors from outdated deps; upgrade the dep instead
- Biome manages formatting + linting: tab indent, indent width 3, line width 120
- Biome skips `test-sessions.ts` and `models.generated.ts` — don't edit generated model files manually

## Build & Verify

- After any code change: `npm run check`. Fix all errors before committing.
- `npm run check` runs: Biome check → pinned-deps check → TS relative-imports check → shrinkwrap check → tsgo typecheck → browser smoke test
- Never run `npm run build` or `npm test` unless explicitly requested
- Typechecking uses `tsgo` (not `tsc --noEmit`)
- All relative imports use `.ts` extensions during dev (`allowImportingTsExtensions` + `rewriteRelativeImportExtensions`)

## Monorepo Structure

- **npm workspaces** — root `package.json` has workspace scripts; do not edit individual package manifests unless the change is scoped to that package
- **Build order**: `tui` → `ai` → `agent` → `cli`. Root `npm run build` handles this.
- **Test runners**: `vitest` for ai, agent, cli; `node --test` for tui
- **test.sh** runs the full test suite with all API keys unset — use this for CI-like runs
- **`packages/ai/`** has two codegen scripts (`generate-models`, `generate-image-models`) that regenerate `models.generated.ts` — run these when the model registry or provider list changes

## Package Boundaries

| Package | Path | Purpose |
|---------|------|---------|
| tui | `packages/tui/` | Terminal rendering engine (differential rendering, Kitty/iTerm2 image protocol) |
| ai | `packages/ai/` | LLM provider abstraction — 19+ providers, streaming, model registry with cost data |
| agent | `packages/agent/` | Agent runtime — state machine, tool execution, context compaction, session persistence |
| cli | `packages/cli/` | Main CLI entrypoint, interactive TUI mode, filesystem tools (read/write/edit/bash/grep/find/ls), extension system, RPC mode |
| web-ui | `web-ui/` | Vite + React landing page (separate build from npm workspaces) |

## Framework / Toolchain Quirks

- `tsconfig.base.json` uses `erasableSyntaxOnly: true` and `module: "Node16"`
- `@drewsepsi/squido-cli` is the published npm package name
- The CLI is distributed as both an npm package and standalone binaries (via Bun)
- Shrinkwrap generation (`npm run shrinkwrap:coding-agent`) produces a lockfile-based pinned dependency set for standalone distribution
- No CI pipeline is configured in this repo — there is no `.github/workflows/`
- No opencode.json config file exists

## Testing Quirks

- Tests in ai, agent, and cli that hit LLM providers require valid API keys in environment variables or `~/.pi/agent/auth.json`
- `test.sh` moves auth.json aside and unsets all API key env vars — only tests that do not need API keys will pass under this script
- Node.js >= 22.19.0 is required

## License

MIT
