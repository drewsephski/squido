import { Logo } from "./Logo.tsx"

export function Footer() {
	return (
		<footer className="footer">
			<div className="container footer-inner">
				<div className="footer-top">
					<div className="footer-brand">
						<Logo size={22} />
						<div className="footer-brand-text">
							<span className="footer-name">Squido</span>
							<p className="footer-tagline">
								Coding agent for the terminal
							</p>
						</div>
					</div>
					<div className="footer-nav-group">
						<div className="footer-nav-col">
					<span className="footer-nav-label">Product</span>
						<a href="#features">Tools</a>
						<a href="#workflows">Workflows</a>
						<a href="#install">Install</a>
						<a href="/docs">Docs</a>
						<a href="/agent">Agent</a>
						</div>
						<div className="footer-nav-col">
							<span className="footer-nav-label">Connect</span>
							<a
								href="https://github.com/drewsephski/squido"
								target="_blank"
								rel="noopener noreferrer"
							>
								GitHub
							</a>
							<a
								href="https://github.com/drewsephski/squido/issues"
								target="_blank"
								rel="noopener noreferrer"
							>
								Issues
							</a>
						</div>
					</div>
				</div>
				<div className="footer-bottom">
					<p className="footer-copy">
						&copy; {new Date().getFullYear()} Drew Sepeczi
					</p>
					<div className="footer-legal">
						<a
							href="https://github.com/drewsephski/squido/blob/main/LICENSE"
							target="_blank"
							rel="noopener noreferrer"
						>
							MIT License
						</a>
					</div>
				</div>
			</div>
		</footer>
	)
}
