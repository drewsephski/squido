import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authMiddleware } from "../middleware/auth.ts";
import type { Env } from "../index.ts";

function generateViewToken(): string {
	const bytes = new Uint8Array(32);
	crypto.getRandomValues(bytes);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

// Authenticated share management routes
const sharingRoutes = new Hono<{ Bindings: Env }>();

sharingRoutes.use("*", authMiddleware);

// POST /:sessionId — create share link
sharingRoutes.post("/:sessionId", async (c) => {
	const user = c.var.user;
	const sessionId = c.req.param("sessionId");
	const { expiresInDays } = await c.req.json<{ expiresInDays?: number }>();

	// Verify ownership
	const session = await c.env.DB.prepare(
		"SELECT id FROM sessions WHERE id = ?1 AND user_id = ?2",
	)
		.bind(sessionId, user.userId)
		.first<{ id: string }>();

	if (!session) {
		throw new HTTPException(404, { message: "Session not found" });
	}

	const viewToken = generateViewToken();
	const shareId = viewToken.slice(0, 12);
	const expiresAt = expiresInDays
		? Math.floor(Date.now() / 1000) + expiresInDays * 24 * 60 * 60
		: null;

	await c.env.DB.prepare(
		"INSERT INTO shares (id, session_id, user_id, view_token, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)",
	)
		.bind(shareId, sessionId, user.userId, viewToken, expiresAt)
		.run();

	const shareUrl = `${c.env.DASHBOARD_URL}/share/${viewToken}`;

	return c.json({ shareId, viewToken, shareUrl, expiresAt }, 201);
});

// DELETE /:sessionId/:shareId — revoke share link
sharingRoutes.delete("/:sessionId/:shareId", async (c) => {
	const user = c.var.user;
	const sessionId = c.req.param("sessionId");
	const shareId = c.req.param("shareId");

	const result = await c.env.DB.prepare(
		"DELETE FROM shares WHERE id = ?1 AND session_id = ?2 AND user_id = ?3",
	)
		.bind(shareId, sessionId, user.userId)
		.run();

	if (result.meta.changes === 0) {
		throw new HTTPException(404, { message: "Share link not found" });
	}

	return c.json({ success: true });
});

// Public share view routes (NO auth middleware)
const publicShareRoutes = new Hono<{ Bindings: Env }>();

// GET /:token — view a shared session
publicShareRoutes.get("/:token", async (c) => {
	const token = c.req.param("token");

	const share = await c.env.DB.prepare(
		"SELECT id, session_id, user_id, expires_at FROM shares WHERE view_token = ?1",
	)
		.bind(token)
		.first<{
			id: string;
			session_id: string;
			user_id: string;
			expires_at: number | null;
		}>();

	if (!share) {
		throw new HTTPException(404, { message: "Share link not found" });
	}

	if (share.expires_at && share.expires_at < Math.floor(Date.now() / 1000)) {
		throw new HTTPException(410, { message: "Share link has expired" });
	}

	const session = await c.env.DB.prepare(
		"SELECT id, name, model_used, message_count, total_turns, created_at FROM sessions WHERE id = ?1",
	)
		.bind(share.session_id)
		.first<{
			id: string;
			name: string;
			model_used: string | null;
			message_count: number;
			total_turns: number;
			created_at: string;
		}>();

	if (!session) {
		throw new HTTPException(404, { message: "Shared session not found" });
	}

	const entries = await c.env.DB.prepare(
		"SELECT id, role, content, entry_type, model_used, tokens_in, tokens_out, created_at FROM entries WHERE session_id = ?1 ORDER BY created_at ASC",
	)
		.bind(share.session_id)
		.all();

	return c.json({ session, entries: entries.results });
});

export { publicShareRoutes };
export default sharingRoutes;
