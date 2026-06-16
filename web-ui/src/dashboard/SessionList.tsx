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
			<h1 className="dashboard-heading">Sessions</h1>

			<div style={{ marginBottom: "1rem" }}>
				<input
					type="search"
					className="dashboard-search"
					placeholder="Search sessions..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
				/>
			</div>

			{isLoading && (
				<div className="dashboard-status">Loading...</div>
			)}

			{error && (
				<div className="dashboard-status" style={{ color: "var(--primary)" }}>
					Error: {error}
				</div>
			)}

			{!isLoading && !error && sessions.length === 0 && (
				<div className="dashboard-empty">
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
					<table className="dashboard-table">
						<thead>
							<tr>
								<th className="dashboard-th">Name</th>
								<th className="dashboard-th">Model</th>
								<th className="dashboard-th">Date</th>
								<th className="dashboard-th">Messages</th>
								<th className="dashboard-th" style={{ width: 70 }} />
							</tr>
						</thead>
						<tbody>
							{sessions.map((s) => (
								<tr
									key={s.id}
									className="dashboard-tr"
									onClick={() =>
										navigate(`/dashboard/session/${s.id}`)
									}
								>
									<td className="dashboard-td">{s.name}</td>
									<td className="dashboard-td" style={{ color: "var(--ink-dim)", fontFamily: "var(--font-mono)", fontSize: "0.8125rem" }}>
										{s.model_used ?? "\u2014"}
									</td>
									<td className="dashboard-td" style={{ color: "var(--ink-dim)", fontSize: "0.8125rem", whiteSpace: "nowrap" }}>
										{formatRelativeTime(s.created_at)}
									</td>
									<td className="dashboard-td" style={{ color: "var(--ink-dim)" }}>
										{s.message_count}
									</td>
									<td className="dashboard-td">
										<button
											onClick={(e) => {
												e.stopPropagation();
												handleDelete(s.id, s.name);
											}}
											className="dashboard-delete-btn"
											title="Delete session"
										>
											Delete
										</button>
									</td>
								</tr>
							))}
						</tbody>
					</table>

					<div className="dashboard-pagination">
						<button
							className="btn btn-secondary"
							disabled={page <= 1}
							onClick={() => setPage(page - 1)}
							style={{ fontSize: "0.8125rem", padding: "0.4rem 1rem" }}
						>
							Prev
						</button>
						<span className="dashboard-page-info">Page {page}</span>
						<button
							className="btn btn-secondary"
							disabled={sessions.length < pageSize}
							onClick={() => setPage(page + 1)}
							style={{ fontSize: "0.8125rem", padding: "0.4rem 1rem" }}
						>
							Next
						</button>
					</div>
				</>
			)}
		</div>
	);
}
