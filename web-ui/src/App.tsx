import { Routes, Route } from "react-router-dom";
import { Header } from "./components/Header.tsx";
import { Hero } from "./components/Hero.tsx";
import { Features } from "./components/Features.tsx";
import { Install } from "./components/Install.tsx";
import { Footer } from "./components/Footer.tsx";
import { DocsLayout } from "./components/docs/DocsLayout.tsx";
import {
	AuthProvider,
	AuthGuard,
	DashboardLayout,
	SessionList,
	SessionDetail,
	CloudLogin,
	OAuthCallback,
	ShareView,
} from "./dashboard/index.ts";
import "./components/components.css";

function Landing() {
	return (
		<>
			<Header />
			<main>
				<Hero />
				<Features />
				<Install />
			</main>
			<Footer />
		</>
	);
}

export function App() {
	return (
		<AuthProvider>
			<Routes>
				<Route path="/" element={<Landing />} />
				<Route path="/docs/*" element={<DocsLayout />} />

				{/* Public: shared session view (no auth) */}
				<Route path="/share/:token" element={<ShareView />} />

				{/* Dashboard: login and OAuth callback (no auth guard) */}
				<Route path="/dashboard/login" element={<CloudLogin />} />
				<Route path="/dashboard/auth/callback" element={<OAuthCallback />} />

				{/* Dashboard: protected routes */}
				<Route
					path="/dashboard"
					element={
						<AuthGuard>
							<DashboardLayout />
						</AuthGuard>
					}
				>
					<Route index element={<SessionList />} />
					<Route path="session/:id" element={<SessionDetail />} />
					<Route path="settings" element={<div>Settings (coming soon)</div>} />
					<Route path="billing" element={<div>Billing (coming soon)</div>} />
				</Route>
			</Routes>
		</AuthProvider>
	);
}
