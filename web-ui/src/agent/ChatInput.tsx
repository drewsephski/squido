import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";

const SLASH_COMMANDS = [
	{ cmd: "/help", desc: "Show available commands" },
	{ cmd: "/clear", desc: "Clear chat history" },
	{ cmd: "/model", desc: "Model management hint" },
	{ cmd: "/think", desc: "Set thinking level (off/low/medium/high)" },
	{ cmd: "/session", desc: "Show session information" },
];

interface ChatInputProps {
	onSend: (text: string) => void;
	onCancel?: () => void;
	disabled?: boolean;
	isStreaming?: boolean;
	placeholder?: string;
}

export function ChatInput({ onSend, onCancel, disabled, isStreaming, placeholder = "Type a message..." }: ChatInputProps) {
	const [value, setValue] = useState("");
	const [showCommands, setShowCommands] = useState(false);
	const [selectedIndex, setSelectedIndex] = useState(0);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const commandTriggered = useRef(false);

	// Filter commands based on current input
	const filteredCommands = (() => {
		if (!commandTriggered.current || !value.startsWith("/")) return [];
		const partial = value.slice(1).toLowerCase();
		return SLASH_COMMANDS.filter((c) => !partial || c.cmd.slice(1).startsWith(partial));
	})();

	useEffect(() => {
		if (!disabled && textareaRef.current) {
			textareaRef.current.focus();
		}
	}, [disabled]);

	// Detect "/" trigger
	useEffect(() => {
		if (value === "/") {
			commandTriggered.current = true;
			setShowCommands(true);
			setSelectedIndex(0);
		} else if (!value.startsWith("/")) {
			commandTriggered.current = false;
			setShowCommands(false);
		} else if (value.startsWith("/") && filteredCommands.length === 0) {
			setShowCommands(false);
		} else {
			setShowCommands(true);
		}
	}, [value, filteredCommands.length]);

	// Close on click outside
	useEffect(() => {
		if (!showCommands) return;
		const handler = (e: MouseEvent) => {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node) &&
				textareaRef.current &&
				!textareaRef.current.contains(e.target as Node)
			) {
				setShowCommands(false);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [showCommands]);

	const selectCommand = useCallback(
		(cmd: string) => {
			setShowCommands(false);
			commandTriggered.current = false;
			onSend(cmd);
			textareaRef.current?.focus();
		},
		[onSend],
	);

	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (showCommands && filteredCommands.length > 0) {
				if (e.key === "ArrowDown") {
					e.preventDefault();
					setSelectedIndex((prev) => (prev + 1) % filteredCommands.length);
					return;
				}
				if (e.key === "ArrowUp") {
					e.preventDefault();
					setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length);
					return;
				}
				if (e.key === "Enter" && !e.shiftKey) {
					e.preventDefault();
					selectCommand(filteredCommands[selectedIndex].cmd);
					return;
				}
				if (e.key === "Escape") {
					setShowCommands(false);
					return;
				}
			}

			if (e.key === "Enter" && !e.shiftKey && !showCommands) {
				e.preventDefault();
				submit();
			}
		},
		[showCommands, filteredCommands, selectedIndex, selectCommand],
	);

	function submit() {
		const trimmed = value.trim();
		if (!trimmed || disabled) return;
		onSend(trimmed);
		setValue("");
		setShowCommands(false);
		commandTriggered.current = false;
	}

	return (
		<div className="agent-chat-input-wrap">
			<div className="agent-chat-input-area">
				{/* Slash commands dropdown */}
				{showCommands && filteredCommands.length > 0 && (
					<div ref={dropdownRef} className="agent-slash-dropdown">
						{filteredCommands.map(({ cmd, desc }, i) => (
							<button
								key={cmd}
								onClick={() => selectCommand(cmd)}
								onMouseEnter={() => setSelectedIndex(i)}
								className={`agent-slash-item${i === selectedIndex ? " active" : ""}`}
							>
								<div className="agent-slash-main">
									<span className="agent-slash-key">{cmd}</span>
									<span className="agent-slash-desc">{desc}</span>
								</div>
								{i === selectedIndex && <span className="agent-slash-enter">Enter</span>}
							</button>
						))}
					</div>
				)}

				{/* Textarea */}
				<textarea
					ref={textareaRef}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					disabled={disabled}
					rows={1}
					className="agent-chat-input"
					aria-label="Chat input"
				/>
				{/* Action button — send or stop */}
				{isStreaming && onCancel ? (
					<button
						onClick={onCancel}
						className="agent-stop-btn"
						aria-label="Stop generation"
						title="Stop generation"
					>
						<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
							<rect x="6" y="6" width="12" height="12" rx="1" />
						</svg>
					</button>
				) : (
					<button
						onClick={submit}
						disabled={disabled || !value.trim()}
						className="agent-send-btn"
						aria-label="Send message"
					>
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
							<line x1="22" y1="2" x2="11" y2="13" />
							<polygon points="22 2 15 22 11 13 2 9 22 2" />
						</svg>
					</button>
				)}
			</div>
		</div>
	);
}
