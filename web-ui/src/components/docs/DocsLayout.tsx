import { useEffect, useState } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Header } from "../Header.tsx";
import { Footer } from "../Footer.tsx";
import { DocsSidebar } from "./DocsSidebar.tsx";
import { DocsHome } from "./DocsHome.tsx";
import { MarkdownPage } from "./MarkdownPage.tsx";
import { getAllSlugs, getDocContent } from "../../content/index.ts";
import "./docs.css";

function DocPage({ slug }: { slug: string }) {
	const content = getDocContent(slug);
	if (!content) {
		return (
			<main className="docs-page">
				<div className="docs-empty">
					<h2>Page not found</h2>
					<p>The documentation page you're looking for doesn't exist.</p>
				</div>
			</main>
		);
	}
	return (
		<main className="docs-page">
			<MarkdownPage content={content} />
		</main>
	);
}

export function DocsLayout() {
	const [sidebarOpen, setSidebarOpen] = useState(false);
	const location = useLocation();

	useEffect(() => {
		setSidebarOpen(false);
		window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
	}, [location.pathname]);

	const slugs = getAllSlugs();

	return (
		<div className="docs-layout">
			<Header />
			<div className="docs-body">
				<DocsSidebar
					isOpen={sidebarOpen}
					onClose={() => setSidebarOpen(false)}
				/>
				<div className="docs-content">
					<button
						type="button"
						className="docs-menu-toggle"
						onClick={() => setSidebarOpen(!sidebarOpen)}
						aria-label="Toggle navigation"
					>
						<MenuIcon />
						<span>Docs</span>
					</button>
					<Routes>
						<Route index element={<DocsHome />} />
						{slugs.map((slug) => (
							<Route
								key={slug}
								path={slug}
								element={<DocPage slug={slug} />}
							/>
						))}
						<Route path="*" element={<DocPage slug="index" />} />
					</Routes>
				</div>
			</div>
			<Footer />
		</div>
	);
}

function MenuIcon() {
	return (
		<svg width="18" height="18" viewBox="0 0 18 18" fill="none">
			<line x1="2" y1="4" x2="16" y2="4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			<line x1="2" y1="9" x2="16" y2="9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
			<line x1="2" y1="14" x2="16" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
		</svg>
	);
}
