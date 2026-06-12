/**
 * CloudAuth — GitHub OAuth device flow for Squido Cloud.
 *
 * Manages the OAuth lifecycle: device code request, polling, token storage.
 * Uses a pluggable storage interface so it works with any credential store.
 */

import type { SquidoCloudClient } from "./client.ts";

export interface CloudCredential {
	type: "cloud_oauth";
	accessToken: string;
	refreshToken?: string;
	expiresAt: number | null;
	userId: string;
	email: string;
	githubLogin: string;
}

export interface CloudCredentialStore {
	get(key: string): CloudCredential | null;
	set(key: string, credential: CloudCredential): void;
	delete(key: string): void;
}

export interface CloudAuthCallbacks {
	onDeviceCode: (verificationUri: string, userCode: string) => void;
	onPolling: () => void;
	onSuccess: (credential: CloudCredential) => void;
	onError: (error: Error) => void;
}

const CLOUD_CREDENTIAL_KEY = "squido_cloud";

export class CloudAuth {
	client: SquidoCloudClient;
	store: CloudCredentialStore;

	constructor(client: SquidoCloudClient, store: CloudCredentialStore) {
		this.client = client;
		this.store = store;
	}

	/** Returns the current cloud credential, or null if not logged in. */
	getCredential(): CloudCredential | null {
		return this.store.get(CLOUD_CREDENTIAL_KEY);
	}

	/** Returns true if a valid (non-expired) cloud session exists. */
	isLoggedIn(): boolean {
		const cred = this.getCredential();
		if (!cred) return false;
		if (cred.expiresAt && cred.expiresAt < Date.now()) return false;
		return true;
	}

	/** Starts the GitHub OAuth device flow and polls for completion. */
	async login(callbacks: CloudAuthCallbacks): Promise<CloudCredential> {
		// 1. Start device flow
		const { deviceCode, verificationUri, userCode, interval } = await this.client.startGitHubOAuth();

		callbacks.onDeviceCode(verificationUri, userCode);

		// 2. Poll until user authorizes
		const pollIntervalMs = Math.max(interval * 1000, 5000);

		let result: { token: string; user: { id: string; email: string; login: string } } | null = null;

		while (result === null) {
			callbacks.onPolling();
			await sleep(pollIntervalMs);

			try {
				result = await this.client.pollGitHubOAuth(deviceCode);
			} catch (err) {
				if (err instanceof Error && err.message.includes("authorization_pending")) {
					continue;
				}
				if (err instanceof Error && err.message.includes("slow_down")) {
					continue;
				}
				callbacks.onError(err instanceof Error ? err : new Error(String(err)));
				throw err;
			}
		}

		// 3. The poll response already includes user info — use it
		const credential: CloudCredential = {
			type: "cloud_oauth",
			accessToken: result.token,
			expiresAt: null,
			userId: result.user.id,
			email: result.user.email,
			githubLogin: result.user.login,
		};

		this.store.set(CLOUD_CREDENTIAL_KEY, credential);
		callbacks.onSuccess(credential);

		return credential;
	}

	/** Removes the stored cloud credential. */
	logout(): void {
		this.store.delete(CLOUD_CREDENTIAL_KEY);
	}

	/** Returns the access token for API requests, or null. */
	getAccessToken(): string | null {
		const cred = this.getCredential();
		if (!cred) return null;
		if (cred.expiresAt && cred.expiresAt < Date.now()) {
			this.store.delete(CLOUD_CREDENTIAL_KEY);
			return null;
		}
		return cred.accessToken;
	}
}

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
