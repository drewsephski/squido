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
	| { type: "get_state" }
	| { type: "list_sessions" }
	| { type: "load_session"; sessionPath: string }
	| { type: "new_session" }
	| { type: "rename_session"; name: string };

// ============================================================================
// Server -> Client messages
// ============================================================================

/**
 * Lightweight session info sent to the client for the sidebar.
 */
export interface WebSessionInfo {
	path: string;
	id: string;
	name?: string;
	cwd: string;
	messageCount: number;
	created: string; // ISO date
	modified: string; // ISO date
}

/**
 * A single display-ready message from session history.
 */
export interface WebSessionMessage {
	role: "user" | "assistant" | "tool";
	content: string;
	model?: string;
}

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
	sessionFile?: string;
	messageCount: number;
}

/**
 * Messages the server sends to the client.
 */
export type WebServerMessage =
	| { type: "state"; state: WebSessionState }
	| { type: "error"; message: string }
	| { type: "event"; event: AgentSessionEvent }
	| { type: "session_list"; sessions: WebSessionInfo[] }
	| { type: "session_history"; messages: WebSessionMessage[] }
	| { type: "session_renamed"; name: string };

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
	listSessions?: () => Promise<
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
}
