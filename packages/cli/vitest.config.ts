import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const aiSrcIndex = fileURLToPath(new URL("../ai/src/index.ts", import.meta.url));
const aiSrcOAuth = fileURLToPath(new URL("../ai/src/oauth.ts", import.meta.url));
const agentSrcIndex = fileURLToPath(new URL("../agent/src/index.ts", import.meta.url));
const tuiSrcIndex = fileURLToPath(new URL("../tui/src/index.ts", import.meta.url));

export default defineConfig({
	test: {
		globals: true,
		environment: "node",
		testTimeout: 30000,
		server: {
			deps: {
				external: [/@silvia-odwyer\/photon-node/],
			},
		},
	},
	resolve: {
		alias: [
			{ find: /^@drewsepsi\/squido-ai$/, replacement: aiSrcIndex },
			{ find: /^@drewsepsi\/squido-ai\/oauth$/, replacement: aiSrcOAuth },
			{ find: /^@drewsepsi\/squido-agent-core$/, replacement: agentSrcIndex },
			{ find: /^@drewsepsi\/squido-tui$/, replacement: tuiSrcIndex },
		],
	},
});
