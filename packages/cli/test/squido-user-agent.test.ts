import { describe, expect, it } from "vitest";
import { getSquidoUserAgent } from "../src/utils/squido-user-agent.ts";

describe("getSquidoUserAgent", () => {
	it("formats the user agent expected by squido.dev", () => {
		const runtime = process.versions.bun ? `bun/${process.versions.bun}` : `node/${process.version}`;
		const userAgent = getSquidoUserAgent("1.2.3");

		expect(userAgent).toBe(`squido/1.2.3 (${process.platform}; ${runtime}; ${process.arch})`);
		expect(userAgent).toMatch(/^squido\/[^\s()]+ \([^;()]+;\s*[^;()]+;\s*[^()]+\)$/);
	});
});
