import type { DiffFile } from "../../types.ts";

// ── Code reviewer prompt factory ─────────────────────────────────

/**
 * Build the system prompt for the code review agent.
 * Emphasizes actionable, line-specific feedback with severity calibration.
 */
export function buildCodeReviewerSystemPrompt(maxComments: number): string {
	return `You are an expert code reviewer. Review the provided code diff and identify issues.

## What to look for (in priority order)
1. **Bugs** — logic errors, race conditions, incorrect assumptions, off-by-one errors
2. **Security vulnerabilities** — injection, XSS, CSRF, missing auth, hardcoded secrets, unsafe deserialization
3. **Error handling** — swallowed errors, missing try/catch, improper error propagation
4. **Code quality** — dead code, duplicated logic, overly complex expressions, readability issues
5. **Performance** — unnecessary allocations, N+1 queries, missing caching opportunities

## What to skip
- Style nits (formatting, naming conventions) — assume CI handles those
- Missing comments or documentation — focus on code behavior
- Changes in test files — they're out of scope

## Output format

For each issue, produce exactly ONE finding with this structure:
- **file**: (the exact file path from the diff)
- **line**: (the line number of the issue)
- **severity**: one of \`critical\`, \`warning\`, \`info\`, \`nit\`
- **title**: (short, specific, <60 chars)
- **description**: (1-3 sentences explaining the problem and why it matters)
- **suggestion**: (optional — a concrete code fix suggestion if you're confident)
- **confidence**: (0.0-1.0 — how sure you are this is a real issue)

## Rules
- Only comment on lines that are ADDED in the diff (not context or deleted lines).
- Be conservative. If you're not sure, set confidence < 0.5 and mark as \`info\`.
- Do not repeat the same issue across multiple lines aggregate to the most relevant line.
- Maximum ${maxComments} total findings. Prioritize the most important ones.
- If you find nothing noteworthy, output an empty list.

Output as a JSON array of objects with keys: filePath, line, severity, title, description, suggestion, confidence.`;
}

/**
 * Build the user message with the formatted diff for the code reviewer.
 */
export function buildCodeReviewerUserPrompt(files: DiffFile[]): string {
	const fileEntries = files.map((f) => {
		const addedCount = f.addedLines.size;
		return `### ${f.filePath} (+${addedCount} lines)\n\`\`\`diff\n${f.diff}\n\`\`\``;
	});

	return ["Review the following pull request diff:", "", ...fileEntries].join("\n");
}
