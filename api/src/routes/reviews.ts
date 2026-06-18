import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authMiddleware } from "../middleware/auth.ts";
import type { AuthUser } from "../middleware/auth.ts";
import type { Env } from "../index.ts";

const reviewRoutes = new Hono<{ Bindings: Env }>();

// All review routes require auth
reviewRoutes.use("*", authMiddleware);

// ── Review Agents CRUD ─────────────────────────────────────────────

// GET /agents — list user's review agents
reviewRoutes.get("/agents", async (c) => {
	const authUser = c.var.user as AuthUser;

	const results = await c.env.DB.prepare(
		"SELECT id, name, repository, model, provider, enabled, config_path, created_at, updated_at FROM review_agents WHERE user_id = ?1 ORDER BY created_at DESC",
	)
		.bind(authUser.userId)
		.all<{
			id: string;
			name: string;
			repository: string;
			model: string;
			provider: string;
			enabled: number;
			config_path: string | null;
			created_at: string;
			updated_at: string;
		}>();

	return c.json({
		agents: (results.results ?? []).map((r) => ({
			id: r.id,
			name: r.name,
			repository: r.repository,
			model: r.model,
			provider: r.provider,
			enabled: r.enabled === 1,
			configPath: r.config_path,
			createdAt: r.created_at,
			updatedAt: r.updated_at,
		})),
	});
});

// POST /agents — create a review agent
reviewRoutes.post("/agents", async (c) => {
	const authUser = c.var.user as AuthUser;
	const body = await c.req.json<{
		name: string;
		repository: string;
		model?: string;
		provider?: string;
		configPath?: string;
	}>();

	if (!body.name?.trim()) {
		throw new HTTPException(400, { message: "Agent name is required" });
	}
	if (!body.repository?.trim()) {
		throw new HTTPException(400, { message: "Repository is required" });
	}

	const id = crypto.randomUUID();
	const model = body.model ?? "deepseek-v4-flash";
	const provider = body.provider ?? "opencode-go";

	await c.env.DB.prepare(
		`INSERT INTO review_agents (id, user_id, name, repository, model, provider, enabled, config_path)
		 VALUES (?1, ?2, ?3, ?4, ?5, ?6, 1, ?7)`,
	)
		.bind(id, authUser.userId, body.name.trim(), body.repository.trim(), model, provider, body.configPath ?? null)
		.run();

	return c.json({
		id,
		name: body.name.trim(),
		repository: body.repository.trim(),
		model,
		provider,
		enabled: true,
		configPath: body.configPath ?? null,
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
	}, 201);
});

// GET /agents/:id — get a single review agent
reviewRoutes.get("/agents/:id", async (c) => {
	const authUser = c.var.user as AuthUser;
	const agentId = c.req.param("id");

	const row = await c.env.DB.prepare(
		"SELECT id, name, repository, model, provider, enabled, config_path, created_at, updated_at FROM review_agents WHERE id = ?1 AND user_id = ?2",
	)
		.bind(agentId, authUser.userId)
		.first<{
			id: string;
			name: string;
			repository: string;
			model: string;
			provider: string;
			enabled: number;
			config_path: string | null;
			created_at: string;
			updated_at: string;
		}>();

	if (!row) {
		throw new HTTPException(404, { message: "Review agent not found" });
	}

	return c.json({
		id: row.id,
		name: row.name,
		repository: row.repository,
		model: row.model,
		provider: row.provider,
		enabled: row.enabled === 1,
		configPath: row.config_path,
		createdAt: row.created_at,
		updatedAt: row.updated_at,
	});
});

// DELETE /agents/:id — delete a review agent
reviewRoutes.delete("/agents/:id", async (c) => {
	const authUser = c.var.user as AuthUser;
	const agentId = c.req.param("id");

	const result = await c.env.DB.prepare(
		"DELETE FROM review_agents WHERE id = ?1 AND user_id = ?2",
	)
		.bind(agentId, authUser.userId)
		.run();

	if (!result.success) {
		throw new HTTPException(500, { message: "Failed to delete agent" });
	}

	return c.json({ deleted: true });
});

// PATCH /agents/:id — update agent config
reviewRoutes.patch("/agents/:id", async (c) => {
	const authUser = c.var.user as AuthUser;
	const agentId = c.req.param("id");
	const body = await c.req.json<{
		name?: string;
		model?: string;
		provider?: string;
		enabled?: boolean;
		configPath?: string;
	}>();

	const sets: string[] = [];
	const binds: unknown[] = [];

	if (body.name !== undefined) {
		sets.push("name = ?");
		binds.push(body.name.trim());
	}
	if (body.model !== undefined) {
		sets.push("model = ?");
		binds.push(body.model);
	}
	if (body.provider !== undefined) {
		sets.push("provider = ?");
		binds.push(body.provider);
	}
	if (body.enabled !== undefined) {
		sets.push("enabled = ?");
		binds.push(body.enabled ? 1 : 0);
	}
	if (body.configPath !== undefined) {
		sets.push("config_path = ?");
		binds.push(body.configPath);
	}

	if (sets.length === 0) {
		throw new HTTPException(400, { message: "No fields to update" });
	}

	sets.push("updated_at = datetime('now')");
	binds.push(agentId, authUser.userId);

	await c.env.DB.prepare(
		`UPDATE review_agents SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
	)
		.bind(...binds)
		.run();

	return c.json({ updated: true });
});

// ── Review Runs ────────────────────────────────────────────────────

// GET /agents/:id/runs — list review runs for an agent
reviewRoutes.get("/agents/:id/runs", async (c) => {
	const authUser = c.var.user as AuthUser;
	const agentId = c.req.param("id");

	const results = await c.env.DB.prepare(
		`SELECT id, agent_id, repository, pr_number, status, summary, finding_count, tokens_used, error_message, started_at, completed_at
		 FROM review_runs WHERE agent_id = ?1 AND user_id = ?2 ORDER BY started_at DESC LIMIT 50`,
	)
		.bind(agentId, authUser.userId)
		.all<{
			id: string;
			agent_id: string;
			repository: string;
			pr_number: number;
			status: string;
			summary: string | null;
			finding_count: number;
			tokens_used: number;
			error_message: string | null;
			started_at: string;
			completed_at: string | null;
		}>();

	return c.json({
		runs: (results.results ?? []).map((r) => ({
			id: r.id,
			agentId: r.agent_id,
			repository: r.repository,
			prNumber: r.pr_number,
			status: r.status,
			summary: r.summary,
			findingCount: r.finding_count,
			tokensUsed: r.tokens_used,
			errorMessage: r.error_message,
			startedAt: r.started_at,
			completedAt: r.completed_at,
		})),
	});
});

// POST /runs — create a review run record
reviewRoutes.post("/runs", async (c) => {
	const authUser = c.var.user as AuthUser;
	const body = await c.req.json<{
		agentId: string;
		repository: string;
		prNumber: number;
	}>();

	if (!body.agentId || !body.repository || !body.prNumber) {
		throw new HTTPException(400, { message: "agentId, repository, and prNumber are required" });
	}

	const id = crypto.randomUUID();

	await c.env.DB.prepare(
		`INSERT INTO review_runs (id, agent_id, user_id, repository, pr_number, status)
		 VALUES (?1, ?2, ?3, ?4, ?5, 'running')`,
	)
		.bind(id, body.agentId, authUser.userId, body.repository, body.prNumber)
		.run();

	return c.json({
		id,
		agentId: body.agentId,
		repository: body.repository,
		prNumber: body.prNumber,
		status: "running",
		startedAt: new Date().toISOString(),
	}, 201);
});

// PATCH /runs/:id — update a review run
reviewRoutes.patch("/runs/:id", async (c) => {
	const authUser = c.var.user as AuthUser;
	const runId = c.req.param("id");
	const body = await c.req.json<{
		status?: string;
		summary?: string;
		findingCount?: number;
		tokensUsed?: number;
		errorMessage?: string;
	}>();

	const sets: string[] = [];
	const binds: unknown[] = [];

	if (body.status !== undefined) {
		sets.push("status = ?");
		binds.push(body.status);
	}
	if (body.summary !== undefined) {
		sets.push("summary = ?");
		binds.push(body.summary);
	}
	if (body.findingCount !== undefined) {
		sets.push("finding_count = ?");
		binds.push(body.findingCount);
	}
	if (body.tokensUsed !== undefined) {
		sets.push("tokens_used = ?");
		binds.push(body.tokensUsed);
	}
	if (body.errorMessage !== undefined) {
		sets.push("error_message = ?");
		binds.push(body.errorMessage);
	}
	if (body.status === "completed" || body.status === "failed") {
		sets.push("completed_at = datetime('now')");
	}

	if (sets.length === 0) {
		throw new HTTPException(400, { message: "No fields to update" });
	}

	binds.push(runId, authUser.userId);

	await c.env.DB.prepare(
		`UPDATE review_runs SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`,
	)
		.bind(...binds)
		.run();

	return c.json({ updated: true });
});

export default reviewRoutes;
