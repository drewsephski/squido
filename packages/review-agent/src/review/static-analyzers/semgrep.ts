import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentType, ReviewFinding } from "../../types.ts";

// ── Semgrep SAST integration ─────────────────────────────────────

export interface SemgrepResult {
	findings: ReviewFinding[];
	runtime: number; // ms
}

/**
 * Run Semgrep on a set of diff files and return parsed findings.
 * Semgrep must be installed on the system PATH, or this returns empty.
 *
 * Uses the `diff` context to only report findings on lines that were added.
 */
export function runSemgrep(
	repoRoot: string,
	files: Array<{ filePath: string; diff: string; addedLines: Set<number> }>,
): SemgrepResult {
	const start = Date.now();

	if (!isSemgrepAvailable()) {
		return { findings: [], runtime: Date.now() - start };
	}

	const filePaths = files.map((f) => f.filePath);
	if (filePaths.length === 0) {
		return { findings: [], runtime: Date.now() - start };
	}

	// Build a temp config file that targets changed files
	const tempDir = mkdtempSync(join(tmpdir(), "squido-semgrep-"));
	try {
		// Write file paths to a temp file for --target
		const targetFile = join(tempDir, "targets.txt");
		writeFileSync(targetFile, filePaths.map((p) => join(repoRoot, p)).join("\n"), "utf-8");

		// Run semgrep in JSON output mode
		const stdout = execSync(`semgrep --config=auto --json --targets="${targetFile}" --no-rewrite-rule-ids`, {
			cwd: repoRoot,
			encoding: "utf-8",
			timeout: 120_000,
			maxBuffer: 10 * 1024 * 1024,
			stdio: ["ignore", "pipe", "pipe"],
		});

		const parsed = JSON.parse(stdout);
		const findings = parseSemgrepOutput(parsed, files);

		return { findings, runtime: Date.now() - start };
	} catch (err) {
		// Semgrep can exit non-zero when it finds issues (exit code 1)
		if (err instanceof Error && "stdout" in err) {
			try {
				const parsed = JSON.parse((err as { stdout: string }).stdout);
				const findings = parseSemgrepOutput(parsed, files);
				return { findings, runtime: Date.now() - start };
			} catch {
				// Not valid JSON output, fall through
			}
		}
		return { findings: [], runtime: Date.now() - start };
	} finally {
		rmSync(tempDir, { recursive: true, force: true });
	}
}

let findingCounter = 10_000; // Static analyzer IDs start at 10k

function parseSemgrepOutput(
	semgrepResult: { results?: Array<SemgrepRawFinding> },
	files: Array<{ filePath: string; addedLines: Set<number> }>,
): ReviewFinding[] {
	if (!semgrepResult.results || !Array.isArray(semgrepResult.results)) {
		return [];
	}

	const fileAddedLines = new Map(files.map((f) => [f.filePath, f.addedLines]));

	return semgrepResult.results
		.filter((r) => {
			const filePath = r.path?.replace(/\\/g, "/") ?? "";
			const line = r.start?.line ?? 0;
			const addedLines = fileAddedLines.get(filePath);
			// Only report findings on added lines
			return addedLines?.has(line) ?? false;
		})
		.map((r): ReviewFinding => {
			findingCounter++;
			const filePath = r.path?.replace(/\\/g, "/") ?? "";
			const line = r.start?.line ?? 0;

			return {
				id: `static-semgrep-${findingCounter}`,
				agent: "security-scanner" as AgentType,
				filePath,
				line,
				severity: mapSemgrepSeverity(r.extra?.severity),
				title: r.check_id ?? r.extra?.message?.split("\n")[0] ?? "Semgrep finding",
				description: r.extra?.message ?? "",
				suggestion: formatSemgrepFix(r),
				confidence: 0.8,
			};
		});
}

interface SemgrepRawFinding {
	check_id?: string;
	path?: string;
	start?: { line?: number; col?: number };
	end?: { line?: number; col?: number };
	extra?: {
		message?: string;
		severity?: string;
		metadata?: {
			cwe?: string[];
			"cwe2022-top25"?: boolean;
			owasp?: string[];
		};
		fixed_lines?: string[];
	};
}

function mapSemgrepSeverity(severity?: string): "critical" | "warning" | "info" | "nit" {
	switch (severity?.toLowerCase()) {
		case "error":
			return "critical";
		case "warning":
			return "warning";
		case "info":
			return "info";
		default:
			return "info";
	}
}

function formatSemgrepFix(r: SemgrepRawFinding): string | undefined {
	if (r.extra?.fixed_lines && r.extra.fixed_lines.length > 0) {
		return r.extra.fixed_lines.join("\n");
	}
	return undefined;
}

function isSemgrepAvailable(): boolean {
	try {
		execSync("semgrep --version", { encoding: "utf-8", stdio: "ignore", timeout: 5_000 });
		return true;
	} catch {
		return false;
	}
}
