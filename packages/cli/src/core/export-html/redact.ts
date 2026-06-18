/**
 * Redaction layer for the /publish command.
 *
 * Strips sensitive content from session entries before HTML export.
 * Conservative by default: strips everything that could contain sensitive data.
 * Users can selectively override per entry type.
 */

import type { AgentMessage } from "@drewsepsi/squido-agent-core";
import type { SessionEntry } from "../session-manager.ts";

/**
 * Entry type categories for redaction selection.
 */
export type RedactableEntryType =
	| "bash_output"
	| "file_contents"
	| "system_prompt"
	| "session_metadata"
	| "inline_images"
	| "tool_results";

/**
 * User-controlled redaction settings.
 */
export interface RedactionConfig {
	/** Entry types to strip by default (starts with all sensitive types) */
	stripTypes: Set<RedactableEntryType>;
	/** Per-entry overrides: entry ID -> true (include) or false (exclude) */
	entryOverrides: Map<string, boolean>;
	/** Whether to scan for secret patterns and warn */
	scanForSecrets: boolean;
}

/**
 * Pattern for detecting secrets in content.
 */
const SECRET_PATTERNS = [
	{
		pattern: /(?:api[_-]?key|apikey|secret|token|password)\s*[:=]\s*['"`]?[A-Za-z0-9_\-./]{16,}/i,
		label: "API key or token",
	},
	{ pattern: /sk-[A-Za-z0-9]{32,}/, label: "Anthropic-style API key" },
	{ pattern: /ghp_[A-Za-z0-9]{36,}/, label: "GitHub personal access token" },
	{ pattern: /gho_[A-Za-z0-9]{36,}/, label: "GitHub OAuth access token" },
	{ pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/, label: "Private key" },
	{ pattern: /xox[abpors]-[A-Za-z0-9]{10,}/, label: "Slack token" },
	{ pattern: /AKIA[0-9A-Z]{16}/, label: "AWS access key" },
];

/**
 * Create a default redaction config that strips all sensitive types.
 */
export function createDefaultRedactionConfig(): RedactionConfig {
	return {
		stripTypes: new Set([
			"bash_output",
			"file_contents",
			"system_prompt",
			"session_metadata",
			"inline_images",
			"tool_results",
		]),
		entryOverrides: new Map(),
		scanForSecrets: true,
	};
}

/**
 * Check if a message contains sensitive content based on type.
 */
function messageHasSensitiveContent(message: AgentMessage, type: RedactableEntryType): boolean {
	if (type === "bash_output") {
		return message.role === "toolResult" && (message as { toolName?: string }).toolName === "bash";
	}
	if (type === "file_contents") {
		if (message.role === "toolResult") {
			const toolName = (message as { toolName?: string }).toolName;
			return toolName === "read" || toolName === "write" || toolName === "edit";
		}
		return false;
	}
	if (type === "system_prompt") {
		// System prompt is stored separately, not in message entries
		return false;
	}
	if (type === "inline_images") {
		if (message.role === "user" && "content" in message && typeof message.content !== "string") {
			return message.content.some((c: { type: string }) => c.type === "image");
		}
		return false;
	}
	if (type === "tool_results") {
		return message.role === "toolResult";
	}
	return false;
}

/**
 * Check if a session entry contains the given redactable type.
 */
function entryHasSensitiveContent(entry: SessionEntry, type: RedactableEntryType): boolean {
	if (entry.type === "message") {
		return messageHasSensitiveContent(entry.message, type);
	}
	return false;
}

/**
 * Scan a message for secret patterns and return warnings.
 */
function scanForSecrets(message: AgentMessage): SecretWarning[] {
	const warnings: SecretWarning[] = [];
	const content = getMessageText(message);

	for (const { pattern, label } of SECRET_PATTERNS) {
		const match = content.match(pattern);
		if (match) {
			warnings.push({
				entryLabel: label,
				matchedText: maskSecret(match[0]),
				messageRole: message.role,
			});
		}
	}

	return warnings;
}

/**
 * Mask a secret for display in warnings.
 */
function maskSecret(secret: string): string {
	if (secret.length <= 8) return "****";
	return `${secret.slice(0, 4)}****${secret.slice(-4)}`;
}

/**
 * Get the full text content of a message.
 */
function getMessageText(message: AgentMessage): string {
	if (!("content" in message)) return "";
	const msg = message as { content: string | Array<{ type: string; text?: string }> };
	if (typeof msg.content === "string") {
		return msg.content;
	}
	return msg.content
		.filter((c): c is { type: "text"; text: string } => c.type === "text")
		.map((c) => c.text)
		.join("\n");
}

/**
 * Warning about a detected secret.
 */
export interface SecretWarning {
	entryLabel: string;
	matchedText: string;
	messageRole: string;
}

/**
 * Scan entry content for secrets and return warnings.
 */
export function scanEntriesForSecrets(entries: SessionEntry[]): SecretWarning[] {
	const warnings: SecretWarning[] = [];
	for (const entry of entries) {
		if (entry.type === "message") {
			warnings.push(...scanForSecrets(entry.message));
		}
	}
	return warnings;
}

/**
 * Apply redaction filters to entries and return the filtered set.
 *
 * Rules (applied per entry):
 * 1. If entry has a per-entry override, use that first
 * 2. Otherwise, check if any of the stripTypes match and exclude those entries
 * 3. If an entry matches no strip types, include it
 */
export function redactEntries(entries: SessionEntry[], config: RedactionConfig): SessionEntry[] {
	return entries.filter((entry) => {
		// Check per-entry override
		const override = config.entryOverrides.get(entry.id);
		if (override !== undefined) {
			return override;
		}

		// Check each strip type
		for (const type of config.stripTypes) {
			if (entryHasSensitiveContent(entry, type)) {
				return false;
			}
		}

		return true;
	});
}
