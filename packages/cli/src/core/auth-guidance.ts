import { join } from "node:path";
import { getDocsPath } from "../config.ts";

const UNKNOWN_PROVIDER = "unknown";

export function getProviderLoginHelp(): string {
	return [
		"Use /login to log into a provider via OAuth or API key. See:",
		`  ${join(getDocsPath(), "providers.md")}`,
		`  ${join(getDocsPath(), "models.md")}`,
	].join("\n");
}

export function formatNoModelsAvailableMessage(): string {
	return [
		"No models available.",
		"",
		"Set an API key environment variable (e.g., ANTHROPIC_API_KEY, OPENAI_API_KEY, GEMINI_API_KEY)",
		"or use /login to authenticate with a provider via OAuth.",
		"",
		"Once configured, Squido will automatically detect available models.",
	].join("\n");
}

export function formatNoModelSelectedMessage(): string {
	return [
		"No model selected.",
		"",
		"Set an API key environment variable or use /login to authenticate.",
		"Then use /model to select a model.",
	].join("\n");
}

export function formatNoApiKeyFoundMessage(provider: string): string {
	const providerDisplay = provider === UNKNOWN_PROVIDER ? "the selected model" : provider;
	return `No API key found for ${providerDisplay}.

Set the ${providerDisplay.toUpperCase()}_API_KEY environment variable or run /login to authenticate.

See ${join(getDocsPath(), "providers.md")} for detailed setup instructions.`;
}

/** Get a list of common provider env vars for display in startup guidance */
export function getCommonProviderEnvVars(): string[] {
	return ["ANTHROPIC_API_KEY", "OPENAI_API_KEY", "GEMINI_API_KEY", "DEEPSEEK_API_KEY", "GROQ_API_KEY"];
}

/** Get common providers list */
export function getCommonProviders(): string[] {
	return ["anthropic", "openai", "google", "deepseek", "groq", "mistral", "xai", "openrouter"];
}
