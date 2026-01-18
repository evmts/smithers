# Plan-Only Markers Not Wired to Execution

**Severity:** P2 - Medium (if intentional phased development)
**Files:** Multiple component files
**Status:** Open / Tracking

## Overview

These components serialize to plan XML but the execution engine does not interpret them:

| Component | XML Tag | Current State |
|-----------|---------|---------------|
| Stop | `<smithers-stop>` | Serializes only |
| Human | `<human>` | Serializes only |
| Task | `<task done=...>` | Serializes only |
| Subagent | `<subagent>` | Serializes only |
| Persona | `<persona>` | Serializes only |
| Constraints | `<constraints>` | Serializes only |
| MCP/Sqlite | `<mcp-tool ...>` | Serializes only |

Only Claude/Smithers actually execute (make API calls, produce outputs).

## Current Flow

```
┌─────────────────────────────────────────────────────────┐
│ Component renders → Serializes to XML → Plan captured   │
│                                                         │
│ BUT:                                                    │
│ • SmithersProvider doesn't scan for <smithers-stop>     │
│ • <human> doesn't block on db.human.resolve()           │
│ • <persona>/<constraints> not extracted by prompt       │
│   builders                                              │
│ • <mcp-tool> not routed to MCP server                   │
└─────────────────────────────────────────────────────────┘
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
