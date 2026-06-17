import type { ConnectionStatus, WebSessionState } from "./useAgentWebSocket.ts";

interface StatusBarProps {
	status: ConnectionStatus;
	state: WebSessionState | null;
	onConnect: () => void;
	onDisconnect: () => void;
}

export function StatusBar({ status, state, onConnect, onDisconnect }: StatusBarProps) {
	const statusColors: Record<ConnectionStatus, string> = {
		connecting: "var(--accent)",
		connected: "var(--success)",
		disconnected: "var(--ink-dim)",
		error: "var(--primary)",
	};

	const isConnected = status === "connected";

	return (
		<div className="agent-statusbar">
			<div className="agent-statusbar-left">
				<span
					className="agent-statusbar-dot"
					style={{ background: statusColors[status] }}
				/>
				<span className="agent-statusbar-text">{status}</span>
				{state?.model && (
					<>
						<span className="agent-statusbar-sep">|</span>
						<span className="agent-statusbar-model">{state.model.id}</span>
					</>
				)}
				{state?.thinkingLevel && state.thinkingLevel !== "off" && (
					<>
						<span className="agent-statusbar-sep">|</span>
						<span className="agent-statusbar-thinking">{state.thinkingLevel}</span>
					</>
				)}
			</div>
			<div className="agent-statusbar-right">
				<button
					onClick={isConnected ? onDisconnect : onConnect}
					className="agent-statusbar-action"
				>
					{isConnected ? "Disconnect" : "Connect"}
				</button>
			</div>
		</div>
	);
}
