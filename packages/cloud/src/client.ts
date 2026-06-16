/**
 * SquidoCloudClient — fetch wrapper for the Squido Cloud API.
 *
 * Handles authentication, retries, timeouts, and error handling.
 * Designed to be injected with a fetch function for testability.
 */

export interface CloudClientOptions {
	baseUrl: string;
	fetch?: typeof globalThis.fetch;
	getToken?: () => string | null;
	onTokenExpired?: () => void;
	timeoutMs?: number;
	maxRetries?: number;
}

export interface ApiError {
	status: number;
	code: string;
	message: string;
}

export class ApiRequestError extends Error {
	status: number;
	code: string;

	constructor(status: number, code: string, message: string) {
		super(message);
		this.name = "ApiRequestError";
		this.status = status;
		this.code = code;
	}
}

export class SquidoCloudClient {
	baseUrl: string;
	fetchFn: typeof globalThis.fetch;
	getToken: () => string | null;
	onTokenExpired: () => void;
	timeoutMs: number;
	maxRetries: number;

	constructor(options: CloudClientOptions) {
		this.baseUrl = options.baseUrl.replace(/\/+$/, "");
		this.fetchFn = options.fetch ?? globalThis.fetch;
		this.getToken = options.getToken ?? (() => null);
		this.onTokenExpired = options.onTokenExpired ?? (() => {});
		this.timeoutMs = options.timeoutMs ?? 15_000;
		this.maxRetries = options.maxRetries ?? 2;
	}

	// ── Auth ──────────────────────────────────────────────────────

	async startGitHubOAuth(): Promise<{
		deviceCode: string;
		verificationUri: string;
		userCode: string;
		interval: number;
	}> {
		return this.request("POST", "/v1/auth/github/start");
	}

	async pollGitHubOAuth(
		deviceCode: string,
	): Promise<{ token: string; user: { id: string; email: string; login: string } }> {
		const response = await this.request<Record<string, unknown>>("POST", "/v1/auth/github/callback", { deviceCode });
		// API returns { status: "pending" } when user hasn't authorized yet
		if (response.status === "pending") {
			throw new ApiRequestError(202, "authorization_pending", "authorization_pending");
		}
		return response as unknown as { token: string; user: { id: string; email: string; login: string } };
	}

	async getMe(): Promise<{ id: string; email: string; githubLogin: string; tier: string }> {
		return this.request("GET", "/v1/auth/me");
	}

	// ── Sessions ───────────────────────────────────────────────────

	async listSessions(options?: { limit?: number; offset?: number; search?: string }): Promise<{
		sessions: Array<{
			id: string;
			name: string | null;
			messageCount: number;
			modelUsed: string | null;
			providerUsed: string | null;
			createdAt: string;
			modifiedAt: string;
			firstMessagePreview: string | null;
		}>;
		total: number;
	}> {
		const params = new URLSearchParams();
		if (options?.limit) params.set("limit", String(options.limit));
		if (options?.offset) params.set("offset", String(options.offset));
		if (options?.search) params.set("search", options.search);
		const qs = params.toString();
		return this.request("GET", `/v1/sessions${qs ? `?${qs}` : ""}`);
	}

	async getSession(id: string): Promise<{
		id: string;
		name: string | null;
		entries: Array<{
			id: string;
			entryType: string;
			parentId: string | null;
			timestamp: string;
			payload: unknown;
		}>;
	}> {
		return this.request("GET", `/v1/sessions/${encodeURIComponent(id)}`);
	}

	async syncEntries(
		sessionId: string,
		entries: Array<{
			id: string;
			entryType: string;
			parentId: string | null;
			timestamp: string;
			payload: Record<string, unknown>;
		}>,
	): Promise<{ syncedCount: number }> {
		return this.request("POST", `/v1/sessions/${encodeURIComponent(sessionId)}/entries`, { entries });
	}

	async deleteSession(id: string): Promise<void> {
		await this.request("DELETE", `/v1/sessions/${encodeURIComponent(id)}`);
	}

	async patchSession(id: string, patch: { name?: string }): Promise<void> {
		await this.request("PATCH", `/v1/sessions/${encodeURIComponent(id)}`, patch);
	}

	// ── Search ─────────────────────────────────────────────────────

	async search(query: string): Promise<{
		results: Array<{ sessionId: string; entryId: string; snippet: string; score: number }>;
	}> {
		return this.request("GET", `/v1/search?q=${encodeURIComponent(query)}`);
	}

	// ── Sharing ────────────────────────────────────────────────────

	async createShareLink(sessionId: string, expiresInDays?: number): Promise<{ url: string; token: string }> {
		return this.request("POST", `/v1/sessions/${encodeURIComponent(sessionId)}/share`, {
			expiresInDays,
		});
	}

	async revokeShareLink(sessionId: string, shareId: string): Promise<void> {
		await this.request(
			"DELETE",
			`/v1/sessions/${encodeURIComponent(sessionId)}/share/${encodeURIComponent(shareId)}`,
		);
	}

	// ── Account / Billing ──────────────────────────────────────────

	async getAccount(): Promise<{
		id: string;
		email: string;
		githubLogin: string;
		tier: string;
		usage: { sessionCount: number; storageBytes: number };
	}> {
		return this.request("GET", "/v1/account");
	}

	async getBillingPortalUrl(): Promise<{ url: string }> {
		return this.request("GET", "/v1/account/billing");
	}

	// ── Internal ───────────────────────────────────────────────────

	private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
		let lastError: Error | null = null;

		for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
			try {
				return await this.tryRequest(method, path, body);
			} catch (err) {
				lastError = err instanceof Error ? err : new Error(String(err));

				// Don't retry client errors (4xx) except 429 (rate limit)
				if (err instanceof ApiRequestError && err.status < 500 && err.status !== 429) {
					throw err;
				}

				if (attempt < this.maxRetries) {
					// Exponential backoff: 1s, 2s
					await sleep((attempt + 1) * 1000);
				}
			}
		}

		throw lastError ?? new Error("Request failed");
	}

	private async tryRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

		try {
			const headers: Record<string, string> = {
				"Content-Type": "application/json",
			};

			const token = this.getToken();
			if (token) {
				headers.Authorization = `Bearer ${token}`;
			}

			const response = await this.fetchFn(`${this.baseUrl}${path}`, {
				method,
				headers,
				body: body !== undefined ? JSON.stringify(body) : undefined,
				signal: controller.signal,
			});

			if (response.status === 401) {
				this.onTokenExpired();
				throw new ApiRequestError(401, "token_expired", "Authentication token expired");
			}

			if (!response.ok) {
				let errorBody: ApiError | null = null;
				try {
					errorBody = (await response.json()) as ApiError;
				} catch {
					// ignore parse errors in error responses
				}
				throw new ApiRequestError(
					response.status,
					errorBody?.code ?? "unknown",
					errorBody?.message ?? response.statusText,
				);
			}

			// 204 No Content
			if (response.status === 204) {
				return undefined as T;
			}

			return (await response.json()) as T;
		} finally {
			clearTimeout(timeoutId);
		}
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
