import docsNav from "./docs.json";

export type DocNavItem = {
	title: string;
	path: string;
};

export type DocSection = {
	title: string;
	items: DocNavItem[];
};

export const navigation = docsNav.navigation as DocSection[];

function slugify(path: string): string {
	return path.replace(".md", "").toLowerCase();
}

const docModules = import.meta.glob("../../../packages/cli/docs/*.md", {
	query: "?raw",
	import: "default",
	eager: true,
}) as Record<string, string>;

const loadedContent = new Map<string, string>();

for (const [filepath, content] of Object.entries(docModules)) {
	const filename = filepath.split("/").pop() ?? "";
	const slug = slugify(filename);

	// Normalise content: rename Pi -> Squido throughout
	let adapted = content
		// Rewrite GitHub URLs FIRST (before generic pi→squido text replacements)
		.replace(/https:\/\/github\.com\/earendil-works\/(pi|pi-mono)\b/g, "https://github.com/drewsephski/squido")
		.replace(/https:\/\/raw\.githubusercontent\.com\/earendil-works\/(pi|pi-mono)\b/g, "https://raw.githubusercontent.com/drewsephski/squido")
		.replace(/@earendil-works\//g, "@drewsephski/")
		// "Pi" as a standalone word (uppercase P)
		.replace(/\bPi\b/g, "Squido")
		// "pi" as a standalone word (lowercase)
		.replace(/\bpi\b/g, "squido")
		// "pi-*" prefixes in identifiers (pi-mono, pi-coding-agent, pi-ai)
		.replace(/\bpi-mono\b/g, "squido-mono")
		.replace(/\bpi-coding-agent\b/g, "squido-coding-agent")
		.replace(/\bpi-ai\b/g, "squido-ai")
		.replace(/\bpi-tui\b/g, "squido-tui")
		.replace(/\bpi-cli\b/g, "squido-cli")
		.replace(/\bpi-agent\b/g, "squido-agent")
		// pi as a file path component
		.replace(/\/pi\//g, "/squido/")
		.replace(/`\/pi\//g, "`/squido/")
		.replace(/~\/\.pi\b/g, "~/.squido")
		.replace(/\.pi\//g, ".squido/")
		.replace(/\.pi"/g, '.squido"')
		.replace(/\.pi`/g, ".squido`")
		// extension and event API prefix
		.replace(/\bpi\.on\b/g, "squido.on")
		.replace(/\bpi\.register/g, "squido.register")
		.replace(/\bpi\.sendMessage/g, "squido.sendMessage")
		.replace(/\bpi\.set/g, "squido.set")
		.replace(/\bpi\.unregister/g, "squido.unregister")
		.replace(/\bpi\.get/g, "squido.get")
		.replace(/\bpi\.create/g, "squido.create")
		.replace(/\bpi\.update/g, "squido.update")
		.replace(/\bpi\.add/g, "squido.add")
		.replace(/\bpi\.remove/g, "squido.remove")
		.replace(/\bpi\.has/g, "squido.has")
		.replace(/\bpi\.list/g, "squido.list")
		// Code references: "pi(" / "pi " / "pi," / "pi." / "pi:" / "pi;" / "pi)" etc
		.replace(/\bpi\(/g, "squido(")
		.replace(/\bpi --/g, "squido --")
		.replace(/\bpi \|/g, "squido |")
		.replace(/"pi"/g, '"squido"');
	// Rewrite relative image paths to absolute /docs/images/ paths
	adapted = adapted
		.replace(/(src=["'])(images\/)/g, "$1/docs/images/")
		.replace(/\]\((images\/)/g, "](/docs/images/");

	loadedContent.set(slug, adapted);
}

export function getDocContent(slug: string): string | undefined {
	return loadedContent.get(slug);
}

export function findNavItem(
	slug: string,
): { section: DocSection; item: DocNavItem } | undefined {
	for (const section of navigation) {
		for (const item of section.items) {
			if (slugify(item.path) === slug) {
				return { section, item };
			}
		}
	}
	return undefined;
}

export function getAllSlugs(): string[] {
	const slugs: string[] = [];
	for (const section of navigation) {
		for (const item of section.items) {
			slugs.push(slugify(item.path));
		}
	}
	return slugs;
}

export { slugify };
