# Concepts

## MDX Entry Points

Plue agents are MDX files—Markdown with JSX support. The entry point is always an `.mdx` file:

```mdx
import { Claude, Phase } from 'plue'

# Research Agent

<Phase name="gather">
  <Claude>Search for relevant papers on the topic.</Claude>
</Phase>
```

MDX lets you mix prose with components naturally.

## JSX Renders to XML

When you write JSX components, Plue renders them to XML. This XML becomes the "plan" sent to Claude:

```tsx
<Claude>
  <Phase name="analyze">
    <Step>Read the code</Step>
    <Step>Identify issues</Step>
  </Phase>
</Claude>
```

Renders to:

```xml
<claude>
  <phase name="analyze">
    <step>Read the code</step>
    <step>Identify issues</step>
  </phase>
</claude>
```

## React State

Plue uses real React. State management works exactly as you'd expect:

```tsx
function MyAgent() {
  const [findings, setFindings] = useState(null)

  return (
    <Claude onFinished={setFindings}>
      {findings
        ? <Phase name="report">Summarize: {findings}</Phase>
        : <Phase name="research">Find relevant information.</Phase>
      }
    </Claude>
  )
}
```

State changes trigger re-renders, producing new plans.

## The Ralph Wiggum Loop

Execution follows the "Ralph Wiggum" technique: the agent runs repeatedly on the current plan until the task is complete.

Each iteration ("frame"):
1. Render current JSX to XML plan
2. Send plan to Claude
3. Claude executes and returns output
4. `onFinished` callback updates state
5. If state changed, re-render and loop

This simple loop handles complex multi-step tasks through iterative refinement.

## Plans and Approval

Before execution, Plue shows the rendered XML plan (Terraform-style):

```
Plan:
<claude>
  <phase name="implement">
    <step>Write the function</step>
    <step>Add tests</step>
  </phase>
</claude>

Proceed? [y/n/edit]
```

Users can approve, edit, or cancel. Use `--auto-approve` to skip.

## Tools as MCP Servers

Tools passed to `<Claude>` automatically connect as MCP (Model Context Protocol) servers:

```tsx
<Claude tools={[fileSystem, webSearch]}>
  Research and save findings to a file.
</Claude>
```

No manual MCP configuration needed—Plue handles the wiring.
