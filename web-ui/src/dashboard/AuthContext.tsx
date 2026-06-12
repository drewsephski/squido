import {
	createContext,
	useContext,
	useState,
	useEffect,
	useCallback,
	useRef,
	type ReactNode,
} from "react";
import { useNavigate } from "react-router-dom";
import {
	getToken,
	setToken,
	clearToken,
	getUserProfile,
	startGitHubAuth,
	exchangeGitHubCode,
} from "./api.ts";

export interface AuthUser {
	userId: string;
	login: string;
	email: string;
	avatarUrl: string | null;
	tier: string;
}

interface AuthContextValue {
	user: AuthUser | null;
	token: string | null;
	isLoading: boolean;
	login: () => Promise<void>;
	logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
	const [user, setUser] = useState<AuthUser | null>(null);
	const [token, setTokenState] = useState<string | null>(getToken());
	const [isLoading, setIsLoading] = useState(true);
	const navigate = useNavigate();
	const initialised = useRef(false);

	useEffect(() => {
		if (initialised.current) return;
		initialised.current = true;

		const params = new URLSearchParams(window.location.search);
		const code = params.get("code");

		if (code && window.location.pathname === "/dashboard/auth/callback") {
			// OAuth callback — exchange code for token
			setIsLoading(true);
			exchangeGitHubCode(code)
				.then((data) => {
					setToken(data.token);
					setTokenState(data.token);
					setUser({
						userId: data.user.userId,
						login: data.user.githubLogin,
						email: data.user.email,
						avatarUrl: null,
						tier: data.user.tier,
					});
					navigate("/dashboard", { replace: true });
				})
				.catch(() => {
					navigate("/dashboard?error=auth_failed", { replace: true });
				})
				.finally(() => setIsLoading(false));
			return;
		}

		if (token) {
			// Restore session from stored token
			getUserProfile()
				.then((profile) => {
					setUser({
						userId: profile.id,
						login: profile.github_login,
						email: profile.email,
						avatarUrl: profile.avatar_url,
						tier: profile.tier,
					});
				})
				.catch(() => {
					clearToken();
					setTokenState(null);
					setUser(null);
				})
				.finally(() => setIsLoading(false));
		} else {
			setIsLoading(false);
		}
	}, []); // eslint-disable-line react-hooks/exhaustive-deps

	const login = useCallback(async () => {
		const { url } = await startGitHubAuth();
		window.location.href = url;
	}, []);

	const logout = useCallback(() => {
		clearToken();
		setTokenState(null);
		setUser(null);
	}, []);

	return (
		<AuthContext.Provider value={{ user, token, isLoading, login, logout }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth(): AuthContextValue {
	const ctx = useContext(AuthContext);
	if (!ctx) {
		throw new Error("useAuth must be used within an AuthProvider");
	}
	return ctx;
}
