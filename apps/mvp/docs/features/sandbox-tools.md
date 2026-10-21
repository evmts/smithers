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

The tool's result is `sandbox/Tool`'s journaled success, so a replay reads it and never runs the tool again. A step tried again after an interrupted attempt finds the command's fence and answers what the first attempt recorded, or settles `lost` when that attempt never finished or its machine restarted since: a command never runs twice. Refusals, `lost`, a refused checkout and a start that ran past `SANDBOX_START_TIMEOUT_SECONDS` (`start_timeout`) aren't retried; an unreachable machine is, for 2 minutes.

`sandbox_calls` (`db/migrations/0024_sandbox_calls.ts`) keeps one row per call: the branch, the person, the answer for the agent's calls, the tool, `running`, `done` with the result, or `failed` with why. The result is content for the person who asked; nothing logs it, and it isn't synced.

## The machine

`SandboxObject.tool` (`worker/BranchSandboxes.ts`) wakes the machine (start, checkout, restore) and hands the call to `worker/branch/Machine.ts`:

- **As the person:** the call runs as their own user (`worker/branch/Users.ts`), made on first use, through `@smthrs/platform-cloudflare`'s `ContainerSession`, the container as a `Sandbox.Session`.
- **Numeric users:** a deployed container's `exec` refuses a user name and runs a bare uid as root, so every command runs as a `uid:gid`: root `0:0`, the checkout's `smithers` `1000:2000`, and a person `100000` plus 30 bits of their user name's hash, in the `workspace` group `2000`. `exec` gives a command only `PATH`, so each also gets `HOME`, `USER`, `LOGNAME` and `LANG=C.UTF-8`. Under Cloudflare's `durable_object` policy every process keeps root's capabilities whatever its user: these users give files and shells an owner; they don't isolate one editor of a branch from another.
- **Size:** the machine starts on `SANDBOX_INSTANCE`, `standard-1` by default (1/2 vCPU, 4 GiB, 8 GB of disk). Cloudflare's own default, `lite`, has 256 MiB.
- **At most once:** a command's fence, exit and output live in that user's `~/.smithers/calls/<call id>`, outside the checkout (`SandboxTools.execute`). That disk goes with the machine, so the object also records the generation it started each command on: a command an earlier generation started settles `lost` on a restarted machine and never runs again (0005's `MachineLost`). A record lasts a day (`RUN_RECORD_MS`), far past the call's 2-minute retry; each new command drops the older ones.
- **The forge route:** the container sends `forge.smithers.internal` to ChatApi's own entrypoint (`ctx.exports.default`, with `props` naming the branch's object), Cloudflare's documented intercept target; ChatApi hands each request back to that object, which answers it with the read-only git proxy. A Durable Object's stub as the target worked under `alchemy dev` and never reached the object in production.
- **No secrets inside:** the machine has no internet and no credential. Its only way out is the forge proxy, and, with `SANDBOX_SECRETS` on (off by default), the secrets egress for every other host, whose placeholders the tools' commands get as their environment ([secrets](secrets.md#wiring-into-the-box)).

## Sleep and wake

- **Create on demand:** the first call or terminal wakes the machine: it starts the container, clones the branch and puts back the last checkpoint.
- **Keep awake while used:** each wake starts that generation's `sandbox/Keep` (`worker/flows/SandboxKeep.ts`, once per generation: `sandbox-keep:<branch>:<generation>`). Every `KEEP_EVERY_SECONDS` (1 minute) it asks the machine whether anything happened within the idle time (`SANDBOX_IDLE_SECONDS`, 15 minutes): a call, a terminal opened, terminal input, or a person's process other than their shells and tmux. Busy, it asks again later, so an idle machine sleeps 15 to 16 minutes after its last activity. A machine never sleeps while a person's process runs; a shell busy only with its own builtins, such as `while :; do :; done`, doesn't count as one, and neither does a zombie: the box's PID 1, `sleep infinity`, never reaps orphans, so a background `git` that exited would otherwise keep the machine awake for good.
- **Cloudflare's backstop:** a 30-minute inactivity timeout stops a container whose sleep never ran. A Durable Object that restarts (every deploy) loses it, and Cloudflare then stops the container soon after the object goes idle, process or not. So the object re-arms it in its constructor and on every ask, socket and sharing change (`SandboxObject.rearm`), not only on a wake.
- **Sleep when idle:** the machine saves the working copy, then stops; `sandbox/Slept` ends that generation's open terminals `slept`. A machine whose checkpoint can't be saved stays awake, and so does one that a call, a terminal or terminal input reached while it saved: it probes again just before it stops.
- **Resume with the working copy:** the working copy is saved as a checkpoint (`SandboxTools.checkpoint`: its commit, a binary patch with every tracked and untracked change, and a git bundle of the commits no remote has, such as one made in the terminal; 8 MiB at most) in the object's storage after every `run` and `write`, at `sandbox/Keep`'s next ask after a terminal socket closes (within a minute; a save run from the closed socket's own request was killed), and before sleep. The next generation's first wake fetches that commit from the bundle (fetching the bundle's base from the forge when the branch moved past the shallow clone) or from the forge by its id, resets to it and applies the patch, once. Ignored files, such as `node_modules`, and running processes don't carry over.
- **Never lose a checkpoint:** a wake whose restore can't reach the machine or the forge fails and is tried again before anything saves over the checkpoint. A checkpoint that can't go on the fresh checkout (its commit is gone everywhere, or its patch won't apply) is kept aside in the object's storage as `stranded:<seq>`, and the machine starts from the branch.

## Configuration

| Setting | Default | What |
|---|---|---|
| `SANDBOX_IDLE_SECONDS` | `900` | how long a machine stays awake with nothing happening in it before `sandbox/Keep` puts it to sleep. Read by the `FlowExecution` Durable Object |
| `SANDBOX_INSTANCE` | `standard-1` | the Cloudflare instance type a machine starts on: `lite`, `basic` or `standard-1` to `standard-4`. Read by `SandboxObject` |
| `SANDBOX_START_TIMEOUT_SECONDS` | `150` | the longest a stopped machine's container may take to start. Past it the wake fails: a tool call settles `failed` with `start_timeout` (not retried) instead of staying `running`, and the start counts in `smithers_cloudflare_sandbox_start_timeouts`. Read by `SandboxObject` |
| `SANDBOX_SECRETS` | `false` | whether the box's other outbound requests reach the secrets egress and it gets its placeholders ([secrets](secrets.md#wiring-into-the-box)). Read by `SandboxObject` |

## Observability

Content-free: ids, tools, outcomes, exit codes, statuses, counts and durations; never a command, a path, a file's content or output.

| Where | Records |
|---|---|
| ChatApi | `sandbox.call`, `sandbox.result` (logs, spans), `smithers_sandbox_call_requests{route,outcome}` |
| `sandbox/Call` | `sandbox.tool`, `sandbox.call` (logs), `sandbox.call.tool`, `sandbox.call.settle` (spans), `smithers_sandbox_calls{tool,outcome}` |
| `sandbox/Keep` | `sandbox.keep`, `sandbox.slept` (logs, spans), `smithers_sandbox_keeps{outcome}` |
| `SandboxObject` | `sandbox.object.tool`, `sandbox.object.sleep`, `sandbox.checkpoint.save`, `sandbox.checkpoint.restore` (spans), `smithers_sandbox_checkpoints{op,outcome}`; `sandbox.wake` and `sandbox.object.session` warnings with the failed `stage` (`start`, `checkout`, `restore`, `placeholders`) and the error's code; `@smthrs/platform-cloudflare`'s `cloudflare.sandbox.wake`, `cloudflare.sandbox.rearm` and `@smthrs/sandbox`'s `sandbox.tool` span |
| Browser (`SANDBOX_TELEMETRY`) | `sandbox.call`, `sandbox.call.start`, `sandbox.call.post`, `sandbox.call.result`, `smithers_web_sandbox_calls{tool,outcome}` |

## Tests

| Kind | Where |
|---|---|
| SDK | `@smthrs/sandbox`'s `test/SandboxTools.test.ts` (real shell and git in a scratch directory); `@smthrs/platform-cloudflare`'s `test/ContainerSession.test.ts` |
| Container | `worker/branch/Probe.docker.test.ts`: the idle probe in a real branch-sandbox container (skips without Docker): a zombie doesn't keep the machine awake, a running process does |
| Unit | `worker/branch/SandboxCalls.test.ts`, `worker/branch/Machine.test.ts`, `worker/flows/SandboxCall.test.ts`, `worker/flows/SandboxKeep.test.ts`, `src/features/sandbox/sandbox.test.ts` |
| End to end | `e2e/sandbox-tools.spec.ts` against `alchemy dev` with Docker: the agent writes a file, runs a test command and shows the diff; a command whose tab closed mid-run is recorded once |

## What's not built

- Jobs (`job/Run`), previews, snapshots, and the Code Storage work-in-progress branch 0005 names for checkpoints; the checkpoint lives in the branch object's storage.
- Sandbox budgets wait until we ship ([todo.md](../todo.md#sandbox-budgets-before-we-ship)).
- `SANDBOX_SECRETS` on by default: it waits for an e2e through a real box ([secrets](secrets.md#wiring-into-the-box)).
