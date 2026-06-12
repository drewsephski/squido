/**
 * Cloud integration for the Squido CLI.
 *
 * Wires the @drewsepsi/squido-cloud package into the CLI:
 * - Adapts AuthStorage -> CloudCredentialStore
 * - Adapts SessionManager -> SessionEntryReader
 * - Creates and manages SquidoCloudClient, CloudAuth, SessionSync
 * - Provides slash command handlers for /cloud
 */

import type {
	CloudCredential,
	CloudCredentialStore,
	SyncCallbacks,
	SyncState,
	SyncStateStore,
} from "@drewsepsi/squido-cloud";
import { CloudAuth, SessionSync, SquidoCloudClient } from "@drewsepsi/squido-cloud";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import type { ReadonlySessionManager } from "../session-manager.ts";

// ── AuthStorage-like interface (duck-typed for dependency inversion) ─

export interface AuthStorageLike {
	get(key: string): Record<string, unknown> | undefined;
	set(key: string, value: Record<string, unknown>): void;
	reload(): void;
}

// ── Adapter: AuthStorage -> CloudCredentialStore ───────────────────

export class AuthStorageCredentialStore implements CloudCredentialStore {
	authStorage: AuthStorageLike;

	constructor(authStorage: AuthStorageLike) {
		this.authStorage = authStorage;
	}

	get(key: string): CloudCredential | null {
		const cred = this.authStorage.get(key);
		if (!cred || cred.type !== "cloud_oauth") return null;
		return {
			type: "cloud_oauth",
			accessToken: cred.accessToken as string,
			refreshToken: cred.refreshToken as string | undefined,
			expiresAt: (cred.expiresAt as number | null) ?? null,
			userId: cred.userId as string,
			email: cred.email as string,
			githubLogin: cred.githubLogin as string,
		};
	}

	set(key: string, credential: CloudCredential): void {
		this.authStorage.set(key, credential as unknown as Record<string, unknown>);
	}

	delete(key: string): void {
		this.authStorage.set(key, { type: "deleted" });
		this.authStorage.reload();
	}
}

// ── Adapter: ReadonlySessionManager -> SessionEntryReader ──────────

export class SessionManagerEntryReader {
	sessionManager: ReadonlySessionManager;

	constructor(sessionManager: ReadonlySessionManager) {
		this.sessionManager = sessionManager;
	}

	sessionExists(sessionId: string): boolean {
		return this.sessionManager.getSessionId() === sessionId;
	}

	readEntriesSince(
		_sessionId: string,
		afterEntryId: string | null,
	): Array<{
		id: string;
		type: string;
		parentId: string | null;
		timestamp: string;
		payload: Record<string, unknown>;
	}> {
		const entries = this.sessionManager.getEntries();

		const startIndex = afterEntryId ? entries.findIndex((e) => e.id === afterEntryId) + 1 : 0;

		if (startIndex <= 0 && afterEntryId) {
			return entries.map(serializeEntry);
		}

		return entries.slice(startIndex).map(serializeEntry);
	}
}

function serializeEntry(entry: { id: string; type: string; parentId: string | null; timestamp: string }): {
	id: string;
	type: string;
	parentId: string | null;
	timestamp: string;
	payload: Record<string, unknown>;
} {
	const { type, id, parentId, timestamp, ...rest } = entry as Record<string, unknown>;
	return {
		id: id as string,
		type: type as string,
		parentId: (parentId as string | null) ?? null,
		timestamp: timestamp as string,
		payload: rest as Record<string, unknown>,
	};
}

// ── Sync state store using JSON files ──────────────────────────────

export class FileSyncStateStore implements SyncStateStore {
	dir: string;

	constructor(syncStateDir: string) {
		this.dir = syncStateDir;
		if (!existsSync(this.dir)) {
			mkdirSync(this.dir, { recursive: true });
		}
	}

	readSyncState(sessionId: string): SyncState | null {
		const filePath = join(this.dir, `${sessionId}.json`);
		if (!existsSync(filePath)) return null;
		try {
			return JSON.parse(readFileSync(filePath, "utf-8")) as SyncState;
		} catch {
			return null;
		}
	}

	writeSyncState(sessionId: string, state: SyncState): void {
		writeFileSync(join(this.dir, `${sessionId}.json`), JSON.stringify(state, null, 2));
	}
}

// ── CloudIntegration — single entrypoint for CLI ────────────────────

export interface CloudIntegrationOptions {
	baseUrl: string;
	authStorage: AuthStorageLike;
	sessionManager: ReadonlySessionManager;
	syncStateDir: string;
	/** Returns true if cloud sync is currently enabled in settings. Called on each check, not cached. */
	isCloudEnabled: () => boolean;
	fetchFn?: typeof globalThis.fetch;
}

export class CloudIntegration {
	client: SquidoCloudClient;
	auth: CloudAuth;
	sync: SessionSync;
	store: AuthStorageCredentialStore;
	entryReader: SessionManagerEntryReader;
	stateStore: FileSyncStateStore;
	isCloudEnabled: () => boolean;

	constructor(options: CloudIntegrationOptions) {
		this.store = new AuthStorageCredentialStore(options.authStorage);
		this.entryReader = new SessionManagerEntryReader(options.sessionManager);
		this.stateStore = new FileSyncStateStore(options.syncStateDir);
		this.isCloudEnabled = options.isCloudEnabled;

		this.client = new SquidoCloudClient({
			baseUrl: options.baseUrl,
			fetch: options.fetchFn,
			getToken: () => this.auth?.getAccessToken() ?? null,
		});

		this.auth = new CloudAuth(this.client, this.store);
		this.sync = new SessionSync({
			client: this.client,
			entryReader: this.entryReader,
			stateStore: this.stateStore,
		});
	}

	/** Returns true if cloud sync is both enabled and authenticated. */
	get isActive(): boolean {
		return this.isCloudEnabled() && this.auth.isLoggedIn();
	}

	/** Sync the current session after a turn. */
	async syncAfterTurn(sessionId: string): Promise<void> {
		if (!this.isActive) return;
		await this.sync.syncSession(sessionId);
	}

	/** Get sync status for display. */
	getStatus(): {
		loggedIn: boolean;
		enabled: boolean;
		email: string | null;
		lastSync: string | null;
		totalSynced: number;
	} {
		const cred = this.auth.getCredential();
		const sessionState = this.sync.getSyncState(this.entryReader.sessionManager.getSessionId());
		return {
			loggedIn: this.auth.isLoggedIn(),
			enabled: this.isCloudEnabled(),
			email: cred?.email ?? null,
			lastSync: sessionState?.lastSyncedAt ?? null,
			totalSynced: sessionState?.totalSynced ?? 0,
		};
	}

	/** Set sync callbacks for UI feedback. */
	setSyncCallbacks(callbacks: Partial<SyncCallbacks>): void {
		(this.sync as unknown as { callbacks: Required<SyncCallbacks> }).callbacks = {
			onSyncStart: callbacks.onSyncStart ?? (() => {}),
			onSyncComplete: callbacks.onSyncComplete ?? (() => {}),
			onSyncError: callbacks.onSyncError ?? (() => {}),
			onSyncSkipped: callbacks.onSyncSkipped ?? (() => {}),
		};
	}
}
