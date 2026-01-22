# Claude: maxTokens prop not wired to CLI

## Status
Resolved

## Description
The `maxTokens` prop was documented but not implemented. Since Claude CLI doesn't have a
native `--max-tokens` flag, this prop is now wired to create a `token_limit` stop condition
that monitors total token usage (input + output) and stops execution when the limit is exceeded.

## Resolution
- Added `maxTokens` to `CLIExecutionOptions` type
- Wired `maxTokens` prop through `ClaudeAdapter.buildOptions()`
- In `executeClaudeCLI()`, `maxTokens` creates a `token_limit` stop condition
- Updated docs to reflect working implementation
- Added tests for prop, adapter, and stop condition behavior

## Files
- docs/components/claude.mdx
- src/components/agents/types/execution.ts
- src/hooks/adapters/claude.ts
- src/components/agents/claude-cli/executor.ts
- src/components/Claude.test.tsx
- src/hooks/adapters/claude.test.ts
- src/components/agents/claude-cli/executor.test.ts

## Tasks
- [x] Wire maxTokens to CLI args (via stop condition)
