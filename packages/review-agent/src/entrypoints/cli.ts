/**
 * CLI entry point for local / dry-run review mode.
 *
 * Usage:
 *   squido-review --diff path/to/diff.patch
 *   squido-review --pr owner/repo/123
 *   squido-review --dir .     # review uncommitted changes
 */

import { existsSync, readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { parseDiff } from "../github/diff-parser.ts";
import { loadConfig } from "../review/config.ts";
import { runReview } from "../review/review-engine.ts";

interface CliArgs {
	diff?: string;
	pr?: string;
	dir?: string;
	help?: boolean;
}

function parseCliArgs(): CliArgs {
	const options = {
		diff: { type: "string" as const, short: "d" },
		pr: { type: "string" as const, short: "p" },
		dir: { type: "string" as const, short: "D" },
		help: { type: "boolean" as const, short: "h" },
	};

	try {
		const { values } = parseArgs({ args: process.argv.slice(2), options, strict: false });
		return values as CliArgs;
	} catch {
		printHelp();
		process.exit(1);
	}
}

function printHelp(): void {
	console.log(`
squido-review — AI-powered pull request review

Usage:
  squido-review --diff <file>     Review a unified diff file
  squido-review --pr <owner/repo/n>  Review a GitHub PR (requires GITHUB_TOKEN)
  squido-review --dir <path>      Review uncommitted changes in a directory
  squido-review --help            Show this help

Options:
  --diff, -d   Path to a unified diff file (e.g., from \`git diff\`)
  --pr, -p     GitHub PR reference (e.g., "owner/repo/123")
  --dir, -D    Directory with uncommitted changes (runs \`git diff\`)
  --help, -h   Show this help message

Environment:
  GITHUB_TOKEN         Required for --pr mode
  SQUIDO_REVIEW_API_KEY  LLM provider API key
  SQUIDO_REVIEW_MODEL    LLM model (default: deepseek-v4-flash)
`);
}

async function main(): Promise<void> {
	const args = parseCliArgs();

	if (args.help) {
		printHelp();
		process.exit(0);
	}

	// ── Resolve diff source ────────────────────────────────────

	let diffText: string;

	if (args.diff) {
		if (!existsSync(args.diff)) {
			console.error(`Diff file not found: ${args.diff}`);
			process.exit(1);
		}
		diffText = readFileSync(args.diff, "utf-8");
	} else if (args.pr) {
		const match = args.pr.match(/^([^/]+)\/([^/]+)\/(\d+)$/);
		if (!match) {
			console.error("Invalid PR format. Use: owner/repo/number");
			process.exit(1);
		}
		const [, owner, repo, prNumberStr] = match;
		const prNumber = Number.parseInt(prNumberStr, 10);
		const token = process.env.GITHUB_TOKEN;
		if (!token) {
			console.error("GITHUB_TOKEN is required for --pr mode");
			process.exit(1);
		}
		const { GitHubClient } = await import("../github/github-client.ts");
		const gh = new GitHubClient({ owner, repo, token });
		diffText = await gh.getPrDiff(prNumber);
		console.error(`Fetched PR ${owner}/${repo}#${prNumber}`);
	} else if (args.dir) {
		// Run git diff in the given directory
		const { execSync } = await import("node:child_process");
		diffText = execSync("git diff HEAD", { cwd: args.dir, encoding: "utf-8" });
		if (!diffText.trim()) {
			console.error("No uncommitted changes found");
			process.exit(0);
		}
	} else {
		printHelp();
		process.exit(1);
	}

	// ── Parse diff ─────────────────────────────────────────────

	const files = parseDiff(diffText);
	if (files.length === 0) {
		console.log("No changed files to review.");
		process.exit(0);
	}
	console.error(`Parsed ${files.length} changed files:`);
	for (const f of files) {
		console.error(
			`  ${f.status === "added" ? "[A]" : f.status === "deleted" ? "[D]" : "[M]"} ${f.filePath} (+${f.addedLines.size} lines)`,
		);
	}

	// ── Load config ────────────────────────────────────────────

	const config = loadConfig(args.dir ?? process.cwd());
	const reviewCfg = config.review!;

	if (process.env.SQUIDO_REVIEW_MODEL) reviewCfg.model = process.env.SQUIDO_REVIEW_MODEL;

	console.error(`\nRunning review (provider: ${reviewCfg.provider}, model: ${reviewCfg.model})...`);

	// ── Run review ─────────────────────────────────────────────

	const result = await runReview({
		config,
		files,
		apiKey: process.env.SQUIDO_REVIEW_API_KEY ?? undefined,
	});

	// ── Output results ─────────────────────────────────────────

	if (result.summary) {
		console.log("\n## Summary");
		console.log(result.summary);
	}

	if (result.findings.length > 0) {
		console.log(`\n## Findings (${result.findings.length})`);

		const sorted = [...result.findings].sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity));

		for (const f of sorted) {
			const prefix =
				f.severity === "critical" ? "🚨" : f.severity === "warning" ? "⚠️" : f.severity === "info" ? "ℹ️" : "💡";
			console.log(`\n${prefix} [${f.severity}] ${f.title}`);
			console.log(`   ${f.filePath}:${f.line} (confidence: ${Math.round(f.confidence * 100)}%)`);
			console.log(`   ${f.description}`);
			if (f.suggestion) {
				console.log(`   Suggestion: ${f.suggestion}`);
			}
		}
	} else {
		console.log("\nNo issues found.");
	}

	console.log(`\nTokens used: ${result.tokensUsed}`);
}

function severityWeight(severity: string): number {
	switch (severity) {
		case "critical":
			return 4;
		case "warning":
			return 3;
		case "info":
			return 2;
		case "nit":
			return 1;
		default:
			return 0;
	}
}

main().catch((err) => {
	console.error("Review failed:", err);
	process.exit(1);
});
