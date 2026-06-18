import { useState, useEffect, useCallback, useRef } from "react";
import {
	getToken,
	getPullRequests,
	getPullRequestDetail,
	mergePullRequest,
	updatePullRequestState,
	getPullRequestReviews,
	getCommitChecks,
} from "../dashboard/api.ts";
import type {
	GitHubPull,
	PullRequestDetail,
	PullRequestReview,
	CheckRun,
} from "../dashboard/api.ts";
import "./review.css";

// ---- Local Types ----

interface ReviewAgent {
	id: string;
	name: string;
	repository: string;
	model: string;
	enabled: boolean;
}

interface ReviewProgress {
	phase: string;
	message: string;
}

interface ReviewResult {
	summary: string;
	findingCount: number;
	tokensUsed: number;
	reviewUrl: string;
}

type WsStatus = "idle" | "connecting" | "connected" | "error";
type TabId = "overview" | "checks" | "reviews" | "actions";
type MergeMethod = "merge" | "squash" | "rebase";

// ---- WS URL ----

function buildWsUrl(): string {
	const apiBase = import.meta.env.VITE_API_URL ?? "/api/v1";
	if (apiBase.startsWith("/")) {
		const proto = location.protocol === "https:" ? "wss:" : "ws:";
		return `${proto}//${location.host}/ws`;
	}
	return apiBase.replace(/^http/, "ws").replace(/\/api\/v1\/?$/, "") + "/ws";
}

const WS_URL = buildWsUrl();

// ---- Helpers ----

function formatCount(n: number): string {
	if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
	return String(n);
}

function formatDate(dateStr: string): string {
	const d = new Date(dateStr);
	return d.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

function getMergeableLabel(state: string | null | undefined): string {
	switch (state) {
		case "clean":
			return "Mergeable";
		case "dirty":
			return "Conflicts";
		case "behind":
			return "Behind base";
		case "unknown":
			return "Checking...";
		default:
			return "Unknown";
	}
}

function getMergeableClass(state: string | null | undefined): string {
	switch (state) {
		case "clean":
			return "clean";
		case "dirty":
			return "dirty";
		case "behind":
			return "behind";
		default:
			return "unknown";
	}
}

function getReviewStateLabel(state: string): string {
	switch (state) {
		case "APPROVED":
			return "Approved";
		case "CHANGES_REQUESTED":
			return "Changes requested";
		case "COMMENTED":
			return "Commented";
		case "DISMISSED":
			return "Dismissed";
		case "PENDING":
			return "Pending";
		default:
			return state;
	}
}

// ---- Component ----

export function ReviewPage() {
	// ---- WS state ----
	const [agents, setAgents] = useState<ReviewAgent[]>([]);
	const [selectedAgent, setSelectedAgent] = useState<ReviewAgent | null>(null);
	const [wsStatus, setWsStatus] = useState<WsStatus>("idle");
	const wsRef = useRef<WebSocket | null>(null);
	const wsErrorRef = useRef(false);

	// ---- PR list ----
	const [pulls, setPulls] = useState<GitHubPull[]>([]);
	const [pullsLoading, setPullsLoading] = useState(false);
	const [pullsError, setPullsError] = useState<string | null>(null);
	const [selectedPrNum, setSelectedPrNum] = useState<number | null>(null);

	// ---- PR detail ----
	const [detail, setDetail] = useState<PullRequestDetail | null>(null);
	const [detailLoading, setDetailLoading] = useState(false);
	const [detailError, setDetailError] = useState<string | null>(null);

	// ---- Checks ----
	const [checks, setChecks] = useState<CheckRun[]>([]);
	const [checksLoading, setChecksLoading] = useState(false);

	// ---- Reviews ----
	const [reviews, setReviews] = useState<PullRequestReview[]>([]);
	const [reviewsLoading, setReviewsLoading] = useState(false);

	// ---- Review running ----
	const [reviewRunning, setReviewRunning] = useState(false);
	const [reviewProgress, setReviewProgress] = useState<ReviewProgress[]>([]);
	const [reviewResult, setReviewResult] = useState<ReviewResult | null>(null);
	const [reviewError, setReviewError] = useState<string | null>(null);

	// ---- Merge ----
	const [merging, setMerging] = useState(false);
	const [mergeMethod, setMergeMethod] = useState<MergeMethod>("squash");
	const [showMergeConfirm, setShowMergeConfirm] = useState(false);
	const [mergeError, setMergeError] = useState<string | null>(null);

	// ---- State update ----
	const [updatingState, setUpdatingState] = useState(false);

	// ---- Tab ----
	const [activeTab, setActiveTab] = useState<TabId>("overview");

	const getConnectionToken = useCallback((): string | null => {
		return getToken();
	}, []);

	// ---- Connect WS on mount ----
	useEffect(() => {
		const token = getConnectionToken();
		if (!token) {
			setWsStatus("error");
			wsErrorRef.current = true;
			return;
		}

		wsErrorRef.current = false;
		setWsStatus("connecting");
		const ws = new WebSocket(WS_URL);
		wsRef.current = ws;

		ws.onopen = () => {
			setWsStatus("connected");
			ws.send(
				JSON.stringify({ type: "list_review_agents", jwt: token }),
			);
		};

		ws.onmessage = (event: MessageEvent) => {
			try {
				const msg = JSON.parse(event.data as string);

				switch (msg.type) {
					case "review_agents":
						setAgents(msg.agents ?? []);
						break;

					case "review_progress":
						setReviewProgress((prev: ReviewProgress[]) => [
							...prev,
							{ phase: msg.phase, message: msg.message },
						]);
						break;

					case "review_complete":
						setReviewResult({
							summary: msg.summary,
							findingCount: msg.findingCount,
							tokensUsed: msg.tokensUsed,
							reviewUrl: msg.reviewUrl,
						});
						setReviewRunning(false);
						break;

					case "review_error":
						setReviewError(msg.message);
						setReviewRunning(false);
						break;
				}
			} catch {
				// ignore malformed messages
			}
		};

		ws.onerror = () => {
			setWsStatus("error");
			wsErrorRef.current = true;
		};

		ws.onclose = () => {
			if (wsStatus === "connecting" || wsStatus === "connected") {
				setWsStatus("error");
				wsErrorRef.current = true;
			}
		};

		return () => {
			ws.close();
			wsRef.current = null;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [getConnectionToken]);

	// ---- Fetch PRs when agent is selected ----
	useEffect(() => {
		if (!selectedAgent) {
			setPulls([]);
			setPullsError(null);
			setSelectedPrNum(null);
			return;
		}

		const [owner, repo] = selectedAgent.repository.split("/");
		if (!owner || !repo) {
			setPulls([]);
			setPullsError("Invalid repository format");
			return;
		}

		setPullsLoading(true);
		setPullsError(null);

		getPullRequests(owner, repo)
			.then((data) => {
				setPulls(data);
				setPullsLoading(false);
			})
			.catch((e: Error) => {
				setPulls([]);
				setPullsError(e.message ?? "Failed to load PRs");
				setPullsLoading(false);
			});
	}, [selectedAgent]);

	// ---- Fetch detail, checks, reviews when PR is selected ----
	useEffect(() => {
		if (!selectedAgent || !selectedPrNum) {
			setDetail(null);
			setDetailError(null);
			setChecks([]);
			setReviews([]);
			return;
		}

		const [owner, repo] = selectedAgent.repository.split("/");
		if (!owner || !repo) return;

		const selectedPr = pulls.find((p) => p.number === selectedPrNum);

		setDetailLoading(true);
		setDetailError(null);
		setChecksLoading(true);
		setReviewsLoading(true);
		setMergeError(null);
		setActiveTab("overview");

		// Reset review state from any previous run
		setReviewProgress([]);
		setReviewResult(null);
		setReviewError(null);
		setReviewRunning(false);

		// Fetch detail
		getPullRequestDetail(owner, repo, selectedPrNum)
			.then((d) => setDetail(d))
			.catch((e: Error) => setDetailError(e.message))
			.finally(() => setDetailLoading(false));

		// Fetch reviews
		getPullRequestReviews(owner, repo, selectedPrNum)
			.then((r) => setReviews(r))
			.catch(() => setReviews([]))
			.finally(() => setReviewsLoading(false));

		// Fetch checks using headSha from PR list entry
		if (selectedPr?.headSha) {
			getCommitChecks(owner, repo, selectedPr.headSha)
				.then((c) => setChecks(c))
				.catch(() => setChecks([]))
				.finally(() => setChecksLoading(false));
		} else {
			setChecksLoading(false);
		}
	}, [selectedAgent, selectedPrNum, pulls]);

	// ---- Handlers ----

	const handleRunReview = () => {
		if (
			!selectedAgent ||
			!selectedPrNum ||
			!wsRef.current ||
			wsRef.current.readyState !== WebSocket.OPEN ||
			reviewRunning
		) {
			return;
		}

		const token = getConnectionToken();
		if (!token) return;

		setReviewRunning(true);
		setReviewProgress([]);
		setReviewResult(null);
		setReviewError(null);

		setActiveTab("actions");

		wsRef.current.send(
			JSON.stringify({
				type: "run_review",
				jwt: token,
				agentId: selectedAgent.id,
				repository: selectedAgent.repository,
				prNumber: selectedPrNum,
			}),
		);
	};

	const handleOpenMergeConfirm = () => {
		setMergeError(null);
		setShowMergeConfirm(true);
	};

	const handleMerge = async () => {
		if (!selectedAgent || !selectedPrNum) return;

		const [owner, repo] = selectedAgent.repository.split("/");
		if (!owner || !repo) return;

		setMerging(true);
		setMergeError(null);

		try {
			const result = await mergePullRequest(owner, repo, selectedPrNum, {
				mergeMethod,
			});

			if (result.merged) {
				setShowMergeConfirm(false);
				// Refresh detail
				const d = await getPullRequestDetail(
					owner,
					repo,
					selectedPrNum,
				);
				setDetail(d);
			} else {
				setMergeError(result.message);
			}
		} catch (e: unknown) {
			setMergeError(
				e instanceof Error ? e.message : "Merge failed unexpectedly",
			);
		} finally {
			setMerging(false);
		}
	};

	const handleToggleState = async () => {
		if (!selectedAgent || !selectedPrNum || !detail) return;

		const [owner, repo] = selectedAgent.repository.split("/");
		if (!owner || !repo) return;

		const newState = detail.state === "open" ? "closed" : "open";

		setUpdatingState(true);
		setMergeError(null);

		try {
			await updatePullRequestState(
				owner,
				repo,
				selectedPrNum,
				newState as "open" | "closed",
			);

			// Refresh detail
			const d = await getPullRequestDetail(owner, repo, selectedPrNum);
			setDetail(d);

			// Refresh PR list
			const prs = await getPullRequests(owner, repo);
			setPulls(prs);
		} catch (e: unknown) {
			setMergeError(
				e instanceof Error
					? e.message
					: "Failed to update PR state",
			);
		} finally {
			setUpdatingState(false);
		}
	};

	// ---- Derived state ----

	const selectedPr = pulls.find((p) => p.number === selectedPrNum) ?? null;
	const hasFailingChecks =
		checks.length > 0 &&
		checks.some(
			(c) => c.status === "completed" && c.conclusion === "failure",
		);
	const canMerge =
		detail &&
		!detail.draft &&
		!detail.merged &&
		detail.mergeable !== false &&
		!hasFailingChecks;
	const isOpen = detail?.state === "open";
	const needsAuth = !getConnectionToken();
	const wsFatalError = wsStatus === "error" && wsErrorRef.current;

	// ---- Render ----

	return (
		<div className="review-page">
			{/* Auth or connection error banner */}
			{(needsAuth || wsFatalError) && (
				<div className="review-error-banner">
					{needsAuth
						? "No authentication token found. Please log in to Squido Cloud first."
						: "WebSocket connection failed. Review functions may be unavailable."}
				</div>
			)}

			<div className="review-layout">
				{/* ---- Sidebar ---- */}
				<aside className="review-sidebar">
					<div className="review-sidebar-header">
						<h1 className="review-sidebar-title">Reviews</h1>
						<span className="review-ws-dot" data-status={wsStatus} />
					</div>

					{/* Agent selector */}
					<div className="review-sidebar-section">
						<label className="review-sidebar-label" htmlFor="agent-select">
							Agent
						</label>
						<select
							id="agent-select"
							className="review-select"
							value={selectedAgent?.id ?? ""}
							onChange={(e) => {
								const agent =
									agents.find((a) => a.id === e.target.value) ??
									null;
								setSelectedAgent(agent);
							}}
							disabled={agents.length === 0}
						>
							<option value="">
								{agents.length === 0
									? "No agents available"
									: "Select agent..."}
							</option>
							{agents.map((agent) => (
								<option key={agent.id} value={agent.id}>
									{agent.name}
								</option>
							))}
						</select>
					</div>

					{/* PR list */}
					<div className="review-pr-section">
						<div className="review-pr-section-header">
							<span className="review-pr-section-title">
								Pull Requests
							</span>
							{!pullsLoading && pulls.length > 0 && (
								<span className="review-pr-count-badge">
									{pulls.length}
								</span>
							)}
						</div>

						<div className="review-pr-list">
							{pullsLoading && (
								<div className="review-pr-list-status">
									Loading PRs...
								</div>
							)}

							{pullsError && !pullsLoading && (
								<div className="review-pr-list-status review-pr-list-error">
									{pullsError}
								</div>
							)}

							{!pullsLoading &&
								!pullsError &&
								pulls.length === 0 &&
								selectedAgent && (
									<div className="review-pr-list-status">
										No open pull requests
									</div>
								)}

							{!pullsLoading &&
								!pullsError &&
								selectedAgent === null && (
									<div className="review-pr-list-status">
										Select an agent first
									</div>
								)}

							{pulls.map((pr) => (
								<button
									key={pr.number}
									type="button"
									className={`review-pr-item ${
										selectedPrNum === pr.number
											? "active"
											: ""
									}`}
									onClick={() => setSelectedPrNum(pr.number)}
								>
									<div className="review-pr-item-top">
										<span className="review-pr-item-num">
											#{pr.number}
										</span>
										{pr.draft && (
											<span className="review-pr-item-draft">
												Draft
											</span>
										)}
									</div>
									<span className="review-pr-item-title">
										{pr.title}
									</span>
									<div className="review-pr-item-meta">
										<span className="review-pr-item-author">
											{pr.author}
										</span>
										<span className="review-pr-item-date">
											{formatDate(pr.updatedAt)}
										</span>
									</div>
								</button>
							))}
						</div>
					</div>
				</aside>

				{/* ---- Main Panel ---- */}
				<main className="review-main">
					{/* Empty state */}
					{!selectedPrNum && !detailLoading && (
						<div className="review-empty-state">
							<div className="review-empty-icon">
								<svg
									width="48"
									height="48"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="1.5"
									strokeLinecap="round"
									strokeLinejoin="round"
								>
									<path d="M18 20V10" />
									<path d="M12 20V4" />
									<path d="M6 20v-6" />
								</svg>
							</div>
							<p className="review-empty-text">
								Select a pull request to view details
							</p>
							<p className="review-empty-hint">
								Choose an agent and PR from the sidebar
							</p>
						</div>
					)}

					{/* Loading detail */}
					{selectedPrNum && detailLoading && (
						<div className="review-loading-state">
							<div className="review-spinner" />
							<p>Loading PR details...</p>
						</div>
					)}

					{/* Error loading detail */}
					{selectedPrNum &&
						detailError &&
						!detailLoading && (
							<div className="review-error-state">
								<p className="review-error-state-title">
									Failed to load PR details
								</p>
								<p className="review-error-state-desc">
									{detailError}
								</p>
							</div>
						)}

					{/* PR Detail */}
					{detail && !detailLoading && (
						<>
							{/* PR Header */}
							<div className="review-detail-header">
								<div className="review-detail-title-row">
									{detail.draft && (
										<span className="review-badge review-badge-draft">
											Draft
										</span>
									)}
									{detail.merged && (
										<span className="review-badge review-badge-merged">
											Merged
										</span>
									)}
									{detail.state === "closed" && !detail.merged && (
										<span className="review-badge review-badge-closed">
											Closed
										</span>
									)}
									{detail.state === "open" && !detail.draft && (
										<span className="review-badge review-badge-open">
											Open
										</span>
									)}
									<h2 className="review-detail-title">
										{detail.title}
									</h2>
								</div>

								<div className="review-detail-meta">
									<div className="review-detail-author">
										{detail.authorAvatar && (
											<img
												className="review-detail-avatar"
												src={detail.authorAvatar}
												alt={detail.author}
												width="20"
												height="20"
											/>
										)}
										<span>{detail.author}</span>
									</div>
									<span className="review-detail-refs">
										{detail.headLabel} &rarr;{" "}
										{detail.baseLabel}
									</span>
									<span className="review-detail-date">
										Updated {formatDate(detail.updatedAt)}
									</span>
								</div>

								<div className="review-detail-stats">
									<div
										className="review-stat"
										data-type="additions"
										title="Additions"
									>
										<svg
											width="12"
											height="12"
											viewBox="0 0 16 16"
											fill="currentColor"
										>
											<rect
												x="7"
												y="0"
												width="2"
												height="16"
											/>
											<rect
												x="0"
												y="7"
												width="16"
												height="2"
											/>
										</svg>
										{formatCount(detail.additions)}
									</div>
									<div
										className="review-stat"
										data-type="deletions"
										title="Deletions"
									>
										<svg
											width="12"
											height="12"
											viewBox="0 0 16 16"
											fill="currentColor"
										>
											<rect
												x="0"
												y="7"
												width="16"
												height="2"
											/>
										</svg>
										{formatCount(detail.deletions)}
									</div>
									<div className="review-stat" title="Changed files">
										<svg
											width="12"
											height="12"
											viewBox="0 0 16 16"
											fill="none"
											stroke="currentColor"
											strokeWidth="1.5"
										>
											<path d="M2 4l4-2 4 2 4-2v10l-4 2-4-2-4 2V4z" />
											<path d="M6 2v10M10 4v10" />
										</svg>
										{detail.changedFiles} files
									</div>
									<div className="review-stat" title="Commits">
										<svg
											width="12"
											height="12"
											viewBox="0 0 16 16"
											fill="none"
											stroke="currentColor"
											strokeWidth="1.5"
										>
											<circle cx="8" cy="8" r="3" />
											<path d="M1 8h4M11 8h4" />
										</svg>
										{detail.commitCount} commits
									</div>
									<div className="review-stat" title="Comments">
										<svg
											width="12"
											height="12"
											viewBox="0 0 16 16"
											fill="none"
											stroke="currentColor"
											strokeWidth="1.5"
										>
											<path d="M1 3a1 1 0 011-1h12a1 1 0 011 1v8a1 1 0 01-1 1H5l-3 2V3z" />
										</svg>
										{detail.commentCount}
									</div>
								</div>

								{/* Mergeable state */}
								<div
									className={`review-mergeable-badge ${getMergeableClass(detail.mergeableState)}`}
									title={`Mergeable state: ${detail.mergeableState}`}
								>
									{getMergeableLabel(detail.mergeableState)}
								</div>
							</div>

							{/* Tabs */}
							<div className="review-tabs">
								<button
									type="button"
									className={`review-tab ${activeTab === "overview" ? "active" : ""}`}
									onClick={() => setActiveTab("overview")}
								>
									Overview
								</button>
								<button
									type="button"
									className={`review-tab ${activeTab === "checks" ? "active" : ""}`}
									onClick={() => setActiveTab("checks")}
								>
									Checks
									{checks.length > 0 && (
										<span className="review-tab-badge">
											{checks.length}
										</span>
									)}
								</button>
								<button
									type="button"
									className={`review-tab ${activeTab === "reviews" ? "active" : ""}`}
									onClick={() => setActiveTab("reviews")}
								>
									Reviews
									{reviews.length > 0 && (
										<span className="review-tab-badge">
											{reviews.length}
										</span>
									)}
								</button>
								<button
									type="button"
									className={`review-tab ${activeTab === "actions" ? "active" : ""}`}
									onClick={() => setActiveTab("actions")}
								>
									Actions
								</button>
							</div>

							{/* Tab content */}
							<div className="review-tab-content">
								{activeTab === "overview" && (
									<div className="review-overview">
										<div className="review-body">
											{detail.body
												? (
													<pre className="review-body-text">
														{detail.body}
													</pre>
												)
												: (
													<p className="review-body-empty">
														No description provided.
													</p>
												)}
										</div>
									</div>
								)}

								{activeTab === "checks" && (
									<div className="review-checks">
										{checksLoading && (
											<div className="review-checks-loading">
												<div className="review-spinner" />
												<span>Loading checks...</span>
											</div>
										)}
										{!checksLoading &&
											checks.length === 0 && (
												<p className="review-checks-empty">
													No CI checks found for this
													commit.
												</p>
											)}
										{!checksLoading &&
											checks.map((check) => (
												<a
													key={`${check.name}-${check.htmlUrl}`}
													href={check.htmlUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="review-check-item"
												>
													<span
														className={`review-check-icon ${getCheckStatusClass(check.status, check.conclusion)}`}
													>
														{getCheckIcon(
															check.status,
															check.conclusion,
														)}
													</span>
													<span className="review-check-name">
														{check.name}
													</span>
													{check.app && (
														<span className="review-check-app">
															{check.app.name}
														</span>
													)}
													<span className="review-check-status-text">
														{getCheckStatusText(
															check.status,
															check.conclusion,
														)}
													</span>
												</a>
											))}
									</div>
								)}

								{activeTab === "reviews" && (
									<div className="review-reviews">
										{reviewsLoading && (
											<div className="review-reviews-loading">
												<div className="review-spinner" />
												<span>Loading reviews...</span>
											</div>
										)}
										{!reviewsLoading &&
											reviews.length === 0 && (
												<p className="review-reviews-empty">
													No GitHub reviews on this PR
													yet.
												</p>
											)}
										{!reviewsLoading &&
											reviews.map((rv) => (
												<a
													key={rv.id}
													href={rv.htmlUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="review-review-item"
												>
													<div className="review-review-top">
														<div className="review-review-author">
															{rv.avatar && (
																<img
																	className="review-review-avatar"
																	src={
																		rv.avatar
																	}
																	alt={
																		rv.user
																	}
																	width="20"
																	height="20"
																/>
															)}
															<span className="review-review-user">
																{rv.user}
															</span>
															<span
																className={`review-review-state ${rv.state.toLowerCase()}`}
															>
																{getReviewStateLabel(
																	rv.state,
																)}
															</span>
														</div>
														<span className="review-review-date">
															{formatDate(
																rv.submittedAt,
															)}
														</span>
													</div>
													{rv.body && (
														<p className="review-review-body">
															{rv.body}
														</p>
													)}
												</a>
											))}
									</div>
								)}

								{activeTab === "actions" && (
									<div className="review-actions">
										{/* Merge Section */}
										<div className="review-action-section">
											<h3 className="review-action-heading">
												Merge
											</h3>
											<div className="review-action-row">
												<div className="review-merge-controls">
													<button
														type="button"
														className={`review-btn review-btn-merge ${canMerge ? "" : "disabled"}`}
														disabled={
															!canMerge || merging
														}
														onClick={
															handleOpenMergeConfirm
														}
													>
														{merging
															? "Merging..."
															: "Merge pull request"}
													</button>
													<select
														className="review-merge-method-select"
														value={mergeMethod}
														onChange={(e) =>
															setMergeMethod(
																e.target
																	.value as MergeMethod,
															)
														}
														disabled={
															!canMerge || merging
														}
													>
														<option value="squash">
															Squash
														</option>
														<option value="merge">
															Merge commit
														</option>
														<option value="rebase">
															Rebase
														</option>
													</select>
												</div>
											</div>
											{!canMerge && detail && (
												<p className="review-action-hint">
													{detail.draft &&
														"Cannot merge a draft PR."}
													{detail.merged &&
														"PR has already been merged."}
													{detail.mergeable ===
														false &&
														"PR has merge conflicts."}
													{hasFailingChecks &&
														"CI checks are failing."}
												</p>
											)}
										</div>

										{/* State Section */}
										<div className="review-action-section">
											<h3 className="review-action-heading">
												State
											</h3>
											<div className="review-action-row">
												<button
													type="button"
													className={`review-btn ${isOpen ? "review-btn-danger" : "review-btn-secondary"}`}
													disabled={
														updatingState || detail.merged
													}
													onClick={handleToggleState}
												>
													{updatingState
														? "Updating..."
														: isOpen
														? "Close pull request"
														: "Reopen pull request"}
												</button>
											</div>
											{detail.merged && (
												<p className="review-action-hint">
													Cannot change state of a
													merged PR.
												</p>
											)}
										</div>

										{/* Review Section */}
										<div className="review-action-section">
											<h3 className="review-action-heading">
												Squido Code Review
											</h3>
											<div className="review-action-row">
												<button
													type="button"
													className="review-btn review-btn-primary"
													disabled={
														reviewRunning ||
														wsStatus !== "connected" ||
														!selectedPr
													}
													onClick={handleRunReview}
												>
													{reviewRunning
														? "Running..."
														: "Run review"}
												</button>
												{wsStatus !== "connected" && (
													<p className="review-action-hint">
														WebSocket not connected
													</p>
												)}
											</div>
										</div>

										{/* Open on GitHub */}
										<div className="review-action-section">
											<h3 className="review-action-heading">
												GitHub
											</h3>
											<div className="review-action-row">
												<a
													href={detail.htmlUrl}
													target="_blank"
													rel="noopener noreferrer"
													className="review-btn review-btn-link"
												>
													Open on GitHub
												</a>
											</div>
										</div>

										{/* Action error */}
										{mergeError && (
											<div className="review-action-error">
												{mergeError}
											</div>
										)}

										{/* Review progress / result */}
										{reviewProgress.length > 0 && (
											<div className="review-progress-section">
												<h3 className="review-action-heading">
													Review Progress
												</h3>
												<div className="review-progress-list">
													{reviewProgress.map(
														(p, i) => (
															<div
																key={i}
																className="review-progress-item"
															>
																<span className="review-progress-phase">
																	{p.phase}
																</span>
																<span className="review-progress-message">
																	{p.message}
																</span>
															</div>
														),
													)}
												</div>
											</div>
										)}

										{reviewError && (
											<div className="review-result-error">
												<h4 className="review-result-error-title">
													Review failed
												</h4>
												<p className="review-result-error-desc">
													{reviewError}
												</p>
											</div>
										)}

										{reviewResult && (
											<div className="review-result-section">
												<h3 className="review-action-heading">
													Review Complete
												</h3>
												<div className="review-result-stats">
													<span className="review-result-stat">
														{reviewResult.findingCount}{" "}
														finding
														{reviewResult.findingCount !==
																1
															? "s"
															: ""}
													</span>
													<span className="review-result-stat">
														{reviewResult.tokensUsed}{" "}
														tokens
													</span>
												</div>
												{reviewResult.summary && (
													<p className="review-result-summary">
														{reviewResult.summary}
													</p>
												)}
												{reviewResult.reviewUrl && (
													<a
														href={
															reviewResult.reviewUrl
														}
														target="_blank"
														rel="noopener noreferrer"
														className="review-btn review-btn-link"
													>
														View review on GitHub
													</a>
												)}
											</div>
										)}
									</div>
								)}
							</div>
						</>
					)}
				</main>
			</div>

			{/* ---- Merge Confirm Modal ---- */}
			{showMergeConfirm && (
				<div
					className="review-modal-overlay"
					onClick={() => setShowMergeConfirm(false)}
				>
					<div
						className="review-modal"
						onClick={(e) => e.stopPropagation()}
					>
						<h3 className="review-modal-title">Merge pull request</h3>
						<p className="review-modal-desc">
							Are you sure you want to merge{" "}
							{detail?.headLabel ?? `#${selectedPrNum}`} into{" "}
							{detail?.baseLabel ?? "base"}?
						</p>

						<div className="review-merge-option">
							<label
								className="review-merge-option-label"
								htmlFor="merge-method-select"
							>
								Merge method
							</label>
							<select
								id="merge-method-select"
								className="review-select review-merge-modal-select"
								value={mergeMethod}
								onChange={(e) =>
									setMergeMethod(
										e.target.value as MergeMethod,
									)
								}
								disabled={merging}
							>
								<option value="squash">
									Squash and merge
								</option>
								<option value="merge">
									Create merge commit
								</option>
								<option value="rebase">
									Rebase and merge
								</option>
							</select>
						</div>

						{mergeError && (
							<div className="review-modal-error">
								{mergeError}
							</div>
						)}

						<div className="review-modal-actions">
							<button
								type="button"
								className="review-btn review-btn-secondary"
								onClick={() => setShowMergeConfirm(false)}
								disabled={merging}
							>
								Cancel
							</button>
							<button
								type="button"
								className="review-btn review-btn-merge"
								disabled={merging}
								onClick={handleMerge}
							>
								{merging ? "Merging..." : "Confirm merge"}
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

// ---- Check helpers ----

function getCheckStatusClass(
	status: string,
	conclusion: string | null,
): string {
	if (status === "completed") {
		if (conclusion === "success") return "pass";
		if (conclusion === "failure" || conclusion === "timed_out")
			return "fail";
		if (conclusion === "skipped" || conclusion === "neutral") return "skip";
		return "pending";
	}
	return "pending";
}

function getCheckIcon(status: string, conclusion: string | null): string {
	if (status === "completed") {
		if (conclusion === "success") return "\u2713";
		if (conclusion === "failure" || conclusion === "timed_out")
			return "\u2717";
		if (conclusion === "skipped" || conclusion === "neutral") return "-";
		return "\u25CB";
	}
	return "\u25CB";
}

function getCheckStatusText(
	status: string,
	conclusion: string | null,
): string {
	if (status === "completed") {
		switch (conclusion) {
			case "success":
				return "Passed";
			case "failure":
				return "Failed";
			case "timed_out":
				return "Timed out";
			case "skipped":
				return "Skipped";
			case "neutral":
				return "Neutral";
			case "cancelled":
				return "Cancelled";
			default:
				return "Completed";
		}
	}
	if (status === "queued") return "Queued";
	if (status === "in_progress") return "In progress";
	if (status === "pending") return "Pending";
	return status;
}
