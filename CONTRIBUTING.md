# Contributing to Smithers

We accept **vibe-coded contributions** as long as you include your original prompt.

## Getting Started

```bash
git clone https://github.com/evmts/smithers.git
cd smithers
bun install
bun test
```

## Testing (E2E = CI/CD)

E2E evals in `evals/` are our CI/CD safety net and model real workflows. `bun test` runs them by default; run it before release. You can also target them directly (e.g., `bun test evals/`).

## Making Changes

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes (AI-assisted or not)
4. Run tests: `bun test`
5. Commit your changes following our commit format
6. **Add a git note with your original prompt:**
   ```bash
   git notes add -m "User prompt: Add support for streaming responses"
   ```
7. Push to the branch (`git push origin feature/amazing-feature`)
8. Open a Pull Request

## Commit Message Format

```
feat: Add streaming response support

Detailed description of changes.

Co-Authored-By: Claude <noreply@anthropic.com>
```

## Project Structure

```
smithers/
├── src/                    # Core library (all-in-one)
│   ├── commands/           # CLI commands (init, run, monitor, db)
│   ├── components/         # JSX components (Claude, Ralph, Phase, Step, etc.)
│   ├── db/                 # SQLite database layer (bun:sqlite)
│   ├── hooks/              # React hooks (useHuman, useRalphCount, etc.)
│   ├── monitor/            # Stream monitoring and logging
│   ├── rate-limits/        # API rate limit tracking
│   ├── reactive-sqlite/    # Reactive SQLite with useQuery/useQueryValue
│   ├── reconciler/         # React reconciler for terminal rendering
│   ├── tools/              # Tool registry and definitions
│   ├── tui/                # Terminal UI components
│   └── utils/              # VCS, capture, structured-output utilities
├── bin/                    # CLI entry point
├── evals/                  # Integration tests and examples
├── reference/              # Git submodules for AI context (NOT dependencies)
├── plugins/                # Claude Code plugins
├── templates/              # Script templates
└── docs/                   # Additional documentation
```
