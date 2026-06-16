import { Link, useLocation } from "react-router-dom";
import { Logo } from "./Logo.tsx";

export function Header() {
	const location = useLocation();
	const isDocs = location.pathname.startsWith("/docs");

	return (
		<header className="header">
			<div className="container header-inner">
				<Link to="/" className="header-brand">
					<Logo size={26} />
					<span className="header-name">Squido</span>
				</Link>
				<nav className="header-nav" aria-label="Main">
					{isDocs ? (
						<>
							<Link to="/" className="header-back-link">
								&larr; Back to home
							</Link>
							<a
								href="https://github.com/drewsephski/squido"
								target="_blank"
								rel="noopener noreferrer"
							>
								GitHub
							</a>
						</>
					) : (
						<>
							<a href="#features">Tools</a>
							<a href="#install">Install</a>
							<Link to="/docs">Docs</Link>
							<Link to="/agent">Agent</Link>
							<a
								href="https://github.com/drewsephski/squido"
								target="_blank"
								rel="noopener noreferrer"
							>
								GitHub
							</a>
							<a href="#install" className="header-cta">
								Get started
							</a>
						</>
					)}
				</nav>
			</div>
		</header>
	);
}
