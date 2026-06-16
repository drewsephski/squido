/**
 * Bundle the GitHub Action entrypoint with all dependencies into a single file.
 *
 * This produces dist/review-action-bundle.js — a standalone Node.js script
 * that includes everything: @drewsepsi/squido-ai, @octokit/rest, yaml, etc.
 * The Docker image only needs Node.js to run it; no node_modules required.
 */

import esbuild from "esbuild";
import { builtinModules } from "node:module";
import { fileURLToPath } from "node:url";

const root = new URL("..", import.meta.url);
const entryPoint = fileURLToPath(new URL("src/entrypoints/github-action.ts", root));
const outfile = fileURLToPath(new URL("dist/review-action-bundle.js", root));
const tsconfig = fileURLToPath(new URL("tsconfig.build.json", root));

await esbuild.build({
	entryPoints: [entryPoint],
	outfile,
	bundle: true,
	platform: "node",
	target: "node22",
	format: "esm",
	sourcemap: false,
	minify: false,
	// Node.js built-ins are available at runtime; everything else is bundled.
	external: builtinModules,
	tsconfig,
});

console.log("Bundled: dist/review-action-bundle.js");
