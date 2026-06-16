// ── Types ────────────────────────────────────────────────────────

export type {
	AgentType,
	ConfidenceRange,
	DiffFile,
	PrContext,
	ReviewConfig,
	ReviewFinding,
	ReviewMode,
	ReviewResult,
	ReviewSeverity,
	StaticAnalyzerMode,
} from "./types.ts";

export { DEFAULT_REVIEW_CONFIG, ReviewConfigSchema } from "./types.ts";

// ── GitHub integration ───────────────────────────────────────────

export type { LineValidationResult } from "./github/diff-parser.ts";
export { chunkFilesBySize, parseDiff, validateLine } from "./github/diff-parser.ts";
export { GitHubClient } from "./github/github-client.ts";

// ── Review engine ────────────────────────────────────────────────

export type { ReviewEngineOptions, ReviewSummary } from "./review/review-engine.ts";
export { runReview } from "./review/review-engine.ts";

// ── Config ───────────────────────────────────────────────────────

export { loadConfig, parseConfigContent } from "./review/config.ts";

// ── Agent prompts (for customization) ────────────────────────────

export {
	buildCodeReviewerSystemPrompt,
	buildCodeReviewerUserPrompt,
} from "./review/agents/code-reviewer.ts";

export {
	buildSecurityScannerSystemPrompt,
	buildSecurityScannerUserPrompt,
} from "./review/agents/security-scanner.ts";

// ── Static analyzers ─────────────────────────────────────────────

export {
	buildPrSummarizerSystemPrompt,
	buildPrSummarizerUserPrompt,
} from "./review/agents/pr-summarizer.ts";
export { runDetectSecrets } from "./review/static-analyzers/detect-secrets.ts";
export type { StaticAnalysisResult } from "./review/static-analyzers/runner.ts";
export { runStaticAnalyzers } from "./review/static-analyzers/runner.ts";
export { runSemgrep } from "./review/static-analyzers/semgrep.ts";
