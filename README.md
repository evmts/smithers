# Smithers

[![npm version](https://img.shields.io/npm/v/smithers-orchestrator.svg)](https://www.npmjs.com/package/smithers-orchestrator)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-1.0+-black.svg)](https://bun.sh/)

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

```bash
bun demo.tsx
```

Smithers is a JSX framework for coding agents. You write the plan; Claude executes it. The plan can evolve reactively based on agent output. Mix soft prompts with hard code.

![Demo](docs/images/01_taro_hello.gif)

---

## Install

```bash
bun add smithers-orchestrator
```

Or install as a Claude Code plugin:

```
/plugin add evmts/smithers
```

Then ask Claude to write workflows for you.

**Requirements:** [Bun](https://bun.sh/) 1.0+, [Claude Code](https://www.npmjs.com/package/@anthropic-ai/claude-code)

---

## Examples

### 1. Hello World

The simplest workflow—one agent, one task:

```tsx
<SmithersProvider db={db} executionId={executionId}>
  <Claude>Say hello</Claude>
</SmithersProvider>
```

### 2. Phases and Steps

Sequential execution with named stages:

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

### 3. Parallel Agents

Run multiple agents concurrently:

```tsx
<Parallel>
  <Claude>Fix the auth module</Claude>
  <Claude>Fix the database module</Claude>
  <Claude>Fix the API module</Claude>
</Parallel>
```

### 4. Reactive Plan Evolution

The plan changes based on agent output:

```tsx
function CIFixer() {
  const status = db.state.get("status") ?? "fixing";
  
  if (status === "done") return null;
  
  return (
    <Claude
      onFinished={(r) => {
        if (r.output.includes("All tests pass")) {
          db.state.set("status", "done");
        }
      }}
    >
      Run tests. If any fail, fix them.
    </Claude>
  );
}
```

### 5. Structured Output

Get typed responses with Zod schemas:

```tsx
const ReviewSchema = z.object({
  approved: z.boolean(),
  issues: z.array(z.string()),
});

<Claude schema={ReviewSchema}>
  Review the PR and list any issues.
</Claude>
// result.structured: { approved: boolean, issues: string[] }
```

### 6. Worktree Isolation

Run agents in isolated git worktrees:

```tsx
<Worktree branch="feature-auth" cleanup>
  <Claude>Implement authentication</Claude>
</Worktree>
```

### 7. Resume After Crash

State persists in SQLite. Resume where you left off:

```tsx
const incomplete = db.execution.findIncomplete();
if (incomplete) {
  executionId = incomplete.id;
} else {
  executionId = db.execution.start("My Workflow", "workflow.tsx");
}
```

---

## Core Concepts

### Program the Plan, Not the Agents

Other frameworks have you program what agents do. Smithers has you program the plan.

| Other Frameworks | Smithers |
|------------------|----------|
| `agent.do_step_1()` | `<Phase name="implement">` |
| `agent.do_step_2()` | `<Step name="code">` |
| `if failed: retry()` | `<Claude>Fix it</Claude>` |

The plan is declarative. Like Terraform, not AWS SDK.

### The Plan Evolves

Each iteration:
1. Render JSX → execution plan
2. Execute runnable agents
3. Agent output updates state
4. State change triggers re-render
5. New plan renders
6. Loop until done

Ralph is the event loop. React handles the diffing.

### Why JSX?

LLMs are trained on XML. The nested tagged structure matches how they think. Claude generates valid Smithers workflows naturally.

---

## API Reference

### SmithersProvider

Root component. Required.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `db` | `SmithersDB` | required | Database instance |
| `executionId` | `string` | required | Execution ID |
| `maxIterations` | `number` | `100` | Maximum loop iterations |
| `stopped` | `boolean` | `false` | Stop the loop |
| `onIteration` | `(i: number) => void` | - | Called each iteration |
| `onComplete` | `() => void` | - | Called when done |

### Claude

Execute Claude with tool access.

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `model` | `"opus" \| "sonnet" \| "haiku"` | `"sonnet"` | Model to use |
| `maxTurns` | `number` | `∞` | Max agentic turns |
| `permissionMode` | `string` | - | `"acceptEdits"` auto-accepts |
| `schema` | `ZodSchema` | - | Structured output schema |
| `schemaRetries` | `number` | `1` | Retries on schema failure |
| `onFinished` | `(result) => void` | - | Called with result |

Children are the prompt.

### Phase

Sequential workflow stage. Only the active phase executes.

| Prop | Type | Description |
|------|------|-------------|
| `name` | `string` | Phase identifier |

### Step

Sequential task within a phase.

| Prop | Type | Description |
|------|------|-------------|
| `name` | `string` | Step identifier |
| `snapshotBefore` | `boolean` | Git snapshot before |
| `commitAfter` | `boolean` | Commit after |
| `commitMessage` | `string` | Commit message |

### Parallel

Run children concurrently.

```tsx
<Parallel>
  <Claude>Task 1</Claude>
  <Claude>Task 2</Claude>
</Parallel>
```

### Worktree

Isolate work in a git worktree.

| Prop | Type | Description |
|------|------|-------------|
| `branch` | `string` | Branch name |
| `cleanup` | `boolean` | Delete worktree after |

### Database API

```tsx
const db = createSmithersDB({ path: ".smithers/data" });

// State
db.state.set("key", "value");
db.state.get("key");
db.state.getHistory("key");

// Execution
db.execution.start("Name", "file.tsx");
db.execution.complete(id, { summary: "Done" });
db.execution.findIncomplete();

// Always close
db.close();
```

---

## CLI

```bash
smithers db executions              # List runs
smithers db state --execution-id X  # View state
smithers db stats                   # Statistics
```

---

## Production Workflows

### PR Finalize

```bash
bun examples/worktree-pr-finalize/index.tsx
```

Phases: StackCheck → Rebase → Review → Push → CI → Merge

### Stacked PR Merge

```bash
bun examples/stacked-pr-merge/index.tsx --status
```

Phases: Status → Order → Rebase → Cherry-pick

### Night Shift

```bash
bun examples/night-shift/index.tsx
```

Iterate until tests pass. Commit each fix.

---

## Safety

| Operation | Protection |
|-----------|------------|
| Force push | Worktree isolation |
| Rebase | `--skip-rebase` flag |
| PR close | `--no-close` flag |
| Merge | Requires CI pass |

All executions logged in SQLite.

---

## Observability

The JSX is the observability. What you write is what gets logged.

```tsx
<Phase name="deploy">
  <Step name="build" status="complete">...</Step>
  <Step name="test" status="running">...</Step>
</Phase>
```

SQLite stores every frame. Rewind with JJ or git.

---

## FAQ

**Is this React?**  
The component model, not the DOM. Smithers renders to execution.

**Why not YAML?**  
Composition, diffs, and agent generation.

**Do I need Bun?**  
Yes. Smithers uses `bun:sqlite` and `Bun.spawn`.

---

## Roadmap

**North Star: SuperSmithers** — A meta-agent that watches your agents and rewrites their code to optimize. The architecture supports it. Not yet implemented.

---

## Contributing

Include your prompt in a git note:

```bash
git notes add -m "User prompt: <your prompt>"
```

See [CONTRIBUTING.md](./CONTRIBUTING.md).

---

**Docs:** [smithers.sh](https://smithers.sh) | **GitHub:** [evmts/smithers](https://github.com/evmts/smithers)
