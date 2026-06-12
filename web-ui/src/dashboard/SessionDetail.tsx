import { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { getSession, type SessionData, type SessionEntry } from "./api.ts";

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

export function SessionDetail() {
	const { id } = useParams<{ id: string }>();
	const navigate = useNavigate();
	const [session, setSession] = useState<SessionData | null>(null);
	const [entries, setEntries] = useState<SessionEntry[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [notFound, setNotFound] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const [expandedTools, setExpandedTools] = useState<Set<string>>(
		new Set(),
	);

	const fetchSession = useCallback(async () => {
		if (!id) return;
		setIsLoading(true);
		setError(null);
		setNotFound(false);
		try {
			const data = await getSession(id);
			setSession(data.session);
			setEntries(data.entries);
		} catch (err) {
			if (err instanceof Error && err.message === "Session not found") {
				setNotFound(true);
			} else {
				setError(
					err instanceof Error
						? err.message
						: "Failed to load session",
				);
			}
		} finally {
			setIsLoading(false);
		}
	}, [id]);

	useEffect(() => {
		fetchSession();
	}, [fetchSession]);

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

	const filteredEntries = entries.filter((entry) => {
		if (!searchQuery) return true;
		const q = searchQuery.toLowerCase();
		return (
			entry.content.toLowerCase().includes(q) ||
			(entry.model_used?.toLowerCase().includes(q) ?? false) ||
			(entry.entry_type?.toLowerCase().includes(q) ?? false)
		);
	});

	if (isLoading) {
		return <div style={statusStyle}>Loading...</div>;
	}

	if (notFound) {
		return (
			<div style={statusStyle}>
				<p style={{ fontSize: "1.0625rem", marginBottom: "0.5rem" }}>
					Session not found
				</p>
				<button
					className="btn btn-secondary"
					onClick={() => navigate("/dashboard")}
				>
					Back to sessions
				</button>
			</div>
		);
	}

	if (error) {
		return (
			<div style={{ ...statusStyle, color: "var(--primary)" }}>
				Error: {error}
			</div>
		);
	}

	if (!session) {
		return null;
	}

	return (
		<div>
			<button
				className="btn btn-secondary"
				style={backBtnStyle}
				onClick={() => navigate("/dashboard")}
			>
				Back
			</button>

			<div style={headerSectionStyle}>
				<h1 style={titleStyle}>{session.name}</h1>
				<div style={metaRowStyle}>
					{session.model_used && (
						<span style={metaBadgeStyle}>
							Model: {session.model_used}
						</span>
					)}
					{session.provider && (
						<span style={metaBadgeStyle}>
							Provider: {session.provider}
						</span>
					)}
					<span style={metaBadgeStyle}>
						Created {formatRelativeTime(session.created_at)}
					</span>
					<span style={metaBadgeStyle}>
						{session.message_count} messages
					</span>
				</div>
			</div>

			<div style={searchBarWrapperStyle}>
				<input
					type="search"
					placeholder="Search within session..."
					value={searchQuery}
					onChange={(e) => setSearchQuery(e.target.value)}
					style={searchInputStyle}
				/>
			</div>

			<div style={timelineStyle}>
				{filteredEntries.length === 0 && (
					<div style={emptyStyle}>
						{searchQuery
							? "No entries match your search."
							: "No entries in this session."}
					</div>
				)}

				{filteredEntries.map((entry) => {
					if (entry.entry_type === "model_change" || entry.entry_type === "thinking_change") {
						return (
							<div key={entry.id} style={compactBadgeStyle}>
								<span style={compactBadgeTextStyle}>
									{entry.entry_type === "model_change"
										? "Model changed"
										: "Thinking level changed"}
									{entry.content ? `: ${entry.content}` : ""}
								</span>
							</div>
						);
					}

					if (entry.role === "tool") {
						const isExpanded = expandedTools.has(entry.id);
						return (
							<div key={entry.id} style={toolCallWrapperStyle}>
								<button
									style={toolCallHeaderStyle}
									onClick={() => toggleToolExpanded(entry.id)}
								>
									<span>{isExpanded ? "▼" : "▶"} Tool call</span>
									{entry.model_used && (
										<span style={toolModelStyle}>
											{entry.model_used}
										</span>
									)}
								</button>
								{isExpanded && (
									<pre style={toolCallBodyStyle}>
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
							style={{
								...messageRowStyle,
								flexDirection: isUser ? "row-reverse" : "row",
							}}
						>
							<div
								style={{
									...messageBubbleStyle,
									background: isUser
										? "var(--primary)"
										: "var(--surface)",
									color: isUser ? "var(--bg)" : "var(--ink)",
									borderBottomRightRadius: isUser ? 4 : undefined,
									borderBottomLeftRadius: isUser ? undefined : 4,
								}}
							>
								<pre style={messagePreStyle}>{entry.content}</pre>
								<div style={messageMetaStyle}>
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
	);
}

const statusStyle: React.CSSProperties = {
	color: "var(--ink-muted)",
	padding: "2rem 0",
};

const backBtnStyle: React.CSSProperties = {
	fontSize: "0.8125rem",
	padding: "0.4rem 1rem",
	marginBottom: "1rem",
};

const headerSectionStyle: React.CSSProperties = {
	marginBottom: "1.5rem",
};

const titleStyle: React.CSSProperties = {
	fontFamily: "var(--font-display)",
	fontSize: "1.5rem",
	fontWeight: 700,
	marginBottom: "0.75rem",
	letterSpacing: "-0.02em",
};

const metaRowStyle: React.CSSProperties = {
	display: "flex",
	flexWrap: "wrap",
	gap: "0.5rem",
};

const metaBadgeStyle: React.CSSProperties = {
	fontSize: "0.75rem",
	padding: "0.2rem 0.625rem",
	background: "var(--surface)",
	border: "1px solid var(--border)",
	borderRadius: "var(--radius-sm)",
	color: "var(--ink-dim)",
	fontFamily: "var(--font-mono)",
};

const searchBarWrapperStyle: React.CSSProperties = {
	marginBottom: "1.5rem",
};

const searchInputStyle: React.CSSProperties = {
	width: "100%",
	padding: "0.625rem 0.875rem",
	background: "var(--surface)",
	border: "1px solid var(--border)",
	borderRadius: "var(--radius-sm)",
	color: "var(--ink)",
	fontFamily: "var(--font-body)",
	fontSize: "0.875rem",
	outline: "none",
	boxSizing: "border-box",
};

const timelineStyle: React.CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "0.75rem",
};

const emptyStyle: React.CSSProperties = {
	color: "var(--ink-dim)",
	textAlign: "center",
	padding: "2rem 0",
	fontSize: "0.875rem",
};

const messageRowStyle: React.CSSProperties = {
	display: "flex",
	gap: "0.75rem",
};

const messageBubbleStyle: React.CSSProperties = {
	maxWidth: "75%",
	padding: "0.75rem 1rem",
	borderRadius: "var(--radius-md)",
	fontSize: "0.875rem",
	lineHeight: 1.6,
	overflow: "auto",
};

const messagePreStyle: React.CSSProperties = {
	whiteSpace: "pre-wrap",
	wordBreak: "break-word",
	fontFamily: "var(--font-body)",
	fontSize: "0.875rem",
	margin: 0,
};

const messageMetaStyle: React.CSSProperties = {
	display: "flex",
	gap: "0.75rem",
	marginTop: "0.5rem",
	fontSize: "0.6875rem",
	opacity: 0.6,
	fontFamily: "var(--font-mono)",
};

const compactBadgeStyle: React.CSSProperties = {
	display: "flex",
	justifyContent: "center",
};

const compactBadgeTextStyle: React.CSSProperties = {
	fontSize: "0.75rem",
	padding: "0.2rem 0.75rem",
	background: "var(--surface)",
	border: "1px solid var(--border)",
	borderRadius: "999px",
	color: "var(--ink-dim)",
};

const toolCallWrapperStyle: React.CSSProperties = {
	border: "1px solid var(--border)",
	borderRadius: "var(--radius-sm)",
	overflow: "hidden",
};

const toolCallHeaderStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	width: "100%",
	padding: "0.5rem 0.75rem",
	background: "var(--surface)",
	border: "none",
	color: "var(--ink-muted)",
	fontSize: "0.8125rem",
	fontFamily: "var(--font-mono)",
	cursor: "pointer",
	textAlign: "left",
};

const toolModelStyle: React.CSSProperties = {
	fontSize: "0.6875rem",
	color: "var(--ink-dim)",
};

const toolCallBodyStyle: React.CSSProperties = {
	padding: "0.75rem",
	margin: 0,
	fontSize: "0.8125rem",
	lineHeight: 1.55,
	overflowX: "auto",
	background: "var(--code-bg)",
	borderTop: "1px solid var(--border)",
};
