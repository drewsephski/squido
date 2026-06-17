/**
 * WebSocket protocol types for browser-based agent interaction.
 *
 * Two-way message protocol over a single WebSocket connection.
 * The server streams agent session events as they occur.
 * The client sends commands to interact with the agent.
 */

import type { ImageContent } from "@drewsepsi/squido-ai";
import type { AgentSessionEvent } from "../../core/agent-session.ts";

// ============================================================================
// Client -> Server messages
// ============================================================================

export type WebClientMessage =
	| { type: "prompt"; text: string; images?: ImageContent[] }
	| { type: "steer"; text: string; images?: ImageContent[] }
	| { type: "follow_up"; text: string; images?: ImageContent[] }
	| { type: "abort" }
	| { type: "set_model"; provider: string; modelId: string }
	| { type: "cycle_model" }
	| { type: "set_thinking"; level: string }
	| { type: "get_state" };

// ============================================================================
// Server -> Client messages
// ============================================================================

/**
 * A snapshot of the current agent session state, sent on connect and on request.
 */
export interface WebSessionState {
	model: { provider: string; id: string } | null;
	thinkingLevel: string;
	isStreaming: boolean;
	cwd: string;
	sessionName: string | undefined;
	sessionId: string;
	messageCount: number;
}

/**
 * Messages the server sends to the client.
 */
export type WebServerMessage =
	| { type: "state"; state: WebSessionState }
	| { type: "error"; message: string }
	| { type: "event"; event: AgentSessionEvent };

// ============================================================================
// Server options
// ============================================================================

export interface WebServerOptions {
	host: string;
	port: number;
	staticDir: string;
	openBrowser: boolean;
	getModels?: () => Array<{
		provider: string;
		id: string;
		name?: string;
		contextWindow?: number;
		reasoning?: boolean;
		input?: string[];
	}>;
}
