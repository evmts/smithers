# Smithers - Product Specification

> **Note:** This project is being renamed from "Plue" to "Smithers". All references to "plue" should be updated to "smithers".

## Overview

Smithers is a React-based framework for authoring composable, reusable AI agent prompts. It uses JSX/MDX to define prompts that render to XML plans, executed via a "Ralph Wiggum" loop (repeated agent invocations on the same plan until completion).

## Core Concepts

- **MDX entry point**: Markdown files that can import JSX components
- **JSX renders to XML**: Components like `<Claude>`, `<Phase>`, `<Step>` produce XML plans
- **React state**: Standard React state management drives dynamic plan updates
- **`<Claude>` component**: Wraps Claude Code SDK, props pass through
- **Tools as MCP servers**: Tools passed as props auto-connect as MCP servers
- **Terraform UX**: Show plan, prompt for approval/edit, then execute

## Technical Requirements

### Runtime & Build
- **Runtime**: Bun
- **Provider**: Claude (via Claude Code SDK)
- **Testing**: Bun test / Vitest
- **TypeScript**: Strict mode

### Documentation
- **Platform**: Mintlify
- **Structure**:
  - Getting started guide
  - Core concepts explanation
  - Component API reference
  - Examples gallery
  - Contributing guide

### Publishing & Releases
- **Package Manager**: npm
- **Versioning**: Changesets (`@changesets/cli`)
- **CI/CD**: GitHub Actions
  - Run tests on PR
  - Publish to npm on release
  - Deploy docs on merge to main
- **Release Process**:
  1. Contributors add changesets for their PRs
  2. Changesets bot opens "Version Packages" PR
  3. Merging triggers npm publish

### Quality Standards
- **Test Coverage**: All public APIs must have tests
- **E2E Tests**: Evals for each major feature
- **Type Safety**: No `any` types in public API
- **Documentation**: All exports must have JSDoc comments

## Components

### Core Components
| Component | Purpose |
|-----------|---------|
| `<Claude>` | Wraps Claude Code SDK, main execution unit |
| `<Subagent>` | Parallel execution boundary |
| `<Phase>` | Defines a phase in multi-phase plans |
| `<Step>` | Defines a step within a phase |
| `<Task>` | Trackable task with `done` prop for completion state |
| `<Stop>` | Signals the Ralph loop to stop after current agents complete |

### Semantic Components
| Component | Purpose |
|-----------|---------|
| `<Persona>` | Define agent personality/role |
| `<Constraints>` | Define behavioral constraints |
| `<OutputFormat>` | Specify expected output structure |

## CLI Commands

```
plue run <file>     Run an agent with plan approval
plue plan <file>    Show the XML plan without executing
plue init           Initialize a new agent project
```

## Examples

| Example | Demonstrates |
|---------|-------------|
| Hello World | Basic `<Claude>` usage |
| Code Review | Tools via MCP, structured output |
| Multi-Phase Research | `<Phase>`, state transitions, replanning |
| Multi-Agent | Nested `<Claude>`, agent coordination |
| Reusable Components | `<Persona>`, `<Constraints>`, composition |

## Out of Scope (MVP)

- Other LLM providers (OpenAI, Gemini, etc.)
- Web UI / Dashboard
- Cloud hosting / SaaS
- Visual plan editor

## Success Criteria

1. **Feature Complete**: All components render correctly to XML
2. **Well Tested**: Comprehensive test suite with >80% coverage
3. **Well Documented**: Mintlify docs cover all APIs and patterns
4. **Published**: Available on npm with proper versioning
5. **CI/CD**: Automated testing and publishing pipeline
