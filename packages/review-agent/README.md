# @drewsepsi/review-agent

AI-powered pull request review agent for GitHub Actions. Uses Squido's multi-provider LLM abstraction to review PR diffs for bugs, security vulnerabilities, and code quality issues.

## Usage

### GitHub Action

```yaml
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: drewsepsi/squido/packages/review-agent@main
        with:
          api-key: ${{ secrets.OPENCODE_API_KEY }}
```

### CLI

```bash
# Review a diff file
npx @drewsepsi/review-agent --diff changes.patch

# Review a GitHub PR (requires GITHUB_TOKEN env)
npx @drewsepsi/review-agent --pr owner/repo/123

# Review local uncommitted changes
npx @drewsepsi/review-agent --dir .
```

## Configuration

Optional `.squido-review.yaml` in the repo root:

```yaml
review:
  provider: opencode-go
  model: deepseek-v4-flash
  agents:
    - pr-summarizer
    - code-reviewer
    - security-scanner
  static-analyzers: auto
  mode: advisory
  thresholds:
    max-comments: 20
    min-confidence: 0.6
```

## Agents

| Agent | Role |
|-------|------|
| pr-summarizer | Produces a concise summary of PR changes |
| code-reviewer | Identifies bugs, logic errors, code quality issues |
| security-scanner | Scans for OWASP Top 10 vulnerabilities |

## Static Analyzers

Optional: `semgrep` and `detect-secrets` run automatically if installed.
