# Smithers libraries

Smithers ships a library for most jobs an agent or a maintainer codes by hand.
Before you write code that calls a model, runs an agent loop, makes a durable
workflow, renders UI, or touches GitHub, find the job below and use that
library. Hand-rolling one needs a stated reason in the change, such as a
missing feature and the issue that tracks it.

Paths are relative to the repository root. A package is published to npm under
the `next` tag unless it is marked *private*. Every library takes `effect`
4.0.5 as a peer dependency. Each package's `README.md` and `docs/` hold the
full API; the name in each table links to the best starting page.

## Which library for which job

| Job | Library | Call |
| --- | --- | --- |
| Call a model: streaming, any provider, OpenAI-compatible APIs | `@smthrs/model` | `Route.openaiChatCompatible`, `Route.anthropic`, `Route.layer`, then `Model.Model` and `model.stream(request)` |
| Serve a model to browsers or other hosts over HTTP, and stream from one as a `Model` | `@smthrs/model` | `ModelProxy.serve({ prepare: ModelProxy.policy(...) })` on the server, `ModelProxy.layerClient({ url })` on the client |
| Pick a host's model from configuration, with keys kept on their origin | `@smthrs/model-host` | `HostModel.layerConfig("CHAT_MODEL", fallback)`, then `yield* HostModel` |
| Decide inside a flow: classify, filter, rank, yes or no over items | `@smthrs/model` | `Classifier.make` with the host `Evaluator`, one request with one question per item, never a model seat |
| Run an agent loop with tools | `@smthrs/agent` | `AgentAction.make` for one typed step; `AgentSession.layer` for a run an operator can steer and approve |
| Give an agent standard tools: read, edit, grep, bash, tests, fetch, web search | `@smthrs/std` | `Manifest.flows`, `Manifest.handlers`, `Read.run`, `Bash.run` |
| Give an agent an MCP server's tools | `@smthrs/mcp` | `McpFlows.connected(...)`, then `.bindings()` |
| Make a durable workflow | `@smthrs/flow` | `Flow.make("<tag>", {...})` and `Action.make` at `.smithers/flows/<name>/flow.ts` |
| Retry, sleep durably, wait for a person or a webhook | `@smthrs/flow` | `RetryPolicy.make`, `DurableClock.sleep`, `HumanTask`, `WaitFor`, `Poll.make` |
| Run a review loop, bounded fan-out, saga or escalation | `@smthrs/patterns` | `ReviewLoop.run`, `Bounded.all`, `Saga.run`, `WithRetry.withRetry` |
| Run flows in a Node or Bun program | `@smthrs/flows` | `NodeRuntime.layerHost` or `BunRuntime.layerHost`; tests use `FlowEngine.layerMemory` from `@smthrs/engine` |
| Run this repository's chores: land, claim an issue, sync docs, cut a release | `.smithers/flows` | `pnpm exec smthrs flow start <name> --data '<json>' --wait` |
| Touch GitHub from product code: API calls, comments, labels, webhooks | `@smthrs/integrations` | `GitHub.GitHubClient.make`, `GitHub.Actions.CommentOnIssue`, `Core.Channel.make` |
| Comment on, label or close an issue in this repository | `issue-claim` flow | `pnpm issue-claim claim\|comment\|release <repo>#<n> --by <agent/session>` |
| Render UI: buttons, pills, KPI tiles, chat, diffs, Markdown, themes | `@smthrs/ui` | `SmithersUiStyles` once at the root, then `Button`, `StatusPill`, `KpiStat`, `EmptyState`, `ChatTranscript`, `ChatComposer`, `DiffHunks`, `Markdown` |
| Share a route, schema or card contract between the app, the Worker and the TUI | `@smthrs/rpc` | `AgentInstructions`, `ConfiguredModel` and the other modules it exports |
| Spawn a process or touch the filesystem | `@smthrs/platform-node`, `-bun`, `-browser` | Provide `NodeHost.layer`, `BunHost.layer` or `BrowserHost.layer`; library code asks for Effect's `FileSystem` and `ChildProcessSpawner` |
| Gate every file, process and network effect behind allow, deny or ask | `@smthrs/kernel` | `HostServices.layer`, `GrantStore.layer`, `Workspace.layer` |
| Run commands on a container, microVM, Kubernetes Pod or cloud sandbox | `@smthrs/sandbox` | `Sandbox.layerHost(provider, ...)`, `ContainerSandbox.make`, `CloudflareSandbox.make` |
| Read, snapshot or diff a jj working copy | `@smthrs/jj` | the `Jj` service; adapters `NodeJj.layerAt`, `BrowserJj.layer` |
| Write SQL with transactions, lock retries and migrations | `@smthrs/database` | `DurableWriter.layer`, `Migrations.layer`, plus one driver layer |
| Store large blobs by content hash | `@smthrs/artifacts` | `ArtifactStore.layerFileSystem`, `ArtifactStore.layerMemory`, `RemoteArtifacts.layer` |
| Remember and recall facts, notes and message history | `@smthrs/memory` | `Flows.runRemember`, `Flows.runRecall`, `MemoryStore.layer` |
| Start flows on a cron schedule or a verified webhook | `@smthrs/triggers` | `Trigger.make`, `Scheduler.layer`, `Webhook.make` |
| Start, approve, steer, cancel or watch runs from code | `@smthrs/control` | `Control.Control` with `ControlLive.layer` in process, or `ControlClient.layer({ url, credential })` |
| Follow a run's events live in a browser | `@smthrs/sync` | `SyncClient.layer`, `SyncServer.layer` |
| Queue notifications or send coalesced alerts | `@smthrs/notifications` | `NotificationQueue.layer`, `Alerts.layerWebhook` |
| Send logs, metrics and traces to OpenTelemetry | `@smthrs/observability` | `Otlp.layerFetch`, `Logger.layerStructuredJson`, `JournalLogger.layerJournalForwarding` |
| Receive a browser's OTLP telemetry in your own Worker and log it | `@smthrs/observability` | `OtlpRelay.serve()` under `/api/telemetry` |
| Hash, canonicalize JSON or derive a stable key | `@smthrs/crypto`, `@smthrs/canonical`, `@smthrs/keys` | `digest`, `canonicalize`, `deriveKey` |
| Test a flow without a live model | `@smthrs/testing` | `ScriptedModel.make`, `CachedModel.make`, `TestHost.layer`, `PlanAssertions`, `JournalAssertions` |
| Run an eval suite against a committed baseline | `@smthrs/evals`, `@smthrs/scorers` | `Suite.make`, `Runner.run`, `Regression.compare`, `Gate.check`; `Scorer.make`, `Rubric.make` |
| Declare build, test and lint targets | `@smthrs/targets` | `Smithers.Package`, `Smithers.NodeTest`, `Smithers.Typecheck` in `PACKAGE.ts`; run with `pnpm exec smithers-build test //<pkg>:test` |

## Platform rule (Will, 2026-10-19)

A host package owns all platform code: `node:*` modules, `Bun.*`, the DOM,
child processes, sockets and the filesystem. The host packages are
[`@smthrs/platform-node`](../packages/smithers/flows/platform-node/README.md),
[`@smthrs/platform-bun`](../packages/smithers/flows/platform-bun/README.md) and
[`@smthrs/platform-browser`](../packages/smithers/flows/platform-browser/README.md).
They hand that code to every other package as injected Effect services and
layers. Every other library must import and run in a browser, a Cloudflare
Worker, Node and Bun, and consumers import only from a package's root entry. A
package that breaks this has a bug.

Apps, command-line programs and repository flows are composition roots: each
picks a host and may run on one runtime. `@smthrs/ui` renders React, so it runs
in the browser.

**How "Runs on" was checked (2026-10-19).** For every workspace package, esbuild
0.28.2 bundled the root entry with `platform: "browser"` and the conditions
`workerd`, `worker`, `browser`, `import` and `default`. It recorded every
`node:`, `bun:` or bare Node built-in import the bundle reached. **All** means
the root entry reached none, so it imports in a browser, a Worker, Node and
Bun. This is a static import check, not an execution test. Globals such as
`process` and `Buffer` are not covered, and a library may still need a host
layer, such as a SQL driver or `FileSystem`, to do real work. The repository's
gate for this is `//packages/repo-targets:webBundleContract`, which bundles
the entry points listed in `packages/repo-targets/browser/browser-contract.mjs`
for the browser. Workers have no gate. Only `@smthrs/harness` has a Worker
smoke test (`test/WorkerdSmoke.test.ts`, run with `FLOWS_WORKERD_SMOKE=1`).

### Known violations: the root entry reaches platform code

| Package | Root entry reaches | Through |
| --- | --- | --- |
| `@smthrs/std` | `node:fs`, `node:crypto`, `node:path`, `node:url`, `node:net`, `node:dns/promises` | `src/NodeLanguageServer.ts`, `src/internal/HttpNetwork.ts` |
| `@smthrs/integrations` | `node:crypto` | `src/core/Pkce.ts`, `src/core/Signature.ts`, `src/github/Proxy.ts` |
| `@smthrs/testing` | `node:fs`, `node:crypto`, `node:path`, `node:sqlite`, `node:net`, `node:tls` | `src/FixtureStore.ts`; the `@smthrs/database` Node and Postgres test layers |
| `@smthrs/harness-detect` (private) | `node:path` | `src/Probe.ts`, `src/internal/Read.ts` |
| `@smthrs/fs` (private) | `node:fs`, `node:child_process`, `node:async_hooks` and more | the `incur` CLI dependency; `@smthrs/build-cli` `src/Positionals.ts` |
| `@smthrs/migrate` | `node:sqlite`, `node:crypto`, `node:fs`, `node:child_process` | `src/RunState.ts`, `src/Checks.ts`, `src/flow/*` |
| `@smthrs/targets` | `node:fs`, `node:crypto`, `node:child_process`, `node:http` and more (32 source files) | `src/Package.ts`, `src/RemoteCache.ts`, `src/LlmLint.ts` and others |
| `@smthrs/repo-targets` (private) | the same as `@smthrs/targets` | its `@smthrs/targets` import |

### Known violations: platform code on a subpath outside a host package

These roots are clean, but the package carries a platform adapter that belongs
in a host package.

| Package | Subpath | Platform code |
| --- | --- | --- |
| `@smthrs/database` | `node/NodeDatabase`, `bun/BunDatabase`, `postgres/PostgresDatabase` | `node:sqlite`, `bun:sqlite`, `node:crypto` |
| `@smthrs/jj` | `node/NodeJj` | `node:child_process`, `node:fs` |
| `@smthrs/gateway` | `node/NodeGateway`, `bun/BunGateway` | `node:http`, `node:net`, `Bun.serve` |
| `@smthrs/flows` | `NodeRuntime`, `SandboxedFlow` | `node:fs`, `node:os`, `node:crypto` |
| `@smthrs/observability` | `NodeOtel` | `@opentelemetry/sdk-trace-node`, which needs `async_hooks` |
| `@smthrs/testing` | `ModelServer`, `ProcessTable`, `TurnLog` | `node:http`, `node:child_process`, `node:fs` |

## Model calls and agents

| Package | Path | Use it to | Call | Runs on |
| --- | --- | --- | --- | --- |
| [`@smthrs/model`](../packages/smithers/agent/model/docs/README.md) | `packages/smithers/agent/model` | Call Anthropic Messages, OpenAI Responses, OpenAI Chat Completions or any server speaking one of them, and get one typed event stream. Also the Jev judge (`Classifier`, `Evaluator`). | `Route.openaiChatCompatible({ id, providerName, baseUrl, path?, apiKey })`, `Route.layer(route)` with `RequestExecutor.layer` and an Effect `HttpClient`, then `(yield* Model.Model).stream(request)`; `ModelEvent.settledMessage` | All |
| [`@smthrs/agent`](../packages/smithers/agent/docs/README.md) | `packages/smithers/agent` | Run a durable model loop with tools, budgets, rate-limit parking and schema-checked answers. | `AgentAction.make("ns/Name", { payload, output, seat, system, prompt })`, `AgentSession.layer`, `Agent.Agent` | All; standard tools need host `FileSystem` and `ChildProcessSpawner` |
| [`@smthrs/harness`](../packages/smithers/agent/harness/docs/README.md) | `packages/smithers/agent/harness` | Build your own agent host on the cell loop: each model turn writes JavaScript that runs in a persistent QuickJS realm and reaches the world only through `ctx.call`. `@smthrs/agent` already composes it. | `CellTurn.run`, `FlowBinding.make`; the sandbox is `@smthrs/harness/QuickJSSandbox` | All; Worker smoke test |
| [`@smthrs/chain`](../packages/smithers/agent/chain/docs/README.md) (private) | `packages/smithers/agent/chain` | Run a crash-safe loop where a model writes a script whose only side effects are journaled `ctx.call`s. | `Chain.run({ goal })`, `ModelAuthor.layer`, `Journal.layerMemory` | All |
| [`@smthrs/model-host`](../packages/smithers/agent/model-host/README.md) (private) | `packages/smithers/agent/model-host` | Choose a host's model from configuration, and run a chat turn with the owner's provider key that writes each frame to the backend's durable chat journal. | `HostModel.layerConfig`, `createModelTurnHandler`, `runDurableChatTurn` | All; the Node host injects `FetchTransport.observe` from `@smthrs/platform-node` |
| [`@smthrs/std`](../packages/smithers/agent/std/docs/README.md) | `packages/smithers/agent/std` | Give an agent read, write, edit, grep, glob, bash, test, LSP, fetch, web search and apply-patch tools with bounded output and SSRF-safe fetch. | `Manifest.flows`, `Manifest.handlers`, `Read.run`, `Bash.run`, `Edit.run` | Node; **violation**. `Grep`, `Glob`, `Search` and `PortableSearch` subpaths bundle for the browser |
| [`@smthrs/mcp`](../packages/smithers/mcp/docs/README.md) | `packages/smithers/mcp` | Connect to an MCP server over stdio or Streamable HTTP and expose its tools as flows. | `McpFlows.connected({ server, command \| url, env, include })`, then `.bindings()`; `McpClient.connect` | All; stdio needs a host `ChildProcessSpawner` |
| [`@smthrs/registry`](../packages/smithers/agent/registry/docs/README.md) | `packages/smithers/agent/registry` | Discover `flow.ts`, `flow.mdx` and `SKILL.md` flows without running them, list them, show them to a model, or run one by name. | `Registry.layerProject({ root })`, `Registry.layer({ sources })`, `Discovery` | All; needs host `FileSystem` |
| [`@smthrs/memory`](../packages/smithers/agent/memory/docs/README.md) | `packages/smithers/agent/memory` | Keep durable agent memory: facts, notes and message history, with keyword, full-text or semantic recall. | `Flows.runRemember`, `Flows.runRecall`, `MemoryStore.layer`, `RecallKeyword.layer` | All; needs a SQL driver layer |
| [`@smthrs/plugin`](../packages/smithers/agent/plugin/docs/README.md) | `packages/smithers/agent/plugin` | Add a Vite-style typed plugin and hook kernel to an Effect host. | `Kernel.make([plugins])` | All |
| [`@smthrs/harness-detect`](../packages/smithers/agent/harness-detect/README.md) (private) | `packages/smithers/agent/harness-detect` | Find installed coding-agent CLIs (Claude Code, Codex, Gemini, OpenCode and others), their versions, sign-in state and model flag. | `detectHarnessesWith(host)`, `harnessModelSpec`, `harnessModels` | Node; **violation** |
| [`@smthrs/fs`](../packages/smithers/agent/fs/docs/README.md) (private) | `packages/smithers/agent/fs` | Expose a flows directory as named, schema-checked commands for a shell, HTTP, OpenAPI or MCP. | `FileRouter.scan({ root })`, `Command.make(routes)`, `Incur.createCli` | Node; **violation** |

Which to pick: one model call is `@smthrs/model`. An agent with tools is
`@smthrs/agent`. Write against `@smthrs/harness` only when you build a new
agent host. A host that answers with a model chosen by configuration provides
`HostModel.layerConfig` from `@smthrs/model-host`.

## Flows and durability

| Package | Path | Use it to | Call | Runs on |
| --- | --- | --- | --- | --- |
| [`@smthrs/flow`](../packages/smithers/flows/flow/README.md) | `packages/smithers/flows/flow` | Declare durable steps (actions) and the flows that compose them, with retries, durable timers and waits for a person, a webhook or a poll. | `Flow.make("<tag>", { payload, success, body })`, `Action.make`, `.toLayer(impl)`, `RetryPolicy.make`, `DurableClock.sleep`, `HumanTask`, `WaitFor` | All |
| [`@smthrs/flows`](../packages/smithers/flows/README.md) | `packages/smithers/flows` | Get the whole durable engine from one dependency in the program that runs flows. | `NodeRuntime.layerHost(options, registration)` from `@smthrs/flows/NodeRuntime`; `BunRuntime.layerHost` | All for the root; `NodeRuntime` is a subpath **violation** |
| [`@smthrs/core`](../packages/smithers/flows/core/docs/README.md) | `packages/smithers/flows/core` | Inspect a flow before it runs: build its graph, lower Markdown or `SKILL.md` into flow signatures, declare placement and effects. | `Graph.build(flow, payload)`, `Markdown.lowerMarkdown`, `Placement.sandbox` | All |
| [`@smthrs/plan`](../packages/smithers/flows/plan/docs/README.md) | `packages/smithers/flows/plan` | Turn declared work into a hashable keyed action graph and diff two versions. | `Plan.compile`, `PlanDiff.diff`, `Node.capture` | All |
| [`@smthrs/plan-store`](../packages/smithers/flows/plan-store/docs/README.md) | `packages/smithers/flows/plan-store` | Keep compiled plans in SQL as append-only generations. | `PlanStore.layer`, `Migrations.layer` | All |
| [`@smthrs/engine`](../packages/smithers/flows/engine/README.md) | `packages/smithers/flows/engine` | Execute flows in memory for tests, or serve them over RPC and HTTP. | `FlowEngine.layerMemory`, `FlowProxy`, `FlowProxyServer` | All |
| [`@smthrs/engine-store`](../packages/smithers/flows/engine-store/README.md) | `packages/smithers/flows/engine-store` | Compose the durable engine yourself: attempts, owner fencing, durable waits, cache admission and retention. | `EngineStore.layer({ owner, journalSource })`, `Migrations.layer` | All |
| [`@smthrs/journal`](../packages/smithers/flows/journal/README.md) | `packages/smithers/flows/journal` | Keep an append-only, redacted, owner-fenced event history for a run. | `SqlJournal.layer`, `Journal.Journal`, `Redaction` | All |
| [`@smthrs/run-store`](../packages/smithers/flows/run-store/README.md) | `packages/smithers/flows/run-store` | Keep one row per run with fenced ownership. | `RunStore.RunStore`, `AttemptStore` | All |
| [`@smthrs/step-cache`](../packages/smithers/flows/step-cache/README.md) | `packages/smithers/flows/step-cache` | Reuse a finished step's result by input digest, across runs or machines. | `CacheStore.layer`, `RemoteCacheStore`, `CombinedCacheStore` | All |
| [`@smthrs/time-travel`](../packages/smithers/flows/time-travel/README.md) | `packages/smithers/flows/time-travel` | Replay, inspect, fork or rewind a run at a journal frame. | `TimeTravel.layer`, then `replay`, `inspect`, `fork`, `rewind` | All; fork and rewind need jj from the host |
| [`@smthrs/patterns`](../packages/smithers/flows/patterns/README.md) | `packages/smithers/flows/patterns` | Use a bounded pattern: review loop, retry, saga, escalation, bounded fan-out, check suite or merge queue. | `ReviewLoop.run(goal, { maxRounds, produce, review, revise })`, `WithRetry.withRetry`, `Saga.run`, `Bounded.all` | All |
| [`@smthrs/database`](../packages/smithers/flows/database/README.md) | `packages/smithers/flows/database` | Write SQLite or Postgres with transactions, lock-conflict retries and one shared migration ladder. | `DurableWriter.layer()`, `Migrations.layer(sets)`; drivers on subpaths | All for the root; driver subpaths are a **violation** |
| [`@smthrs/artifacts`](../packages/smithers/flows/artifacts/README.md) | `packages/smithers/flows/artifacts` | Store and fetch large blobs by SHA-256 with verified reads, locally or through a shared HTTP cache. | `ArtifactStore.layerFileSystem({ directory })`, `ArtifactStore.layerMemory`, `RemoteArtifacts.layer` | All |
| [`@smthrs/keys`](../packages/smithers/flows/keys/docs/README.md) | `packages/smithers/flows/keys` | Derive a deterministic key for structured data: a cache key, row id or idempotency token. | `deriveKey`, `StoredKey` | All |
| [`@smthrs/canonical`](../packages/smithers/flows/canonical/docs/README.md) | `packages/smithers/flows/canonical` | Serialize JSON byte-stably (RFC 8785) before hashing or comparing. | `canonicalize`, `Canonical` | All |
| [`@smthrs/crypto`](../packages/smithers/flows/crypto/docs/README.md) | `packages/smithers/flows/crypto` | Compute SHA-256 digests without `node:crypto`. | `digest`, `digestSync` | All |

Durable execution needs a SQL store, so it runs on Node or Bun through
`@smthrs/flows`. The support matrix lists browsers as bundle-only and edge
runtimes as unsupported.

## Hosts, permissions and machines

| Package | Path | Use it to | Call | Runs on |
| --- | --- | --- | --- | --- |
| [`@smthrs/platform-node`](../packages/smithers/flows/platform-node/README.md) | `packages/smithers/flows/platform-node` | Provide the filesystem, process, jj and HTTP services on Node, with symlink-safe file access, confined processes, orphan reaping and proxy-aware egress. | `NodeHost.layer`, `NodeHost.layerAt(root)`, `NodeHost.layerContainedAt`, `ScopedProcess.spawn` | Node (host) |
| [`@smthrs/platform-bun`](../packages/smithers/flows/platform-bun/README.md) | `packages/smithers/flows/platform-bun` | Provide the same host services on Bun. | `BunHost.layer`, `BunHost.layerAt(root)`, `BunHost.layerContainedAt` | Bun (host) |
| [`@smthrs/platform-browser`](../packages/smithers/flows/platform-browser/README.md) | `packages/smithers/flows/platform-browser` | Provide `FileSystem`, process spawning and jj in a browser tab over ZenFS, just-bash and wasm jj. | `BrowserHost.layer({ bash, fs, jj })`, `BrowserServices.layer({ bash, fs })` | Browser (host) |
| [`@smthrs/kernel`](../packages/smithers/flows/kernel/README.md) | `packages/smithers/flows/kernel` | Check every filesystem, process, network and jj effect against allow, deny or ask rules before it runs. | `HostServices.layer`, `GrantStore.layer({ attended, rules })`, `Workspace.layer(root)`, `ProcessLedger.layer` | All |
| [`@smthrs/capability`](../packages/smithers/flows/capability/README.md) | `packages/smithers/flows/capability` | Name an operation as a capability and evaluate permission rules, without enforcing them. | `Capability.make`, `Permission.evaluate` | All |
| [`@smthrs/jj`](../packages/smithers/flows/jj/README.md) | `packages/smithers/flows/jj` | Snapshot, restore or diff a jj working copy, and add or forget workspaces, without parsing `jj` output. | the `Jj` service; `NodeJj.layerAt(root)` from `@smthrs/jj/node/NodeJj`, `BrowserJj.layer` | All for the root; `node/NodeJj` is a **violation** |
| [`@smthrs/sandbox`](../packages/smithers/flows/sandbox/README.md) | `packages/smithers/flows/sandbox` | Run a flow's files and commands on a container, microVM, Kubernetes Pod, Vercel, Daytona, AWS or Cloudflare sandbox, or a scratch directory. | `Sandbox.layerHost(provider, { session })`, `ContainerSandbox.make`, `MicrosandboxSandbox.make`, `CloudflareSandbox.make`, `SandboxMerge.apply` | All; providers need a host spawner or a Worker binding |

## Control, GitHub and events

| Package | Path | Use it to | Call | Runs on |
| --- | --- | --- | --- | --- |
| [`@smthrs/control`](../packages/smithers/control/README.md) | `packages/smithers/control` | Plan, start, approve, deny, steer, cancel, resume, list or watch runs from code, through the API the CLI uses. | `Control.Control`; `ControlLive.layer` in process, `ControlClient.layer({ url, credential })` over RPC, `ControlServer.layerHttp` | All |
| [`@smthrs/gateway`](../packages/smithers/gateway/README.md) | `packages/smithers/gateway` | Serve or call the HTTP and WebSocket surface for control RPC, sync, projections and health. | `GatewayServer.layer`, `GatewayProjection`, `GatewaySchema`; servers on `node/NodeGateway` and `bun/BunGateway` | All for the root; server subpaths are a **violation** |
| [`@smthrs/integrations`](../packages/smithers/agent/integrations/docs/README.md) | `packages/smithers/agent/integrations` | Call the GitHub API with rate-limit retry, write back comments, labels and check runs durably, verify webhooks and run OAuth PKCE. | `GitHub.GitHubClient.make`, `GitHub.Actions.CommentOnIssue`, `GitHub.Actions.AddLabels`, `Core.Channel.make` | Node; **violation** |
| [`@smthrs/triggers`](../packages/smithers/agent/triggers/docs/README.md) | `packages/smithers/agent/triggers` | Start flows on a durable cron schedule or a verified webhook, with overlap and catch-up rules. | `Trigger.make({ id, flowId, cron })`, `Scheduler.layer`, `SqlTriggerStore.layer`, `Webhook.make` | All |
| [`@smthrs/notifications`](../packages/smithers/notifications/README.md) | `packages/smithers/notifications` | Keep a durable, bounded queue of notifications per run, and send delayed, coalesced alerts to a webhook. | `NotificationQueue.layer`, `Alerts.layer`, `Alerts.layerWebhook` | All |
| [`@smthrs/sync`](../packages/smithers/flows/sync/README.md) | `packages/smithers/flows/sync` | Replay a run's journal and follow it live over RPC or WebSocket, or serve that read path. | `SyncClient.layer`, `SyncServer.layer`, `SyncAuth.layer` | All |
| [`@smthrs/observability`](../packages/smithers/flows/observability/README.md) | `packages/smithers/flows/observability` | Send logs, metrics and traces to an OTLP collector, or mirror a run's logs into its journal. | `Otlp.layerFetch({ baseUrl, serviceName })`, `Logger.layerStructuredJson`, `JournalLogger.layerJournalForwarding` | All for the root; `NodeOtel` is a **violation** |
| [`@smthrs/errors`](../packages/errors/README.md) | `packages/errors` | Raise or classify integration failures with `SmithersError` and its five codes. | `SmithersError`, `isSmithersError` | All |
| [`@smthrs/rpc`](../packages/rpc/README.md) (private) | `packages/rpc` | Share zod schemas, `/api` route constants, card schemas and failure codes between the app, the Worker and the TUI. | `AgentInstructions`, `ConfiguredModel` from the root; other modules are still imported by path, such as `@smthrs/rpc/Cards` | All |

## UI

| Package | Path | Use it to | Call | Runs on |
| --- | --- | --- | --- | --- |
| [`@smthrs/ui`](../packages/smithers/ui/README.md) (private) | `packages/smithers/ui` | Build any React UI from shared components styled only with theme tokens, in light and dark. | `SmithersUiStyles` (add `withTheme` in a standalone app), `Button`, `Card`, `StatusPill`, `Badge`, `KpiStat`, `EmptyState`, `ChatTranscript`, `ChatComposer`, `ToolCall`, `DiffHunks`, `FileTree`, `Markdown`, `Wordmark`; heavy renderers such as `MarkdownEditor` and `Terminal` on `@smthrs/ui/adapters/*` | Browser, React 19.2.8 |
| [`@smthrs/ui-styleguide`](../packages/smithers/ui/ui-styleguide/README.md) (private) | `packages/smithers/ui/ui-styleguide` | Get the raw CSS tokens and palette registry under `@smthrs/ui`. App code normally gets them through `@smthrs/ui`. | `themeCss`, `themeRegistry`, `contrastRatio` | All |

Add `"@smthrs/ui": "workspace:*"`; npm has only an old 0.35.0. A reusable piece
of UI goes into `@smthrs/ui` with its test and docs, not into an app.

## Build, CLI and release

| Package | Path | Use it to | Call | Runs on |
| --- | --- | --- | --- | --- |
| [`@smthrs/cli`](../packages/smithers/docs/reference/cli/README.md) | `packages/smithers` | Plan, start and watch flows, handle runs and approvals, run evals and run target verbs from one command, `smthrs`. | `smthrs flow list\|plan\|start <name> --data '<json>' --wait`, `smthrs runs list\|logs\|cancel`, `smthrs approvals list\|approve\|deny`, `smthrs eval run`, `smthrs test //<pkg>:test` | Node (program) |
| [`smthrs`](../packages/smthrs-deprecation/docs/replacements.md) | `packages/smthrs-deprecation` | Run `npx smthrs <verb>` without installing `@smthrs/cli`. Importing it throws the 1.0 migration notice. | `npx smthrs@next <verb>` | Node (program) |
| [`@smthrs/build`](../packages/smithers/build/docs/README.md) | `packages/smithers/build` | Install dependencies as a keyed flow held to the declared runtime and pnpm version. | `Install.Install`; `smithers-build install --workspace <path>` | All; needs a host spawner |
| [`@smthrs/build-cli`](../packages/smithers/build/build-cli/docs/cli.md) | `packages/smithers/build/build-cli` | Run `PACKAGE.ts` targets with content-addressed caching, sandboxing and affected-target selection. | `smithers-build test\|run\|ci\|query\|graph\|affected` | Node (program) |
| [`@smthrs/targets`](../packages/smithers/build/targets/docs/rules.md) | `packages/smithers/build/targets` | Declare targets in `PACKAGE.ts` or `WORKSPACE.ts`, including generated CI YAML, secrets and LLM review. | `Smithers.Package`, `Smithers.NodeTest`, `Smithers.Typecheck`, `Smithers.LlmLint`, `Smithers.file`, `Smithers.glob` | Node; **violation** |
| [`@smthrs/repo-targets`](../packages/repo-targets/README.md) (private) | `packages/repo-targets` | Reuse this repository's standard per-package targets and review rules in a `PACKAGE.ts`. | `BuildAndCheckTypeScriptPackage`, `ReviewDocsAgainstCode`, `ReviewJsdocAgainstCode` | Node; **violation** through `@smthrs/targets` |
| [`@smthrs/build-infra`](../packages/smithers/build/infra/README.md) (private) | `packages/smithers/build/infra` | Deploy or change the hosted remote build cache at `build.smithers.sh`. | its `deploy` and `plan` scripts; `worker/CacheWorker.ts` | Cloudflare Worker (program) |
| [`@smthrs/migrate`](../packages/smithers/migrate/docs/README.md) | `packages/smithers/migrate` | Upgrade a 0.x JSX project to 1.0 flows with an auditable report. | `smithers-migrate` or `smthrs migrate`; `Scan`, `Detect`, `Report` | Node; **violation** |

## Testing and evals

| Package | Path | Use it to | Call | Runs on |
| --- | --- | --- | --- | --- |
| [`@smthrs/testing`](../packages/testing/docs/api.md) | `packages/testing` | Test flows deterministically with scripted or recorded models, a memory engine, plan and journal assertions and conformance suites. | `ScriptedModel.make`, `CachedModel.make`, `TestHost.layer`, `PlanAssertions`, `JournalAssertions`, `Conformance.coreSuite`; `@smthrs/testing/Vitest` | Node; **violation** |
| [`@smthrs/evals`](../packages/smithers/agent/evals/docs/quickstart.md) | `packages/smithers/agent/evals` | Run a fixed eval suite against a committed baseline with a CI exit code. | `Suite.make`, `CaseExecutor.make`, `Runner.run`, `Baseline.write`, `Regression.compare`, `Gate.check`; `smthrs eval run\|baseline\|compare` | All |
| [`@smthrs/scorers`](../packages/smithers/agent/scorers/docs/quickstart.md) | `packages/smithers/agent/scorers` | Grade a flow's output with exact, contains, rubric or tests-pass scorers and keep the scores. | `Scorer.make`, `Scorers.exact`, `Scorers.rubric`, `Scorers.testsPass`, `Rubric.make`, `RunnerLive.layer` | All |
| [`@smthrs/eval-agent`](../packages/smithers/agent/regression/README.md) (private) | `packages/smithers/agent/regression` | Check that a change to the `@smthrs/agent` loop did not regress, with offline deterministic cases. | `bun packages/smithers/agent/regression/run.ts` | Bun (program) |
| [`@smthrs/eval-review-seeded-bugs`](../.smithers/flows/review/seeded-bugs/README.md) (private) | `.smithers/flows/review/seeded-bugs` | Measure the review flow's recall and precision on 16 seeded fixture repositories. | `bun test .smithers/flows/review/seeded-bugs`; `run.ts --live` | Bun (program) |
| [`@smthrs/eval-recommend`](../packages/backend/modelhost/recommend-eval/README.md) (private) | `packages/backend/modelhost/recommend-eval` | Score the command recommender: hit@5, top-1 and coverage. | `bun packages/backend/modelhost/recommend-eval/run.ts` | Bun (program) |
| [`@smthrs/eval-authoring`](../evals/authoring/README.md) (private) | `evals/authoring` | Validate or upload the flow-authoring fine-tune dataset. | `pnpm exec smithers-build test '//evals/authoring:test'` | Bun (program) |
| [`@smthrs/eval-swebench`](../packages/smithers/agent/harness/benchmarks/swebench/README.md) (private) | `packages/smithers/agent/harness/benchmarks/swebench` | Benchmark the harness on SWE-bench Verified. Operators run it; it spends real tokens. | `./run-sample.sh`, `./evaluate.sh`, `scorecard.ts` | Bash, Node, Python, Docker |

## Repository flows

`.smithers/flows` (`@smithers/release-workflows`, private) holds this
repository's own flows. Start one instead of writing a script, and never add a
top-level `scripts/` folder. A flow is named by its directory path. Use the
workspace CLI, `pnpm exec smthrs`, because an installed release can lag the
source. See the [flows README](../.smithers/flows/README.md).

| Flow | Use it to | Start |
| --- | --- | --- |
| `land` | Commit the shared checkout to `main`, running the gates first when it pushes. | `pnpm exec smthrs flow start land --data '{"message":"...","push":true,"tests":["..."]}' --wait`; fallback `pnpm commit` |
| `issue-claim` | Claim, comment on, release or close a GitHub issue. | `pnpm issue-claim check\|claim\|release\|comment <repo>#<n> --by <agent/session>` |
| `issue-triage`, `pr-triage`, `triage-publish` | Reproduce and classify an issue or pull request, then post labels and a comment. | `--data '{"args":"<context>"}'`; `triage-publish` takes `{"phase":"prepare","kind":"issue"}` |
| `review` | Review a working copy or revisions, verify findings and render a walkthrough. | `--data '{"repo":"."}'` |
| `docs-sync` | Regenerate the docs redirect map, or check package tarballs keep their README and `docs/`. | `pnpm docs:sync`, `pnpm docs:check` |
| `create-flow`, `create-skill` | Turn a plain-English request into a working flow or skill. | `--data '{"args":"<request>"}'` |
| `lint` | Lint named files against repository conventions and fix them. | `--data '{"args":"path/a.ts path/b.ts"}'` |
| `release/cut`, `release/rehearsal` | Write a version and changelog, or dry-run the Release workflow. | `--data '{"version":"1.0.0"}'`; `--data '{"tag":"v1.0.0-rc.0"}'` |
| `quality`, `perf`, `bench/gate`, `security-audit` | Take a quality snapshot, check performance budgets, gate scheduler cost, or audit security boundaries. | `pnpm exec smthrs flow start <name> --wait` |

[`@smthrs/coding`](../.smithers/flows/coding/README.md) (private,
`.smithers/flows/coding`) holds the TODO step flows (`Request`, `TodoDelivery`,
`TodoReview`) that a repository `todo` flow builds on. Stack admission starts
`todo`; agents do not start it by hand.

## Apps and other code

Apps are composition roots. They pick a host and use the libraries above.

| App | Path | What it is | Runs on |
| --- | --- | --- | --- |
| [`smithers-app`](../apps/app/AGENTS.md) (private) | `apps/app` | The product React app (chat, cards, flows) and its local Bun host. | Browser, Bun |
| [`smithers-server`](../apps/server/AGENTS.md) (private) | `apps/server` | The smithers.sh edge Worker. It serves the site build and forwards `/api/*` and git to the backend unchanged. | Cloudflare Worker |
| `smithers-model-host` (private) | `apps/model-host` | The packaged model-turn server around `@smthrs/model-host`. | Node |
| [`@smthrs/mvp`](../apps/mvp/AGENTS.md) (private) | `apps/mvp` | The from-scratch rebuild of the app: React, LiveStore and a Worker. | Browser, Cloudflare Worker |
| [`@smithers/site`](../apps/site/docs/UI-DOCS.md) (private) | `apps/site` | The smithers.sh landing page, docs and product page. | Node build, browser |
| [`smithers-tui`](../apps/tui/README.md) (private) | `apps/tui` | The terminal coding agent over the cell harness. | Bun, Node |
| [`@smthrs/bug-worker`](../apps/bug-worker/README.md) (private) | `apps/bug-worker` | The bug.smithers.sh report intake. | Cloudflare Worker |

Code outside the pnpm workspace:

- `packages/backend` is the product backend in Go, and the only one. Its
  composition root is `app.Config` in `packages/backend/app/app.go`, and
  `apps/backend` builds the binary. See
  [`OWNERSHIP.md`](../packages/backend/OWNERSHIP.md) and
  `packages/backend/docs/`.
- `packages/smithers-ffi` is the native C ABI for repository and jj
  operations. `packages/smithers/flows/jj-wasm` compiles the `Jj` operations to
  WebAssembly for the browser. `packages/smithers-machined` is the Rust daemon
  inside each branch machine that keeps one connection to the host
  ([ADR 0004](architecture/0004-machined-wire.md)).
- `apps/patterns-site` is the static patterns.smithers.sh site.
