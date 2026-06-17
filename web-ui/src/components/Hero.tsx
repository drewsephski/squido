import { Logo } from "./Logo.tsx";
import { useTypewriter } from "../hooks/useTypewriter.ts";

const TERMINAL_LINES = [
	"$ squido",
	"> read src/app.ts",
	"  120 lines · typescript",
	"> edit src/auth.ts --add-auth",
	"  Applied 1 change",
	"> bash npm run check",
	"  All checks passed",
	"> write src/utils.ts",
	"  Created new file",
] as const;

function TerminalDemo() {
	const { visible, showCursor } = useTypewriter(TERMINAL_LINES, {
		charDelay: 24,
		linePause: 350,
	});

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
				{showCursor && (
					<span className="terminal-cursor" aria-hidden="true" />
				)}
			</div>
			<div className="terminal-scanlines" aria-hidden="true" />
		</div>
	);
}

export function Hero() {
	return (
		<section className="hero">
			<div className="hero-atmosphere" aria-hidden="true" />
			<div className="container hero-inner">
				<div className="hero-brand">
					<Logo size={48} />
					<span className="section-eyebrow hero-eyebrow">
						Open source · MIT
					</span>
				</div>
				<h1 className="hero-title text-balance">
					Coding agent
					<br />
					<span className="hero-title-accent">for your terminal</span>
				</h1>
				<p className="hero-subtitle text-balance">
					Read files, run commands, edit code, and write new files — all from
					one CLI. Built for developers who live in the shell.
				</p>
				<div className="hero-actions">
					<a href="#install" className="btn btn-primary">
						Install Squido
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
				<dl className="hero-stats">
					<div className="hero-stat">
						<dt>Tools</dt>
						<dd>5</dd>
					</div>
					<div className="hero-stat">
						<dt>Providers</dt>
						<dd>Multi</dd>
					</div>
					<div className="hero-stat">
						<dt>Runtime</dt>
						<dd>Node 22+</dd>
					</div>
				</dl>
				<TerminalDemo />
			</div>
		</section>
	);
}
