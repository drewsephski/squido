import { Link } from "react-router-dom";
import { navigation, slugify } from "../../content/index.ts";
import { useReveal } from "../../hooks/useReveal.ts";

function SectionIcon({ index }: { index: number }) {
	const icons = [
		// Start here
		<svg key="0" width="20" height="20" viewBox="0 0 20 20" fill="none">
			<circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
			<path d="M7 10l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
		</svg>,
		// Customization
		<svg key="1" width="20" height="20" viewBox="0 0 20 20" fill="none">
			<circle cx="10" cy="10" r="3" stroke="currentColor" strokeWidth="1.5" />
			<circle cx="10" cy="10" r="7" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 3" />
		</svg>,
		// Reference
		<svg key="2" width="20" height="20" viewBox="0 0 20 20" fill="none">
			<path d="M4 4h12v12H4z" stroke="currentColor" strokeWidth="1.5" />
			<path d="M7 8h6M7 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>,
		// Programmatic
		<svg key="3" width="20" height="20" viewBox="0 0 20 20" fill="none">
			<path d="M6 7l-3 3 3 3M14 7l3 3-3 3M11 5L9 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>,
		// Platform
		<svg key="4" width="20" height="20" viewBox="0 0 20 20" fill="none">
			<rect x="3" y="5" width="14" height="10" rx="1" stroke="currentColor" strokeWidth="1.5" />
			<path d="M7 15v1h6v-1M10 5V3" stroke="currentColor" strokeWidth="1.5" />
		</svg>,
		// Development
		<svg key="5" width="20" height="20" viewBox="0 0 20 20" fill="none">
			<path d="M10 3v14M3 10h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			<path d="M5 5l10 10M15 5L5 15" stroke="currentColor" strokeWidth="1" strokeDasharray="1 2" opacity="0.3" />
		</svg>,
	];

	return <>{icons[index] ?? null}</>;
}

export function DocsHome() {
	const revealRef = useReveal<HTMLDivElement>();

	return (
		<main className="docs-home">
			<div className="docs-home-hero">
				<span className="section-eyebrow">Documentation</span>
				<h1 className="docs-home-title">
					Welcome to <span className="hero-title-accent">Squido</span>
				</h1>
				<p className="docs-home-subtitle">
					Coding agent for your terminal. Read files, run commands, edit code,
					and write new files — all from one CLI.
				</p>
				<div className="docs-home-actions">
					<Link to="/docs/quickstart" className="btn btn-primary">
						Get started
					</Link>
					<Link to="/docs/usage" className="btn btn-secondary">
						View usage guide
					</Link>
				</div>
			</div>

			<div className="docs-home-stats">
				<div className="docs-home-stat">
					<dt>Core tools</dt>
					<dd>8</dd>
				</div>
				<div className="docs-home-stat">
					<dt>AI providers</dt>
					<dd>35+</dd>
				</div>
				<div className="docs-home-stat">
					<dt>Run modes</dt>
					<dd>3</dd>
				</div>
				<div className="docs-home-stat">
					<dt>Runtime</dt>
					<dd>Node 22+</dd>
				</div>
			</div>

			<div className="docs-home-sections reveal" ref={revealRef}>
				{navigation.map((section, i) => (
					<div key={section.title} className="docs-section-card">
						<div className="docs-section-card-header">
							<span className="docs-section-card-icon">
								<SectionIcon index={i} />
							</span>
							<h2 className="docs-section-card-title">{section.title}</h2>
						</div>
						<ul className="docs-section-card-list">
							{section.items.map((item) => {
								const path = slugify(item.path);
								return (
									<li key={path}>
										<Link
											to={`/docs/${path === "index" ? "" : path}`}
											className="docs-section-card-link"
										>
											{item.title}
										</Link>
									</li>
								);
							})}
						</ul>
					</div>
				))}
			</div>
		</main>
	);
}
