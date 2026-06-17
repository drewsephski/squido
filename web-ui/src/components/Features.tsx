import { useReveal } from "../hooks/useReveal.ts";

type Tool = {
	name: string;
	description: string;
	detail: string;
	extra?: string;
};

const tools: Tool[] = [
	{
		name: "read",
		description: "Inspect files and search code before you change anything.",
		detail: "read src/app.ts",
	},
	{
		name: "bash",
		description: "Run builds, tests, and scripts without leaving the session.",
		detail: "bash npm run check",
	},
	{
		name: "edit",
		description: "Make targeted edits with diff preview and rollback.",
		detail: "edit src/auth.ts --add-auth",
	},
	{
		name: "write",
		description: "Create new files — code, docs, configs, any text format.",
		detail: "write src/utils.ts",
	},
	{
		name: "session",
		description:
			"Sessions keep your full agent context — every tool call, file read, and model turn — so you can pause mid-task and pick up exactly where you left off.",
		detail: "/export · /resume · /share",
	},
];

function ToolCard({ tool, index }: { tool: Tool; index: number }) {
	const ref = useReveal<HTMLLIElement>();
	const isSession = tool.name === "session";
	return (
		<li
			ref={ref}
			className={`tool-card reveal reveal-delay-${Math.min(index, 4)}${isSession ? " tool-card-session" : ""}`}
		>
			<div className="tool-card-header">
				<code className="tool-card-name">{tool.name}</code>
			</div>
			<p className="tool-card-desc">{tool.description}</p>
			<div className="tool-card-detail">
				<code>{tool.detail}</code>
			</div>
		</li>
	);
}

export function Features() {
	const headerRef = useReveal<HTMLDivElement>();

	return (
		<section id="features" className="section features">
			<div className="container">
				<div ref={headerRef} className="section-header reveal">
					<span className="section-eyebrow">Capabilities</span>
					<h2 className="section-title text-balance">
						Five tools, one agent
					</h2>
					<p className="section-desc text-balance">
						Each tool does one job well. Together they cover the full loop of
						reading, running, changing, and shipping code.
					</p>
				</div>
				<ul className="tools-grid">
					{tools.map((tool, i) => (
						<ToolCard key={tool.name} tool={tool} index={i} />
					))}
				</ul>
			</div>
		</section>
	);
}
