/**
 * Bridges an AgentSession to a WebSocket connection.
 *
 * Receives commands from the WebSocket client and forwards them to the
 * AgentSession. Subscribes to agent events and streams them to the client.
 */

import type { Model } from "@drewsepsi/squido-ai";
import type { WebSocket } from "ws";
import type { AgentSession } from "../../core/agent-session.ts";
import type { WebClientMessage, WebServerMessage, WebSessionState } from "./web-types.ts";

/**
 * Bridge one WebSocket connection to an AgentSession.
 */
export class WebSessionBridge {
	private ws: WebSocket;
	private session: AgentSession;
	private unsubscribe: (() => void) | null = null;
	private closed = false;

	constructor(ws: WebSocket, session: AgentSession) {
		this.ws = ws;
		this.session = session;
	}

	attach(): void {
		// Send initial state
		this.sendState();

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
					break;

				case "steer":
					await this.session.steer(message.text, message.images);
					break;

				case "follow_up":
					await this.session.followUp(message.text, message.images);
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
			}
		} catch (error) {
			this.sendError(`Command failed: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	private async setModel(provider: string, modelId: string): Promise<void> {
		const model = this.session.modelRegistry.find(provider, modelId);
		if (!model) {
			this.sendError(`Model not found: ${provider}/${modelId}`);
			return;
		}
		await this.session.setModel(model);
		this.sendState();
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
			messageCount: this.session.messages.length,
		};
	}

	private sendState(): void {
		this.sendMessage({ type: "state", state: this.getState() });
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
