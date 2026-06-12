# Squido

A coding agent CLI with read, bash, edit, write tools and session management.

Forked from [Pi](https://github.com/earendil-works/pi) by Mario Zechner.

## Packages

| Package | Description |
|---------|-------------|
| **[@drewsepsi/squido-ai](packages/ai)** | Unified multi-provider LLM API (OpenAI, Anthropic, Google, etc.) |
| **[@drewsepsi/squido-agent-core](packages/agent)** | Agent runtime with tool calling and state management |
| **[@drewsepsi/squido-cli](packages/cli)** | Interactive coding agent CLI |
| **[@drewsepsi/squido-tui](packages/tui)** | Terminal UI library with differential rendering |

## Installation

```bash
npm install -g @drewsepsi/squido-cli
```

## Development

```bash
npm install --ignore-scripts
npm run build
npm run check
```

## License

MIT
