import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { authMiddleware } from "../middleware/auth.ts";
import type { Env } from "../index.ts";

const accountRoutes = new Hono<{ Bindings: Env }>();

accountRoutes.use("*", authMiddleware);

function productIdToTier(productId: string): string {
	// Map Stripe product IDs to tiers. Update with real product IDs when billing is configured.
	switch (productId) {
		case "prod_pro_monthly":
		case "prod_pro_yearly":
			return "pro";
		case "prod_team_monthly":
		case "prod_team_yearly":
			return "team";
		default:
			return "free";
	}
}

// GET / — user profile with session stats
accountRoutes.get("/", async (c) => {
	const user = c.var.user;

	const profile = await c.env.DB.prepare(
		"SELECT id, email, github_login, tier, avatar_url, created_at FROM users WHERE id = ?1",
	)
		.bind(user.userId)
		.first<{
			id: string;
			email: string;
			github_login: string;
			tier: string;
			avatar_url: string | null;
			created_at: string;
		}>();

	if (!profile) {
		throw new HTTPException(404, { message: "User not found" });
	}

	const stats = await c.env.DB.prepare(
		"SELECT COUNT(*) as session_count, COALESCE(SUM(file_size_bytes), 0) as total_bytes FROM sessions WHERE user_id = ?1",
	)
		.bind(user.userId)
		.first<{ session_count: number; total_bytes: number }>();

	return c.json({ ...profile, ...stats });
});

// GET /billing — create Stripe billing portal session
accountRoutes.get("/billing", async (c) => {
	const user = c.var.user;

	// Get or create Stripe customer
	const existing = await c.env.DB.prepare(
		"SELECT stripe_customer_id FROM users WHERE id = ?1 AND stripe_customer_id IS NOT NULL",
	)
		.bind(user.userId)
		.first<{ stripe_customer_id: string }>();

	let stripeCustomerId: string;

	if (existing?.stripe_customer_id) {
		stripeCustomerId = existing.stripe_customer_id;
	} else {
	// Create Stripe customer via fetch
	const customerBody = new URLSearchParams();
	customerBody.set("email", user.email);
	customerBody.set("metadata[user_id]", user.userId);
	const customerRes = await fetch("https://api.stripe.com/v1/customers", {
		method: "POST",
		headers: {
			Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: customerBody.toString(),
	});

		if (!customerRes.ok) {
			throw new HTTPException(502, { message: "Failed to create Stripe customer" });
		}

		const customer = (await customerRes.json()) as { id: string };

		// Store customer ID
		await c.env.DB.prepare(
			"UPDATE users SET stripe_customer_id = ?1, updated_at = CURRENT_TIMESTAMP WHERE id = ?2",
		)
			.bind(customer.id, user.userId)
			.run();

		stripeCustomerId = customer.id;
	}

	// Create billing portal session
	const portalRes = await fetch(
		"https://api.stripe.com/v1/billing_portal/sessions",
		{
			method: "POST",
			headers: {
				Authorization: `Bearer ${c.env.STRIPE_SECRET_KEY}`,
				"Content-Type": "application/x-www-form-urlencoded",
			},
			body: new URLSearchParams({
				customer: stripeCustomerId,
				return_url: `${c.env.DASHBOARD_URL}/account`,
			}).toString(),
		},
	);

	if (!portalRes.ok) {
		throw new HTTPException(502, { message: "Failed to create billing portal session" });
	}

	const portal = (await portalRes.json()) as { url: string };

	return c.json({ portalUrl: portal.url });
});

// POST /billing/webhook — Stripe webhook handler
accountRoutes.post("/billing/webhook", async (c) => {
	const body = await c.req.text();
	const signature = c.req.header("stripe-signature");

	if (!signature) {
		throw new HTTPException(400, { message: "Missing Stripe signature" });
	}

	const payload = await verifyStripeWebhook(body, signature, c.env.STRIPE_WEBHOOK_SECRET);
	if (!payload) {
		throw new HTTPException(401, { message: "Invalid webhook signature" });
	}

	const event = JSON.parse(payload) as {
		type: string;
		data: {
			object: {
				customer: string;
				items?: {
					data: Array<{ price: { product: string } }>;
				};
				status?: string;
			};
		};
	};

	switch (event.type) {
		case "customer.subscription.created":
		case "customer.subscription.updated":
		case "customer.subscription.deleted": {
			const subscription = event.data.object;

			if (subscription.status === "incomplete" || subscription.status === "incomplete_expired") {
				return c.json({ received: true });
			}

			// Determine tier from the subscription product
			const productId =
				subscription.items?.data?.[0]?.price?.product ?? "";
			const tier =
				event.type === "customer.subscription.deleted"
					? "free"
					: productIdToTier(productId);

			await c.env.DB.prepare(
				"UPDATE users SET tier = ?1, updated_at = CURRENT_TIMESTAMP WHERE stripe_customer_id = ?2",
			)
				.bind(tier, subscription.customer)
				.run();

			break;
		}
	}

	return c.json({ received: true });
});

// --- Helpers ---

async function verifyStripeWebhook(
	payload: string,
	signature: string,
	secret: string,
): Promise<string | null> {
	try {
		const parts = signature.split(",");
		const sigMap = new Map<string, string>();

		for (const part of parts) {
			const [key, value] = part.split("=");
			if (key && value) {
				sigMap.set(key.trim(), value.trim());
			}
		}

		const sigValue = sigMap.get("v1");
		const timestamp = sigMap.get("t");

		if (!sigValue || !timestamp) return null;

		// Check timeliness
		const ts = Number.parseInt(timestamp, 10);
		const now = Math.floor(Date.now() / 1000);
		if (Math.abs(now - ts) > 300) {
			return null;
		}

		// Verify HMAC-SHA256 signature
		const signedPayload = `${timestamp}.${payload}`;
		const encoder = new TextEncoder();
		const keyData = encoder.encode(secret);
		const messageData = encoder.encode(signedPayload);

		const key = await crypto.subtle.importKey(
			"raw",
			keyData,
			{ name: "HMAC", hash: "SHA-256" },
			false,
			["sign"],
		);

		const sig = await crypto.subtle.sign("HMAC", key, messageData);
		const bytes = new Uint8Array(sig);
		let hex = "";
		for (let i = 0; i < bytes.length; i++) {
			hex += bytes[i].toString(16).padStart(2, "0");
		}

		// Constant-time comparison
		if (hex.length !== sigValue.length) return null;
		let diff = 0;
		for (let i = 0; i < hex.length; i++) {
			diff |= hex.charCodeAt(i) ^ sigValue.charCodeAt(i);
		}
		if (diff !== 0) return null;

		return payload;
	} catch {
		return null;
	}
}

export default accountRoutes;
