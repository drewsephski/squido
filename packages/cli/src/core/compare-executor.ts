/**
 * Compare executor - runs the same prompt against multiple models in parallel.
 *
 * Uses fresh Agent instances for each model fork to ensure isolation.
 */

import type { AgentMessage, AgentTool } from "@drewsepsi/squido-agent-core";
import { Agent } from "@drewsepsi/squido-agent-core";
import type { AssistantMessage, ImageContent, Model } from "@drewsepsi/squido-ai";
import type { ComparisonModelResult, ComparisonProgress, ComparisonResult } from "./compare-types.ts";

/**
 * Options for running a comparison.
 */
export interface CompareOptions {
	/** The prompt to send to each model */
	prompt: string;
	/** Images to attach to the prompt */
	images?: ImageContent[];
	/** Abort signal for cancellation */
	signal?: AbortSignal;
	/** Callback for progress updates */
	onProgress?: (progress: ComparisonProgress) => void;
}

/**
 * Resolved model info with an API key getter for agent use.
 */
export interface ResolvedCompareModel {
	model: Model<any>;
	getApiKey: () => string | undefined;
	headers?: Record<string, string>;
}

/**
 * Run the same prompt against multiple models in parallel.
 *
 * Creates a fresh Agent for each model, configures it with the same
 * context, system prompt, and tools, then sends the prompt.
 */
export async function compareModels(
	systemPrompt: string,
	contextMessages: AgentMessage[],
	tools: AgentTool[],
	models: ResolvedCompareModel[],
	options: CompareOptions,
): Promise<ComparisonResult> {
	const { prompt, images, onProgress } = options;
	const results: ComparisonModelResult[] = [];
	const timestamp = new Date().toISOString();

	const runModel = async (modelInfo: ResolvedCompareModel): Promise<ComparisonModelResult> => {
		const modelLabel = `${modelInfo.model.provider}/${modelInfo.model.id}`;
		const startTime = Date.now();

		try {
			onProgress?.({ model: modelLabel, status: "pending" });

			// Create a fresh Agent for this model fork
			const forkAgent = new Agent({
				getApiKey: modelInfo.getApiKey,
			});

			// Configure the forked agent with the same context
			forkAgent.state.systemPrompt = systemPrompt;
			forkAgent.state.model = modelInfo.model;
			forkAgent.state.tools = tools;

			onProgress?.({ model: modelLabel, status: "streaming" });

			// Build the messages: context + prompt
			const userContent: Array<{ type: "text"; text: string } | ImageContent> = [{ type: "text", text: prompt }];
			if (images) {
				userContent.push(...images);
			}
			const userMessage: AgentMessage = {
				role: "user",
				content: userContent,
				timestamp: Date.now(),
			};

			// Prepend context messages before the prompt
			const allMessages: AgentMessage[] = [...contextMessages, userMessage];

			// Run the prompt against this model
			await forkAgent.prompt(allMessages);

			// Find the assistant message in the results
			const stateMessages = forkAgent.state.messages;
			let assistantMessage: AssistantMessage | undefined;
			for (let i = stateMessages.length - 1; i >= 0; i--) {
				const msg = stateMessages[i];
				if (msg.role === "assistant") {
					assistantMessage = msg as AssistantMessage;
					break;
				}
			}

			if (!assistantMessage) {
				throw new Error("No assistant message produced");
			}

			const latencyMs = Date.now() - startTime;
			const usage = assistantMessage.usage || {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			};

			onProgress?.({ model: modelLabel, status: "complete" });

			const costInput = modelInfo.model.cost?.input ?? 0;
			const costOutput = modelInfo.model.cost?.output ?? 0;

			return {
				model: modelInfo.model,
				assistantMessage,
				success: true,
				usage: {
					input: usage.input,
					output: usage.output,
					cacheRead: usage.cacheRead,
					cacheWrite: usage.cacheWrite,
					totalTokens: usage.totalTokens,
					cost:
						usage.input * costInput +
						usage.output * costOutput +
						usage.cacheRead * (modelInfo.model.cost?.cacheRead ?? costInput) +
						usage.cacheWrite * (modelInfo.model.cost?.cacheWrite ?? costInput),
				},
				latencyMs,
			};
		} catch (error) {
			const latencyMs = Date.now() - startTime;
			const errorMessage = error instanceof Error ? error.message : String(error);
			onProgress?.({ model: modelLabel, status: "error", message: errorMessage });

			return {
				model: modelInfo.model,
				assistantMessage: {
					role: "assistant",
					content: [{ type: "text", text: "" }],
					api: modelInfo.model.api,
					provider: modelInfo.model.provider,
					model: modelInfo.model.id,
					stopReason: "error",
					errorMessage,
					timestamp: Date.now(),
					usage: {
						input: 0,
						output: 0,
						cacheRead: 0,
						cacheWrite: 0,
						totalTokens: 0,
						cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
					},
				},
				success: false,
				errorMessage,
				usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: 0 },
				latencyMs,
			};
		}
	};

	// Run all models in parallel
	const promises = models.map((m) => runModel(m));
	const settled = await Promise.allSettled(promises);

	for (const s of settled) {
		if (s.status === "fulfilled") {
			results.push(s.value);
		}
	}

	return {
		prompt,
		results,
		timestamp,
	};
}
