import { useState, useEffect, useCallback } from "react";
import { useParams } from "react-router-dom";
import {
	getSharedSession,
	type SessionData,
	type SessionEntry,
} from "./api.ts";

function formatRelativeTime(dateStr: string): string {
	const now = Date.now();
	const date = new Date(dateStr).getTime();
	const diffMs = now - date;
	const diffSec = Math.floor(diffMs / 1000);

	if (diffSec < 60) return "just now";
	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? "" : "s"} ago`;
	const diffHour = Math.floor(diffMin / 60);
	if (diffHour < 24) return `${diffHour} hour${diffHour === 1 ? "" : "s"} ago`;
	const diffDay = Math.floor(diffHour / 24);
	if (diffDay < 30) return `${diffDay} day${diffDay === 1 ? "" : "s"} ago`;
	const diffMonth = Math.floor(diffDay / 30);
	return `${diffMonth} month${diffMonth === 1 ? "" : "s"} ago`;
}

export function ShareView() {
	const { token } = useParams<{ token: string }>();
	const [session, setSession] = useState<SessionData | null>(null);
	const [entries, setEntries] = useState<SessionEntry[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [notFound, setNotFound] = useState(false);
	const [expandedTools, setExpandedTools] = useState<Set<string>>(
		new Set(),
	);

	const fetchShared = useCallback(async () => {
		if (!token) return;
		setIsLoading(true);
		setError(null);
		setNotFound(false);
		try {
			const data = await getSharedSession(token);
			setSession(data.session);
			setEntries(data.entries);
		} catch (err) {
			const msg = err instanceof Error ? err.message : "";
			if (msg === "Share link not found") {
				setNotFound(true);
			} else if (msg === "Share link has expired") {
				setNotFound(true);
			} else {
				setError(msg || "Failed to load shared session");
			}
		} finally {
			setIsLoading(false);
		}
	}, [token]);

	useEffect(() => {
		fetchShared();
	}, [fetchShared]);

	function toggleToolExpanded(entryId: string) {
		setExpandedTools((prev) => {
			const next = new Set(prev);
			if (next.has(entryId)) {
				next.delete(entryId);
			} else {
				next.add(entryId);
			}
			return next;
		});
	}

	if (isLoading) {
		return (
			<div style={pageStyle}>
				<div className="dashboard-status" style={{ textAlign: "center" }}>
					Loading shared session...
				</div>
			</div>
		);
	}

	if (notFound) {
		return (
			<div style={pageStyle}>
				<div className="dashboard-status" style={{ textAlign: "center" }}>
					<p style={{ fontSize: "1.0625rem", marginBottom: "0.5rem" }}>
						Shared session not found or has expired.
					</p>
				</div>
			</div>
		);
	}

	if (error) {
		return (
			<div style={pageStyle}>
				<div className="dashboard-status" style={{ color: "var(--primary)", textAlign: "center" }}>
					Error: {error}
				</div>
			</div>
		);
	}

	if (!session) {
		return null;
	}

	return (
		<div style={pageStyle}>
			<div style={brandingBarStyle}>
				Shared via <strong>Squido Cloud</strong>
			</div>

			<div style={contentInnerStyle}>
				<div className="dashboard-header-section">
					<h1 className="dashboard-title">{session.name}</h1>
					<div className="dashboard-meta-row">
						{session.model_used && (
							<span className="dashboard-meta-badge">
								Model: {session.model_used}
							</span>
						)}
						<span className="dashboard-meta-badge">
							Created {formatRelativeTime(session.created_at)}
						</span>
						<span className="dashboard-meta-badge">
							{session.message_count} messages
						</span>
					</div>
				</div>

				<div className="dashboard-timeline">
					{entries.length === 0 && (
						<div className="dashboard-timeline-empty">No entries in this session.</div>
					)}

					{entries.map((entry) => {
						if (
							entry.entry_type === "model_change" ||
							entry.entry_type === "thinking_change"
						) {
							return (
								<div key={entry.id} className="dashboard-compact-badge">
									<span className="dashboard-compact-badge-text">
										{entry.entry_type === "model_change"
											? "Model changed"
											: "Thinking level changed"}
										{entry.content
											? `: ${entry.content}`
											: ""}
									</span>
								</div>
							);
						}

						if (entry.role === "tool") {
							const isExpanded = expandedTools.has(entry.id);
							return (
								<div key={entry.id} className="dashboard-tool-call">
									<button
										className="dashboard-tool-call-header"
										onClick={() =>
											toggleToolExpanded(entry.id)
										}
									>
										<span>
											{isExpanded ? "▼" : "▶"} Tool call
										</span>
										{entry.model_used && (
											<span className="dashboard-tool-call-model">
												{entry.model_used}
											</span>
										)}
									</button>
									{isExpanded && (
										<pre className="dashboard-tool-call-body">
											{entry.content}
										</pre>
									)}
								</div>
							);
						}

						const isUser = entry.role === "user";
						return (
							<div
								key={entry.id}
								className="dashboard-message-row"
								style={{
									flexDirection: isUser
										? "row-reverse"
										: "row",
								}}
							>
								<div
									className="dashboard-message-bubble"
									style={{
										background: isUser
											? "var(--primary)"
											: "var(--surface)",
										color: isUser
											? "var(--bg)"
											: "var(--ink)",
										borderBottomRightRadius: isUser
											? 4
											: undefined,
										borderBottomLeftRadius: isUser
											? undefined
											: 4,
									}}
								>
									<pre style={messagePreStyle}>
										{entry.content}
									</pre>
									<div className="dashboard-message-meta">
										{entry.model_used && (
											<span>{entry.model_used}</span>
										)}
										{entry.tokens_in != null && (
											<span>
												{entry.tokens_in} in /{" "}
												{entry.tokens_out ?? "?"} out
											</span>
										)}
									</div>
								</div>
							</div>
						);
					})}
				</div>
			</div>
		</div>
	);
}

const pageStyle: React.CSSProperties = {
	minHeight: "100vh",
	background: "var(--bg)",
};

const brandingBarStyle: React.CSSProperties = {
	textAlign: "center",
	padding: "0.75rem 1rem",
	fontSize: "0.8125rem",
	color: "var(--ink-dim)",
	background: "var(--surface)",
	borderBottom: "1px solid var(--border)",
};

const contentInnerStyle: React.CSSProperties = {
	maxWidth: 720,
	margin: "0 auto",
	padding: "2rem 1.5rem",
};

const messagePreStyle: React.CSSProperties = {
	whiteSpace: "pre-wrap",
	wordBreak: "break-word",
	fontFamily: "var(--font-body)",
	fontSize: "0.875rem",
	margin: 0,
};
