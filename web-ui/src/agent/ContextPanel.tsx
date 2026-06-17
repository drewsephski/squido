import { useState, useRef, useEffect } from "react";
import type { ConnectionStatus, WebSessionState } from "./useAgentWebSocket.ts";
import "./agent.css";

interface ContextPanelProps {
	status: ConnectionStatus;
	state: WebSessionState | null;
	onSetThinking: (level: string) => void;
	onSetModel: (provider: string, modelId: string) => void;
	effectiveModel: { provider: string; id: string } | null;
	availableModels: ApiModel[];
	modelsLoading: boolean;
	modelsError: string | null;
}

interface ApiModel {
	provider: string;
	id: string;
	name?: string;
	contextWindow?: number;
	reasoning?: boolean;
	input?: string[];
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

export function ContextPanel({ status, state, onSetThinking, onSetModel, effectiveModel, availableModels, modelsLoading, modelsError }: ContextPanelProps) {
	const [pickerOpen, setPickerOpen] = useState(false);
	const [modelSearch, setModelSearch] = useState("");
	const searchRef = useRef<HTMLInputElement>(null);
	const pickerRef = useRef<HTMLDivElement>(null);

	const isConnected = status === "connected";
	const isConnecting = status === "connecting";
	const isError = status === "error";

	const dotClass = isConnected
		? (state?.isStreaming ? "streaming" : "connected")
		: isConnecting ? "connecting" : isError ? "error" : "disconnected";

	// Simulate token usage from message count
	const tokenPct = state ? Math.min((state.messageCount * 4000) / MAX_TOKENS * 100, 100) : 0;
	const tokenClass = tokenPct > 80 ? "danger" : tokenPct > 50 ? "warning" : "";

	// Autofocus search when picker opens
	useEffect(() => {
		if (pickerOpen && searchRef.current) {
			searchRef.current.focus();
		}
	}, [pickerOpen]);

	// Close picker on click outside / Escape
	useEffect(() => {
		if (!pickerOpen) return;
		const close = () => {
			setPickerOpen(false);
			setModelSearch("");
		};
		const clickHandler = (e: MouseEvent) => {
			if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
				close();
			}
		};
		const keyHandler = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				close();
			}
		};
		const raf = requestAnimationFrame(() => {
			document.addEventListener("mousedown", clickHandler);
			document.addEventListener("keydown", keyHandler);
		});
		return () => {
			cancelAnimationFrame(raf);
			document.removeEventListener("mousedown", clickHandler);
			document.removeEventListener("keydown", keyHandler);
		};
	}, [pickerOpen]);

	// Merge API models with current model (ensures current model always appears in the list)
	const currentModelKey = effectiveModel
		? `${effectiveModel.provider}/${effectiveModel.id}`
		: null;

	const allModels = (() => {
		const seen = new Set(availableModels.map((m) => `${m.provider}/${m.id}`));
		const merged = [...availableModels];
		if (effectiveModel && !seen.has(currentModelKey!)) {
			merged.push({
				provider: effectiveModel.provider,
				id: effectiveModel.id,
			});
		}
		return merged;
	})();

	// Group and filter models by search
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

	const handleSelect = (provider: string, modelId: string) => {
		onSetModel(provider, modelId);
		setPickerOpen(false);
		setModelSearch("");
	};

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
				{effectiveModel ? (
					<>
						<div className="agent-model-box">
							<span className="agent-model-provider">{effectiveModel.provider}</span>
							<span className="agent-model-name">{effectiveModel.id}</span>
						</div>

						{/* Inline model picker */}
						<div ref={pickerRef} className="agent-picker-wrapper">
							<button
								onClick={() => setPickerOpen(!pickerOpen)}
								className="agent-model-change-btn"
							>
								{pickerOpen ? "Cancel" : "Change model"}
							</button>

							{pickerOpen && (
								<div className="agent-picker-dropdown">
									<div className="agent-picker-search">
										<input
											ref={searchRef}
											type="text"
											placeholder="Search models..."
											value={modelSearch}
											onChange={(e) => setModelSearch(e.target.value)}
											className="agent-picker-input"
										/>
										<span className="agent-picker-count">{allModels.length} available</span>
									</div>
									<div className="agent-picker-scroll">
										{modelsLoading ? (
											<div className="agent-picker-status">Loading models...</div>
										) : allModels.length === 0 && !modelSearch ? (
											<div className="agent-picker-empty">
												<div style={{ fontWeight: 600, marginBottom: "0.125rem" }}>No models available</div>
												<div style={{ fontSize: "0.625rem", color: "var(--ink-dim)" }}>
													{modelsError
														? `Failed to load: ${modelsError}`
														: "Configure providers in settings."}
												</div>
											</div>
										) : Object.keys(modelsByProvider).length === 0 ? (
											<div className="agent-picker-empty">
												No models match &ldquo;{modelSearch}&rdquo;
											</div>
										) : (
											Object.entries(modelsByProvider).map(([provider, models]) => (
												<div key={provider}>
													<div className="agent-picker-provider">
														{provider}
														<span className="agent-picker-provider-count">{models.length}</span>
													</div>
													{models.map((m) => {
														const key = `${m.provider}/${m.id}`;
														const isCurrent = key === currentModelKey;
														return (
															<button
																key={key}
																onClick={() => handleSelect(m.provider, m.id)}
																className={`agent-picker-model${isCurrent ? " active" : ""}`}
															>
																<div className="agent-picker-model-main">
																	<span className="agent-picker-model-name">
																		{m.name && m.name !== m.id ? m.name : m.id}
																	</span>
																	{m.reasoning && (
																		<span className="agent-picker-model-tag">think</span>
																	)}
																</div>
																<div className="agent-picker-model-meta">
																	{m.contextWindow != null && (
																		<span>{formatTokens(m.contextWindow)} ctx</span>
																	)}
																	{isCurrent && (
																		<span style={{ color: "var(--primary)", fontWeight: 600 }}>active</span>
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
						<div className="agent-context-section-title mt">
							Thinking
						</div>
						<div className="agent-thinking-group">
							{THINKING_LEVELS.map((level) => (
								<button
									key={level}
									className={`agent-thinking-btn${state?.thinkingLevel === level ? " active" : ""}`}
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

					<div className="agent-context-info-mt">
						<div className="agent-info-row">
							<span className="agent-info-label">Messages</span>
							<span className="agent-info-value">{state.messageCount}</span>
						</div>
						<div className="agent-info-row">
							<span className="agent-info-label">Session ID</span>
							<span className="agent-info-value" title={state.sessionId}>
								{state.sessionId.slice(0, 10)}&hellip;
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
