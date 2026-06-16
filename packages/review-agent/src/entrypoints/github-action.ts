/**
 * GitHub Action entry point.
 *
 * This is the main entry point when running as a GitHub Action.
 * It reads environment variables for configuration, fetches the PR diff,
 * runs the review engine, and posts results back to the PR.
 *
 * Environment variables (set by the action.yml):
 *   GITHUB_TOKEN        - GitHub token (pull-requests: write)
 *   GITHUB_API_URL      - GitHub API URL (default: https://api.github.com)
 *   GITHUB_REPOSITORY   - owner/repo
 *   GITHUB_EVENT_PATH   - path to the event payload JSON
 *   SQUIDO_REVIEW_API_KEY - LLM provider API key (optional, falls back to env)
 *   SQUIDO_REVIEW_PROVIDER - LLM provider (default: opencode-go)
 *   SQUIDO_REVIEW_MODEL    - LLM model (default: deepseek-v4-flash)
 *   SQUIDO_REVIEW_MODE     - advisory | blocking (default: advisory)
 */

import { readFileSync } from "node:fs";
import { parseDiff } from "../github/diff-parser.ts";
import { GitHubClient } from "../github/github-client.ts";
import { loadConfig } from "../review/config.ts";
import { runReview } from "../review/review-engine.ts";
import type { ReviewConfig, ReviewFinding } from "../types.ts";

interface GitHubEvent {
	pull_request?: {
		number: number;
		head?: { sha?: string };
	};
	issue?: {
		number: number;
		pull_request?: unknown;
	};
	number?: number;
}

async function main() {
	// ── Read environment ───────────────────────────────────────

	const token = process.env.GITHUB_TOKEN;
	if (!token) {
		console.error("GITHUB_TOKEN is required");
		process.exit(1);
	}

	const apiUrl = process.env.GITHUB_API_URL ?? "https://api.github.com";
	const repository = process.env.GITHUB_REPOSITORY;
	if (!repository) {
		console.error("GITHUB_REPOSITORY is required");
		process.exit(1);
	}

	const eventPath = process.env.GITHUB_EVENT_PATH;
	if (!eventPath) {
		console.error("GITHUB_EVENT_PATH is required");
		process.exit(1);
	}

	const [owner, repo] = repository.split("/");

	// ── Read event payload ─────────────────────────────────────

	let event: GitHubEvent;
	try {
		event = JSON.parse(readFileSync(eventPath, "utf-8"));
	} catch (err) {
		console.error("Failed to read GITHUB_EVENT_PATH:", err);
		process.exit(1);
	}

	const prNumber = event.pull_request?.number ?? event.issue?.number ?? event.number;
	const sha = event.pull_request?.head?.sha;

	if (!prNumber || !sha) {
		console.error("Could not determine PR number or SHA from event payload");
		process.exit(1);
	}

	// ── Load config ────────────────────────────────────────────

	const config = loadConfig(process.cwd());
	const reviewCfg = config.review!;

	// Apply env var overrides
	if (process.env.SQUIDO_REVIEW_PROVIDER) reviewCfg.provider = process.env.SQUIDO_REVIEW_PROVIDER;
	if (process.env.SQUIDO_REVIEW_MODEL) reviewCfg.model = process.env.SQUIDO_REVIEW_MODEL;
	if (process.env.SQUIDO_REVIEW_MODE === "advisory" || process.env.SQUIDO_REVIEW_MODE === "blocking") {
		reviewCfg.mode = process.env.SQUIDO_REVIEW_MODE;
	}

	// ── Fetch diff ─────────────────────────────────────────────

	const gh = new GitHubClient({ owner, repo, token, apiUrl });

	console.error(`Fetching diff for ${owner}/${repo}#${prNumber}...`);
	const diffText = await gh.getPrDiff(prNumber);

	if (!diffText || diffText.trim().length === 0) {
		console.error("Empty diff, nothing to review");
		process.exit(0);
	}

	// ── Parse diff + run review ────────────────────────────────

	const files = parseDiff(diffText);
	console.error(`Parsed ${files.length} changed files`);

	const result = await runReview({
		config,
		files,
		apiKey: process.env.SQUIDO_REVIEW_API_KEY ?? undefined,
	});

	// ── Post results ───────────────────────────────────────────

	if (result.summary) {
		console.error("Generated PR summary");
	}

	if (result.findings.length > 0) {
		console.error(`Posting ${result.findings.length} review findings...`);

		const comments = result.findings.map((f) => ({
			path: f.filePath,
			line: f.line,
			body: formatFindingComment(f),
		}));

		const summaryBody = buildReviewBody(result, config);
		await gh.createReview(prNumber, sha, summaryBody, comments, "COMMENT");

		console.error("Review posted successfully");
	} else {
		console.error("No findings — posting clean review");

		await gh.createReview(prNumber, sha, "## Squido Review\n\nNo issues found. Changes look clean.", [], "COMMENT");
	}

	console.error(`Review complete. Tokens used: ${result.tokensUsed}`);
}

function formatFindingComment(finding: ReviewFinding): string {
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
	result: {
		summary: string | null;
		findings: ReviewFinding[];
		tokensUsed: number;
		staticAnalysis?: { analyzers: string[]; runtime: number };
	},
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

		// Static analyzers info
		if (result.staticAnalysis?.analyzers && result.staticAnalysis.analyzers.length > 0) {
			lines.push(
				"",
				`*Static analyzers: ${result.staticAnalysis.analyzers.join(", ")} (${result.staticAnalysis.runtime}ms)*`,
			);
		}

		lines.push("", `*Model: ${config.review?.provider}/${config.review?.model} | Tokens: ${result.tokensUsed}*`);
	}

	return lines.join("\n");
}

main().catch((err) => {
	console.error("Review action failed:", err);
	process.exit(1);
});
