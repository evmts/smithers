## Scope: easy

# Plan-Only Markers Not Wired to Execution

**Severity:** P2 - Medium (if intentional phased development)
**Files:** Multiple component files
**Status:** Open / Tracking
**Last Audited:** 2026-01-18

## Overview

Most components serialize to plan XML but lack execution wiring. Status varies by component:

| Component | XML Tag | Infrastructure | Component Wired | Status |
|-----------|---------|----------------|-----------------|--------|
| MCP/Sqlite | `<mcp-tool ...>` | ✅ Full | ✅ Yes | **COMPLETE** |
| Stop | `<smithers-stop>` | ✅ Partial | ❌ No | Infra exists, needs wiring |
| Human | `<human>` | ✅ Partial | ❌ No | Infra exists, needs wiring |
| Persona | `<persona>` | ❌ None | ❌ No | Needs extraction |
| Constraints | `<constraints>` | ❌ None | ❌ No | Needs extraction |
| Task | `<task done=...>` | ❌ None | ❌ No | Visualization only |
| Subagent | `<subagent>` | ❌ None | ❌ No | Visualization only |

Only Claude/Smithers/MCP actually execute (make API calls, produce outputs).

## Current Flow

```
┌──────────────────────────────────────────────────────────────┐
│ Component renders → Serializes to XML → Plan captured       │
│                                                              │
│ ✅ WORKING:                                                  │
│ • <mcp-tool> extracted by Claude.tsx (line 136)             │
│ • MCP config generated & passed to CLI (lines 147-148)      │
│                                                              │
│ ❌ NOT WIRED (but infra exists):                            │
│ • <smithers-stop> → doesn't call requestStop()             │
│ • <human> → doesn't call db.human.request()                │
│                                                              │
│ ❌ NOT WIRED (no infra):                                    │
│ • <persona>/<constraints> not extracted by Claude.tsx       │
│ • <task>/<subagent> no execution logic                     │
└──────────────────────────────────────────────────────────────┘
```

## If Intentional (Phased Development)

This is fine - document which components are "plan visualization only" vs. "execution-capable".

## Implementation Guide

### MCP Tool ✅ COMPLETE

Already fully implemented in `/Users/williamcory/smithers/src/components/Claude.tsx`:
- Line 136: `extractMCPConfigs()` parses `<mcp-tool>` from children
- Lines 147-148: Generates config and writes MCP config file
- Line 182: Passes `mcpConfigPath` to Claude CLI executor

Pattern to reference: `/Users/williamcory/smithers/src/utils/mcp-config.ts`

### Stop Component - Easy Fix

**Files:** `/Users/williamcory/smithers/src/components/Stop.tsx`

Infrastructure exists (`requestStop()` in SmithersProvider line 400). Component needs wiring:

```tsx
// Stop.tsx should call requestStop on mount
export function Stop(props: StopProps): ReactNode {
  const { requestStop } = useSmithers()

  useMount(() => {
    requestStop(props.reason ?? 'Stop component rendered')
  })

  return (
    <smithers-stop reason={props.reason}>
      {props.children}
    </smithers-stop>
  )
}
```

**Note:** See `/Users/williamcory/smithers/reviews/stop-handling-starts-task.md` for related orchestration issue.

### Human Component - Easy Fix

**Files:** `/Users/williamcory/smithers/src/components/Human.tsx`

Infrastructure exists (`db.human`, `useHuman` hook). Component needs wiring:

```tsx
// Human.tsx should create DB request and block orchestration
export function Human(props: HumanProps): ReactNode {
  const { db } = useSmithers()
  const taskIdRef = useRef<string | null>(null)

  useMount(() => {
    // Register blocking task
    taskIdRef.current = db.tasks.start('human_interaction', props.message ?? 'Human input required')

    // Create human interaction request
    const requestId = db.human.request(
      'confirmation',
      props.message ?? 'Approve to continue',
      props.options
    )

    // Poll for resolution (or use reactive subscription)
    const checkInterval = setInterval(() => {
      const request = db.human.get(requestId)
      if (request && request.status !== 'pending') {
        clearInterval(checkInterval)

        // Complete task to unblock orchestration
        if (taskIdRef.current) {
          db.tasks.complete(taskIdRef.current)
        }

        // Fire callbacks
        if (request.status === 'approved') {
          props.onApprove?.()
        } else {
          props.onReject?.()
        }
      }
    }, 100)
  })

  return <human message={props.message}>{props.children}</human>
}
```

Better approach: Use reactive subscription like in `/Users/williamcory/smithers/src/hooks/useHuman.ts` (lines 54-76).

**Note:** See `/Users/williamcory/smithers/reviews/interactive-human-not-implemented.md` for advanced interactive sessions feature.

### Persona/Constraints - Moderate Effort

**Files:** `/Users/williamcory/smithers/src/components/Claude.tsx`

No infrastructure exists. Needs extraction similar to MCP pattern:

```tsx
// In Claude.tsx execution logic (around line 136)
const childrenString = String(props.children)

// Extract persona
const personaMatch = childrenString.match(/<persona[^>]*>([\s\S]*?)<\/persona>/)
const personaText = personaMatch ? personaMatch[1].trim() : null

// Extract constraints
const constraintMatches = [...childrenString.matchAll(/<constraints[^>]*>([\s\S]*?)<\/constraints>/g)]
const constraints = constraintMatches.map(m => m[1].trim())

// Build enhanced system prompt
let systemPrompt = props.systemPrompt ?? ''
if (personaText) {
  systemPrompt = `${personaText}\n\n${systemPrompt}`
}
if (constraints.length > 0) {
  systemPrompt += '\n\nConstraints:\n' + constraints.map(c => `- ${c}`).join('\n')
}

// Clean prompt (remove persona/constraints elements)
let cleanPrompt = childrenString
  .replace(/<persona[^>]*>[\s\S]*?<\/persona>/g, '')
  .replace(/<constraints[^>]*>[\s\S]*?<\/constraints>/g, '')
  .trim()
```

Add to `extractMCPConfigs()` in `/Users/williamcory/smithers/src/utils/mcp-config.ts` or create parallel `extractPromptModifiers()` function.

### Task/Subagent Components - Visualization Only

**Files:** `/Users/williamcory/smithers/src/components/Task.tsx`, `/Users/williamcory/smithers/src/components/Subagent.tsx`

These appear to be plan/visualization markers with no execution semantics. If execution is desired:

- `<task>` could integrate with `db.tasks` tracking system
- `<subagent>` could create execution boundaries or parallel execution groups

Current recommendation: **Leave as visualization-only** unless specific execution needs identified.

## Recommendation & Priority

### ✅ Completed
- **MCP/Sqlite** - Fully wired and tested (see `/Users/williamcory/smithers/evals/12-mcp-integration.test.tsx`)

### 🔴 High Priority
1. **Stop** - Easy fix, critical for graceful shutdown
   - Infra exists, just needs component wiring
   - 5-10 lines of code change
   - Files: `/Users/williamcory/smithers/src/components/Stop.tsx`

2. **Human** - Easy fix, critical for human-in-the-loop
   - Infra exists, needs component wiring
   - ~30 lines of code change (or use reactive subscription pattern)
   - Files: `/Users/williamcory/smithers/src/components/Human.tsx`
   - Related: Consider `/Users/williamcory/smithers/reviews/interactive-human-not-implemented.md` for future enhancement

### 🟡 Medium Priority
3. **Persona/Constraints** - Moderate effort, enhances prompt engineering
   - No infra, needs extraction + prompt building
   - ~50-80 lines of code
   - Files: `/Users/williamcory/smithers/src/components/Claude.tsx`, possibly new util file
   - Pattern: Similar to `extractMCPConfigs()` in `/Users/williamcory/smithers/src/utils/mcp-config.ts`

### ⚪ Low Priority
4. **Task/Subagent** - Visualization-only, unclear execution semantics
   - Consider leaving as-is unless specific use cases identified

## Codebase Context

### Key Infrastructure Files
- `/Users/williamcory/smithers/src/components/SmithersProvider.tsx` - Core context provider
  - Line 400: `requestStop()` implementation
  - Line 409: `requestRebase()` implementation
  - Line 418: `isStopRequested()` checker
- `/Users/williamcory/smithers/src/db/human.ts` - Human interaction DB module
  - Methods: `request()`, `resolve()`, `get()`, `listPending()`
- `/Users/williamcory/smithers/src/hooks/useHuman.ts` - Reactive human interaction hook
  - Lines 54-76: Reactive subscription pattern (reference for Human component)
- `/Users/williamcory/smithers/src/utils/mcp-config.ts` - MCP config extraction (working example)
  - Line 21: `extractMCPConfigs()` - pattern to follow for persona/constraints

### Patterns to Follow
1. **Component with side effects**: Use `useMount()` from `/Users/williamcory/smithers/src/reconciler/hooks`
2. **Task registration**: Call `db.tasks.start()` to block orchestration, `db.tasks.complete()` when done
3. **Reactive subscription**: Use `useQueryOne()` from `/Users/williamcory/smithers/src/reactive-sqlite/index.js`
4. **String extraction**: Regex-based parsing like in `extractMCPConfigs()` (line 26 in mcp-config.ts)

### Related Reviews
- `/Users/williamcory/smithers/reviews/stop-handling-starts-task.md` - Stop component orchestration issue
- `/Users/williamcory/smithers/reviews/interactive-human-not-implemented.md` - Advanced human interaction feature
