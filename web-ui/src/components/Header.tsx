import { useEffect, useState, useCallback } from "react"
import { Link, useLocation } from "react-router-dom"
import { Logo } from "./Logo.tsx"

function useScrollState(threshold = 20) {
	const [scrolled, setScrolled] = useState(false)

	useEffect(() => {
		function onScroll() {
			setScrolled(window.scrollY > threshold)
		}
		onScroll()
		window.addEventListener("scroll", onScroll, { passive: true })
		return () => window.removeEventListener("scroll", onScroll)
	}, [threshold])

	return scrolled
}

function useActiveSection(sectionIds: string[]) {
	const [active, setActive] = useState("")

	useEffect(() => {
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						setActive(entry.target.id)
					}
				}
			},
			{ rootMargin: "-40% 0px -55% 0px" },
		)

		for (const id of sectionIds) {
			const el = document.getElementById(id)
			if (el) observer.observe(el)
		}

		return () => observer.disconnect()
	}, [sectionIds])

	return active
}

export function Header() {
	const location = useLocation()
	const isDocs = location.pathname.startsWith("/docs")
	const scrolled = useScrollState()
	const activeSection = useActiveSection(["features", "workflows", "install"])
	const [mobileOpen, setMobileOpen] = useState(false)

	const closeMobile = useCallback(() => setMobileOpen(false), [])

	// Close mobile menu on route change
	useEffect(() => {
		setMobileOpen(false)
	}, [location])

	// Close on Escape
	useEffect(() => {
		if (!mobileOpen) return
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") setMobileOpen(false)
		}
		window.addEventListener("keydown", onKey)
		return () => window.removeEventListener("keydown", onKey)
	}, [mobileOpen])

	type NavLink =
		| { href: string; label: string; kind: "section"; section: string }
		| { href: string; label: string; kind: "router" }
		| { href: string; label: string; kind: "external" }
		| { href: string; label: string; kind: "cta" }

	const navLinks: NavLink[] = isDocs
		? [
				{ href: "/", label: "Back to home", kind: "router" },
				{
					href: "https://github.com/drewsephski/squido",
					label: "GitHub",
					kind: "external",
				},
			]
		: [
				{ href: "#features", label: "Tools", kind: "section", section: "features" },
				{ href: "#workflows", label: "Workflows", kind: "section", section: "workflows" },
				{ href: "#install", label: "Install", kind: "section", section: "install" },
				{ href: "/docs", label: "Docs", kind: "router" },
				{ href: "/agent", label: "Agent", kind: "router" },
				{
					href: "https://github.com/drewsephski/squido",
					label: "GitHub",
					kind: "external",
				},
				{ href: "#install", label: "Get started", kind: "cta" },
			]

	return (
		<header className={`header${scrolled ? " header-scrolled" : ""}`}>
			<div className="container header-inner">
				<Link to="/" className="header-brand" onClick={closeMobile}>
					<Logo size={26} />
					<span className="header-name">Squido</span>
				</Link>
				<button
					type="button"
					className="header-mobile-toggle"
					onClick={() => setMobileOpen((o) => !o)}
					aria-label={mobileOpen ? "Close menu" : "Open menu"}
					aria-expanded={mobileOpen}
				>
					{mobileOpen ? "\u2715" : "\u2630"}
				</button>
				<nav
					className={`header-nav${mobileOpen ? " open" : ""}`}
					aria-label="Main"
				>
					{navLinks.map((link) => {
						if (link.kind === "cta") {
							return (
								<a
									key={link.label}
									href={link.href}
									className="header-cta"
									onClick={closeMobile}
								>
									{link.label}
								</a>
							)
						}
						if (link.kind === "router") {
							return (
								<Link
									key={link.label}
									to={link.href}
									onClick={closeMobile}
								>
									{link.label}
								</Link>
							)
						}
						if (link.kind === "external") {
							return (
								<a
									key={link.label}
									href={link.href}
									target="_blank"
									rel="noopener noreferrer"
									onClick={closeMobile}
								>
									{link.label}
								</a>
							)
						}
						return (
							<a
								key={link.label}
								href={link.href}
								className={
									link.section && activeSection === link.section
										? "active"
										: undefined
								}
								onClick={closeMobile}
							>
								{link.label}
							</a>
						)
					})}
				</nav>
			</div>
		</header>
	)
}
