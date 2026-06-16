import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import type { AgentType, ReviewFinding } from "../../types.ts";

// ── detect-secrets integration ───────────────────────────────────

export interface DetectSecretsResult {
	findings: ReviewFinding[];
	runtime: number; // ms
}

/**
 * Run detect-secrets on a set of changed files.
 * detect-secrets must be available (pip install detect-secrets).
 * Only reports findings on lines that are part of the diff (added).
 */
export function runDetectSecrets(
	repoRoot: string,
	files: Array<{ filePath: string; addedLines: Set<number> }>,
): DetectSecretsResult {
	const start = Date.now();

	if (!isDetectSecretsAvailable()) {
		return { findings: [], runtime: Date.now() - start };
	}

	const findings: ReviewFinding[] = [];

	for (const file of files) {
		if (file.addedLines.size === 0) continue;

		const fullPath = `${repoRoot}/${file.filePath}`;
		if (!existsSync(fullPath)) continue;

		try {
			// Run detect-secrets on the specific file
			const stdout = execSync(`detect-secrets scan --no-base64-entropy-scan --no-verified --json "${fullPath}"`, {
				cwd: repoRoot,
				encoding: "utf-8",
				timeout: 30_000,
				maxBuffer: 5 * 1024 * 1024,
				stdio: ["ignore", "pipe", "pipe"],
			});

			const parsed = JSON.parse(stdout);
			const fileResults = parsed?.results?.[file.filePath] ?? [];

			for (const result of fileResults) {
				const line = result.line_number ?? 0;
				if (!file.addedLines.has(line)) continue;

				const secretType = result.type ?? "Unknown";
				const filename = result.filename ?? file.filePath;

				findings.push({
					id: `static-secret-${findings.length + 1}`,
					agent: "security-scanner" as AgentType,
					filePath: filename.replace(/\\/g, "/"),
					line,
					severity: "critical",
					title: `Hardcoded ${secretType}`,
					description: `A potential ${secretType} was detected on this line. Hardcoded credentials should be stored in environment variables or a secrets manager.`,
					confidence: 0.9,
				});
			}
		} catch {}
	}

	return { findings, runtime: Date.now() - start };
}

function isDetectSecretsAvailable(): boolean {
	try {
		execSync("detect-secrets --version", { encoding: "utf-8", stdio: "ignore", timeout: 5_000 });
		return true;
	} catch {
		return false;
	}
}
