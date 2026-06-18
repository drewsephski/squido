/**
 * Web mode: starts an HTTP + WebSocket server for browser-based agent interaction.
 *
 * Serves the built web-ui static files and bridges the agent session
 * to WebSocket clients for real-time interaction.
 */

import type { AddressInfo } from "node:net";
import type { AgentSessionRuntime } from "../../core/agent-session-runtime.ts";
import { SessionManager } from "../../core/session-manager.ts";
import { openBrowser } from "../../utils/open-browser.ts";
import { createWebServer } from "./web-server.ts";
import { WebSessionBridge } from "./web-session-bridge.ts";
import type { WebServerOptions } from "./web-types.ts";

export interface WebModeOptions {
	staticDir?: string;
	port?: number;
	host?: string;
	openBrowser?: boolean;
}

const DEFAULT_PORT = 9876;
const DEFAULT_HOST = "127.0.0.1";

/**
 * Run in web mode: start an HTTP+WS server and bridge the agent session.
 */
export async function runWebMode(runtime: AgentSessionRuntime, options: WebModeOptions): Promise<void> {
	const port = options.port ?? DEFAULT_PORT;
	const host = options.host ?? DEFAULT_HOST;
	const staticDir = options.staticDir ?? "";
	const shouldOpenBrowser = options.openBrowser ?? true;

	const serverOptions: WebServerOptions = {
		host,
		port,
		staticDir,
		openBrowser: shouldOpenBrowser,
		getModels: () => {
			const registry = runtime.session.modelRegistry;
			registry.refresh();
			return registry.getAvailable().map((m) => ({
				provider: m.provider,
				id: m.id,
				name: m.name,
				contextWindow: m.contextWindow,
				reasoning: m.reasoning,
				input: m.input,
			}));
		},
		listSessions: async () => {
			return SessionManager.listAll();
		},
	};

	const { httpServer, wsServer } = createWebServer(serverOptions);

	// Bridge new WebSocket connections to the agent session
	wsServer.on("connection", (ws) => {
		const bridge = new WebSessionBridge(ws, runtime, serverOptions.listSessions!);
		bridge.attach();
	});

	// Start listening
	httpServer.listen(port, host, () => {
		const addr = httpServer.address() as AddressInfo;
		const url = `http://127.0.0.1:${addr.port}/agent`;

		console.error(`Squido web interface: \x1b]8;;${url}\x1b\\Click here\x1b]8;;\x1b\\ to access the web UI (${url})`);

		if (shouldOpenBrowser && staticDir) {
			openBrowser(url);
		}
	});

	// Handle shutdown signals
	const shutdown = () => {
		console.error("\nShutting down web server...");
		wsServer.close();
		httpServer.close(() => {
			process.exit(0);
		});
	};

	process.on("SIGINT", shutdown);
	process.on("SIGTERM", shutdown);

	// Wait forever (server is event-driven)
	await new Promise<never>(() => {});
}
