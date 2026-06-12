import { Link, useLocation } from "react-router-dom";
import { Logo } from "../Logo.tsx";
import { navigation, slugify } from "../../content/index.ts";

type Props = {
	isOpen: boolean;
	onClose: () => void;
};

export function DocsSidebar({ isOpen, onClose }: Props) {
	const location = useLocation();
	const currentSlug = location.pathname
		.replace("/docs/", "")
		.replace("/docs", "");

	return (
		<>
			{isOpen && (
				<div className="docs-sidebar-overlay" onClick={onClose} aria-hidden="true" />
			)}
			<aside className={`docs-sidebar ${isOpen ? "docs-sidebar--open" : ""}`}>
				<div className="docs-sidebar-header">
					<Link to="/" className="docs-sidebar-brand" onClick={onClose}>
						<Logo size={22} />
						<span>Squido</span>
					</Link>
					<span className="docs-sidebar-label">Docs</span>
				</div>
				<nav className="docs-sidebar-nav" aria-label="Documentation">
					{navigation.map((section) => (
						<div key={section.title} className="docs-sidebar-section">
							<h3 className="docs-sidebar-section-title">{section.title}</h3>
							<ul className="docs-sidebar-list">
								{section.items.map((item) => {
									const path = slugify(item.path);
									const isActive =
										currentSlug === path ||
										(currentSlug === "" && path === "index" && item.path === "index");
									return (
										<li key={path}>
											<Link
												to={`/docs/${path === "index" ? "" : path}`}
												className={`docs-sidebar-link ${isActive ? "docs-sidebar-link--active" : ""}`}
												onClick={onClose}
											>
												{isActive && <ActiveIndicator />}
												{item.title}
											</Link>
										</li>
									);
								})}
							</ul>
						</div>
					))}
				</nav>
				<div className="docs-sidebar-footer">
					<Link to="/" className="docs-sidebar-footer-link">
						&larr; Back to home
					</Link>
				</div>
			</aside>
		</>
	);
}

function ActiveIndicator() {
	return (
		<span className="docs-sidebar-indicator" aria-hidden="true">
			<svg width="4" height="4" viewBox="0 0 4 4" fill="none">
				<circle cx="2" cy="2" r="2" fill="currentColor" />
			</svg>
		</span>
	);
}
