import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { secureHeaders } from "hono/secure-headers";
import { authMiddleware } from "./middleware/auth.ts";
import authRoutes from "./routes/auth.ts";
import sessionRoutes from "./routes/sessions.ts";
import searchRoutes from "./routes/search.ts";
import sharingRoutes, { publicShareRoutes } from "./routes/sharing.ts";
import accountRoutes from "./routes/account.ts";
import githubRoutes from "./routes/github.ts";
import reviewRoutes from "./routes/reviews.ts";

export interface Env {
	DB: D1Database;
	SESSIONS_BUCKET: R2Bucket;
	JWT_SECRET: string;
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	GITHUB_TOKEN_ENCRYPTION_KEY: string;
	STRIPE_SECRET_KEY: string;
	STRIPE_WEBHOOK_SECRET: string;
	DASHBOARD_URL: string;
	API_URL: string;
}

const app = new Hono<{ Bindings: Env }>();

// Global middleware
app.use(
	"*",
	cors({
		origin: [
			"https://app.squidagent.app",
			"https://squidagent.app",
			"http://localhost:5173",
			"http://localhost:9876",
			"http://127.0.0.1:9876",
		],
	}),
);
app.use("*", logger());
app.use("*", secureHeaders());

// Health check
app.get("/v1/health", (c) => {
	return c.json({
		status: "ok",
		version: "0.1.0",
		timestamp: new Date().toISOString(),
	});
});

// Auth routes — NO auth middleware
app.route("/v1/auth", authRoutes);

// Apply auth middleware to protected routes
app.use("/v1/sessions/*", authMiddleware);
app.use("/v1/search", authMiddleware);
app.use("/v1/search/*", authMiddleware);
app.use("/v1/account/*", authMiddleware);
app.use("/v1/github/*", authMiddleware);
app.use("/v1/review/*", authMiddleware);

// Mount protected routes
app.route("/v1/sessions", sessionRoutes);
app.route("/v1/search", searchRoutes);
app.route("/v1/sharing", sharingRoutes);
app.route("/v1/account", accountRoutes);
app.route("/v1/github", githubRoutes);
app.route("/v1/review", reviewRoutes);

// Public share routes — NO auth middleware
app.route("/v1/share", publicShareRoutes);

// 404 handler
app.notFound((c) => {
	return c.json({ code: "not_found", message: "Route not found" }, 404);
});

// Error handler
app.onError((err, c) => {
	console.error("Unhandled error:", err);
	return c.json({ code: "internal_error", message: "Internal server error" }, 500);
});

export default app;
