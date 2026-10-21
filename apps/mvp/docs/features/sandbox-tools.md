# Sandbox tools

A branch's machine is a tool provider: it runs typed tools on the branch's checkout and knows nothing about agents ([decision 0005](../decisions/0005-sandboxes-secrets-and-the-forge.md) Q2). The agent's loop stays in the browser ([0011](../decisions/0011-the-agent-runs-in-the-browser.md)) and calls the tools as flows, exactly as a person's slash command and the API do. This page covers features 5 and 7's first slice: the tools, the machine's sleep and wake, and who may call them.

```
browser (leader tab's engine)                 ChatApi                        FlowExecution DO           SandboxObject DO + container
 agent cell ─ ctx.call("sandbox/run") ┐
 /run in the composer ────────────────┼─▶ sandbox/run ─ start ─▶ POST /api/sandbox/calls ─▶ sandbox/Call ─▶ tool(): wake, SandboxTools.execute
 POST /api/sandbox/calls (API) ───────┘                result ─▶ GET  /api/sandbox/calls/<id>   │ settle      as the person's user
                                                                    ▲ sandbox_calls row ◀────────┘
```

## The tools

Six client flows, all model-invocable (`src/features/sandbox/flows.ts`). Their inputs and outputs are `@smthrs/sandbox`'s `SandboxTools` schemas, and paths are relative to the checkout, `/workspace`.

| Flow | Slash | Input | Answers |
|---|---|---|---|
| `sandbox/run` | `/run <command>` | `command`, `cwd?`, `timeoutSeconds?` (60, at most 600) | `exitCode`, `timedOut`, `stdout`, `stderr` (64 KiB each), their sizes, `truncated` |
| `sandbox/read` | `/read <path>` | `path` | `content` (1 MiB), `bytes`, `truncated` |
| `sandbox/write` | `/write <path> <content>` | `path`, `content` (1 MiB) | `path`, `bytes` |
| `sandbox/list` | `/ls [path]` | `path?` | `entries [{ name, kind, bytes }]` (1,000), `truncated` |
| `sandbox/status` | `/status` | none | `branch`, `entries [{ path, index, worktree, from? }]` |
| `sandbox/diff` | `/diff` | `paths?` | a unified diff from the last commit, new files included (256 KiB), `bytes`, `truncated` |

## The flows

Each tool's flow is two steps on this device's engine (`src/features/sandbox/steps.ts`):

```
sandbox/<tool>/start: POST /api/sandbox/calls { callId, call, conversationId | answerId }
  ─▶ sandbox/<tool>/result: GET /api/sandbox/calls/<id>, again every 250 ms to 2 s while it runs (20 minutes at most)
```

- **The call's id** is the version 5 UUID of the run's execution id (`CALL_ID_NAMESPACE`). A step run again, after a crash or with the tab closed and reopened, names the same call; ChatApi answers it as it stands, and the machine never runs it twice.
- **Where it runs:** the agent's call is a child of its answer's run, so it names the answer, and ChatApi uses that answer's conversation's branch, however the person's tab moved since. A person's call names the conversation their tab showed (`conversationId`, pinned by `src/features/sandbox/actions.ts`; a person never types it). A call that names neither is refused `invalid`.
- **Failures:** `SandboxCallRefused` (`sign_in`, `forbidden`, `locked`, `not_found`, `invalid`), `SandboxCallFailed` with the machine's reason, `SandboxCallUnavailable` while ChatApi is unreachable, and `SandboxCallRunning` while the machine works. The agent sees a failure's kind, never its message.

## The routes

`worker/branch/SandboxCalls.ts`:

| Request | Answer |
|---|---|
| `POST /api/sandbox/calls` (3 MiB at most) | `202 { callId, status: "running" }` new; `200` with how it stands for the same call again |
| | `401 authentication`; `400` / `413 invalid`; `404 not_found` (no such answer or conversation); `403 forbidden`; `409 locked`; `409 id_taken`; `503 unavailable` |
| `GET /api/sandbox/calls/<id>` | `200 { callId, status, result? , failure? }`; `404` for a call that isn't yours |

**Who may call a tool.** Every call checks the person who asked, now, with `worker/branch/Access.ts`'s `branchAccess`, the same check the terminals use:

- they must be able to **edit** the branch (`canEdit`: its owner, or shared with them to edit, never above their role). A person who can only **view** it can't run tools;
- the branch must not be `locked`: the default branch has no machine for people, and agents never touch `main`;
- the agent acts for the person who asked: ChatApi takes an agent's call only from the person whose question its answer is for, and runs it under their role and as their own user in the machine. No tool pushes, approves or merges: the machine's forge is read-only (`GitProxy.uploadPack`).

## The remote flow

`sandbox/Call { callId, ownerId, branch, call }` (`worker/flows/SandboxCall.ts`) runs on the `FlowExecution` Durable Object, one execution per call (`sandbox-call:<id>`):

```
sandbox/Tool (wake the machine, run the tool as the person's user) ─▶ sandbox/Settle (done, with the result)
     └ refused, lost, no machine, no checkout ─▶ sandbox/ToolFailed ─▶ sandbox/Settle (failed, with why)
```

The tool's result is `sandbox/Tool`'s journaled success, so a replay reads it and never runs the tool again. A step tried again after an interrupted attempt finds the command's fence and answers what the first attempt recorded, or settles `lost` when that attempt never finished or its machine restarted since: a command never runs twice. Refusals, `lost` and a refused checkout aren't retried; an unreachable machine is, for 2 minutes.

`sandbox_calls` (`db/migrations/0024_sandbox_calls.ts`) keeps one row per call: the branch, the person, the answer for the agent's calls, the tool, `running`, `done` with the result, or `failed` with why. The result is content for the person who asked; nothing logs it, and it isn't synced.

## The machine

`SandboxObject.tool` (`worker/BranchSandboxes.ts`) wakes the machine (start, checkout, restore) and hands the call to `worker/branch/Machine.ts`:

- **As the person:** the call runs as their own user (`worker/branch/Users.ts`), made on first use, through `@smthrs/platform-cloudflare`'s `ContainerSession`, the container as a `Sandbox.Session`.
- **At most once:** a command's fence, exit and output live in that user's `~/.smithers/calls/<call id>`, outside the checkout (`SandboxTools.execute`). That disk goes with the machine, so the object also records the generation it started each command on: a command an earlier generation started settles `lost` on a restarted machine and never runs again (0005's `MachineLost`).
- **No secrets inside:** the machine has no internet and no credential. Its only way out is the forge proxy, and, with `SANDBOX_SECRETS` on (off by default), the secrets egress for every other host, whose placeholders the tools' commands get as their environment ([secrets](secrets.md#wiring-into-the-box)).

## Sleep and wake

- **Create on demand:** the first call or terminal wakes the machine: it starts the container, clones the branch and puts back the last checkpoint.
- **Keep awake while used:** each wake starts that generation's `sandbox/Keep` (`worker/flows/SandboxKeep.ts`, once per generation: `sandbox-keep:<branch>:<generation>`). Every `KEEP_EVERY_SECONDS` (5 minutes) it asks the machine whether anything happened within the idle time (`SANDBOX_IDLE_SECONDS`, 15 minutes): a call, terminal input, or a person's process other than their shells and tmux. Busy, it asks again later; asking also keeps Cloudflare's 30-minute inactivity timeout, the backstop, from firing. A machine never sleeps while a person's process runs.
- **Sleep when idle:** the machine saves the working copy, then stops; `sandbox/Slept` ends that generation's open terminals `slept`. A machine whose checkpoint can't be saved stays awake.
- **Resume with the working copy:** the working copy is saved as a checkpoint (`SandboxTools.checkpoint`: its commit and a binary patch with every tracked and untracked change, 8 MiB at most) in the object's storage after every `run` and `write`, whenever a terminal socket closes, and before sleep. The next generation's first wake resets to that commit and applies the patch, once.

## Configuration

| Setting | Default | What |
|---|---|---|
| `SANDBOX_IDLE_SECONDS` | `900` | how long a machine stays awake with nothing happening in it before `sandbox/Keep` puts it to sleep. Read by the `FlowExecution` Durable Object |
| `SANDBOX_SECRETS` | `false` | whether the box's other outbound requests reach the secrets egress and it gets its placeholders ([secrets](secrets.md#wiring-into-the-box)). Read by `SandboxObject` |

## Observability

Content-free: ids, tools, outcomes, exit codes, statuses, counts and durations; never a command, a path, a file's content or output.

| Where | Records |
|---|---|
| ChatApi | `sandbox.call`, `sandbox.result` (logs, spans), `smithers_sandbox_call_requests{route,outcome}` |
| `sandbox/Call` | `sandbox.tool`, `sandbox.call` (logs), `sandbox.call.tool`, `sandbox.call.settle` (spans), `smithers_sandbox_calls{tool,outcome}` |
| `sandbox/Keep` | `sandbox.keep`, `sandbox.slept` (logs, spans), `smithers_sandbox_keeps{outcome}` |
| `SandboxObject` | `sandbox.object.tool`, `sandbox.object.sleep`, `sandbox.checkpoint.save`, `sandbox.checkpoint.restore` (spans), `smithers_sandbox_checkpoints{op,outcome}`, and `@smthrs/sandbox`'s `sandbox.tool` span |
| Browser (`SANDBOX_TELEMETRY`) | `sandbox.call`, `sandbox.call.start`, `sandbox.call.post`, `sandbox.call.result`, `smithers_web_sandbox_calls{tool,outcome}` |

## Tests

| Kind | Where |
|---|---|
| SDK | `@smthrs/sandbox`'s `test/SandboxTools.test.ts` (real shell and git in a scratch directory); `@smthrs/platform-cloudflare`'s `test/ContainerSession.test.ts` |
| Unit | `worker/branch/SandboxCalls.test.ts`, `worker/branch/Machine.test.ts`, `worker/flows/SandboxCall.test.ts`, `worker/flows/SandboxKeep.test.ts`, `src/features/sandbox/sandbox.test.ts` |
| End to end | `e2e/sandbox-tools.spec.ts` against `alchemy dev` with Docker: the agent writes a file, runs a test command and shows the diff; a command whose tab closed mid-run is recorded once |

## What's not built

- Jobs (`job/Run`), previews, snapshots, and the Code Storage work-in-progress branch 0005 names for checkpoints; the checkpoint lives in the branch object's storage.
- Sandbox budgets wait until we ship ([todo.md](../todo.md#sandbox-budgets-before-we-ship)).
- `SANDBOX_SECRETS` on by default: it waits for an e2e through a real box ([secrets](secrets.md#wiring-into-the-box)).
