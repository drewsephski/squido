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
			<div className="agent-empty">
				<div className="agent-empty-terminal">
					<div className="agent-empty-brand">squido</div>
				</div>
				<p className="agent-empty-sub">
					Connect and direct Squido to work on your codebase
				</p>
				<div className="agent-empty-chips">
					{EXAMPLE_PROMPTS.map((p) => (
						<button
							key={p}
							onClick={() => onPrompt?.(p)}
							className="agent-empty-chip"
						>
							{p}
						</button>
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="agent-messages">
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
