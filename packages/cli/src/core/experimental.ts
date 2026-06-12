export function areExperimentalFeaturesEnabled(): boolean {
	return process.env.SQUIDO_EXPERIMENTAL === "1";
}
