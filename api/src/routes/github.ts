import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authMiddleware } from "../middleware/auth.ts";
import { decryptToken } from "../utils/crypto.ts";
import type { AuthUser } from "../middleware/auth.ts";
import type { Env } from "../index.ts";

const githubRoutes = new Hono<{ Bindings: Env }>();

// All GitHub proxy routes require auth
githubRoutes.use("*", authMiddleware);

// ── GET /token — return decrypted GitHub access token ──────────────

githubRoutes.get("/token", async (c) => {
	const authUser = c.var.user as AuthUser;

	const row = await c.env.DB.prepare(
		"SELECT github_access_token_encrypted FROM users WHERE id = ?1",
	)
		.bind(authUser.userId)
		.first<{ github_access_token_encrypted: string | null }>();

	if (!row?.github_access_token_encrypted) {
		throw new HTTPException(404, { message: "No GitHub token stored. Please re-authenticate." });
	}

	try {
		const token = await decryptToken(row.github_access_token_encrypted, c.env);
		return c.json({ token });
	} catch (err) {
		console.error("Failed to decrypt GitHub token:", err);
		throw new HTTPException(500, { message: "Failed to decrypt stored token" });
	}
});

// ── GET /repos — list user's public repositories ───────────────────

githubRoutes.get("/repos", async (c) => {
	const authUser = c.var.user as AuthUser;

	const token = await getGitHubToken(c.env, authUser.userId);
	if (!token) {
		throw new HTTPException(404, { message: "No GitHub token stored. Please re-authenticate." });
	}

	const res = await fetch("https://api.github.com/user/repos?sort=updated&per_page=100&visibility=public", {
		headers: {
			Authorization: `Bearer ${token}`,
			"User-Agent": "squido-cloud",
			Accept: "application/json",
		},
	});

	if (!res.ok) {
		const err = await res.json().catch(() => null);
		throw new HTTPException(res.status as 400, { message: (err as { message?: string })?.message ?? "GitHub API error" });
	}

	const repos = (await res.json()) as Array<{
		id: number;
		full_name: string;
		name: string;
		owner: { login: string };
		private: boolean;
		default_branch: string;
		updated_at: string;
		html_url: string;
	}>;

	return c.json({
		repos: repos.map((r) => ({
			id: r.id,
			fullName: r.full_name,
			name: r.name,
			owner: r.owner.login,
			private: r.private,
			defaultBranch: r.default_branch,
			updatedAt: r.updated_at,
			htmlUrl: r.html_url,
		})),
	});
});

// ── GET /repos/:owner/:repo/pulls — list open PRs ──────────────────

githubRoutes.get("/repos/:owner/:repo/pulls", async (c) => {
	const authUser = c.var.user as AuthUser;
	const owner = c.req.param("owner");
	const repo = c.req.param("repo");

	const token = await getGitHubToken(c.env, authUser.userId);
	if (!token) {
		throw new HTTPException(404, { message: "No GitHub token stored. Please re-authenticate." });
	}

	const res = await fetch(
		`https://api.github.com/repos/${owner}/${repo}/pulls?state=open&sort=updated&per_page=50`,
		{
			headers: {
				Authorization: `Bearer ${token}`,
				"User-Agent": "squido-cloud",
				Accept: "application/json",
			},
		},
	);

	if (!res.ok) {
		const err = await res.json().catch(() => null);
		throw new HTTPException(res.status as 400, { message: (err as { message?: string })?.message ?? "GitHub API error" });
	}

	const prs = (await res.json()) as Array<{
		id: number;
		number: number;
		title: string;
		state: string;
		head: { sha: string; ref: string };
		base: { ref: string };
		user: { login: string };
		updated_at: string;
		html_url: string;
		draft: boolean;
	}>;

	return c.json({
		pulls: prs.map((p) => ({
			id: p.id,
			number: p.number,
			title: p.title,
			state: p.state,
			headSha: p.head.sha,
			headRef: p.head.ref,
			baseRef: p.base.ref,
			author: p.user.login,
			updatedAt: p.updated_at,
			htmlUrl: p.html_url,
			draft: p.draft,
		})),
	});
});

// ── GET /repos/:owner/:repo/pulls/:number — PR detail ─────────────

githubRoutes.get("/repos/:owner/:repo/pulls/:number", async (c) => {
	const authUser = c.var.user as AuthUser;
	const owner = c.req.param("owner");
	const repo = c.req.param("repo");
	const prNumber = Number.parseInt(c.req.param("number"), 10);

	const token = await getGitHubToken(c.env, authUser.userId);
	if (!token) {
		throw new HTTPException(404, { message: "No GitHub token stored. Please re-authenticate." });
	}

	const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
		headers: {
			Authorization: `Bearer ${token}`,
			"User-Agent": "squido-cloud",
			Accept: "application/json",
		},
	});

	if (!res.ok) {
		const err = await res.json().catch(() => null);
		throw new HTTPException(res.status as 400, { message: (err as { message?: string })?.message ?? "GitHub API error" });
	}

	const pr = (await res.json()) as {
		id: number;
		number: number;
		title: string;
		body: string | null;
		state: string;
		draft: boolean;
		merged: boolean;
		mergeable: boolean | null;
		mergeable_state: string;
		head: { sha: string; ref: string; label: string };
		base: { sha: string; ref: string; label: string };
		user: { login: string; avatar_url: string };
		updated_at: string;
		created_at: string;
		html_url: string;
		comments: number;
		commits: number;
		additions: number;
		deletions: number;
		changed_files: number;
	};

	return c.json({
		number: pr.number,
		title: pr.title,
		body: pr.body,
		state: pr.state,
		draft: pr.draft,
		merged: pr.merged,
		mergeable: pr.mergeable,
		mergeableState: pr.mergeable_state,
		headSha: pr.head.sha,
		headRef: pr.head.ref,
		headLabel: pr.head.label,
		baseRef: pr.base.ref,
		baseLabel: pr.base.label,
		author: pr.user.login,
		authorAvatar: pr.user.avatar_url,
		updatedAt: pr.updated_at,
		createdAt: pr.created_at,
		htmlUrl: pr.html_url,
		commentCount: pr.comments,
		commitCount: pr.commits,
		additions: pr.additions,
		deletions: pr.deletions,
		changedFiles: pr.changed_files,
	});
});

// ── PUT /repos/:owner/:repo/pulls/:number/merge — merge a PR ───────

githubRoutes.put("/repos/:owner/:repo/pulls/:number/merge", async (c) => {
	const authUser = c.var.user as AuthUser;
	const owner = c.req.param("owner");
	const repo = c.req.param("repo");
	const prNumber = Number.parseInt(c.req.param("number"), 10);
	const body = await c.req.json<{ commitTitle?: string; commitMessage?: string; mergeMethod?: "merge" | "squash" | "rebase" }>().catch(
		() => ({}) as { commitTitle?: string; commitMessage?: string; mergeMethod?: "merge" | "squash" | "rebase" },
	);

	const token = await getGitHubToken(c.env, authUser.userId);
	if (!token) {
		throw new HTTPException(404, { message: "No GitHub token stored. Please re-authenticate." });
	}

	const ghBody: Record<string, unknown> = {};
	if (body.commitTitle) ghBody.commit_title = body.commitTitle;
	if (body.commitMessage) ghBody.commit_message = body.commitMessage;
	ghBody.merge_method = body.mergeMethod ?? "squash";

	const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/merge`, {
		method: "PUT",
		headers: {
			Authorization: `Bearer ${token}`,
			"User-Agent": "squido-cloud",
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify(ghBody),
	});

	const data = await res.json().catch(() => null);

	if (!res.ok) {
		throw new HTTPException(res.status as 400, {
			message: (data as { message?: string })?.message ?? "Failed to merge PR",
		});
	}

	return c.json({
		merged: (data as { merged?: boolean })?.merged ?? true,
		message: (data as { message?: string })?.message ?? "Pull request merged",
		sha: (data as { sha?: string })?.sha,
	});
});

// ── PATCH /repos/:owner/:repo/pulls/:number — close/reopen a PR ────

githubRoutes.patch("/repos/:owner/:repo/pulls/:number", async (c) => {
	const authUser = c.var.user as AuthUser;
	const owner = c.req.param("owner");
	const repo = c.req.param("repo");
	const prNumber = Number.parseInt(c.req.param("number"), 10);
	const body = await c.req.json<{ state: "open" | "closed" }>();

	if (body.state !== "open" && body.state !== "closed") {
		throw new HTTPException(400, { message: "state must be 'open' or 'closed'" });
	}

	const token = await getGitHubToken(c.env, authUser.userId);
	if (!token) {
		throw new HTTPException(404, { message: "No GitHub token stored. Please re-authenticate." });
	}

	const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}`, {
		method: "PATCH",
		headers: {
			Authorization: `Bearer ${token}`,
			"User-Agent": "squido-cloud",
			Accept: "application/json",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ state: body.state }),
	});

	if (!res.ok) {
		const err = await res.json().catch(() => null);
		throw new HTTPException(res.status as 400, { message: (err as { message?: string })?.message ?? "GitHub API error" });
	}

	const pr = (await res.json()) as {
		number: number;
		state: string;
		title: string;
		html_url: string;
	};

	return c.json({
		number: pr.number,
		state: pr.state,
		title: pr.title,
		htmlUrl: pr.html_url,
	});
});

// ── GET /repos/:owner/:repo/pulls/:number/reviews — list reviews ───

githubRoutes.get("/repos/:owner/:repo/pulls/:number/reviews", async (c) => {
	const authUser = c.var.user as AuthUser;
	const owner = c.req.param("owner");
	const repo = c.req.param("repo");
	const prNumber = Number.parseInt(c.req.param("number"), 10);

	const token = await getGitHubToken(c.env, authUser.userId);
	if (!token) {
		throw new HTTPException(404, { message: "No GitHub token stored. Please re-authenticate." });
	}

	const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls/${prNumber}/reviews`, {
		headers: {
			Authorization: `Bearer ${token}`,
			"User-Agent": "squido-cloud",
			Accept: "application/json",
		},
	});

	if (!res.ok) {
		const err = await res.json().catch(() => null);
		throw new HTTPException(res.status as 400, { message: (err as { message?: string })?.message ?? "GitHub API error" });
	}

	const reviews = (await res.json()) as Array<{
		id: number;
		user: { login: string; avatar_url: string };
		body: string | null;
		state: string;
		submitted_at: string;
		html_url: string;
	}>;

	return c.json({
		reviews: reviews.map((r) => ({
			id: r.id,
			user: r.user.login,
			avatar: r.user.avatar_url,
			body: r.body,
			state: r.state,
			submittedAt: r.submitted_at,
			htmlUrl: r.html_url,
		})),
	});
});

// ── GET /repos/:owner/:repo/commits/:sha/check-runs — CI checks ─────

githubRoutes.get("/repos/:owner/:repo/commits/:sha/checks", async (c) => {
	const authUser = c.var.user as AuthUser;
	const owner = c.req.param("owner");
	const repo = c.req.param("repo");
	const sha = c.req.param("sha");

	const token = await getGitHubToken(c.env, authUser.userId);
	if (!token) {
		throw new HTTPException(404, { message: "No GitHub token stored. Please re-authenticate." });
	}

	// Check runs (GitHub Actions, third-party CI)
	const [checkRunsRes, statusesRes] = await Promise.all([
		fetch(`https://api.github.com/repos/${owner}/${repo}/commits/${sha}/check-runs?per_page=100`, {
			headers: {
				Authorization: `Bearer ${token}`,
				"User-Agent": "squido-cloud",
				Accept: "application/vnd.github+json",
			},
		}),
		fetch(`https://api.github.com/repos/${owner}/${repo}/statuses/${sha}`, {
			headers: {
				Authorization: `Bearer ${token}`,
				"User-Agent": "squido-cloud",
				Accept: "application/json",
			},
		}),
	]);

	const checks: Array<{
		name: string;
		status: string;
		conclusion: string | null;
		htmlUrl: string;
		app: { name: string } | null;
	}> = [];

	if (checkRunsRes.ok) {
		const checkRunsData = (await checkRunsRes.json()) as {
			check_runs: Array<{
				name: string;
				status: string;
				conclusion: string | null;
				html_url: string;
				app: { name: string } | null;
			}>;
		};
		for (const cr of checkRunsData.check_runs ?? []) {
			checks.push({
				name: cr.name,
				status: cr.status,
				conclusion: cr.conclusion,
				htmlUrl: cr.html_url,
				app: cr.app,
			});
		}
	}

	if (statusesRes.ok) {
		const statuses = (await statusesRes.json()) as Array<{
			context: string;
			state: string;
			target_url: string | null;
		}>;
		for (const s of statuses) {
			checks.push({
				name: s.context,
				status: s.state === "pending" ? "in_progress" : "completed",
				conclusion: s.state === "success" ? "success" : s.state === "failure" ? "failure" : s.state === "error" ? "failure" : null,
				htmlUrl: s.target_url ?? "",
				app: null,
			});
		}
	}

	return c.json({ checks });
});

// ── Helper: fetch and decrypt GitHub token ─────────────────────────

async function getGitHubToken(env: Env, userId: string): Promise<string | null> {
	const row = await env.DB.prepare(
		"SELECT github_access_token_encrypted FROM users WHERE id = ?1",
	)
		.bind(userId)
		.first<{ github_access_token_encrypted: string | null }>();

	if (!row?.github_access_token_encrypted) return null;

	try {
		return await decryptToken(row.github_access_token_encrypted, env);
	} catch {
		return null;
	}
}

export default githubRoutes;
