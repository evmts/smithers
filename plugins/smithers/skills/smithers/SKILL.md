---
name: smithers-orchestrator
description: Author Smithers (smithers-orchestrator) Bun/TSX JSX workflows for Claude Code: durable, resumable, observable orchestration with SQLite state (phases/steps), tool-scoped agents, optional parallelism, and workflow logs.
allowed-tools:
  - Read
  - Write
  - Edit
  - Bash
  - Glob
  - Grep
  - Task
user-invocable: true
recommend-plan-mode: true
---

# Smithers Orchestrator (smithers-orchestrator)

JSX workflow engine for Claude Code: **render → execute active nodes → persist to SQLite → rerender** until stable/stop. Durable by default when you store control-flow in `db.state` (SQLite), not React `useState`. `maxIterations` is mandatory for safety.

## Use when
- Multi-step repo automation (PR finalize, CI recovery, release smoke tests, refactors)
- Needs **resume** after interruption (power/network/tool failures)
- Needs **observability** (phases/steps/tools/agents logged + NDJSON streams)
- Needs constrained tool permissions per agent step

## Fast requirements (ask once, then write code)
- Goal + acceptance checks (tests pass? lint clean? diff reviewed?)
- Allowed tools per step (Read/Write/Edit/Bash/…)
- Stop limits: `maxIterations`, optional timeout + stop conditions
- Branching needs: retries, human checkpoint(s), optional phases (`skipIf`)

---

# Setup

## Claude Code plugin install (optional; for end-users running Smithers inside Claude Code)
```text
/plugin marketplace add evmts/smithers
/plugin install smithers@smithers
```

## Project install + TSX config (Bun)

```bash
bun add smithers-orchestrator
```

`bunfig.toml`

```toml
[dev]
jsx = "react"
```

`tsconfig.json`

```json
{
  "compilerOptions": {
    "jsx": "react-jsx",
    "jsxImportSource": "smithers-orchestrator"
  }
}
```

---

# Canonical workflow template (resumable, phases+steps)

Create `workflows/smithers-example.tsx`:

```tsx
#!/usr/bin/env bun
import {
  createSmithersDB,
  createSmithersRoot,
  SmithersProvider,
  Phase,
  Step,
  Claude,
} from "smithers-orchestrator";

const db = createSmithersDB({ path: ".smithers/smithers-example" });

// Resume if an execution is incomplete; otherwise start a new one.
const existing = db.execution.findIncomplete();
const executionId =
  existing?.id ??
  db.execution.start({
    name: "Smithers Example",
    script: "workflows/smithers-example.tsx",
  });

function Workflow() {
  return (
    <SmithersProvider
      db={db}
      executionId={executionId}
      maxIterations={25}
      globalTimeout={30 * 60 * 1000}
    >
      <Phase name="Plan">
        <Step name="scan">
          <Claude model="sonnet" allowedTools={["Read", "Glob", "Grep"]}>
            Inspect the repo and produce a short plan:
            - key files
            - risks
            - commands to run
          </Claude>
        </Step>
      </Phase>

      <Phase name="Implement">
        <Step name="changes">
          <Claude model="sonnet" allowedTools={["Read", "Edit", "Write"]}>
            Implement the planned changes.
            Keep edits minimal and consistent with project style.
          </Claude>
        </Step>
      </Phase>

      <Phase name="Verify">
        <Step name="tests">
          <Claude model="sonnet" allowedTools={["Bash", "Read"]}>
            Run the project's tests and fix failures until green.
          </Claude>
        </Step>
      </Phase>

      <Phase name="Report">
        <Step name="summary">
          <Claude model="haiku" allowedTools={["Read"]}>
            Summarize what changed and how it was verified.
          </Claude>
        </Step>
      </Phase>
    </SmithersProvider>
  );
}

const root = createSmithersRoot({ db, executionId });
await root.mount(Workflow);
db.close();
```

Run:

```bash
bun workflows/smithers-example.tsx
```

Notes:

* DB APIs are synchronous; close DB at end.
* Resume relies on `db.execution.findIncomplete()`.

---

# Execution model (what to rely on)

## Durable iteration ("Ralphing") rules

* Workflow progresses via **rerenders**; each rerender is an "iteration".
* Always set `maxIterations` (default is 100 if you omit it).
* For durable branching/retry: store state in `db.state` (SQLite); read with reactive queries (`useQueryValue`, etc.) rather than React `useState`.

## Phases + Steps (sequential semantics)

* A `<Phase>` **auto-advances when all child `<Step>`s complete**.
* Phase requires ≥1 Step to auto-advance; otherwise it will not progress without manual logic (`onComplete` + your own state).
* Only the **active phase renders children** under the registry context (provided by `SmithersProvider`).

## Parallel (experimental)

* `<Parallel>` runs children concurrently inside a Step; semantics are experimental and have known limitations.

## Task (presentational)

* `<Task>` is just a checkbox-like rendering element; it is **not** `db.tasks.*`.

---

# SQLite state (db.state): minimal contract

State values are JSON-serialized on write and parsed on read (`get`, `getAll`). History stores old/new as JSON strings; add optional trigger strings for causality/audit.

| Method                                                                      | Use                                |
| --------------------------------------------------------------------------- | ---------------------------------- |
| `db.state.get<T>(key)`                                                      | read (parsed)                      |
| `db.state.set(key, value, trigger?)`                                        | write + optional cause             |
| `db.state.setMany(obj, trigger?)`                                           | atomic multi-write                 |
| `db.state.getAll()`                                                         | full state object                  |
| `db.state.history(key?, limit?)`                                            | transitions (old/new JSON strings) |
| `db.state.has(key)` / `db.state.delete(key, trigger?)` / `db.state.reset()` | utilities                          |

---

# Logging & monitoring (where to look)

Default log layout: `.smithers/logs/` plus execution-scoped logs under `.smithers/executions/<execution-id>/logs/` including `stream.ndjson` + `stream.summary.json`.

NDJSON event types:

* `text-end`, `reasoning-end`, `tool-call`, `tool-result`, `error`

Optional summarization (large outputs) via Haiku:

* `ANTHROPIC_API_KEY` required
* Thresholds: `SMITHERS_SUMMARY_THRESHOLD` (default 50 lines), `SMITHERS_SUMMARY_CHAR_THRESHOLD` (default 4000), `SMITHERS_SUMMARY_MAX_CHARS` (default 20000)
* Model: `SMITHERS_SUMMARY_MODEL` (default `claude-3-haiku-20240307`)

---

# Guardrails for agents generating Smithers code

* Prefer **Phase/Step structure** for straight-line workflows; add `skipIf` for optional phases.
* Use `db.state` for any branching/retry/human checkpoints.
* Scope tool permissions per `<Claude>` call (`allowedTools`) and choose conservative `permissionMode` by default.
* Never omit `maxIterations`.

---

# Pointer files

This plugin is intentionally "single manual": full patterns live in `EXAMPLES.md` (end-to-end runnable scripts).
