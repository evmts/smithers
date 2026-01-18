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

## If Execution is Expected

Need integration points:

### Stop Component

```tsx
// SmithersProvider should scan tree
useEffect(() => {
  const tree = getCurrentTreeXML()
  if (tree.includes('<smithers-stop')) {
    requestStop()
  }
}, [treeVersion])
```

### Human Component

```tsx
// Human.tsx should register blocking task
useMount(() => {
  const taskId = db.tasks.start('human', props.question)
  // Task completes when db.human.resolve() is called
})
```

### Persona/Constraints

```tsx
// Prompt builder extracts from tree
const buildPrompt = (tree: SmithersNode) => {
  const persona = findNode(tree, 'persona')?.children[0]?.text
  const constraints = findNodes(tree, 'constraint').map(n => n.text)

  return `${persona}\n\nConstraints:\n${constraints.join('\n')}\n\n${mainPrompt}`
}
```

### MCP Tool

```tsx
// MCP component routes to server
useMount(async () => {
  const result = await mcpClient.callTool(props.server, props.tool, props.args)
  setOutput(result)
})
```

## Recommendation

1. Document current state (which components execute vs. visualize)
2. Prioritize based on need:
   - **High:** Human (needed for human-in-the-loop)
   - **High:** Stop (needed for abort flows)
   - **Medium:** Persona/Constraints (prompt enhancement)
   - **Medium:** MCP (tool integration)
   - **Low:** Task/Subagent (may be visualization-only)
