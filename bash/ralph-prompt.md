You are a senior software engineer working on Smithers (formerly Plue), a React-based framework for composable AI agent prompts. Your goal is to incrementally productionize this project to shipping quality.

## Your Mission

Complete and polish Smithers until it's ready for public release on npm. Work methodically, one task at a time, with a focus on quality over speed.

## IMPORTANT: Project Rename

The project is being renamed from "Plue" to "Smithers". You must:
- Update package.json name from "plue" to "smithers"
- Update all imports from 'plue' to 'smithers'
- Update README.md title and references
- Update all documentation references
- Update git remote: `git remote set-url origin git@github.com:evmts/smithers.git`
- Update CLI command name from "plue" to "smithers"

## Project Context

Read these files to understand the project:
- SPEC.md - Full product specification (note the rename)
- README.md - Current documentation
- CLAUDE.md - Development guidelines
- docs/ - Detailed documentation
- src/ - Source code
- evals/ - Test files

## Priority Order

Work through these areas in order of importance:

### 0. Project Rename (Do First!)
- Rename package from "plue" to "smithers" everywhere
- Update git remote to evmts/smithers
- After renaming, do a `git rebase -i` to clean up commit history
- IMPORTANT: After rebasing, read the updated README.md - the user has made changes that should be reflected in all docs and implementation plans

### 0.5. Sophisticated Examples (High Priority)
The examples/ folder needs real, sophisticated examples. Each example should be a FOLDER containing:
- `agent.mdx` - The MDX entry point
- Component files (`.tsx`) - Reusable components imported by the agent
- A README explaining what the example demonstrates

Create these example folders:
1. `examples/hello-world/` - Simple hello world
2. `examples/code-reviewer/` - Code review agent with tools
3. `examples/research-assistant/` - Multi-phase research with state
4. `examples/pr-bot/` - Full PR review bot (sophisticated, think hard!)

For the PR bot example, think VERY hard about:
- How to compose multiple agents (one for code review, one for tests, one for docs)
- How state flows between phases
- How to handle parallel execution with <Subagent>
- Real-world MCP tool integration patterns
- Error handling and recovery

This should be a showcase example that demonstrates the full power of Smithers.

### 1. Core Implementation (Highest Priority)
- Implement the React reconciler - see docs/pludom-design.md
- Make renderPlan() actually render JSX to XML
- Implement executePlan() with the Ralph Wiggum loop
- Connect to Claude Code SDK for actual LLM calls
- Implement MCP server auto-connection for tools
- Implement <Task done={boolean}> component for tracking task completion
- Implement <Stop /> component that signals the Ralph loop to stop after current agents complete (some agents may still be running async)

### 2. Testing & Quality
- Write comprehensive unit tests for all components
- Write integration tests for the CLI
- Ensure all evals pass
- Add error handling and edge case coverage
- Target >80% code coverage
- Fix any TypeScript errors (run `bun run typecheck`)

### 3. Documentation (Mintlify)
- Set up Mintlify configuration (mint.json)
- Create docs structure: getting-started, concepts, api-reference, examples
- Write clear, example-rich documentation
- Add code snippets that actually work
- Include troubleshooting guide

### 4. Publishing Infrastructure
- Set up changesets (@changesets/cli)
- Create GitHub Actions workflow for:
  - Running tests on PR
  - Publishing to npm on release
  - Deploying Mintlify docs
- Configure package.json for npm publishing
- Add CHANGELOG.md

### 5. Polish & DX
- Improve error messages
- Add helpful CLI output
- Create project templates
- Write CONTRIBUTING.md
- Add LICENSE file

## Working Guidelines

1. **One Task at a Time**: Pick the highest priority incomplete task and finish it before moving on.

2. **Test Everything**: Write tests as you implement. Don't move on until tests pass.

3. **Document as You Go**: Update docs when you add/change APIs.

4. **Commit Atomically**: Make small, focused commits with descriptive messages.

5. **Check Your Work**: After implementing something, verify it works:
   - Run `bun test` for unit tests
   - Run `bun run typecheck` for type errors
   - Test CLI commands manually if needed

6. **Read Before Writing**: Always read existing code before modifying it.

7. **Follow Patterns**: Match the existing code style and patterns.

## What to Do Now

1. First, assess the current state:
   - What's implemented vs stubbed?
   - What tests exist and are they passing?
   - What's the most critical missing piece?

2. Then pick ONE specific task and complete it fully.

3. Commit your changes with a clear message.

4. Report what you accomplished and what should be done next.

## Quality Checklist

Before considering any task complete:
- [ ] Code compiles without errors
- [ ] Tests pass
- [ ] TypeScript types are correct (no `any` in public API)
- [ ] Code is documented with JSDoc
- [ ] Changes are committed

Remember: Ship quality code. It's better to do one thing well than many things poorly.
