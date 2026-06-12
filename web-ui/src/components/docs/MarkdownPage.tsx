import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import { CodeBlock } from "./CodeBlock.tsx";
import type { Components } from "react-markdown";

type Props = {
	content: string;
};

export function MarkdownPage({ content }: Props) {
	const components: Components = {
		code: ({ className, children, ...props }) => {
			const match = /language-(\w+)/.exec(className ?? "");
			const codeString = String(children).replace(/\n$/, "");
			if (match) {
				return <CodeBlock language={match[1]} code={codeString} />;
			}
			return (
				<code className={className} {...props}>
					{children}
				</code>
			);
		},
		pre: ({ children }) => <>{children}</>,
		a: ({ href, children, ...props }) => {
			const isExternal = href?.startsWith("http");
			if (isExternal) {
				return (
					<a href={href} target="_blank" rel="noopener noreferrer" {...props}>
						{children}
					</a>
				);
			}
			const docHref = href?.replace(/\.md$/, "");
			const finalHref = docHref?.startsWith("/")
				? docHref
				: `/docs/${docHref ?? ""}`;
			return (
				<a href={finalHref} {...props}>
					{children}
				</a>
			);
		},
		table: ({ children }) => (
			<div className="docs-table-wrapper">
				<table className="docs-table">{children}</table>
			</div>
		),
		img: ({ src, alt, width }) => (
			<img
				src={src}
				alt={alt ?? ""}
				width={width}
				className="docs-image"
				loading="lazy"
				style={width ? undefined : { maxWidth: "100%" }}
			/>
		),
		blockquote: ({ children }) => (
			<blockquote className="docs-blockquote">{children}</blockquote>
		),
		hr: () => <hr className="docs-hr" />,
	};

	return (
		<article className="docs-article">
			<div className="docs-article-atmosphere" aria-hidden="true" />
			<Markdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeRaw]}
				components={components}
			>
				{content}
			</Markdown>
		</article>
	);
}
