/**
 * Types for the Model Arena comparison feature.
 *
 * These types define the data structures used to represent model comparison
 * results, both for persistence (session entries) and runtime rendering.
 */

import type { AssistantMessage, Model } from "@drewsepsi/squido-ai";

/**
 * Usage and cost data for a single model's response in a comparison.
 */
export interface ComparisonModelResult {
	/** The model that was used */
	model: Model<any>;
	/** The assistant message produced by the model */
	assistantMessage: AssistantMessage;
	/** Whether this model completed successfully */
	success: boolean;
	/** Error message if the model failed */
	errorMessage?: string;
	/** Token usage breakdown */
	usage: {
		input: number;
		output: number;
		cacheRead: number;
		cacheWrite: number;
		totalTokens: number;
		cost: number;
	};
	/** How long the model took to respond (ms) */
	latencyMs: number;
}

/**
 * Complete comparison result from running a prompt against multiple models.
 */
export interface ComparisonResult {
	/** The prompt that was used for comparison */
	prompt: string;
	/** Results from each model */
	results: ComparisonModelResult[];
	/** ISO timestamp when comparison was run */
	timestamp: string;
	/** Optional user-assigned label for this comparison */
	label?: string;
	/** Optional ID of the model the user declared as winner */
	winnerModelId?: string;
}

/**
 * Session entry type for persisting comparison data.
 * This is stored as a CustomEntry with customType "comparison".
 */
export interface ComparisonSessionData {
	type: "comparison";
	/** The prompt text used */
	prompt: string;
	/** Models compared (provider/id format) */
	models: Array<{ provider: string; modelId: string }>;
	/** Entry IDs of the forked session runs - used for re-viewing */
	forkEntryIds: string[];
	/** ISO timestamp */
	timestamp: string;
	/** User-declared winner (provider/modelId) */
	winner?: { provider: string; modelId: string };
	/** User-assigned label */
	label?: string;
}

/**
 * Progress update emitted during comparison execution.
 */
export interface ComparisonProgress {
	model: string; // "provider/modelId"
	status: "pending" | "streaming" | "complete" | "error";
	message?: string;
}
