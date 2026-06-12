import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { exchangeGitHubCode, setToken } from "./api.ts";

export function OAuthCallback() {
	const [searchParams] = useSearchParams();
	const navigate = useNavigate();
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		const code = searchParams.get("code");
		if (!code) {
			setError("No authorization code received from GitHub.");
			return;
		}

		let cancelled = false;

		exchangeGitHubCode(code)
			.then((result) => {
				if (cancelled) return;
				setToken(result.token);
				navigate("/dashboard", { replace: true });
			})
			.catch((err: Error) => {
				if (cancelled) return;
				setError(err.message ?? "Failed to complete GitHub login.");
			});

		return () => {
			cancelled = true;
		};
	}, [searchParams, navigate]);

	if (error) {
		return (
			<div style={containerStyle}>
				<div style={cardStyle}>
					<h1 style={headingStyle}>Authentication Failed</h1>
					<p style={errorStyle}>{error}</p>
					<button
						style={buttonStyle}
						onClick={() => navigate("/dashboard/login")}
					>
						Try Again
					</button>
				</div>
			</div>
		);
	}

	return (
		<div style={containerStyle}>
			<div style={cardStyle}>
				<h1 style={headingStyle}>Signing you in...</h1>
				<p style={mutedStyle}>Completing authentication with GitHub.</p>
				<div style={spinnerStyle} />
			</div>
		</div>
	);
}

const containerStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	minHeight: "100vh",
	background: "var(--bg)",
	padding: "2rem",
};

const cardStyle: React.CSSProperties = {
	maxWidth: 420,
	width: "100%",
	textAlign: "center",
};

const headingStyle: React.CSSProperties = {
	fontSize: "1.5rem",
	fontWeight: 600,
	color: "var(--ink)",
	marginBottom: "0.75rem",
};

const mutedStyle: React.CSSProperties = {
	color: "var(--ink-muted)",
	fontSize: "0.9rem",
};

const errorStyle: React.CSSProperties = {
	color: "var(--error)",
	fontSize: "0.9rem",
	marginBottom: "1.5rem",
};

const buttonStyle: React.CSSProperties = {
	padding: "0.625rem 1.5rem",
	fontSize: "0.875rem",
	fontWeight: 500,
	background: "var(--primary-bright)",
	color: "#fff",
	border: "none",
	borderRadius: 6,
	cursor: "pointer",
};

const spinnerStyle: React.CSSProperties = {
	width: 24,
	height: 24,
	border: "3px solid var(--border)",
	borderTopColor: "var(--primary-bright)",
	borderRadius: "50%",
	animation: "spin 0.8s linear infinite",
	margin: "1.5rem auto 0",
};
