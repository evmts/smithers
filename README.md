# Smithers

[![npm version](https://img.shields.io/npm/v/smithers-orchestrator.svg)](https://www.npmjs.com/package/smithers-orchestrator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Let your agent write agents.**

```tsx
#!/usr/bin/env bun
import { createSmithersRoot, createSmithersDB, SmithersProvider, Claude } from "smithers-orchestrator";

const db = createSmithersDB({ path: ".smithers/demo" });
const executionId = db.execution.start("Demo", "demo.tsx");

function Demo() {
  return (
    <SmithersProvider db={db} executionId={executionId} maxIterations={5}>
      <Claude model="sonnet" onFinished={(r) => console.log(r.output)}>
        Fix the failing tests in this repository.
      </Claude>
    </SmithersProvider>
  );
}

const root = createSmithersRoot();
await root.mount(Demo);
await db.close();
```

Run it:

```bash
bun demo.tsx
```

Smithers is a JSX framework for coding agents. Write the plan in any coding harness, then monitor your agents as they execute it. The plan evolves reactively based on agent output.

---

## Core Idea

You program the **plan**, not the agents.

| Other Frameworks | Smithers |
|------------------|----------|
| `agent.do_step_1()` | `<Phase name="implement">` |
| `agent.do_step_2()` | `<Step name="code">` |
| `if failed: retry()` | `<Claude>Fix it</Claude>` |

The plan is declarative. Like Terraform, not AWS CDK. Plans evolve in an easy-to-understand declarative way over time, and if the plan breaks for any reason, your monitoring agent can edit the code and restart.

Each iteration:
1. Render JSX → execution plan
2. Execute runnable agents
3. Agent output updates state
4. State change triggers re-render
5. Loop until done

---

## Why React?

LLMs are trained on XML. The nested tagged structure matches how they think. LLMs are also great at writing React. Claude generates valid Smithers workflows naturally.

React has a rich ecosystem that works well with agents: Zustand, React Query, and reactive versions of most libraries plug directly into React's reactivity system. This lets you compose declarative plans from battle-tested primitives.

React gives you:
- Composition and reuse
- Version control diffs that make sense
- Agent-generated code you can review

---

## Quick Examples

### Sequential Phases

```tsx
<SmithersProvider db={db} executionId={executionId} maxIterations={10}>
  <Phase name="implement">
    <Step name="code">
      <Claude>Implement the feature</Claude>
    </Step>
    <Step name="test">
      <Claude>Write tests</Claude>
    </Step>
  </Phase>
  <Phase name="review">
    <Claude>Review the changes</Claude>
  </Phase>
</SmithersProvider>
```

### Parallel Agents

```tsx
<Parallel>
  <Claude>Fix auth</Claude>
  <Claude>Fix database</Claude>
  <Claude>Fix API</Claude>
</Parallel>
```

### Structured Output

```tsx
const ReviewSchema = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()),
});

<Claude schema={ReviewSchema}>
  Review the PR.
</Claude>
// result.structured: { approved: boolean, issues: string[] }
```

### Worktree Isolation

```tsx
<Worktree branch="feature-auth" cleanup>
  <Claude>Implement authentication</Claude>
</Worktree>
```

---

## Persistence

State lives in SQLite. Survives restarts.

```tsx
// Set state
db.state.set("phase", "review");

// Get state
const phase = db.state.get("phase");

// Resume after crash
const incomplete = db.execution.findIncomplete();
if (incomplete) {
  executionId = incomplete.id;
}
```

---

## Observability

The JSX is the observability. What you write is what gets logged.

```tsx
<Phase name="deploy">
  <Step name="build" status="complete">...</Step>
  <Step name="test" status="running">...</Step>
</Phase>
```

SQLite stores every frame. Use JJ or git to rewind.

---

## Install

```bash
bun add smithers-orchestrator
```

Or install the Claude Code plugin:

```
/plugin add evmts/smithers
```

---

## Roadmap

**North Star: SuperSmithers**: A meta-agent that watches your agents and rewrites their code to optimize. The architecture supports it. Not yet implemented.

---

## More

- [Documentation](https://smithers.sh)
- [Examples](./examples)
- [Contributing](./CONTRIBUTING.md)

**Let your agent write agents. Built with React, powered by Claude.**
