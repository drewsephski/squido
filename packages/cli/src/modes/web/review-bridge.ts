/**
 * ReviewBridge — handles review-specific WebSocket messages.
 *
 * Delegated by WebSessionBridge to keep agent session code separate from
 * review code. The client passes a JWT (from Squido Cloud auth) in review
 * messages so this bridge can authenticate to the Cloud API without needing
 * a CloudIntegration instance.
 */

import type { WebSocket } from "ws";
import { type ReviewPhase, recordReviewRun, runPrReview } from "../../core/review/review-runner.ts";
import type { WebClientMessage, WebReviewAgent, WebReviewRun, WebServerMessage } from "./web-types.ts";

export interface ReviewBridgeOptions {
	cloudApiUrl: string;
}

export class ReviewBridge {
	private ws: WebSocket;
	private cloudApiUrl: string;
	private closed = false;

	constructor(ws: WebSocket, options: ReviewBridgeOptions) {
		this.ws = ws;
		this.cloudApiUrl = options.cloudApiUrl;
	}

	get isClosed(): boolean {
		return this.closed;
	}

	detach(): void {
		this.closed = true;
	}

	/**
	 * Handle a review-specific message. Returns true if the message was handled.
	 */
	async handleMessage(message: WebClientMessage): Promise<boolean> {
		switch (message.type) {
			case "run_review":
				await this.handleRunReview(message);
				return true;

			case "list_review_agents":
				await this.handleListAgents(message.jwt);
				return true;

			case "list_review_runs":
				await this.handleListRuns(message.jwt, message.agentId);
				return true;

			default:
				return false;
		}
	}

	// ── Run Review ────────────────────────────────────────────────

	private async handleRunReview(message: {
		jwt: string;
		agentId: string;
		repository: string;
		prNumber: number;
		model?: string;
		provider?: string;
	}): Promise<void> {
		const onProgress = (phase: ReviewPhase, msg: string) => {
			this.send({ type: "review_progress", phase, message: msg });
		};

		const result = await runPrReview({
			cloudApiUrl: this.cloudApiUrl,
			jwt: message.jwt,
			repository: message.repository,
			prNumber: message.prNumber,
			model: message.model,
			provider: message.provider,
			onProgress,
		});

		if (result.status === "completed") {
			this.send({
				type: "review_complete",
				summary: result.summary,
				findingCount: result.findings.length,
				tokensUsed: result.tokensUsed,
				reviewUrl: result.reviewUrl,
			});
		} else {
			this.send({ type: "review_error", message: result.error ?? "Review failed" });
		}

		await recordReviewRun(
			this.cloudApiUrl,
			message.jwt,
			message.agentId,
			message.repository,
			message.prNumber,
			result,
		);
	}

	// ── List Agents ───────────────────────────────────────────────

	private async handleListAgents(jwt: string): Promise<void> {
		try {
			const res = await fetch(`${this.cloudApiUrl}/v1/review/agents`, {
				headers: { Authorization: `Bearer ${jwt}` },
			});
			if (!res.ok) {
				this.send({ type: "review_error", message: `Failed to list agents: ${res.statusText}` });
				return;
			}
			const data = (await res.json()) as { agents: WebReviewAgent[] };
			this.send({ type: "review_agents", agents: data.agents });
		} catch (err) {
			this.send({
				type: "review_error",
				message: `Failed to list agents: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	}

	// ── List Runs ─────────────────────────────────────────────────

	private async handleListRuns(jwt: string, agentId: string): Promise<void> {
		try {
			const res = await fetch(`${this.cloudApiUrl}/v1/review/agents/${agentId}/runs`, {
				headers: { Authorization: `Bearer ${jwt}` },
			});
			if (!res.ok) {
				this.send({ type: "review_error", message: `Failed to list runs: ${res.statusText}` });
				return;
			}
			const data = (await res.json()) as { runs: WebReviewRun[] };
			this.send({ type: "review_runs", runs: data.runs });
		} catch (err) {
			this.send({
				type: "review_error",
				message: `Failed to list runs: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	}

	// ── Send helper ───────────────────────────────────────────────

	private send(msg: WebServerMessage): void {
		if (this.closed) return;
		try {
			this.ws.send(JSON.stringify(msg));
		} catch {
			this.closed = true;
		}
	}
}
