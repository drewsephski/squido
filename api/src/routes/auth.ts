import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authMiddleware, createToken } from "../middleware/auth.ts";
import type { AuthUser } from "../middleware/auth.ts";
import type { Env } from "../index.ts";

const authRoutes = new Hono<{ Bindings: Env }>();

// POST /github/start — initiate GitHub device flow
authRoutes.post("/github/start", async (c) => {
	const res = await fetch("https://github.com/login/device/code", {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Accept: "application/json",
		},
		body: JSON.stringify({
			client_id: c.env.GITHUB_CLIENT_ID,
			scope: "read:user user:email",
		}),
	});

	if (!res.ok) {
		throw new HTTPException(502, { message: "Failed to contact GitHub" });
	}

	const data = (await res.json()) as {
		device_code: string;
		user_code: string;
		verification_uri: string;
		interval: number;
		expires_in: number;
	};

	const expiresAt = Math.floor(Date.now() / 1000) + data.expires_in;
	const codeHash = await hashDeviceCode(data.device_code);

	await c.env.DB.prepare(
		"INSERT INTO oauth_states (device_code, device_code_hash, expires_at) VALUES (?1, ?2, ?3)",
	)
		.bind(data.device_code, codeHash, expiresAt)
		.run();

	return c.json({
		deviceCode: data.device_code,
		verificationUri: data.verification_uri,
		userCode: data.user_code,
		interval: data.interval,
	});
});

// POST /github/callback — poll for access token and authenticate
authRoutes.post("/github/callback", async (c) => {
	const { deviceCode } = await c.req.json<{ deviceCode: string }>();
	const codeHash = await hashDeviceCode(deviceCode);

	const state = await c.env.DB.prepare(
		"SELECT device_code, expires_at FROM oauth_states WHERE device_code_hash = ?1",
	)
		.bind(codeHash)
		.first<{ device_code: string; expires_at: number }>();

	if (!state) {
		throw new HTTPException(400, { message: "Invalid device code" });
	}

	if (state.expires_at < Math.floor(Date.now() / 1000)) {
		await c.env.DB.prepare("DELETE FROM oauth_states WHERE device_code_hash = ?1")
			.bind(codeHash)
			.run();
		throw new HTTPException(400, { message: "Device code expired" });
	}

	const res = await fetch(
		"https://github.com/login/oauth/access_token",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				client_id: c.env.GITHUB_CLIENT_ID,
				client_secret: c.env.GITHUB_CLIENT_SECRET,
				device_code: deviceCode,
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			}),
		},
	);

	const tokenData = (await res.json()) as {
		access_token?: string;
		error?: string;
		error_description?: string;
	};

	if (tokenData.error === "authorization_pending") {
		return c.json({ status: "pending" }, 202);
	}

	if (tokenData.error === "slow_down") {
		return c.json({ status: "slow_down" }, 429);
	}

	if (tokenData.error === "expired_token") {
		await c.env.DB.prepare("DELETE FROM oauth_states WHERE device_code = ?1")
			.bind(deviceCode)
			.run();
		throw new HTTPException(400, { message: "Token request expired" });
	}

	if (tokenData.error) {
		throw new HTTPException(400, {
			message: tokenData.error_description ?? tokenData.error,
		});
	}

	const accessToken = tokenData.access_token;
	if (!accessToken) {
		throw new HTTPException(502, { message: "No access token returned" });
	}

	// Clean up used state
	await c.env.DB.prepare("DELETE FROM oauth_states WHERE device_code = ?1")
		.bind(deviceCode)
		.run();

	// Get GitHub user info
	const ghUser = await getGitHubUser(accessToken);

	// Upsert user in D1
	const user = await ensureUser(c.env.DB, ghUser);

	// Issue JWT
	const authUser: AuthUser = {
		userId: user.id,
		email: user.email,
		githubLogin: user.github_login,
		tier: user.tier,
	};

	const token = await createToken(authUser, c.env.JWT_SECRET);

	return c.json({
		token,
		user: {
			id: authUser.userId,
			email: authUser.email,
			login: authUser.githubLogin,
		},
	});
});

// GET /me — current user profile (requires auth)
authRoutes.get("/me", authMiddleware, async (c) => {
	const authUser = c.var.user;

	const user = await c.env.DB.prepare(
		"SELECT id, email, github_login, tier, avatar_url, created_at FROM users WHERE id = ?1",
	)
		.bind(authUser.userId)
		.first<{
			id: string;
			email: string;
			github_login: string;
			tier: string;
			avatar_url: string | null;
			created_at: string;
		}>();

	if (!user) {
		throw new HTTPException(404, { message: "User not found" });
	}

	return c.json(user);
});

// POST /github/web/start — generate GitHub OAuth URL for dashboard web login
authRoutes.post("/github/web/start", async (c) => {
	const clientId = c.env.GITHUB_CLIENT_ID;
	const redirectUri = `${c.env.DASHBOARD_URL}/dashboard/auth/callback`;
	const scope = "read:user user:email";

	// Generate CSRF state parameter and store it
	const state = crypto.randomUUID();
	await c.env.DB.prepare(
		"INSERT INTO oauth_states (device_code, state, expires_at) VALUES (?1, 'csrf_pending', ?2)",
	)
		.bind(state, Math.floor(Date.now() / 1000) + 600) // 10 min expiry
		.run();

	const url = `https://github.com/login/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&response_type=code&state=${encodeURIComponent(state)}`;

	return c.json({ url, state });
});

// POST /github/web/callback — exchange authorization code for JWT (dashboard login)
authRoutes.post("/github/web/callback", async (c) => {
	const { code, state } = await c.req.json<{ code: string; state: string }>();

	if (!code) {
		throw new HTTPException(400, { message: "Authorization code is required" });
	}

	if (!state) {
		throw new HTTPException(400, { message: "State parameter is required for CSRF protection" });
	}

	// Validate state
	const storedState = await c.env.DB.prepare(
		"SELECT device_code FROM oauth_states WHERE device_code = ?1 AND state = 'csrf_pending' AND expires_at > ?2",
	)
		.bind(state, Math.floor(Date.now() / 1000))
		.first();

	if (!storedState) {
		throw new HTTPException(400, { message: "Invalid or expired state parameter" });
	}

	// Consume the state (prevent replay)
	await c.env.DB.prepare("DELETE FROM oauth_states WHERE device_code = ?1")
		.bind(state)
		.run();

	// Exchange code for access token
	const res = await fetch(
		"https://github.com/login/oauth/access_token",
		{
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({
				client_id: c.env.GITHUB_CLIENT_ID,
				client_secret: c.env.GITHUB_CLIENT_SECRET,
				code,
				redirect_uri: `${c.env.DASHBOARD_URL}/dashboard/auth/callback`,
			}),
		},
	);

	const tokenData = (await res.json()) as {
		access_token?: string;
		error?: string;
		error_description?: string;
	};

	if (tokenData.error || !tokenData.access_token) {
		throw new HTTPException(400, {
			message: tokenData.error_description ?? "Failed to exchange authorization code",
		});
	}

	// Get GitHub user info
	const ghUser = await getGitHubUser(tokenData.access_token);
	const user = await ensureUser(c.env.DB, ghUser);

	// Issue JWT
	const authUser: AuthUser = {
		userId: user.id,
		email: user.email,
		githubLogin: user.github_login,
		tier: user.tier,
	};

	const token = await createToken(authUser, c.env.JWT_SECRET);

	return c.json({
		token,
		user: {
			id: authUser.userId,
			email: authUser.email,
			login: authUser.githubLogin,
		},
	});
});

// --- Helpers ---

/** SHA-256 hash a device code for secure storage. */
async function hashDeviceCode(code: string): Promise<string> {
	const encoder = new TextEncoder();
	const data = encoder.encode(code);
	const hash = await crypto.subtle.digest("SHA-256", data);
	const hex = Array.from(new Uint8Array(hash))
		.map((b) => b.toString(16).padStart(2, "0"))
		.join("");
	return hex;
}

interface GitHubUser {
	id: number;
	login: string;
	email: string | null;
	avatar_url: string;
}

async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
	const userRes = await fetch("https://api.github.com/user", {
		headers: {
			Authorization: `Bearer ${accessToken}`,
			"User-Agent": "squido-cloud",
			Accept: "application/json",
		},
	});

	if (!userRes.ok) {
		throw new HTTPException(502, { message: "Failed to fetch GitHub user" });
	}

	const ghUser = (await userRes.json()) as {
		id: number;
		login: string;
		email: string | null;
		avatar_url: string;
	};

	// Get primary email if email is not public
	if (!ghUser.email) {
		const emailsRes = await fetch("https://api.github.com/user/emails", {
			headers: {
				Authorization: `Bearer ${accessToken}`,
				"User-Agent": "squido-cloud",
				Accept: "application/json",
			},
		});

		if (emailsRes.ok) {
			const emails = (await emailsRes.json()) as Array<{
				email: string;
				primary: boolean;
				verified: boolean;
			}>;
			const primary = emails.find((e) => e.primary && e.verified);
			if (primary) {
				ghUser.email = primary.email;
			}
		}
	}

	return ghUser;
}

interface DbUser {
	id: string;
	email: string;
	github_login: string;
	tier: string;
}

async function ensureUser(db: D1Database, ghUser: GitHubUser): Promise<DbUser> {
	const userId = `gh_${ghUser.id}`;
	const user = await db.prepare(
		`INSERT INTO users (id, github_id, github_login, email, avatar_url)
     VALUES (?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(github_id) DO UPDATE SET
       id = COALESCE(users.id, EXCLUDED.id),
       github_login = EXCLUDED.github_login,
       email = COALESCE(NULLIF(EXCLUDED.email, ''), users.email),
       avatar_url = COALESCE(NULLIF(EXCLUDED.avatar_url, ''), users.avatar_url),
       updated_at = CURRENT_TIMESTAMP
     RETURNING id, email, github_login, tier`,
	)
		.bind(
			userId,
			String(ghUser.id),
			ghUser.login,
			ghUser.email ?? "",
			ghUser.avatar_url,
		)
		.first<DbUser>();

	if (!user) {
		throw new Error("Failed to create or retrieve user");
	}

	return user;
}

export default authRoutes;
