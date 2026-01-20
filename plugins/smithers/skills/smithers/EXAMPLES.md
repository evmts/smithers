# Smithers Examples (copy/paste runnable)

All examples assume:
- `bun add smithers-orchestrator`
- TSX config from SKILL.md

---

## Example: durable retry with SQLite state + Stop

`workflows/retry.tsx`

```tsx
#!/usr/bin/env bun
import {
  createSmithersDB,
  createSmithersRoot,
  SmithersProvider,
  Claude,
  If,
  Stop,
  useSmithers,
} from "smithers-orchestrator";
import { useQueryValue } from "smithers-orchestrator/reactive-sqlite";

const db = createSmithersDB({ path: ".smithers/retry" });
const existing = db.execution.findIncomplete();
const executionId =
  existing?.id ??
  db.execution.start({ name: "Retry Example", script: "workflows/retry.tsx" });

function Body() {
  const { db, reactiveDb } = useSmithers();

  const { data: attemptsVal } = useQueryValue<number>(
    reactiveDb,
    "SELECT CAST(value AS INTEGER) FROM state WHERE key = 'attempts'"
  );
  const attempts = attemptsVal ?? 0;

  const { data: lastErrorJson } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = 'lastError'"
  );
  const lastError = lastErrorJson ? JSON.parse(lastErrorJson) : null;

  return (
    <>
      <If condition={attempts < 3}>
        <Claude
          model="sonnet"
          onFinished={() => db.state.set("lastError", null, "success")}
          onError={(err) => {
            db.state.set("lastError", err.message, "error");
            db.state.set("attempts", attempts + 1, "retry");
          }}
        >
          {lastError !== null ? `Previous failure: ${lastError}\n\n` : ""}
          Attempt the task (attempt {attempts + 1}/3).
        </Claude>
      </If>

      <If condition={attempts >= 3}>
        <Stop reason={`Failed after 3 attempts: ${lastError ?? "unknown"}`} />
      </If>
    </>
  );
}

function Workflow() {
  return (
    <SmithersProvider db={db} executionId={executionId} maxIterations={10}>
      <Body />
    </SmithersProvider>
  );
}

const root = createSmithersRoot({ db, executionId });
await root.mount(Workflow);
db.close();
```

---

## Example: implement → review → commit loop (VCS pattern)

`workflows/review-commit.tsx`

```tsx
#!/usr/bin/env bun
import {
  createSmithersDB,
  createSmithersRoot,
  SmithersProvider,
  Phase,
  Step,
  Claude,
  If,
  Review,
  Commit,
  useSmithers,
} from "smithers-orchestrator";
import { useQueryValue } from "smithers-orchestrator/reactive-sqlite";

const db = createSmithersDB({ path: ".smithers/review-commit" });
const existing = db.execution.findIncomplete();
const executionId =
  existing?.id ??
  db.execution.start({
    name: "Review+Commit Example",
    script: "workflows/review-commit.tsx",
  });

function Body() {
  const { db, reactiveDb } = useSmithers();
  const { data: phaseJson } = useQueryValue<string>(
    reactiveDb,
    "SELECT value FROM state WHERE key = 'phase'"
  );
  const phase = phaseJson ? JSON.parse(phaseJson) : "implement";
  const setPhase = (p: string) => db.state.set("phase", p, "phase");

  return (
    <>
      <If condition={phase === "implement"}>
        <Phase name="Implementation">
          <Step name="implement">
            <Claude
              model="sonnet"
              allowedTools={["Read", "Edit", "Write"]}
              onFinished={() => setPhase("review")}
            >
              Implement the requested change set.
            </Claude>
          </Step>
        </Phase>
      </If>

      <If condition={phase === "review"}>
        <Phase name="Review">
          <Step name="review">
            <Review
              target={{ type: "diff", ref: "main" }}
              criteria={["No obvious bugs", "Tests updated if needed"]}
              onFinished={(r) => setPhase(r.approved ? "commit" : "implement")}
            />
          </Step>
        </Phase>
      </If>

      <If condition={phase === "commit"}>
        <Phase name="Commit">
          <Step name="commit">
            <Commit
              autoGenerate
              all
              notes={{ smithers: true, executionId }}
              onFinished={() => setPhase("done")}
            />
          </Step>
        </Phase>
      </If>

      <If condition={phase === "done"}>
        <Phase name="Done">
          <Step name="done">
            <Claude model="haiku" allowedTools={["Read"]}>
              Summarize what was changed and committed.
            </Claude>
          </Step>
        </Phase>
      </If>
    </>
  );
}

function Workflow() {
  return (
    <SmithersProvider
      db={db}
      executionId={executionId}
      maxIterations={25}
      snapshotBeforeStart
    >
      <Body />
    </SmithersProvider>
  );
}

const root = createSmithersRoot({ db, executionId });
await root.mount(Workflow);
db.close();
```

---

## Example: parallel work on two worktrees (experimental parallel)

`workflows/parallel-worktrees.tsx`

```tsx
#!/usr/bin/env bun
import {
  createSmithersDB,
  createSmithersRoot,
  SmithersProvider,
  Phase,
  Step,
  Parallel,
  Worktree,
  Claude,
} from "smithers-orchestrator";

const db = createSmithersDB({ path: ".smithers/parallel-worktrees" });
const existing = db.execution.findIncomplete();
const executionId =
  existing?.id ??
  db.execution.start({
    name: "Parallel Worktrees",
    script: "workflows/parallel-worktrees.tsx",
  });

function Workflow() {
  return (
    <SmithersProvider db={db} executionId={executionId} maxIterations={10}>
      <Phase name="ParallelWork">
        <Step name="parallel">
          <Parallel>
            <Step name="feature-a">
              <Worktree branch="feature-a">
                <Claude model="sonnet" allowedTools={["Read", "Edit", "Write"]}>
                  Implement feature A in this worktree.
                </Claude>
              </Worktree>
            </Step>
            <Step name="feature-b">
              <Worktree branch="feature-b">
                <Claude model="sonnet" allowedTools={["Read", "Edit", "Write"]}>
                  Implement feature B in this worktree.
                </Claude>
              </Worktree>
            </Step>
          </Parallel>
        </Step>
      </Phase>
    </SmithersProvider>
  );
}

const root = createSmithersRoot({ db, executionId });
await root.mount(Workflow);
db.close();
```
