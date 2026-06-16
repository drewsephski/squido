import { useState, useCallback, useRef, useEffect } from "react";
import { useAgentWebSocket, type AgentSessionEvent } from "./useAgentWebSocket.ts";
import { ChatMessages, type DisplayMessage } from "./ChatMessages.tsx";
import { ChatInput } from "./ChatInput.tsx";
import { StatusBar } from "./StatusBar.tsx";

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

const SLASH_COMMANDS = [
	{ cmd: "/help", desc: "Show available commands" },
	{ cmd: "/clear", desc: "Clear chat history" },
	{ cmd: "/model", desc: "Open model picker" },
	{ cmd: "/think", desc: "Set thinking level (off/low/medium/high)" },
	{ cmd: "/session", desc: "Show session information" },
	{ cmd: "/export", desc: "Export session to file" },
	{ cmd: "/changelog", desc: "View version changelog" },
];

const THINKING_LEVELS = ["off", "low", "medium", "high"] as const;

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
	const [modelPickerOpen, setModelPickerOpen] = useState(false);
	const [modelSearch, setModelSearch] = useState("");
	const [availableModels, setAvailableModels] = useState<ApiModel[]>([]);
	const [modelsLoading, setModelsLoading] = useState(false);
	const pickerRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const streamingMsgId = useRef<string | null>(null);
	const toolCalls = useRef<Map<string, {
		toolCallId: string;
		toolName: string;
		args: Record<string, unknown>;
		result?: unknown;
		isRunning: boolean;
		isError: boolean;
	}>>(new Map());

	// Fetch available models from REST API
	useEffect(() => {
		setModelsLoading(true);
		fetch("/api/models")
			.then((r) => {
				if (!r.ok) throw new Error(`HTTP ${r.status}`);
				return r.json() as Promise<{ models: ApiModel[] }>;
			})
			.then((data) => {
				setAvailableModels(data.models);
			})
			.catch(() => {
				// Web server not running or old code — no models to show
				setAvailableModels([]);
			})
			.finally(() => setModelsLoading(false));
	}, []);

	// Focus search when picker opens
	useEffect(() => {
		if (modelPickerOpen && searchRef.current) {
			searchRef.current.focus();
		}
	}, [modelPickerOpen]);

	// Close picker on click outside
	useEffect(() => {
		if (!modelPickerOpen) return;
		const handler = (e: MouseEvent) => {
			if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
				setModelPickerOpen(false);
				setModelSearch("");
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [modelPickerOpen]);

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

	const handleStateChange = useCallback(() => {}, []);

	const handleError = useCallback((_message: string) => {}, []);

	const { status, state, send, connect, disconnect } = useAgentWebSocket({
		url: WS_URL,
		onEvent: handleEvent,
		onStateChange: handleStateChange,
		onError: handleError,
	});

	const handleSend = useCallback((text: string) => {
		// Intercept slash commands for local handling
		const cmd = text.split(" ")[0].toLowerCase();
		const args = text.slice(cmd.length).trim();

		switch (cmd) {
			case "/clear":
				setMessages([]);
				return;

			case "/model":
				setModelPickerOpen(true);
				return;

			case "/think":
				if (args && ["off", "low", "medium", "high"].includes(args)) {
					send({ type: "set_thinking", level: args });
				} else {
					// Show thinking levels in a help message
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
				// Send these to the AI for handling
				break;

			default:
				// If it starts with / but isn't recognized, treat it as a prompt
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

		// Default: send as prompt to the agent
		const userMsg: DisplayMessage = {
			id: uid(),
			role: "user",
			content: text,
		};
		setMessages((prev) => [...prev, userMsg]);
		send({ type: "prompt", text });
	}, [send, state]);

	const handleSetThinking = useCallback((level: string) => {
		send({ type: "set_thinking", level });
	}, [send]);

	const handleSetModel = useCallback((provider: string, modelId: string) => {
		send({ type: "set_model", provider, modelId });
		setModelPickerOpen(false);
		setModelSearch("");
	}, [send]);

	const isConnected = status === "connected";
	const currentModelKey = state?.model
		? `${state.model.provider}/${state.model.id}`
		: null;

	// Merge API models with current model from state (ensures current model always appears)
	const allModels = (() => {
		const seen = new Set(availableModels.map((m) => `${m.provider}/${m.id}`));
		const merged = [...availableModels];
		if (state?.model && !seen.has(currentModelKey!)) {
			merged.push({
				provider: state.model.provider,
				id: state.model.id,
			});
		}
		return merged;
	})();

	// Group models by provider, filtered by search
	const lowerSearch = modelSearch.toLowerCase();
	const modelsByProvider: Record<string, ApiModel[]> = {};
	for (const m of allModels) {
		if (
			modelSearch &&
			!m.id.toLowerCase().includes(lowerSearch) &&
			!m.provider.toLowerCase().includes(lowerSearch)
		) {
			continue;
		}
		if (!modelsByProvider[m.provider]) {
			modelsByProvider[m.provider] = [];
		}
		modelsByProvider[m.provider].push(m);
	}

	return (
		<div style={pageStyle}>
			{/* Top bar */}
			<div style={topBarStyle}>
				<div style={topBarLeftStyle}>
					<button
						onClick={() => setSidebarOpen(!sidebarOpen)}
						style={hamburgerStyle}
						aria-label={sidebarOpen ? "Close sidebar" : "Open sidebar"}
					>
						<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
							<line x1="3" y1="6" x2="21" y2="6" />
							<line x1="3" y1="12" x2="21" y2="12" />
							<line x1="3" y1="18" x2="21" y2="18" />
						</svg>
					</button>
					<span style={brandTextStyle}>Squido Agent</span>
					<span style={brandBadgeStyle}>IDE</span>
				</div>
				<div style={topBarRightStyle}>
					{status === "connected" && state?.model && (
						<>
							<span style={modelBadgeStyle}>
								<span style={modelBadgeDotStyle} />
								{state.model.id}
							</span>
							{state?.thinkingLevel && state.thinkingLevel !== "off" && (
								<span style={thinkBadgeStyle}>{state.thinkingLevel}</span>
							)}
						</>
					)}
				</div>
			</div>

			<div style={bodyStyle}>
				{/* Sidebar */}
				{sidebarOpen && (
					<div style={sidebarStyle}>
						{/* Session info */}
						<div style={cardStyle}>
							<div style={cardTitleStyle}>Session</div>
							<div style={cardBodyStyle}>
								{isConnected && state ? (
									<>
										<div style={infoRowStyle}>
											<span style={infoLabelStyle}>Name</span>
											<span style={infoValueStyle}>
												{state.sessionName || "Unnamed"}
											</span>
										</div>
										<div style={infoRowStyle}>
											<span style={infoLabelStyle}>ID</span>
											<span style={infoValueMonoStyle}>
												{state.sessionId.slice(0, 12)}...
											</span>
										</div>
										<div style={infoRowStyle}>
											<span style={infoLabelStyle}>Messages</span>
											<span style={infoValueStyle}>{state.messageCount}</span>
										</div>
										<div style={infoRowStyle}>
											<span style={infoLabelStyle}>Directory</span>
											<span style={infoValueMonoStyle}>
												{state.cwd.split("\\").pop()?.split("/").pop() || state.cwd}
											</span>
										</div>
									</>
								) : (
									<div style={disconnectedHintStyle}>
										Connect to see session info
									</div>
								)}
							</div>
						</div>

						{/* Model controls */}
						<div style={cardStyle}>
							<div style={cardTitleStyle}>Model</div>
							<div style={cardBodyStyle}>
								{isConnected && state?.model ? (
									<>
										<div style={modelCurrentBoxStyle}>
											<span style={modelProviderStyle}>{state.model.provider}</span>
											<span style={modelNameStyle}>{state.model.id}</span>
										</div>

										{/* Model picker trigger */}
										<div style={{ position: "relative" }}>
											<button
												onClick={() => setModelPickerOpen(!modelPickerOpen)}
												style={changeModelButtonStyle}
											>
												Change model
												<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ marginLeft: "0.25rem" }}>
													<polyline points="6 9 12 15 18 9" />
												</svg>
											</button>

											{/* Model picker dropdown */}
											{modelPickerOpen && (
												<div ref={pickerRef} style={pickerOverlayStyle}>
													<div style={pickerHeaderStyle}>
														<input
															ref={searchRef}
															type="text"
															placeholder="Search models..."
															value={modelSearch}
															onChange={(e) => setModelSearch(e.target.value)}
															style={pickerSearchStyle}
														/>
														<span style={pickerCountStyle}>
															{allModels.length} available
														</span>
													</div>
													<div style={pickerListStyle}>
														{modelsLoading ? (
															<div style={pickerLoadingStyle}>Loading models...</div>
														) : allModels.length === 0 && !modelSearch ? (
															<div style={pickerEmptyStyle}>
																<div style={pickerEmptyTitleStyle}>No models available</div>
																<div style={pickerEmptySubStyle}>
																	Connect to a session first, then open the model picker.
																</div>
															</div>
														) : Object.keys(modelsByProvider).length === 0 ? (
															<div style={pickerEmptyStyle}>
																No models match "{modelSearch}"
															</div>
														) : (
															Object.entries(modelsByProvider).map(([provider, models]) => (
																<div key={provider}>
																	<div style={providerGroupHeaderStyle}>
																		{provider}
																		<span style={providerCountStyle}>{models.length}</span>
																	</div>
																	{models.map((m) => {
																		const key = `${m.provider}/${m.id}`;
																		const isCurrent = key === currentModelKey;
																		return (
																			<button
																				key={key}
																				onClick={() => handleSetModel(m.provider, m.id)}
																				style={{
																					...modelItemStyle,
																					...(isCurrent ? modelItemActiveStyle : {}),
																				}}
																			>
																				<div style={modelItemMainStyle}>
																					<span style={modelItemIdStyle}>{m.id}</span>
																					{m.reasoning && (
																						<span style={modelItemTagStyle}>think</span>
																					)}
																				</div>
																				<div style={modelItemMetaStyle}>
																					{m.contextWindow && (
																						<span>{formatTokens(m.contextWindow)} ctx</span>
																					)}
																					{isCurrent && (
																						<span style={modelItemCurrentBadgeStyle}>active</span>
																					)}
																				</div>
																			</button>
																		);
																	})}
																</div>
															))
														)}
													</div>
												</div>
											)}
										</div>

										{/* Thinking level */}
										<div style={thinkingSectionStyle}>
											<label style={infoLabelStyle}>Thinking</label>
											<div style={thinkingButtonGroupStyle}>
												{THINKING_LEVELS.map((level) => (
													<button
														key={level}
														onClick={() => handleSetThinking(level)}
														style={{
															...thinkingButtonStyle,
															...(state.thinkingLevel === level
																? thinkingButtonActiveStyle
																: {}),
														}}
													>
														{level}
													</button>
												))}
											</div>
										</div>
									</>
								) : (
									<div style={disconnectedHintStyle}>
										Connect to configure model
									</div>
								)}
							</div>
						</div>

						{/* Commands */}
						<div style={cardStyle}>
							<div style={cardTitleStyle}>Commands</div>
							<div style={cardBodyStyle}>
								{SLASH_COMMANDS.map(({ cmd, desc }) => (
									<div key={cmd} style={commandRowStyle}>
										<span style={commandNameStyle}>{cmd}</span>
										<span style={commandDescStyle}>{desc}</span>
									</div>
								))}
							</div>
						</div>

						{/* Terminal hint */}
						<div style={terminalHintStyle}>
							<span style={terminalHintIconStyle}>~</span>
							<span style={terminalHintTextStyle}>
								Run <code style={inlineCodeStyle}>squido</code> in your terminal for the full TUI experience
							</span>
						</div>
					</div>
				)}

				{/* Main chat area */}
				<div style={chatAreaStyle}>
					<StatusBar
						status={status}
						state={state}
						onConnect={connect}
						onDisconnect={disconnect}
					/>
					<ChatMessages messages={messages} />
					<ChatInput
						onSend={handleSend}
						disabled={status !== "connected" || isStreaming}
						placeholder={
							status === "connected"
								? isStreaming ? "Waiting for agent..." : "Ask Squido to do something..."
								: "Connect to start..."
						}
					/>
				</div>
			</div>
		</div>
	);
}

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
	return String(n);
}

// Layout
const pageStyle: React.CSSProperties = {
	display: "flex",
	flexDirection: "column",
	height: "100vh",
	background: "var(--bg)",
};

const topBarStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	padding: "0 1rem",
	height: 44,
	background: "var(--surface-raised)",
	borderBottom: "1px solid var(--border)",
	flexShrink: 0,
};

const topBarLeftStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "0.625rem",
};

const topBarRightStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "0.5rem",
};

const hamburgerStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: 28,
	height: 28,
	background: "none",
	border: "none",
	color: "var(--ink-muted)",
	cursor: "pointer",
	borderRadius: "var(--radius-sm)",
	padding: 0,
};

const brandTextStyle: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "0.8125rem",
	fontWeight: 600,
	color: "var(--ink-muted)",
	letterSpacing: "-0.01em",
};

const brandBadgeStyle: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "0.625rem",
	fontWeight: 500,
	color: "var(--accent)",
	background: "var(--accent-muted)",
	padding: "0.0625rem 0.375rem",
	borderRadius: "var(--radius-sm)",
	opacity: 0.8,
};

const modelBadgeStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "0.375rem",
	fontFamily: "var(--font-mono)",
	fontSize: "0.6875rem",
	color: "var(--ink-muted)",
	background: "var(--surface)",
	padding: "0.1875rem 0.5rem",
	borderRadius: "var(--radius-sm)",
	border: "1px solid var(--border)",
};

const modelBadgeDotStyle: React.CSSProperties = {
	width: 6,
	height: 6,
	borderRadius: "50%",
	background: "var(--success)",
	flexShrink: 0,
};

const thinkBadgeStyle: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "0.625rem",
	color: "var(--accent)",
	background: "var(--accent-muted)",
	padding: "0.125rem 0.375rem",
	borderRadius: "var(--radius-sm)",
	textTransform: "uppercase",
	letterSpacing: "0.04em",
};

const bodyStyle: React.CSSProperties = {
	display: "flex",
	flex: 1,
	overflow: "hidden",
};

// Sidebar
const sidebarStyle: React.CSSProperties = {
	width: 260,
	flexShrink: 0,
	background: "var(--surface)",
	borderRight: "1px solid var(--border)",
	overflow: "auto",
	padding: "0.75rem",
	display: "flex",
	flexDirection: "column",
	gap: "0.75rem",
};

const cardStyle: React.CSSProperties = {
	background: "var(--surface-raised)",
	border: "1px solid var(--border)",
	borderRadius: "var(--radius-md)",
	overflow: "hidden",
};

const cardTitleStyle: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "0.625rem",
	fontWeight: 600,
	textTransform: "uppercase",
	letterSpacing: "0.08em",
	color: "var(--ink-dim)",
	padding: "0.5rem 0.75rem",
	borderBottom: "1px solid var(--border)",
};

const cardBodyStyle: React.CSSProperties = {
	padding: "0.625rem 0.75rem",
	display: "flex",
	flexDirection: "column",
	gap: "0.5rem",
};

// Info rows
const infoRowStyle: React.CSSProperties = {
	display: "flex",
	justifyContent: "space-between",
	alignItems: "center",
	gap: "0.5rem",
};

const infoLabelStyle: React.CSSProperties = {
	fontSize: "0.6875rem",
	color: "var(--ink-dim)",
	fontWeight: 500,
	flexShrink: 0,
};

const infoValueStyle: React.CSSProperties = {
	fontSize: "0.6875rem",
	color: "var(--ink-muted)",
	textAlign: "right",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
};

const infoValueMonoStyle: React.CSSProperties = {
	...infoValueStyle,
	fontFamily: "var(--font-mono)",
	fontSize: "0.625rem",
};

const disconnectedHintStyle: React.CSSProperties = {
	fontSize: "0.6875rem",
	color: "var(--ink-dim)",
	fontStyle: "italic",
};

// Model display
const modelCurrentBoxStyle: React.CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "0.125rem",
	padding: "0.375rem 0.5rem",
	background: "var(--bg)",
	borderRadius: "var(--radius-sm)",
	border: "1px solid var(--border)",
};

const modelProviderStyle: React.CSSProperties = {
	fontSize: "0.625rem",
	color: "var(--ink-dim)",
	fontFamily: "var(--font-mono)",
	textTransform: "uppercase",
	letterSpacing: "0.06em",
};

const modelNameStyle: React.CSSProperties = {
	fontSize: "0.6875rem",
	color: "var(--ink)",
	fontFamily: "var(--font-mono)",
	fontWeight: 500,
	wordBreak: "break-all",
};

const changeModelButtonStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: "100%",
	background: "none",
	border: "1px solid var(--border)",
	borderRadius: "var(--radius-sm)",
	color: "var(--ink-muted)",
	fontSize: "0.625rem",
	fontFamily: "var(--font-mono)",
	padding: "0.3125rem 0.5rem",
	cursor: "pointer",
};

// Model picker dropdown
const pickerOverlayStyle: React.CSSProperties = {
	position: "fixed",
	top: "50%",
	left: "50%",
	transform: "translate(-50%, -50%)",
	width: 400,
	maxWidth: "90vw",
	maxHeight: "70vh",
	background: "var(--surface-raised)",
	border: "1px solid var(--border-hover)",
	borderRadius: "var(--radius-lg)",
	boxShadow: "var(--shadow-lg)",
	zIndex: 1000,
	display: "flex",
	flexDirection: "column",
	overflow: "hidden",
};

const pickerHeaderStyle: React.CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "0.375rem",
	padding: "0.75rem",
	borderBottom: "1px solid var(--border)",
};

const pickerSearchStyle: React.CSSProperties = {
	width: "100%",
	padding: "0.5rem 0.625rem",
	fontFamily: "var(--font-body)",
	fontSize: "0.8125rem",
	color: "var(--ink)",
	background: "var(--bg)",
	border: "1px solid var(--border)",
	borderRadius: "var(--radius-sm)",
	outline: "none",
};

const pickerCountStyle: React.CSSProperties = {
	fontSize: "0.625rem",
	color: "var(--ink-dim)",
	fontFamily: "var(--font-mono)",
	paddingLeft: "0.125rem",
};

const pickerListStyle: React.CSSProperties = {
	flex: 1,
	overflow: "auto",
	padding: "0.25rem 0",
};

const pickerLoadingStyle: React.CSSProperties = {
	padding: "2rem",
	textAlign: "center",
	fontSize: "0.75rem",
	color: "var(--ink-dim)",
};

const pickerEmptyStyle: React.CSSProperties = {
	padding: "2rem",
	textAlign: "center",
	fontSize: "0.75rem",
	color: "var(--ink-dim)",
};

const pickerEmptyTitleStyle: React.CSSProperties = {
	fontSize: "0.8125rem",
	fontWeight: 600,
	color: "var(--ink-muted)",
	marginBottom: "0.25rem",
};

const pickerEmptySubStyle: React.CSSProperties = {
	fontSize: "0.6875rem",
	color: "var(--ink-dim)",
	lineHeight: 1.4,
};

const providerGroupHeaderStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	padding: "0.375rem 0.75rem 0.1875rem",
	fontSize: "0.625rem",
	fontFamily: "var(--font-mono)",
	fontWeight: 600,
	color: "var(--ink-dim)",
	textTransform: "uppercase",
	letterSpacing: "0.06em",
};

const providerCountStyle: React.CSSProperties = {
	fontSize: "0.5625rem",
	color: "var(--ink-dim)",
	background: "var(--surface)",
	padding: "0.0625rem 0.3125rem",
	borderRadius: "var(--radius-sm)",
};

const modelItemStyle: React.CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "0.125rem",
	width: "100%",
	padding: "0.375rem 0.75rem",
	background: "none",
	border: "none",
	cursor: "pointer",
	textAlign: "left",
	fontFamily: "var(--font-body)",
	borderLeft: "2px solid transparent",
};

const modelItemActiveStyle: React.CSSProperties = {
	background: "var(--surface)",
	borderLeftColor: "var(--primary)",
};

const modelItemMainStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "0.375rem",
};

const modelItemIdStyle: React.CSSProperties = {
	fontSize: "0.75rem",
	color: "var(--ink)",
	fontFamily: "var(--font-mono)",
	fontWeight: 500,
};

const modelItemTagStyle: React.CSSProperties = {
	fontSize: "0.5625rem",
	color: "var(--accent)",
	background: "var(--accent-muted)",
	padding: "0.0625rem 0.3125rem",
	borderRadius: "var(--radius-sm)",
	fontFamily: "var(--font-mono)",
	textTransform: "uppercase",
	letterSpacing: "0.04em",
};

const modelItemMetaStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "0.375rem",
	fontSize: "0.5625rem",
	color: "var(--ink-dim)",
	fontFamily: "var(--font-mono)",
};

const modelItemCurrentBadgeStyle: React.CSSProperties = {
	color: "var(--primary)",
	fontWeight: 600,
};

// Thinking
const thinkingSectionStyle: React.CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "0.375rem",
};

const thinkingButtonGroupStyle: React.CSSProperties = {
	display: "flex",
	gap: "0.25rem",
	flexWrap: "wrap",
};

const thinkingButtonStyle: React.CSSProperties = {
	background: "none",
	border: "1px solid var(--border)",
	borderRadius: "var(--radius-sm)",
	color: "var(--ink-dim)",
	fontSize: "0.625rem",
	fontFamily: "var(--font-mono)",
	padding: "0.1875rem 0.5rem",
	cursor: "pointer",
	transition: "all var(--duration-fast) var(--ease-out)",
};

const thinkingButtonActiveStyle: React.CSSProperties = {
	background: "var(--accent-muted)",
	borderColor: "var(--accent)",
	color: "var(--accent)",
};

// Commands
const commandRowStyle: React.CSSProperties = {
	display: "flex",
	flexDirection: "column",
	gap: "0.0625rem",
	padding: "0.25rem 0",
};

const commandNameStyle: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "0.6875rem",
	color: "var(--primary-bright)",
	fontWeight: 500,
};

const commandDescStyle: React.CSSProperties = {
	fontSize: "0.625rem",
	color: "var(--ink-dim)",
	lineHeight: 1.4,
};

// Terminal hint
const terminalHintStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "flex-start",
	gap: "0.375rem",
	padding: "0.5rem 0.75rem",
	background: "var(--bg)",
	borderRadius: "var(--radius-md)",
	border: "1px solid var(--border)",
	marginTop: "auto",
};

const terminalHintIconStyle: React.CSSProperties = {
	color: "var(--success)",
	fontFamily: "var(--font-mono)",
	fontSize: "0.75rem",
	flexShrink: 0,
	marginTop: 1,
};

const terminalHintTextStyle: React.CSSProperties = {
	fontSize: "0.625rem",
	color: "var(--ink-dim)",
	lineHeight: 1.4,
};

const inlineCodeStyle: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "0.625rem",
	padding: "0.0625rem 0.25rem",
	background: "var(--code-bg)",
	border: "1px solid var(--border)",
	borderRadius: "var(--radius-sm)",
	color: "var(--ink-muted)",
};

// Chat area
const chatAreaStyle: React.CSSProperties = {
	flex: 1,
	display: "flex",
	flexDirection: "column",
	minWidth: 0,
};
