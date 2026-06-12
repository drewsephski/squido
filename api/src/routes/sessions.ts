import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authMiddleware } from "../middleware/auth.ts";
import type { Env } from "../index.ts";

const sessionRoutes = new Hono<{ Bindings: Env }>();

sessionRoutes.use("*", authMiddleware);

// GET / — list user sessions
sessionRoutes.get("/", async (c) => {
	const user = c.var.user;
	const search = c.req.query("q") ?? "";
	const limit = Math.min(Number(c.req.query("limit")) || 20, 100);
	const offset = Number(c.req.query("offset")) || 0;

	let query = "SELECT * FROM sessions WHERE user_id = ?1";
	const binds: unknown[] = [user.userId];

	if (search) {
		query += " AND name LIKE ?2";
		binds.push(`%${search}%`);
	}

	query += " ORDER BY created_at DESC LIMIT ?3 OFFSET ?4";
	binds.push(limit, offset);

	const sessions = await c.env.DB.prepare(query).bind(...binds).all();

	return c.json({ sessions: sessions.results, limit, offset });
});

// POST / — create session
sessionRoutes.post("/", async (c) => {
	const user = c.var.user;
	const body = (await c.req.json()) as {
		id: string;
		name?: string;
		model_used?: string;
		system_prompt?: string;
	};

	const sessionId = body.id;
	const name = body.name ?? "Untitled Session";
	const modelUsed = body.model_used ?? null;
	const systemPrompt = body.system_prompt ?? null;

	await c.env.DB.prepare(
		`INSERT INTO sessions (id, user_id, name, model_used, system_prompt)
     VALUES (?1, ?2, ?3, ?4, ?5)`,
	)
		.bind(sessionId, user.userId, name, modelUsed, systemPrompt)
		.run();

	const session = await c.env.DB.prepare(
		"SELECT * FROM sessions WHERE id = ?1",
	)
		.bind(sessionId)
		.first();

	return c.json({ session }, 201);
});

// GET /:id — get session detail + entries
sessionRoutes.get("/:id", async (c) => {
	const user = c.var.user;
	const sessionId = c.req.param("id");
	const entryLimit = Math.min(Number(c.req.query("entry_limit")) || 50, 200);
	const entryOffset = Number(c.req.query("entry_offset")) || 0;

	const session = await c.env.DB.prepare(
		"SELECT * FROM sessions WHERE id = ?1 AND user_id = ?2",
	)
		.bind(sessionId, user.userId)
		.first();

	if (!session) {
		throw new HTTPException(404, { message: "Session not found" });
	}

	const entries = await c.env.DB.prepare(
		"SELECT * FROM entries WHERE session_id = ?1 ORDER BY created_at ASC LIMIT ?2 OFFSET ?3",
	)
		.bind(sessionId, entryLimit, entryOffset)
		.all();

	return c.json({ session, entries: entries.results, entryLimit, entryOffset });
});

// PATCH /:id — update session name
sessionRoutes.patch("/:id", async (c) => {
	const user = c.var.user;
	const sessionId = c.req.param("id");
	const { name } = await c.req.json<{ name: string }>();

	const result = await c.env.DB.prepare(
		"UPDATE sessions SET name = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2 AND user_id = ?3",
	)
		.bind(name, sessionId, user.userId)
		.run();

	if (result.meta.changes === 0) {
		throw new HTTPException(404, { message: "Session not found" });
	}

	const session = await c.env.DB.prepare(
		"SELECT * FROM sessions WHERE id = ?1",
	)
		.bind(sessionId)
		.first();

	return c.json({ session });
});

// DELETE /:id — delete session + entries + R2 blob
sessionRoutes.delete("/:id", async (c) => {
	const user = c.var.user;
	const sessionId = c.req.param("id");

	const session = await c.env.DB.prepare(
		"SELECT id FROM sessions WHERE id = ?1 AND user_id = ?2",
	)
		.bind(sessionId, user.userId)
		.first<{ id: string }>();

	if (!session) {
		throw new HTTPException(404, { message: "Session not found" });
	}

	// Delete R2 blob if exists
	try {
		await c.env.SESSIONS_BUCKET.delete(`${user.userId}/${sessionId}`);
	} catch {
		// Blob may not exist — proceed
	}

	// Delete entries first, then session
	await c.env.DB.prepare("DELETE FROM entries WHERE session_id = ?1")
		.bind(sessionId)
		.run();

	await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?1")
		.bind(sessionId)
		.run();

	return c.json({ success: true });
});

// POST /:id/entries — batch sync entries
sessionRoutes.post("/:id/entries", async (c) => {
	const user = c.var.user;
	const sessionId = c.req.param("id");

	// Verify ownership
	const session = await c.env.DB.prepare(
		"SELECT id FROM sessions WHERE id = ?1 AND user_id = ?2",
	)
		.bind(sessionId, user.userId)
		.first<{ id: string }>();

	if (!session) {
		throw new HTTPException(404, { message: "Session not found" });
	}

	const { entries } = await c.req.json<{
		entries: Array<{
			id: string;
			role: string;
			content: string;
			entry_type?: string;
			model_used?: string;
			tokens_in?: number;
			tokens_out?: number;
		}>;
	}>();

	const BATCH_SIZE = 100;
	let syncedCount = 0;

	for (let i = 0; i < entries.length; i += BATCH_SIZE) {
		const batch = entries.slice(i, i + BATCH_SIZE);
		const stmts = batch.map((entry) =>
			c.env.DB.prepare(
				`INSERT OR IGNORE INTO entries (id, session_id, role, content, entry_type, model_used, tokens_in, tokens_out)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
			).bind(
				entry.id,
				sessionId,
				entry.role,
				entry.content,
				entry.entry_type ?? null,
				entry.model_used ?? null,
				entry.tokens_in ?? null,
				entry.tokens_out ?? null,
			),
		);
		syncedCount += stmts.length;
		await c.env.DB.batch(stmts);
	}

	// Update session aggregate stats
	const stats = await c.env.DB.prepare(
		`SELECT COUNT(*) as message_count, COALESCE(SUM(tokens_in + tokens_out), 0) as total_turns
     FROM entries WHERE session_id = ?1`,
	)
		.bind(sessionId)
		.first<{ message_count: number; total_turns: number }>();

	if (stats) {
		await c.env.DB.prepare(
			`UPDATE sessions SET message_count = ?1, total_turns = ?2, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?3`,
		)
			.bind(stats.message_count, stats.total_turns, sessionId)
			.run();
	}

	return c.json({ synced: syncedCount, message_count: stats?.message_count ?? 0 });
});

// GET /:id/entries — list entries
sessionRoutes.get("/:id/entries", async (c) => {
	const user = c.var.user;
	const sessionId = c.req.param("id");
	const limit = Math.min(Number(c.req.query("limit")) || 50, 200);
	const offset = Number(c.req.query("offset")) || 0;
	const entryType = c.req.query("entry_type");

	// Verify ownership
	const session = await c.env.DB.prepare(
		"SELECT id FROM sessions WHERE id = ?1 AND user_id = ?2",
	)
		.bind(sessionId, user.userId)
		.first<{ id: string }>();

	if (!session) {
		throw new HTTPException(404, { message: "Session not found" });
	}

	let query = "SELECT * FROM entries WHERE session_id = ?1";
	const binds: unknown[] = [sessionId];

	if (entryType) {
		query += " AND entry_type = ?2";
		binds.push(entryType);
	}

	query += " ORDER BY created_at ASC LIMIT ?3 OFFSET ?4";
	binds.push(limit, offset);

	const entries = await c.env.DB.prepare(query).bind(...binds).all();

	return c.json({ entries: entries.results, limit, offset });
});

export default sessionRoutes;
