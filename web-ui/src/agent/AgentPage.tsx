import { useState, useCallback, useRef, useEffect } from "react";
import { useAgentWebSocket, type AgentSessionEvent, type WebSessionMessage } from "./useAgentWebSocket.ts";
import { ChatMessages, type DisplayMessage } from "./ChatMessages.tsx";
import { ChatInput } from "./ChatInput.tsx";
import { StatusBar } from "./StatusBar.tsx";
import { SessionSidebar } from "./SessionSidebar.tsx";
import { ConnectScreen } from "./ConnectScreen.tsx";
import "./agent.css";

const WS_URL = `${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/ws`;

let nextId = 1;
function uid(): string {
	return `msg_${nextId++}`;
}

/** Extract plain text from AssistantMessage content blocks array */
function extractText(content: unknown): string {
	if (typeof content === "string") return content;
	if (Array.isArray(content)) {
		return content
			.filter((block: any) => block?.type === "text")
			.map((block: any) => {
				const text = block.text ?? "";
				return typeof text === "string" ? text : "";
			})
			.join("\n");
	}
	return "";
}

/** Extract thinking blocks from AssistantMessage content blocks array */
function extractThinking(content: unknown): string[] {
	if (!Array.isArray(content)) return [];
	return content
		.filter((block: any) => block?.type === "thinking" && block?.thinking)
		.map((block: any) => {
			const t = block.thinking;
			return typeof t === "string" ? t : "";
		})
		.filter(Boolean);
}

const THINKING_LEVELS = ["off", "low", "medium", "high"] as const;

/** Convert WebSessionMessage to DisplayMessage */
function sessionHistoryToDisplay(history: WebSessionMessage[]): DisplayMessage[] {
	// Reset id counter for clean history
	nextId = 1;
	return history.map((msg) => ({
		id: uid(),
		role: msg.role,
		content: msg.content,
		model: msg.model,
		thinking: msg.thinking,
	}));
}

export function AgentPage() {
	const [messages, setMessages] = useState<DisplayMessage[]>([]);
	const [isStreaming, setIsStreaming] = useState(false);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [thinkingOpen, setThinkingOpen] = useState(false);
	const thinkingRef = useRef<HTMLDivElement>(null);
	const streamingMsgId = useRef<string | null>(null);
	const promptQueueRef = useRef<string[]>([]);
	const toolCalls = useRef<
		Map<
			string,
			{
				toolCallId: string;
				toolName: string;
				args: Record<string, unknown>;
				result?: unknown;
				isRunning: boolean;
				isError: boolean;
			}
		>
	>(new Map());

	const handleEvent = useCallback((event: AgentSessionEvent) => {
		switch (event.type) {
			case "agent_start":
				setIsStreaming(true);
				break;

			case "agent_end":
				setIsStreaming(false);
				streamingMsgId.current = null;
				toolCalls.current.clear();
				break;

			case "turn_start":
				break;

			case "turn_end":
				if (streamingMsgId.current) {
					setMessages((prev) =>
						prev.map((m) => (m.id === streamingMsgId.current ? { ...m, streaming: false } : m)),
					);
					streamingMsgId.current = null;
				}
				break;

			case "message_start": {
				const msg = event.message as Record<string, unknown>;
				const role = msg.role as string;
				const model = msg.model as string | undefined;
				const contentBlocks = msg.content;

				if (role === "assistant") {
					const id = uid();
					streamingMsgId.current = id;
					setMessages((prev) => [
						...prev,
						{
							id,
							role: "assistant",
							content: extractText(contentBlocks),
							thinking: extractThinking(contentBlocks),
							streaming: true,
							model,
							toolCalls: [],
						},
					]);
				}
				break;
			}

			case "message_update": {
				const msg = event.message as Record<string, unknown>;
				const contentBlocks = msg.content;
				const id = streamingMsgId.current;
				if (id) {
					setMessages((prev) =>
						prev.map((m) =>
							m.id === id
								? { ...m, content: extractText(contentBlocks), thinking: extractThinking(contentBlocks) }
								: m,
						),
					);
				}
				break;
			}

			case "message_end": {
				const msg = event.message as Record<string, unknown>;
				const contentBlocks = msg.content;
				const id = streamingMsgId.current;
				if (id) {
					setMessages((prev) =>
						prev.map((m) =>
							m.id === id
								? {
										...m,
										content: extractText(contentBlocks),
										thinking: extractThinking(contentBlocks),
										streaming: false,
									}
								: m,
						),
					);
					streamingMsgId.current = null;
				}
				break;
			}

			case "tool_execution_start": {
				const ev = event as Record<string, unknown>;
				const toolCallId = ev.toolCallId as string;
				const toolName = ev.toolName as string;
				const args = ev.args as Record<string, unknown>;

				toolCalls.current.set(toolCallId, {
					toolCallId,
					toolName,
					args,
					isRunning: true,
					isError: false,
				});

				const id = streamingMsgId.current;
				if (id) {
					const tc = toolCalls.current.get(toolCallId)!;
					setMessages((prev) =>
						prev.map((m) => (m.id === id ? { ...m, toolCalls: [...(m.toolCalls ?? []), tc] } : m)),
					);
				}
				break;
			}

			case "tool_execution_update": {
				const ev = event as Record<string, unknown>;
				const toolCallId = ev.toolCallId as string;
				const partialResult = ev.partialResult;

				const existing = toolCalls.current.get(toolCallId);
				if (existing) {
					existing.result = partialResult;
					const id = streamingMsgId.current;
					if (id) {
						setMessages((prev) =>
							prev.map((m) =>
								m.id === id
									? {
											...m,
											toolCalls: (m.toolCalls ?? []).map((tc) =>
												tc.toolCallId === toolCallId ? { ...tc, result: partialResult } : tc,
											),
										}
									: m,
							),
						);
					}
				}
				break;
			}

			case "tool_execution_end": {
				const ev = event as Record<string, unknown>;
				const toolCallId = ev.toolCallId as string;
				const result = ev.result;
				const isError = ev.isError as boolean;

				const existing = toolCalls.current.get(toolCallId);
				if (existing) {
					existing.isRunning = false;
					existing.isError = isError;
					existing.result = result;
					const id = streamingMsgId.current;
					if (id) {
						setMessages((prev) =>
							prev.map((m) =>
								m.id === id
									? {
											...m,
											toolCalls: (m.toolCalls ?? []).map((tc) =>
												tc.toolCallId === toolCallId
													? { ...tc, result, isRunning: false, isError }
													: tc,
											),
										}
									: m,
							),
						);
					}
				}
				break;
			}
		}
	}, []);

	const handleStateChange = useCallback(() => {}, []);

	const handleError = useCallback((_message: string) => {}, []);

	const handleSessionHistory = useCallback((history: WebSessionMessage[]) => {
		setMessages(sessionHistoryToDisplay(history));
	}, []);

	const { status, state, lastError, hasInitialState, sessions, send, connect, disconnect } = useAgentWebSocket({
		url: WS_URL,
		autoConnect: true,
		onEvent: handleEvent,
		onStateChange: handleStateChange,
		onSessionHistory: handleSessionHistory,
		onError: handleError,
	});

	useEffect(() => {
		if (status === "connected" && promptQueueRef.current.length > 0) {
			for (const p of promptQueueRef.current) {
				send({ type: "prompt", text: p });
			}
			promptQueueRef.current = [];
		}
	}, [status, send]);

	useEffect(() => {
		if (!thinkingOpen) return;
		const handler = (e: MouseEvent) => {
			if (thinkingRef.current && !thinkingRef.current.contains(e.target as Node)) {
				setThinkingOpen(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [thinkingOpen]);

	const handleSend = useCallback(
		(text: string) => {
			const cmd = text.split(" ")[0].toLowerCase();
			const args = text.slice(cmd.length).trim();

			switch (cmd) {
				case "/clear":
					setMessages([]);
					return;

				case "/model": {
					const hint: DisplayMessage = {
						id: uid(),
						role: "assistant",
						content:
							"Run `/model` in your terminal to change the active model. The web UI uses whatever model is configured in the CLI session.",
					};
					setMessages((prev) => [...prev, hint]);
					return;
				}

				case "/think":
					if (args && THINKING_LEVELS.includes(args as (typeof THINKING_LEVELS)[number])) {
						send({ type: "set_thinking", level: args });
					} else {
						const thinkingMsg: DisplayMessage = {
							id: uid(),
							role: "assistant",
							content:
								"Available thinking levels: `off`, `low`, `medium`, `high`\n\nUse `/think <level>` to set or click the thinking selector in the top bar.",
						};
						setMessages((prev) => [...prev, thinkingMsg]);
					}
					return;

				case "/session":
					if (state) {
						const info = [
							`**Session:** ${state.sessionName || "Unnamed"}`,
							`**ID:** ${state.sessionId}`,
							`**Messages:** ${state.messageCount}`,
							`**Directory:** ${state.cwd}`,
							`**Model:** ${state.model?.provider}/${state.model?.id}`,
							`**Thinking:** ${state.thinkingLevel}`,
						].join("\n");
						const infoMsg: DisplayMessage = {
							id: uid(),
							role: "assistant",
							content: info,
						};
						setMessages((prev) => [...prev, infoMsg]);
					}
					return;

				case "/help": {
					const helpText = [
						"## Commands\n",
						"| Command | Description |",
						"|---------|-------------|",
						"| `/clear` | Clear chat history |",
						"| `/model` | Model management hint |",
						"| `/think <level>` | Set thinking level (off, low, medium, high) |",
						"| `/session` | Show session details |",
						"| `/help` | Show this help |",
						"\nModel and provider management is handled via the CLI. Sessions can be switched using the sidebar.",
					].join("\n");
					const helpMsg: DisplayMessage = {
						id: uid(),
						role: "assistant",
						content: helpText,
					};
					setMessages((prev) => [...prev, helpMsg]);
					return;
				}

				default:
					if (cmd.startsWith("/")) {
						const unknownMsg: DisplayMessage = {
							id: uid(),
							role: "assistant",
							content: `Unknown command: ${cmd}\n\nType \`/help\` to see available commands.`,
						};
						setMessages((prev) => [...prev, unknownMsg]);
						return;
					}
			}

			const userMsg: DisplayMessage = {
				id: uid(),
				role: "user",
				content: text,
			};
			setMessages((prev) => [...prev, userMsg]);
			send({ type: "prompt", text });
		},
		[send, state],
	);

	const handlePromptClick = useCallback(
		(text: string) => {
			const userMsg: DisplayMessage = {
				id: uid(),
				role: "user",
				content: text,
			};
			setMessages((prev) => [...prev, userMsg]);

			if (status === "connected") {
				send({ type: "prompt", text });
			} else {
				connect();
				promptQueueRef.current.push(text);
			}
		},
		[send, connect, status],
	);

	const handleSetThinking = useCallback(
		(level: string) => {
			send({ type: "set_thinking", level });
			setThinkingOpen(false);
		},
		[send],
	);

	const handleNewSession = useCallback(() => {
		if (status !== "connected") {
			connect();
			return;
		}
		setMessages([]);
		send({ type: "new_session" });
	}, [connect, status, send]);

	const handleSelectSession = useCallback(
		(sessionPath: string) => {
			if (status !== "connected") return;
			// Don't reload the current session
			if (state?.sessionFile === sessionPath) return;
			setMessages([]);
			send({ type: "load_session", sessionPath });
		},
		[status, send, state?.sessionFile],
	);

	const handleRenameSession = useCallback(
		(name: string) => {
			if (status !== "connected") return;
			send({ type: "rename_session", name });
		},
		[status, send],
	);

	const isConnected = status === "connected";
	const currentThinking = state?.thinkingLevel ?? "off";

	if (!isConnected && !hasInitialState) {
		return <ConnectScreen status={status} lastError={lastError} onConnect={connect} />;
	}

	return (
		<div className="agent-workspace">
			{/* Top bar */}
			<div className="agent-topbar">
				<div className="agent-topbar-left">
					<button
						onClick={() => setSidebarOpen(!sidebarOpen)}
						className="agent-panel-toggle"
						aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
					>
						{sidebarOpen ? (
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<line x1="18" y1="3" x2="18" y2="21" />
								<polyline points="13 15 9 12 13 9" />
							</svg>
						) : (
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<line x1="6" y1="3" x2="6" y2="21" />
								<polyline points="11 9 15 12 11 15" />
							</svg>
						)}
					</button>
					<span className="agent-topbar-brand">
						Squi<span className="agent-topbar-brand-amber">do</span>
					</span>
				</div>

				<div className="agent-topbar-center">
					{isConnected && state?.sessionName && (
						<span className="agent-topbar-session-name">{state.sessionName}</span>
					)}
				</div>

				<div className="agent-topbar-right">
					{isConnected && (
						<div ref={thinkingRef} className="agent-thinking-topbar">
							<button
								onClick={() => setThinkingOpen(!thinkingOpen)}
								className={`agent-thinking-current${thinkingOpen ? " open" : ""}`}
							>
								think: {currentThinking}
								<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<polyline points="6 9 12 15 18 9" />
								</svg>
							</button>
							{thinkingOpen && (
								<div className="agent-thinking-popover">
									{THINKING_LEVELS.map((level) => (
										<button
											key={level}
											onClick={() => handleSetThinking(level)}
											className={`agent-thinking-option${currentThinking === level ? " active" : ""}`}
										>
											{level}
										</button>
									))}
								</div>
							)}
						</div>
					)}

					{isConnected && state?.model && (
						<span className="agent-topbar-model-hint" title={`${state.model.provider}/${state.model.id} — use /model in terminal to change`}>
							{state.model.id}
						</span>
					)}
				</div>
			</div>

			<div className="agent-body">
				{/* Left sidebar — Sessions */}
				<div className={`agent-sessions${sidebarOpen ? "" : " collapsed"}`}>
					<SessionSidebar
						state={state}
						sessions={sessions}
						onNewSession={handleNewSession}
						onSelectSession={handleSelectSession}
						onRenameSession={handleRenameSession}
					/>
				</div>

				{/* Main chat area */}
				<div className="agent-chat">
					<StatusBar status={status} state={state} onConnect={connect} onDisconnect={disconnect} />
					<ChatMessages messages={messages} onPrompt={handlePromptClick} />
					<ChatInput
						onSend={handleSend}
						disabled={status !== "connected" || isStreaming}
						placeholder={
							status === "connected"
								? isStreaming
									? "Waiting for agent..."
									: "Ask Squido to do something..."
								: status === "connecting"
									? "Connecting..."
									: "Connect to start..."
						}
					/>
				</div>
			</div>
		</div>
	);
}
