/**
 * TUI comparison view component.
 *
 * Renders model outputs in labeled columns side-by-side.
 * Reuses existing Markdown, tool call, and diff renderers.
 */

import { Container, Markdown, type MarkdownTheme, Text } from "@drewsepsi/squido-tui";
import chalk from "chalk";
import type { ComparisonResult } from "../../../core/compare-types.ts";
import { getMarkdownTheme } from "../theme/theme.ts";

/**
 * Color palette for model columns.
 */
const MODEL_COLORS = ["#4f9cf7", "#e8a838", "#22c55e", "#ef4444", "#a855f7", "#ec4899"];

/**
 * Component that renders the full comparison view.
 * Shows each model's output in a labeled column.
 */
export class ComparisonViewComponent extends Container {
	private results: ComparisonResult;
	private markdownTheme: MarkdownTheme;

	constructor(results: ComparisonResult, markdownTheme: MarkdownTheme = getMarkdownTheme()) {
		super();

		this.results = results;
		this.markdownTheme = markdownTheme;

		this.renderView();
	}

	private renderView(): void {
		// Header
		this.addChild(new Text(chalk.bold.hex("#e8a838")(` Model Comparison (${this.results.results.length} models) `)));
		this.addChild(new Text(""));

		// Prompt preview
		const promptPreview =
			this.results.prompt.length > 100 ? `${this.results.prompt.slice(0, 100)}...` : this.results.prompt;
		this.addChild(new Text(chalk.dim(` Prompt: ${promptPreview}`)));
		this.addChild(new Text(""));

		// Render each model's column
		const width = 80; // Will be adjusted by the container
		for (let i = 0; i < this.results.results.length; i++) {
			const result = this.results.results[i];
			const color = MODEL_COLORS[i % MODEL_COLORS.length];

			// Column separator
			if (i > 0) {
				this.addChild(new Text(chalk.dim("─".repeat(width))));
			}

			// Column header with color
			const modelLabel = `${result.model.provider}/${result.model.id}`;
			if (result.success) {
				this.addChild(new Text(chalk.hex(color).bold(` ▸ ${modelLabel}`)));
			} else {
				this.addChild(new Text(chalk.red.bold(` ▸ ${modelLabel} [FAILED]`)));
			}
			this.addChild(new Text(""));

			if (!result.success) {
				this.addChild(new Text(chalk.dim("   No output - model failed to respond")));
				if (result.errorMessage) {
					this.addChild(new Text(chalk.red(`   ${result.errorMessage}`)));
				}
			} else {
				// Text content
				const msg = result.assistantMessage;
				for (const block of msg.content) {
					if (block.type === "text" && block.text.trim()) {
						this.addChild(new Markdown(block.text, 0, 0, this.markdownTheme));
					} else if (block.type === "thinking" && block.thinking.trim()) {
						this.addChild(new Text(chalk.dim.italic(`   ${block.thinking}`)));
					}
				}

				// Usage stats
				this.addChild(new Text(""));
				this.addChild(
					new Text(
						chalk.dim(
							`   Input: ${result.usage.input}  Output: ${result.usage.output}  Cost: $${result.usage.cost.toFixed(6)}  ${result.latencyMs}ms`,
						),
					),
				);
				this.addChild(new Text(""));
			}
		}

		// Footer
		this.addChild(new Text(chalk.dim(` Compared at ${new Date(this.results.timestamp).toLocaleString()}`)));
	}
}
