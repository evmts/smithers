# Amp Component

The `<Amp />` component executes tasks using the [Amp CLI](https://ampcode.com/manual) - Sourcegraph's frontier coding agent.

## Overview

Amp is a powerful AI coding agent that supports multiple models (Claude Opus 4.5, GPT-5.2, etc.), thread management, and MCP integration. The `<Amp />` component wraps the Amp CLI for use within Smithers orchestrations.

## Basic Usage

```tsx
import { Amp } from 'smithers-orchestrator/components'

<Amp>
  Fix the bug in src/utils.ts
</Amp>
```

## Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `mode` | `'smart' \| 'rush'` | `'smart'` | Agent mode - smart uses SOTA models, rush is faster/cheaper |
| `maxTurns` | `number` | - | Maximum agentic loop turns |
| `systemPrompt` | `string` | - | Custom system prompt |
| `permissionMode` | `'default' \| 'acceptEdits' \| 'bypassPermissions'` | `'default'` | Permission handling mode |
| `timeout` | `number` | - | Timeout in milliseconds |
| `cwd` | `string` | - | Working directory |
| `continueThread` | `boolean` | `false` | Continue from previous thread |
| `resumeThread` | `string` | - | Resume a specific thread ID |
| `labels` | `string[]` | - | Labels to attach to the thread |
| `onFinished` | `(result: AgentResult) => void` | - | Called on successful completion |
| `onError` | `(error: Error) => void` | - | Called on error |
| `onProgress` | `(message: string) => void` | - | Progress callback |
| `onToolCall` | `(tool: string, input: any) => void` | - | Called when agent uses a tool |
| `reportingEnabled` | `boolean` | `true` | Enable database reporting |
| `validate` | `(result: AgentResult) => boolean \| Promise<boolean>` | - | Result validation function |
| `maxRetries` | `number` | `3` | Maximum retry attempts on failure |

## Examples

### Execute Mode

```tsx
<Amp mode="rush">
  List all markdown files in this directory
</Amp>
```

### With Callbacks

```tsx
<Amp
  onFinished={(result) => console.log('Done:', result.output)}
  onError={(err) => console.error('Failed:', err)}
>
  Implement the user authentication feature
</Amp>
```

### Bypass Permissions

```tsx
<Amp permissionMode="bypassPermissions">
  Refactor the entire codebase to use TypeScript
</Amp>
```

### With Labels

```tsx
<Amp labels={['migration', 'database']}>
  Migrate the database schema
</Amp>
```

## CLI Mapping

The component maps to `amp` CLI commands:

| Prop | CLI Flag |
|------|----------|
| `mode` | `--mode` / `-m` |
| `maxTurns` | `--max-turns` |
| `systemPrompt` | `--system-prompt` |
| `permissionMode: 'bypassPermissions'` | `--dangerously-allow-all` |
| `labels` | `--label` / `-l` (can be repeated) |
| `continueThread` | `threads continue --last` |
| `resumeThread` | `threads continue --thread-id <threadId>` |

## Differences from Claude Component

| Feature | `<Claude />` | `<Amp />` |
|---------|--------------|-----------|
| CLI | `claude` | `amp` |
| Models | Claude models | Multi-model (Claude, GPT-5.2) |
| Threads | Session-based | Thread-based with sharing |
| Mode | Model selection | `smart` / `rush` modes |

## Thread Management

Amp threads can be continued or resumed:

```tsx
// Continue last thread
<Amp continueThread>
  Now add the tests
</Amp>

// Resume specific thread
<Amp resumeThread="T-abc123">
  Fix the issues found in review
</Amp>
```
