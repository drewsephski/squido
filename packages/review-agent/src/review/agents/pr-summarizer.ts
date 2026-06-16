import type { DiffFile } from "../../types.ts";

// ── PR summarizer prompt factory ─────────────────────────────────

/**
 * Build the system prompt for the PR summarizer agent.
 */
export function buildPrSummarizerSystemPrompt(): string {
	return `You are a PR summarizer. Your job is to produce a concise, informative summary of a pull request's changes.

Given the diff of a pull request, produce a summary that covers:
1. **What changed** — a high-level description of the modifications
2. **Why it matters** — the purpose or motivation behind the changes
3. **Key areas affected** — which modules/files/components were touched
4. **Potential risks** — any areas that deserve extra human attention

Keep the summary under 200 words. Use plain language. Do not repeat file paths or line numbers — focus on conceptual changes.

Output ONLY the summary text. No markdown formatting, no section headers, no preamble.`;
}

/**
 * Build the user message containing the diff context for summarization.
 */
export function buildPrSummarizerUserPrompt(files: DiffFile[]): string {
	const parts = files.map((f) => {
		const statusIcon =
			f.status === "added" ? "[NEW]" : f.status === "deleted" ? "[DEL]" : f.status === "renamed" ? "[REN]" : "[MOD]";
		const addedCount = f.addedLines.size;
		return `${statusIcon} ${f.filePath} (+${addedCount} lines)`;
	});

	const fileList = parts.join("\n");
	const fullDiff = files.map((f) => f.diff).join("\n");

	return ["## Changed files", "", fileList, "", "## Full diff", "", "```diff", fullDiff, "```"].join("\n");
}
