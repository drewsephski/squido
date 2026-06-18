import { Logo } from "./Logo.tsx"
import { useTypewriter } from "../hooks/useTypewriter.ts"

const TERMINAL_LINES = [
	"$ squido",
	"> add a retry wrapper around the fetch client",
	"  read src/api/client.ts",
	"  write src/api/retry.ts",
	"  edit src/api/client.ts",
	"  bash npm run check",
	"  All checks passed. 3 call sites wired in.",
] as const

const PROVIDERS = [
	"Anthropic",
	"OpenAI",
	"Google Gemini",
	"xAI",
	"DeepSeek",
	"Mistral",
	"GitHub Copilot",
	"OpenRouter",
	"Amazon Bedrock",
	"Azure OpenAI",
	"Google Vertex",
	"Cloudflare",
	"Vercel AI Gateway",
	"Groq",
	"Cerebras",
	"NVIDIA NIM",
	"Together AI",
	"Fireworks AI",
	"Hugging Face",
	"OpenCode Zen",
	"ZAI",
	"Moonshot AI",
	"Kimi",
	"MiniMax",
	"Xiaomi MiMo",
	"Ant Ling",
] as const

const STATS = [
	{ label: "Tools", value: "5" },
	{ label: "Providers", value: "35" },
	{ label: "Models", value: "980" },
] as const

function TerminalDemo() {
	const { visible } = useTypewriter(TERMINAL_LINES, {
		charDelay: 22,
		linePause: 320,
	})

	return (
		<div className="hero-terminal">
			<div className="terminal-header">
				<span className="terminal-dot terminal-dot-close" />
				<span className="terminal-dot terminal-dot-min" />
				<span className="terminal-dot terminal-dot-max" />
				<span className="terminal-title">squido — zsh</span>
			</div>
			<div className="terminal-body" aria-label="Example Squido session">
				{visible.map((line, i) => (
					<div key={i} className="terminal-line">
						{line.startsWith("$") && (
							<span className="terminal-prompt">{line.slice(0, 1)}</span>
						)}
						{line.startsWith(">") && (
							<span className="terminal-tool">{line.slice(0, 1)}</span>
						)}
						<span
							className={
								line.startsWith("  ")
									? "terminal-output"
									: line.startsWith("$")
										? "terminal-cmd"
										: "terminal-input"
							}
						>
							{line.startsWith("$") || line.startsWith(">")
								? line.slice(1).trimStart()
								: line}
						</span>
					</div>
				))}
				</div>
			<div className="terminal-status" aria-hidden="true">
				<span className="terminal-status-dot" />
				<span className="terminal-status-cwd">~/projects/api</span>
				<span className="terminal-status-sep" />
				<span className="terminal-status-model">sonnet:high</span>
				<span className="terminal-status-sep" />
				<span className="terminal-status-meta">14.6k tok</span>
				<span className="terminal-status-sep" />
				<span className="terminal-status-cost">$0.07</span>
			</div>
			<div className="terminal-scanlines" aria-hidden="true" />
			<div className="terminal-vignette" aria-hidden="true" />
		</div>
	)
}

export function Hero() {
	return (
		<section className="hero">
			<div className="hero-spotlight" aria-hidden="true" />
			<div className="hero-aurora" aria-hidden="true" />
			<div className="hero-grid" aria-hidden="true" />

			<aside className="hero-corner hero-corner-tl" aria-hidden="true">
				<span className="hero-corner-mark" />
				<span className="hero-corner-label">SQUIDO // TERMINAL AGENT</span>
			</aside>
			<aside className="hero-corner hero-corner-tr" aria-hidden="true">
				<span className="hero-corner-label">v0.2.1 · MIT</span>
				<span className="hero-corner-mark" />
			</aside>
			<aside className="hero-corner hero-corner-bl" aria-hidden="true">
				<span className="hero-corner-mark" />
				<span className="hero-corner-label">READ · BASH · EDIT · WRITE</span>
			</aside>
			<aside className="hero-corner hero-corner-br" aria-hidden="true">
				<span className="hero-corner-label">19+ PROVIDERS</span>
				<span className="hero-corner-mark" />
			</aside>

			<div className="container hero-inner">
				<div className="hero-kicker animate-in delay-1">
					<span className="hero-kicker-line" />
					<Logo size={22} />
					<span className="hero-kicker-text">Open source coding agent</span>
					<span className="hero-kicker-line" />
				</div>

				<h1 className="hero-title text-balance animate-in delay-2">
					Coding agent
					<br />
				<span className="hero-title-accent">for your terminal</span>
				</h1>

				<p className="hero-subtitle text-balance animate-in delay-3">
					Read files, run commands, edit code, and write new files — all from
					one CLI. Built for developers who live in the shell.
				</p>

				<div className="hero-actions animate-in delay-4">
					<a href="#install" className="btn btn-primary">
						Install Squido
						<span className="btn-arrow" aria-hidden="true">{"\u2193"}</span>
					</a>
					<a
						href="https://github.com/drewsephski/squido"
						target="_blank"
						rel="noopener noreferrer"
						className="btn btn-secondary"
					>
						View source
					</a>
				</div>

				<div className="hero-spec animate-in delay-5" aria-label="Squido specification">
					<div className="hero-spec-header">
						<span className="hero-spec-label">System spec</span>
						<span className="hero-spec-status">
							<span className="hero-spec-dot" />
							Open source · MIT
						</span>
					</div>
					<dl className="hero-spec-stats">
						{STATS.map((s) => (
							<div key={s.label} className="hero-spec-stat">
								<dt>{s.label}</dt>
								<dd>{s.value}</dd>
							</div>
						))}
					</dl>
					<div className="hero-spec-divider" />
					<div className="hero-spec-providers">
						<span className="hero-spec-providers-label">Works with</span>
						<ul className="hero-spec-providers-list">
							{PROVIDERS.map((p) => (
								<li key={p}>{p}</li>
							))}
						</ul>
					</div>
					<span className="hero-spec-corner hero-spec-corner-tl" aria-hidden="true" />
					<span className="hero-spec-corner hero-spec-corner-tr" aria-hidden="true" />
					<span className="hero-spec-corner hero-spec-corner-bl" aria-hidden="true" />
					<span className="hero-spec-corner hero-spec-corner-br" aria-hidden="true" />
				</div>

				<div className="hero-stage animate-in delay-6">
					<div className="hero-halo" aria-hidden="true" />
					<TerminalDemo />
					<div className="hero-pedestal" aria-hidden="true" />
				</div>
			</div>
		</section>
	)
}
