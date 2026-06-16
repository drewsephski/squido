import type { Static } from "typebox";
import { Type } from "typebox";

// ── Severity levels ──────────────────────────────────────────────

export type ReviewSeverity = "critical" | "warning" | "info" | "nit";

// ── Confidence ───────────────────────────────────────────────────

export interface ConfidenceRange {
	min: number; // 0.0 - 1.0
}

// ── Review finding (single issue found by an agent) ──────────────

export interface ReviewFinding {
	/** Unique ID per review run (e.g. "finding-1") */
	id: string;
	/** Which agent produced this finding */
	agent: AgentType;
	/** File path relative to repo root */
	filePath: string;
	/** Line number in the diff (new file line number) */
	line: number;
	/** Severity */
	severity: ReviewSeverity;
	/** Human-readable title */
	title: string;
	/** Detailed description */
	description: string;
	/** Optional suggested code fix (markdown code block) */
	suggestion?: string;
	/** 0.0 - 1.0 confidence score */
	confidence: number;
}

// ── Agent types ──────────────────────────────────────────────────

export type AgentType = "pr-summarizer" | "code-reviewer" | "security-scanner";

// ── Review mode ──────────────────────────────────────────────────

export type ReviewMode = "advisory" | "blocking";

// ── Static analyzer mode ─────────────────────────────────────────

export type StaticAnalyzerMode = "auto" | "off" | string[];

// ── Review configuration (from .squido-review.yaml) ──────────────

export const ReviewConfigSchema = Type.Object({
	review: Type.Optional(
		Type.Object({
			provider: Type.Optional(Type.String()),
			model: Type.Optional(Type.String()),
			agents: Type.Optional(
				Type.Array(
					Type.Union([
						Type.Literal("pr-summarizer"),
						Type.Literal("code-reviewer"),
						Type.Literal("security-scanner"),
					]),
				),
			),
			"static-analyzers": Type.Optional(
				Type.Union([Type.Literal("auto"), Type.Literal("off"), Type.Array(Type.String())] as const),
			),
			paths: Type.Optional(
				Type.Object({
					include: Type.Optional(Type.Array(Type.String())),
					exclude: Type.Optional(Type.Array(Type.String())),
				}),
			),
			thresholds: Type.Optional(
				Type.Object({
					"max-comments": Type.Optional(Type.Number()),
					"min-confidence": Type.Optional(Type.Number()),
				}),
			),
			mode: Type.Optional(Type.Union([Type.Literal("advisory"), Type.Literal("blocking")] as const)),
		}),
	),
});

export type ReviewConfig = Static<typeof ReviewConfigSchema>;

export const DEFAULT_REVIEW_CONFIG: ReviewConfig = {
	review: {
		provider: "opencode-go",
		model: "deepseek-v4-flash",
		agents: ["pr-summarizer", "code-reviewer"],
		"static-analyzers": "auto",
		thresholds: {
			"max-comments": 20,
			"min-confidence": 0.6,
		},
		mode: "advisory",
	},
};

// ── Diff chunk ───────────────────────────────────────────────────

export interface DiffFile {
	/** File path relative to repo root */
	filePath: string;
	/** Original file path (null for new files) */
	originalPath: string | null;
	/** Unified diff content for this file */
	diff: string;
	/** Line ranges that are reviewable (added lines + context) */
	reviewableRanges: Array<{ start: number; end: number }>;
	/** All line numbers that are additions */
	addedLines: Set<number>;
	/** Status: added, modified, deleted, renamed */
	status: "added" | "modified" | "deleted" | "renamed";
}

// ── Review result ────────────────────────────────────────────────

export interface ReviewResult {
	/** Summary of the PR changes */
	summary: string | null;
	/** Inline findings */
	findings: ReviewFinding[];
	/** Which config was used */
	config: ReviewConfig;
	/** Total tokens used */
	tokensUsed: number;
}

// ── GitHub PR context (passed to entrypoints) ────────────────────

export interface PrContext {
	owner: string;
	repo: string;
	prNumber: number;
	sha: string;
	token: string;
	apiUrl?: string;
}
