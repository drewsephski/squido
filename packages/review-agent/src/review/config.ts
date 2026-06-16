import { existsSync, readFileSync } from "node:fs";
import type { Static } from "typebox";
import { Type } from "typebox";
import { parse as parseYaml } from "yaml";
import type { ReviewConfig } from "../types.ts";
import { DEFAULT_REVIEW_CONFIG } from "../types.ts";

// ── Config file discovery ────────────────────────────────────────

const CONFIG_FILES = [".squido-review.yaml", ".squido-review.yml"];

/**
 * Discover and load the review config from a repo's root directory.
 * Returns the default config if no file is found.
 */
export function loadConfig(repoRoot: string): ReviewConfig {
	for (const filename of CONFIG_FILES) {
		const fullPath = `${repoRoot}/${filename}`;
		if (existsSync(fullPath)) {
			try {
				const content = readFileSync(fullPath, "utf-8");
				return parseConfigContent(content);
			} catch (err) {
				console.error(`Failed to load ${fullPath}:`, err);
				return { ...DEFAULT_REVIEW_CONFIG };
			}
		}
	}
	return { ...DEFAULT_REVIEW_CONFIG };
}

/**
 * Parse YAML config content and merge with defaults.
 */
export function parseConfigContent(content: string): ReviewConfig {
	let raw: unknown;
	try {
		raw = parseYaml(content);
	} catch {
		return { ...DEFAULT_REVIEW_CONFIG };
	}
	if (!raw || typeof raw !== "object") {
		return { ...DEFAULT_REVIEW_CONFIG };
	}

	const parsed = validatePartialConfig(raw);
	return deepMerge(DEFAULT_REVIEW_CONFIG, parsed) as unknown as ReviewConfig;
}

// ── Schema for partial validation ────────────────────────────────

const PartialReviewConfigSchema = Type.Object({
	review: Type.Optional(
		Type.Object({
			provider: Type.Optional(Type.String()),
			model: Type.Optional(Type.String()),
			agents: Type.Optional(Type.Array(Type.String())),
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

type PartialReviewConfig = Static<typeof PartialReviewConfigSchema>;

/**
 * Validate that the parsed config structure matches the expected shape.
 * Silently drops unknown fields, preserves known ones.
 */
function validatePartialConfig(raw: unknown): PartialReviewConfig {
	if (typeof raw !== "object" || raw === null) return {};
	const obj = raw as Record<string, unknown>;
	const review = obj.review;
	if (!review || typeof review !== "object") return {};

	const r = review as Record<string, unknown>;
	const result: PartialReviewConfig = {};

	if (typeof r.provider === "string") result.review = { ...result.review, provider: r.provider };
	if (typeof r.model === "string") result.review = { ...result.review, model: r.model };
	if (Array.isArray(r.agents)) {
		const validAgents = r.agents.filter((a): a is string => typeof a === "string");
		result.review = {
			...result.review,
			agents: validAgents as ("pr-summarizer" | "code-reviewer" | "security-scanner")[],
		};
	}
	if (r["static-analyzers"] === "auto" || r["static-analyzers"] === "off" || Array.isArray(r["static-analyzers"])) {
		result.review = { ...result.review, "static-analyzers": r["static-analyzers"] };
	}
	if (typeof r.paths === "object" && r.paths !== null) {
		const p = r.paths as Record<string, unknown>;
		const paths: { include?: string[]; exclude?: string[] } = {};
		if (Array.isArray(p.include)) paths.include = p.include.filter((x): x is string => typeof x === "string");
		if (Array.isArray(p.exclude)) paths.exclude = p.exclude.filter((x): x is string => typeof x === "string");
		if (paths.include || paths.exclude) result.review = { ...result.review, paths };
	}
	if (typeof r.thresholds === "object" && r.thresholds !== null) {
		const t = r.thresholds as Record<string, unknown>;
		const thresholds: { "max-comments"?: number; "min-confidence"?: number } = {};
		if (typeof t["max-comments"] === "number") thresholds["max-comments"] = t["max-comments"];
		if (typeof t["min-confidence"] === "number") thresholds["min-confidence"] = t["min-confidence"];
		if (thresholds["max-comments"] !== undefined || thresholds["min-confidence"] !== undefined) {
			result.review = { ...result.review, thresholds };
		}
	}
	if (r.mode === "advisory" || r.mode === "blocking") result.review = { ...result.review, mode: r.mode };

	return result;
}

// ── Deep merge helper ────────────────────────────────────────────

function deepMerge(target: Record<string, unknown>, source: Record<string, unknown>): Record<string, unknown> {
	const result = { ...target };
	for (const key of Object.keys(source)) {
		const targetVal = target[key];
		const sourceVal = source[key];
		if (isPlainObject(targetVal) && isPlainObject(sourceVal)) {
			result[key] = deepMerge(targetVal, sourceVal);
		} else if (sourceVal !== undefined) {
			result[key] = sourceVal;
		}
	}
	return result;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null && !Array.isArray(value);
}
