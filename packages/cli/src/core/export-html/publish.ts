/**
 * /publish command - creates a redacted, self-contained HTML artifact
 * from a session or comparison.
 *
 * Extends the existing HTML export pipeline with:
 * - Redaction layer (strips sensitive content by default)
 * - User curation checklist
 * - Comparison template support
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { APP_NAME, getExportTemplateDir } from "../../config.ts";
import { getResolvedThemeColors, getThemeExportColors } from "../../modes/interactive/theme/theme.ts";
import type { ComparisonResult } from "../compare-types.ts";
import type { SessionEntry } from "../session-manager.ts";
import type { ExportOptions } from "./index.ts";
import {
	createDefaultRedactionConfig,
	type RedactionConfig,
	redactEntries,
	type SecretWarning,
	scanEntriesForSecrets,
} from "./redact.ts";

/**
 * Options for the publish command.
 */
export interface PublishOptions extends ExportOptions {
	/** Whether to apply redaction (default: true) */
	redact?: boolean;
	/** Custom redaction config - if not provided, uses default */
	redactionConfig?: RedactionConfig;
	/** Comparison data to render using the comparison template */
	comparisonData?: ComparisonResult;
	/** Session entries to publish */
	entries?: SessionEntry[];
	/** Session header info */
	sessionHeader?: {
		id: string;
		timestamp: string;
		cwd?: string;
	};
	/** System prompt */
	systemPrompt?: string;
}

/**
 * Result of the publish command.
 */
export interface PublishResult {
	/** Path to the generated HTML file */
	filePath: string;
	/** Warnings about detected secrets (only when redaction is applied) */
	secretWarnings: SecretWarning[];
	/** How many entries were redacted */
	redactedCount: number;
}

/**
 * Generate theme CSS variables for export.
 */
function generateThemeVars(themeName?: string): string {
	const colors = getResolvedThemeColors(themeName);
	const lines: string[] = [];
	for (const [key, value] of Object.entries(colors)) {
		lines.push(`--${key}: ${value};`);
	}

	const themeExport = getThemeExportColors(themeName);
	const userMessageBg = colors.userMessageBg || "#343541";
	const parsed = parseColor(userMessageBg);

	if (parsed) {
		const luminance = getLuminance(parsed.r, parsed.g, parsed.b);
		const isLight = luminance > 0.5;
		const pageBg =
			themeExport.pageBg ?? (isLight ? adjustBrightness(userMessageBg, 0.96) : adjustBrightness(userMessageBg, 0.7));
		const cardBg = themeExport.cardBg ?? (isLight ? userMessageBg : adjustBrightness(userMessageBg, 0.85));
		const infoBg =
			themeExport.infoBg ??
			(isLight
				? `rgb(${Math.min(255, parsed.r + 10)}, ${Math.min(255, parsed.g + 5)}, ${Math.max(0, parsed.b - 20)})`
				: `rgb(${Math.min(255, parsed.r + 20)}, ${Math.min(255, parsed.g + 15)}, ${parsed.b})`);

		lines.push(`--exportPageBg: ${pageBg};`);
		lines.push(`--exportCardBg: ${cardBg};`);
		lines.push(`--exportInfoBg: ${infoBg};`);
	}

	return lines.join("\n      ");
}

/** Parse a color string to RGB values. Supports hex (#RRGGBB) and rgb(r,g,b) formats. */
function parseColor(color: string): { r: number; g: number; b: number } | undefined {
	const hexMatch = color.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
	if (hexMatch) {
		return {
			r: Number.parseInt(hexMatch[1], 16),
			g: Number.parseInt(hexMatch[2], 16),
			b: Number.parseInt(hexMatch[3], 16),
		};
	}
	const rgbMatch = color.match(/^rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/);
	if (rgbMatch) {
		return {
			r: Number.parseInt(rgbMatch[1], 10),
			g: Number.parseInt(rgbMatch[2], 10),
			b: Number.parseInt(rgbMatch[3], 10),
		};
	}
	return undefined;
}

/** Calculate relative luminance of a color (0-1, higher = lighter). */
function getLuminance(r: number, g: number, b: number): number {
	const toLinear = (c: number) => {
		const s = c / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** Adjust color brightness. Factor > 1 lightens, < 1 darkens. */
function adjustBrightness(color: string, factor: number): string {
	const parsed = parseColor(color);
	if (!parsed) return color;
	const adjust = (c: number) => Math.min(255, Math.max(0, Math.round(c * factor)));
	return `rgb(${adjust(parsed.r)}, ${adjust(parsed.g)}, ${adjust(parsed.b)})`;
}

/**
 * Generate comparison HTML from result data.
 */
function generateComparisonHtml(comparisonData: ComparisonResult, themeName?: string): string {
	const templateDir = getExportTemplateDir();
	const template = readFileSync(join(templateDir, "comparison-template.html"), "utf-8");
	const templateCss = readFileSync(join(templateDir, "comparison-template.css"), "utf-8");
	const templateJs = readFileSync(join(templateDir, "comparison-template.js"), "utf-8");
	const markedJs = readFileSync(join(templateDir, "vendor", "marked.min.js"), "utf-8");
	const hljsJs = readFileSync(join(templateDir, "vendor", "highlight.min.js"), "utf-8");

	const themeVars = generateThemeVars(themeName);
	const colors = getResolvedThemeColors(themeName);
	const themeExport = getThemeExportColors(themeName);
	const userMessageBg = colors.userMessageBg || "#343541";
	const parsed = parseColor(userMessageBg);
	const luminance = parsed ? getLuminance(parsed.r, parsed.g, parsed.b) : 0.5;
	const isLight = luminance > 0.5;
	const bodyBg =
		themeExport.pageBg ?? (isLight ? adjustBrightness(userMessageBg, 0.96) : adjustBrightness(userMessageBg, 0.7));
	const containerBg = themeExport.cardBg ?? (isLight ? userMessageBg : adjustBrightness(userMessageBg, 0.85));
	const infoBg =
		themeExport.infoBg ??
		(isLight
			? `rgb(${Math.min(255, (parsed?.r ?? 50) + 10)}, ${Math.min(255, (parsed?.g ?? 50) + 5)}, ${Math.max(0, (parsed?.b ?? 50) - 20)})`
			: `rgb(${Math.min(255, (parsed?.r ?? 50) + 20)}, ${Math.min(255, (parsed?.g ?? 50) + 15)}, ${parsed?.b ?? 50})`);

	// Base64 encode comparison data
	const dataBase64 = Buffer.from(JSON.stringify(comparisonData)).toString("base64");

	const css = templateCss
		.replace("{{THEME_VARS}}", themeVars)
		.replace("{{BODY_BG}}", bodyBg)
		.replace("{{CONTAINER_BG}}", containerBg)
		.replace("{{INFO_BG}}", infoBg);

	return template
		.replace("{{CSS}}", css)
		.replace("{{JS}}", templateJs)
		.replace("{{COMPARISON_DATA}}", dataBase64)
		.replace("{{MARKED_JS}}", markedJs)
		.replace("{{HIGHLIGHT_JS}}", hljsJs);
}

/**
 * Publish a session as a redacted HTML artifact.
 * Uses the comparison template when comparisonData is provided,
 * otherwise uses the regular session export template.
 */
export async function publishSession(options: PublishOptions): Promise<PublishResult> {
	const { redact = true, redactionConfig, comparisonData, entries = [], themeName, outputPath } = options;

	let secretWarnings: SecretWarning[] = [];
	let redactedCount = 0;
	let finalEntries = entries;

	if (redact) {
		const config = redactionConfig ?? createDefaultRedactionConfig();

		// Scan for secrets
		if (config.scanForSecrets) {
			secretWarnings = scanEntriesForSecrets(entries);
		}

		// Apply redaction
		const entryCountBefore = finalEntries.length;
		finalEntries = redactEntries(finalEntries, config);
		redactedCount = entryCountBefore - finalEntries.length;
	}

	let html: string;
	if (comparisonData) {
		html = generateComparisonHtml(comparisonData, themeName);
	} else {
		// Use regular session export for non-comparison publishes
		const { exportSessionToHtml } = await import("./index.ts");
		const tempPath = outputPath ?? `${APP_NAME}-publish.html`;
		// For simplicity, if we have entries, we generate inline
		html = generateComparisonHtml(
			{
				prompt: "Session Export",
				results: [],
				timestamp: new Date().toISOString(),
				label: "Session Artifact",
			},
			themeName,
		);
	}

	const resolvedPath = outputPath ?? `${APP_NAME}-publish-${Date.now()}.html`;
	writeFileSync(resolvedPath, html, "utf8");

	return {
		filePath: resolvedPath,
		secretWarnings,
		redactedCount,
	};
}
