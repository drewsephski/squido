import { describe, expect, it } from "vitest";
import { chunkFilesBySize, parseDiff, validateLine } from "../github/diff-parser.ts";

describe("parseDiff", () => {
	it("returns empty array for empty input", () => {
		expect(parseDiff("")).toEqual([]);
		expect(parseDiff("   ")).toEqual([]);
	});

	it("parses a single file modified diff", () => {
		const diff = [
			"diff --git a/src/file.ts b/src/file.ts",
			"index abc..def 100644",
			"--- a/src/file.ts",
			"+++ b/src/file.ts",
			"@@ -1,3 +1,4 @@",
			" line1",
			"-old line",
			"+new line",
			" line3",
		].join("\n");

		const files = parseDiff(diff);
		expect(files).toHaveLength(1);
		expect(files[0].filePath).toBe("src/file.ts");
		expect(files[0].status).toBe("modified");
		expect(files[0].addedLines.has(2)).toBe(true);
	});

	it("parses an added file", () => {
		const diff = [
			"diff --git a/new.ts b/new.ts",
			"new file mode 100644",
			"index 000..abc 100644",
			"--- /dev/null",
			"+++ b/new.ts",
			"@@ -0,0 +1,2 @@",
			"+line1",
			"+line2",
		].join("\n");

		const files = parseDiff(diff);
		expect(files).toHaveLength(1);
		expect(files[0].filePath).toBe("new.ts");
		expect(files[0].status).toBe("added");
		expect(files[0].addedLines.has(1)).toBe(true);
		expect(files[0].addedLines.has(2)).toBe(true);
	});

	it("parses a deleted file", () => {
		const diff = [
			"diff --git a/old.ts b/old.ts",
			"deleted file mode 100644",
			"index abc..000 100644",
			"--- a/old.ts",
			"+++ /dev/null",
			"@@ -1,2 +0,0 @@",
			"-gone1",
			"-gone2",
		].join("\n");

		const files = parseDiff(diff);
		expect(files).toHaveLength(1);
		expect(files[0].filePath).toBe("old.ts");
		expect(files[0].status).toBe("deleted");
		expect(files[0].addedLines.size).toBe(0);
	});

	it("parses multiple files in a single diff", () => {
		const diff = [
			"diff --git a/a.ts b/a.ts",
			"--- a/a.ts",
			"+++ b/a.ts",
			"@@ -1 +1,2 @@",
			" a",
			"+b",
			"diff --git a/b.ts b/b.ts",
			"--- a/b.ts",
			"+++ b/b.ts",
			"@@ -1 +1,2 @@",
			" c",
			"+d",
		].join("\n");

		const files = parseDiff(diff);
		expect(files).toHaveLength(2);
		expect(files[0].filePath).toBe("a.ts");
		expect(files[1].filePath).toBe("b.ts");
	});

	it("tracks added line numbers correctly across context lines", () => {
		const diff = [
			"diff --git a/src/file.ts b/src/file.ts",
			"--- a/src/file.ts",
			"+++ b/src/file.ts",
			"@@ -5,7 +5,9 @@",
			" context1",
			" context2",
			" context3",
			"-old1",
			"+new1",
			" context4",
			"+new2",
			"+new3",
		].join("\n");

		const files = parseDiff(diff);
		expect(files).toHaveLength(1);
		// new line numbers: 5 (context1), 6 (context2), 7 (context3),
		// 8 (new1, added), 9 (context4), 10 (new2, added), 11 (new3, added)
		expect(files[0].addedLines.has(5)).toBe(false);
		expect(files[0].addedLines.has(8)).toBe(true);
		expect(files[0].addedLines.has(10)).toBe(true);
		expect(files[0].addedLines.has(11)).toBe(true);
		expect(files[0].addedLines.size).toBe(3);
	});
});

describe("chunkFilesBySize", () => {
	it("returns one chunk for small files", () => {
		const files = [
			{
				diff: "a",
				filePath: "a.ts",
				originalPath: null,
				reviewableRanges: [],
				addedLines: new Set<number>(),
				status: "modified" as const,
			},
			{
				diff: "b",
				filePath: "b.ts",
				originalPath: null,
				reviewableRanges: [],
				addedLines: new Set<number>(),
				status: "modified" as const,
			},
		];
		const chunks = chunkFilesBySize(files, 100);
		expect(chunks).toHaveLength(1);
		expect(chunks[0]).toHaveLength(2);
	});

	it("splits large files into separate chunks", () => {
		const bigFile = {
			diff: "x".repeat(100),
			filePath: "big.ts",
			originalPath: null,
			reviewableRanges: [],
			addedLines: new Set<number>(),
			status: "modified" as const,
		};
		const smallFile = {
			diff: "y",
			filePath: "small.ts",
			originalPath: null,
			reviewableRanges: [],
			addedLines: new Set<number>(),
			status: "modified" as const,
		};
		const chunks = chunkFilesBySize([bigFile, smallFile], 50);
		expect(chunks).toHaveLength(2);
		expect(chunks[0]).toHaveLength(1);
		expect(chunks[0][0].filePath).toBe("big.ts");
		expect(chunks[1]).toHaveLength(1);
		expect(chunks[1][0].filePath).toBe("small.ts");
	});
});

describe("validateLine", () => {
	const files = [
		{
			filePath: "src/file.ts",
			originalPath: null,
			diff: "",
			reviewableRanges: [{ start: 1, end: 5 }],
			addedLines: new Set<number>([2, 4]),
			status: "modified" as const,
		},
	];

	it("returns valid for an added line", () => {
		expect(validateLine("src/file.ts", 2, files)).toEqual({ valid: true });
	});

	it("returns invalid for a line not in the diff", () => {
		const result = validateLine("src/file.ts", 10, files);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("not in the diff");
	});

	it("returns invalid for a non-existent file", () => {
		const result = validateLine("nonexistent.ts", 1, files);
		expect(result.valid).toBe(false);
		expect(result.reason).toContain("not in the PR diff");
	});
});
