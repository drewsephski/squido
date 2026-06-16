import { useState } from "react";

interface ToolCallCardProps {
	toolName: string;
	args?: Record<string, unknown>;
	result?: unknown;
	isRunning?: boolean;
	isError?: boolean;
}

export function ToolCallCard({ toolName, args, result, isRunning, isError }: ToolCallCardProps) {
	const [expanded, setExpanded] = useState(false);

	const statusIcon = isRunning ? "▶" : isError ? "✕" : "✓";
	const statusColor = isRunning ? "var(--accent)" : isError ? "var(--primary)" : "var(--success)";

	return (
		<div style={cardStyle}>
			<button
				onClick={() => setExpanded(!expanded)}
				style={headerStyle}
				aria-expanded={expanded}
			>
				<span style={{ color: statusColor, fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
					{statusIcon}
				</span>
				<span style={toolNameStyle}>{toolName}</span>
				<span style={expandIconStyle}>{expanded ? "▲" : "▼"}</span>
			</button>
			{expanded && (
				<div style={bodyStyle}>
					{args && (
						<div style={sectionStyle}>
							<div style={sectionLabelStyle}>Arguments</div>
							<pre style={codeStyle}>{JSON.stringify(args, null, 2)}</pre>
						</div>
					)}
					{result !== undefined && !isRunning && (
						<div style={sectionStyle}>
							<div style={sectionLabelStyle}>Result</div>
							<pre style={codeStyle}>
								{typeof result === "string" ? result : JSON.stringify(result, null, 2)}
							</pre>
						</div>
					)}
				</div>
			)}
		</div>
	);
}

const cardStyle: React.CSSProperties = {
	border: "1px solid var(--border)",
	borderRadius: "var(--radius-sm)",
	overflow: "hidden",
	marginTop: "0.375rem",
};

const headerStyle: React.CSSProperties = {
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

const toolNameStyle: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "0.8125rem",
	fontWeight: 500,
	flex: 1,
};

const expandIconStyle: React.CSSProperties = {
	fontSize: "0.625rem",
	color: "var(--ink-dim)",
};

const bodyStyle: React.CSSProperties = {
	padding: "0.5rem 0.625rem",
	background: "var(--bg)",
};

const sectionStyle: React.CSSProperties = {
	marginBottom: "0.375rem",
};

const sectionLabelStyle: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "0.6875rem",
	color: "var(--ink-muted)",
	marginBottom: "0.25rem",
	textTransform: "uppercase",
	letterSpacing: "0.05em",
};

const codeStyle: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "0.75rem",
	lineHeight: 1.4,
	color: "var(--ink-muted)",
	whiteSpace: "pre-wrap",
	wordBreak: "break-word",
};
