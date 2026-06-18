import { useState, useEffect, useCallback } from "react";
import { apiFetch } from "./api.ts";
import "./review-agents.css";

// ---- Types ----

interface ReviewAgent {
	id: string;
	name: string;
	repository: string;
	model: string;
	enabled: boolean;
}

interface GitHubRepo {
	fullName: string;
	owner: string;
	name: string;
}

interface ReviewRun {
	id: string;
	prNumber: number;
	summary: string | null;
	status: string;
	findingCount: number;
	startedAt: string;
	completedAt: string | null;
}

// ---- Styles ----

const createBtnStyle: React.CSSProperties = {
	fontSize: "0.8125rem",
	padding: "0.45rem 1rem",
};

const emptyCtaStyle: React.CSSProperties = {
	marginTop: "0.5rem",
};

// ---- Component ----

export function ReviewAgents() {
	const [agents, setAgents] = useState<ReviewAgent[]>([]);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [showCreateModal, setShowCreateModal] = useState(false);
	const [expandedAgentId, setExpandedAgentId] = useState<string | null>(null);

	// Create form state
	const [newName, setNewName] = useState("");
	const [newRepository, setNewRepository] = useState("");
	const [newModel, setNewModel] = useState("deepseek-v4-flash");
	const [repos, setRepos] = useState<GitHubRepo[]>([]);
	const [reposLoading, setReposLoading] = useState(false);
	const [creating, setCreating] = useState(false);

	// Runs state
	const [runs, setRuns] = useState<ReviewRun[]>([]);
	const [runsLoading, setRunsLoading] = useState(false);

	const fetchAgents = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			const res = await apiFetch("/review/agents");
			const data = await res.json();
			setAgents(data.agents ?? []);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load agents");
		} finally {
			setIsLoading(false);
		}
	}, []);

	const fetchRepos = useCallback(async () => {
		setReposLoading(true);
		try {
			const res = await apiFetch("/github/repos");
			const data = await res.json();
			setRepos(data.repos ?? []);
		} catch {
			// silently fail
		} finally {
			setReposLoading(false);
		}
	}, []);

	const fetchRuns = useCallback(async (agentId: string) => {
		setRunsLoading(true);
		try {
			const res = await apiFetch(`/review/agents/${encodeURIComponent(agentId)}/runs`);
			const data = await res.json();
			setRuns(data.runs ?? []);
		} catch {
			setRuns([]);
		} finally {
			setRunsLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchAgents();
	}, [fetchAgents]);

	const handleCreate = async () => {
		if (!newName.trim() || !newRepository.trim()) return;
		setCreating(true);
		try {
			await apiFetch("/review/agents", {
				method: "POST",
				body: JSON.stringify({
					name: newName.trim(),
					repository: newRepository.trim(),
					model: newModel.trim() || "deepseek-v4-flash",
				}),
			});
			setShowCreateModal(false);
			setNewName("");
			setNewRepository("");
			setNewModel("deepseek-v4-flash");
			await fetchAgents();
		} catch (err) {
			alert(err instanceof Error ? err.message : "Failed to create agent");
		} finally {
			setCreating(false);
		}
	};

	const handleDelete = async (id: string, name: string) => {
		if (!confirm(`Delete review agent "${name}"? This cannot be undone.`)) return;
		try {
			await apiFetch(`/review/agents/${encodeURIComponent(id)}`, { method: "DELETE" });
			if (expandedAgentId === id) {
				setExpandedAgentId(null);
				setRuns([]);
			}
			await fetchAgents();
		} catch (err) {
			alert(err instanceof Error ? err.message : "Failed to delete agent");
		}
	};

	const handleToggleEnabled = async (agent: ReviewAgent) => {
		try {
			await apiFetch(`/review/agents/${encodeURIComponent(agent.id)}`, {
				method: "PATCH",
				body: JSON.stringify({ enabled: !agent.enabled }),
			});
			await fetchAgents();
		} catch (err) {
			alert(err instanceof Error ? err.message : "Failed to update agent");
		}
	};

	const handleCardClick = (agentId: string) => {
		if (expandedAgentId === agentId) {
			setExpandedAgentId(null);
			setRuns([]);
		} else {
			setExpandedAgentId(agentId);
			fetchRuns(agentId);
		}
	};

	const openCreateModal = () => {
		fetchRepos();
		setShowCreateModal(true);
	};

	return (
		<div>
			<div className="review-agents-header">
				<h1 className="dashboard-heading">Review Agents</h1>
				<button className="btn btn-primary" onClick={openCreateModal} style={createBtnStyle}>
					Create Agent
				</button>
			</div>

			{isLoading && (
				<div className="dashboard-status">Loading...</div>
			)}

			{error && (
				<div className="dashboard-status" style={{ color: "var(--primary)" }}>
					Error: {error}
				</div>
			)}

			{!isLoading && !error && agents.length === 0 && (
				<div className="dashboard-empty">
					<p style={{ fontSize: "1.0625rem", marginBottom: "0.5rem" }}>
						No review agents yet
					</p>
					<p style={{ fontSize: "0.875rem", color: "var(--ink-dim)", marginBottom: "1rem" }}>
						Create a review agent to automatically review pull requests.
					</p>
					<button className="btn btn-primary" onClick={openCreateModal} style={emptyCtaStyle}>
						Create Your First Agent
					</button>
				</div>
			)}

			{agents.length > 0 && (
				<div className="review-agents-grid">
					{agents.map((agent) => (
						<div key={agent.id} className="review-agent-card">
							<div
								className="review-agent-card-top"
								onClick={() => handleCardClick(agent.id)}
							>
								<div>
									<div className="review-agent-card-name">{agent.name}</div>
									<div className="review-agent-card-meta">
									<span className="review-agent-card-meta-item">
										{agent.repository}
									</span>
										<span className="review-agent-card-meta-item">
											{agent.model}
										</span>
									</div>
								</div>
								<div style={cardActionsStyle}>
									<label
										className="review-agent-toggle"
										onClick={(e) => e.stopPropagation()}
									>
										<input
											type="checkbox"
											checked={agent.enabled}
											onChange={() => handleToggleEnabled(agent)}
										/>
										<span className="review-agent-toggle-slider" />
									</label>
									<button
										className="dashboard-delete-btn"
										onClick={(e) => {
											e.stopPropagation();
											handleDelete(agent.id, agent.name);
										}}
										title="Delete agent"
									>
										Delete
									</button>
								</div>
							</div>

							{expandedAgentId === agent.id && (
								<div className="review-agent-runs">
									<div className="review-agent-runs-header">
										Review History
									</div>
									{runsLoading && (
										<div style={runsLoadingStyle}>Loading...</div>
									)}
									{!runsLoading && runs.length === 0 && (
										<div style={runsLoadingStyle}>No reviews yet.</div>
									)}
									{runs.map((run) => (
										<div key={run.id} className="review-agent-run">
											<span>PR #{run.prNumber}</span>
											<span
												className={`review-agent-run-status ${run.status}`}
											>
												{run.status}
											</span>
											<span style={runsDateStyle}>
												{new Date(run.startedAt).toLocaleDateString()}
											</span>
										</div>
									))}
								</div>
							)}
						</div>
					))}
				</div>
			)}

			{/* Create Agent Modal */}
			{showCreateModal && (
				<div
					className="review-agent-modal-overlay"
					onClick={() => setShowCreateModal(false)}
				>
					<div
						className="review-agent-modal"
						onClick={(e) => e.stopPropagation()}
					>
						<h2>Create Review Agent</h2>

						<div className="review-agent-form-group">
							<label htmlFor="agent-name">Name</label>
							<input
								id="agent-name"
								type="text"
								placeholder="My Review Agent"
								value={newName}
								onChange={(e) => setNewName(e.target.value)}
							/>
						</div>

						<div className="review-agent-form-group">
							<label htmlFor="agent-repo">Repository</label>
							<select
								id="agent-repo"
								value={newRepository}
								onChange={(e) => setNewRepository(e.target.value)}
								disabled={reposLoading}
							>
								<option value="">
									{reposLoading ? "Loading repos..." : "Select a repository"}
								</option>
								{repos.map((repo) => (
									<option key={repo.fullName} value={repo.fullName}>
										{repo.fullName}
									</option>
								))}
							</select>
						</div>

						<div className="review-agent-form-group">
							<label htmlFor="agent-model">Model</label>
							<input
								id="agent-model"
								type="text"
								placeholder="deepseek-v4-flash"
								value={newModel}
								onChange={(e) => setNewModel(e.target.value)}
							/>
						</div>

						<div className="review-agent-form-actions">
							<button
								className="btn btn-secondary"
								onClick={() => setShowCreateModal(false)}
							>
								Cancel
							</button>
							<button
								className="btn btn-primary"
								onClick={handleCreate}
								disabled={
									creating ||
									!newName.trim() ||
									!newRepository.trim()
								}
							>
								{creating ? "Creating..." : "Create"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// ---- Inline styles ----

const cardActionsStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "0.5rem",
};

const runsLoadingStyle: React.CSSProperties = {
	fontSize: "0.8125rem",
	color: "var(--ink-dim)",
	padding: "0.5rem 0",
};

const runsDateStyle: React.CSSProperties = {
	fontSize: "0.75rem",
	color: "var(--ink-dim)",
};
