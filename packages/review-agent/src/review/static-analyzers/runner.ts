import type { DiffFile, ReviewFinding, StaticAnalyzerMode } from "../../types.ts";
import { runDetectSecrets } from "./detect-secrets.ts";
import { runSemgrep } from "./semgrep.ts";

// ── Static analyzer runner ───────────────────────────────────────

export interface StaticAnalysisResult {
	findings: ReviewFinding[];
	analyzers: string[]; // which analyzers ran
	runtime: number; // ms
}

/**
 * Run configured static analyzers against the changed files.
 *
 * Mode "auto" detects which analyzers are available on the system PATH
 * and runs them. Mode "off" skips all analyzers. Specific analyzer names
 * can be provided (future use).
 *
 * Only reports findings on lines that are part of the diff.
 */
export function runStaticAnalyzers(files: DiffFile[], mode: StaticAnalyzerMode): StaticAnalysisResult {
	const start = Date.now();

	if (mode === "off" || files.length === 0) {
		return { findings: [], analyzers: [], runtime: 0 };
	}

	const allFindings: ReviewFinding[] = [];
	const ranAnalyzers: string[] = [];

	// The diff file metadata for the analyzers
	const analyzerInput = files
		.filter((f) => f.status !== "deleted")
		.map((f) => ({
			filePath: f.filePath,
			diff: f.diff,
			addedLines: f.addedLines,
		}));

	if (analyzerInput.length === 0) {
		return { findings: [], analyzers: [], runtime: 0 };
	}

	// Resolve which analyzers to run
	const shouldRun = (name: string): boolean => {
		if (mode === "auto") return true;
		if (Array.isArray(mode)) return mode.includes(name);
		return false;
	};

	// Semgrep — general-purpose SAST
	if (shouldRun("semgrep")) {
		const result = runSemgrep(process.cwd(), analyzerInput);
		allFindings.push(...result.findings);
		if (result.findings.length > 0 || result.runtime > 0) {
			ranAnalyzers.push("semgrep");
		}
	}

	// detect-secrets — hardcoded credential scanning
	if (shouldRun("detect-secrets")) {
		const result = runDetectSecrets(process.cwd(), analyzerInput);
		allFindings.push(...result.findings);
		if (result.findings.length > 0 || result.runtime > 0) {
			ranAnalyzers.push("detect-secrets");
		}
	}

	return {
		findings: allFindings,
		analyzers: ranAnalyzers,
		runtime: Date.now() - start,
	};
}
