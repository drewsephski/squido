import { useState, useCallback, useRef, useEffect } from "react";
import { useAgentWebSocket, type AgentSessionEvent } from "./useAgentWebSocket.ts";
import { ChatMessages, type DisplayMessage } from "./ChatMessages.tsx";
import { ChatInput } from "./ChatInput.tsx";
import { StatusBar } from "./StatusBar.tsx";
import { ContextPanel } from "./ContextPanel.tsx";
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

interface ApiModel {
	provider: string;
	id: string;
	name?: string;
	contextWindow?: number;
	reasoning?: boolean;
	input?: string[];
}

export function AgentPage() {
	const [messages, setMessages] = useState<DisplayMessage[]>([]);
	const [isStreaming, setIsStreaming] = useState(false);
	const [sidebarOpen, setSidebarOpen] = useState(true);
	const [rightSidebarOpen, setRightSidebarOpen] = useState(true);
	const [availableModels, setAvailableModels] = useState<ApiModel[]>([]);
	const [modelsLoading, setModelsLoading] = useState(false);
	const [modelsError, setModelsError] = useState<string | null>(null);
	const [optimisticModel, setOptimisticModel] = useState<{ provider: string; id: string } | null>(null);
	const modelsFetchCount = useRef(0);
	const streamingMsgId = useRef<string | null>(null);
	const promptQueueRef = useRef<string[]>([]);
	const toolCalls = useRef<Map<string, {
		toolCallId: string;
		toolName: string;
		args: Record<string, unknown>;
		result?: unknown;
		isRunning: boolean;
		isError: boolean;
	}>>(new Map());

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
						prev.map((m) =>
							m.id === streamingMsgId.current ? { ...m, streaming: false } : m
						)
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
								: m
						)
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
								? { ...m, content: extractText(contentBlocks), thinking: extractThinking(contentBlocks), streaming: false }
								: m
						)
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
						prev.map((m) =>
							m.id === id
								? { ...m, toolCalls: [...(m.toolCalls ?? []), tc] }
								: m
						)
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
												tc.toolCallId === toolCallId
													? { ...tc, result: partialResult }
													: tc
											),
									  }
									: m
							)
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
													: tc
											),
									  }
									: m
							)
						);
					}
				}
				break;
			}
		}
	}, []);

	const handleStateChange = useCallback(() => {
		// State is propagated through the hook's internal state — no extra work needed
	}, []);

	const handleError = useCallback((_message: string) => {}, []);

	const { status, state, lastError, hasInitialState, send, connect, disconnect } = useAgentWebSocket({
		url: WS_URL,
		autoConnect: true,
		onEvent: handleEvent,
		onStateChange: handleStateChange,
		onError: handleError,
	});

	// Fetch available models from REST API (with retry)
	const fetchModels = useCallback(() => {
		const attempt = ++modelsFetchCount.current;
		setModelsLoading(true);
		setModelsError(null);
		fetch("/api/models")
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json() as Promise<{ models: ApiModel[] }>;
			})
			.then((data) => {
				if (attempt === modelsFetchCount.current) {
					setAvailableModels(data.models);
					setModelsError(null);
				}
			})
			.catch((err) => {
				if (attempt === modelsFetchCount.current) {
					setAvailableModels([]);
					setModelsError(err.message);
					if (modelsFetchCount.current < 3) {
						setTimeout(fetchModels, 2000);
					}
				}
			})
			.finally(() => {
				if (attempt === modelsFetchCount.current) {
					setModelsLoading(false);
				}
			});
	}, []);

	// Fetch models on mount
	useEffect(() => {
		fetchModels();
	}, [fetchModels]);

	// Re-fetch models on reconnect
	const prevStatusRef = useRef(status);
	useEffect(() => {
		if (prevStatusRef.current !== "connected" && status === "connected") {
			fetchModels();
		}
		prevStatusRef.current = status;
	}, [status, fetchModels]);

	// Clear optimistic model when server state catches up
	useEffect(() => {
		if (
			optimisticModel &&
			state?.model &&
			state.model.provider === optimisticModel.provider &&
			state.model.id === optimisticModel.id
		) {
			setOptimisticModel(null);
		}
	}, [state, optimisticModel]);

	// Flush queued prompts once connected
	useEffect(() => {
		if (status === "connected" && promptQueueRef.current.length > 0) {
			for (const p of promptQueueRef.current) {
				send({ type: "prompt", text: p });
			}
			promptQueueRef.current = [];
		}
	}, [status, send]);

	const handleSend = useCallback((text: string) => {
		const cmd = text.split(" ")[0].toLowerCase();
		const args = text.slice(cmd.length).trim();

		switch (cmd) {
			case "/clear":
				setMessages([]);
				return;

			case "/model":
				setRightSidebarOpen(true);
				return;

			case "/think":
				if (args && ["off", "low", "medium", "high"].includes(args)) {
					send({ type: "set_thinking", level: args });
				} else {
					const thinkingMsg: DisplayMessage = {
						id: uid(),
						role: "assistant",
						content: "Available thinking levels: off, low, medium, high\n\nUse `/think <level>` to set or click the buttons in the sidebar.",
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
					"## Available Commands\n",
					"| Command | Description |",
					"|---------|-------------|",
					"| `/clear` | Clear chat history |",
					"| `/model` | Open model picker |",
					"| `/think <level>` | Set thinking level (off/low/medium/high) |",
					"| `/session` | Show session information |",
					"| `/export <path>` | Export session to file |",
					"| `/changelog` | View version changelog |",
					"| `/help` | Show this help |",
					"\nCommands are handled locally in the web UI. Use the sidebar for model and thinking controls.",
				].join("\n");
				const helpMsg: DisplayMessage = {
					id: uid(),
					role: "assistant",
					content: helpText,
				};
				setMessages((prev) => [...prev, helpMsg]);
				return;
			}

			case "/changelog":
			case "/export":
				break;

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
	}, [send, state]);

	const handlePromptClick = useCallback((text: string) => {
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
	}, [send, connect, status]);

	const handleSetThinking = useCallback((level: string) => {
		send({ type: "set_thinking", level });
	}, [send]);

	const handleSetModel = useCallback((provider: string, modelId: string) => {
		send({ type: "set_model", provider, modelId });
		setOptimisticModel({ provider, id: modelId });
	}, [send]);

	const handleNewSession = useCallback(() => {
		if (status !== "connected") {
			connect();
		}
	}, [connect, status]);

	const handleSelectSession = useCallback((_id: string) => {
		// Session switching not yet implemented
	}, []);

	const isConnected = status === "connected";
	const effectiveModel = optimisticModel ?? state?.model ?? null;

	// Show connect screen when not connected and no initial state received yet
	if (!isConnected && !hasInitialState) {
		return (
			<ConnectScreen
				status={status}
				lastError={lastError}
				onConnect={connect}
			/>
		);
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
						<span className="agent-topbar-session-name">
							{state.sessionName}
						</span>
					)}
				</div>

				<div className="agent-topbar-right">
					{isConnected && effectiveModel && (
						<>
							<span className="agent-topbar-model-badge">
								<span className="agent-topbar-model-dot" />
								{effectiveModel.id}
							</span>
							{state?.thinkingLevel && state.thinkingLevel !== "off" && (
								<span className="agent-topbar-think-badge">{state.thinkingLevel}</span>
							)}
						</>
					)}
					<button
						onClick={() => setRightSidebarOpen(!rightSidebarOpen)}
						className="agent-panel-toggle"
						aria-label={rightSidebarOpen ? "Close context panel" : "Open context panel"}
					>
						{rightSidebarOpen ? (
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<line x1="6" y1="3" x2="6" y2="21" />
								<polyline points="11 9 15 12 11 15" />
							</svg>
						) : (
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
								<line x1="18" y1="3" x2="18" y2="21" />
								<polyline points="13 15 9 12 13 9" />
							</svg>
						)}
					</button>
				</div>
			</div>

			<div className="agent-body">
				{/* Left sidebar — Sessions */}
				<div className={`agent-sessions${sidebarOpen ? "" : " collapsed"}`}>
					<SessionSidebar
						state={state}
						onNewSession={handleNewSession}
						onSelectSession={handleSelectSession}
					/>
				</div>

				{/* Main chat area */}
				<div className="agent-chat">
					<StatusBar
						status={status}
						state={state}
						onConnect={connect}
						onDisconnect={disconnect}
					/>
					<ChatMessages messages={messages} onPrompt={handlePromptClick} />
					<ChatInput
						onSend={handleSend}
						disabled={status !== "connected" || isStreaming}
						placeholder={
							status === "connected"
								? isStreaming ? "Waiting for agent..." : "Ask Squido to do something..."
								: status === "connecting" ? "Connecting..."
								: "Connect to start..."
						}
					/>
				</div>

				{/* Right sidebar — Context */}
				<div className={`agent-context${rightSidebarOpen ? "" : " collapsed"}`}>
					<ContextPanel
						status={status}
						state={state}
						onSetThinking={handleSetThinking}
						onSetModel={handleSetModel}
						effectiveModel={effectiveModel}
						availableModels={availableModels}
						modelsLoading={modelsLoading}
						modelsError={modelsError}
					/>
				</div>
			</div>
		</div>
	);
}
