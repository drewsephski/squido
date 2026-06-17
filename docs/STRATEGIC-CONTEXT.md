# Squido Strategic Context

## Overview

Squido is an open-source terminal-native AI coding agent distributed via npm and standalone binary. CLI binary: `squido`. Published as `@drewsepsi/squido-cli`.

```bash
# Install
npm install -g @drewsepsi/squido-cli

# Run
squido
```

Website: https://squidagent.app  
Config directory: `~/.squido/agent/`  
License: MIT

---

## Monorepo Structure

```
squido/
  packages/
    tui/        @drewsepsi/squido-tui      — Differential-rendering TUI engine
    ai/         @drewsepsi/squido-ai       — Unified multi-provider LLM layer
    agent/      @drewsepsi/squido-agent-core — Agent runtime, state machine, sessions
    cli/        @drewsepsi/squido-cli      — CLI entry, interactive mode, extensions, tools
    cloud/      @drewsepsi/squido-cloud    — Cloud sync client (private)
    review-agent/ @drewsepsi/review-agent  — GitHub Actions PR review agent
  api/          squido-cloud-api           — Cloudflare Workers + Hono + D1 backend
  web-ui/       squido-web-ui              — Vite + React 19 SPA (landing + dashboard + agent chat)
```

Build order: `tui` -> `ai` -> `agent` -> `cloud` -> `cli` -> `review-agent`

---

## Architecture Highlights

### Provider Layer (`packages/ai`)

**35 providers, 979 models, 9 API protocols.**

| API Protocol | Models |
|---|---|
| openai-completions | 434 |
| anthropic-messages | 256 |
| bedrock-converse-stream | 97 |
| openai-responses | 82 |
| azure-openai-responses | 42 |
| mistral-conversations | 30 |
| google-generative-ai | 21 |
| google-vertex | 13 |
| openai-codex-responses | 4 |

Provider registration works via two registries:
1. **Model registry** (`models.generated.ts`) — static model definitions with cost data, context windows, API protocol mappings
2. **API/streaming registry** (`api-registry.ts`) — runtime registry of `StreamFunction` implementations keyed by API protocol

Extensions can register new providers at runtime via `pi.registerProvider()`. Built-in providers include Anthropic, OpenAI, Google, Mistral, AWS Bedrock, Azure, GitHub Copilot, together.ai, Fireworks, Groq, DeepSeek, OpenRouter, and more.

### Agent Runtime (`packages/agent`)

Two-level agent loop:

- **Stateless loop** (`agentLoop` / `runAgentLoop`) — pure agent protocol, no session awareness
- **Stateful harness** (`AgentHarness`) — session persistence, auth resolution, hooks, compaction, branch navigation

Tool execution supports sequential and parallel modes. Lifecycle: `prepareToolCall` -> `executePreparedToolCall` -> `finalizeExecutedToolCall`, with `beforeToolCall` / `afterToolCall` hooks.

Session system: tree-structured entries persisted as JSONL files. Entry types: `message`, `model_change`, `thinking_level_change`, `active_tools_change`, `compaction`, `branch_summary`, `custom`, `custom_message`, `label`, `session_info`, `leaf`. Sessions support forking, cloning, and branching.

### TUI Engine (`packages/tui`)

Custom differential-rendering terminal UI library with:
- Line-level dirty tracking (compares `previousLines` vs `newLines`)
- 60fps capped render loop with throttling
- Overlay/modal system with anchor/percentage/absolute positioning
- Kitty/iTerm2 image protocol support
- Rich component library: editor, markdown, select lists, settings, loader, autocomplete, image viewer
- Keyboard input handling with Kitty protocol, keybinding manager, fuzzy matching

---

## SDK Surface (`packages/cli/src/index.ts`)

All public exports from `@drewsepsi/squido-cli`:

```typescript
// Session creation
createAgentSession(options?)
createAgentSessionFromServices()
createAgentSessionServices()
createAgentSessionRuntime()

// Session management
SessionManager        — CRUD + tree branching
SettingsManager       — global/project settings
AuthStorage           — credential storage
ModelRegistry         — model + provider lookup

// Tool factories
createBashTool, createReadTool, createEditTool
createWriteTool, createGrepTool, createFindTool
createLsTool
createCodingTools     — all tools in one call
createReadOnlyTools   — read-only subset

// Modes
runPrintMode()        — single-shot non-interactive
runRpcMode()          — JSON-RPC on stdin/stdout
RpcClient             — JSON-RPC client class
InteractiveMode       — full interactive TUI session

// Extension system
ExtensionAPI          — pi object passed to extensions
ExtensionContext      — ctx in event handlers
ExtensionRunner       — lifecycle management
ToolDefinition        — LLM-callable tool type
all extension event types, command types, flag types, shortcut types

// Components
all TUI component types and theme utilities
```

---

## Extension System

Fully implemented in `packages/cli/src/core/extensions/`. Extensions receive a `pi` API object with:

```typescript
pi.on(event, handler)           — subscribe to lifecycle events
pi.registerTool(tool)           — add LLM-callable tools
pi.registerCommand(name, opts)  — add slash commands
pi.registerShortcut(key, opts)  — add keybindings
pi.registerFlag(name, opts)     — add CLI flags
pi.registerMessageRenderer(type, renderer) — custom message display
pi.registerProvider()           — add new LLM providers
pi.sendMessage(msg)             — inject messages
pi.setModel(model)              — switch model
pi.setThinkingLevel(level)      — set thinking level
```

Events: `session_start`, `turn_start`, `turn_end`, `message_start`, `message_update`, `message_end`, `tool_execution_start/update/end`, `context`, `before_provider_request`, `after_provider_response`, `model_select`, `input`, `project_trust`, `resources_discover`, and more.

Discovery: `~/.squido/extensions/`, `.squido/extensions/` (project-local), config paths, and explicit `--extension` flags. Loads `.ts`/`.js` files, subdirectories with `index.ts`/`index.js`, or npm packages with `pi.extensions` manifest in `package.json`.

---

## Skills System

Implements the Agent Skills standard. Loads from:
- `~/.squido/skills/` (global)
- `.squido/skills/` (project-local)
- `.agents/skills/` (walking up ancestors)
- Explicit paths via `squido --skill <path>` or package installations

Skills are directories with `SKILL.md`. Validation checks name (lowercase, 1-64 chars), description (1-1024 chars, required). Formatted as XML `<available_skills>` for system prompt.

---

## CLI Modes

| Mode | Command | Description |
|---|---|---|
| interactive | `squido` (default) | Full TUI with editor, autocomplete, slash commands |
| print | `squido -p "prompt"` | Single-shot, output to stdout |
| json | `squido --mode json` | JSON event stream |
| rpc | `squido --mode rpc` | JSON-RPC protocol on stdin/stdout |
| web | `squido --mode web` | WebSocket-based web UI server |

---

## CLI Commands (Package Manager)

```bash
squido install npm:@scope/pkg@1.2.3     # from npm registry
squido install git:github.com/user/repo  # from git
squido install https://github.com/...    # raw URL
squido install ./local/path              # local path
squido remove <source>
squido list                              # installed packages
squido update [source|self]              # update packages or self
squido config                            # open TUI to enable/disable resources
squido --extension <path>                # temporary (no install) extension load
```

Package sources: `npm:`, `git:`, raw URLs, local paths. Installed packages bundle extensions + skills + prompt templates + themes.

---

## CLISlash Commands (in-session)

```
/settings         Open settings menu
/model            Select model (opens selector UI)
/scoped-models    Enable/disable models for Ctrl+P cycling
/export           Export session (HTML default, or .jsonl)
/import           Import and resume session from JSONL
/share            Share session as secret GitHub gist
/copy             Copy last agent message to clipboard
/name             Set session display name
/session          Show session info and stats
/fork             Fork from previous user message
/clone            Duplicate current session
/tree             Navigate session branch tree
/login, /logout   Manage provider credentials
/cloud-login      Sign in to Squido Cloud (GitHub OAuth)
/cloud-enable     Enable automatic session sync
/new              Start a new session
/compact          Manually compact session context
/resume           Resume a different session
/reload           Reload extensions, skills, prompts, themes
/quit             Quit
```

---

## Cloud Infrastructure

Separate from the CLI. Located in `api/` — Cloudflare Workers project using Hono + D1 + R2.

- **Cloud API**: Hono application deployed on Cloudflare Workers
- **Storage**: D1 (metadata), R2 (session blobs), optional full-text search
- **Auth**: GitHub OAuth primary, API key fallback
- **Dashboard**: extends web-ui with authenticated `/dashboard/*` routes (session list, detail, settings, billing)
- **Sync**: Incremental push of session entries after each agent turn, tracks `last_synced_entry_id`

Client package: `@drewsepsi/squido-cloud` (private, built as part of the monorepo).

---

## Review Agent

`@drewsepsi/review-agent` — AI-powered PR review agent for GitHub Actions.

- Runnable as GitHub Action (`action.yml`) or Docker container (`Dockerfile`)
- Uses `@drewsepsi/squido-ai` for LLM access
- Requires no cloud dependency

---

## Web UI

`web-ui/` — Vite + React 19 SPA, built separately (not part of npm workspaces).

Routes:
| Route | Purpose |
|---|---|
| `/` | Landing page (Header + Hero + Features + Install + Footer) |
| `/docs/*` | Documentation viewer (markdown-based) |
| `/agent` | Chat interface via WebSocket to local Squido server |
| `/share/:token` | Public shared session view |
| `/dashboard/*` | Cloud dashboard (auth required) |

---

## Current Positions

### Original
Provider-agnostic coding agent.

### Better
Use any model.

### Better still
Keep your workflow when models change.

### Current
**Own your AI workflow.**

---

## Strategic Thesis

Squido should not compete on being the smartest agent, the most autonomous agent, or the best model — those are battles against model vendors with vastly more resources.

Instead: Squido is the place where developers own, preserve, package, and share *the way they work*. Models change. Workflows endure.

---

## Current Product Diagnosis

### Activation gap
Install -> Open -> See no-model -> Try prompt -> Error -> Leave. Users cannot experience the differentiator without first authenticating with a provider.

### Hidden differentiator
Model switching mid-conversation (`/model`, Ctrl+L, Ctrl+P cycle) currently exists but is buried — users must already be authenticated and in a session to discover it.

---

## Ecosystem Model

| Layer | What | Examples |
|---|---|---|
| 1 | Extensions | Custom tools, providers, renderers, commands, shortcuts, lifecycle hooks |
| 2 | Embedded Products | IDE plugins, Slack bots, CI agents, custom UIs using the SDK |
| 3 | Workflow Packages | Bundled extensions + skills + prompts + themes published via npm/git |

Layer 3 is the most promising direction and currently the least validated.

---

## Existing Foundations

**Fully implemented:**
- Package manager (`squido install/remove/update/list`)
- Extension lifecycle (events, tools, commands, providers, flags, shortcuts, renderers)
- Skills loader (Agent Skills standard)
- Provider abstraction (35 providers, extension-registerable)
- Session branching (forks, clones, tree navigation)
- Session compaction
- OAuth flows (Anthropic, OpenAI Codex, GitHub Copilot)
- Theme system
- Prompt templates
- RPC protocol for integration
- WebSocket mode for browser UIs

**Missing / incomplete:**
- Workflow export/import (no standardized format for packaging a full workflow)
- Registry/marketplace for published packages
- Analytics (install, activation, retention, model switches)
- Streamlined onboarding (first response in <60s without manual auth setup)

---

## Metrics Targets

| Metric | Target |
|---|---|
| Activation (first successful response) | 80%+ |
| Differentiator adoption (model switching) | 40%+ |
| Workflow adoption (saving/sharing workflows) | 50%+ |

---

## Risks

1. Workflow ownership is a founder narrative, not a market need — must validate
2. Users may only care about coding quality, not portability
3. Workflow sharing may never emerge organically
4. Project may remain infrastructure-heavy and user-light — avoid overbuilding

---

## Validation Questions

- Do developers rebuild prompts and workflows repeatedly?
- Do they switch AI tools often?
- Do they care about portability, ownership, and model independence?
- Would they package and share workflows?

Seek evidence that contradicts the thesis. Goal is truth, not validation.

---

## Priorities

1. Fix onboarding — first successful response in under 60 seconds
2. Add analytics (install, first response, model switch, retention)
3. Surface model switching (force discovery of `/model` and Ctrl+P cycling)
4. Workflow export/import (before marketplace, before registry)
5. Registry and marketplace (only after workflow abstraction is validated)

---

## Things to Challenge

- Is workflow ownership actually valuable, or is it just a nice-to-have?
- Is workflow packaging the right abstraction, or should it be simpler?
- Would developers actually share workflows, or is that wishful thinking?
- Are workflows the asset, or are extensions the asset?
- What comparable ecosystems succeeded? What failed?
- What would create genuine network effects?
