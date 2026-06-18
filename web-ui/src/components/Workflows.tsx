import { useState } from "react"
import { useReveal } from "../hooks/useReveal.ts"
import { useTypewriter } from "../hooks/useTypewriter.ts"

type Workflow = {
	id: string
	index: string
	title: string
	description: string
	status: { cwd: string; model: string; tokens: string; cost: string }
	lines: readonly string[]
}

const WORKFLOWS: Workflow[] = [
	{
		id: "explore",
		index: "01",
		title: "Explore a codebase",
		description:
			"Hand it a question and it reads, greps, and traces calls until it can answer with file and line references.",
		status: { cwd: "~/projects/api", model: "sonnet", tokens: "8.2k", cost: "$0.03" },
		lines: [
			"$ squido",
			"> How does auth work in this repo?",
			"  read src/auth/session.ts",
			"  read src/auth/oauth.ts",
			"  grep verifyToken src/",
			"  Two paths: OAuth in oauth.ts and session",
			"  cookies in session.ts. verifyToken()",
			"  lives at session.ts:142.",
		],
	},
	{
		id: "fix",
		index: "02",
		title: "Fix a failing test",
		description:
			"Run the suite, read the failure, patch the code, and re-run until green — without leaving the session.",
		status: { cwd: "~/projects/api", model: "sonnet", tokens: "11.4k", cost: "$0.04" },
		lines: [
			"$ squido",
			"> auth test is failing on CI",
			"  bash npm test -- auth.test.ts",
			"  FAIL validates token expiry",
			"  read src/auth/auth.test.ts",
			"  edit src/auth/auth.test.ts",
			"  bash npm test -- auth.test.ts",
			"  PASS 1 fixed. Mock was stale.",
		],
	},
	{
		id: "refactor",
		index: "03",
		title: "Refactor safely",
		description:
			"Extract, rename, or restructure with the full call graph in context, then verify with your own check command.",
		status: { cwd: "~/projects/api", model: "sonnet:high", tokens: "18.7k", cost: "$0.09" },
		lines: [
			"$ squido",
			"> Extract retry logic into its own module",
			"  grep retry src/",
			"  read src/api/client.ts",
			"  write src/api/retry.ts",
			"  edit src/api/client.ts",
			"  bash npm run check",
			"  Extracted to retry.ts. 3 sites updated.",
		],
	},
	{
		id: "ship",
		index: "04",
		title: "Ship a feature",
		description:
			"Scaffold files, wire them in, run your checks, and review the diff — end to end in one prompt.",
		status: { cwd: "~/projects/cli", model: "sonnet", tokens: "22.1k", cost: "$0.11" },
		lines: [
			"$ squido",
			"> Add a /share command that uploads a gist",
			"  read packages/cli/src/cli.ts",
			"  write packages/cli/src/commands/share.ts",
			"  edit packages/cli/src/cli.ts",
			"  bash npm run check",
			"  bash git diff --stat",
			"  /share added. Run it to upload a gist.",
		],
	},
]

type Command = {
	cmd: string
	desc: string
}

const COMMANDS: Command[] = [
	{ cmd: "/login", desc: "Authenticate with a provider" },
	{ cmd: "/model", desc: "Switch models mid-session" },
	{ cmd: "/resume", desc: "Continue a past session" },
	{ cmd: "/tree", desc: "Jump to any point in a session" },
	{ cmd: "/fork", desc: "Branch from an earlier message" },
	{ cmd: "/compact", desc: "Free up context when it gets long" },
	{ cmd: "/share", desc: "Upload a private, shareable gist" },
	{ cmd: "/export", desc: "Save a session as HTML" },
]

function WorkflowTerminal({ workflow }: { workflow: Workflow }) {
	const { visible } = useTypewriter(workflow.lines, {
		charDelay: 18,
		linePause: 280,
	})

	return (
		<div className="workflow-terminal" aria-label={`Example session: ${workflow.title}`}>
			<div className="terminal-header">
				<span className="terminal-dot terminal-dot-close" />
				<span className="terminal-dot terminal-dot-min" />
				<span className="terminal-dot terminal-dot-max" />
				<span className="terminal-title">squido — zsh</span>
			</div>
			<div className="terminal-body">
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
				<span className="terminal-status-cwd">{workflow.status.cwd}</span>
				<span className="terminal-status-sep" />
				<span className="terminal-status-model">{workflow.status.model}</span>
				<span className="terminal-status-sep" />
				<span className="terminal-status-meta">{workflow.status.tokens} tok</span>
				<span className="terminal-status-sep" />
				<span className="terminal-status-cost">{workflow.status.cost}</span>
			</div>
			<div className="terminal-scanlines" aria-hidden="true" />
			<div className="terminal-vignette" aria-hidden="true" />
		</div>
	)
}

export function Workflows() {
	const headerRef = useReveal<HTMLDivElement>()
	const [selected, setSelected] = useState(WORKFLOWS[0].id)
	const active = WORKFLOWS.find((w) => w.id === selected) ?? WORKFLOWS[0]

	return (
		<section id="workflows" className="section workflows">
			<div className="container">
				<div ref={headerRef} className="section-header reveal">
					<span className="section-eyebrow">In practice</span>
					<h2 className="section-title text-balance">From prompt to ship</h2>
					<p className="section-desc text-balance">
						Five tools, one loop. Pick a workflow and watch a session play out —
						then steer your own with slash commands.
					</p>
				</div>

				<div className="workflows-layout">
					<ul className="workflow-list" role="tablist" aria-label="Workflows">
						{WORKFLOWS.map((w) => {
							const isActive = w.id === selected
							return (
								<li key={w.id}>
									<button
										type="button"
										role="tab"
										aria-selected={isActive}
										className={`workflow-item${isActive ? " active" : ""}`}
										onClick={() => setSelected(w.id)}
									>
										<span className="workflow-item-index" aria-hidden="true">
											{w.index}
										</span>
										<span className="workflow-item-body">
											<span className="workflow-item-title">{w.title}</span>
											<span className="workflow-item-desc">{w.description}</span>
										</span>
										<span className="workflow-item-arrow" aria-hidden="true">
											{"\u2192"}
										</span>
									</button>
								</li>
							)
						})}
					</ul>

					<div className="workflow-stage">
						<WorkflowTerminal key={active.id} workflow={active} />
					</div>
				</div>

				<div className="commands">
					<div className="commands-header">
						<span className="commands-eyebrow">Slash commands</span>
						<p className="commands-note">
							Type <code>/</code> in the editor for the full list — plus skills,
							prompt templates, and extension commands.
						</p>
					</div>
					<ul className="commands-grid">
						{COMMANDS.map((c) => (
							<li key={c.cmd} className="command-card">
								<code className="command-card-cmd">{c.cmd}</code>
								<span className="command-card-desc">{c.desc}</span>
							</li>
						))}
					</ul>
				</div>
			</div>
		</section>
	)
}
