import { useEffect, useRef, useCallback, useState } from "react";

export type ConnectionStatus = "connecting" | "connected" | "disconnected" | "error";

export type AgentSessionEvent = Record<string, unknown> & { type: string };

export interface WebSessionState {
	model: { provider: string; id: string } | null;
	thinkingLevel: string;
	isStreaming: boolean;
	cwd: string;
	sessionName: string | undefined;
	sessionId: string;
	messageCount: number;
}

export interface UseAgentWebSocketResult {
	status: ConnectionStatus;
	state: WebSessionState | null;
	lastError: string | null;
	send: (msg: unknown) => void;
	connect: () => void;
	disconnect: () => void;
}

interface UseAgentWebSocketOptions {
	url: string;
	onEvent?: (event: AgentSessionEvent) => void;
	onStateChange?: (state: WebSessionState) => void;
	onError?: (message: string) => void;
}

export function useAgentWebSocket(options: UseAgentWebSocketOptions): UseAgentWebSocketResult {
	const { url, onEvent, onStateChange, onError } = options;
	const wsRef = useRef<WebSocket | null>(null);
	const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
	const [status, setStatus] = useState<ConnectionStatus>("disconnected");
	const [state, setState] = useState<WebSessionState | null>(null);
	const [lastError, setLastError] = useState<string | null>(null);

	const connect = useCallback(() => {
		if (wsRef.current?.readyState === WebSocket.OPEN || wsRef.current?.readyState === WebSocket.CONNECTING) {
			return;
		}

		setStatus("connecting");
		setLastError(null);

		try {
			const ws = new WebSocket(url);
			wsRef.current = ws;

			ws.onopen = () => {
				setStatus("connected");
			};

			ws.onmessage = (event: MessageEvent) => {
				try {
					const msg = JSON.parse(event.data as string);

					switch (msg.type) {
						case "state":
							setState(msg.state);
							onStateChange?.(msg.state);
							break;
						case "event":
							onEvent?.(msg.event);
							break;
						case "error":
							setLastError(msg.message);
							onError?.(msg.message);
							break;
					}
				} catch {
					// ignore malformed messages
				}
			};

			ws.onclose = () => {
				setStatus("disconnected");
				wsRef.current = null;
			};

			ws.onerror = () => {
				setStatus("error");
				setLastError("WebSocket connection failed");
			};
		} catch {
			setStatus("error");
			setLastError("Failed to create WebSocket connection");
		}
	}, [url, onEvent, onStateChange, onError]);

	const disconnect = useCallback(() => {
		if (reconnectTimerRef.current) {
			clearTimeout(reconnectTimerRef.current);
			reconnectTimerRef.current = undefined;
		}
		wsRef.current?.close();
		wsRef.current = null;
		setStatus("disconnected");
	}, []);

	const send = useCallback((msg: unknown) => {
		if (wsRef.current?.readyState === WebSocket.OPEN) {
			wsRef.current.send(JSON.stringify(msg));
		}
	}, []);

	useEffect(() => {
		return () => {
			disconnect();
		};
	}, [disconnect]);

	return { status, state, lastError, send, connect, disconnect };
}
