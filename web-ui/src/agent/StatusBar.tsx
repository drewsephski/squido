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
		<div style={barStyle}>
			<div style={leftStyle}>
				<span style={dotStyle((statusColors[status]))} />
				<span style={statusTextStyle}>{status}</span>
				{state?.model && (
					<>
						<span style={separatorStyle}>|</span>
						<span style={modelTextStyle}>{state.model.id}</span>
					</>
				)}
				{state?.thinkingLevel && state.thinkingLevel !== "off" && (
					<>
						<span style={separatorStyle}>|</span>
						<span style={thinkingStyle}>{state.thinkingLevel}</span>
					</>
				)}
			</div>
			<div style={rightStyle}>
				<button
					onClick={isConnected ? onDisconnect : onConnect}
					style={actionButtonStyle}
				>
					{isConnected ? "Disconnect" : "Connect"}
				</button>
			</div>
		</div>
	);
}

const barStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	justifyContent: "space-between",
	padding: "0.375rem 1rem",
	background: "var(--surface)",
	borderBottom: "1px solid var(--border)",
	fontSize: "0.75rem",
};

const leftStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "0.375rem",
};

const dotStyle = (color: string): React.CSSProperties => ({
	width: 8,
	height: 8,
	borderRadius: "50%",
	background: color,
	flexShrink: 0,
});

const statusTextStyle: React.CSSProperties = {
	color: "var(--ink-muted)",
	fontFamily: "var(--font-mono)",
	fontSize: "0.6875rem",
	textTransform: "capitalize",
};

const separatorStyle: React.CSSProperties = {
	color: "var(--border)",
};

const modelTextStyle: React.CSSProperties = {
	color: "var(--ink-muted)",
	fontFamily: "var(--font-mono)",
	fontSize: "0.6875rem",
};

const thinkingStyle: React.CSSProperties = {
	color: "var(--accent)",
	fontFamily: "var(--font-mono)",
	fontSize: "0.6875rem",
};

const rightStyle: React.CSSProperties = {
	display: "flex",
	alignItems: "center",
	gap: "0.5rem",
};

const actionButtonStyle: React.CSSProperties = {
	background: "none",
	border: "1px solid var(--border)",
	borderRadius: "var(--radius-sm)",
	color: "var(--ink-muted)",
	fontSize: "0.6875rem",
	fontFamily: "var(--font-mono)",
	padding: "0.125rem 0.5rem",
	cursor: "pointer",
};
