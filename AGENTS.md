# Development Rules

## Conversational Style

- Keep answers short and concise
- No emojis in commits, issues, PR comments, or code
- No fluff or cheerful filler text
- Technical prose only, be direct

## Code Quality

- Read files in full before wide-ranging changes
- No `any` unless absolutely necessary
- Use only erasable TypeScript syntax
- Never remove or downgrade code to fix type errors from outdated deps; upgrade the dep instead.

## Commands

- After code changes: `npm run check`. Fix all errors before committing.
- Never run `npm run build` or `npm test` unless requested.

## License

MIT
