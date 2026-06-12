import { useEffect, useState } from "react";

function prefersReducedMotion() {
	return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function useTypewriter(
	lines: readonly string[],
	opts?: { charDelay?: number; linePause?: number },
) {
	const charDelay = opts?.charDelay ?? 28;
	const linePause = opts?.linePause ?? 400;
	const [lineIndex, setLineIndex] = useState(0);
	const [charIndex, setCharIndex] = useState(0);
	const [done, setDone] = useState(false);
	const [reducedMotion] = useState(prefersReducedMotion);

	useEffect(() => {
		if (reducedMotion) {
			setDone(true);
			return;
		}

		if (done || lines.length === 0) return;

		const current = lines[lineIndex];
		if (charIndex < current.length) {
			const t = setTimeout(() => setCharIndex((c) => c + 1), charDelay);
			return () => clearTimeout(t);
		}

		if (lineIndex < lines.length - 1) {
			const t = setTimeout(() => {
				setLineIndex((i) => i + 1);
				setCharIndex(0);
			}, linePause);
			return () => clearTimeout(t);
		}

		setDone(true);
	}, [lines, lineIndex, charIndex, charDelay, linePause, done, reducedMotion]);

	const visible = reducedMotion
		? [...lines]
		: lines.slice(0, lineIndex + 1).map((line, i) =>
				i < lineIndex ? line : line.slice(0, charIndex),
			);

	return { visible, done, showCursor: !reducedMotion && !done };
}
