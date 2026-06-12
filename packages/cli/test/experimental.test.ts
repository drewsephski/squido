import { afterEach, describe, expect, it } from "vitest";
import { areExperimentalFeaturesEnabled } from "../src/core/experimental.ts";

describe("areExperimentalFeaturesEnabled", () => {
	const originalPiExperimental = process.env.SQUIDO_EXPERIMENTAL;

	afterEach(() => {
		if (originalPiExperimental === undefined) {
			delete process.env.SQUIDO_EXPERIMENTAL;
		} else {
			process.env.SQUIDO_EXPERIMENTAL = originalPiExperimental;
		}
	});

	it("returns false when PI_EXPERIMENTAL is unset", () => {
		delete process.env.SQUIDO_EXPERIMENTAL;

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns false when PI_EXPERIMENTAL is empty", () => {
		process.env.SQUIDO_EXPERIMENTAL = "";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns true when PI_EXPERIMENTAL is set to 1", () => {
		process.env.SQUIDO_EXPERIMENTAL = "1";

		expect(areExperimentalFeaturesEnabled()).toBe(true);
	});

	it("returns false when PI_EXPERIMENTAL is set to 0", () => {
		process.env.SQUIDO_EXPERIMENTAL = "0";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});

	it("returns false when PI_EXPERIMENTAL is set to a non-1 value", () => {
		process.env.SQUIDO_EXPERIMENTAL = "true";

		expect(areExperimentalFeaturesEnabled()).toBe(false);
	});
});
