import { useNavigate } from "react-router-dom";
import { useSessions } from "./hooks/useSessions.ts";
import { deleteSession } from "./api.ts";

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

export function SessionList() {
	const {
		sessions,
		isLoading,
		error,
		search,
		setSearch,
		page,
		setPage,
		pageSize,
		refresh,
	} = useSessions();
	const navigate = useNavigate();

	async function handleDelete(id: string, name: string) {
		if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
		try {
			await deleteSession(id);
			refresh();
		} catch (err) {
			alert(
				err instanceof Error ? err.message : "Failed to delete session",
			);
		}
	}

	return (
		<div>
			<h1 style={headingStyle}>Sessions</h1>

			<div style={searchBarStyle}>
				<input
					type="search"
					placeholder="Search sessions..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					style={searchInputStyle}
				/>
			</div>

			{isLoading && (
				<div style={infoBlockStyle}>Loading...</div>
			)}

			{error && (
				<div style={{ ...infoBlockStyle, color: "var(--primary)" }}>
					Error: {error}
				</div>
			)}

			{!isLoading && !error && sessions.length === 0 && (
				<div style={emptyStateStyle}>
					<p style={{ fontSize: "1.0625rem", marginBottom: "0.5rem" }}>
						No sessions yet
					</p>
					<p style={{ fontSize: "0.875rem", color: "var(--ink-dim)" }}>
						Run <code>squido</code> to start one!
					</p>
				</div>
			)}

			{sessions.length > 0 && (
				<>
					<table style={tableStyle}>
						<thead>
							<tr>
								<th style={thStyle}>Name</th>
								<th style={thStyle}>Model</th>
								<th style={thStyle}>Date</th>
								<th style={thStyle}>Messages</th>
								<th style={{ ...thStyle, width: 70 }} />
							</tr>
						</thead>
						<tbody>
							{sessions.map((s) => (
								<tr
									key={s.id}
									style={trStyle}
									onClick={() =>
										navigate(`/dashboard/session/${s.id}`)
									}
								>
									<td style={tdStyle}>{s.name}</td>
									<td
										style={{
											...tdStyle,
											color: "var(--ink-dim)",
											fontFamily: "var(--font-mono)",
											fontSize: "0.8125rem",
										}}
									>
										{s.model_used ?? "\u2014"}
									</td>
									<td
										style={{
											...tdStyle,
											color: "var(--ink-dim)",
											fontSize: "0.8125rem",
											whiteSpace: "nowrap",
										}}
									>
										{formatRelativeTime(s.created_at)}
									</td>
									<td
										style={{
											...tdStyle,
											color: "var(--ink-dim)",
										}}
									>
										{s.message_count}
									</td>
									<td style={tdStyle}>
										<button
											onClick={(e) => {
												e.stopPropagation();
												handleDelete(s.id, s.name);
											}}
											style={deleteBtnStyle}
											title="Delete session"
										>
											Delete
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>

					<div style={paginationStyle}>
						<button
							className="btn btn-secondary"
							style={pageBtnStyle}
							disabled={page <= 1}
							onClick={() => setPage(page - 1)}
						>
							Prev
						</button>
						<span style={pageInfoStyle}>Page {page}</span>
						<button
							className="btn btn-secondary"
							style={pageBtnStyle}
							disabled={sessions.length < pageSize}
							onClick={() => setPage(page + 1)}
						>
							Next
						</button>
					</div>
				</>
			)}
		</div>
	);
}

const headingStyle: React.CSSProperties = {
	fontFamily: "var(--font-display)",
	fontSize: "1.5rem",
	fontWeight: 700,
	marginBottom: "1.25rem",
	letterSpacing: "-0.02em",
};

const searchBarStyle: React.CSSProperties = {
	marginBottom: "1rem",
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

const infoBlockStyle: React.CSSProperties = {
	color: "var(--ink-muted)",
	padding: "2rem 0",
};

const emptyStateStyle: React.CSSProperties = {
	color: "var(--ink-dim)",
	padding: "3rem 0",
	textAlign: "center",
};

const tableStyle: React.CSSProperties = {
	width: "100%",
	borderCollapse: "collapse",
};

const thStyle: React.CSSProperties = {
	textAlign: "left",
	padding: "0.625rem 0.75rem",
	fontSize: "0.75rem",
	fontWeight: 600,
	textTransform: "uppercase",
	letterSpacing: "0.06em",
	color: "var(--ink-dim)",
	borderBottom: "1px solid var(--border)",
};

const trStyle: React.CSSProperties = {
	cursor: "pointer",
	transition: "background 0.1s",
};

const tdStyle: React.CSSProperties = {
	padding: "0.625rem 0.75rem",
	fontSize: "0.875rem",
	borderBottom: "1px solid var(--border)",
	color: "var(--ink)",
	verticalAlign: "middle",
};

const deleteBtnStyle: React.CSSProperties = {
	background: "none",
	border: "1px solid var(--border)",
	color: "var(--ink-dim)",
	fontSize: "0.75rem",
	padding: "0.2rem 0.5rem",
	borderRadius: "var(--radius-sm)",
	cursor: "pointer",
	transition: "all 0.15s",
};

const paginationStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	gap: "1rem",
	marginTop: "1.5rem",
};

const pageBtnStyle: React.CSSProperties = {
	fontSize: "0.8125rem",
	padding: "0.4rem 1rem",
};

const pageInfoStyle: React.CSSProperties = {
	color: "var(--ink-dim)",
	fontSize: "0.875rem",
};
