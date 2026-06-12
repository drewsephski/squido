import { afterEach, describe, expect, it, vi } from "vitest";
import {
	checkForNewSquidoVersion,
	comparePackageVersions,
	getLatestSquidoRelease,
	getLatestSquidoVersion,
	isNewerPackageVersion,
} from "../src/utils/version-check.ts";

const originalSkipVersionCheck = process.env.SQUIDO_SKIP_VERSION_CHECK;
const originalOffline = process.env.SQUIDO_OFFLINE;

afterEach(() => {
	vi.unstubAllGlobals();
	if (originalSkipVersionCheck === undefined) {
		delete process.env.SQUIDO_SKIP_VERSION_CHECK;
	} else {
		process.env.SQUIDO_SKIP_VERSION_CHECK = originalSkipVersionCheck;
	}
	if (originalOffline === undefined) {
		delete process.env.SQUIDO_OFFLINE;
	} else {
		process.env.SQUIDO_OFFLINE = originalOffline;
	}
});

describe("version checks", () => {
	it("compares package versions", () => {
		expect(comparePackageVersions("0.70.6", "0.70.5")).toBeGreaterThan(0);
		expect(comparePackageVersions("0.70.5", "0.70.5")).toBe(0);
		expect(comparePackageVersions("0.70.4", "0.70.5")).toBeLessThan(0);
		expect(isNewerPackageVersion("0.70.5", "0.70.5")).toBe(false);
		expect(isNewerPackageVersion("0.70.6", "0.70.5")).toBe(true);
	});

	it("returns only newer versions", async () => {
		const fetchMock = vi.fn(async () => Response.json({ version: "1.2.3" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(checkForNewSquidoVersion("1.2.3")).resolves.toBeUndefined();
		await expect(checkForNewSquidoVersion("1.2.2")).resolves.toEqual({ version: "1.2.3" });
	});

	it("uses the squidagent.app version check api with a squido user agent", async () => {
		const fetchMock = vi.fn(async () => Response.json({ version: "1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestSquidoVersion("1.2.3")).resolves.toBe("1.2.4");
		expect(fetchMock).toHaveBeenCalledWith(
			"https://squidagent.app/api/latest-version",
			expect.objectContaining({
				headers: expect.objectContaining({
					"User-Agent": expect.stringMatching(/^squido\/1\.2\.3 /),
					accept: "application/json",
				}),
			}),
		);
	});

	it("returns the active package metadata from the version check api", async () => {
		const fetchMock = vi.fn(async () =>
			Response.json({
				packageName: "@new-scope/pi",
				version: "1.2.4",
			}),
		);
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestSquidoRelease("1.2.3")).resolves.toEqual({
			packageName: "@drewsepsi/squido-cli",
			version: "1.2.4",
		});
	});

	it("returns update notes from the version check api", async () => {
		const fetchMock = vi.fn(async () => Response.json({ note: " **Read this** ", version: "1.2.4" }));
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestSquidoRelease("1.2.3")).resolves.toEqual({ note: "**Read this**", version: "1.2.4" });
	});

	it("skips api calls when version checks are disabled", async () => {
		process.env.SQUIDO_SKIP_VERSION_CHECK = "1";
		const fetchMock = vi.fn();
		vi.stubGlobal("fetch", fetchMock);

		await expect(getLatestSquidoVersion("1.2.3")).resolves.toBeUndefined();
		expect(fetchMock).not.toHaveBeenCalled();
	});
});
