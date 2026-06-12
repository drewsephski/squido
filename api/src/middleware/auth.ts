import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";

export interface AuthUser {
	userId: string;
	email: string;
	githubLogin: string;
	tier: string;
}

declare module "hono" {
	interface ContextVariableMap {
		user: AuthUser;
	}
}

async function importKey(secret: string): Promise<CryptoKey> {
	const encoder = new TextEncoder();
	const keyData = encoder.encode(secret);
	return crypto.subtle.importKey(
		"raw",
		keyData,
		{ name: "HMAC", hash: "SHA-256" },
		false,
		["verify", "sign"],
	);
}

function base64UrlEncode(data: ArrayBuffer | Uint8Array<ArrayBuffer>): string {
	const source = data instanceof Uint8Array ? data.buffer : data;
	const bytes = new Uint8Array(source);
	let binary = "";
	for (let i = 0; i < bytes.length; i++) {
		binary += String.fromCharCode(bytes[i]);
	}
	return btoa(binary)
		.replace(/\+/g, "-")
		.replace(/\//g, "_")
		.replace(/=+$/, "");
}

function base64UrlDecode(str: string): ArrayBuffer {
	str = str.replace(/-/g, "+").replace(/_/g, "/");
	const padding = str.length % 4 === 3 ? "=" : str.length % 4 === 2 ? "==" : "";
	str += padding;
	const binary = atob(str);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes.buffer as ArrayBuffer;
}

function textEncode(str: string): Uint8Array<ArrayBuffer> {
	return new TextEncoder().encode(str) as Uint8Array<ArrayBuffer>;
}

function textDecode(buffer: ArrayBuffer): string {
	return new TextDecoder().decode(buffer);
}

export async function verifyToken(
	token: string,
	secret: string,
): Promise<AuthUser | null> {
	try {
		const parts = token.split(".");
		if (parts.length !== 3) return null;

		const [, payloadB64, signatureB64] = parts;
		const key = await importKey(secret);

		const data = textEncode(`${parts[0]}.${parts[1]}`);
		const signatureToVerify = new Uint8Array(base64UrlDecode(signatureB64));

		const isValid = await crypto.subtle.verify("HMAC", key, signatureToVerify, data);
		if (!isValid) return null;

		const payloadBytes = base64UrlDecode(payloadB64);
		const payload = JSON.parse(textDecode(payloadBytes));

		const now = Math.floor(Date.now() / 1000);
		if (payload.exp && payload.exp < now) return null;

		return {
			userId: payload.sub,
			email: payload.email ?? "",
			githubLogin: payload.github_login ?? "",
			tier: payload.tier ?? "free",
		};
	} catch {
		return null;
	}
}

export async function createToken(
	user: AuthUser,
	secret: string,
): Promise<string> {
	const header = { alg: "HS256", typ: "JWT" };
	const now = Math.floor(Date.now() / 1000);
	const payload = {
		sub: user.userId,
		email: user.email,
		github_login: user.githubLogin,
		tier: user.tier,
		iat: now,
		exp: now + 30 * 24 * 60 * 60, // 30 days
	};

	const headerB64 = base64UrlEncode(textEncode(JSON.stringify(header)));
	const payloadB64 = base64UrlEncode(textEncode(JSON.stringify(payload)));

	const key = await importKey(secret);
	const data = textEncode(`${headerB64}.${payloadB64}`);
	const signature = await crypto.subtle.sign("HMAC", key, data);
	const signatureB64 = base64UrlEncode(signature);

	return `${headerB64}.${payloadB64}.${signatureB64}`;
}

export async function authMiddleware(c: Context, next: Next): Promise<void> {
	const authHeader = c.req.header("Authorization");
	if (!authHeader?.startsWith("Bearer ")) {
		throw new HTTPException(401, { message: "Missing or invalid Authorization header" });
	}

	const token = authHeader.slice(7);
	const secret = c.env.JWT_SECRET as string;
	const user = await verifyToken(token, secret);

	if (!user) {
		throw new HTTPException(401, { message: "Invalid or expired token" });
	}

	c.set("user", user);
	await next();
}
