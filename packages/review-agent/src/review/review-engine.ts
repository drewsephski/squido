import type { Api, Model } from "@drewsepsi/squido-ai";
import { complete, getModel } from "@drewsepsi/squido-ai";
import { validateLine } from "../github/diff-parser.ts";
import type { AgentType, DiffFile, ReviewConfig, ReviewFinding, ReviewSeverity, StaticAnalyzerMode } from "../types.ts";
import { buildCodeReviewerSystemPrompt, buildCodeReviewerUserPrompt } from "./agents/code-reviewer.ts";
import { buildPrSummarizerSystemPrompt, buildPrSummarizerUserPrompt } from "./agents/pr-summarizer.ts";
import { buildSecurityScannerSystemPrompt, buildSecurityScannerUserPrompt } from "./agents/security-scanner.ts";
import { runStaticAnalyzers } from "./static-analyzers/runner.ts";

// ── Review engine ────────────────────────────────────────────────

export interface ReviewEngineOptions {
	config: ReviewConfig;
	files: DiffFile[];
	/** Optional API key override. Falls back to env vars. */
	apiKey?: string;
}

export interface ReviewSummary {
	summary: string | null;
	findings: ReviewFinding[];
	tokensUsed: number;
	staticAnalysis?: {
		analyzers: string[];
		runtime: number;
	};
}

/**
 * Run the configured review agents against the parsed diff files.
 *
 * Pipeline:
 *   Phase 1: PR summary (LLM)
 *   Phase 2: Code review (LLM — bugs, logic, quality)
 *   Phase 3: Security scan (LLM — OWASP, vulnerabilities)
 *   Phase 4: Static analyzers (Semgrep, detect-secrets)
 *   → Deduplicate → Filter by confidence → Cap by max-comments
 */
export async function runReview(options: ReviewEngineOptions): Promise<ReviewSummary> {
	const { config, files } = options;
	const reviewCfg = config.review!;
	const agents = reviewCfg.agents ?? ["pr-summarizer", "code-reviewer"];
	const maxComments = reviewCfg.thresholds?.["max-comments"] ?? 20;
	const minConfidence = reviewCfg.thresholds?.["min-confidence"] ?? 0.6;
	const staticAnalyzerMode: StaticAnalyzerMode = reviewCfg["static-analyzers"] ?? "auto";

	// Filter files by path patterns if configured
	const filteredFiles = filterFilesByPaths(files, reviewCfg.paths);

	if (filteredFiles.length === 0) {
		return { summary: null, findings: [], tokensUsed: 0 };
	}

	// Resolve the model
	const model = resolveModel(reviewCfg.provider ?? "opencode-go", reviewCfg.model ?? "deepseek-v4-flash");
	const apiKey = options.apiKey;

	let summary: string | null = null;
	let allFindings: ReviewFinding[] = [];
	let totalTokens = 0;
	let staticRuntime = 0;
	let ranAnalyzers: string[] = [];

	// Phase 1: PR summary (always runs first, provides context)
	if (agents.includes("pr-summarizer")) {
		const summaryResult = await generatePrSummary(model, filteredFiles, apiKey);
		summary = summaryResult.text;
		totalTokens += summaryResult.tokens;
	}

	// Phase 2: Code review (semantic bug/quality analysis)
	if (agents.includes("code-reviewer")) {
		const reviewResult = await runCodeReview(model, filteredFiles, maxComments, apiKey);
		allFindings = allFindings.concat(reviewResult.findings);
		totalTokens += reviewResult.tokens;
	}

	// Phase 3: Security scan (LLM — OWASP, injection, secrets, etc.)
	if (agents.includes("security-scanner")) {
		const securityResult = await runSecurityScan(model, filteredFiles, maxComments, apiKey);
		allFindings = allFindings.concat(securityResult.findings);
		totalTokens += securityResult.tokens;
	}

	// Phase 4: Static analyzers (Semgrep, detect-secrets, etc.)
	const staticResult = runStaticAnalyzers(filteredFiles, staticAnalyzerMode);
	allFindings = allFindings.concat(staticResult.findings);
	staticRuntime = staticResult.runtime;
	ranAnalyzers = staticResult.analyzers;

	// Deduplicate findings across all phases
	allFindings = deduplicateFindings(allFindings);

	// Apply confidence threshold
	allFindings = allFindings.filter((f) => f.confidence >= minConfidence);

	// Apply max comments cap (prioritize by severity)
	if (allFindings.length > maxComments) {
		allFindings = allFindings
			.sort((a, b) => severityWeight(b.severity) - severityWeight(a.severity))
			.slice(0, maxComments);
	}

	return {
		summary,
		findings: allFindings,
		tokensUsed: totalTokens,
		staticAnalysis: {
			analyzers: ranAnalyzers,
			runtime: staticRuntime,
		},
	};
}

// ── Phase 1: PR Summary ──────────────────────────────────────────

async function generatePrSummary(
	model: Model<string>,
	files: DiffFile[],
	apiKey?: string,
): Promise<{ text: string; tokens: number }> {
	const systemPrompt = buildPrSummarizerSystemPrompt();
	const userPrompt = buildPrSummarizerUserPrompt(files);

	try {
		const result = await complete(
			model,
			{
				systemPrompt,
				messages: [{ role: "user", content: userPrompt, timestamp: Date.now() }],
			},
			apiKey ? { apiKey } : undefined,
		);

		const text = extractText(result);
		const tokens = (result.usage?.input ?? 0) + (result.usage?.output ?? 0);
		return { text, tokens };
	} catch (err) {
		console.error("PR summary generation failed:", err);
		return { text: "", tokens: 0 };
	}
}

// ── Phase 2: Code Review ─────────────────────────────────────────

async function runCodeReview(
	model: Model<string>,
	files: DiffFile[],
	maxComments: number,
	apiKey?: string,
): Promise<{ findings: ReviewFinding[]; tokens: number }> {
	const systemPrompt = buildCodeReviewerSystemPrompt(maxComments);
	const userPrompt = buildCodeReviewerUserPrompt(files);

	try {
		const result = await complete(
			model,
			{
				systemPrompt,
				messages: [{ role: "user", content: userPrompt, timestamp: Date.now() }],
			},
			apiKey ? { apiKey } : undefined,
		);

		const rawText = extractText(result);
		const tokens = (result.usage?.input ?? 0) + (result.usage?.output ?? 0);
		const findings = parseFindingsFromJson(rawText, files, "code-reviewer");

		return { findings, tokens };
	} catch (err) {
		console.error("Code review failed:", err);
		return { findings: [], tokens: 0 };
	}
}

// ── Phase 3: Security Scan ───────────────────────────────────────

async function runSecurityScan(
	model: Model<string>,
	files: DiffFile[],
	maxComments: number,
	apiKey?: string,
): Promise<{ findings: ReviewFinding[]; tokens: number }> {
	const systemPrompt = buildSecurityScannerSystemPrompt(maxComments);
	const userPrompt = buildSecurityScannerUserPrompt(files);

	try {
		const result = await complete(
			model,
			{
				systemPrompt,
				messages: [{ role: "user", content: userPrompt, timestamp: Date.now() }],
			},
			apiKey ? { apiKey } : undefined,
		);

		const rawText = extractText(result);
		const tokens = (result.usage?.input ?? 0) + (result.usage?.output ?? 0);
		const findings = parseFindingsFromJson(rawText, files, "security-scanner");

		return { findings, tokens };
	} catch (err) {
		console.error("Security scan failed:", err);
		return { findings: [], tokens: 0 };
	}
}

// ── Finding parsing ──────────────────────────────────────────────

let findingCounter = 0;

function parseFindingsFromJson(raw: string, files: DiffFile[], agentType: AgentType): ReviewFinding[] {
	// Try to extract JSON array from the response
	const jsonMatch = raw.match(/\[[\s\S]*\]/);
	if (!jsonMatch) return [];

	try {
		const parsed = JSON.parse(jsonMatch[0]);
		if (!Array.isArray(parsed)) return [];

		return parsed
			.map((item: Record<string, unknown>) => {
				const filePath = String(item.filePath ?? item.file ?? "");
				const line = Number(item.line) || 0;
				const severity = validateSeverity(item.severity);
				const confidence = Number(item.confidence) || 0;

				findingCounter++;

				return {
					id: `${agentType}-${findingCounter}`,
					agent: agentType,
					filePath,
					line,
					severity,
					title: String(item.title ?? "Unknown issue"),
					description: String(item.description ?? ""),
					suggestion: item.suggestion ? String(item.suggestion) : undefined,
					confidence,
				} as ReviewFinding;
			})
			.filter((f: ReviewFinding) => {
				// Filter out findings on invalid lines
				const lineCheck = validateLine(f.filePath, f.line, files);
				return lineCheck.valid;
			});
	} catch {
		return [];
	}
}

function validateSeverity(value: unknown): ReviewSeverity {
	if (value === "critical" || value === "warning" || value === "info" || value === "nit") {
		return value;
	}
	return "info";
}

// ── Helpers ──────────────────────────────────────────────────────

function resolveModel(provider: string, modelId: string): Model<Api> {
	// Try the model registry first — gives us all Model fields (baseUrl,
	// reasoning, cost, etc.) that providers need at runtime.
	try {
		const registered = getModel(provider as Parameters<typeof getModel>[0], modelId as never);
		if (registered) return registered as Model<Api>;
	} catch {
		// Fall through to constructed model
	}

	// Fallback: build a minimal model with sensible defaults.
	// API type is derived from a known provider map; "openai-completions"
	// covers most custom/open-compatible endpoints.
	const apiMap: Record<string, Api> = {
		"opencode-go": "openai-completions",
		opencode: "openai-completions",
		anthropic: "anthropic-messages",
		openai: "openai-completions",
		google: "google-generative-ai",
		mistral: "mistral-conversations",
	};
	const api = apiMap[provider] ?? "openai-completions";
	return {
		id: modelId,
		name: modelId,
		api,
		provider,
		baseUrl: "",
		reasoning: false,
		input: ["text"],
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: 128_000,
		maxTokens: 4_096,
	} as Model<Api>;
}

function filterFilesByPaths(files: DiffFile[], paths?: { include?: string[]; exclude?: string[] }): DiffFile[] {
	if (!paths) return files;

	let result = files;

	if (paths.include && paths.include.length > 0) {
		result = result.filter((f) => paths.include!.some((pattern) => matchGlob(f.filePath, pattern)));
	}

	if (paths.exclude && paths.exclude.length > 0) {
		result = result.filter((f) => !paths.exclude!.some((pattern) => matchGlob(f.filePath, pattern)));
	}

	return result;
}

function matchGlob(filePath: string, pattern: string): boolean {
	// Simple glob matching — supports **/* and * wildcards
	const regexStr = pattern
		.replace(/\./g, "\\.")
		.replace(/\*\*/g, "___DOUBLESTAR___")
		.replace(/\*/g, "[^/]*")
		.replace(/___DOUBLESTAR___/g, ".*");
	return new RegExp(`^${regexStr}$`).test(filePath);
}

function extractText(msg: { content: Array<{ type: string; text?: string }> }): string {
	return msg.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text" && !!c.text)
		.map((c) => c.text)
		.join("\n")
		.trim();
}

function severityWeight(severity: ReviewSeverity): number {
	switch (severity) {
		case "critical":
			return 4;
		case "warning":
			return 3;
		case "info":
			return 2;
		case "nit":
			return 1;
	}
}

function deduplicateFindings(findings: ReviewFinding[]): ReviewFinding[] {
	const seen = new Set<string>();
	return findings.filter((f) => {
		const key = `${f.filePath}:${f.line}:${f.title}`;
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}
