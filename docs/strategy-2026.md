# Squido Strategic Direction (2026)

> **Founder Reality Check**: If, after talking to 50-100 users, developers do not care about workflow ownership and only care about "best coding agent," then the thesis below is wrong and should be abandoned quickly. The next 3 months should be spent validating whether workflow ownership is a real category or merely an appealing founder narrative. **Do not optimize the company around this strategy until the market validates it.**

---

## Executive Summary

Squido is currently positioned as a provider-agnostic AI coding agent.

This positioning is technically accurate but strategically weak.

Provider support is a feature. Workflow ownership is a philosophy.

The strongest long-term opportunity is not becoming another AI coding agent competing on model quality, autonomous capabilities, or tool execution. Those are markets dominated by model vendors and heavily funded companies.

Instead, Squido should become the **ownership layer for AI development workflows**:

> Your AI workflow should outlast any model company.

The core insight is that models, providers, APIs, pricing, and industry leaders change rapidly. Developers should not be forced to rebuild their workflow every time the industry shifts.

Squido's role is to make workflows portable, extensible, shareable, and independent of any single AI vendor.

---

## Current State Diagnosis

### What Exists Today

The codebase contains significantly more infrastructure than the current positioning communicates. Evidence from the codebase:

- **40+ providers** unified behind a single streaming API, with 9 distinct API transport implementations, 33+ env-var API key mappings, and a `registerProvider()` API that lets extensions add entire LLM backends (not just tools).
- **Custom TUI engine** (`@drewsepsi/squido-tui`) with differential rendering (3 strategies), CSI 2026 synchronized output, Kitty/iTerm2 inline image protocol, and IME-aware hardware cursor positioning — built from scratch, no blessed/ink dependency.
- **Extension system** with 30+ lifecycle events, provider registration, tool registration, CLI flags, keyboard shortcuts, slash commands, custom message renderers, and UI widgets.
- **4 run modes** from one binary: interactive TUI, print (pipe-friendly), RPC (full JSON-LD protocol for embedding), web (HTTP + React UI).
- **Dual distribution**: npm global package and standalone Bun compiled binary with auto-detected self-update for 4 package managers plus binary.
- **Public SDK exports**: `createAgentSession`, tool factories, `SessionManager`, `RpcClient`, `runRpcMode`, all extension types, all UI components, theme system, skills loader — exported from `@drewsepsi/squido-cli` for programmatic use.
- **4 independently consumable packages**: `tui`, `ai`, `agent`, `cli` — each publishable and usable separately.
- **Tree-based session model** with fork, branch navigation, compaction, HTML export with interactive viewer, and cloud sync.
- **Project trust model** with explicit approve/deny for project-local agent configurations.
- **Context compaction system** with LLM-based branch summarization and token estimation.

The exported APIs suggest Squido is closer to an **SDK and platform** than a traditional CLI application. This is a signal the architecture was designed for an ecosystem, even if the product isn't positioned that way yet.

### The Biggest Product Problem: Activation Failure

Current onboarding experience:

```
npm install -g @drewsepsi/squido-cli
→ squido
→ header: "squido vX.Y.Z · Web UI: http://localhost:9876/agent"
→ empty chat, editor at bottom
→ footer: "~/Desktop (main)  ↑0 ↓0 $0.000  0%/200k  no-model"
→ type prompt
→ "No models available. Use /login to log into a provider via OAuth or API key."
→ user leaves
```

The first-time-setup wizard is gated behind `SQUIDO_EXPERIMENTAL=1` — it does not run by default. The user must discover `/login`, select a provider, enter an API key, then discover `/model`, select a model, before they can run their first prompt.

**The user never experiences the product's differentiators.** The first-run experience resembles a broken installation rather than a compelling coding assistant.

### Hidden Value Problem

The strongest existing capability is **model switching within the same workflow** (`/model anthropic/*` → `/model openai/*` mid-session). No competitor does this today. However:

- Requires configuring multiple providers first
- Requires discovering the `/model` command
- Requires running multiple prompts to notice the behavioral difference
- Requires deliberate experimentation rather than happening naturally

The moat exists but is not surfaced. It's infrastructure without a first act.

### Deployment Verification

No CI/CD pipeline or GitHub Actions workflows exist in the repository. Deployment verification procedures (rollback steps, monitoring queries) are not documented.

---

## Positioning Recommendation

### Positioning Evolution

| Stage | Message | Problem |
|-------|---------|---------|
| Current | "Provider-agnostic coding agent" | Too feature-focused, no emotional hook |
| Better | "Use any model" | Moat erodes as every tool adds multi-model |
| Stronger | "Keep your workflow when models change" | Better but still defensive |
| **Recommended** | **"Own your AI workflow"** | Philosophy, not feature — durable |

### Core Narrative

Developers should not rebuild their workflow every time the AI industry changes.

- Models will change.
- Providers will change.
- Pricing will change.
- APIs will change.
- Company priorities will change.

Workflows should persist.

Squido exists to make AI workflows portable, durable, and independent of any single vendor.

### Strategic Category

| Do Not Position As | Position As |
|---|---|
| Another coding agent | Open workflow infrastructure |
| A Claude Code alternative | The workflow ownership layer |
| A Codex competitor | Linux for AI coding |
| "Better AI" | "Stable workflow in an unstable industry" |

---

## Product Vision

### What Squido Is

An open-source platform where developers own, customize, package, and share AI development workflows.

The vision is closer to **npm for AI workflows** than to a traditional coding agent. The value is not the binary — it's the ecosystem of workflows, extensions, and configurations that accumulate around it.

### What Squido Is Not

A race to build the smartest autonomous agent. Model vendors (Anthropic, OpenAI, Google, DeepSeek) will always have structural advantages in that competition — billions in funding, frontier models, research teams. Competing there is a losing strategy.

### Ecosystem Layers (if successful)

| Layer | What the community builds | Maturity |
|---|---|---|
| Extensions | Custom tools, providers, commands, renderers, UI widgets | Already possible today |
| Workflow packages | Bundled skills + prompts + extensions + model config + settings | Needs `workflow` primitive |
| Registry | Searchable workflow marketplace with creators, ratings, versions | Distant |
| Standalone products | IDE plugins, Slack bots, CI agents, custom frontends | Enabled today via RPC/SDK |

---

## Roadmap

### Phase 1 (0-3 Months): Activation and Validation

**Goal: Get 100 developers who genuinely love Squido. Validate the workflow ownership thesis.**

#### Priority 1: Fix Onboarding (existential)

- Auto-detect API keys from environment variables on first launch (the codebase already has all 33+ mappings in `env-api-keys.ts`)
- On first run, scan env vars and `auth.json`, pick the first available model automatically — never show "no-model"
- If no keys are found, show a guided setup wizard (unhide the `SQUIDO_EXPERIMENTAL=1` flow) with provider selection and API key input
- Target: first successful response in under 60 seconds from install
- **Success metric: first-response rate > 80%**

#### Priority 2: Force Discovery of Model Switching

- On successful first response, show a subtle prompt: "Type `/model` to try a different LLM"
- If multiple providers are configured, suggest switching: "You also have access to OpenAI — try `/model openai/gpt-5`"
- Add an optional interactive tour (30 seconds) demonstrating model switching
- Consider a "compare" mode that shows responses from multiple models side by side
- **Success metric: > 40% of users switch models during first session**

#### Priority 3: Workflow Export Primitive

- `squido workflow export` — exports current configuration as a portable package (skills, prompts, extensions, settings, model preferences)
- `squido workflow import <file>` — imports a shared workflow
- File format: a simple YAML/JSON manifest + bundled resource files
- This enables manual sharing on GitHub, Reddit, Discord before any registry exists
- **Success metric: workflow exports per active user (qualitative signal, not a target)**

#### Stop Doing

- Adding new providers (40+ is already beyond what adoption justifies)
- Adding new run modes (4 is already over-engineered for current scale)
- Rendering optimizations (the TUI is already the best in class)
- Protocol/infrastructure expansion of any kind

### Phase 2 (3-6 Months): Workflow as a First-Class Object

**Goal: Become the place where power users store and share how they work.**

#### Workflow Packages

```bash
squido workflow install rails-maintainer
squido workflow install startup-founder
squido workflow install security-audit
squido workflow install local-llm-dev
```

Each package can include:
- Skills (YAML frontmatter + markdown instructions)
- Prompt templates
- Extension references (auto-installed)
- Custom slash commands
- Provider routing rules ("use DeepSeek for code review, Claude for architecture")
- Settings overrides

The `PackageManager` infrastructure already exists in the CLI — this is connecting it to a user-facing abstraction.

**Success metric: workflow installs per retained user, published workflows per creator**

#### Workflow Fingerprints

After N sessions, Squido can infer a user's workflow fingerprint:
- Preferred models per task type
- Common prompt patterns
- Extension usage frequency
- Settings drift from defaults

Export as a shareable workflow package: "here's how I actually work."

This turns passive usage into a shareable artifact — the first true viral loop.

### Phase 3 (6-12 Months): Creator-Driven Distribution

**Goal: Turn workflow creators into your distribution engine.**

#### Workflow Registry

- Search, install, versioning, ratings, discovery
- Creator profiles with download counts
- URL-based install: `squido install user/workflow-name`
- CLI discovery: `squido search rails`

#### Creator Economy

The growth model becomes:

```
Platform → Workflow Creators → Users → More Installs → More Creators
```

This is the first true viral loop in the AI coding space. No competitor has this model because no competitor has workflow portability as their philosophy.

**Success metrics: published workflows/month (increasing MoM), creators active after 90 days (> 30%), total workflow installs**

---

## North Star Metrics

### Activation

- **First successful response rate** — target > 80%
- Currently ~0% (first-run shows "no-model")

### Differentiator Adoption

- **% of users who switch models during their first session** — target > 40%
- This is the moment users understand why Squido exists

### Workflow Adoption

- **% of retained users with at least one saved workflow** — target > 50%
- Proves the workflow ownership thesis

### Ecosystem Health

- **Published workflows per month** — target: increasing month-over-month
- **Workflow creators active after 90 days** — target > 30%

---

## Stop Doing List

For the next 6 months, avoid prioritizing:

| Area | Current state | Why to stop |
|---|---|---|
| Additional providers | 40+ already supported | No user installs because provider #41 arrived |
| Additional run modes | 4 modes (TUI, print, RPC, web) | Already exceeds current adoption needs |
| Rendering optimizations | Best-in-class TUI engine | Invisible to users unless they comparison-shop |
| Protocol/infrastructure | Extensions, lifecycle hooks, provider API, cloud sync | All necessary but sufficient for >10x current scale |
| Architecture refinement | Codebase is sound | Premature optimization for unvalidated scale |

These areas already exceed current adoption levels. Focus energy on activation and distribution instead.

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|---|---|---|---|
| Workflow ownership is not a real category | Medium | Fatal | Talk to 50-100 users in Phase 1. If nobody cares, pivot back to feature competition. |
| Activation fix doesn't improve retention | Low | High | A/B test onboarding variants in Phase 1. Iterate rapidly. |
| Model vendors add multi-provider support | High | Medium | Positioning as "own your workflow" is immune to this. Your moat is philosophy, not features. |
| Big vendor copies workflow sharing | Low | Medium | MIT license + open ecosystem means community can fork. Incumbents can't copy "open." |
| Community doesn't create workflows | Medium | Medium | Seed with 5-10 high-quality official workflows. Pay creators if needed. |
| You can't out-OSS the incumbents | Low | Medium | You don't need to out-feature them. You need to out-believe them. Linux didn't beat Windows on features. |

---

## Final Thesis

The highest-upside future for Squido is not becoming the best AI coding agent.

The highest-upside future is becoming the place where developers own, preserve, and share the way they work.

- **Models are temporary.**
- **Workflows endure.**

Squido should be built around that belief.

Everything else — the providers, the TUI, the extensions, the run modes — is implementation detail supporting that mission.
