# Remote flows

A remote flow is a `@smthrs/flow` flow that runs on Cloudflare instead of in the browser. Each execution runs in its own Durable Object, `FlowExecution`, which ChatApi hosts. The object wakes itself with its alarm and drives the same durable engine the Node, Bun and browser hosts run, over Postgres through Hyperdrive.

## When a flow runs remotely

Flows run locally first ([decision 0011](../decisions/0011-the-agent-runs-in-the-browser.md) §2, [`flows.local-first-placement`](../rules.md#flowslocal-first-placement)). A flow runs here only when it needs something the browser doesn't have:

- a key the person must not hold, such as the Code Storage organization key;
- a machine to run code on;
- something that must happen while every device is off, such as a webhook or a schedule.

How long a flow takes never decides. The host runs `probe/Pause`, which proves the host and does nothing else; `chat/Expire`, which settles an answer still streaming 25 minutes after it was asked, because it must happen while every device is off ([agent.md](agent.md#settling)); and, when sign-in is configured, `auth/RecheckRole`, which checks a session's role with GitHub using the session's GitHub token, a key the browser must not hold ([sign-in.md](sign-in.md#roles-and-role-checks)), and `auth/RevokeGitHubToken`, which revokes a signed-out session's GitHub token as the App, with the App's client secret ([sign-in.md](sign-in.md#signing-out)). When the deployment has a Code Storage organization, it also runs `repo/Clone`, which clones a public GitHub repository with the organization's key ([repo.md](repo.md#the-clone)).

## How an execution runs

```
caller ── FlowExecution.getByName(executionId).start(intent) ──▶ Durable Object
                                                                   │ store the intent, alarm at now + 5 s, alarm at now
alarm ◀─────────────────────────────────────────────────────────────┘
  │ count the attempt, arm the alarm one backoff away (the watchdog)
  │ build the engine for this execution over Postgres (schema smithers_flows), drive it once
  ├─ settled ──▶ delete the alarm
  ├─ parked  ──▶ alarm at the engine's next wake, such as a durable sleep's end
  └─ failed  ──▶ alarm one backoff away (1 s, doubling, at most 5 min, never giving up)
```

- **One object per execution.** The object's name is the execution id, so a retried start reaches the object that already holds the intent. The same intent again is a no-op; a different payload is an `IntentConflict`.
- **The object holds only the intent and a failure count.** Leases, attempts, timers and retries stay in the engine's Postgres tables, in the schema `smithers_flows` beside the app's tables. Each alarm opens its own connection and closes it when the alarm ends.
- **A reset object resumes the run.** If the object dies mid-step (an evicted isolate, a reset, a deploy), the watchdog alarm wakes a new incarnation one backoff later. It takes the run over at once, replays what the engine recorded and runs the interrupted step again. A step runs at least once, so a step with an outside effect must be idempotent.
- **The engine migrates its own schema** on the first alarm that builds it. `pnpm db:migrate` doesn't apply the engine's migrations yet.

The package behind it is [`@smthrs/platform-cloudflare`](../../../../packages/smithers/flows/platform-cloudflare/README.md); its [execution lifecycle](../../../../packages/smithers/flows/platform-cloudflare/docs/concepts/execution-lifecycle.md) states each guarantee.

## Files

| File | What it holds |
|---|---|
| `worker/flows/Pause.ts` | `probe/Pause`: marks a label, sleeps on a durable timer, marks it again. Host-agnostic: the host injects what a step does. |
| `worker/flows/Expire.ts` | `chat/Expire`: `chat/ExpiresAt` (the answer's `created_at` plus `ANSWER_EXPIRY`, sealed), a durable sleep until then, and `chat/Abandon`, which settles the answer `failed`, `abandoned` only if it still streams. The host injects Postgres and the expiry. |
| `worker/flows/RecheckRole.ts` | `auth/RecheckRole`: refreshes a session's GitHub token when it is about to expire and records the person's role again. The host injects Postgres and GitHub. |
| `worker/flows/RevokeGitHubToken.ts` | `auth/RevokeGitHubToken`: revokes an ended session's GitHub token on GitHub, then forgets the session's GitHub tokens; after its step's last attempt, forgets them anyway. The host injects Postgres and GitHub. |
| `worker/flows/RepoClone.ts` | `repo/Clone`: Inspect, Import, Pull, AwaitSync and Settle ([repo.md](repo.md#the-clone)). The host injects Postgres, Code Storage and GitHub; `ExecutionHost.withRepoClone` adds it when `CODE_STORAGE_ORG` and `CODE_STORAGE_KEY` are set (`worker/RepoConfig.ts`). |
| `worker/ExecutionHost.ts` | The object's `start` and `alarm` handlers over its storage, the flows it may run (`remote(app)`, over the app's tables and the answer expiry, and `remoteWithSignIn(app, services)` when sign-in is configured), the engine's schema and `intent`, which builds a start request. |
| `worker/Executions.ts` | The Alchemy Durable Object `FlowExecution`, which hands its storage, id and Hyperdrive connection to `ExecutionHost`, reads `ANSWER_EXPIRY`, and adds sign-in's services when they are configured. |
| `worker/ChatApi.ts` | Hosts `FlowExecution`, binds its namespace, starts `auth/RecheckRole` and `auth/RevokeGitHubToken` for sign-in, and gives the remote door ([flows](flows.md#the-remote-door)) and `POST /api/questions` (`worker/Chat.ts`, which starts `chat/Expire`) their `FlowStarter`. |

Only the Worker entries (`worker/ChatApi.ts`, `worker/index.ts`, `worker/Executions.ts`, `worker/ExecutionHost.ts`), `alchemy.run.ts` and `infra/` may import Cloudflare or `@smthrs/platform-cloudflare` ([`sdk.host-agnostic-flows`](../rules.md#sdkhost-agnostic-flows)). A remote flow lives in `worker/flows/` and never imports them.

## Starting an execution

ChatApi starts `chat/Expire` when it takes a question (`202`, and a resend's `200`), through the same `FlowStarter` the remote door uses, one execution per answer (`chat-expire-<answerId>`), without waiting for it; a start the host can't record is logged `not_started` and the ask still succeeds ([agent.md](agent.md#settling)). It starts `auth/RecheckRole` from sign-in's `RoleChecks`, one execution per session and the check it replaces (`auth-recheck-<sessionId>-<role_checked_at in epoch ms>`), without waiting for it, so one check of a session runs at a time ([sign-in.md](sign-in.md#roles-and-role-checks)). It starts `auth/RevokeGitHubToken` from sign-in's `TokenRevocations` when a session ends at sign-out, one execution per session (`auth-revoke-<sessionId>`), without waiting for it either ([sign-in.md](sign-in.md#signing-out)). A handler starts a remote flow like this:

```ts
const executions = yield* Executions.FlowExecution // in ChatApi's init
// in the handler, after it authorizes and bounds the request:
const intent = yield* ExecutionHost.intent(Clone, { executionId, payload })
yield* executions.getByName(executionId).start(intent)
```

The response returns once `start` does; the flow runs from the object's alarm.

## Adding a remote flow

1. Write the flow in `worker/flows/` with `Flow.make` and a registration built with `Interpreter.layerWithImplementations`, as `Pause.ts` does.
2. Add it and its registration to `remote` in `worker/ExecutionHost.ts`.
3. Test it on the Node host with `runFlow` from `worker/test/flowHost.ts`.

Child flows don't run on this host yet: `@smthrs/platform-cloudflare` doesn't route a child execution to its own object. Keep remote flows to steps and durable waits until it does.

## Tests

| Test | Proves |
|---|---|
| `worker/flows/Pause.test.ts` | `probe/Pause` runs to the end on the Node host (`Runtime.layer` with `@smthrs/platform-node`) over the compose Postgres, waits for its timer, and fails with its declared error on a negative pause |
| `worker/flows/Expire.test.ts` | `chat/Expire` on the Node host: it sleeps until the answer is old enough, settles a streaming one `abandoned`, leaves a settled one, and a device that comes back after it fails `AnswerSettled` ([agent.md](agent.md#tests)) |
| `worker/flows/RepoClone.test.ts` | `repo/Clone` on the Node host, including a run killed mid-step that a new engine resumes with no second create ([repo.md](repo.md#tests)) |
| `worker/ExecutionHost.test.ts` | `start` wakes the object at once; the first alarm parks on the durable timer with the alarm armed for it; the next settles the run and deletes the alarm; each start and alarm logs and counts its outcome without the payload; the deployed flows run `chat/Expire` through its durable sleep to the answer's settling |
| `worker/ExecutionHost.workerd.test.ts` | in local workerd (Miniflare), a real Durable Object runs `probe/Pause` from real alarms; its second step calls `ctx.abort()`, and the retried alarm's new incarnation takes the run over and completes it |

The workerd test's object (`worker/test/workerd/worker.ts`) is a plain Durable Object that hands its storage and id to `ExecutionHost`, as `FlowExecution` does under Alchemy. `FlowExecution` itself runs only in Alchemy's bundle, under `alchemy dev` or a deploy.

Run them with the compose Postgres up (`pnpm db:up`):

```sh
pnpm exec vitest run worker/flows/Pause.test.ts worker/ExecutionHost.test.ts worker/ExecutionHost.workerd.test.ts
```

## Observability

Each start and alarm logs, traces and counts itself, and so does each probe step. [observability.md](../observability.md#remote-flow-executions) lists the records.
