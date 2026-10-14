---
title: "Quickstart"
description: "Run a durable flow on local SQLite: declare an action and a flow, grant the one capability its body needs, stand the host up with NodeRuntime.layerHost, and watch the second run answer from the journal."
sidebar:
  order: 2
---

This quickstart runs one flow end to end on a real durable engine: SQLite on
disk, the guarded Node host, and the journal a resume replays from. By the end
you will have a program that reads a file through a recorded step, and a second
run of it that answers without reading the file again.

## Prerequisites

- Node.js 26.4.0 or later. It runs the TypeScript file below directly, with no
  build step and no loader flag.
- [jj](https://jj-vcs.github.io/jj/latest/install-and-setup/) 0.39.0 or later
  on `PATH`. The host runs `jj --version` when it starts and stops with
  `No jj on PATH` without it. On macOS, `brew install jj`; the linked page
  covers Linux and Windows.

Create an empty project, install the two packages the program imports, and give
it something to read:

```bash
mkdir flows-quickstart && cd flows-quickstart
npm init -y && npm pkg set type=module
npm install @smthrs/flows@next effect
mkdir -p workspace && echo "the note" > workspace/note.txt
```

The project is `"type": "module"` because the program ends in a top-level
`await`. `@smthrs/flows` installs the Node host and its SQLite driver. `effect`
is on the line because the program imports it directly. `@smthrs/flows` accepts
any `effect` in `^4.0.4`, so the line names no version and a project that
already has one in that range keeps it.

With pnpm 11, replace the `npm install` line with
`pnpm add @smthrs/flows@1.0.0-rc.7 effect`, then run
`pnpm approve-builds esbuild`. pnpm 11 holds a release back for its first 24
hours, so `@next` would install the previous candidate; an exact version is
installed the day it is published. pnpm 11 also ends the install with
`ERR_PNPM_IGNORED_BUILDS` until the project allows or denies the install script
of `esbuild`, which `@smthrs/flows` uses to bundle sandboxed flows.
[Installation](./installation.md) has the requirements in full.

## Declare the action and the flow

An action is one recorded operation, and its declaration is pure data:
schemas and a name, with no code attached. A flow's body is a plan over those
declarations, compiled before any of it runs.

Create `quickstart.ts`:

```ts
import { Action, Flow, Interpreter } from "@smthrs/flows"
import * as Effect from "effect/Effect"
import * as FileSystem from "effect/FileSystem"
import * as Layer from "effect/Layer"
import * as Schema from "effect/Schema"
import { resolve } from "node:path"

const workspaceRoot = resolve("workspace")

/** One recorded step: read a file through the host the engine guards. */
export const ReadNote = Action.make("quickstart/ReadNote", {
  payload: { path: Schema.String },
  success: Schema.String
})

/** The flow: a graph of one action, planned before any of it runs. */
export const ReadNoteFlow = Flow.make("quickstart/ReadNoteFlow", {
  payload: { path: Schema.String },
  success: Schema.String,
  body: (payload) => ReadNote.call(payload)
})
```

## Attach the implementation

The code arrives as a layer, separately from the declaration. The action's body
asks for Effect's `FileSystem`, and under `layerHost` that service is the
kernel's guarded host surface, not raw Node.

```ts
const implementation = ReadNote.toLayer(({ path }) =>
  Effect.gen(function*() {
    const files = yield* FileSystem.FileSystem
    return yield* Effect.orDie(files.readFileString(`${workspaceRoot}/${path}`))
  })
)

/** The registration phase: implementations, then the flow's interpreter. */
const flows = Interpreter.layer(ReadNoteFlow).pipe(
  Layer.provideMerge(implementation),
  Layer.provideMerge(Action.layerImplementations)
)
```

## Grant the one capability the body needs

The host's grant store is unattended: there is no operator to prompt, so a
capability no rule allows is denied rather than escalated. The body reads a
file, so grant `fs:read` under the workspace and nothing else.

```ts
import { Capability } from "@smthrs/flows"

const allowWorkspaceReads = new Capability.Permission.Rule({
  effect: "allow",
  pattern: new Capability.Capability.CapabilityPattern({
    action: "fs:read",
    resource: `${workspaceRoot}/**`
  })
})
```

Leave the rule out and the read is refused with the `permission_required` code,
naming the exact capability it asked for. Because the implementation above wraps
the read in `Effect.orDie`, that refusal arrives as a defect, and the program
stops with this first line:

```console
Error [PlatformError]: PermissionDenied: FileSystem.read (<path>): permission_required: fs:read:<path> (tier sealed, request permission-1)
```

An action that wants to report a denial rather than die on it catches the
failure instead and returns what it found: a denial is an answer, and it is up
to the action which kind.

Rules govern what a step reaches through the host's Effect services:
`FileSystem`, `ChildProcessSpawner`, `HttpClient`, and `Jj`. They do not see code
that goes around those services. An action that imports `node:fs` or calls the
global `fetch` reads and fetches whatever the process can, with no rule at all.
The grant store guards the services a body is handed; it is not a process
sandbox. To isolate a body's own code, run it as a child flow with
`SandboxedFlow` on a container provider, as
[Run a child flow in a sandbox](./guides/run-a-child-flow-in-a-sandbox.md)
shows.

## Stand the host up and run it

`layerHost` owes nothing to its caller. It creates the database's parent
directory, runs migrations, builds the guarded host over the grant store, adds
the step boundary and the workspace sandbox, installs `SIGINT` and `SIGTERM`
handlers, and only then runs your registration phase.

```ts
import * as NodeRuntime from "@smthrs/flows/NodeRuntime"

const host = NodeRuntime.layerHost(
  {
    filename: `${workspaceRoot}/.flows/engine.db`,
    workspaceRoot,
    owner: { hostId: "quickstart" },
    rules: [allowWorkspaceReads]
  },
  flows
)

export const main = ReadNoteFlow.execute(
  { path: "note.txt" },
  { executionId: "quickstart-1" }
).pipe(
  Effect.provide(host),
  Effect.scoped
)

console.log(await Effect.runPromise(main))
```

Run it:

```bash
node quickstart.ts
```

Node strips the type annotations itself, so this is the whole build. It prints
the file's contents:

```text
the note
```

## Run it again

Run the same file a second time, unchanged. It prints the same line, and the
implementation never runs: `executionId` names one execution, and the engine
answers a completed one from its journal.

Change `note.txt` between the two runs to see it plainly. The second run still
prints the old contents, because it is replaying a recorded step rather than
reading the file again. To read the file for real, use a new `executionId`.

The same `executionId` also returns the recorded result after you change the
flow, so a step you add or edit does not run;
[Change a flow and keep the work](./guides/change-a-flow-and-keep-the-work.md)
shows how to run only what changed.

## What just happened

`layerHost` composed every layer you did not write: the SQLite
database and its migrations, the journal, the run and attempt stores, the step
cache, the artifact store under `.flows/objects`, the contained Node host, the
grant store your one rule went into, the step boundary and workspace sandbox,
and a liveness probe that reads this machine's process table. Registration ran
last, so no persisted run could resume through this composition before its flow
was registered.

Closing the scope closed all of it in order. Had you pressed `Ctrl-C` mid-run
instead, the signal handler would have closed the same scope, and the run this
host owned would have parked itself `released` for the next host to reclaim
rather than sitting `running` behind a dead owner. The interrupted program
prints `Error: All fibers interrupted without error` and exits 1, and the next
run resumes the execution at once.

A process that dies without closing its scope, such as one killed with
`kill -9`, leaves the run `running` under its lease. The next run waits about 30
seconds for that lease to expire, then reclaims the run and resumes it.

## Next steps

- [Change a flow and keep the work](./guides/change-a-flow-and-keep-the-work.md):
  add or edit a step and rerun only what changed, and print the plan before
  anything runs.
- [Stand up a durable Node runtime](./guides/stand-up-a-node-runtime.md):
  the four entry points, and which one a given program should call.
- [Shut a host down](./guides/shut-a-host-down.md): signals, the shutdown
  deadline, and what a released run means.
- [Inspect the plan a body builds](../flow/docs/guides/inspect-the-plan.md) and
  [Diff two plans](../plan/docs/guides/diff-two-plans.md): see what a flow will
  run, and compare two versions of it, before anything runs.
- [Rewind a run to a frame](../time-travel/docs/guides/rewind-a-run.md): rewind
  a paused run and resume it, or fork a finished one.
- [Run a child flow in a sandbox](./guides/run-a-child-flow-in-a-sandbox.md):
  the tier where the child's own code executes on another machine, including
  one reached over SSH.
- [Troubleshooting](./troubleshooting.md): every refusal these modules raise.
