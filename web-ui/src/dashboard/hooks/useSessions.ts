import { useState, useEffect, useCallback, useRef } from "react";
import {
	getSessions,
	searchSessions,
	type SessionData,
} from "../api.ts";

interface UseSessionsOptions {
	pageSize?: number;
}

interface UseSessionsReturn {
	sessions: SessionData[];
	total: number;
	isLoading: boolean;
	error: string | null;
	search: string;
	setSearch: (q: string) => void;
	page: number;
	setPage: (p: number) => void;
	pageSize: number;
	refresh: () => void;
}

export function useSessions(
	options: UseSessionsOptions = {},
): UseSessionsReturn {
	const { pageSize = 20 } = options;
	const [sessions, setSessions] = useState<SessionData[]>([]);
	const [total, setTotal] = useState(0);
	const [isLoading, setIsLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [search, setSearch] = useState("");
	const [page, setPage] = useState(1);
	const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const [debouncedSearch, setDebouncedSearch] = useState("");

	// Debounce search input
	useEffect(() => {
		if (debounceRef.current) {
			clearTimeout(debounceRef.current);
		}
		debounceRef.current = setTimeout(() => {
			setDebouncedSearch(search);
			setPage(1);
		}, 300);
		return () => {
			if (debounceRef.current) {
				clearTimeout(debounceRef.current);
			}
		};
	}, [search]);

	const fetchSessions = useCallback(async () => {
		setIsLoading(true);
		setError(null);
		try {
			if (debouncedSearch) {
				const data = await searchSessions(debouncedSearch);
				setSessions(data.results);
				setTotal(data.results.length);
			} else {
				const offset = (page - 1) * pageSize;
				const data = await getSessions({
					limit: pageSize,
					offset,
				});
				setSessions(data.sessions);
				setTotal(data.limit + data.offset);
			}
		} catch (err) {
			setError(
				err instanceof Error ? err.message : "Failed to load sessions",
			);
		} finally {
			setIsLoading(false);
		}
	}, [debouncedSearch, page, pageSize]);

	useEffect(() => {
		fetchSessions();
	}, [fetchSessions]);

	return {
		sessions,
		total,
		isLoading,
		error,
		search,
		setSearch,
		page,
		setPage,
		pageSize,
		refresh: fetchSessions,
	};
}
