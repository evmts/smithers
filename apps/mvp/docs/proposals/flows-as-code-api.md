# Flows as code: one Effect-native authoring API

Status: proposed (2026-10-20). Merged by Claude Opus from two independent designs, Opus and Codex Sol (PROC-6). It answers ruling FLOW-9 ([rulings](../rulings.md)): design the authoring API for workflows as code, whether they live in a package, in `.smithers/` or in a separate repository, Effect-native and inspired by Alchemy. Nothing here is built. The full drafts are in the session scratchpad: `final/flows-as-code-opus.md` and `final/flows-as-code-sol.md` (Sol's carries a line-by-line inventory of `ci.yml`).

**Summary.** Every Smithers definition file becomes an Effect program that `yield*`s resources under logical ids, as `alchemy.run.ts` does, and every flow body becomes `Flow.gen`, an `Effect.gen` that runs once at plan time and lowers to today's `@smthrs/flow` plan; `smthrs definitions plan` diffs the declared resources against the active state of a stage, and a person's merge applies it.

**In one paragraph.** The API Will remembers is the JSX `createSmithers` API: a workflow read like its plan, a step was one line, and children ran in order. It hid Effect behind React, Zod, Drizzle and `async` callbacks, and the 1.0 rewrite replaced it with `@smthrs/flow`, which exposes Effect in schemas and implementations but writes bodies as continuation-passing `Node` calls. `PACKAGE.ts` already has Alchemy's central idea (resources are values and references are edges), while `.smithers/FACTORY.ts` names flows and triggers by string and nothing applies it. This design keeps one execution model and adds three things: `Flow.gen` for bodies, one Effect program shape for `PACKAGE.ts`, `FACTORY.ts` and plugins, and a plan, diff and apply step for definitions, with state per stage. VibeLang's docs generator becomes one `S.Generate` target in a root `PACKAGE.ts`, and its runner, manifest and check test are deleted. Three questions go to Will: the body model, whether all 122 `PACKAGE.ts` files move to the program form, and where triggers are declared.

```
authoring: Effect programs                 compiled data, committed            active state, per stage
PACKAGE.ts           S.Package  ─┐
.smithers/FACTORY.ts S.Factory  ─┼─ smthrs definitions plan ─▶ .smithers/factory.json ─ diff ─▶ local: SQLite
plugins/<id>/plugin.ts S.Plugin ─┘   (pure: no I/O)             plugins/<id>/plugin.json         main:  Postgres (a merge applies)
flows/<name>/flow.ts  Flow.make + Flow.gen ── lowers to ──▶ Node plan ──▶ engine journal (one run)
```

## What the old API got right, and where it hid Effect

The old API is the JSX `createSmithers` API of the `smthrs` package (earlier `smithers-orchestrator`). It is complete at revision `186e86d85b96` and removed by `2716e9855855`, "remove the superseded JSX/reconciler execution architecture".

**What it got right:**
- **A workflow read like its plan.** `export default smithers((ctx) => <Workflow name="research-pipeline"><Task id="research" output={outputs.research} agent={researcher}>…</Task></Workflow>)` (`186e86d85b96:docs/components/workflow.mdx:20-37`).
- **A step was one line:** an agent, a prompt and a typed output together, or a compute function, or a static value (`task.mdx:141-168`).
- **Order was the default.** "Direct children run sequentially" (`workflow.mdx:41`); `<Parallel>`, `<Branch>`, `<Loop until>`, `<Approval>`, `<Signal>`, `<Timer>` and `<Sandbox>` were named constructs (`81dd99511728:packages/smithers/src/CreateSmithersApi.ts:36-61`).
- **Durable by default,** resumed by node id and iteration, with retries, timeouts and caching as declaration fields (`task.mdx:9-60`).

**Where it hid Effect:**
- The public types were React elements and a Bun SQLite handle: `smithers: (build: (ctx) => React.ReactElement)`, `db: BunSQLiteDatabase` (`81dd99511728:packages/smithers/src/CreateSmithersApi.ts:55-59`). Effect ran inside the driver: `runEffect(effect) { return this.runtime.runPromise(effect) }` (`81dd99511728:packages/driver/src/WorkflowDriver.js:947-948`).
- Schemas were Zod, outputs were Drizzle tables with reserved `run_id`, `node_id` and `iteration` columns (`workflow.mdx:44`), and `packages/engine` depended on React, Zod and Drizzle beside Effect (`186e86d85b96:packages/engine/package.json:54-58`).
- Compute steps were `async` functions and failures were thrown (`task.mdx:148`, `:184`). Agents were class instances, `new CodexAgent({...})` (`workflow.mdx:24`), not services.
- Dependencies were string ids (`dependsOn: string[]`, `needs`, `task.mdx:16-18`), so a typo failed at run time with `DEPENDENCY_DEADLOCK` (`task.mdx:296`).

The rewrite made Effect the public contract on purpose: "Hiding Effect requires a new abstraction layer" (`186e86d85b96:PLAN.md:132`), with no JSX compatibility (`:141`).

## Today's patterns

| Surface | What it does well | What is missing |
|---|---|---|
| `@smthrs/flow` | `Flow.make(tag, { payload, success, error, body })`; actions declared by `Action.make` and implemented by `toLayer(payload => Effect)` (`packages/smithers/flows/flow/src/Action/Action.ts:115-216`); a pure plan-time body (`Flow/Flow.ts:131-148`) | The body is `Node.bindPlanned`/`Node.branch` continuation passing (`Flow/make.ts:128-135`), not Effect; requirements are sometimes written by hand (`.smithers/flows/release/flow.ts:22-36`) |
| `@smthrs/plan` | Symbolic results (`Planned`, `plan/src/Planned.ts:1-27`), edges from references (`Node.bindPlanned`, `Node.ts:505-536`), a plan diff (`PlanDiff.ts:1-15`, `:50-59`), `smthrs flow plan` | Nothing plans which flows, triggers and homes are live |
| `PACKAGE.ts` | Targets are values, `deps` are references, labels are map keys (`packages/smithers/build/targets/src/Package.ts:1-12`), calls do no I/O (`targets/README.md:7-10`); `S.Generate` writes on `run` and fails on drift under `lint` (`PACKAGE.ts:205-229`, `Compose.ts:158-185`); a target's implementation is the same `Node` a flow body returns (`Target.ts:414-437`) | Custom logic runs as an outside script; `@smthrs/targets` imports `node:*`, so it can't load in a browser or Worker (`Target.ts:14-18`, `docs/libraries.md:158`) |
| `.smithers/FACTORY.ts` | One file for featured flows, triggers, GitHub policy and the home, projected to `factory.json` and `home.json` (`.smithers/FACTORY.ts:1-8`) | Flows are strings (`S.Flow({ flow: "review" })`, `:19-23`); triggers are string keys (`"schedule:0 2 * * *": { flow: "security-audit" }`, `:63-89`); rows can name flows that don't exist (`:54-58`); nothing in `apps/mvp/src` or `worker/` reads it |
| `@smthrs/triggers` | Durable cron with overlap and catch-up (`agent/triggers/docs/api.md:42-75`) | `flowId` is a string the package "never resolves"; registration is imperative (`smthrs triggers register`); the app doesn't run it (`apps/mvp/worker/github/Reconcile.ts:19`) |
| Decisions 0014 and 0017 | Static discovery (0014 line 36); activation by compare-and-set with last-known-good (0014 line 20); "Config binds; code composes" (0017 line 25); a manifest is data (0017 line 23) | Repository flows, triggers and the realm host are unbuilt ([ci-cd-parity](ci-cd-parity.md) lines 104-117) |

**VibeLang's generator, the case FLOW-9 names.** `~/effectscript/.smithers/flows/docs/` declares a correct flow (`flow.ts:11-21`), then hand-rolls everything a target supplies: a composition root that builds `Interpreter.layerWithImplementations`, an engine and crypto and calls `Effect.runPromise` (`run.ts:31-39`), an input digest (`run.ts:22-29`), an output manifest `generated.json` (`run.ts:40-43`), file writes (`run.ts:47-55`) and a test that re-runs the generator to detect drift (`check.test.ts:8-22`). Smithers' own README and project copy use the existing pattern for the same job: one data file, one `S.Generate` target (`PACKAGE.ts:205-229`).

## Alchemy ideas we take

We use Alchemy 2.0.0-beta.83, which is Effect-native. Paths below are in `node_modules/alchemy/src/` unless they start with `apps/mvp/`.

| Alchemy | Smithers |
|---|---|
| A stack is one Effect program: `Alchemy.Stack("smithers-mvp", { providers, state }, Effect.gen(...))` (`apps/mvp/alchemy.run.ts:59-91`) | `S.Package`, `S.Factory` and `S.Plugin` each take an `Effect.gen` program |
| `yield* Resource("id", props)` registers under a logical id; the fully qualified name is namespace plus id (`FQN.ts:50`, `Resource.ts:340`) | `yield* S.Trigger("ci-pr", {...})`; names are `//pkg:id`, `factory:id`, `plugin/<id>:id` |
| Attributes are `Output`s; the planner derives edges from them (`Plan.ts:384-396`, `Output.ts:708-755`) | handles are typed values; a trigger takes a flow value, a target takes target values, a body passes `Planned` results |
| `plan` is a dry-run deploy; each resource diffs to noop, update, replace or delete (`Diff.ts:10-35`, `Plan.ts:91-102`, `Cli/commands/deploy.ts:267-295`) | `smthrs definitions plan` prints add, change and remove per resource |
| State keyed by stack, stage and name, in a local file or a Cloudflare store chosen by a Layer (`State/State.ts:29-129`, `apps/mvp/alchemy.run.ts:44-49`) | state keyed by repository, stage and name: SQLite on a machine, Postgres on Smithers cloud |
| A default stage per developer (`Cli/commands/flags.ts:20-75`) | stages `local`, `main` and preview |
| Providers are Layers with `reconcile` and `delete` (`Provider.ts:327-342`, `:425-500`) | each resource kind's apply is a host Layer: `@smthrs/platform-node` locally, the Cloudflare host on `main` |
| `Alchemy.Action` runs when its input changes (`apps/mvp/infra/ChatDatabase.ts:15-22`) | a target, cached by its input digest |
| The class form joins a declaration and its implementation (`apps/mvp/infra/ElectricGateway.ts:64-89`) | `S.Flow(flow, { layer })` joins a flow and its action implementations, so no repository writes a composition root |

**What we don't take:**
- **Edges only from references inside a flow body.** Alchemy's own app needs `Output.map(Output.all(postgres.origin, migrated), …)` to make Hyperdrive wait for migrations (`apps/mvp/infra/ChatDatabase.ts:52`). A publish step that reads no test result must still wait for the tests, so `yield*` in a body is sequential, as in `Effect.gen` and the old `<Workflow>`, and concurrency is explicit.
- **First declaration wins on a duplicate id.** Alchemy returns the first and ignores the second's props (`Resource.ts:370-376`, "TODO(sam): check if props are different and die"). We refuse a duplicate id with a typed error.
- **Secret values in state.** Alchemy's local state writes a `Redacted` value in clear under `__redacted__` (`State/StateEncoding.ts:10`, `:81-83`). Our state and snapshots hold secret names only (ARCH-16).
- **Alchemy itself.** Definitions don't import `alchemy`, which `apps/mvp/docs/rules.md:173-174` confines to the Worker entries, `alchemy.run.ts` and `infra/`; its planner owns an infrastructure graph, and a second graph around ours would break FLOW-2.

## The proposed API

### Flow bodies: `Flow.gen`

```ts
// .smithers/flows/ci/flow.ts
import { Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { Schema } from "effect"

export default Flow.make("ci", {
  description: "Typecheck, test and lint one commit.",
  payload: { sha: Schema.String },
  success: CiReport,
  body: Flow.gen(function* ({ sha }) {
    const checkout = yield* Checkout.call({ sha })        // Planned<Checkout>; the next line waits for it
    return yield* Node.all({                              // concurrency is explicit
      test: Test.call({ checkout }),
      lint: Lint.call({ checkout }),
    })
  }),
})
```

`Flow.gen` is `Effect.gen` with one plan-time service, `FlowPlan`. `@smthrs/plan` makes `Node` yieldable: yielding one registers it with `FlowPlan` and returns its `Planned<A>`. `Flow.gen` returns the `(payload) => Node` body `Flow.make` takes today, so there is no second graph model (FLOW-2) and every engine, host, journal and run view keeps working.

The rules:

1. **The body runs once, at plan time, with no I/O.** Its only services are `FlowPlan`, `Stage` and `Config`; it has no filesystem, network, process or model service. The host's isolation enforces this, not only the type.
2. **`yield*` is sequential.** The rest of the body starts after the yielded node succeeds and receives its reference. `Node.all` runs members concurrently. A registration from a forked fiber (`Effect.all` with `concurrency`) fails with `GraphBuildError`, so concurrency has one spelling.
3. **A reference is passed, never computed on.** Pass `checkout` into a payload or read `probe.report`; compute with `Node.map`, which runs later on the real value (`Node.ts:455-470`); decide with `Node.branch` (`Node.ts:606`). `if (probe.ok)` can't be trapped at run time (`Planned.ts:20-25`), so the lint rule `flow.no-planned-condition` refuses it beside `strict-boolean-expressions`.
4. **Work is an action.** Code that does something is `Action.make` plus `toLayer(payload => Effect)`; a model call is a prompt flow (`Flow.make(tag, { prompt })`, `Flow/make.ts:185-197`) or an `AgentAction` step.
5. **Identity is sealed or refused.** Callbacks are captured through the existing canonical plan path, and a callback with process-local identity is refused before dispatch (`packages/smithers/flows/flow/README.md:35-43`).
6. **Loops are rounds.** A body returns `Flow.to(next)` for another round under `maxRounds` (`Flow/Outcome.ts:44-60`). A shape known only at run time is a later round, shown as pending in the plan; nothing calls a model to guess a plan.
7. **Types are inferred.** The body's error union and action requirements come from what it yields, so `release/flow.ts:22-36` disappears.

`Node` stays the public lower-level API, as `Effect.flatMap` sits beside `Effect.gen`. Falsifier for the lowering: rewriting `.smithers/flows/release/flow.ts` with `Flow.gen` leaves its plan digests byte-identical.

### Definitions: one program per scope

```ts
// .smithers/FACTORY.ts
import { Smithers as S } from "@smthrs/targets"
import { Effect } from "effect"
import Ci from "./flows/ci/flow.ts"
import SecurityAudit from "./flows/security-audit/flow.ts"

export const factory = S.Factory("smithers", Effect.gen(function* () {
  const ci = yield* S.Flow(Ci, { summary: "The same jobs as ci.yml.", featured: true })
  yield* S.Trigger("ci-push", { flow: ci, on: S.On.push({ branches: ["main"] }), input: (e) => ({ sha: e.sha }) })
  yield* S.Trigger("ci-pr", {
    flow: ci, on: S.On.pullRequest(), input: (e) => ({ sha: e.sha }),
    concurrency: { group: (e) => e.pullRequest.number, cancelInProgress: true }, trust: "head-unprivileged",
  })
  yield* S.Trigger("security-audit", { flow: SecurityAudit, on: S.On.cron("0 2 * * *") })
  yield* S.Factory.Home({ blocks: [S.Home.App({ flow: ci, title: "Run CI", picture: "checks" })] })
}))
```

| Resource | Logical id | Handle | Applied by (local / `main`) | State |
|---|---|---|---|---|
| Target: the catalog rules and `S.Generate({ flow, layer })` | label | `.files`, outputs | the build executor | cache entry by input digest |
| Flow: `S.Flow(value, { layer, summary, featured, view })` | the flow's tag | the flow value | registry activation | active revision digest |
| Trigger: `S.Trigger(id, { flow \| run, on, input, concurrency, trust })` | id | none | `SqlTriggerStore` / Postgres rows | trigger revision |
| Home: `S.Factory.Home({ blocks })` | `home` | none | the projection | snapshot row |
| Plugin and its contribution points: `S.Plugin`, `S.Plugin.Command`, … | plugin id | none | the plugin host (0017) | installation snapshot |
| GitHub policy: `S.Github.Policy` | `github` | none | the projection | snapshot row |
| Secret: `S.Secret("NPM_TOKEN")` | name | reference | an Admin's grant (0017 §10) | name only |

The rules:

1. **A definition program is pure.** Its services are `Stage` and `Config`. A constructor fails with a typed `DefinitionError` naming the field, instead of throwing `TypeError` as `Target.make` does today.
2. **References are values.** A trigger takes the imported flow, so a trigger naming a flow that doesn't exist fails to compile, where today it is a silent string (`FACTORY.ts:54-58`).
3. **`input`, `group` and other mappers record paths.** They run once at plan time on a symbolic event and record `{ sha: "$event.sha" }`, decision 0017's `Args` grammar; computing on the event throws. A verified event pins `{ repository, sourceSha, executionSha, ref, deliveryId, event }` and fork pull requests get no secrets.
4. **Cron uses `@smthrs/triggers`' policy names and defaults:** UTC, `overlap: "skip"`, `catchUp: "none"`, each shown in the plan.
5. **Listing never runs a program.** Discovery reads source text and the compiled snapshot, as it does today (`packages/smithers/agent/registry/README.md:11-31`).

### Plan, apply and state

```
$ smthrs definitions plan --stage main
factory smithersai/smithers   candidate 3f2a9c1   active 7b96f87
  + trigger  ci-pr           github.pull_request -> ci   cancel in progress, head unprivileged
  ~ flow     ci              body 41c9… -> 9e07…   step + rust-ffi
  ~ trigger  security-audit  cron "0 2 * * *" -> "0 3 * * *" (UTC, overlap skip, catch-up none)
  - trigger  weekly-suggest
  = home, github policy, 5 flows, 112 targets
1 to add, 2 to change, 1 to remove
```

- **The candidate is sealed.** It records the source SHA, the imported module closure, the lockfile and toolchain identities, the stage, the implementation versions, schemas, effect envelopes and trigger bindings, and the active snapshot it expects to replace.
- **The compiled candidate is committed.** `smthrs definitions plan --write` writes `.smithers/factory.json` and each `plugins/<id>/plugin.json`; `lint` fails on drift, as `//:factoryProjection` does today. The host reads data and never runs repository code to list or activate (0017 §3), and a signed-out visitor reads it from the public mirror (`FACTORY.ts:5-8`). When the realm host lands (0017 slice 5), refresh recomputes the candidate there and refuses a mismatch.
- **Apply is a durable system flow, `definitions/apply`.** It activates the candidate by compare-and-set, refuses a stale one, resumes after a crash and settles on a read-back receipt. A removed trigger starts nothing, even from a delayed delivery; a removed flow keeps its run history and its pinned runs.

| Stage | Where | State | Applied by |
|---|---|---|---|
| `local` | this machine | SQLite in the workspace cache directory | `smthrs definitions apply` |
| `main` | Smithers cloud, the default branch | Postgres: 0014's `flow_bindings`, 0017's `plugin_installations`, trigger rows | a person's merge, through `plugin/refresh`; never an agent |
| preview | a pull request's head | none | never; the plan shows on the pull request card |

## Worked examples

### 1. VibeLang's docs as a `PACKAGE.ts` target

`project.ts` and `render.ts` stay: they are the one source and a pure renderer. The flow keeps its action. `run.ts`, `generated.json`, `check.test.ts` and the `docs:generate` and `docs:check` scripts are deleted, because the target owns input identity, writing, caching and the drift check.

```ts
// .smithers/flows/docs/flow.ts: the existing action and flow, with a Flow.gen body
export const Render = Action.make("docs/Render", { implementationVersion, payload, success: Files })
export const RenderLive = Render.toLayer(({ sources }) => Effect.sync(() => render(sources)), { implementationVersion })

export default Flow.make("docs", {
  description: "Render CONTRIBUTING, MAINTAINERS and both AGENTS.md from project.ts, with token counts.",
  payload, success: Files,
  body: Flow.gen(function* (input) { return yield* Render.call(input) }),
})
```

```ts
// PACKAGE.ts at the repository root
import { Smithers as S } from "@smthrs/targets"
import { Effect } from "effect"
import Docs, { RenderLive } from "./.smithers/flows/docs/flow.ts"

export const Package = S.Package("vibelang", Effect.gen(function* () {
  const docs = yield* S.Generate("docs", {
    summary: "Regenerate and drift-check CONTRIBUTING, MAINTAINERS and both AGENTS.md from project.ts.",
    flow: Docs,
    layer: RenderLive,
    data: { sources: { "README.md": S.file("README.md"), "docs/user/llms-essentials.md": S.file("docs/user/llms-essentials.md") } },
    code: [S.glob(".smithers/flows/docs/*.ts"), S.file(".smithers/bun.lock")],
    changes: ["CONTRIBUTING.md", "MAINTAINERS.md", "AGENTS.md", "templates/app/AGENTS.md", "README.md"],
  })
  return { docs }
}))
```

- `smthrs run //:docs` writes the five files; `smthrs lint //:docs` fails on drift, `S.Generate`'s existing write and check pair (`Compose.ts:163-166`, `PACKAGE.ts:211`).
- `data` names files the executor reads into the flow's payload; `code` makes the generator's own sources key material, which `run.ts:16` lists by hand today.
- `README.md` is an input and an output: `render` strips the token footer before counting (`render.ts:46`, `run.ts:25-26`), so a second run is a no-op.
- VibeLang gains `.smithers/WORKSPACE.ts` and the root `PACKAGE.ts`; it has neither today. Until `S.Generate({ flow })` exists, `S.Generate({ script, data, changes })` does the same job with `run.ts` as the script.

### 2. Smithers' `ci.yml`

`ci.yml` runs on pushes to `main` and on pull requests, cancels earlier runs only for pull requests, and reads contents only (`.github/workflows/ci.yml:1-10`). Each step runs when setup succeeded and the run isn't cancelled, so one failed target doesn't skip the next (`:127`), and results upload always (`:133-139`). The `packages` matrix doesn't fail fast and its macOS and Windows legs are advisory (`:1392-1407`). The port keeps these semantics. `CiJob` is the job machine from the [CI/CD parity proposal](ci-cd-parity.md) (lines 289-307), not yet built.

```ts
// .smithers/flows/ci/jobs.ts: the one job table, one row per ci.yml job
export const jobs = [
  { id: "test", timeoutMinutes: 180, steps: [smthrs("ci", "//packages/...", { jobs: 2 })] },
  { id: "repository", timeoutMinutes: 60, steps: [smthrs("test", "//.smithers/flows:pack"), smthrs("test", "//.smithers/flows:egress") /* 28 more */] },
  // scripts, docs, apps-e2e, apps-browser-1..3, rust, rust-ffi, wasm-repro, browser, packages, go-backend, go-backend-access
] as const

// .smithers/flows/ci/flow.ts
import { Flow } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { CiJob } from "@smthrs/sandbox"                         // NEW: ci-parity-job-sandbox
import { Schema } from "effect"
import { jobs } from "./jobs.ts"

export default Flow.make("ci", {
  description: "Every push to main and every pull request: the same jobs as ci.yml.",
  capabilities: ["sandbox:job"],
  modelInvocable: false,
  payload: { sha: Schema.String },
  success: Schema.Record(Schema.String, CiJob.Outcome),
  body: Flow.gen(function* ({ sha }) {
    return yield* Node.all(Object.fromEntries(jobs.map((job) => [job.id, CiJob.make(`ci/${job.id}`, {
      machine: "standard-4",
      timeoutMinutes: job.timeoutMinutes,
      steps: job.steps,
      afterFailedStep: "continue",                              // ci.yml:127
      knownRed: ".github/ci-known-red.json",
      secrets: ["SMITHERS_CACHE_URL", "SMITHERS_CACHE_READ_TOKEN"],
      results: { artifact: `smthrs-results-${job.id}`, when: "always" },
    }).call({ sha })])))
  }),
})
```

The triggers are `ci-push` and `ci-pr` in the `FACTORY.ts` above. Each job settles an outcome value and never fails, so the record reports every job (parity proposal line 154). The macOS and Windows legs of `packages` are the ticket `ci-parity-advanced-runners`. During the move `jobs.ts` is the only job table: `//:ci` renders `ci.yml` from it, so the YAML and the flow can't disagree, and the renderer is deleted once the flow passes on Smithers cloud.

### 3. A cron flow

The hourly canary (`canary.yml`) as a flow that keeps one sticky comment on the canary issue. `UpsertComment` exists (`packages/smithers/agent/integrations/src/GitHub/Actions.ts:324`); `Probe` is the canary's own action.

```ts
// .smithers/flows/canary/flow.ts
export default Flow.make("canary", {
  description: "Probe smithers.sh and keep one status comment on the canary issue.",
  payload: { url: Schema.String, issueNumber: Schema.Number },
  success: ProbeResult,
  body: Flow.gen(function* ({ url, issueNumber }) {
    const probe = yield* Probe.call({ url })
    yield* GitHub.UpsertComment.call({
      owner: "smithersai", repo: "smithers", issueNumber, key: "canary",
      body: probe.report,                                       // a reference, read at run time
      author: smithersApp,
    })
    return probe
  }),
})

// in .smithers/FACTORY.ts
yield* S.Trigger("canary", {
  flow: Canary,
  on: S.On.cron("0 * * * *", { timezone: "UTC", overlap: "skip", catchUp: "none" }),
  input: () => ({ url: "https://smithers.sh", issueNumber: canaryIssue }),
})
```

Applying `main` makes the schedule live; committing the file alone doesn't. Each occurrence is claimed once per trigger revision, through the durable tick from the parity proposal (line 117), not a forever fiber.

### 4. A plugin contributing a flow

The `release-notes` prompt flow (today `.smithers/flows/release-notes/flow.mdx`) as a plugin with a slash command and a tag trigger. A prompt flow is a code flow (FLOW-2), and the old `<Task agent>` maps to it.

```ts
// .smithers/flows/release-notes/flow.ts
export default Flow.make("release-notes", {
  description: "Draft release notes from the commits since the last tag, grouped by package.",
  capabilities: ["fs:read:**", "proc:spawn:*"],
  budget: { tokens: 250_000, milliseconds: 600_000 },
  payload: { range: Schema.String },
  success: Notes,
  prompt: ({ range }) => `Draft release notes for ${range}. Run git log --format='%h %s' ${range}, group by scope, one line per commit.`,
})

// .smithers/plugins/release-notes/plugin.ts
export const plugin = S.Plugin("release-notes", {
  title: "Release notes", version: "1.0.0", requires: { api: "^1" },
  capabilities: ["fs:read:**", "proc:spawn:*"],
}, Effect.gen(function* () {
  const draft = yield* S.Flow(ReleaseNotes)                    // owned: .smithers/flows/release-notes
  yield* S.Plugin.Command("release-notes/draft", { flow: draft, title: "Draft release notes", slash: { name: "release-notes" } })
  yield* S.Trigger("release-notes/on-tag", { flow: draft, on: S.On.push({ tags: ["v*"] }), input: (e) => ({ range: e.range }) })
}))
```

`smthrs definitions plan --write` projects `.smithers/plugins/release-notes/plugin.json`, a valid `Plugin.Manifest` (decision 0017, lines 187-316): `owns: ["release-notes"]`, `contributes.commands` and `contributes.triggers`. The host reads that file without running the plugin's code. 0017's `Trigger` row gains `id`, `input` and the event filters, so a factory trigger and a plugin trigger are one row type. A tag push's event carries `range`, from the previous tag to this one; `input` only reads it, because computing on the event (a template literal, say) is refused at plan time. An organization publishes the same folder as a package; each repository installs it at an immutable digest, and an Admin grants its secrets.

## Where definitions live and how they are discovered

| Scope | Files | What goes there | Discovered by |
|---|---|---|---|
| Package | `<dir>/PACKAGE.ts` | targets whose inputs and outputs are the package's files: build, test, lint, docs, generated files, the package's own release steps | the workspace walk, pruned by `WORKSPACE.ts`; labels `//dir:id` |
| Workspace | `.smithers/WORKSPACE.ts` | toolchains, cache, sandboxes, repository bindings | its fixed path; it supplies Layers and config, never authority |
| Repository | `.smithers/FACTORY.ts`, `.smithers/flows/<name>/flow.ts`, `.smithers/plugins/<id>/` | flows, triggers, featured flows, the home, the GitHub policy, repository plugins | fixed paths (M-49); flows by path, plugins by folder |
| Organization | a separate repository published as a plugin package | flows, commands and triggers shared across repositories | installed per repository at a digest by an Admin; no scan of other checkouts |

The rules:
1. **A package never declares a trigger.** A trigger runs a target with `run:`: `S.Trigger("nightly-conformance", { run: testPackage.nightlyConformance, on: S.On.cron("0 3 * * *") })`. `S.Cron` is deleted.
2. **A flow file never says when it runs** (question 3). A file flow is listed and runnable by hand without a factory entry; the factory adds triggers, presentation and implementation layers.
3. **Discovery reads text and data; planning runs programs.** `smthrs flow list` and the app list flows from source literals and the committed snapshot; only `smthrs definitions plan` and, later, the realm refresh evaluate a program.
4. **An organization's flow acts with the installing repository's grants,** never more (0007 §5, 0017 §9).

## Migration

| Today | Stays | Changes |
|---|---|---|
| `Flow.make`, `Action.make`, `toLayer`, `Node`, the engines and journals | all of it | `@smthrs/plan` makes `Node` yieldable; `@smthrs/flow` adds `Flow.gen`. Node bodies stay valid. |
| 18 `.smithers/flows/*/flow.ts` | paths and tags (M-49) | bodies move to `Flow.gen` as they are edited; `release/flow.ts` first, with the digest falsifier |
| `.smithers/FACTORY.ts` | the file, the `factory` export, `factory.json`, `home.json` | `S.Factory(name, Effect.gen(...))`; string flow ids become imports; the `on` table becomes `S.Trigger`s; rows naming no flow are deleted |
| 122 `PACKAGE.ts` files | rules, labels, attrs, cache keys | question 2: a codemod to `S.Package(name, Effect.gen(...))`; `.smithers/target-index.json` must stay byte-identical |
| `S.Cron`, `smthrs triggers register` | `triggers list/show/enable/disable/fire/serve` | deleted; `S.Trigger` and `smthrs definitions apply` replace them |
| `GithubCiGen`, `S.Github.Workflow` | until the `ci` flow passes on Smithers cloud | `jobs.ts` feeds both, then the renderer is deleted |
| `@smthrs/targets` | the `Smithers` namespace | declarations split from Node-only executors (to `@smthrs/build-cli`), so programs evaluate in a browser, a Worker and the realm |
| `@smthrs/triggers` `flowId` | the column | authors never write it; the projection writes the tag |
| [CI/CD parity](ci-cd-parity.md) Design 1 | its spine and gaps | triggers move from a `Flow.make` literal to `FACTORY.ts` and plugins (question 3) |
| VibeLang `.smithers/flows/docs/` | `project.ts`, `render.ts`, `flow.ts` | `run.ts`, `generated.json`, `check.test.ts` and two scripts deleted; root `PACKAGE.ts` and `WORKSPACE.ts` added |

**Order.** Each step lands with its tests and docs.
1. `Flow.gen` and yieldable `Node`, proven by plan-digest equality on `release/flow.ts`.
2. `S.Generate({ flow, layer })`, proven on VibeLang's docs.
3. The definitions engine for stage `local`: `S.Factory` programs, `S.Trigger`, `S.On`, the projection, `smthrs definitions plan|apply` over `SqlTriggerStore`.
4. Stage `main`: activation through `plugin/refresh` once the parity spine (repository flows, triggers) runs.
5. The `PACKAGE.ts` codemod, if Will answers yes to question 2.
6. The CI port, per the parity proposal.

**Falsifiers.** Rewriting a body with `Flow.gen` changes no plan digest. The codemod changes no byte of `target-index.json`. `smthrs flow list` still lists every flow when `FACTORY.ts` throws at import. A trigger removed and merged starts nothing from a delayed delivery. A trigger naming a missing flow fails to compile.

**Library catalog entries used:** `@smthrs/flow`, `@smthrs/plan`, `@smthrs/targets`, `@smthrs/build-cli`, `@smthrs/triggers`, `@smthrs/registry`, `@smthrs/plugin`, `@smthrs/sandbox`, `@smthrs/integrations`.

## Where the drafts disagreed

| Topic | Opus | Sol | Chosen, and why |
|---|---|---|---|
| Body form | `Flow.gen` generator over `Node` | `Flow.program((payload) => Effect.gen(...))`, a real Effect run in a planning context | Merged: `Flow.gen` is an `Effect.gen` under a `FlowPlan` service (Sol), with one name |
| Order inside a body | `yield*` is sequential; `Node.all` is concurrent | edges only from references, `after: upstream.done` for order without data | Opus. ci.yml's later steps must wait for earlier ones without reading them, the old `<Workflow>` ran children in order (`workflow.mdx:41`), and Alchemy's own app needs `Output.all` to fake an order (`apps/mvp/infra/ChatDatabase.ts:52`) |
| Step handles | `.call(payload)` returns `Planned<A>` | `Action.plan("id", input)` returns a handle with `.output: Ref<A>` | Opus. `.call` and `Planned` exist (`Action/Action.ts:160-162`, `plan/src/Planned.ts`); a second reference type adds nothing |
| VibeLang docs | deterministic `S.Generate` over `project.ts` | `S.Docs.Set`, a model writes the three files, plus `Docs.Fresh` | Opus. VibeLang renders facts with exact token counts (`render.ts:60-71`); Smithers' matching pattern is `projectCopy` (`PACKAGE.ts:205-229`). A model writer would make the files nondeterministic. `Docs.Page` stays the pattern for prose a model writes |
| `PACKAGE.ts` form | one form, by codemod | add Effect overloads, keep the object form, don't convert every package | Question 2. Two declaration forms are two ways to do one thing (SDK-11); Sol's caution about churn is real |
| Flow references in `FACTORY.ts` | import the flow value | `S.Flow.ref("ci")` by tag | Opus. A string is today's weakness (`FACTORY.ts:54-58`) and the old API's `DEPENDENCY_DEADLOCK` |
| A `triggers` literal on `Flow.make` | no | kept as shorthand, with a conflict rule | Question 3. A second carrier needed the conflict rule Sol added |
| Command | `smthrs plan` and `smthrs apply` | `smthrs definitions plan` and `apply` | Sol. `--plan` and `smthrs flow plan` already mean execution plans (`packages/smithers/docs/reference/cli/README.md:26`, `:69`) |
| Compiled snapshot | committed `factory.json`, drift-checked | a descriptor projection compiled at refresh; Sol asked Will (92%) | Merged, not asked: commit it now, since it exists, needs no realm and serves the public mirror; the realm recomputes and refuses a mismatch later. This is engineering Will needn't answer |
| Apply | a merge activates, by 0014's compare-and-set | a sealed candidate applied by a durable `definitions/apply` flow with a read-back receipt | Sol's mechanics; the same compare-and-set |
| Organization flows | a `<org>/.smithers` repository whose triggers apply where installed | publish a plugin package; install per repository at a digest | Sol. 0017's installation snapshots and per-installation grants already cover it; no new authority path |
| Cron defaults | `overlap: "skip"` | UTC, skip missed occurrences, forbid overlap, shown in the plan | Sol's defaults, in `@smthrs/triggers`' own names |
| CI port | `Node.all` of `CiJob` per job | `Effect.forEach` over `Ci.Job` with every option, and a full inventory | Opus's shape, Sol's semantics: continue after a failed step, results always, advisory legs, known-red; the inventory stays in Sol's draft |
| Docs in CI | not covered | model writers stay attended; CI runs the deterministic freshness check | Sol; `S.Generate`'s `lint` check is that check |

## Questions for Will

1. **Do flow bodies plan before they run?** `Flow.gen` runs once at plan time: `yield*` returns a reference, steps run in order, `Node.all` runs them together, and a decision on a result uses `Node.branch`. The alternative is a replayed `Effect.gen` that sees real values, Effect's own `effect/workflow` (in effect 4.0.5). **Recommended: plan first. Confidence 75%:** it keeps the plan before the run, step caching, plan diffs and the run graph, and stays one model (FLOW-2); the cost is that `if (result.ok)` must be written `Node.branch`, which a lint rule enforces.
2. **Do all 122 `PACKAGE.ts` files move to `S.Package(name, Effect.gen(...))` now?** One codemod, proven by a byte-identical `target-index.json`. **Recommended: yes. Confidence 55%:** one shape everywhere is what "all in on Effect" asks for, but you named today's `PACKAGE.ts` as the pattern you'd use, and for hermetic targets the program form adds a `yield*` per target and no new capability. **What would raise it:** you pick A or B below.

   Example 1, VibeLang's docs, in both forms. Both declare the same `S.Generate` attrs, so the only difference is the declaration shape. Both use today's `script` selector: `run.ts` stays the generator, minus its digest and manifest code (`run.ts:22-29`, `:40-43`, `:54`). VibeLang also needs a `.smithers/WORKSPACE.ts` declaring a Bun runtime, because a `.ts` script runs under the workspace runtime (`Shell.ts:252-253`).

   **A, the program form.** It uses two APIs that don't exist yet, marked `ASSUMED`.

   ```ts
   // PACKAGE.ts at the VibeLang repository root
   import { Smithers } from "@smthrs/targets"
   import { Effect } from "effect"

   export const Package = Smithers.Package("vibelang", Effect.gen(function* () { // ASSUMED: Package(name, program)
     const docs = yield* Smithers.Generate("docs", {                             // ASSUMED: id first, returns an Effect
       summary: "Regenerate and drift-check CONTRIBUTING, MAINTAINERS and both AGENTS.md from project.ts.",
       featured: true,
       script: Smithers.file(".smithers/flows/docs/run.ts"),
       data: [
         Smithers.glob(".smithers/flows/docs/*.ts"),
         Smithers.file(".smithers/package.json"),
         Smithers.file(".smithers/bun.lock"),
         Smithers.file("docs/user/llms-essentials.md")
       ],
       changes: ["README.md", "CONTRIBUTING.md", "MAINTAINERS.md", "AGENTS.md", "templates/app/AGENTS.md"]
     })
     return { docs }
   }))
   ```

   **B, today's object form.** It uses only existing APIs, written as `projectCopy` is in Smithers' own `PACKAGE.ts:218-229`: `Smithers.Generate(attrs)` (`packages/smithers/build/targets/src/Compose.ts:991`), `Smithers.file` and `Smithers.glob`, and `Smithers.Package({ targets })` (`Package.ts:96`).

   ```ts
   // PACKAGE.ts at the VibeLang repository root
   import { Smithers } from "@smthrs/targets"

   const docs = Smithers.Generate({
     summary: "Regenerate and drift-check CONTRIBUTING, MAINTAINERS and both AGENTS.md from project.ts.",
     featured: true,
     script: Smithers.file(".smithers/flows/docs/run.ts"),
     data: [
       Smithers.glob(".smithers/flows/docs/*.ts"),
       Smithers.file(".smithers/package.json"),
       Smithers.file(".smithers/bun.lock"),
       Smithers.file("docs/user/llms-essentials.md")
     ],
     changes: ["README.md", "CONTRIBUTING.md", "MAINTAINERS.md", "AGENTS.md", "templates/app/AGENTS.md"]
   })

   export const Package = Smithers.Package({ targets: { docs } })
   ```

   | | A | B |
   |---|---|---|
   | Label | the first argument, `"docs"` | the map key, `docs` |
   | Exported to other packages | what the program returns | every key in `targets` |
   | Lines in this example | 19 | 17 |
   | Cost to adopt | a codemod over 122 files and two new overloads | none |

   Either way, `smthrs run //:docs` writes the five files and `smthrs lint //:docs` fails on drift. `README.md` is listed only in `changes`: the script reads it and rewrites its token footer. The Effect-native selector in example 1 (`flow: Docs, layer: RenderLive` in place of `script`, `ASSUMED`) works the same in either form, so choosing A or B doesn't decide it.
3. **Are triggers declared only in `FACTORY.ts` and plugins, never on `Flow.make`?** This amends the CI/CD parity proposal's `triggers` literal. **Recommended: yes. Confidence 70%:** one flow serves several triggers with different settings (`ci` on pushes without cancelling and on pull requests with it; `coding/wiki` on two events, `FACTORY.ts:75-82`), plugins and organization packages bind flows they don't own (0017 §5), and one carrier needs no conflict rule; the cost is that a flow file doesn't show when it runs, as a `.github/workflows/*.yml` file does.
