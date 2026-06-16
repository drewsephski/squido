import { useState, useRef, useEffect, useCallback, type KeyboardEvent } from "react";

const SLASH_COMMANDS = [
	{ cmd: "/help", desc: "Show available commands" },
	{ cmd: "/clear", desc: "Clear chat history" },
	{ cmd: "/model", desc: "Open model picker" },
	{ cmd: "/think", desc: "Set thinking level (off/low/medium/high)" },
	{ cmd: "/session", desc: "Show session information" },
	{ cmd: "/export", desc: "Export session to file" },
	{ cmd: "/changelog", desc: "View version changelog" },
];

interface ChatInputProps {
	onSend: (text: string) => void;
	disabled?: boolean;
	placeholder?: string;
}

export function ChatInput({ onSend, disabled, placeholder = "Type a message..." }: ChatInputProps) {
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

	const selectCommand = useCallback((cmd: string) => {
		setShowCommands(false);
		commandTriggered.current = false;
		onSend(cmd);
		textareaRef.current?.focus();
	}, [onSend]);

	const handleKeyDown = useCallback((e: KeyboardEvent<HTMLTextAreaElement>) => {
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
	}, [showCommands, filteredCommands, selectedIndex, selectCommand]);

	function submit() {
		const trimmed = value.trim();
		if (!trimmed || disabled) return;
		onSend(trimmed);
		setValue("");
		setShowCommands(false);
		commandTriggered.current = false;
	}

	function adjustHeight() {
		const el = textareaRef.current;
		if (el) {
			el.style.height = "auto";
			el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
		}
	}

	return (
		<div style={containerStyle}>
			<div style={inputWrapperStyle}>
				{/* Slash commands dropdown */}
				{showCommands && filteredCommands.length > 0 && (
					<div ref={dropdownRef} style={dropdownStyle}>
						{filteredCommands.map(({ cmd, desc }, i) => (
							<button
								key={cmd}
								onClick={() => selectCommand(cmd)}
								onMouseEnter={() => setSelectedIndex(i)}
								style={{
									...commandItemStyle,
									...(i === selectedIndex ? commandItemActiveStyle : {}),
								}}
							>
								<div style={commandItemMainStyle}>
									<span style={commandItemKeyStyle}>{cmd}</span>
									<span style={commandItemDescStyle}>{desc}</span>
								</div>
								{i === selectedIndex && (
									<span style={commandItemEnterStyle}>⏎</span>
								)}
							</button>
						))}
					</div>
				)}

				{/* Textarea */}
				<textarea
					ref={textareaRef}
					value={value}
					onChange={(e) => {
						setValue(e.target.value);
						adjustHeight();
					}}
					onKeyDown={handleKeyDown}
					placeholder={placeholder}
					disabled={disabled}
					rows={1}
					style={textareaStyle}
					aria-label="Chat input"
				/>
			</div>
			<button
				onClick={submit}
				disabled={disabled || !value.trim()}
				style={sendButtonStyle}
				aria-label="Send message"
			>
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
					<line x1="22" y1="2" x2="11" y2="13" />
					<polygon points="22 2 15 22 11 13 2 9 22 2" />
				</svg>
			</button>
		</div>
	);
}

const containerStyle: React.CSSProperties = {
	display: "flex",
	gap: "0.5rem",
	padding: "0.75rem 1rem",
	background: "var(--surface)",
	borderTop: "1px solid var(--border)",
	alignItems: "flex-end",
};

const inputWrapperStyle: React.CSSProperties = {
	flex: 1,
	position: "relative",
};

const textareaStyle: React.CSSProperties = {
	width: "100%",
	resize: "none",
	padding: "0.625rem 0.875rem",
	fontFamily: "var(--font-body)",
	fontSize: "0.875rem",
	lineHeight: 1.5,
	color: "var(--ink)",
	background: "var(--bg)",
	border: "1px solid var(--border)",
	borderRadius: "var(--radius-md)",
	outline: "none",
	minHeight: 40,
	maxHeight: 200,
};

const sendButtonStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "center",
	width: 40,
	height: 40,
	border: "none",
	borderRadius: "var(--radius-md)",
	background: "var(--primary)",
	color: "var(--bg)",
	cursor: "pointer",
	flexShrink: 0,
	transition: "opacity var(--duration-fast) var(--ease-out)",
};

// Dropdown
const dropdownStyle: React.CSSProperties = {
	position: "absolute",
	bottom: "100%",
	left: 0,
	right: 0,
	marginBottom: "0.25rem",
	background: "var(--surface-raised)",
	border: "1px solid var(--border-hover)",
	borderRadius: "var(--radius-md)",
	boxShadow: "var(--shadow-md)",
	overflow: "hidden",
	zIndex: 100,
};

const commandItemStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	width: "100%",
	padding: "0.4375rem 0.75rem",
	background: "none",
	border: "none",
	cursor: "pointer",
	textAlign: "left",
	color: "var(--ink)",
};

const commandItemActiveStyle: React.CSSProperties = {
	background: "var(--surface)",
};

const commandItemMainStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "0.5rem",
	minWidth: 0,
};

const commandItemKeyStyle: React.CSSProperties = {
	fontFamily: "var(--font-mono)",
	fontSize: "0.75rem",
	fontWeight: 600,
	color: "var(--primary-bright)",
	flexShrink: 0,
};

const commandItemDescStyle: React.CSSProperties = {
	fontSize: "0.6875rem",
	color: "var(--ink-dim)",
	overflow: "hidden",
	textOverflow: "ellipsis",
	whiteSpace: "nowrap",
};

const commandItemEnterStyle: React.CSSProperties = {
	fontSize: "0.625rem",
	color: "var(--ink-dim)",
	flexShrink: 0,
};
