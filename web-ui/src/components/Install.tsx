import { useState } from "react";
import { useReveal } from "../hooks/useReveal.ts";

const INSTALL_CMD = "npm install -g @drewsepsi/squido-cli";

export function Install() {
	const ref = useReveal<HTMLDivElement>();
	const [copied, setCopied] = useState(false);

	async function handleCopy() {
		await navigator.clipboard.writeText(INSTALL_CMD);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
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
							<span className="install-code-label">Terminal</span>
							<button
								type="button"
								className="install-copy-btn"
								onClick={handleCopy}
								aria-live="polite"
							>
								{copied ? "Copied" : "Copy"}
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
	);
}
