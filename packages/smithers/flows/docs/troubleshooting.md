---
title: "Troubleshooting"
description: "A missing package at startup, every typed refusal NodeRuntime and SandboxedFlow raise, and the capability denials and replay surprises a host meets first: the symptom, what caused it, and what to change."
---

Every failure these two modules report is typed, and most of them are a decision
the host made, stated back plainly. Find the tag or the code and read the
matching section. A program that stops before any of them, on a missing
package, is the first section. The full schemas are in the [API reference](./api.md).

## ERR_MODULE_NOT_FOUND: Cannot find package

**Symptom.** `node` exits before your program runs:
`Error [ERR_MODULE_NOT_FOUND]: Cannot find package '<name>'`.

**Cause and fix.** The package named decides it:

| Package named                                                            | Cause                                                                                                     | Fix                                                                      |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `effect`                                                                 | Your program imports `effect/...` and the project does not declare it. pnpm links only declared packages. | `npm install effect`. [Installation](./installation.md) names the range. |
| `@smthrs/platform-node`, `@effect/sql-sqlite-node`                       | `@smthrs/flows` 1.0.0-rc.4 or earlier, which left the Node host to the program.                           | `npm install @smthrs/flows@next`                                         |
| `@smthrs/platform-bun`, `@effect/platform-bun`, `@effect/sql-sqlite-bun` | `@smthrs/flows/BunRuntime` without its packages.                                                          | Install the [Bun](./installation.md#bun-durable-execution) line.         |

## ERR_MODULE_NOT_FOUND: Cannot find module effect/dist/unstable/http/FetchHttpClient.js

**Symptom.** `node` exits before your program runs:
`Error [ERR_MODULE_NOT_FOUND]: Cannot find module '.../node_modules/effect/dist/unstable/http/FetchHttpClient.js'`,
imported from an `@smthrs/*` package such as `@smthrs/artifacts`.

**Cause.** The project has `@smthrs/flows` 1.0.0-rc.5 or earlier beside
`effect` 4.0.4, and those releases import a module that `effect` 4.0.4 does not
ship. pnpm 11 installs such a release when you ask for `@smthrs/flows@next`
within 24 hours of a new candidate: its `minimumReleaseAge` holds the new one
back and `next` resolves to the one before it.

**Fix.** Install 1.0.0-rc.6 or later. With npm, `npm install @smthrs/flows@next`.
With pnpm 11, run the exact-version `pnpm add` line from
[Installation](./installation.md#install-the-package), which pnpm installs the
day it is published.

## JjError: No jj on PATH

**Symptom.** The host stops while it is being built, before any flow runs:
`JjError [@smthrs/jj/JjError]: jj: No jj on PATH. Install jj (https://jj-vcs.github.io) or set SMITHERS_JJ_PATH.`

**Cause.** Every `NodeRuntime` and `BunRuntime` host includes the jj service,
and building it runs `jj --version`. The engine uses jj for workspace snapshots,
so a host without jj refuses to start rather than fail mid-run. A jj older than
0.39.0 is refused the same way, with the version it found.

**Fix.** Install [jj](https://jj-vcs.github.io/jj/latest/install-and-setup/)
0.39.0 or later and put it on `PATH`. On macOS, `brew install jj`; the linked
page covers Linux and Windows. To use a binary that is not on `PATH`, set
`SMITHERS_JJ_PATH` to its path.

## RuntimeConfigurationError

**Symptom.** `layer`, `make`, `layerHost`, or `storage` throws before opening
anything. The error carries `code: "invalid_runtime_configuration"`, a `field`
naming the option that was wrong, and a message.

**Cause.** Validation is eager: the composition is built when the function is
called, so a bad option fails at wiring time rather than at some arbitrary later
scope. `field` exists so an embedder can tell an empty `filename` from an empty
`owner.hostId` without reading prose.

| `field`             | What it refuses                                                                          |
| ------------------- | ---------------------------------------------------------------------------------------- |
| `filename`          | An empty or non-string SQLite filename.                                                  |
| `workspaceRoot`     | An empty or non-string workspace root, including `storage`'s second argument.            |
| `owner.hostId`      | An empty or non-string host id, or an `options.owner` that is omitted or `null`.         |
| `isAlive`           | An `isAlive` that is not a function. A function is the one option a schema cannot check. |
| `signals`           | A `signals` value that is not an array, or a name that cannot be installed.              |
| `shutdownTimeoutMs` | Anything that is not a safe integer from 0 through 2,147,483,647.                        |
| `rules`             | A `rules` value that is not an array, or a policy list whose members are not arrays.     |

**Fix.** Correct the named field. Note that nothing was created: a refused
configuration never opens a database, and a refused signal list never installs a
listener.

## NodeRuntime cannot install signal SIGKILL

**Symptom.** A `RuntimeConfigurationError` on `signals` naming the signal.

**Cause.** `SIGKILL` and `SIGSTOP` cannot be caught, and an unknown name is not
a signal at all. Both are refused before the first listener is installed, so you
never get a half-installed handler set.

**Fix.** Name catchable signals, or pass `signals: []` and wire your own. See
[Shut a host down](./guides/shut-a-host-down.md).

## permission_required: an action was refused with no rule to point at

**Symptom.** An action that reads a file or spawns a process fails with code
`permission_required`, carrying the exact capability it asked for. An action
that lets the failure die, as the quickstart's does, stops the program with
this first line:

```console
Error [PlatformError]: PermissionDenied: FileSystem.read (<path>): permission_required: fs:read:<path> (tier sealed, request permission-1)
```

`PermissionDenied` there is Effect's name for every refused platform call; the
code after the path tells this case from the next one. The cause is
`@smthrs/capability/PermissionRequired`.

**Cause.** `layerHost` builds its grant store unattended: there is no operator
to prompt, so a capability that no rule allows or denies cannot be escalated,
and the store refuses it immediately. The default decision is neither allow nor
deny; it is "ask", and there is nobody to ask.

**Fix.** Add a rule to `HostOptions.rules` that allows the capability the error
names, scoped as narrowly as the work needs:

```ts
import { Capability } from "@smthrs/flows"

const rules = [
  new Capability.Permission.Rule({
    effect: "allow",
    pattern: new Capability.Capability.CapabilityPattern({
      action: "fs:read",
      resource: `${workspaceRoot}/**`
    })
  })
]
```

## permission_denied: a rule refused it on purpose

**Symptom.** `@smthrs/capability/PermissionDenied`, code `permission_denied`,
with a reason of `denied by permission policy`.

**Cause.** A rule matched and its effect was `deny`. This is different from the
previous case: policy answered, and the answer was no.

**Fix.** If the denial is wrong, change the rule. Note the asymmetry when
`rules` is a list of rulesets rather than a flat list: `rulesets[0]` is the
configured policy and its effective denial is a hard veto, while every later
ruleset is applied last-match-wins. An allow in a later ruleset cannot lift a
deny in the first one.

## An action reached a file or a URL that no rule allows

**Symptom.** With `rules: []`, an action still reads a file outside the
workspace, fetches a URL, or starts a process, and nothing is refused.

**Cause.** Rules govern what a step reaches through the host's Effect services:
`FileSystem`, `ChildProcessSpawner`, `HttpClient`, and `Jj`. Code that imports
`node:fs` or `node:child_process`, or calls the global `fetch`, goes around
those services, and the grant store never sees it. The grant store is not a
process sandbox.

**Fix.** Reach the outside world through the Effect services, so the rules
apply. To isolate code you do not trust, run it as a child flow with
`SandboxedFlow` on a container provider; see
[Run a child flow in a sandbox](./guides/run-a-child-flow-in-a-sandbox.md).

## The engine takes snapshots even though I denied jj

**Symptom.** A compensable action still records a Jujutsu pre-image after
`jj:*` was denied to actions.

**Cause.** This is intended. Engine snapshot bookkeeping uses a private `Jj`
service, and `HostOptions.rules` governs only action-facing authority. An action
that asks for `Jj` directly is still refused; the engine's own bookkeeping is
not routed through the action's grants.

**Fix.** Nothing to change. If you need the engine to stop snapshotting, that is
a tier decision on the action, not a capability rule.

## The run returned a stale value

**Symptom.** A second run over the same database returns the previous answer,
and the action's implementation never ran.

**Cause.** `executionId` names one execution. A completed execution is answered
from the journal, which is the whole point of durability: a restart resumes
instead of repeating.

**Fix.** Use a new `executionId` for a new execution. Reuse it when you mean a
resume.

## queue_overflow: the journal admission queue is full

**Symptom.** A journal write fails with `queue_overflow`.

**Cause.** The runtime's journal queue has capacity 1,024 and rejects overflow
rather than dropping events. Dropping would make a later replay wrong, so the
write fails loudly instead.

**Fix.** Reduce the write rate, or compose the journal yourself through
[`@smthrs/journal`](../journal/docs/api.md) with different capacity and overflow settings,
using `NodeRuntime.storage` or `layer` as the seam.

## SandboxedFlowError

Every sandboxed refusal is one error class with a `code` that names it, and a
message that quotes the guest's stdout and stderr where they help. The tail of
each stream is quoted, cut at 4 KiB and marked when it was cut.

| `code`              | What happened                                                                                                         | What to change                                                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bundle_failed`     | esbuild could not bundle the `entry` module.                                                                          | Check that `entry` is a `file:` URL or an absolute path to a real module, and that its imports resolve. A remote URL is not a valid entry.                                                    |
| `session_failed`    | The provider could not acquire the machine, or a file or process operation on it failed.                              | Read the message: it names which operation, whether it was writing the bundle, writing the request, spawning the runtime, reading the result back, resolving the base, or capturing the work. |
| `guest_failed`      | The guest runtime exited non-zero. Exit 126 or 127 means the image has no runnable runtime, and the message names it. | Put `node` 22 or later, or `bun`, on the guest's `PATH`. Nothing is installed for you. For any other non-zero exit, read the quoted stderr.                                                   |
| `flow_failed`       | The child flow ran and reported a failure, or the entry exports no flow with the requested tag.                       | The message carries the child's error as its tag and fields, not a stack trace. An "exports no flow tagged" message means the entry module does not export the flow you passed.               |
| `result_unreadable` | The guest exited 0 but wrote no result, or wrote something that is not the protocol's JSON.                           | Usually the runtime ran something other than the bundle. Check the `runtime` command line and the quoted stdout.                                                                              |
| `result_invalid`    | The guest's `output` does not decode through the flow's success schema.                                               | The host's declaration has drifted from the one the guest bundled: same tag, different success schema. Rebuild against one declaration.                                                       |
| `result_overflow`   | The result JSON is larger than `limits.resultBytes` (5 MiB by default).                                               | Return less, or raise the bound. The message quotes both numbers.                                                                                                                             |
| `diff_overflow`     | The captured patch exceeds `limits.diffBytes`.                                                                        | Narrow what the child writes, or raise the bound. The message quotes the patch size and the limit.                                                                                            |
| `capture_failed`    | `captureWork` was on and git refused the capture; the message starts with the reason.                                 | `not_a_repository`: make the workdir the top of a git work tree and put `git` on the guest's `PATH`. `base_unresolved`: give the repository a commit. Otherwise read git's quoted stderr.     |
| `deadline_exceeded` | The whole session outlived `options.timeout`, ten minutes by default.                                                 | Raise the timeout or shorten the child. The machine is released either way.                                                                                                                   |

## A file the child wrote is missing from the work

**Symptom.** `captureWork` was on, the child wrote a file, and the patch in
`result.work` does not touch it.

**Cause.** The workdir's `.gitignore` excludes the path. Ignored files are not
work.

**Fix.** Write the file to a path the repository tracks, or return its content
in `output`. See
[Capture the work a sandboxed child did](./guides/collect-a-workspace-diff.md).

## Two executions fought over one machine

**Symptom.** A sandboxed execution's machine disappears under it, or two
executions appear to share a workspace.

**Cause.** A session key is an exclusive claim. Two live executions with one key
share a machine, and the first to finish tears it down under the other.

**Fix.** Derive the key from both the parent `executionId` and the action's
`callId`. The engine preserves `callId` across retries and resume and assigns
distinct identities to parallel calls, even with identical payloads. The parent
id alone gives every call in one execution the same machine:

```ts
SandboxedFlow.toLayer(RunChild, Child, ({ executionId, callId }) => ({
  provider,
  session: `child:${executionId}:${callId}`,
  entry
}))
```

## A type error names a registry service the layer does not provide

**Symptom.** `NodeRuntime.layerHost<..., MyCatalog, never, never>(options, registerFlows)`
does not compile.

**Cause.** That is the point. The registry-taking form is a separate overload,
not a defaulted parameter, so a call that names a registry type must also pass
the registry layer. A default would compile and hand back a layer that claims to
provide `MyCatalog` while providing nothing.

**Fix.** Pass the registry layer as the third argument, or drop the registry
type parameters. See
[Discover flows from a registry](./guides/discover-flows-from-a-registry.md).

## `node:sqlite` ended up in a browser bundle

**Symptom.** A browser or edge build pulls in `node:sqlite` or
`node:child_process`.

**Cause.** Something imported `@smthrs/flows/NodeRuntime` or
`@smthrs/flows/SandboxedFlow`. The root entry point is browser-safe; those two
subpaths are not, which is exactly why they are subpaths.

**Fix.** Keep both out of shared code. Durable execution is tested on Node.js 26.4+ and Bun 1.4+; `engines` requires Node `>=26.4.0`. A browser can
author and inspect declarations through the root entry point.
