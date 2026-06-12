/**
 * SessionSync — incremental session sync engine.
 *
 * Hooks into the agent event stream, reads unsynced entries from the local
 * JSONL session file, and pushes them to the cloud in batches.
 *
 * Sync state is tracked per session in a `.sync-state` file so we always
 * know where we left off, even if the CLI crashes mid-sync.
 */

import type { SquidoCloudClient } from "./client.ts";

// ── Types ──────────────────────────────────────────────────────────

export interface SyncState {
	/** The ID of the last successfully synced entry (matches the entry's `id` field). */
	lastSyncedEntryId: string | null;
	/** ISO timestamp of the last successful sync. */
	lastSyncedAt: string | null;
	/** Number of entries synced so far. */
	totalSynced: number;
}

export interface SessionEntryReader {
	/** Returns all entries in the session file that come after the given ID. */
	readEntriesSince(
		sessionId: string,
		afterEntryId: string | null,
	): Array<{
		id: string;
		type: string;
		parentId: string | null;
		timestamp: string;
		payload: Record<string, unknown>;
	}>;
	/** Returns true if the session file still exists. */
	sessionExists(sessionId: string): boolean;
}

export interface SyncStateStore {
	readSyncState(sessionId: string): SyncState | null;
	writeSyncState(sessionId: string, state: SyncState): void;
}

export interface SyncCallbacks {
	onSyncStart: (sessionId: string, pendingCount: number) => void;
	onSyncComplete: (sessionId: string, count: number) => void;
	onSyncError: (sessionId: string, error: Error) => void;
	onSyncSkipped: (sessionId: string, reason: string) => void;
}

// ── SessionSync ────────────────────────────────────────────────────

export interface SessionSyncOptions {
	client: SquidoCloudClient;
	entryReader: SessionEntryReader;
	stateStore: SyncStateStore;
	callbacks?: Partial<SyncCallbacks>;
	/** Maximum entries per sync batch. Default: 100. */
	batchSize?: number;
	/** If true, silently skip errors instead of throwing. Default: true. */
	failSilently?: boolean;
}

export class SessionSync {
	client: SquidoCloudClient;
	entryReader: SessionEntryReader;
	stateStore: SyncStateStore;
	callbacks: Required<SyncCallbacks>;
	batchSize: number;
	failSilently: boolean;

	constructor(options: SessionSyncOptions) {
		this.client = options.client;
		this.entryReader = options.entryReader;
		this.stateStore = options.stateStore;
		this.batchSize = options.batchSize ?? 100;
		this.failSilently = options.failSilently ?? true;
		this.callbacks = {
			onSyncStart: options.callbacks?.onSyncStart ?? (() => {}),
			onSyncComplete: options.callbacks?.onSyncComplete ?? (() => {}),
			onSyncError: options.callbacks?.onSyncError ?? (() => {}),
			onSyncSkipped: options.callbacks?.onSyncSkipped ?? (() => {}),
		};
	}

	/**
	 * Sync all pending entries for the given session.
	 * Called after each agent turn completes (hook into `turn_end` event).
	 */
	async syncSession(sessionId: string): Promise<void> {
		if (!this.entryReader.sessionExists(sessionId)) {
			this.callbacks.onSyncSkipped(sessionId, "session file not found");
			return;
		}

		const state = this.stateStore.readSyncState(sessionId);
		const entries = this.entryReader.readEntriesSince(sessionId, state?.lastSyncedEntryId ?? null);

		if (entries.length === 0) {
			return; // nothing to sync
		}

		this.callbacks.onSyncStart(sessionId, entries.length);

		try {
			// Send in batches to avoid oversized requests
			for (let i = 0; i < entries.length; i += this.batchSize) {
				const batch = entries.slice(i, i + this.batchSize);
				await this.client.syncEntries(
					sessionId,
					batch.map((e) => ({
						id: e.id,
						entryType: e.type,
						parentId: e.parentId,
						timestamp: e.timestamp,
						payload: e.payload,
					})),
				);
			}

			// Update sync state
			const lastEntry = entries[entries.length - 1];
			this.stateStore.writeSyncState(sessionId, {
				lastSyncedEntryId: lastEntry.id,
				lastSyncedAt: new Date().toISOString(),
				totalSynced: (state?.totalSynced ?? 0) + entries.length,
			});

			this.callbacks.onSyncComplete(sessionId, entries.length);
		} catch (err) {
			const error = err instanceof Error ? err : new Error(String(err));
			this.callbacks.onSyncError(sessionId, error);

			if (!this.failSilently) {
				throw error;
			}
		}
	}

	/**
	 * Sync multiple sessions. Useful for session-end flush where multiple
	 * sessions may have pending entries.
	 */
	async syncAll(sessionIds: string[]): Promise<void> {
		for (const id of sessionIds) {
			await this.syncSession(id);
		}
	}

	/**
	 * Returns the current sync state for a session (for status display).
	 */
	getSyncState(sessionId: string): SyncState | null {
		return this.stateStore.readSyncState(sessionId);
	}
}
