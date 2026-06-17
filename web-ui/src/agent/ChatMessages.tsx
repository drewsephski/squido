import { useRef, useEffect } from "react";
import { MessageBubble } from "./MessageBubble.tsx";

export interface DisplayMessage {
	id: string;
	role: "user" | "assistant" | "tool";
	content: string;
	thinking?: string[];
	streaming?: boolean;
	model?: string;
	toolCalls?: Array<{
		toolCallId: string;
		toolName: string;
		args: Record<string, unknown>;
		result?: unknown;
		isRunning?: boolean;
		isError?: boolean;
	}>;
}

interface ChatMessagesProps {
	messages: DisplayMessage[];
	onPrompt?: (text: string) => void;
}

const EXAMPLE_PROMPTS = [
	"Explore the project structure and understand how it's organized",
	"Find how authentication is implemented across the codebase",
	"Run the project checks and fix any issues",
	"Create a new utility module for common helper functions",
];

export function ChatMessages({ messages, onPrompt }: ChatMessagesProps) {
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	if (messages.length === 0) {
		return (
			<div style={emptyStyle}>
				<div style={emptyTitleStyle}>Squido</div>
				<div style={emptySubStyle}>Connect to an agent and try one of these:</div>
				<div style={promptListStyle}>
					{EXAMPLE_PROMPTS.map((p) => (
						<button
							key={p}
							onClick={() => onPrompt?.(p)}
							style={promptChipStyle}
						>
							{p}
						</button>
					))}
				</div>
			</div>
		);
	}

	return (
		<div style={containerStyle}>
			{messages.map((msg) => (
				<MessageBubble
					key={msg.id}
					role={msg.role}
					content={msg.content}
					toolCalls={msg.toolCalls}
					streaming={msg.streaming}
					model={msg.model}
				/>
			))}
			<div ref={bottomRef} />
		</div>
	);
}

const containerStyle: React.CSSProperties = {
	flex: 1,
	overflow: "auto",
	padding: "0.5rem 0",
};

const emptyStyle: React.CSSProperties = {
	flex: 1,
	display: "flex",
	flexDirection: "column",
	alignItems: "center",
	justifyContent: "center",
	gap: "0.5rem",
	padding: "2rem",
};

const emptyTitleStyle: React.CSSProperties = {
	fontFamily: "var(--font-display)",
	fontSize: "1.25rem",
	fontWeight: 600,
	color: "var(--ink-muted)",
};

const emptySubStyle: React.CSSProperties = {
	fontSize: "0.875rem",
	color: "var(--ink-dim)",
};

const promptListStyle: React.CSSProperties = {
	display: "grid",
	gridTemplateColumns: "1fr 1fr",
	gap: "0.375rem",
	marginTop: "0.75rem",
	width: "100%",
	maxWidth: 420,
};

const promptChipStyle: React.CSSProperties = {
	display: "block",
	width: "100%",
	padding: "0.5rem 0.75rem",
	fontFamily: "var(--font-mono)",
	fontSize: "0.75rem",
	color: "var(--ink-muted)",
	background: "var(--surface)",
	border: "1px solid var(--border)",
	borderRadius: "var(--radius-md)",
	cursor: "pointer",
	textAlign: "left",
	transition: "border-color 0.15s, color 0.15s",
};
