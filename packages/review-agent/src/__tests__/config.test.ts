import { describe, expect, it } from "vitest";
import { parseConfigContent } from "../review/config.ts";
import { DEFAULT_REVIEW_CONFIG } from "../types.ts";

describe("parseConfigContent", () => {
	it("returns default config for empty input", () => {
		const config = parseConfigContent("");
		expect(config).toEqual(DEFAULT_REVIEW_CONFIG);
	});

	it("returns default config for invalid YAML", () => {
		const config = parseConfigContent("{{invalid}");
		expect(config).toEqual(DEFAULT_REVIEW_CONFIG);
	});

	it("parses a minimal config with provider override", () => {
		const yaml = `
review:
  provider: anthropic
  model: claude-sonnet-4-20250514
`.trim();
		const config = parseConfigContent(yaml);
		expect(config.review?.provider).toBe("anthropic");
		expect(config.review?.model).toBe("claude-sonnet-4-20250514");
		// Defaults preserved
		expect(config.review?.mode).toBe("advisory");
		expect(config.review?.thresholds?.["max-comments"]).toBe(20);
	});

	it("parses agents list", () => {
		const yaml = `
review:
  agents:
    - code-reviewer
    - security-scanner
`.trim();
		const config = parseConfigContent(yaml);
		expect(config.review?.agents).toEqual(["code-reviewer", "security-scanner"]);
	});

	it("parses thresholds", () => {
		const yaml = `
review:
  thresholds:
    max-comments: 5
    min-confidence: 0.8
`.trim();
		const config = parseConfigContent(yaml);
		expect(config.review?.thresholds?.["max-comments"]).toBe(5);
		expect(config.review?.thresholds?.["min-confidence"]).toBe(0.8);
	});

	it("parses path filters", () => {
		const yaml = `
review:
  paths:
    include:
      - "src/**"
    exclude:
      - "**/*.test.ts"
`.trim();
		const config = parseConfigContent(yaml);
		expect(config.review?.paths?.include).toEqual(["src/**"]);
		expect(config.review?.paths?.exclude).toEqual(["**/*.test.ts"]);
	});

	it("parses static-analyzers mode", () => {
		const yaml = `review:\n  static-analyzers: off`;
		const config = parseConfigContent(yaml);
		expect(config.review?.["static-analyzers"]).toBe("off");
	});

	it("parses blocking mode", () => {
		const yaml = `review:\n  mode: blocking`;
		const config = parseConfigContent(yaml);
		expect(config.review?.mode).toBe("blocking");
	});
});
