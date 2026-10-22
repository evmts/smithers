---
title: "Run a long command"
description: "Start a command detached in a sandbox, park the run while it runs, and collect its result once."
---

`SandboxTools.execute` runs a command inside one exec session and one flow
step. A host that stops while it runs, such as a Cloudflare Durable Object
alarm cut off at 15 minutes, loses the answer: the next attempt finds the
command's fence with no exit and fails `ToolLost`. A command that can run for
minutes (an install, a test suite) runs as a `SandboxCommand` job instead. It
holds no step, host or exec session while it runs.

## Declare the job

`SandboxCommand.make(tag, { target, error? })` declares an `ExternalJob` over
one `SandboxTools.Run` command. `target` is your schema for "which box": the
job hands it back to you for every operation. `error` is how reaching the box
can fail besides the tools' own failures.

```ts
import { Action, Flow, Interpreter } from "@smthrs/flow"
import { Node } from "@smthrs/plan"
import { type Sandbox, SandboxCommand, SandboxTools } from "@smthrs/sandbox"
import { Effect, Layer, Schema } from "effect"

const Box = Schema.Struct({ machine: Schema.String })

const Install = SandboxCommand.make("ci/install", { target: Box })

const Pipeline = Flow.make("ci/pipeline", {
  payload: { machine: Schema.String },
  success: SandboxTools.RunResult,
  error: Install.errorSchema,
  body: Node.capture(
    { install: Install._tag },
    ({ machine }) =>
      Install.call({ target: { machine }, call: { tool: "run", command: "pnpm install", timeoutSeconds: 600 } })
  )
})
```

The payload is `{ target, call }`; the success is the command's `RunResult`,
the same shape `execute` answers.

## Reach the box

`SandboxCommand.operations(reach)` gives the job its `start`, `status`,
`collect`, `cancel` and `abandon`. `reach(target)` answers the box's
`SandboxCommand.Commands`. A host that holds the box's session uses
`SandboxCommand.onSession(session, callsDirectory)`:

```ts
declare const sessionOf: (machine: string) => Effect.Effect<Sandbox.Session>

const layer = Layer.mergeAll(
  Install.toLayer(
    SandboxCommand.operations((target: typeof Box.Type) =>
      Effect.map(sessionOf(target.machine), (session) => SandboxCommand.onSession(session, "/home/ci/.smithers/calls"))
    )
  ),
  Interpreter.layer(Pipeline)
).pipe(Layer.provideMerge(Action.layerImplementations))
```

A host that reaches the box through another service, such as an RPC to the
object that holds the container, implements `Commands` over that service.
List `Install.flows` on a host that resolves an execution's flow by its tag.

## What each operation does in the box

The job's key is `<job execution id>#g<generation>`. Each operation is a POSIX
`sh` script under `callsDirectory`, by that key:

| Operation              | In the box                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------ |
| `SandboxTools.start`   | Makes the key's fence once and starts the command in a session of its own (`setsid`); answers its `Started`. |
| `SandboxTools.observe` | `running` while its runner lives in the same box, `finished` with its exit, else `lost`. Reads only.         |
| `SandboxTools.collect` | The `RunResult`: exit code, timeout, first 64 KiB of each stream. As often as asked.                         |
| `SandboxTools.cancel`  | Marks the key cancelled, then stops the runner's and the command's process groups: TERM, five seconds, KILL. |

- **Start once.** The same key again answers the same handle and never starts
  the command twice. A key cancelled before it started never starts.
- **Bounded.** The command runs for at most its `timeoutSeconds` (60 unless
  set, 600 at most), with GNU `timeout` where the box has it.
- **Lost is honest.** The runner records its pid, start time and the box's
  identity, so a box that restarted, or a runner killed before it recorded the
  exit, observes `lost`, and a pid the box reused never reads as running.

## Probes, loss and deadlines

The run parks between probes on a durable timer: a probe a second after the
start, doubling to one every 20 seconds (`SandboxCommand.defaults.probe`).
A `lost` command is cancelled and the job fails `ExternalJobLost` once
`restarts` replacements are spent; the default is zero, so a command runs at
most once. The job's deadline is 20 minutes past the longest command
(`SandboxCommand.defaults.timeout`), counted from before a start that may have
to wake the box; past it the job cancels the command and fails
`ExternalJobTimedOut`.

A box without `setsid` starts the runner in a process group of its own where
its shell has job control, else in the exec session's group: a host that
stops that group stops the command, and it observes `lost`.
