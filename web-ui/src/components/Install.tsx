import { useState, useEffect } from "react"
import { useReveal } from "../hooks/useReveal.ts"

const INSTALL_CMD = "npm install -g @drewsepsi/squido-cli"

function detectOS(): string {
	if (typeof navigator === "undefined") return "linux"
	const p = navigator.platform.toLowerCase()
	if (p.includes("mac")) return "macos"
	if (p.includes("win")) return "windows"
	return "linux"
}

const OS_LABEL: Record<string, string> = {
	macos: "macOS",
	windows: "Windows",
	linux: "Linux",
}

export function Install() {
	const ref = useReveal<HTMLDivElement>()
	const [copied, setCopied] = useState(false)
	const [os] = useState(detectOS)

	useEffect(() => {
		if (!copied) return
		const t = setTimeout(() => setCopied(false), 2000)
		return () => clearTimeout(t)
	}, [copied])

	async function handleCopy() {
		await navigator.clipboard.writeText(INSTALL_CMD)
		setCopied(true)
	}

	return (
		<section id="install" className="section install">
			<div className="container">
				<div ref={ref} className="install-card reveal">
					<span className="section-eyebrow">Get started</span>
					<h2 className="section-title section-title-left text-balance">
						Install in one command
					</h2>
					<p className="section-desc section-desc-left install-desc text-balance">
						Requires Node.js 22 or later. Install globally, then run{" "}
						<code>squido</code> from any project directory.
					</p>
					<div className="install-code-block">
						<div className="install-code-header">
							<span className="install-code-label">
								Terminal
								<span className="install-os-badge">{OS_LABEL[os] ?? "Linux"}</span>
							</span>
							<button
								type="button"
								className={`install-copy-btn${copied ? " copied" : ""}`}
								onClick={handleCopy}
								aria-live="polite"
							>
								<span className="install-copy-icon" aria-hidden="true">
									<svg
										className="install-copy-svg"
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
										<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
									</svg>
									<svg
										className="install-check-svg"
										width="14"
										height="14"
										viewBox="0 0 24 24"
										fill="none"
										stroke="currentColor"
										strokeWidth="2.5"
										strokeLinecap="round"
										strokeLinejoin="round"
									>
										<polyline points="20 6 9 17 4 12" />
									</svg>
								</span>
								<span className="install-copy-text">{copied ? "Copied" : "Copy"}</span>
							</button>
						</div>
						<pre className="install-code">
							<code>{INSTALL_CMD}</code>
						</pre>
					</div>
					<div className="install-packages">
						<h3 className="install-packages-title">Package stack</h3>
						<ul className="install-packages-list">
							<li>
								<code>@drewsepsi/squido-cli</code>
								<span>Interactive coding agent CLI</span>
							</li>
							<li>
								<code>@drewsepsi/squido-agent-core</code>
								<span>Agent runtime with tool calling</span>
							</li>
							<li>
								<code>@drewsepsi/squido-ai</code>
								<span>Multi-provider LLM API</span>
							</li>
							<li>
								<code>@drewsepsi/squido-tui</code>
								<span>Terminal UI library</span>
							</li>
						</ul>
					</div>
				</div>
			</div>
		</section>
	)
}
