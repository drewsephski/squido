import { useState, useCallback, useEffect, useRef } from "react";
import { codeToHtml } from "shiki";

interface CodeBlockProps {
	className?: string;
	children: string;
}

export function CodeBlock({ className, children }: CodeBlockProps) {
	const [copied, setCopied] = useState(false);
	const [html, setHtml] = useState<string | null>(null);
	const prevCodeRef = useRef<string>("");
	const lang = className?.replace("language-", "") ?? "";
	const code = String(children).replace(/\n$/, "");

	const handleCopy = useCallback(() => {
		navigator.clipboard.writeText(code).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}, [code]);

	// Highlight with Shiki — skip if code just grew (append-only streaming)
	useEffect(() => {
		let cancelled = false;
		const prev = prevCodeRef.current;
		if (prev && code.startsWith(prev) && code.length > prev.length) {
			// Streaming append — skip re-highlight to avoid flicker
			prevCodeRef.current = code;
			return;
		}
		prevCodeRef.current = code;
		(async () => {
			try {
				const result = await codeToHtml(code, {
					lang: lang || "text",
					theme: "dark-plus",
				});
				if (!cancelled) setHtml(result);
			} catch {
				if (!cancelled) setHtml(null);
			}
		})();
		return () => { cancelled = true; };
	}, [code, lang]);

	return (
		<div className="agent-code-block">
			<div className="agent-code-block-header">
				{lang && <span className="agent-code-block-lang">{lang}</span>}
				<button
					onClick={handleCopy}
					className="agent-copy-btn"
					aria-label={copied ? "Copied" : "Copy code"}
				>
					{copied ? "Copied" : "Copy"}
				</button>
			</div>
			{html ? (
				<div className="agent-code-block-html" dangerouslySetInnerHTML={{ __html: html }} />
			) : (
				<pre className="agent-code-block-plain">
					<code>{code}</code>
				</pre>
			)}
		</div>
	);
}
