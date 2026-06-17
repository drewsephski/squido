import { useState, useRef, useEffect, useCallback } from "react";
import type { WebSessionState } from "./useAgentWebSocket.ts";

interface Session {
	id: string;
	name: string;
	model: string | null;
	messageCount: number;
	updatedAt: Date;
	isActive: boolean;
	isPinned: boolean;
}

interface SessionSidebarProps {
	state: WebSessionState | null;
	onNewSession: () => void;
	onSelectSession: (id: string) => void;
}

function formatRelativeTime(date: Date): string {
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

export function SessionSidebar({ state, onNewSession, onSelectSession }: SessionSidebarProps) {
	const [search, setSearch] = useState("");
	const [sessions, setSessions] = useState<Session[]>([]);
	const [pinnedIds, setPinnedIds] = useState<Set<string>>(new Set());
	const [menuOpen, setMenuOpen] = useState<string | null>(null);
	const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });
	const menuRef = useRef<HTMLDivElement>(null);

	// Sync current WebSocket session into the sessions list
	useEffect(() => {
		if (!state) return;
		setSessions((prev) => {
			const idx = prev.findIndex((s) => s.id === state.sessionId);
			const updated: Session = {
				id: state.sessionId,
				name: state.sessionName || "Unnamed session",
				model: state.model ? `${state.model.provider}/${state.model.id}` : null,
				messageCount: state.messageCount,
				updatedAt: new Date(),
				isActive: true,
				isPinned: pinnedIds.has(state.sessionId),
			};
			if (idx >= 0) {
				const next = [...prev];
				next[idx] = { ...next[idx], ...updated };
				return next;
			}
			return [updated, ...prev];
		});
	}, [state?.sessionId, state?.sessionName, state?.messageCount, state?.model]);

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

	const handleContextMenu = useCallback((e: React.MouseEvent, id: string) => {
		e.stopPropagation();
		setMenuPos({ x: e.clientX, y: e.clientY });
		setMenuOpen(id);
	}, []);

	const togglePin = useCallback((id: string) => {
		setPinnedIds((prev) => {
			const next = new Set(prev);
			if (next.has(id)) {
				next.delete(id);
			} else {
				next.add(id);
			}
			return next;
		});
		setSessions((prev) =>
			prev.map((s) => (s.id === id ? { ...s, isPinned: !s.isPinned } : s)),
		);
		setMenuOpen(null);
	}, []);

	const deleteSession = useCallback((id: string) => {
		setSessions((prev) => prev.filter((s) => s.id !== id));
		setMenuOpen(null);
	}, []);

	// Filter and sort sessions
	const filtered = (() => {
		const list = sessions.filter(
			(s) => !search || s.name.toLowerCase().includes(search.toLowerCase()),
		);
		// Sort: pinned first, then by updatedAt desc
		list.sort((a, b) => {
			if (a.isPinned && !b.isPinned) return -1;
			if (!a.isPinned && b.isPinned) return 1;
			return b.updatedAt.getTime() - a.updatedAt.getTime();
		});
		return list;
	})();

	const activeId = state?.sessionId;

	return (
		<div className="agent-sessions">
			<div className="agent-panel-header">
				<span className="agent-panel-title">Sessions</span>
				<span style={{ fontFamily: "var(--font-mono)", fontSize: "0.5625rem", color: "var(--ink-dim)" }}>
					{sessions.length}
				</span>
			</div>

			<div className="agent-sessions-search">
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--ink-dim)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
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
					<div style={{ padding: "2rem 1rem", textAlign: "center", fontSize: "0.6875rem", color: "var(--ink-dim)" }}>
						{search ? "No sessions match your search" : "No sessions yet"}
					</div>
				)}
				{filtered.map((session) => (
					<div key={session.id} style={{ position: "relative" }}>
						<button
							className={`agent-session-item${session.id === activeId ? " active" : ""}`}
							onClick={() => onSelectSession(session.id)}
							onContextMenu={(e) => handleContextMenu(e, session.id)}
						>
							{session.isPinned && (
								<svg width="14" height="14" viewBox="0 0 24 24" fill="var(--primary)" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="agent-session-pin pinned">
									<line x1="12" y1="17" x2="12" y2="22" />
									<path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
								</svg>
							)}
							<div className="agent-session-info">
								<div className="agent-session-name">{session.name}</div>
								<div className="agent-session-meta">
									<span className={`agent-session-dot${session.isActive ? " active" : " idle"}`} />
									<span>{session.model || "\u2014"}</span>
									<span>{session.messageCount} msgs</span>
									<span>{formatRelativeTime(session.updatedAt)}</span>
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
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
					<line x1="12" y1="5" x2="12" y2="19" />
					<line x1="5" y1="12" x2="19" y2="12" />
				</svg>
				New session
			</button>

			{/* Context menu portal */}
			{menuOpen && (
				<div
					ref={menuRef}
					className="agent-session-menu"
					style={{ left: menuPos.x, top: menuPos.y }}
				>
					<button className="agent-session-menu-item" onClick={() => togglePin(menuOpen)}>
						{/* Pin/unpin icon */}
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<line x1="12" y1="17" x2="12" y2="22" />
							<path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
						</svg>
						{pinnedIds.has(menuOpen) ? "Unpin" : "Pin session"}
					</button>
					<button className="agent-session-menu-item" onClick={() => { setMenuOpen(null); /* rename */ }}>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
						</svg>
						Rename
					</button>
					<button className="agent-session-menu-item danger" onClick={() => deleteSession(menuOpen)}>
						<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
							<path d="M3 6h18" />
							<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
							<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6Z" />
						</svg>
						Delete
					</button>
				</div>
			)}
		</div>
	);
}
