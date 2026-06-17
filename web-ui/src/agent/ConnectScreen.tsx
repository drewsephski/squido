import type { ConnectionStatus } from "./useAgentWebSocket.ts";

interface ConnectScreenProps {
	status: ConnectionStatus;
	lastError: string | null;
	onConnect: () => void;
}

const FEATURES = [
	{ icon: "->", label: "Read files" },
	{ icon: "$", label: "Run commands" },
	{ icon: "+-", label: "Edit code" },
	{ icon: "<>", label: "40+ providers" },
];

export function ConnectScreen({ status, lastError, onConnect }: ConnectScreenProps) {
	const isConnecting = status === "connecting";
	const isError = status === "error";

	return (
		<div className="agent-landing">
			{/* Minimal top bar */}
			<div className="agent-landing-topbar">
				<span className="agent-topbar-brand">
					Squi<span className="agent-topbar-brand-amber">do</span>
				</span>
			</div>

			{/* Hero */}
			<div className="agent-landing-hero">
				<div className="agent-landing-content">
					<div className="agent-landing-logo">
						<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f29a3a" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
							<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
						</svg>
					</div>

					<h1>Squido</h1>
					<p>AI coding agent for the terminal. Connect to your local Squido server to read files, run commands, and edit code across 40+ providers.</p>

					{isError && lastError && (
						<div className="agent-landing-error">
							<div>
								<div className="agent-landing-error-title">Connection failed</div>
								<div className="agent-landing-error-desc">{lastError}</div>
							</div>
						</div>
					)}

					<button
						onClick={onConnect}
						disabled={isConnecting}
						className="agent-connect-btn"
					>
						{isConnecting ? (
							<>
								<span className="agent-connect-spinner" />
								<span>Connecting...</span>
							</>
						) : (
							<>
								<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
									<path d="M5 12h14M12 5l7 7-7 7" />
								</svg>
								<span>Connect to Squido</span>
							</>
						)}
					</button>
				</div>
			</div>

			{/* Features footer */}
			<div className="agent-landing-features">
				{FEATURES.map((f) => (
					<div key={f.label} className="agent-landing-feature">
						<span className="agent-landing-feature-icon">{f.icon}</span>
						<span className="agent-landing-feature-label">{f.label}</span>
					</div>
				))}
			</div>
		</div>
	);
}
