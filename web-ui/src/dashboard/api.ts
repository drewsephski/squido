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
