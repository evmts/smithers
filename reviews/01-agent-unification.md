# Option 1: Unify Agent Hooks & Components

**Priority: HIGH** | **Effort: L (1-2 days)** | **Impact: HIGH**

## Problem

`useClaude`, `useAmp`, and `useCodex` are ~350-450 LOC each and share **90%+ identical code**:

```
┌─────────────────────────────────────────────────────────────────┐
│ SHARED (~90%)                                                   │
├─────────────────────────────────────────────────────────────────┤
│ • DB row mapping → status/result/error                          │
│ • Task lifecycle (db.tasks.start/complete)                      │
│ • Log writer setup (LogWriter, uuid, filename)                  │
│ • Middleware stack composition                                  │
│ • Execution gating (executionEnabled && executionScope.enabled) │
│ • Tail log parsing + throttled updates                          │
│ • Agent reporting (db.agents.start/complete/fail)               │
│ • VCS report generation                                         │
│ • Error handling and cleanup                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Only ~10% differs:**
- CLI executor function
- Option builder (model vs mode, CLI-specific flags)
- Prompt extraction (Claude has MCP config extraction)
- Stream parser (Claude/Amp have typed streaming; Codex doesn't)
- Default model/mode values

## Current State

| File | LOC | Unique Logic |
|------|-----|--------------|
| `useClaude.ts` | ~460 | MCP config, typed streaming, schema |
| `useAmp.ts` | ~430 | mode instead of model |
| `useCodex.ts` | ~360 | OpenAI-specific flags (sandbox, fullAuto) |
| **Total** | **~1250** | ~150 LOC actually unique |

## Proposed Solution

### A. Create `useAgentRunner<TProps, TOptions>(props, adapter)`

```typescript
// src/hooks/useAgentRunner.ts
interface AgentAdapter<TProps, TOptions> {
  name: 'claude' | 'amp' | 'codex'
  
  // What shows in DB
  getAgentLabel(options: TOptions): string  // "sonnet", "amp-smart", "o4-mini"
  
  // Build CLI options from props
  buildOptions(props: TProps, ctx: { prompt: string, cwd?: string }): TOptions
  
  // Extract prompt from children (Claude adds MCP tool instructions)
  extractPrompt(childrenString: string, props: TProps): string
  
  // Execute the CLI
  execute(options: TOptions, handlers: { onProgress: (chunk: string) => void }): Promise<AgentResult>
  
  // Parsers
  createMessageParser(maxEntries: number): MessageParser
  createStreamParser?(): StreamParser  // Optional for typed streaming
  
  // Streaming config
  supportsTypedStreaming?(props: TProps): boolean
}
```

### B. Thin Agent Wrappers

```typescript
// src/hooks/useClaude.ts - becomes ~50 LOC
import { useAgentRunner } from './useAgentRunner.js'
import { ClaudeAdapter } from './adapters/claude.js'

export function useClaude(props: ClaudeProps) {
  return useAgentRunner(props, ClaudeAdapter)
}
```

### C. Unified Component

```typescript
// src/components/Agent.tsx - shared rendering
function Agent<TProps>(props: TProps & { adapter: AgentAdapter }) {
  const result = useAgentRunner(props, props.adapter)
  return <agent-output kind={props.adapter.name} {...result} />
}

// Thin wrappers for backwards compat
export function Claude(props: ClaudeProps) {
  return <Agent {...props} adapter={ClaudeAdapter} />
}
```

## Public API: No Changes

**This is a purely internal refactor.** External API remains identical:

```typescript
// Users still import and use exactly as before:
import { Claude, Amp, Codex, useClaude, useAmp, useCodex } from 'smithers-orchestrator'

<Claude model="sonnet">Fix the bug</Claude>
<Amp mode="smart">Implement feature</Amp>
<Codex model="o4-mini">Write tests</Codex>

// Hook usage unchanged:
const { status, result, error } = useClaude(props)
```

**What changes:**
- Internal implementation only
- `useAgentRunner` is not exported
- Adapter types are internal

## Benefits

1. **~900 LOC reduction** (1250 → ~350 shared + 150 adapters)
2. **Single place for bug fixes** - fix tail log throttling once
3. **Easy to add new agents** - just write ~50 LOC adapter
4. **Consistent behavior** - all agents share same lifecycle
5. **Zero breaking changes** - public API untouched

## Implementation Steps

1. Extract shared utilities:
   - `useAgentDbRow(agentIdRef)` → returns `{status, result, error}`
   - `useTailLogThrottle()` → handles throttled updates
   - `buildMiddlewareStack()` → compose middlewares

2. Create `useAgentRunner` with full shared logic

3. Migrate `useCodex` first (simplest - no typed streaming)

4. Migrate `useAmp` (add stream parser adapter)

5. Migrate `useClaude` (add MCP extraction + typed streaming)

6. Unify component rendering

## Risks & Mitigations

| Risk | Mitigation |
|------|------------|
| Breaking subtle differences | Keep adapter hooks explicit, test each agent |
| MCP extraction breaks | Unit test `extractPrompt` separately |
| Stream parsing diverges | Test stream parser output equivalence |

## Decision

- [ ] **Accept** - Unify agents into shared runner + adapters
- [ ] **Defer** - Keep separate hooks but share utilities
- [ ] **Reject** - Keep current structure
