# Contributing to Smithers

Thank you for your interest in contributing to Smithers! This guide will help you get started.

## Development Setup

### Prerequisites

- [Bun](https://bun.sh) (latest version)
- [Zig](https://ziglang.org/) v0.15.2 or later (required for OpenTUI)
- [Git](https://git-scm.com/)
- [VHS](https://github.com/charmbracelet/vhs) (optional, for recording demos)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/evmts/smithers.git
cd smithers
```

2. Install Zig (required for OpenTUI native layer):
```bash
# macOS
brew install zig

# Linux
snap install zig --classic --beta

# Windows
choco install zig
```

3. Install dependencies:
```bash
bun install
```

4. Run tests to verify setup:
```bash
bun test
```

### Development Workflow

1. **Create a branch** for your changes:
```bash
git checkout -b feature/your-feature-name
```

2. **Make your changes** following our coding standards

3. **Write tests** for new functionality

4. **Run tests** to ensure everything passes:
```bash
bun test
bun run typecheck
```

5. **Build** to verify no compilation errors:
```bash
bun run build
```

6. **Commit your changes** with a descriptive message:
```bash
git commit -m "feat: add new feature"
```

Follow [Conventional Commits](https://www.conventionalcommits.org/):
- `feat:` - New features
- `fix:` - Bug fixes
- `docs:` - Documentation changes
- `test:` - Test additions or changes
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `chore:` - Maintenance tasks

7. **Push your branch** and create a Pull Request:
```bash
git push origin feature/your-feature-name
```

## Project Structure

```
smithers/
├── src/
│   ├── core/         # Core rendering and execution logic
│   ├── components/   # React component definitions
│   ├── cli/          # CLI commands and utilities
│   ├── tui/          # Terminal UI components
│   ├── mcp/          # MCP (Model Context Protocol) integration
│   ├── debug/        # Debug and observability tools
│   └── reconciler/   # React reconciler host config
├── evals/            # Test files
├── examples/         # Example agents
├── docs/             # Documentation (Mintlify)
└── demos/            # VHS demo recordings
```

## Testing

We use Bun's built-in test runner. All tests are in the `evals/` directory.

### Running Tests

```bash
# Run all tests
bun test

# Run specific test file
bun test evals/worktree.test.tsx

# Run tests in watch mode
bun test --watch

# Run tests with coverage (when configured)
bun test --coverage
```

### Writing Tests

- Place test files in `evals/` directory
- Name test files with `.test.ts` or `.test.tsx` extension
- Use descriptive test names that explain what is being tested
- Test both success and error cases
- Use mock mode for tests to avoid real API calls

Example test structure:
```typescript
import { describe, test, expect } from 'bun:test'
import { renderPlan, executePlan } from '../src/index.js'

describe('Feature Name', () => {
  test('should do something', async () => {
    const result = await executePlan(<Component />, { mockMode: true })
    expect(result.frames).toBeGreaterThan(0)
  })
})
```

## Code Style

- **TypeScript**: Use TypeScript for all new code
- **Formatting**: We use Prettier (if configured)
- **Naming**: 
  - Components: PascalCase (`TreeView`, `AgentPanel`)
  - Functions: camelCase (`executePlan`, `renderPlan`)
  - Files: kebab-case (`execute-plan.ts`, `tree-view.tsx`)
- **Exports**: Prefer named exports over default exports (except for React components)

## Documentation

- Add JSDoc comments for all public APIs
- Update relevant documentation in `docs/` when adding features
- Include code examples in documentation
- Update `CHANGELOG.md` via changesets (see below)

### Adding Documentation

1. Component docs go in `docs/components/`
2. Guide docs go in `docs/guides/`
3. API reference docs go in `docs/api-reference/`
4. Update `docs/mint.json` navigation if adding new pages

## Changesets

We use [Changesets](https://github.com/changesets/changesets) for version management and changelogs.

### Creating a Changeset

After making changes, create a changeset:

```bash
bun run changeset
```

Follow the prompts to:
1. Select the type of change (patch, minor, major)
2. Write a description of the change

This creates a `.changeset/*.md` file that will be used to generate the changelog on release.

### Changeset Guidelines

- **Patch**: Bug fixes, documentation updates, internal refactors
- **Minor**: New features, new components, non-breaking API additions
- **Major**: Breaking changes to public API

## Adding Examples

Examples help users understand how to use Smithers. When adding an example:

1. Create a directory in `examples/` (e.g., `examples/12-my-example/`)
2. Add files:
   - `README.md` - Explain what the example does and why
   - `agent.tsx` or `agent.mdx` - The main agent file
   - `smithers.config.ts` - Configuration (if needed)
   - Sample data files (if needed)

3. Add the example to `docs/mint.json` navigation
4. Create corresponding documentation in `docs/examples/`

## Adding Tests

When adding new features, add corresponding tests:

1. Create a test file in `evals/` (e.g., `evals/my-feature.test.tsx`)
2. Import from `../src/index.js` (not from `../dist/`)
3. Use mock mode to avoid real API calls: `{ mockMode: true }`
4. Test both success and error cases
5. Use descriptive test names

See `evals/worktree.test.tsx` for a comprehensive example.

## Release Process

Releases are automated via GitHub Actions when changesets are merged to `main`.

1. Create changeset: `bun run changeset`
2. Commit and push your changes
3. GitHub Action creates a "Version Packages" PR
4. When merged, packages are automatically published to npm

## Getting Help

- **Documentation**: [https://smithers.dev](https://smithers.dev) (when published)
- **Issues**: [GitHub Issues](https://github.com/evmts/smithers/issues)
- **Discussions**: [GitHub Discussions](https://github.com/evmts/smithers/discussions)

## Code of Conduct

Please be respectful and constructive in all interactions. We're here to build great software together.

## License

By contributing to Smithers, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to Smithers! 🎉
