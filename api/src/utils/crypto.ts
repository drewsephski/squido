/**
 * AES-GCM encryption utilities for storing sensitive tokens in D1.
 *
 * Uses GITHUB_TOKEN_ENCRYPTION_KEY (256-bit hex-encoded) from env.
 * Ciphertext format: base64(IV) : base64(ciphertext)
 */

const IV_LENGTH = 12;

function getEncryptionKeyHex(env: { GITHUB_TOKEN_ENCRYPTION_KEY: string }): string {
	const key = env.GITHUB_TOKEN_ENCRYPTION_KEY;
	if (!key) {
		throw new Error("GITHUB_TOKEN_ENCRYPTION_KEY is not set");
	}
	return key;
}

async function importKey(env: { GITHUB_TOKEN_ENCRYPTION_KEY: string }): Promise<CryptoKey> {
	const hex = getEncryptionKeyHex(env);
	const bytes = new Uint8Array(hex.length / 2);
	for (let i = 0; i < hex.length; i += 2) {
		bytes[i / 2] = Number.parseInt(hex.slice(i, i + 2), 16);
	}
	return crypto.subtle.importKey("raw", bytes, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const b of bytes) {
		binary += String.fromCharCode(b);
	}
	return btoa(binary);
}

function fromBase64(str: string): Uint8Array {
	const binary = atob(str);
	const bytes = new Uint8Array(binary.length);
	for (let i = 0; i < binary.length; i++) {
		bytes[i] = binary.charCodeAt(i);
	}
	return bytes;
}

export async function encryptToken(plaintext: string, env: { GITHUB_TOKEN_ENCRYPTION_KEY: string }): Promise<string> {
	const key = await importKey(env);
	const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
	const encoder = new TextEncoder();
	const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, encoder.encode(plaintext));
	return `${toBase64(iv)}:${toBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptToken(stored: string, env: { GITHUB_TOKEN_ENCRYPTION_KEY: string }): Promise<string> {
	const [ivB64, ctB64] = stored.split(":");
	if (!ivB64 || !ctB64) {
		throw new Error("Invalid ciphertext format");
	}
	const key = await importKey(env);
	const iv = fromBase64(ivB64);
	const ciphertext = fromBase64(ctB64);
	const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
	return new TextDecoder().decode(plaintext);
}
