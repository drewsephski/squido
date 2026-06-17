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

	const roleClass = isUser ? "user" : isTool ? "tool" : "assistant";

	return (
		<div className="agent-msg">
			<div className="agent-msg-row">
				{/* Avatar column */}
				<div className="agent-msg-avatar-col">
					<div className={`agent-msg-avatar ${roleClass}`}>
						{isUser ? "U" : isTool ? "T" : "S"}
					</div>
				</div>

				{/* Content column */}
				<div className="agent-msg-content-col">
					{/* Header */}
					<div className="agent-msg-header">
						<span className="agent-msg-role">
							{isUser ? "You" : isTool ? "Tool" : "Squido"}
						</span>
						{model && !isUser && (
							<span className="agent-msg-model">{model}</span>
						)}
						{streaming && (
							<span className="agent-msg-streaming-dot" aria-label="Streaming" />
						)}
					</div>

					{/* Thinking trace */}
					{hasThinking && (
						<div className="agent-thinking">
							<button
								onClick={() => setThinkingOpen(!thinkingOpen)}
								className="agent-thinking-toggle"
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
									className="agent-thinking-chevron"
									style={{ transform: thinkingOpen ? "rotate(90deg)" : "rotate(0deg)" }}
								>
									<polyline points="9 18 15 12 9 6" />
								</svg>
								<span className="agent-thinking-label">Thought process</span>
								{streaming && <span className="agent-thinking-stream-dot" />}
							</button>
							{thinkingOpen && (
								<div className="agent-thinking-body">
									{thinking.map((block, i) => (
										<div key={i} className="agent-thinking-block">
											<ReactMarkdown
												remarkPlugins={[remarkGfm]}
												components={{
													p: ({ children }) => <span className="agent-thinking-text">{children}</span>,
													strong: ({ children }) => <strong style={{ color: "var(--ink-muted)", fontWeight: 600 }}>{children}</strong>,
													code: ({ children }) => <code className="agent-thinking-code">{children}</code>,
												}}
											>
												{block}
											</ReactMarkdown>
										</div>
									))}
									<div ref={thinkingEndRef} />
								</div>
							)}
						</div>
					)}

					{/* Text content */}
					{content && (
						<div className={`agent-msg-bubble ${roleClass}`}>
							{isUser ? (
								<pre className="agent-msg-content-text">{content}</pre>
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
						<div className="agent-msg-empty-streaming">
							<span className="agent-msg-streaming-dot" />
							<span className="agent-msg-empty-streaming-text">Generating response...</span>
						</div>
					)}

					{/* Tool calls */}
					{toolCalls && toolCalls.length > 0 && (
						<div style={{ marginTop: content || hasThinking ? "0.5rem" : 0 }}>
							{toolCalls.map((tc) => {
								const isOpen = expandedTool === tc.toolCallId;
								const cardClass = tc.isRunning
									? "running"
									: tc.isError
									? "error"
									: "done";
								return (
									<div key={tc.toolCallId} className={`agent-tool-card ${cardClass}`}>
										<button
											onClick={() => setExpandedTool(isOpen ? null : tc.toolCallId)}
											className="agent-tool-header"
											aria-expanded={isOpen}
										>
											<span
												className="agent-tool-status-dot"
												style={{
													background: tc.isRunning
														? "var(--accent)"
														: tc.isError
														? "var(--primary)"
														: "var(--success)",
												}}
											/>
											<span className="agent-tool-name">{tc.toolName}</span>
											{tc.isRunning && <span className="agent-tool-running">running</span>}
											<svg
												width="10"
												height="10"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												className="agent-tool-chevron"
												style={{ transform: isOpen ? "rotate(180deg)" : "rotate(0deg)" }}
											>
												<polyline points="6 9 12 15 18 9" />
											</svg>
										</button>
										{isOpen && (
											<div className="agent-tool-body">
												{tc.args && Object.keys(tc.args).length > 0 && (
													<div className="agent-tool-section">
														<div className="agent-tool-section-label">Arguments</div>
														<pre className="agent-tool-code">
															{JSON.stringify(tc.args, null, 2)}
														</pre>
													</div>
												)}
												{tc.result !== undefined && !tc.isRunning && (
													<div className="agent-tool-section">
														<div className="agent-tool-section-label">Result</div>
														<pre
															className="agent-tool-code"
															style={{
																color: tc.isError ? "var(--primary)" : undefined,
															}}
														>
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
