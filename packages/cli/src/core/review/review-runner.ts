/**
 * Review Runner — thin adapter that wraps the existing review-agent engine.
 *
 * Flow:
 *   1. Fetch GitHub token from Squido Cloud API
 *   2. Use GitHubClient to fetch PR diff
 *   3. Parse diff into DiffFile[]
 *   4. Run review engine (LLM-based, static analyzers off for MVP)
 *   5. Post results back to GitHub via GitHubClient.createReview
 *   6. Record the run in the Cloud API
 *
 * Does NOT rebuild any review logic. All heavy lifting is in @drewsepsi/review-agent.
 */

import {
	DEFAULT_REVIEW_CONFIG,
	GitHubClient,
	parseDiff,
	type ReviewConfig,
	type ReviewResult,
	runReview,
} from "@drewsepsi/review-agent";

export interface ReviewRunnerOptions {
	/** Cloud API base URL (e.g. https://api.squidagent.app) */
	cloudApiUrl: string;
	/** JWT for cloud API authentication */
	jwt: string;
	/** Repository in owner/repo format */
	repository: string;
	/** PR number to review */
	prNumber: number;
	/** LLM model to use (default: deepseek-v4-flash) */
	model?: string;
	/** LLM provider to use (default: opencode-go) */
	provider?: string;
	/** Optional API key override for the LLM */
	apiKey?: string;
	/** Progress callback for streaming status updates */
	onProgress?: (phase: ReviewPhase, message: string) => void;
}

export type ReviewPhase = "fetching_diff" | "analyzing" | "posting_results" | "complete" | "error";

export interface ReviewRunResult {
	status: "completed" | "failed";
	summary: string | null;
	findings: ReviewResult["findings"];
	tokensUsed: number;
	error?: string;
	reviewUrl?: string;
}

/**
 * Run a code review on a GitHub PR.
 *
 * Uses the existing review-agent engine. Static analyzers are disabled for MVP
 * since they require a local repo checkout.
 */
export async function runPrReview(options: ReviewRunnerOptions): Promise<ReviewRunResult> {
	const { cloudApiUrl, jwt, repository, prNumber, onProgress } = options;
	const [owner, repo] = repository.split("/");

	if (!owner || !repo) {
		return {
			status: "failed",
			summary: null,
			findings: [],
			tokensUsed: 0,
			error: `Invalid repository format: ${repository}. Expected owner/repo.`,
		};
	}

	try {
		// ── 1. Fetch GitHub token from Cloud API ────────────────────

		onProgress?.("fetching_diff", "Fetching GitHub token...");
		const tokenRes = await fetch(`${cloudApiUrl}/v1/github/token`, {
			headers: { Authorization: `Bearer ${jwt}` },
		});
		if (!tokenRes.ok) {
			throw new Error(`Failed to fetch GitHub token: ${tokenRes.statusText}`);
		}
		const { token: githubToken } = (await tokenRes.json()) as { token: string };

		// ── 2. Fetch PR diff ────────────────────────────────────────

		onProgress?.("fetching_diff", `Fetching diff for ${repository}#${prNumber}...`);
		const ghClient = new GitHubClient({ owner, repo, token: githubToken });
		const diffText = await ghClient.getPrDiff(prNumber);

		if (!diffText || diffText.trim().length === 0) {
			return {
				status: "completed",
				summary: "No changes to review (empty diff).",
				findings: [],
				tokensUsed: 0,
			};
		}

		// ── 3. Parse diff ───────────────────────────────────────────

		const files = parseDiff(diffText);
		if (files.length === 0) {
			return {
				status: "completed",
				summary: "No reviewable files in diff.",
				findings: [],
				tokensUsed: 0,
			};
		}

		onProgress?.("fetching_diff", `Parsed ${files.length} changed files.`);

		// ── 4. Build review config ──────────────────────────────────

		const config: ReviewConfig = {
			review: {
				...DEFAULT_REVIEW_CONFIG.review,
				provider: options.provider ?? "opencode-go",
				model: options.model ?? "deepseek-v4-flash",
				"static-analyzers": "off",
				agents: ["pr-summarizer", "code-reviewer"],
			},
		};

		// ── 5. Run review engine ────────────────────────────────────

		onProgress?.("analyzing", "Running AI review...");
		const result = await runReview({
			config,
			files,
			apiKey: options.apiKey,
		});

		onProgress?.("analyzing", `Review complete: ${result.findings.length} findings.`);

		// ── 6. Post results to GitHub ───────────────────────────────

		onProgress?.("posting_results", "Posting review to GitHub...");

		const prMeta = await ghClient.getPrMetadata(prNumber);
		const sha = prMeta.head.sha;

		const comments = result.findings.map((f) => ({
			path: f.filePath,
			line: f.line,
			body: formatFindingComment(f),
		}));

		const reviewBody = buildReviewBody(result, config);
		const reviewData = await ghClient.createReview(prNumber, sha, reviewBody, comments, "COMMENT");

		onProgress?.("complete", "Review posted successfully.");

		return {
			status: "completed",
			summary: result.summary,
			findings: result.findings,
			tokensUsed: result.tokensUsed,
			reviewUrl: reviewData.html_url,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		onProgress?.("error", `Review failed: ${message}`);
		return {
			status: "failed",
			summary: null,
			findings: [],
			tokensUsed: 0,
			error: message,
		};
	}
}

// ── Comment formatting (mirrors github-action.ts patterns) ─────────

function formatFindingComment(finding: ReviewResult["findings"][number]): string {
	const severityIcon =
		finding.severity === "critical"
			? "🚨"
			: finding.severity === "warning"
				? "⚠️"
				: finding.severity === "info"
					? "ℹ️"
					: "💡";

	const lines = [
		`**${severityIcon} ${finding.title}**`,
		`*Severity: ${finding.severity} | Confidence: ${Math.round(finding.confidence * 100)}%*`,
		"",
		finding.description,
	];

	if (finding.suggestion) {
		lines.push("", "**Suggested fix:**", "", "```suggestion", finding.suggestion, "```");
	}

	return lines.join("\n");
}

function buildReviewBody(
	result: { summary: string | null; findings: ReviewResult["findings"]; tokensUsed: number },
	config: ReviewConfig,
): string {
	const lines: string[] = ["## Squido Review"];

	if (result.summary) {
		lines.push("", "### Summary", "", result.summary);
	}

	lines.push("", "### Findings");

	if (result.findings.length === 0) {
		lines.push("", "No issues found.");
	} else {
		const bySeverity = (sev: string) => result.findings.filter((f) => f.severity === sev);
		const critical = bySeverity("critical");
		const warnings = bySeverity("warning");
		const info = bySeverity("info");

		if (critical.length > 0) lines.push("", `- 🚨 **${critical.length} critical**`);
		if (warnings.length > 0) lines.push(`- ⚠️ **${warnings.length} warnings**`);
		if (info.length > 0) lines.push(`- ℹ️ **${info.length} info**`);

		lines.push("", `*Model: ${config.review?.provider}/${config.review?.model} | Tokens: ${result.tokensUsed}*`);
	}

	return lines.join("\n");
}

// ── Cloud API helpers ──────────────────────────────────────────────

/**
 * Record a review run in the Cloud API.
 */
export async function recordReviewRun(
	cloudApiUrl: string,
	jwt: string,
	agentId: string,
	repository: string,
	prNumber: number,
	result: ReviewRunResult,
): Promise<void> {
	try {
		// Create run record
		const createRes = await fetch(`${cloudApiUrl}/v1/review/runs`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${jwt}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({ agentId, repository, prNumber }),
		});

		if (!createRes.ok) return;
		const { id } = (await createRes.json()) as { id: string };

		// Update with results
		await fetch(`${cloudApiUrl}/v1/review/runs/${id}`, {
			method: "PATCH",
			headers: {
				Authorization: `Bearer ${jwt}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				status: result.status,
				summary: result.summary,
				findingCount: result.findings.length,
				tokensUsed: result.tokensUsed,
				errorMessage: result.error,
			}),
		});
	} catch {
		// Recording is best-effort — don't fail the review if this errors
	}
}
