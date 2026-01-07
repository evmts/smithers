---
title: Nested Claude Execution
description: Tool-mediated execution for plans inside Claude nodes
---

# Nested Claude Execution Model

## Overview

When a `<Claude>` component contains JSX children (a "plan"), the execution model changes from direct execution to a **tool-mediated execution** where Claude controls which nodes to execute.

This enables Claude to make intelligent decisions about:
- Which parts of a plan to execute
- The order of execution
- Whether to skip certain nodes based on context
- When to stop execution early

## Architecture

### Content Types Within `<Claude>`

A `<Claude>` component can contain two types of content:

1. **Prompt (text nodes)**: Plain text instructions that become Claude's prompt
2. **Plan (JSX elements)**: Nested components that form an execution plan

```tsx
<Claude allowedTools={['Read', 'Edit']} onFinished={setResult}>
  {/* This is the PROMPT - plain text */}
  Review the codebase and fix any issues you find.

  {/* This is the PLAN - JSX elements */}
  <Phase name="analysis">
    <Claude onFinished={setAnalysis}>
      Analyze the codebase structure
    </Claude>
  </Phase>
  <Phase name="fixes">
    <Claude onFinished={setFixes}>
      Apply fixes based on analysis: {analysis}
    </Claude>
  </Phase>
</Claude>
```

### Execution Flow

When a `<Claude>` node has JSX children:

1. **Separation**: Text content becomes the prompt, JSX becomes the plan
2. **Serialization**: The plan is serialized to XML
3. **System Prompt**: Claude receives instructions about the plan and the `render_node` tool
4. **Tool-Mediated Execution**: Claude calls `render_node` to execute specific nodes
5. **Results Flow Back**: Executed node results are returned to Claude
6. **Completion**: Claude decides when the plan is complete

### The `render_node` Tool

Claude is given a tool to execute individual nodes from the plan:

```typescript
{
  name: "render_node",
  description: "Execute a specific node from the plan by its path",
  input_schema: {
    type: "object",
    properties: {
      node_path: {
        type: "string",
        description: "The path to the node in the plan (e.g., 'phase[0]/claude[0]')"
      }
    },
    required: ["node_path"]
  }
}
```

### System Prompt Injection

When Claude has a plan, we inject additional context into its system prompt:

```
You have a plan to execute. The plan is shown below in XML format.

You can execute individual nodes from this plan using the render_node tool.
Each executable node (like <claude>) can be triggered by providing its path.

When you call render_node, the node will be executed and its result returned to you.
You can use this to:
- Execute nodes in any order you choose
- Skip nodes that aren't needed
- Make decisions based on previous node results
- Stop early if the goal is achieved

Plan:
<plan>
  <phase name="analysis">
    <claude path="phase[0]/claude[0]">
      Analyze the codebase structure
    </claude>
  </phase>
  <phase name="fixes">
    <claude path="phase[1]/claude[0]">
      Apply fixes based on analysis
    </claude>
  </phase>
</plan>
```

## Top-Level Ralph Execution

The Ralph loop also adopts this model at the top level:

1. **Render**: Render the JSX tree to get the plan
2. **Check for Prompt**: If there's a top-level prompt (text content at root), show it to Claude
3. **Plan + Prompt**: Claude sees the serialized plan and any prompt
4. **Decision Making**: Claude decides whether to execute nodes or respond directly
5. **Tool Execution**: When Claude calls `render_node`, that node executes
6. **State Changes**: Node callbacks can trigger re-renders
7. **Loop Continues**: Ralph continues until no more pending work

## Examples

### Simple Nested Execution

```tsx
function CodeReviewer() {
  const [analysis, setAnalysis] = useState(null)
  const [result, setResult] = useState(null)

  return (
    <Claude
      allowedTools={['Read', 'Grep']}
      onFinished={setResult}
    >
      Review this codebase for security issues.

      <Claude onFinished={setAnalysis}>
        First, analyze the file structure and identify sensitive files.
      </Claude>

      {analysis && (
        <Claude onFinished={setResult}>
          Based on: {JSON.stringify(analysis)}
          Now check each sensitive file for vulnerabilities.
        </Claude>
      )}
    </Claude>
  )
}
```

**Execution Flow:**
1. Outer Claude receives prompt + plan
2. Outer Claude sees the first inner `<Claude>` is ready
3. Outer Claude calls `render_node` on it
4. Inner Claude executes, calls `setAnalysis`
5. State change triggers re-render
6. New plan shows second `<Claude>` (conditional now renders)
7. Outer Claude calls `render_node` on second inner Claude
8. Final result flows to `setResult`

### Multi-Phase with Conditional Execution

```tsx
function SmartRefactorer() {
  const [issues, setIssues] = useState([])
  const [fixed, setFixed] = useState([])

  return (
    <Claude allowedTools={['Read', 'Edit']} onFinished={console.log}>
      Refactor this codebase. Only fix critical issues.

      <Phase name="scan">
        <Claude onFinished={(data) => setIssues(data.issues)}>
          Scan for all code quality issues. Return JSON with issues array.
        </Claude>
      </Phase>

      {issues.filter(i => i.severity === 'critical').map((issue, idx) => (
        <Phase key={issue.id} name={`fix-${issue.id}`}>
          <Claude onFinished={(result) => setFixed(f => [...f, result])}>
            Fix this critical issue: {JSON.stringify(issue)}
          </Claude>
        </Phase>
      ))}

      {fixed.length > 0 && <Stop reason="All critical issues fixed" />}
    </Claude>
  )
}
```

**Execution Flow:**
1. Outer Claude receives prompt about refactoring
2. Claude sees scan phase, executes it via `render_node`
3. Scan completes, issues are set, re-render happens
4. Claude now sees fix phases for critical issues only
5. Claude can choose to fix some or all, in any order
6. When `<Stop>` renders, execution halts

## API Reference

### Nested Execution Detection

Nested execution is automatically enabled when a `<Claude>` component has JSX children (not just text). The executor detects this using the `hasPlan()` function and automatically:

1. Separates prompt text from JSX plan nodes
2. Generates unique paths for each node
3. Adds the `render_node` tool to Claude's available tools
4. Includes plan XML in the system prompt

No additional props are needed - this is enabled transparently when your component has JSX children.

### Types

```typescript
/**
 * Result from executing a node via render_node tool
 */
interface RenderNodeResult {
  success: boolean
  result?: unknown
  error?: string
  node_type: string
  node_path: string
}
```

The `render_node` tool accepts a single parameter:
- `node_path` (string): The hierarchical path to the node (e.g., "phase[0]/claude[1]")

## Implementation Considerations

### Separating Prompt from Plan

```typescript
function separatePromptAndPlan(node: SmithersNode): {
  prompt: string
  plan: SmithersNode[]
} {
  const prompt: string[] = []
  const plan: SmithersNode[] = []

  for (const child of node.children) {
    if (child.type === 'TEXT') {
      prompt.push(child.props.value as string)
    } else {
      plan.push(child)
    }
  }

  return {
    prompt: prompt.join('').trim(),
    plan
  }
}
```

### Node Path Generation

Each node in the plan gets a unique path for identification. Paths are indexed **per type**, not globally:

```typescript
function generateNodePaths(nodes: SmithersNode[], prefix = ''): Map<string, SmithersNode> {
  const paths = new Map<string, SmithersNode>()

  // Group nodes by type to generate correct indices
  const typeIndices = new Map<string, number>()

  for (const node of nodes) {
    // Get the current index for this type
    const typeIndex = typeIndices.get(node.type) ?? 0
    typeIndices.set(node.type, typeIndex + 1)

    // Build the path
    const path = prefix
      ? `${prefix}/${node.type}[${typeIndex}]`
      : `${node.type}[${typeIndex}]`

    paths.set(path, node)

    // Recurse for children (excluding TEXT nodes)
    const childNodes = node.children.filter((c) => c.type !== 'TEXT')
    if (childNodes.length > 0) {
      const childPaths = generateNodePaths(childNodes, path)
      childPaths.forEach((n, p) => paths.set(p, n))
    }
  }

  return paths
}
```

**Example:** If you have `<phase><claude/><step/><claude/></phase>`, the paths are:
- `phase[0]` - the phase
- `phase[0]/claude[0]` - first claude
- `phase[0]/step[0]` - the step
- `phase[0]/claude[1]` - second claude (indexed per type, not globally)

### Plan Serialization with Paths

The serialize function is enhanced to include path attributes:

```typescript
function serializePlanWithPaths(nodes: SmithersNode[]): string {
  // Returns XML like:
  // <phase name="analysis" path="phase[0]">
  //   <claude path="phase[0]/claude[0]">...</claude>
  // </phase>
}
```

## Testing Strategy

1. **Unit Tests**: Test prompt/plan separation
2. **Unit Tests**: Test path generation
3. **Integration Tests**: Test render_node tool execution
4. **E2E Tests**: Test full nested execution flow with state changes
