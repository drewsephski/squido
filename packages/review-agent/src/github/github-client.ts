import { Octokit } from "@octokit/rest";
import type { PrContext } from "../types.ts";

// ── GitHub API client ────────────────────────────────────────────

export class GitHubClient {
	private octokit: Octokit;
	private owner: string;
	private repo: string;

	constructor(ctx: Pick<PrContext, "owner" | "repo" | "token" | "apiUrl">) {
		this.octokit = new Octokit({
			auth: ctx.token,
			baseUrl: ctx.apiUrl ?? "https://api.github.com",
		});
		this.owner = ctx.owner;
		this.repo = ctx.repo;
	}

	// ── PR metadata ────────────────────────────────────────────

	async getPrMetadata(prNumber: number) {
		const { data } = await this.octokit.pulls.get({
			owner: this.owner,
			repo: this.repo,
			pull_number: prNumber,
		});
		return data;
	}

	// ── Diff fetching ──────────────────────────────────────────

	/**
	 * Fetch the PR diff as a unified diff string.
	 * Uses the `Accept: application/vnd.github.v3.diff` header.
	 */
	async getPrDiff(prNumber: number): Promise<string> {
		const response = await this.octokit.pulls.get({
			owner: this.owner,
			repo: this.repo,
			pull_number: prNumber,
			mediaType: {
				format: "diff",
			},
		});
		// The diff comes back as a string in the `data` field with this media type
		return response.data as unknown as string;
	}

	// ── Changed files list ─────────────────────────────────────

	async listChangedFiles(prNumber: number) {
		const { data } = await this.octokit.pulls.listFiles({
			owner: this.owner,
			repo: this.repo,
			pull_number: prNumber,
		});
		return data;
	}

	// ── Posting review comments ────────────────────────────────

	/**
	 * Post inline review comments on a PR.
	 * Creates a single review with multiple comments.
	 */
	async createReview(
		prNumber: number,
		sha: string,
		body: string,
		comments: Array<{
			path: string;
			line: number;
			body: string;
		}>,
		event: "COMMENT" | "APPROVE" | "REQUEST_CHANGES" = "COMMENT",
	) {
		const { data } = await this.octokit.pulls.createReview({
			owner: this.owner,
			repo: this.repo,
			pull_number: prNumber,
			commit_id: sha,
			body,
			event,
			comments: comments.map((c) => ({
				path: c.path,
				line: c.line,
				body: c.body,
			})),
		});
		return data;
	}

	/**
	 * Dismiss a previous review from this bot on the same PR.
	 */
	async dismissReview(prNumber: number, reviewId: number, message: string) {
		const { data } = await this.octokit.pulls.dismissReview({
			owner: this.owner,
			repo: this.repo,
			pull_number: prNumber,
			review_id: reviewId,
			message,
		});
		return data;
	}

	/**
	 * List reviews for a PR (used to find and dismiss stale bot reviews).
	 */
	async listReviews(prNumber: number) {
		const { data } = await this.octokit.pulls.listReviews({
			owner: this.owner,
			repo: this.repo,
			pull_number: prNumber,
		});
		return data;
	}

	// ── File content (for context) ─────────────────────────────

	/**
	 * Read a file from the repo at a given ref.
	 */
	async readFile(path: string, ref: string): Promise<string | null> {
		try {
			const { data } = await this.octokit.repos.getContent({
				owner: this.owner,
				repo: this.repo,
				path,
				ref,
			});
			if ("content" in data && typeof data.content === "string") {
				return Buffer.from(data.content, "base64").toString("utf-8");
			}
			return null;
		} catch {
			return null;
		}
	}
}
