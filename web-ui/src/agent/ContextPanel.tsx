import type { ConnectionStatus, WebSessionState } from "./useAgentWebSocket.ts";
import "./agent.css";

interface ContextPanelProps {
	status: ConnectionStatus;
	state: WebSessionState | null;
	onSetThinking: (level: string) => void;
}

const THINKING_LEVELS = ["off", "low", "medium", "high"] as const;
const MAX_TOKENS = 200_000;

interface ToolInfo {
	id: string;
	name: string;
	description: string;
	status: "connected" | "error" | "disabled";
	provider: string;
}

const CONNECTED_TOOLS: ToolInfo[] = [
	{ id: "read", name: "Read", description: "File inspection", status: "connected", provider: "builtin" },
	{ id: "bash", name: "Bash", description: "Command execution", status: "connected", provider: "builtin" },
	{ id: "edit", name: "Edit", description: "Code modification", status: "connected", provider: "builtin" },
	{ id: "write", name: "Write", description: "File creation", status: "connected", provider: "builtin" },
	{ id: "glob", name: "Glob", description: "Pattern search", status: "connected", provider: "builtin" },
	{ id: "grep", name: "Grep", description: "Content search", status: "connected", provider: "builtin" },
];

function formatTokens(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
	return String(n);
}

function getStatusLabel(status: ConnectionStatus): string {
	switch (status) {
		case "connected": return "Connected";
		case "connecting": return "Connecting";
		case "error": return "Error";
		case "disconnected": return "Disconnected";
	}
}

function getAgentStateLabel(state: WebSessionState | null): string {
	if (!state) return "idle";
	if (state.isStreaming) return "streaming";
	return "ready";
}

export function ContextPanel({ status, state, onSetThinking }: ContextPanelProps) {
	const isConnected = status === "connected";
	const isConnecting = status === "connecting";
	const isError = status === "error";

	const dotClass = isConnected
		? (state?.isStreaming ? "streaming" : "connected")
		: isConnecting ? "connecting" : isError ? "error" : "disconnected";

	// Simulate token usage from message count
	const tokenPct = state ? Math.min((state.messageCount * 4000) / MAX_TOKENS * 100, 100) : 0;
	const tokenClass = tokenPct > 80 ? "danger" : tokenPct > 50 ? "warning" : "";

	return (
		<div className="agent-context">
			{/* Agent Status */}
			<div className="agent-context-section">
				<div className="agent-context-section-title">Agent Status</div>
				<div className="agent-status-row">
					<div className="agent-status-indicator">
						<span className={`agent-status-dot ${dotClass}`} />
						<span className="agent-status-label">{getStatusLabel(status)}</span>
					</div>
					{isConnected && state && (
						<span className={`agent-status-state${state.isStreaming ? " streaming" : ""}`}>{getAgentStateLabel(state)}</span>
					)}
				</div>
			</div>

			{/* Model */}
			<div className="agent-context-section">
				<div className="agent-context-section-title">Model</div>
				{state?.model ? (
					<>
						<div className="agent-model-box">
							<span className="agent-model-provider">{state.model.provider}</span>
							<span className="agent-model-name">{state.model.id}</span>
						</div>
						<div className="agent-context-section-title" style={{ marginTop: "0.625rem" }}>
							Thinking
						</div>
						<div className="agent-thinking-group">
							{THINKING_LEVELS.map((level) => (
								<button
									key={level}
									className={`agent-thinking-btn${state.thinkingLevel === level ? " active" : ""}`}
									onClick={() => onSetThinking(level)}
								>
									{level}
								</button>
							))}
						</div>
					</>
				) : (
					<div className="agent-info-row">
						<span className="agent-info-label" style={{ fontStyle: "italic", color: "var(--ink-dim)" }}>
							{isConnecting ? "Connecting\u2026" : "Not connected"}
						</span>
					</div>
				)}
			</div>

			{/* Connected Tools */}
			<div className="agent-context-section">
				<div className="agent-context-section-title">Connected Tools</div>
				{isConnected ? (
					CONNECTED_TOOLS.map((tool) => (
						<div key={tool.id} className="agent-tool-item">
							<div className="agent-tool-icon" title={tool.description}>
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
								</svg>
							</div>
							<div className="agent-tool-info">
								<span className="agent-tool-name">{tool.name}</span>
								<span className="agent-tool-status">{tool.provider}</span>
							</div>
							<span className={`agent-tool-toggle${tool.status === "connected" ? " enabled" : ""}`} title={tool.status}>
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
									<polyline points="22 4 12 14.01 9 11.01" />
								</svg>
							</span>
						</div>
					))
				) : (
					<div className="agent-info-row">
						<span className="agent-info-label" style={{ fontStyle: "italic", color: "var(--ink-dim)" }}>
							Connect to see tools
						</span>
					</div>
				)}
			</div>

			{/* Context Usage */}
			{isConnected && state && (
				<div className="agent-context-section">
					<div className="agent-context-section-title">Context Usage</div>
					<div className="agent-token-bar">
						<div className="agent-token-track">
							<div
								className={`agent-token-fill ${tokenClass}`}
								style={{ width: `${tokenPct}%` }}
							/>
						</div>
						<div className="agent-token-labels">
							<span>{formatTokens(state.messageCount * 4000)} used</span>
							<span>{formatTokens(MAX_TOKENS)} max</span>
						</div>
					</div>

					<div style={{ marginTop: "0.625rem" }}>
						<div className="agent-info-row">
							<span className="agent-info-label">Messages</span>
							<span className="agent-info-value">{state.messageCount}</span>
						</div>
						<div className="agent-info-row">
							<span className="agent-info-label">Session ID</span>
							<span className="agent-info-value" title={state.sessionId}>
								{state.sessionId.slice(0, 10)}\u2026
							</span>
						</div>
						{state.cwd && (
							<div className="agent-info-row">
								<span className="agent-info-label">Directory</span>
								<span className="agent-info-value" title={state.cwd}>
									{state.cwd.split("\\").pop()?.split("/").pop() || state.cwd}
								</span>
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
