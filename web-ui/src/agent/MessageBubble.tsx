import { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface ToolData {
	toolCallId: string;
	toolName: string;
	args: Record<string, unknown>;
	result?: unknown;
	isRunning?: boolean;
	isError?: boolean;
}

interface MessageBubbleProps {
	role: "user" | "assistant" | "tool";
	content: string;
	thinking?: string[];
	toolCalls?: ToolData[];
	streaming?: boolean;
	model?: string;
}

export function MessageBubble({ role, content, thinking, toolCalls, streaming, model }: MessageBubbleProps) {
	const isUser = role === "user";
	const isTool = role === "tool";
	const [thinkingOpen, setThinkingOpen] = useState(true);
	const [expandedTool, setExpandedTool] = useState<string | null>(null);
	const thinkingEndRef = useRef<HTMLDivElement>(null);
	const hasThinking = thinking && thinking.length > 0 && thinking.some((t) => t.length > 0);

	// Auto-scroll thinking content on stream updates
	useEffect(() => {
		if (streaming && hasThinking && thinkingEndRef.current) {
			thinkingEndRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
		}
	}, [thinking, streaming, hasThinking]);

	return (
		<div style={wrapperStyle}>
			<div style={rowStyle}>
				{/* Avatar column */}
				<div style={avatarColStyle}>
					<div style={{
						...avatarStyle,
						background: isUser ? "var(--accent)" : isTool ? "var(--ink-dim)" : "var(--primary-muted)",
					}}>
						{isUser ? "U" : isTool ? "T" : "S"}
					</div>
				</div>

				{/* Content column */}
				<div style={contentColStyle}>
					{/* Header */}
					<div style={headerRowStyle}>
						<span style={roleStyle}>
							{isUser ? "You" : isTool ? "Tool" : "Squido"}
						</span>
						{model && !isUser && (
							<span style={modelStyle}>{model}</span>
						)}
						{streaming && (
							<span style={streamingDotStyle} aria-label="Streaming" />
						)}
					</div>

					{/* Thinking trace — smooth, smaller italic dimmed text */}
					{hasThinking && (
						<div style={{ marginBottom: content || (toolCalls && toolCalls.length > 0) ? "0.5rem" : 0 }}>
							<button
								onClick={() => setThinkingOpen(!thinkingOpen)}
								style={thinkingToggleStyle}
								aria-expanded={thinkingOpen}
							>
								<svg
									width="12"
									height="12"
									viewBox="0 0 24 24"
									fill="none"
									stroke="currentColor"
									strokeWidth="2"
									strokeLinecap="round"
									style={{
										...thinkingChevronStyle,
										transform: thinkingOpen ? "rotate(90deg)" : "rotate(0deg)",
									}}
								>
									<polyline points="9 18 15 12 9 6" />
								</svg>
								<span style={thinkingLabelStyle}>Thought process</span>
								{streaming && <span style={thinkingStreamDotStyle} />}
							</button>
							{thinkingOpen && (
								<div style={thinkingBodyOuterStyle}>
									<div style={thinkingBodyStyle}>
										{thinking.map((block, i) => (
											<div key={i} style={thinkingBlockStyle}>
												<ReactMarkdown
													remarkPlugins={[remarkGfm]}
													components={{
														p: ({ children }) => <span style={thinkingTextStyle}>{children}</span>,
														strong: ({ children }) => <strong style={{ color: "var(--ink-muted)", fontWeight: 600 }}>{children}</strong>,
														code: ({ children }) => <code style={thinkingCodeStyle}>{children}</code>,
													}}
												>
													{block}
												</ReactMarkdown>
											</div>
										))}
										<div ref={thinkingEndRef} />
									</div>
								</div>
							)}
						</div>
					)}

					{/* Text content */}
					{content && (
						<div style={{
							...bubbleStyle,
							background: isUser ? "var(--surface-hover)" : "var(--surface)",
							border: "1px solid var(--border)",
							padding: "0.75rem 1rem",
						}}>
							{isUser ? (
								<pre style={contentTextStyle}>{content}</pre>
							) : (
								<div className="message-markdown">
									<ReactMarkdown remarkPlugins={[remarkGfm]}>
										{content}
									</ReactMarkdown>
								</div>
							)}
						</div>
					)}

					{/* Empty state for streaming assistant with no content yet */}
					{!content && streaming && !hasThinking && (
						<div style={emptyStreamingStyle}>
							<span style={streamingDotStyle} />
							<span style={emptyStreamingTextStyle}>Generating response...</span>
						</div>
					)}

					{/* Tool calls — colored status backgrounds */}
					{toolCalls && toolCalls.length > 0 && (
						<div style={{ marginTop: content || hasThinking ? "0.5rem" : 0 }}>
							{toolCalls.map((tc) => {
								const isOpen = expandedTool === tc.toolCallId;
								return (
									<div key={tc.toolCallId} style={{
										...toolCardStyle,
										borderColor: tc.isRunning
											? "var(--accent)"
											: tc.isError
											? "var(--primary)"
											: "var(--border)",
									}}>
										<button
											onClick={() => setExpandedTool(isOpen ? null : tc.toolCallId)}
											style={toolHeaderStyle}
											aria-expanded={isOpen}
										>
											<span style={{
												...toolStatusDotStyle,
												background: tc.isRunning
													? "var(--accent)"
													: tc.isError
													? "var(--primary)"
													: "var(--success)",
											}} />
											<span style={toolNameStyle}>{tc.toolName}</span>
											{tc.isRunning && <span style={toolRunningStyle}>running</span>}
											<svg
												width="10"
												height="10"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												style={{
													...toolChevronStyle,
													transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
												}}
											>
												<polyline points="6 9 12 15 18 9" />
											</svg>
										</button>
										{isOpen && (
											<div style={toolBodyStyle}>
												{tc.args && Object.keys(tc.args).length > 0 && (
													<div style={toolSectionStyle}>
														<div style={toolSectionLabelStyle}>Arguments</div>
														<pre style={toolCodeStyle}>
															{JSON.stringify(tc.args, null, 2)}
														</pre>
													</div>
												)}
												{tc.result !== undefined && !tc.isRunning && (
													<div style={toolSectionStyle}>
														<div style={toolSectionLabelStyle}>Result</div>
														<pre style={{
															...toolCodeStyle,
															color: tc.isError ? "var(--primary)" : "var(--ink-muted)",
														}}>
															{typeof tc.result === "string"
																? tc.result
																: JSON.stringify(tc.result, null, 2)}
														</pre>
													</div>
												)}
											</div>
										)}
									</div>
								);
							})}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}

// Custom scrollbar — injected once
(function injectScrollbar() {
	if (document.querySelector("[data-sb-injected]")) return;
	const style = document.createElement("style");
	style.setAttribute("data-sb-injected", "");
	style.textContent = `
		::-webkit-scrollbar { width: 8px; height: 8px; }
		::-webkit-scrollbar-track { background: transparent; }
		::-webkit-scrollbar-thumb { background: var(--border); border-radius: 4px; }
		::-webkit-scrollbar-thumb:hover { background: var(--border-hover); }
		* { scrollbar-width: thin; scrollbar-color: var(--border) transparent; }
		@keyframes thinking-pulse { 0%,100% { opacity: 0.5; } 50% { opacity: 1; } }
	`;
	document.head.appendChild(style);
})();

const wrapperStyle: React.CSSProperties = {
	padding: "0.375rem 1rem",
};

const rowStyle: React.CSSProperties = {
	display: "flex",
	gap: "0.75rem",
};

const avatarColStyle: React.CSSProperties = {
	flexShrink: 0,
	paddingTop: "0.125rem",
};

const avatarStyle: React.CSSProperties = {
	width: 28,
	height: 28,
	borderRadius: "50%",
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	fontFamily: "var(--font-mono)",
	fontSize: "0.75rem",
	fontWeight: 600,
	color: "var(--bg)",
};

const contentColStyle: React.CSSProperties = {
	flex: 1,
	minWidth: 0,
};

const headerRowStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "0.5rem",
	marginBottom: "0.25rem",
};

const roleStyle: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "0.75rem",
	fontWeight: 600,
	color: "var(--ink-muted)",
	textTransform: "uppercase",
	letterSpacing: "0.05em",
};

const modelStyle: React.CSSProperties = {
	fontSize: "0.6875rem",
	color: "var(--ink-dim)",
	fontFamily: "var(--font-mono)",
};

const streamingDotStyle: React.CSSProperties = {
	width: 8,
	height: 8,
	borderRadius: "50%",
	background: "var(--primary)",
	animation: "pulse 1s infinite",
	flexShrink: 0,
};

const bubbleStyle: React.CSSProperties = {
	borderRadius: "var(--radius-md)",
};

const contentTextStyle: React.CSSProperties = {
	fontFamily: "var(--font-body)",
	fontSize: "0.875rem",
	lineHeight: 1.6,
	color: "var(--ink)",
	whiteSpace: "pre-wrap",
	wordBreak: "break-word",
	margin: 0,
};

const emptyStreamingStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "0.5rem",
	padding: "0.5rem 0",
};

const emptyStreamingTextStyle: React.CSSProperties = {
	fontSize: "0.8125rem",
	color: "var(--ink-dim)",
	fontStyle: "italic",
};

// === Thinking trace styles ===

const thinkingToggleStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "0.375rem",
	padding: "0.25rem 0",
	background: "none",
	border: "none",
	cursor: "pointer",
	color: "var(--ink-dim)",
	fontSize: "0.6875rem",
	fontFamily: "var(--font-mono)",
	width: "100%",
	textAlign: "left",
	opacity: 0.8,
	transition: "opacity 0.15s ease",
};

const thinkingChevronStyle: React.CSSProperties = {
	flexShrink: 0,
	transition: "transform 0.2s ease",
};

const thinkingLabelStyle: React.CSSProperties = {
	fontWeight: 500,
	textTransform: "uppercase",
	letterSpacing: "0.06em",
};

const thinkingStreamDotStyle: React.CSSProperties = {
	width: 6,
	height: 6,
	borderRadius: "50%",
	background: "var(--accent)",
	animation: "thinking-pulse 1.2s ease-in-out infinite",
	flexShrink: 0,
};

const thinkingBodyOuterStyle: React.CSSProperties = {
	overflow: "hidden",
};

const thinkingBodyStyle: React.CSSProperties = {
	padding: "0.25rem 0 0.375rem 1rem",
	borderLeft: "1px solid var(--border)",
	marginLeft: "0.125rem",
};

const thinkingBlockStyle: React.CSSProperties = {
	marginBottom: "0.375rem",
	lineHeight: 1.5,
};

const thinkingTextStyle: React.CSSProperties = {
	fontSize: "0.75rem",
	color: "var(--ink-dim)",
	fontStyle: "italic",
	lineHeight: 1.6,
};

const thinkingCodeStyle: React.CSSProperties = {
	fontSize: "0.6875rem",
	fontStyle: "normal",
	padding: "0.0625rem 0.25rem",
	background: "var(--code-bg)",
	border: "1px solid var(--border)",
	borderRadius: "var(--radius-sm)",
	color: "var(--ink-dim)",
	fontFamily: "var(--font-mono)",
};

// === Tool call styles ===

const toolCardStyle: React.CSSProperties = {
	border: "1px solid var(--border)",
	borderLeft: "2px solid var(--border)",
	borderRadius: "var(--radius-sm)",
	overflow: "hidden",
	marginTop: "0.375rem",
	transition: "border-color 0.2s ease",
};

const toolHeaderStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "0.5rem",
	width: "100%",
	padding: "0.375rem 0.625rem",
	background: "var(--surface)",
	border: "none",
	color: "var(--ink)",
	cursor: "pointer",
	fontSize: "0.8125rem",
	textAlign: "left",
};

const toolStatusDotStyle: React.CSSProperties = {
	width: 7,
	height: 7,
	borderRadius: "50%",
	flexShrink: 0,
	transition: "background 0.2s ease",
};

const toolNameStyle: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "0.75rem",
	fontWeight: 500,
	flex: 1,
};

const toolRunningStyle: React.CSSProperties = {
	fontSize: "0.5625rem",
	color: "var(--accent)",
	background: "var(--accent-muted)",
	padding: "0.0625rem 0.3125rem",
	borderRadius: "var(--radius-sm)",
	fontFamily: "var(--font-mono)",
	textTransform: "uppercase",
	letterSpacing: "0.04em",
	animation: "thinking-pulse 1.2s ease-in-out infinite",
};

const toolChevronStyle: React.CSSProperties = {
	flexShrink: 0,
	color: "var(--ink-dim)",
	transition: "transform 0.2s ease",
};

const toolBodyStyle: React.CSSProperties = {
	padding: "0.5rem 0.625rem",
	background: "var(--bg)",
};

const toolSectionStyle: React.CSSProperties = {
	marginBottom: "0.375rem",
};

const toolSectionLabelStyle: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "0.625rem",
	color: "var(--ink-dim)",
	marginBottom: "0.1875rem",
	textTransform: "uppercase",
	letterSpacing: "0.05em",
};

const toolCodeStyle: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "0.6875rem",
	lineHeight: 1.4,
	color: "var(--ink-muted)",
	whiteSpace: "pre-wrap",
	wordBreak: "break-word",
};
