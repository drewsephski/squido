import { useState, useCallback } from "react";

type Props = {
	language: string;
	code: string;
};

export function CodeBlock({ language, code }: Props) {
	return (
		<div className="docs-code-block">
			<div className="docs-code-header">
				<div className="docs-code-dots">
					<span className="docs-code-dot docs-code-dot--close" />
					<span className="docs-code-dot docs-code-dot--min" />
					<span className="docs-code-dot docs-code-dot--max" />
				</div>
				<span className="docs-code-lang">{language}</span>
				<CopyButton code={code} />
			</div>
			<div className="docs-code-body">
				<pre>
					<code>{code}</code>
				</pre>
			</div>
		</div>
	);
}

function CopyButton({ code }: { code: string }) {
	const [copied, setCopied] = useState(false);

	const handleClick = useCallback(() => {
		navigator.clipboard.writeText(code).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 1800);
		});
	}, [code]);

	return (
		<button
			type="button"
			className={`docs-code-copy ${copied ? "docs-code-copy--copied" : ""}`}
			onClick={handleClick}
			aria-label={copied ? "Copied" : "Copy code"}
		>
			<span className="docs-code-copy-icon">
				<CopyIcon />
			</span>
			<span className="docs-code-copy-text">Copy</span>
			<span className="docs-code-copy-check">
				<CheckIcon />
				<span className="docs-code-copy-check-text">Copied</span>
			</span>
		</button>
	);
}

function CopyIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
			<rect x="4" y="4" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.2" />
			<path d="M10 4V2a1 1 0 00-1-1H3a1 1 0 00-1 1v8a1 1 0 001 1h2" stroke="currentColor" strokeWidth="1.2" />
		</svg>
	);
}

function CheckIcon() {
	return (
		<svg width="14" height="14" viewBox="0 0 14 14" fill="none">
			<circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
			<path d="M4.5 7l2 2 3-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
		</svg>
	);
}
