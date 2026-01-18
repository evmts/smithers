# Contributing to Smithers

We accept **vibe-coded contributions** as long as you include your original prompt.

## Getting Started

```bash
git clone https://github.com/evmts/smithers.git
cd smithers
bun install
bun test
```

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
├── src/                    # Core library
│   ├── components/         # JSX components (Claude, Ralph, etc.)
│   ├── reconciler/         # React reconciler
│   └── utils/              # Utilities
├── smithers-orchestrator/  # CLI and database
│   ├── src/
│   │   ├── components/     # Enhanced components with DB integration
│   │   ├── db/             # PGlite database layer
│   │   └── utils/          # CLI utilities
│   └── bin/                # CLI entry point
└── examples/               # Example workflows
```

## Running Examples

```bash
bun examples/hello-world.tsx
bun examples/review-workflow.tsx
bun examples/ci-recovery.tsx
```
