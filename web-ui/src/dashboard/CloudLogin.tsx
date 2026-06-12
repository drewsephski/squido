import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "./AuthContext.tsx";
import { Logo } from "../components/Logo.tsx";
import "../components/components.css";
import "./dashboard.css";

export function CloudLogin() {
	const { user, isLoading, login } = useAuth();
	const [showModal, setShowModal] = useState(false);

	if (isLoading) {
		return <div className="auth-loading">Loading...</div>;
	}

	if (user) {
		return <Navigate to="/dashboard" replace />;
	}

	return (
		<div className="login-page">
			<div className="login-card">
				<div className="login-header">
					<Logo size={48} />
					<h1 className="login-title">Squido Cloud</h1>
					<p className="login-subtitle">Sign in to manage your agents and sessions</p>
				</div>

				<button className="btn btn-primary login-github-btn" onClick={login} type="button">
					<GitHubIcon />
					Sign in with GitHub
				</button>

				<button
					className="login-why-link"
					onClick={() => setShowModal(true)}
					type="button"
				>
					Why sign in?
				</button>
			</div>

			<p className="login-scopes">
				We only request read-only access to your public GitHub profile and email address.
			</p>

			{showModal && (
				// biome-ignore lint/a11y/useKeyWithClickEvents: overlay close on backdrop click
				<div className="login-modal-overlay" onClick={() => setShowModal(false)}>
					{// biome-ignore lint/a11y/useKeyWithClickEvents: modal click stops propagation
					}
					<div className="login-modal" onClick={(e) => e.stopPropagation()}>
						<h2>Why sign in?</h2>
						<ul>
							<li>View and manage your Squido agent sessions</li>
							<li>Monitor usage and run history</li>
							<li>Manage your billing and subscription</li>
							<li>Share sessions with collaborators</li>
						</ul>
						<button
							className="btn btn-secondary"
							onClick={() => setShowModal(false)}
							type="button"
						>
							Got it
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

function GitHubIcon() {
	return (
		<svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
			<path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
		</svg>
	);
}
