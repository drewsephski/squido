import { useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext.tsx";
import "../components/components.css";

export function DashboardLayout() {
	const { user, logout } = useAuth();
	const [sidebarOpen, setSidebarOpen] = useState(false);

	const navItems = [
		{ to: "/agent", label: "Agent", end: true },
		{ to: "/dashboard", label: "Sessions", end: true },
		{ to: "/dashboard/settings", label: "Settings" },
		{ to: "/dashboard/billing", label: "Billing" },
	];

	return (
		<div style={layoutStyle}>
			{sidebarOpen && (
				<div
					style={overlayStyle}
					onClick={() => setSidebarOpen(false)}
				/>
			)}

			<nav
				className={`dashboard-sidebar${sidebarOpen ? " open" : ""}`}
				style={sidebarStyle}
			>
				<div style={sidebarHeaderStyle}>
					<span style={sidebarBrandStyle}>Squido Cloud</span>
				</div>
				<ul style={navListStyle}>
					{navItems.map((item) => (
						<li key={item.to}>
							<NavLink
								to={item.to}
								end={item.end}
								onClick={() => setSidebarOpen(false)}
								style={({ isActive }) => ({
									...navLinkBaseStyle,
									...(isActive ? navLinkActiveStyle : {}),
								})}
							>
								{item.label}
							</NavLink>
						</li>
					))}
				</ul>
			</nav>

			<div className="dashboard-main" style={mainAreaStyle}>
				<header style={headerStyle}>
					<button
						className="dashboard-hamburger"
						style={hamburgerStyle}
						onClick={() => setSidebarOpen(!sidebarOpen)}
						aria-label="Toggle sidebar"
					>
						{sidebarOpen ? "✕" : "☰"}
					</button>
					<div style={headerRightStyle}>
						{user && (
							<>
								{user.avatarUrl && (
									<img
										src={user.avatarUrl}
										alt=""
										style={avatarStyle}
									/>
								)}
								<span style={userNameStyle}>{user.login}</span>
								<button
									className="btn btn-secondary"
									style={logoutBtnStyle}
									onClick={logout}
								>
									Logout
								</button>
							</>
						)}
					</div>
				</header>

				<main style={contentStyle}>
					<Outlet />
				</main>
			</div>
		</div>
	);
}

const layoutStyle: React.CSSProperties = {
	display: "flex",
	minHeight: "100vh",
	background: "var(--bg)",
};

const overlayStyle: React.CSSProperties = {
	position: "fixed",
	inset: 0,
	background: "rgba(0,0,0,0.5)",
	zIndex: 90,
};

const sidebarStyle: React.CSSProperties = {
	width: 240,
	flexShrink: 0,
	background: "var(--surface)",
	borderRight: "1px solid var(--border)",
	display: "flex",
	flexDirection: "column",
	position: "fixed",
	top: 0,
	bottom: 0,
	left: 0,
	zIndex: 100,
	transition: "transform 0.2s ease",
};

const sidebarHeaderStyle: React.CSSProperties = {
	padding: "1rem 1.25rem",
	borderBottom: "1px solid var(--border)",
};

const sidebarBrandStyle: React.CSSProperties = {
	fontFamily: "var(--font-display)",
	fontWeight: 600,
	fontSize: "1rem",
	color: "var(--ink)",
};

const navListStyle: React.CSSProperties = {
	listStyle: "none",
	padding: "0.5rem 0",
	margin: 0,
};

const navLinkBaseStyle: React.CSSProperties = {
	display: "block",
	padding: "0.625rem 1.25rem",
	fontSize: "0.875rem",
	fontWeight: 500,
	color: "var(--ink-muted)",
	textDecoration: "none",
	transition: "color 0.15s, background 0.15s",
};

const navLinkActiveStyle: React.CSSProperties = {
	color: "var(--primary-bright)",
	background: "rgba(242, 154, 58, 0.08)",
};

const mainAreaStyle: React.CSSProperties = {
	flex: 1,
	marginLeft: 240,
	display: "flex",
	flexDirection: "column",
	minHeight: "100vh",
};

const headerStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	height: 60,
	padding: "0 1.5rem",
	background: "var(--surface)",
	borderBottom: "1px solid var(--border)",
	position: "sticky",
	top: 0,
	zIndex: 50,
};

const hamburgerStyle: React.CSSProperties = {
	display: "none",
	background: "none",
	border: "none",
	color: "var(--ink)",
	fontSize: "1.25rem",
	cursor: "pointer",
	padding: "0.25rem",
};

const headerRightStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "0.75rem",
	marginLeft: "auto",
};

const avatarStyle: React.CSSProperties = {
	width: 28,
	height: 28,
	borderRadius: "50%",
	objectFit: "cover",
};

const userNameStyle: React.CSSProperties = {
	fontSize: "0.875rem",
	fontWeight: 500,
	color: "var(--ink)",
};

const logoutBtnStyle: React.CSSProperties = {
	fontSize: "0.75rem",
	padding: "0.3rem 0.75rem",
};

const contentStyle: React.CSSProperties = {
	flex: 1,
	padding: "1.5rem",
	overflow: "auto",
};
