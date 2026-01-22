---
title: Introduction
description: Ralph the plan, not the agent
---

# Smithers

**Ralph the plan, not the agent.**

Smithers is a "plan as code" framework for AI agents. Write sophisticated plans as React components that spawn and control agents, with SQLite persistence for crash recovery.

## Install

```bash
bun add -g smithers-orchestrator
```

<Note>
If `smithers` is not found, add `~/.bun/bin` to your PATH.
</Note>

## Your First Workflow

```tsx
#!/usr/bin/env smithers
import {
  createSmithersRoot,
  createSmithersDB,
  SmithersProvider,
  Ralph,
  Claude,
} from "smithers-orchestrator";

const db = createSmithersDB({ path: ".smithers/coverage.db" });
const executionId = db.execution.start("CoverageLoop", "coverage.tsx");

const root = createSmithersRoot();
await root.mount(
  <SmithersProvider db={db} executionId={executionId}>
    <Ralph
      id="coverage-loop"
      condition={async () => (await getCoverage()) < 80} // getCoverage: user-defined function
      maxIterations={20}
    >
      <Claude>Add tests to increase coverage to 80%.</Claude>
    </Ralph>
  </SmithersProvider>
);
db.close();
```

Run it:

```bash
smithers coverage.tsx
```

Smithers is a React framework for coding agents. Write the plan in any coding harness, then monitor your agents as they execute it. The plan is a mix of hardcoded logic and agent output that evolves reactively.

By evolving a declarative plan rather than wiring up every agent interaction, Smithers excels at:

1. **One-time agents** that accomplish a task and discard
2. **Long-running agents** that run for days or weeks

**Build things like:**
- [Hello World](/examples/hello-world): Your first agent
- [Coverage Loop](/examples/coverage-loop): Run until tests pass
- [Multi-Phase Review](/examples/multi-phase-review): Implement, test, review
- [Subagent Workflow](/examples/subagent-workflow): Agents spawning agents
- [MCP Database Access](/examples/mcp-database): Connect to external tools

---

## Quick Examples

### Sequential Phases

```tsx
import { SmithersProvider, Ralph, Phase, Step, Claude } from "smithers-orchestrator";

<SmithersProvider db={db} executionId={executionId}>
  <Ralph id="workflow" condition={() => phase !== 'done'} maxIterations={10}>
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
  </Ralph>
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

<Claude schema={ReviewSchema}>Review the PR.</Claude>;
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

The React tree is the observability. What you write is what gets logged.

```tsx
<Phase name="deploy">
  <Step name="build" status="completed">
    ...
  </Step>
  <Step name="test" status="running">
    ...
  </Step>
</Phase>
```

SQLite stores every frame. Use version control to rewind.

---

## Core Idea

| Other Frameworks     | Smithers                   |
| -------------------- | -------------------------- |
| `agent.do_step_1()`  | `<Phase name="implement">` |
| `agent.do_step_2()`  | `<Step name="code">`       |
| `if failed: retry()` | `<Claude>Fix it</Claude>`  |

The [Ralph loop](https://ghuntley.com/ralph/) renders → executes → persists → re-renders until done. SQLite stores state; React handles diffing. See [concepts](/concepts/ralph-wiggum-loop).

---

## Why React?

React: composition, diffing, version control diffs that make sense, LLM-friendly.

---

<Tip>
**React Hook Compatibility**: [TanStack AI](https://tanstack.com/ai/latest/docs) and [Vercel AI SDK](https://ai-sdk.dev/docs) React hooks may work in Smithers components.

**Note:** Compatibility with Smithers' custom React reconciler is not fully verified. Test thoroughly before production use.

```tsx
import { If, Claude } from "smithers-orchestrator";
import { useChat } from "ai/react";

function MyAgent() {
  const { messages, isLoading } = useChat();
  return (
    <If condition={!isLoading}>
      <Claude>
        {messages.map((m) =>
          m.parts.map((p) => p.type === "text" && p.content),
        )}
      </Claude>
    </If>
  );
}
```

</Tip>

---

## Roadmap

**North Star: SuperSmithers**: A meta-agent that watches your agents and rewrites their code to optimize. The architecture is ready. Coming soon.

---

<CardGroup cols={2}>
  <Card title="Quick Start" icon="rocket" href="/quickstart">
    Your first workflow
  </Card>
  <Card title="Components" icon="cube" href="/components/claude">
    API reference
  </Card>
  <Card title="Examples" icon="code" href="/examples/hello-world">
    Production workflows
  </Card>
  <Card title="Concepts" icon="lightbulb" href="/concepts/ralph-wiggum-loop">
    How it works
  </Card>
</CardGroup>
