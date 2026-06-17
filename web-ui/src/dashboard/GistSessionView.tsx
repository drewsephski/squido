import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";

interface GistFile {
	filename: string;
	type: string;
	language: string | null;
	raw_url: string;
	size: number;
}

interface GistResponse {
	id: string;
	files: Record<string, GistFile>;
	description: string | null;
	created_at: string;
	owner: {
		login: string;
	} | null;
}

const pageStyle: React.CSSProperties = {
	minHeight: "100vh",
	background: "var(--bg)",
	display: "flex",
	flexDirection: "column",
};

const brandingBarStyle: React.CSSProperties = {
	textAlign: "center",
	padding: "0.75rem 1rem",
	fontSize: "0.8125rem",
	color: "var(--ink-dim)",
	background: "var(--surface)",
	borderBottom: "1px solid var(--border)",
	display: "flex",
	justifyContent: "center",
	alignItems: "center",
	gap: "0.5rem",
};

const brandingLinkStyle: React.CSSProperties = {
	color: "var(--primary)",
	fontWeight: 600,
	textDecoration: "none",
};

const iframeContainerStyle: React.CSSProperties = {
	flex: 1,
	position: "relative",
};

const iframeStyle: React.CSSProperties = {
	position: "absolute",
	inset: 0,
	width: "100%",
	height: "100%",
	border: "none",
};

export function GistSessionView() {
	const { gistId } = useParams<{ gistId: string }>();
	const [rawUrl, setRawUrl] = useState<string | null>(null);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!gistId) {
			setError("No session ID provided");
			setIsLoading(false);
			return;
		}

		let cancelled = false;

		async function fetchGist() {
			try {
				const res = await fetch(`https://api.github.com/gists/${encodeURIComponent(gistId as string)}`);
				if (!res.ok) {
					if (res.status === 404) {
						throw new Error("Shared session not found");
					}
					throw new Error(`GitHub API error: ${res.status}`);
				}
				const data: GistResponse = await res.json();
				if (cancelled) return;

				const files = Object.values(data.files);
				if (files.length === 0) {
					throw new Error("Gist has no files");
				}

				// Use the first HTML file, or the first file if none are HTML
				const htmlFile = files.find((f) => f.filename.endsWith(".html")) ?? files[0];
				setRawUrl(htmlFile.raw_url);
				setIsLoading(false);
			} catch (err) {
				if (!cancelled) {
					setError(err instanceof Error ? err.message : "Failed to load shared session");
					setIsLoading(false);
				}
			}
		}

		fetchGist();
		return () => {
			cancelled = true;
		};
	}, [gistId]);

	return (
		<div style={pageStyle}>
			<div style={brandingBarStyle}>
				<span>
					Shared via <a href="https://squidagent.app" style={brandingLinkStyle}>Squido</a>
				</span>
			</div>

			{isLoading && (
				<div className="dashboard-status" style={{ textAlign: "center", paddingTop: "4rem" }}>
					Loading shared session...
				</div>
			)}

			{error && (
				<div className="dashboard-status" style={{ textAlign: "center", paddingTop: "4rem" }}>
					<p style={{ fontSize: "1.0625rem", marginBottom: "0.5rem" }}>
						{error}
					</p>
					<p style={{ fontSize: "0.875rem", color: "var(--ink-muted)" }}>
						The gist may have been deleted or the link is invalid.
					</p>
				</div>
			)}

			{rawUrl && (
				<div style={iframeContainerStyle}>
					<iframe
						src={rawUrl}
						style={iframeStyle}
						title="Shared session"
						sandbox="allow-scripts"
					/>
				</div>
			)}
		</div>
	);
}
