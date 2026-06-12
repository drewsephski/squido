import { type ReactNode } from "react";
import { useAuth } from "./AuthContext.tsx";

interface AuthGuardProps {
	children: ReactNode;
}

export function AuthGuard({ children }: AuthGuardProps) {
	const { user, isLoading, login } = useAuth();

	if (isLoading) {
		return (
			<div
				style={{
					display: "flex",
					alignItems: "center",
					justifyContent: "center",
					minHeight: "100vh",
					color: "var(--ink-muted)",
					fontSize: "1rem",
				}}
			>
				Loading...
			</div>
		);
	}

	if (!user) {
		return (
			<div
				style={{
					display: "flex",
					flexDirection: "column",
					alignItems: "center",
					justifyContent: "center",
					minHeight: "100vh",
					gap: "1rem",
					color: "var(--ink-muted)",
				}}
			>
				<p style={{ fontSize: "1.0625rem" }}>
					Please log in to access the dashboard.
				</p>
				<button className="btn btn-primary" onClick={login}>
					Login with GitHub
				</button>
			</div>
		);
	}

	return <>{children}</>;
}
