/**
 * First-time setup dialog: welcome, auth config, theme, and analytics opt-in.
 */

import { Container, getKeybindings, Spacer, Text } from "@drewsepsi/squido-tui";
import { APP_NAME } from "../../../config.ts";
import { type TerminalTheme, theme } from "../theme/theme.ts";
import { DynamicBorder } from "./dynamic-border.ts";
import { keyHint, rawKeyHint } from "./keybinding-hints.ts";

export interface FirstTimeSetupResult {
	theme: TerminalTheme;
	shareAnalytics: boolean;
	/** Provider that was configured during setup, or undefined if skipped */
	configuredProvider?: { name: string; apiKey: string };
}

export interface ProviderOption {
	id: string;
	label: string;
	envVars: string[];
}

export interface FirstTimeSetupOptions {
	detectedTheme: TerminalTheme;
	/** Whether any provider already has credentials configured */
	hasConfiguredProviders: boolean;
	/** Names of already-configured providers */
	configuredProviders: string[];
	onThemePreview: (themeName: TerminalTheme) => void;
	onSubmit: (result: FirstTimeSetupResult) => void;
	onCancel: () => void;
}

const THEME_OPTIONS: Array<{ value: TerminalTheme; label: string }> = [
	{ value: "dark", label: "Dark" },
	{ value: "light", label: "Light" },
];

const ANALYTICS_OPTIONS: Array<{ value: boolean; label: string }> = [
	{ value: true, label: "Share anonymous usage data" },
	{ value: false, label: "Don't share" },
];

const PROVIDER_OPTIONS: ProviderOption[] = [
	{ id: "anthropic", label: "Anthropic Claude", envVars: ["ANTHROPIC_API_KEY"] },
	{ id: "openai", label: "OpenAI GPT", envVars: ["OPENAI_API_KEY"] },
	{ id: "google", label: "Google Gemini", envVars: ["GEMINI_API_KEY"] },
	{ id: "deepseek", label: "DeepSeek", envVars: ["DEEPSEEK_API_KEY"] },
	{ id: "groq", label: "Groq", envVars: ["GROQ_API_KEY"] },
];

type SetupStep = "welcome" | "provider" | "api_key" | "theme" | "analytics";

const SETUP_LOGO_LINES = ["██████", "██  ██", "████  ██", "██    ██"];

/** First-time setup dialog: provider config, theme choice, and analytics opt-in. */
export class FirstTimeSetupComponent extends Container {
	private step: SetupStep = "welcome";
	private themeIndex: number;
	private analyticsIndex = 0;
	private providerIndex = 0;
	private readonly options: FirstTimeSetupOptions;
	private _apiKeyInputBuffer = "";
	private _apiKeyCursorVisible = true;
	private _apiKeyCursorTimer: ReturnType<typeof setInterval> | undefined;

	constructor(options: FirstTimeSetupOptions) {
		super();
		this.options = options;
		this.themeIndex = Math.max(
			0,
			THEME_OPTIONS.findIndex((option) => option.value === options.detectedTheme),
		);
		// Skip directly to theme if providers are already configured
		if (options.hasConfiguredProviders) {
			this.step = "theme";
		}
		this.update();
	}

	dispose(): void {
		if (this._apiKeyCursorTimer) {
			clearInterval(this._apiKeyCursorTimer);
			this._apiKeyCursorTimer = undefined;
		}
	}

	// Rebuild the whole dialog on every change so theme previews recolor all text.
	private update(): void {
		this.clear();
		this.addChild(new DynamicBorder());
		this.addChild(new Spacer(1));
		this.addChild(new Text(theme.fg("accent", SETUP_LOGO_LINES.join("\n")), 1, 0));
		this.addChild(new Spacer(1));

		switch (this.step) {
			case "welcome":
				this.renderWelcome();
				break;
			case "provider":
				this.renderProvider();
				break;
			case "api_key":
				this.renderApiKey();
				break;
			case "theme":
				this.renderTheme();
				break;
			case "analytics":
				this.renderAnalytics();
				break;
		}

		this.addChild(new Spacer(1));

		if (this.step === "welcome") {
			this.addChild(
				new Text(
					`${keyHint("tui.select.confirm", "get started")}  ${keyHint("tui.select.cancel", "skip setup")}`,
					1,
					0,
				),
			);
		} else if (this.step === "api_key") {
			this.addChild(
				new Text(`${keyHint("tui.select.confirm", "submit key")}  ${keyHint("tui.select.cancel", "back")}`, 1, 0),
			);
		} else {
			this.addChild(
				new Text(
					rawKeyHint("↑↓", "navigate") +
						"  " +
						keyHint("tui.select.confirm", this.step === "analytics" ? "finish" : "continue") +
						"  " +
						keyHint("tui.select.cancel", this.step === "theme" ? "skip" : "back"),
					1,
					0,
				),
			);
		}
		this.addChild(new Spacer(1));
		this.addChild(new DynamicBorder());
	}

	private renderWelcome(): void {
		this.addChild(new Text(theme.fg("accent", theme.bold(`Welcome to ${APP_NAME}.`)), 1, 0));
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(
				theme.fg(
					"text",
					[
						`${APP_NAME} is an open-source AI coding agent for the terminal.`,
						"",
						"It can read files, run commands, edit code, and more —",
						"across 40+ AI providers including Anthropic, OpenAI,",
						"Google Gemini, DeepSeek, Groq, and local models.",
						"",
						"Switch models mid-conversation, branch sessions like",
						"Git, and keep your workflow independent of any provider.",
					].join("\n"),
				),
				1,
				0,
			),
		);
	}

	private renderProvider(): void {
		this.addChild(new Text(theme.fg("accent", theme.bold("Connect an AI provider")), 1, 0));
		this.addChild(new Text(theme.fg("muted", "Select a provider to configure with an API key."), 1, 0));
		this.addChild(new Spacer(1));
		if (this.options.configuredProviders.length > 0) {
			this.addChild(
				new Text(theme.fg("success", `Already configured: ${this.options.configuredProviders.join(", ")}`), 1, 0),
			);
			this.addChild(new Spacer(1));
		}
		for (let i = 0; i < PROVIDER_OPTIONS.length; i++) {
			const isSelected = i === this.providerIndex;
			const prefix = isSelected ? theme.fg("accent", "→ ") : "  ";
			const label = isSelected
				? theme.fg("accent", PROVIDER_OPTIONS[i].label)
				: theme.fg("text", PROVIDER_OPTIONS[i].label);
			const hint = theme.fg("muted", ` (${PROVIDER_OPTIONS[i].envVars.join(", ")})`);
			this.addChild(new Text(`${prefix}${label}${hint}`, 1, 0));
		}
		// Skip option
		const skipSelected = this.providerIndex >= PROVIDER_OPTIONS.length;
		const skipPrefix = skipSelected ? theme.fg("accent", "→ ") : "  ";
		const skipLabel = skipSelected
			? theme.fg("accent", "Skip — I'll configure later")
			: theme.fg("text", "Skip — I'll configure later");
		this.addChild(new Text(`${skipPrefix}${skipLabel}`, 1, 0));
	}

	private renderApiKey(): void {
		const provider = PROVIDER_OPTIONS[this.providerIndex];
		this.addChild(new Text(theme.fg("accent", theme.bold(`Enter your ${provider.label} API key`)), 1, 0));
		this.addChild(new Spacer(1));
		this.addChild(
			new Text(
				theme.fg(
					"muted",
					[
						`Set ${provider.envVars[0]}=sk-... in your environment, or`,
						"paste your API key below. It will be saved to auth.json.",
					].join("\n"),
				),
				1,
				0,
			),
		);
		this.addChild(new Spacer(1));
		const displayKey = this.maskApiKey(this._apiKeyInputBuffer);
		const cursor = this._apiKeyCursorVisible ? theme.fg("accent", "█") : " ";
		this.addChild(new Text(theme.fg("text", `Key: ${displayKey}${cursor}`), 1, 0));
	}

	private renderTheme(): void {
		this.addChild(new Text(theme.fg("text", "Pick a theme."), 1, 0));
		if (this.options.hasConfiguredProviders) {
			this.addChild(
				new Text(theme.fg("success", `Providers ready: ${this.options.configuredProviders.join(", ")}`), 1, 0),
			);
		} else {
			this.addChild(new Text(theme.fg("muted", "You can configure providers later with /login"), 1, 0));
		}
		this.addChild(new Spacer(1));
		for (let i = 0; i < THEME_OPTIONS.length; i++) {
			const isSelected = i === this.themeIndex;
			const prefix = isSelected ? theme.fg("accent", "→ ") : "  ";
			const label = isSelected
				? theme.fg("accent", THEME_OPTIONS[i].label)
				: theme.fg("text", THEME_OPTIONS[i].label);
			this.addChild(new Text(`${prefix}${label}`, 1, 0));
		}
	}

	private renderAnalytics(): void {
		this.addChild(new Text(theme.fg("text", "Opt-in to anonymous usage data sharing?"), 1, 0));
		this.addChild(
			new Text(
				theme.fg(
					"muted",
					"Opting in stores a tracking identifier in settings.json and enables anonymous\nusage analytics. This helps us to better debug, reproduce, and resolve issues\nand bugs within Squido. You can observe what is shared using /privacy and make\nchanges anytime in settings.json.",
				),
				1,
				0,
			),
		);
		this.addChild(new Spacer(1));
		for (let i = 0; i < ANALYTICS_OPTIONS.length; i++) {
			const isSelected = i === this.analyticsIndex;
			const prefix = isSelected ? theme.fg("accent", "→ ") : "  ";
			const label = isSelected
				? theme.fg("accent", ANALYTICS_OPTIONS[i].label)
				: theme.fg("text", ANALYTICS_OPTIONS[i].label);
			this.addChild(new Text(`${prefix}${label}`, 1, 0));
		}
	}

	private maskApiKey(key: string): string {
		if (key.length <= 8) return key;
		return key.substring(0, 4) + "•".repeat(Math.min(key.length - 8, 20)) + key.substring(key.length - 4);
	}

	private moveSelection(delta: number): void {
		if (this.step === "provider") {
			const total = PROVIDER_OPTIONS.length + 1; // +1 for skip
			this.providerIndex = Math.max(0, Math.min(total - 1, this.providerIndex + delta));
			this.update();
		} else if (this.step === "theme") {
			const next = Math.max(0, Math.min(THEME_OPTIONS.length - 1, this.themeIndex + delta));
			if (next !== this.themeIndex) {
				this.themeIndex = next;
				this.options.onThemePreview(THEME_OPTIONS[this.themeIndex].value);
			}
			this.update();
		} else if (this.step === "analytics") {
			this.analyticsIndex = Math.max(0, Math.min(ANALYTICS_OPTIONS.length - 1, this.analyticsIndex + delta));
			this.update();
		}
	}

	handleInput(keyData: string): void {
		const kb = getKeybindings();
		if (this.step === "welcome") {
			if (kb.matches(keyData, "tui.select.confirm") || keyData === "\n") {
				if (this.options.hasConfiguredProviders) {
					this.step = "theme";
				} else {
					this.step = "provider";
				}
				this.update();
			} else if (kb.matches(keyData, "tui.select.cancel")) {
				// Skip to theme with no provider configured
				this.step = "theme";
				this.update();
			}
		} else if (this.step === "provider") {
			if (kb.matches(keyData, "tui.select.up") || keyData === "k") {
				this.moveSelection(-1);
			} else if (kb.matches(keyData, "tui.select.down") || keyData === "j") {
				this.moveSelection(1);
			} else if (kb.matches(keyData, "tui.select.confirm") || keyData === "\n") {
				if (this.providerIndex < PROVIDER_OPTIONS.length) {
					// Start API key blinking cursor
					this._apiKeyCursorVisible = true;
					this._apiKeyCursorTimer = setInterval(() => {
						this._apiKeyCursorVisible = !this._apiKeyCursorVisible;
						this.update();
					}, 530);
					this.step = "api_key";
					this.update();
				} else {
					// Skip
					this.step = "theme";
					this.update();
				}
			} else if (kb.matches(keyData, "tui.select.cancel")) {
				this.step = "theme";
				this.update();
			}
		} else if (this.step === "api_key") {
			if (kb.matches(keyData, "tui.select.confirm") || keyData === "\n") {
				if (this._apiKeyInputBuffer.trim().length > 0) {
					const provider = PROVIDER_OPTIONS[this.providerIndex];
					this.options.onSubmit({
						theme: THEME_OPTIONS[this.themeIndex].value,
						shareAnalytics: ANALYTICS_OPTIONS[this.analyticsIndex].value,
						configuredProvider: { name: provider.id, apiKey: this._apiKeyInputBuffer.trim() },
					});
				} else {
					// Empty key — skip and continue to theme
					if (this._apiKeyCursorTimer) {
						clearInterval(this._apiKeyCursorTimer);
						this._apiKeyCursorTimer = undefined;
					}
					this._apiKeyInputBuffer = "";
					this.step = "theme";
					this.update();
				}
			} else if (kb.matches(keyData, "tui.select.cancel")) {
				// Clear API key timer
				if (this._apiKeyCursorTimer) {
					clearInterval(this._apiKeyCursorTimer);
					this._apiKeyCursorTimer = undefined;
				}
				this._apiKeyInputBuffer = "";
				this.step = "provider";
				this.update();
			} else if (keyData === "backspace" || keyData === "\b") {
				this._apiKeyInputBuffer = this._apiKeyInputBuffer.slice(0, -1);
				this.update();
			} else if (keyData.length === 1 && keyData !== "\n" && keyData !== "\r") {
				this._apiKeyInputBuffer += keyData;
				this.update();
			}
		} else if (this.step === "theme") {
			if (kb.matches(keyData, "tui.select.up") || keyData === "k") {
				this.moveSelection(-1);
			} else if (kb.matches(keyData, "tui.select.down") || keyData === "j") {
				this.moveSelection(1);
			} else if (kb.matches(keyData, "tui.select.confirm") || keyData === "\n") {
				this.step = "analytics";
				this.update();
			} else if (kb.matches(keyData, "tui.select.cancel")) {
				this.options.onSubmit({
					theme: THEME_OPTIONS[this.themeIndex].value,
					shareAnalytics: false,
				});
			}
		} else if (this.step === "analytics") {
			if (kb.matches(keyData, "tui.select.up") || keyData === "k") {
				this.moveSelection(-1);
			} else if (kb.matches(keyData, "tui.select.down") || keyData === "j") {
				this.moveSelection(1);
			} else if (kb.matches(keyData, "tui.select.confirm") || keyData === "\n") {
				this.options.onSubmit({
					theme: THEME_OPTIONS[this.themeIndex].value,
					shareAnalytics: ANALYTICS_OPTIONS[this.analyticsIndex].value,
				});
			} else if (kb.matches(keyData, "tui.select.cancel")) {
				this.step = "theme";
				this.update();
			}
		}
	}
}
