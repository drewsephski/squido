/**
 * HTTP + WebSocket server for the Squido web interface.
 *
 * Serves the built web-ui static files and provides a WebSocket
 * endpoint (/ws) for real-time agent interaction.
 */

import { existsSync, readFileSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize } from "node:path";
import { WebSocketServer } from "ws";
import type { WebServerOptions } from "./web-types.ts";

const MIME_TYPES: Record<string, string> = {
	".html": "text/html",
	".css": "text/css",
	".js": "application/javascript",
	".json": "application/json",
	".png": "image/png",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".gif": "image/gif",
	".svg": "image/svg+xml",
	".ico": "image/x-icon",
	".webp": "image/webp",
	".woff": "font/woff",
	".woff2": "font/woff2",
	".map": "application/json",
};

function getMimeType(path: string): string {
	return MIME_TYPES[extname(path).toLowerCase()] ?? "application/octet-stream";
}

/**
 * Create an HTTP server that serves static files and handles WebSocket upgrades.
 * The WebSocket server instance is returned separately — the caller attaches
 * the connection handler via the 'connection' event.
 */
export function createWebServer(options: WebServerOptions): {
	httpServer: Server;
	wsServer: WebSocketServer;
} {
	const staticDir = options.staticDir;

	// Validate static dir exists
	if (!existsSync(staticDir)) {
		console.error(`Web UI static directory not found: ${staticDir}`);
		console.error("Build the web-ui first: npm run build --workspace=squido-web-ui");
	}

	const getModels = options.getModels;

	const httpServer = createServer((req: IncomingMessage, res: ServerResponse) => {
		// Health check endpoint
		if (req.url === "/api/health" && req.method === "GET") {
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ status: "ok" }));
			return;
		}

		// Models listing endpoint
		if (req.url === "/api/models" && req.method === "GET") {
			const models = getModels?.() ?? [];
			res.writeHead(200, { "Content-Type": "application/json" });
			res.end(JSON.stringify({ models }));
			return;
		}

		// All other requests: serve static files
		serveStatic(req, res, staticDir);
	});

	const wsServer = new WebSocketServer({ noServer: true });

	// Handle WebSocket upgrade
	httpServer.on("upgrade", (request, socket, head) => {
		const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

		if (url.pathname === "/ws") {
			wsServer.handleUpgrade(request, socket, head, (ws) => {
				wsServer.emit("connection", ws, request);
			});
		} else {
			socket.destroy();
		}
	});

	return { httpServer, wsServer };
}

/**
 * Serve a static file from the given directory.
 * Falls back to index.html for SPA routing (any path without a file extension
 * or paths starting with subdirectories that don't exist).
 */
function serveStatic(req: IncomingMessage, res: ServerResponse, staticDir: string): void {
	// Strip query string
	const rawPath = req.url?.split("?")[0] ?? "/";
	const filePath = join(staticDir, normalize(rawPath));

	// Security: prevent directory traversal
	const resolved = normalize(filePath);
	if (!resolved.startsWith(normalize(staticDir))) {
		res.writeHead(403);
		res.end("Forbidden");
		return;
	}

	// Try exact file, then index.html fallback
	try {
		if (existsSync(filePath) && statSync(filePath).isFile()) {
			serveFile(res, filePath);
			return;
		}
	} catch {
		// Fall through to SPA fallback
	}

	// If path looks like it has a file extension, return 404
	const ext = extname(rawPath);
	if (ext && ext !== ".html") {
		res.writeHead(404);
		res.end("Not found");
		return;
	}

	// SPA fallback: serve index.html
	serveFile(res, join(staticDir, "index.html"));
}

function serveFile(res: ServerResponse, filePath: string): void {
	try {
		const content = readFileSync(filePath);
		const mime = getMimeType(filePath);
		res.writeHead(200, { "Content-Type": mime });
		res.end(content);
	} catch {
		res.writeHead(404);
		res.end("Not found");
	}
}
