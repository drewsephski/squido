/**
 * Bridges an AgentSession to a WebSocket connection.
 *
 * Receives commands from the WebSocket client and forwards them to the
 * AgentSession. Subscribes to agent events and streams them to the client.
 * Supports session switching, creation, renaming, and history loading
 * when paired with an AgentSessionRuntime.
 */

import type { WebSocket } from "ws";
import { AgentSession } from "../../core/agent-session.ts";
import type { AgentSessionRuntime } from "../../core/agent-session-runtime.ts";
import type { WebClientMessage, WebServerMessage, WebSessionMessage, WebSessionState } from "./web-types.ts";

type SessionListFn = () => Promise<
	Array<{
		path: string;
		id: string;
		name?: string;
		cwd: string;
		messageCount: number;
		created: Date;
		modified: Date;
	}>
>;

/**
 * Bridge one WebSocket connection to an AgentSession.
 *
 * Two construction forms:
 *   new WebSessionBridge(ws, session)          — legacy, no session switching
 *   new WebSessionBridge(ws, runtime, listFn)  — full session management
 */
export class WebSessionBridge {
	private ws: WebSocket;
	private session: AgentSession;
	private runtime: AgentSessionRuntime | null;
	private unsubscribe: (() => void) | null = null;
	private closed = false;
	private listSessions: SessionListFn | null;

	constructor(ws: WebSocket, session: AgentSession);
	constructor(ws: WebSocket, runtime: AgentSessionRuntime, listSessions: SessionListFn);
	constructor(ws: WebSocket, sessionOrRuntime: AgentSession | AgentSessionRuntime, listSessions?: SessionListFn) {
		this.ws = ws;
		this.listSessions = listSessions ?? null;

		if (sessionOrRuntime instanceof AgentSession) {
			// Legacy mode: just an AgentSession, no runtime for switching
			this.session = sessionOrRuntime;
			this.runtime = null;
		} else {
			// Full mode: AgentSessionRuntime with session switching support
			this.runtime = sessionOrRuntime;
			this.session = sessionOrRuntime.session;
			this.runtime.setRebindSession(async (newSession: AgentSession) => {
				this.rebind(newSession);
			});
		}
	}

	attach(): void {
		// Send initial state
		this.sendState();

		// Send session list and history (if available)
		this.sendSessionList();
		this.sendHistory();

		// Subscribe to agent events
		this.unsubscribe = this.session.subscribe((event: any) => {
			if (this.closed) return;
			const msg: WebServerMessage = { type: "event", event };
			this.sendMessage(msg);
		});

		// Handle incoming messages
		this.ws.on("message", (data) => {
			if (this.closed) return;
			try {
				const message: WebClientMessage = JSON.parse(data.toString());
				this.handleMessage(message);
			} catch (error) {
				this.sendError(`Invalid message: ${error instanceof Error ? error.message : String(error)}`);
			}
		});

		// Handle close
		this.ws.on("close", () => {
			this.detach();
		});

		// Handle errors
		this.ws.on("error", () => {
			this.detach();
		});
	}

	/**
	 * Rebind this bridge to a new session (called after session switch).
	 * Detaches from the old session's events and attaches to the new one.
	 */
	rebind(newSession: AgentSession): void {
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		this.session = newSession;
		this.unsubscribe = this.session.subscribe((event: any) => {
			if (this.closed) return;
			const msg: WebServerMessage = { type: "event", event };
			this.sendMessage(msg);
		});
	}

	detach(): void {
		if (this.closed) return;
		this.closed = true;
		if (this.unsubscribe) {
			this.unsubscribe();
			this.unsubscribe = null;
		}
		try {
			this.ws.close();
		} catch {
			// ignore
		}
	}

	private async handleMessage(message: WebClientMessage): Promise<void> {
		try {
			switch (message.type) {
				case "prompt":
					await this.session.prompt(message.text, { images: message.images });
					this.sendSessionList();
					break;

				case "steer":
					await this.session.steer(message.text, message.images);
					this.sendSessionList();
					break;

				case "follow_up":
					await this.session.followUp(message.text, message.images);
					this.sendSessionList();
					break;

				case "abort":
					await this.session.abort();
					break;

				case "set_model":
					await this.setModel(message.provider, message.modelId);
					break;

				case "cycle_model":
					this.session.cycleModel();
					this.sendState();
					break;

				case "set_thinking":
					{
						const validLevels = ["off", "minimal", "low", "medium", "high", "xhigh"] as const;
						if (validLevels.includes(message.level as any)) {
							this.session.setThinkingLevel(message.level as any);
						}
						this.sendState();
					}
					break;

				case "get_state":
					this.sendState();
					break;

				case "list_sessions":
					this.sendSessionList();
					break;

				case "load_session":
					await this.loadSession(message.sessionPath);
					this.sendSessionList();
					break;

				case "new_session":
					await this.createNewSession();
					break;

				case "rename_session":
					this.renameCurrentSession(message.name);
					break;
			}
		} catch (error) {
			this.sendError(`Command failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async setModel(provider: string, modelId: string): Promise<void> {
		this.session.modelRegistry.refresh();
		const model = this.session.modelRegistry.find(provider, modelId);
		if (!model) {
			const all = this.session.modelRegistry.getAll();
			const matches = all.filter((m) => m.id === modelId);
			if (matches.length === 1) {
				await this.session.setModel(matches[0]);
				this.sendState();
				return;
			}
			this.sendError(`Model not found: ${provider}/${modelId}`);
			return;
		}
		await this.session.setModel(model);
		this.sendState();
	}

	private async loadSession(sessionPath: string): Promise<void> {
		if (!this.runtime) {
			this.sendError("Session switching is not available in this mode");
			return;
		}
		const result = await this.runtime.switchSession(sessionPath, {
			withSession: async () => {
				this.sendHistory();
				this.sendState();
			},
		});
		if (result.cancelled) {
			this.sendError("Session switch was cancelled");
		}
	}

	private async createNewSession(): Promise<void> {
		if (!this.runtime) {
			this.sendError("New session creation is not available in this mode");
			return;
		}
		const result = await this.runtime.newSession({
			withSession: async () => {
				this.sendHistory();
				this.sendState();
			},
		});
		if (result.cancelled) {
			this.sendError("New session was cancelled");
			return;
		}
		this.sendSessionList();
	}

	private renameCurrentSession(name: string): void {
		const trimmed = name.trim();
		if (!trimmed) {
			this.sendError("Session name cannot be empty");
			return;
		}
		this.session.sessionManager.appendSessionInfo(trimmed);
		this.sendMessage({ type: "session_renamed", name: trimmed });
		this.sendState();
		this.sendSessionList();
	}

	private getState(): WebSessionState {
		const state = this.session.state;
		return {
			model: state.model ? { provider: state.model.provider, id: state.model.id } : null,
			thinkingLevel: state.thinkingLevel,
			isStreaming: state.isStreaming,
			cwd: this.session.sessionManager.getCwd(),
			sessionName: this.session.sessionName,
			sessionId: this.session.sessionId,
			sessionFile: this.session.sessionFile,
			messageCount: this.session.messages.length,
		};
	}

	private sendState(): void {
		this.sendMessage({ type: "state", state: this.getState() });
	}

	private async sendSessionList(): Promise<void> {
		if (!this.listSessions) return;
		try {
			const sessions = await this.listSessions();
			this.sendMessage({
				type: "session_list",
				sessions: sessions.map((s) => ({
					path: s.path,
					id: s.id,
					name: s.name,
					cwd: s.cwd,
					messageCount: s.messageCount,
					created: s.created.toISOString(),
					modified: s.modified.toISOString(),
				})),
			});
		} catch (error) {
			this.sendError(`Failed to list sessions: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private sendHistory(): void {
		const messages: WebSessionMessage[] = [];
		for (const msg of this.session.messages) {
			if (msg.role === "user" || msg.role === "assistant") {
				const content = typeof msg.content === "string" ? msg.content : "";
				messages.push({
					role: msg.role,
					content,
					model: msg.role === "assistant" ? String(msg.model ?? "") : undefined,
				});
			}
		}
		if (messages.length > 0) {
			this.sendMessage({ type: "session_history", messages });
		}
	}

	private sendError(message: string): void {
		this.sendMessage({ type: "error", message });
	}

	private sendMessage(msg: WebServerMessage): void {
		if (this.closed) return;
		try {
			this.ws.send(JSON.stringify(msg));
		} catch {
			this.detach();
		}
	}
}
