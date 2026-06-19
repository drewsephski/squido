/**
 * HTTP + WebSocket server for the Squido web interface.
 *
 * Serves the built web-ui static files, provides a WebSocket
 * endpoint (/ws) for real-time agent interaction, and REST endpoints
 * for models and sessions.
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

	if (!existsSync(staticDir)) {
		console.error(`Web UI static directory not found: ${staticDir}`);
		console.error("Build the web-ui first: npm run build --workspace=squido-web-ui");
	}

	const getModels = options.getModels;
	const listSessions = options.listSessions;

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

		// Sessions listing endpoint
		if (req.url === "/api/sessions" && req.method === "GET") {
			listSessions?.()
				.then((sessions) => {
					const result = (sessions ?? []).map((s) => ({
						path: s.path,
						id: s.id,
						name: s.name,
						cwd: s.cwd,
						messageCount: s.messageCount,
						created: s.created.toISOString(),
						modified: s.modified.toISOString(),
					}));
					res.writeHead(200, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ sessions: result }));
				})
				.catch((err) => {
					res.writeHead(500, { "Content-Type": "application/json" });
					res.end(JSON.stringify({ error: String(err) }));
				});
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
 * Falls back to index.html for SPA routing.
 */
function serveStatic(req: IncomingMessage, res: ServerResponse, staticDir: string): void {
	const rawPath = req.url?.split("?")[0] ?? "/";

	// If staticDir is empty or doesn't exist, show a helpful message instead of
	// a misleading error — the security check below would reject every request
	// since normalize("") === "." and no path starts with ".".
	if (!staticDir || !existsSync(staticDir)) {
		serveFallbackPage(res);
		return;
	}

	const resolved = normalize(join(staticDir, normalize(rawPath)));

	// Security: prevent directory traversal
	if (!resolved.startsWith(normalize(staticDir))) {
		res.writeHead(403);
		res.end("Forbidden");
		return;
	}

	// Try exact file, then index.html fallback
	try {
		if (existsSync(resolved) && statSync(resolved).isFile()) {
			serveFile(res, resolved);
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

/**
 * Serve a fallback page when the web UI directory hasn't been built.
 * Returns a self-contained HTML page explaining what's wrong.
 */
function serveFallbackPage(res: ServerResponse): void {
	const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Squido Web UI</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; max-width: 600px; margin: 80px auto; padding: 0 24px; line-height: 1.6; color: #333; }
  h1 { font-size: 1.5rem; margin-bottom: 0.5rem; }
  pre { background: #f5f5f5; padding: 12px 16px; border-radius: 6px; overflow-x: auto; }
  code { font-size: 0.9em; }
  p { margin: 1em 0; }
</style>
</head>
<body>
<h1>Squido Web UI</h1>
<p>The web UI static files haven't been built yet. To build them, run:</p>
<pre><code>npm run build --workspace=squido-web-ui</code></pre>
<p>If you're using Squido from source, build from the repo root:</p>
<pre><code>npm run build</code></pre>
<p>Then restart Squido in web mode.</p>
</body>
</html>`;
	res.writeHead(200, { "Content-Type": "text/html" });
	res.end(html);
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
