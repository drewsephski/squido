import { useState, useRef, useEffect, useCallback } from "react";
import type { WebSessionInfo, WebSessionState } from "./useAgentWebSocket.ts";

interface SessionSidebarProps {
	state: WebSessionState | null;
	sessions: WebSessionInfo[];
	onNewSession: () => void;
	onSelectSession: (sessionPath: string) => void;
	onRenameSession: (name: string) => void;
}

function formatRelativeTime(dateStr: string): string {
	const date = new Date(dateStr);
	const now = Date.now();
	const diffMs = now - date.getTime();
	const diffSec = Math.floor(diffMs / 1000);

	if (diffSec < 60) return "just now";
	const diffMin = Math.floor(diffSec / 60);
	if (diffMin < 60) return `${diffMin}m`;
	const diffHour = Math.floor(diffMin / 60);
	if (diffHour < 24) return `${diffHour}h`;
	const diffDay = Math.floor(diffHour / 24);
	if (diffDay < 30) return `${diffDay}d`;
	const diffMonth = Math.floor(diffDay / 30);
	return `${diffMonth}mo`;
}

export function SessionSidebar({
	state,
	sessions,
	onNewSession,
	onSelectSession,
	onRenameSession,
}: SessionSidebarProps) {
	const [search, setSearch] = useState("");
	const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
	const [menuOpen, setMenuOpen] = useState<string | null>(null);
	const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
	const [renamingId, setRenamingId] = useState<string | null>(null);
	const [renameValue, setRenameValue] = useState("");
	const menuRef = useRef<HTMLDivElement>(null);
	const renameInputRef = useRef<HTMLInputElement>(null);

	// Close menu on outside click
	useEffect(() => {
		if (!menuOpen) return;
		const handler = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setMenuOpen(null);
			}
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [menuOpen]);

	// Focus rename input when entering rename mode
	useEffect(() => {
		if (renamingId && renameInputRef.current) {
			renameInputRef.current.focus();
			renameInputRef.current.select();
		}
	}, [renamingId]);

	const handleContextMenu = useCallback((e: React.MouseEvent, id: string) => {
		e.stopPropagation();
		e.preventDefault();
		setMenuPos({ x: e.clientX, y: e.clientY });
		setMenuOpen(id);
	}, []);

	const togglePin = useCallback(
		(id: string) => {
			setPinnedIds((prev) => {
				const next = new Set(prev);
				if (next.has(id)) {
					next.delete(id);
				} else {
					next.add(id);
				}
				return next;
			});
			setMenuOpen(null);
		},
		[],
	);

	const startRename = useCallback(
		(id: string) => {
			const session = sessions.find((s) => s.id === id);
			setRenameValue(session?.name || "");
			setRenamingId(id);
			setMenuOpen(null);
		},
		[sessions],
	);

	const confirmRename = useCallback(() => {
		const trimmed = renameValue.trim();
		if (trimmed && renamingId) {
			onRenameSession(trimmed);
		}
		setRenamingId(null);
		setRenameValue("");
	}, [renameValue, renamingId, onRenameSession]);

	const cancelRename = useCallback(() => {
		setRenamingId(null);
		setRenameValue("");
	}, []);

	const handleRenameKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Enter") {
				e.preventDefault();
				confirmRename();
			} else if (e.key === "Escape") {
				e.preventDefault();
				cancelRename();
			}
		},
		[confirmRename, cancelRename],
	);

	// Filter and sort sessions
	const filtered = (() => {
		const list = sessions.filter(
			(s) => !search || (s.name ?? "").toLowerCase().includes(search.toLowerCase()),
		);
		list.sort((a, b) => {
			const aPinned = pinnedIds.has(a.id);
			const bPinned = pinnedIds.has(b.id);
			if (aPinned && !bPinned) return -1;
			if (!aPinned && bPinned) return 1;
			return new Date(b.modified).getTime() - new Date(a.modified).getTime();
		});
		return list;
	})();

	const activeId = state?.sessionId;
	const activePath = state?.sessionFile;

	return (
		<>
			<div className="agent-panel-header">
				<span className="agent-panel-title">Sessions</span>
				<span className="agent-sessions-count">{sessions.length}</span>
			</div>

			<div className="agent-sessions-search">
				<svg
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="var(--ink-dim)"
					strokeWidth="2"
					strokeLinecap="round"
					style={{ flexShrink: 0 }}
				>
					<circle cx="11" cy="11" r="8" />
					<line x1="21" y1="21" x2="16.65" y2="16.65" />
				</svg>
				<input
					type="search"
					placeholder="Search sessions..."
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					aria-label="Search sessions"
				/>
			</div>

			<div className="agent-sessions-list">
				{filtered.length === 0 && (
					<div className="agent-sessions-empty">
						{search ? "No sessions match your search" : "No sessions yet"}
					</div>
				)}
				{filtered.map((session) => (
					<div key={session.path}>
						<button
							className={`agent-session-item${session.path === activePath ? " active" : ""}`}
							onClick={() => onSelectSession(session.path)}
							onContextMenu={(e) => handleContextMenu(e, session.id)}
						>
							{pinnedIds.has(session.id) && (
								<svg
									width="14"
									height="14"
									viewBox="0 0 24 24"
									fill="var(--primary)"
									stroke="var(--primary)"
									strokeWidth="2"
									strokeLinecap="round"
									strokeLinejoin="round"
									className="agent-session-pin pinned"
								>
									<line x1="12" y1="17" x2="12" y2="22" />
									<path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
								</svg>
							)}
							<div className="agent-session-info">
								{renamingId === session.id ? (
									<input
										ref={renameInputRef}
										type="text"
										value={renameValue}
										onChange={(e) => setRenameValue(e.target.value)}
										onKeyDown={handleRenameKeyDown}
										onBlur={confirmRename}
										className="agent-session-rename-input"
										onClick={(e) => e.stopPropagation()}
										maxLength={120}
									/>
								) : (
									<div className="agent-session-name">{session.name || "Unnamed session"}</div>
								)}
								<div className="agent-session-meta">
									<span className={`agent-session-dot${session.id === activeId ? " active" : " idle"}`} />
									<span>{session.messageCount} msgs</span>
									<span>{formatRelativeTime(session.modified)}</span>
								</div>
							</div>
							<button
								className="agent-session-more"
								onClick={(e) => handleContextMenu(e, session.id)}
								aria-label="Session actions"
								title="Session actions"
							>
								<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
									<circle cx="12" cy="5" r="1.5" />
									<circle cx="12" cy="12" r="1.5" />
									<circle cx="12" cy="19" r="1.5" />
								</svg>
							</button>
						</button>
					</div>
				))}
			</div>

			<button className="agent-sessions-new" onClick={onNewSession}>
				<svg
					width="12"
					height="12"
					viewBox="0 0 24 24"
					fill="none"
					stroke="currentColor"
					strokeWidth="2"
					strokeLinecap="round"
				>
					<line x1="12" y1="5" x2="12" y2="19" />
					<line x1="5" y1="12" x2="19" y2="12" />
				</svg>
				New session
			</button>

			{/* Context menu portal */}
			{menuOpen && (
				<div ref={menuRef} className="agent-session-menu" style={{ left: menuPos.x, top: menuPos.y }}>
					<button className="agent-session-menu-item" onClick={() => togglePin(menuOpen)}>
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<line x1="12" y1="17" x2="12" y2="22" />
							<path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
						</svg>
						{pinnedIds.has(menuOpen) ? "Unpin" : "Pin session"}
					</button>
					<button className="agent-session-menu-item" onClick={() => startRename(menuOpen)}>
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
						</svg>
						Rename
					</button>
				</div>
			)}
		</>
	);
}
