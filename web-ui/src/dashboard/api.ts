export const API_BASE = import.meta.env.VITE_API_URL ?? "/api/v1";

// ---- Types ----

export interface SessionData {
	id: string;
	name: string;
	model_used: string | null;
	provider?: string | null;
	message_count: number;
	total_turns: number;
	created_at: string;
	updated_at?: string;
}

export interface SessionEntry {
	id: string;
	session_id: string;
	role: "user" | "assistant" | "tool";
	content: string;
	entry_type: string | null;
	model_used: string | null;
	tokens_in: number | null;
	tokens_out: number | null;
	created_at: string;
}

// ---- Auth helpers ----

export function getToken(): string | null {
	return localStorage.getItem("squido_cloud_token");
}

export function setToken(token: string): void {
	localStorage.setItem("squido_cloud_token", token);
}

export function clearToken(): void {
	localStorage.removeItem("squido_cloud_token");
}

// ---- Fetch wrapper ----

export async function apiFetch(
	path: string,
	options?: RequestInit,
): Promise<Response> {
	const token = getToken();
	const headers: Record<string, string> = {};
	if (token) {
		headers["Authorization"] = `Bearer ${token}`;
	}
	if (options?.body && !(options.body instanceof FormData)) {
		headers["Content-Type"] = "application/json";
	}
	if (options?.headers) {
		for (const [k, v] of Object.entries(options.headers)) {
			if (typeof v === "string") {
				headers[k] = v;
			}
		}
	}
	const res = await fetch(`${API_BASE}${path}`, { ...options, headers });
	if (!res.ok) {
		const body = await res.json().catch(() => null);
		throw new Error(body?.message ?? res.statusText);
	}
	return res;
}

// ---- Sessions ----

export interface SessionsResponse {
	sessions: SessionData[];
	limit: number;
	offset: number;
}

export async function getSessions(params?: {
	q?: string;
	limit?: number;
	offset?: number;
}): Promise<SessionsResponse> {
	const query = new URLSearchParams();
	if (params?.q) query.set("q", params.q);
	if (params?.limit) query.set("limit", String(params.limit));
	if (params?.offset) query.set("offset", String(params.offset));
	const res = await apiFetch(`/sessions?${query}`);
	return res.json() as Promise<SessionsResponse>;
}

export interface SessionDetailResponse {
	session: SessionData;
	entries: SessionEntry[];
	entryLimit: number;
	entryOffset: number;
}

export async function getSession(id: string): Promise<SessionDetailResponse> {
	const res = await apiFetch(`/sessions/${encodeURIComponent(id)}`);
	return res.json() as Promise<SessionDetailResponse>;
}

export async function deleteSession(id: string): Promise<void> {
	await apiFetch(`/sessions/${encodeURIComponent(id)}`, { method: "DELETE" });
}

// ---- Search ----

export interface SearchResponse {
	results: SessionData[];
	limit: number;
	offset: number;
	query: string;
}

export async function searchSessions(q: string): Promise<SearchResponse> {
	const res = await apiFetch(`/search?q=${encodeURIComponent(q)}`);
	return res.json() as Promise<SearchResponse>;
}

// ---- Auth endpoints ----

export interface AuthStartResponse {
	url: string;
}

export async function startGitHubAuth(): Promise<AuthStartResponse> {
	const res = await apiFetch("/auth/github/web/start", { method: "POST" });
	return res.json() as Promise<AuthStartResponse>;
}

export interface AuthCallbackResponse {
	token: string;
	user: {
		userId: string;
		email: string;
		githubLogin: string;
		tier: string;
	};
}

export async function exchangeGitHubCode(
	code: string,
): Promise<AuthCallbackResponse> {
	const res = await apiFetch("/auth/github/web/callback", {
		method: "POST",
		body: JSON.stringify({ code }),
	});
	return res.json() as Promise<AuthCallbackResponse>;
}

export interface UserProfile {
	id: string;
	email: string;
	github_login: string;
	tier: string;
	avatar_url: string | null;
	created_at: string;
}

export async function getUserProfile(): Promise<UserProfile> {
	const res = await apiFetch("/auth/me");
	return res.json() as Promise<UserProfile>;
}

// ---- Sharing (public, no auth) ----

export interface ShareResponse {
	session: SessionData;
	entries: SessionEntry[];
}

export async function getSharedSession(
	token: string,
): Promise<ShareResponse> {
	const res = await fetch(
		`${API_BASE}/share/${encodeURIComponent(token)}`,
	);
	if (!res.ok) {
		const body = await res.json().catch(() => null);
		throw new Error(body?.message ?? res.statusText);
	}
	return res.json() as Promise<ShareResponse>;
}

// ---- Review Agents ----

export interface ReviewAgent {
	id: string;
	name: string;
	repository: string;
	model: string;
	provider: string;
	enabled: boolean;
	configPath: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface ReviewRun {
	id: string;
	agentId: string;
	repository: string;
	prNumber: number;
	status: string;
	summary: string | null;
	findingCount: number;
	tokensUsed: number;
	startedAt: string;
	completedAt: string | null;
}

export async function getReviewAgents(): Promise<ReviewAgent[]> {
	const res = await apiFetch("/review/agents");
	const data = await res.json() as { agents: ReviewAgent[] };
	return data.agents;
}

export async function createReviewAgent(params: {
	name: string;
	repository: string;
	model?: string;
	provider?: string;
}): Promise<ReviewAgent> {
	const res = await apiFetch("/review/agents", {
		method: "POST",
		body: JSON.stringify(params),
	});
	return res.json() as Promise<ReviewAgent>;
}

export async function deleteReviewAgent(id: string): Promise<void> {
	await apiFetch(`/review/agents/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export async function getReviewRuns(agentId: string): Promise<ReviewRun[]> {
	const res = await apiFetch(`/review/agents/${encodeURIComponent(agentId)}/runs`);
	const data = await res.json() as { runs: ReviewRun[] };
	return data.runs;
}

// ---- GitHub Repos & PRs ----

export interface GitHubRepo {
	id: number;
	fullName: string;
	name: string;
	owner: string;
	private: boolean;
	defaultBranch: string;
	updatedAt: string;
	htmlUrl: string;
}

export interface GitHubPull {
	id: number;
	number: number;
	title: string;
	state: string;
	headSha: string;
	headRef: string;
	baseRef: string;
	author: string;
	updatedAt: string;
	htmlUrl: string;
	draft: boolean;
}

export async function getGitHubRepos(): Promise<GitHubRepo[]> {
	const res = await apiFetch("/github/repos");
	const data = await res.json() as { repos: GitHubRepo[] };
	return data.repos;
}

export async function getPullRequests(
	owner: string,
	repo: string,
): Promise<GitHubPull[]> {
	const res = await apiFetch(`/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`);
	const data = await res.json() as { pulls: GitHubPull[] };
	return data.pulls;
}

// ---- PR Management ----

export interface PullRequestDetail {
	number: number;
	title: string;
	body: string | null;
	state: string;
	draft: boolean;
	merged: boolean;
	mergeable: boolean | null;
	mergeableState: string;
	headSha: string;
	headRef: string;
	headLabel: string;
	baseRef: string;
	baseLabel: string;
	author: string;
	authorAvatar: string;
	updatedAt: string;
	createdAt: string;
	htmlUrl: string;
	commentCount: number;
	commitCount: number;
	additions: number;
	deletions: number;
	changedFiles: number;
}

export interface PullRequestReview {
	id: number;
	user: string;
	avatar: string;
	body: string | null;
	state: string;
	submittedAt: string;
	htmlUrl: string;
}

export interface CheckRun {
	name: string;
	status: string;
	conclusion: string | null;
	htmlUrl: string;
	app: { name: string } | null;
}

export async function getPullRequestDetail(
	owner: string,
	repo: string,
	prNumber: number,
): Promise<PullRequestDetail> {
	const res = await apiFetch(`/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`);
	return res.json() as Promise<PullRequestDetail>;
}

export async function mergePullRequest(
	owner: string,
	repo: string,
	prNumber: number,
	options?: { commitTitle?: string; commitMessage?: string; mergeMethod?: "merge" | "squash" | "rebase" },
): Promise<{ merged: boolean; message: string; sha?: string }> {
	const res = await apiFetch(`/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/merge`, {
		method: "PUT",
		body: JSON.stringify(options ?? {}),
	});
	return res.json() as Promise<{ merged: boolean; message: string; sha?: string }>;
}

export async function updatePullRequestState(
	owner: string,
	repo: string,
	prNumber: number,
	state: "open" | "closed",
): Promise<{ number: number; state: string; title: string; htmlUrl: string }> {
	const res = await apiFetch(`/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}`, {
		method: "PATCH",
		body: JSON.stringify({ state }),
	});
	return res.json() as Promise<{ number: number; state: string; title: string; htmlUrl: string }>;
}

export async function getPullRequestReviews(
	owner: string,
	repo: string,
	prNumber: number,
): Promise<PullRequestReview[]> {
	const res = await apiFetch(`/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${prNumber}/reviews`);
	const data = await res.json() as { reviews: PullRequestReview[] };
	return data.reviews;
}

export async function getCommitChecks(
	owner: string,
	repo: string,
	sha: string,
): Promise<CheckRun[]> {
	const res = await apiFetch(`/github/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/commits/${sha}/checks`);
	const data = await res.json() as { checks: CheckRun[] };
	return data.checks;
}
