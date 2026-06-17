# Development

See [AGENTS.md](https://github.com/drewsephski/squido/blob/main/AGENTS.md) for additional guidelines.

## Setup

```bash
git clone https://github.com/drewsephski/squido
cd squido
npm install
npm run build
```

Run from source:

```bash
/path/to/squido/squido-test.sh
```

The script can be run from any directory. Squido keeps the caller's current working directory.

## Forking / Rebranding

Configure via `package.json`:

```json
{
  "piConfig": {
    "name": "squido",
    "configDir": ".squido"
  }
}
```

Change `name`, `configDir`, and `bin` field for your fork. The default config dir is `.squido` and CLI name is `squido`. Affects CLI banner, config paths, and environment variable names.

## Path Resolution

Three execution modes: npm install, standalone binary, tsx from source.

**Always use `src/config.ts`** for package assets:

```typescript
import { getPackageDir, getThemeDir } from "./config.js";
```

Never use `__dirname` directly for package assets.

## Debug Command

`/debug` (hidden) writes to `~/.squido/agent/squido-debug.log`:
- Rendered TUI lines with ANSI codes
- Last messages sent to the LLM

## Testing

```bash
./test.sh                         # Run non-LLM tests (no API keys needed)
npm test                          # Run all tests
npm test -- test/specific.test.ts # Run specific test
```

## Project Structure

```
packages/
  ai/           # LLM provider abstraction
  agent/        # Agent loop and message types  
  tui/          # Terminal UI components
  coding-agent/ # CLI and interactive mode
```
