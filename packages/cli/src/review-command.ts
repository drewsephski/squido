/**
 * `squido review` subcommand — trigger a code review from the CLI.
 *
 * Usage:
 *   squido review owner/repo 123           # Review PR #123
 *   squido review owner/repo 123 --model X # Override model
 *   squido review                          # Interactive mode (TODO)
 *
 * Requires cloud authentication (run `squido` then /cloud-login first).
 */

import chalk from "chalk";
import { AuthStorage } from "./core/auth-storage.ts";
import { type ReviewPhase, recordReviewRun, runPrReview } from "./core/review/review-runner.ts";

const CLOUD_API_URL = "https://api.squidagent.app";

interface ReviewArgs {
	repository?: string;
	prNumber?: number;
	model?: string;
	provider?: string;
	help?: boolean;
}

function parseReviewArgs(args: string[]): ReviewArgs {
	const result: ReviewArgs = {};
	for (let i = 0; i < args.length; i++) {
		const arg = args[i];
		if (arg === "--help" || arg === "-h") {
			result.help = true;
		} else if (arg === "--model" || arg === "-m") {
			result.model = args[++i];
		} else if (arg === "--provider" || arg === "-p") {
			result.provider = args[++i];
		} else if (!result.repository) {
			result.repository = arg;
		} else if (!result.prNumber) {
			const num = Number.parseInt(arg, 10);
			if (!Number.isNaN(num)) result.prNumber = num;
		}
	}
	return result;
}

function printReviewHelp(): void {
	console.log(`
squido review — AI-powered code review

Usage:
  squido review <owner/repo> <pr-number>    Review a specific PR
  squido review --help                       Show this help

Options:
  --model, -m <model>      Override LLM model (default: deepseek-v4-flash)
  --provider, -p <provider> Override LLM provider (default: opencode-go)

Prerequisites:
  1. Sign in to Squido Cloud: run \`squido\` then use /cloud-login
  2. The repository must be public (or you need repo scope)

Example:
  squido review drewsephski/squido 42
`);
}

/**
 * Handle the `squido review` subcommand.
 * Returns true if the command was handled (and main() should exit).
 */
export async function handleReviewCommand(args: string[]): Promise<boolean> {
	// Only intercept if the first arg is "review"
	if (args[0] !== "review") return false;

	const reviewArgs = parseReviewArgs(args.slice(1));

	if (reviewArgs.help) {
		printReviewHelp();
		return true;
	}

	if (!reviewArgs.repository || !reviewArgs.prNumber) {
		console.error(chalk.red("Error: repository and PR number are required"));
		console.error(chalk.dim("Usage: squido review <owner/repo> <pr-number>"));
		console.error(chalk.dim("Run `squido review --help` for more info"));
		return true;
	}

	// ── Get JWT from AuthStorage ─────────────────────────────────

	const authStorage = AuthStorage.create();
	const cred = authStorage.get("squido_cloud") as { type: string; accessToken?: string } | undefined;
	if (!cred || cred.type !== "cloud_oauth" || !cred.accessToken) {
		console.error(chalk.red("Error: Not authenticated to Squido Cloud."));
		console.error(chalk.dim("Run `squido` and use /cloud-login to sign in first."));
		return true;
	}

	const jwt = cred.accessToken;

	// ── Run review ───────────────────────────────────────────────

	console.error(chalk.cyan(`Reviewing ${reviewArgs.repository}#${reviewArgs.prNumber}...`));
	console.error(
		chalk.dim(`Model: ${reviewArgs.provider ?? "opencode-go"}/${reviewArgs.model ?? "deepseek-v4-flash"}`),
	);
	console.error("");

	const onProgress = (phase: ReviewPhase, message: string) => {
		const icon =
			phase === "fetching_diff"
				? "📥"
				: phase === "analyzing"
					? "🔍"
					: phase === "posting_results"
						? "📤"
						: phase === "complete"
							? "✅"
							: "❌";
		console.error(`${icon} ${message}`);
	};

	const result = await runPrReview({
		cloudApiUrl: CLOUD_API_URL,
		jwt,
		repository: reviewArgs.repository,
		prNumber: reviewArgs.prNumber,
		model: reviewArgs.model,
		provider: reviewArgs.provider,
		onProgress,
	});

	// ── Display results ──────────────────────────────────────────

	if (result.status === "completed") {
		if (result.summary) {
			console.log(chalk.bold("\n## Summary"));
			console.log(result.summary);
		}

		if (result.findings.length > 0) {
			console.log(chalk.bold(`\n## Findings (${result.findings.length})`));
			const sorted = [...result.findings].sort((a, b) => {
				const weight = (s: string) => (s === "critical" ? 4 : s === "warning" ? 3 : s === "info" ? 2 : 1);
				return weight(b.severity) - weight(a.severity);
			});
			for (const f of sorted) {
				const prefix =
					f.severity === "critical" ? "🚨" : f.severity === "warning" ? "⚠️" : f.severity === "info" ? "ℹ️" : "💡";
				console.log(`\n${prefix} [${f.severity}] ${f.title}`);
				console.log(`   ${f.filePath}:${f.line} (confidence: ${Math.round(f.confidence * 100)}%)`);
				console.log(`   ${f.description}`);
				if (f.suggestion) console.log(`   Suggestion: ${f.suggestion}`);
			}
		} else {
			console.log(chalk.green("\nNo issues found."));
		}

		console.log(chalk.dim(`\nTokens used: ${result.tokensUsed}`));
		if (result.reviewUrl) {
			console.log(chalk.cyan(`Review posted: ${result.reviewUrl}`));
		}
	} else {
		console.error(chalk.red(`\nReview failed: ${result.error}`));
	}

	// Record the run (best-effort)
	await recordReviewRun(
		CLOUD_API_URL,
		jwt,
		"cli", // No agent ID for CLI runs
		reviewArgs.repository,
		reviewArgs.prNumber,
		result,
	);

	return true;
}
