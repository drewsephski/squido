export function Logo({ size = 32 }: { size?: number }) {
	return (
		<img
			src="/favicon.png"
			width={size}
			height={size}
			alt="Squido"
			style={{ display: "block" }}
		/>
	);
}
