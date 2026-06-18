import { useEffect, useRef, useCallback, useState } from "react";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export type AgentSessionEvent = Record<string, unknown> & { type: string };

export interface WebSessionInfo {
	path: string;
	id: string;
	name?: string;
	cwd: string;
	messageCount: number;
	created: string;
	modified: string;
}

export interface WebSessionMessage {
	role: "user" | "assistant" | "tool";
	content: string;
	model?: string;
}

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

export interface UseAgentWebSocketResult {
	status: ConnectionStatus;
	state: WebSessionState | null;
	lastError: string | null;
	hasInitialState: boolean;
	sessions: WebSessionInfo[];
	send: (msg: unknown) => void;
	connect: () => void;
	disconnect: () => void;
}

interface UseAgentWebSocketOptions {
	url: string;
	autoConnect?: boolean;
	onEvent?: (event: AgentSessionEvent) => void;
	onStateChange?: (state: WebSessionState) => void;
	onSessionHistory?: (messages: WebSessionMessage[]) => void;
	onError?: (message: string) => void;
}

const MAX_RECONNECT_DELAY = 16_000;
const BASE_RECONNECT_DELAY = 1_000;

export function useAgentWebSocket(options: UseAgentWebSocketOptions): UseAgentWebSocketResult {
	const { url, autoConnect = true, onEvent, onStateChange, onSessionHistory, onError } = options;
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const reconnectAttemptRef = useRef(0);
	const disconnectRef = useRef(false);
	const [status, setStatus] = useState<ConnectionStatus>("disconnected");
	const [state, setState] = useState<WebSessionState | null>(null);
	const [lastError, setLastError] = useState<string | null>(null);
	const [hasInitialState, setHasInitialState] = useState(false);
	const [sessions, setSessions] = useState<WebSessionInfo[]>([]);

	const connect = useCallback(() => {
		if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
			return;
		}

		disconnectRef.current = false;
		setStatus("connecting");
		setLastError(null);

		try {
			const ws = new WebSocket(url);
			wsRef.current = ws;

			ws.onopen = () => {
				setStatus("connected");
				reconnectAttemptRef.current = 0;
			};

			ws.onmessage = (event: MessageEvent) => {
				try {
					const msg = JSON.parse(event.data as string);

					switch (msg.type) {
						case "state":
							setState(msg.state);
							setHasInitialState(true);
							onStateChange?.(msg.state);
							break;
						case "event":
							onEvent?.(msg.event);
							break;
						case "error":
							setLastError(msg.message);
							onError?.(msg.message);
							break;
						case "session_list":
							setSessions(msg.sessions ?? []);
							break;
						case "session_history":
							onSessionHistory?.(msg.messages ?? []);
							break;
						case "session_renamed":
							// State update will follow via the state message
							break;
					}
				} catch {
					// ignore malformed messages
				}
			};

			ws.onclose = () => {
				setStatus("disconnected");
				wsRef.current = null;

				if (!disconnectRef.current && reconnectAttemptRef.current < 5) {
					const delay = Math.min(
						BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptRef.current),
						MAX_RECONNECT_DELAY,
					);
					reconnectAttemptRef.current++;
					reconnectTimerRef.current = setTimeout(() => {
						connect();
					}, delay);
				}
			};

			ws.onerror = () => {
				setStatus("error");
				setLastError("WebSocket connection failed");
			};
		} catch {
			setStatus("error");
			setLastError("Failed to create WebSocket connection");
		}
	}, [url, onEvent, onStateChange, onSessionHistory, onError]);

	const disconnect = useCallback(() => {
		disconnectRef.current = true;
		if (reconnectTimerRef.current) {
			clearTimeout(reconnectTimerRef.current);
			reconnectTimerRef.current = undefined;
		}
		wsRef.current?.close();
		wsRef.current = null;
		setStatus("disconnected");
		setHasInitialState(false);
	}, []);

	const send = useCallback((msg: unknown) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(msg));
		}
	}, []);

	useEffect(() => {
		if (autoConnect) {
			connect();
		}
		return () => {
			disconnect();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, []);

	return { status, state, lastError, hasInitialState, sessions, send, connect, disconnect };
}
