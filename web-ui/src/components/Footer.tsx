import { Logo } from "./Logo.tsx";

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
					<nav className="footer-links" aria-label="Footer">
						<a href="#features">Tools</a>
						<a href="#install">Install</a>
						<a
							href="https://github.com/drewsephski/squido"
							target="_blank"
							rel="noopener noreferrer"
						>
							GitHub
						</a>
					</nav>
				</div>
				<div className="footer-bottom">
					<p className="footer-copy">
						&copy; {new Date().getFullYear()} Drew Sepeczi
					</p>
				</div>
			</div>
		</footer>
	);
}
