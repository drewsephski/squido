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
}

export function ChatMessages({ messages }: ChatMessagesProps) {
	const bottomRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	if (messages.length === 0) {
		return (
			<div style={emptyStyle}>
				<div style={emptyTitleStyle}>Squido</div>
				<div style={emptySubStyle}>Connect to the agent server, then send a message to start interacting.</div>
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
