/**
 * /publish command - creates a redacted, self-contained HTML artifact
 * from a session or comparison.
 *
 * Extends the existing HTML export pipeline with:
 * - Redaction layer (strips sensitive content by default)
 * - Comparison template support
 */

import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP_NAME, getExportTemplateDir } from "../../config.ts";
import { getResolvedThemeColors, getThemeExportColors } from "../../modes/interactive/theme/theme.ts";
import type { ComparisonResult } from "../compare-types.ts";
import type { SessionEntry, SessionHeader } from "../session-manager.ts";
import type { ExportOptions, SessionData } from "./index.ts";
import { generateHtml } from "./index.ts";
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
	sessionHeader?: SessionHeader | null;
	/** System prompt */
	systemPrompt?: string;
	/** Current leaf ID for the session tree */
	leafId?: string | null;
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

/** Derive export background colors from a base color. Duplicated here to avoid circular import issues. */
function deriveExportColors(baseColor: string): { pageBg: string; cardBg: string; infoBg: string } {
	const parsed = parseColor(baseColor);
	if (!parsed) {
		return { pageBg: "rgb(24, 24, 30)", cardBg: "rgb(30, 30, 36)", infoBg: "rgb(60, 55, 40)" };
	}
	const luminance = getLuminance(parsed.r, parsed.g, parsed.b);
	const isLight = luminance > 0.5;
	if (isLight) {
		return {
			pageBg: adjustBrightness(baseColor, 0.96),
			cardBg: baseColor,
			infoBg: `rgb(${Math.min(255, parsed.r + 10)}, ${Math.min(255, parsed.g + 5)}, ${Math.max(0, parsed.b - 20)})`,
		};
	}
	return {
		pageBg: adjustBrightness(baseColor, 0.7),
		cardBg: adjustBrightness(baseColor, 0.85),
		infoBg: `rgb(${Math.min(255, parsed.r + 20)}, ${Math.min(255, parsed.g + 15)}, ${parsed.b})`,
	};
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
 * Generate theme CSS variables for comparison export.
 */
function generateComparisonThemeVars(themeName?: string): string {
	const colors = getResolvedThemeColors(themeName);
	const lines: string[] = [];
	for (const [key, value] of Object.entries(colors)) {
		lines.push(`--${key}: ${value};`);
	}

	const themeExport = getThemeExportColors(themeName);
	const userMessageBg = colors.userMessageBg || "#343541";
	const derived = deriveExportColors(userMessageBg);

	lines.push(`--exportPageBg: ${themeExport.pageBg ?? derived.pageBg};`);
	lines.push(`--exportCardBg: ${themeExport.cardBg ?? derived.cardBg};`);
	lines.push(`--exportInfoBg: ${themeExport.infoBg ?? derived.infoBg};`);

	return lines.join("\n      ");
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

	const themeVars = generateComparisonThemeVars(themeName);
	const colors = getResolvedThemeColors(themeName);
	const themeExport = getThemeExportColors(themeName);
	const userMessageBg = colors.userMessageBg || "#343541";
	const derived = deriveExportColors(userMessageBg);

	const bodyBg = themeExport.pageBg ?? derived.pageBg;
	const containerBg = themeExport.cardBg ?? derived.cardBg;
	const infoBg = themeExport.infoBg ?? derived.infoBg;

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
 * otherwise uses the regular session export template via generateHtml.
 */
export async function publishSession(options: PublishOptions): Promise<PublishResult> {
	const {
		redact = true,
		redactionConfig,
		comparisonData,
		entries = [],
		sessionHeader,
		systemPrompt,
		leafId,
		themeName,
		outputPath,
	} = options;

	let html: string;

	if (comparisonData) {
		// Comparison publish uses the comparison template
		html = generateComparisonHtml(comparisonData, themeName);
	} else {
		// Apply redaction before generating HTML
		let secretWarnings: SecretWarning[] = [];
		let redactedCount = 0;
		let finalEntries = entries;

		if (redact) {
			const config = redactionConfig ?? createDefaultRedactionConfig();

			if (config.scanForSecrets) {
				secretWarnings = scanEntriesForSecrets(entries);
			}

			const entryCountBefore = finalEntries.length;
			finalEntries = redactEntries(finalEntries, config);
			redactedCount = entryCountBefore - finalEntries.length;
		}

		const sessionData: SessionData = {
			header: sessionHeader ?? { type: "session", id: "publish", timestamp: new Date().toISOString(), cwd: "" },
			entries: finalEntries,
			leafId: leafId ?? null,
			systemPrompt,
		};

		html = generateHtml(sessionData, themeName);

		const resolvedPath = outputPath ?? `${APP_NAME}-publish-${Date.now()}.html`;
		writeFileSync(resolvedPath, html, "utf8");

		return {
			filePath: resolvedPath,
			secretWarnings,
			redactedCount,
		};
	}

	const resolvedPath = outputPath ?? `${APP_NAME}-publish-${Date.now()}.html`;
	writeFileSync(resolvedPath, html, "utf8");

	return {
		filePath: resolvedPath,
		secretWarnings: [],
		redactedCount: 0,
	};
}
