import type { DiffFile } from "../types.ts";

// ── Unified diff parsing ─────────────────────────────────────────

/**
 * Parse a unified diff string into per-file DiffFile objects.
 * Handles standard `git diff` output format.
 */
export function parseDiff(diffInput: string): DiffFile[] {
	if (!diffInput.trim()) return [];

	const files: DiffFile[] = [];
	const fileChunks = splitDiffByFile(diffInput);

	for (const chunk of fileChunks) {
		const file = parseFileChunk(chunk);
		if (file) files.push(file);
	}

	return files;
}

/**
 * Split a multi-file diff into per-file chunks.
 * Each chunk starts with `diff --git a/... b/...`.
 */
function splitDiffByFile(diff: string): string[] {
	const chunks: string[] = [];
	const lines = diff.split("\n");
	let currentChunk: string[] = [];
	let inChunk = false;

	for (const line of lines) {
		if (line.startsWith("diff --git ")) {
			if (inChunk && currentChunk.length > 0) {
				chunks.push(currentChunk.join("\n"));
			}
			currentChunk = [line];
			inChunk = true;
		} else if (inChunk) {
			currentChunk.push(line);
		}
	}

	if (currentChunk.length > 0) {
		chunks.push(currentChunk.join("\n"));
	}

	return chunks;
}

/**
 * Parse a single file's unified diff chunk into a DiffFile.
 */
function parseFileChunk(chunk: string): DiffFile | null {
	const lines = chunk.split("\n");
	if (lines.length === 0) return null;

	// Extract file paths from `diff --git a/path b/path`
	const diffLine = lines[0];
	const match = diffLine.match(/^diff --git a\/(.+?) b\/(.+?)$/);
	if (!match) return null;

	const filePath = match[2];
	const originalPath = match[1] !== match[2] ? match[1] : null;

	// Determine status
	const status = determineStatus(lines, filePath);

	// Extract added lines and context ranges
	const addedLines = new Set<number>();
	const reviewableRanges: Array<{ start: number; end: number }> = [];

	for (const line of lines) {
		// Match unified diff hunk header: @@ -oldStart,oldCount +newStart,newCount @@
		const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
		if (hunkMatch) {
			// Start tracking a new hunk
			const newStart = Number.parseInt(hunkMatch[1], 10);
			const newCount = hunkMatch[2] ? Number.parseInt(hunkMatch[2], 10) : 1;
			// Lines from newStart to newStart + newCount - 1 are touched
			if (newCount > 0) {
				const range = { start: newStart, end: newStart + newCount - 1 };
				reviewableRanges.push(range);
			}
			continue;
		}

		// Track added lines (+ prefix in diff content lines, but not +++ header)
		if (line.startsWith("+") && !line.startsWith("+++ ")) {
			// We need to track the new line number. Instead of precise tracking,
			// we compute it from the hunk context. We'll handle this differently.
		}
	}

	// More precise line tracking: walk the diff and track line numbers
	let newLineNum = 0;
	let inHunk = false;

	for (const line of lines) {
		if (line.startsWith("@@")) {
			const hunkMatch = line.match(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/);
			if (hunkMatch) {
				newLineNum = Number.parseInt(hunkMatch[1], 10);
				inHunk = true;
			}
			continue;
		}

		if (!inHunk) continue;

		if (line.startsWith("+")) {
			addedLines.add(newLineNum);
			newLineNum++;
		} else if (line.startsWith(" ")) {
			// Context line — not added but advances line counter
			newLineNum++;
		}
		// Deleted lines (-) don't advance new line counter
	}

	return {
		filePath,
		originalPath,
		diff: chunk,
		reviewableRanges,
		addedLines,
		status,
	};
}

/**
 * Determine file status from diff headers.
 */
function determineStatus(lines: string[], _filePath: string): "added" | "modified" | "deleted" | "renamed" {
	for (const line of lines) {
		if (line.startsWith("new file mode")) return "added";
		if (line.startsWith("deleted file mode")) return "deleted";
		if (line.startsWith("rename from ") || line.startsWith("rename to ")) return "renamed";
	}
	return "modified";
}

// ── Diff chunking for large PRs ──────────────────────────────────

const CHUNK_TARGET_SIZE = 50_000; // characters per chunk

/**
 * Split changed files into chunks of approximately CHUNK_TARGET_SIZE chars.
 * Each chunk is a self-contained set of files (not partial files).
 */
export function chunkFilesBySize(files: DiffFile[], targetSize = CHUNK_TARGET_SIZE): DiffFile[][] {
	const chunks: DiffFile[][] = [];
	let currentChunk: DiffFile[] = [];
	let currentSize = 0;

	for (const file of files) {
		const fileSize = file.diff.length;

		// If this file alone exceeds target, give it its own chunk
		if (fileSize > targetSize) {
			if (currentChunk.length > 0) {
				chunks.push(currentChunk);
				currentChunk = [];
				currentSize = 0;
			}
			chunks.push([file]);
			continue;
		}

		if (currentSize + fileSize > targetSize && currentChunk.length > 0) {
			chunks.push(currentChunk);
			currentChunk = [];
			currentSize = 0;
		}

		currentChunk.push(file);
		currentSize += fileSize;
	}

	if (currentChunk.length > 0) {
		chunks.push(currentChunk);
	}

	return chunks;
}

// ── Line validation ──────────────────────────────────────────────

export interface LineValidationResult {
	valid: boolean;
	reason?: string;
	/** If invalid, the valid line ranges the agent should use instead */
	hint?: string;
}

/**
 * Validate that a (filePath, line) combination is reviewable.
 * Returns a structured error with valid ranges if the line is not valid,
 * allowing the agent to self-correct.
 */
export function validateLine(filePath: string, line: number, files: DiffFile[]): LineValidationResult {
	const file = files.find((f) => f.filePath === filePath);
	if (!file) {
		return {
			valid: false,
			reason: `File "${filePath}" is not in the PR diff`,
			hint: formatValidFilesHint(files),
		};
	}

	if (!file.addedLines.has(line)) {
		const validRanges = file.reviewableRanges.filter((r) => r.start <= r.end).map((r) => `${r.start}-${r.end}`);
		return {
			valid: false,
			reason: `Line ${line} in "${filePath}" is not in the diff (not an added line)`,
			hint: `Valid line ranges for "${filePath}": ${validRanges.join(", ") || "none"}`,
		};
	}

	return { valid: true };
}

function formatValidFilesHint(files: DiffFile[]): string {
	const names = files.map((f) => f.filePath).join(", ");
	return `Files in this PR: ${names || "(empty)"}`;
}
