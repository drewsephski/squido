import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authMiddleware } from "../middleware/auth.ts";
import type { Env } from "../index.ts";

const searchRoutes = new Hono<{ Bindings: Env }>();

searchRoutes.use("*", authMiddleware);

// GET / — full-text search on entries for the authenticated user
searchRoutes.get("/", async (c) => {
	const user = c.var.user;
	const q = c.req.query("q");
	const limit = Math.min(Number(c.req.query("limit")) || 20, 100);
	const offset = Number(c.req.query("offset")) || 0;

	if (!q) {
		throw new HTTPException(400, { message: "Query parameter 'q' is required" });
	}

	// Sanitize query for FTS5: strip FTS5 special characters to prevent syntax injection
	// Allow letters, numbers, spaces, hyphens, quotes, and asterisks
	const sanitized = q.replace(/[^\w\s"*'-]/g, " ").trim();
	if (!sanitized) {
		throw new HTTPException(400, { message: "Invalid search query" });
	}

	// Build FTS5 prefix query
	const words = sanitized.split(/\s+/).filter(Boolean);
	const ftsQuery = words.map((w) => `"${w}"*`).join(" AND ");

	// Search entries_fts, joined through entries -> sessions, filtered by user
	const rows = await c.env.DB.prepare(
		`SELECT
		   s.id,
		   s.name,
		   s.user_id,
		   s.model_used,
		   s.message_count,
		   s.total_turns,
		   s.created_at,
		   s.updated_at,
		   snippet(entries_fts, 0, '<mark>', '</mark>', '...', 64) as snippet,
		   rank
		 FROM entries_fts
		 JOIN entries e ON entries_fts.rowid = e.rowid
		 JOIN sessions s ON e.session_id = s.id
		 WHERE entries_fts MATCH ?1 AND s.user_id = ?2
		 ORDER BY rank
		 LIMIT ?3 OFFSET ?4`,
	)
		.bind(ftsQuery, user.userId, limit, offset)
		.all<{
			id: string;
			name: string;
			user_id: string;
			model_used: string | null;
			message_count: number;
			total_turns: number;
			created_at: string;
			updated_at: string;
			snippet: string;
			rank: number;
		}>();

	return c.json({
		results: rows.results.map((r) => ({
			id: r.id,
			name: r.name,
			model_used: r.model_used,
			message_count: r.message_count,
			total_turns: r.total_turns,
			created_at: r.created_at,
			updated_at: r.updated_at,
			snippet: r.snippet,
		})),
		limit,
		offset,
		query: q,
	});
});

export default searchRoutes;
