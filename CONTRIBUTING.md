# Contributing to Smithers

Thank you for your interest in contributing to Smithers! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Development Setup](#development-setup)
- [Running Tests](#running-tests)
- [Code Style](#code-style)
- [Git Commit Convention](#git-commit-convention)
- [Pull Request Process](#pull-request-process)

## Development Setup

### Prerequisites

- **Bun** (required): Smithers uses Bun as its JavaScript runtime and package manager. Install it from [bun.sh](https://bun.sh).
- **Node.js** is NOT required for development.

### Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/williamcory/smithers.git
   cd smithers
   ```

2. Install dependencies:
   ```bash
   bun install
   ```

3. Install the post-commit hook (recommended):
   ```bash
   cp hooks/post-commit .git/hooks/
   chmod +x .git/hooks/post-commit
   ```

4. Verify your setup:
   ```bash
   bun test
   ```

## Running Tests

Smithers uses Bun's built-in test runner. Tests are located in the `evals/` directory.

### Test Commands

```bash
# Run all tests
bun test

# Run a specific test file
bun test evals/hello-world.test.tsx

# Run tests with watch mode
bun test --watch
```

### Test Organization

Tests are organized by feature complexity:

| Test File | Purpose |
|-----------|---------|
| `hello-world.test.tsx` | Basic rendering and execution |
| `multi-agent.test.tsx` | Nested agents and state coordination |
| `multi-phase.test.tsx` | Ralph loop with Zustand state transitions |
| `code-review.test.tsx` | Tool integration and MCP servers |
| `all-features.test.tsx` | Comprehensive feature test |

### Other Development Commands

```bash
bun run build      # Build the project
bun run typecheck  # Run TypeScript type checking
```

## Code Style

- Write TypeScript for all source files
- Use functional components and hooks patterns (React 19)
- Follow existing code patterns in the repository
- Keep components focused and composable
- Use Zustand for state management in examples and tests

For detailed architecture information, see [CLAUDE.md](./CLAUDE.md).

## Git Commit Convention

### Commit Messages

Use conventional commit format with emoji prefixes:

```
<emoji> <type>: <subject>

[optional body]

[optional footer]
```

Common types and emojis:
- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Adding or updating tests
- `refactor:` - Code refactoring
- `chore:` - Maintenance tasks

### Git Notes (Required)

**Every commit MUST have a git note attached** containing context from the conversation or reasoning that led to the commit.

After committing, add a git note:

```bash
git notes add -m "$(cat <<'EOF'
## Conversation Context

### Task
[Description of what was being accomplished]

### Design Decisions
[Key decisions made and why]

### Alternatives Considered
[Any alternatives that were rejected and why]
EOF
)"
```

To view notes:
```bash
git log --show-notes
```

### Why We Use Git Notes

- Preserves the "why" behind every change
- Makes it possible to understand design decisions months later
- Creates a searchable history of product decisions
- Helps onboard new contributors with full context

## Pull Request Process

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the code style guidelines.

3. **Write or update tests** in the `evals/` directory.

4. **Ensure all tests pass**:
   ```bash
   bun test
   ```

5. **Commit your changes** with proper commit message and git note.

6. **Push your branch** and create a pull request.

7. **In your PR description**, include:
   - Summary of changes
   - Related issue numbers (if any)
   - Test plan or how to verify the changes

### PR Review

- PRs are reviewed by project maintainers
- A Codex review hook may run automatically on commits
- Address any feedback and update your PR as needed

## Questions?

If you have questions about contributing, feel free to open an issue for discussion.
