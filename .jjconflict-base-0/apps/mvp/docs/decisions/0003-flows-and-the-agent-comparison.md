# 0003 appendix: Opus and Sol designs compared

The two designs were written independently, then Opus merged them into [0003](0003-flows-and-the-agent.md). Each row names the point, each design's position and the final call. Sol's claims that the final design adopts were checked against the repository; the list at the end says how.

**Agreed** (Opus and Sol said the same thing; the final design keeps it):

| Point | Final |
|---|---|
| Where the agent loop runs | Cloudflare, inside HOST-PLAN's `chat/Answer`; ModelProxy stays deleted |
| Model calls | every one a `ModelStep`, through `FlowEngineLike.sealStep`; at least once before the seal, never repeated after it |
| Agent runtime | `@smthrs/agent` (`AgentAction`), no app loop; seats resolved by layers |
| QuickJS on workerd | W4 provides `QuickJSSandbox.Variant` with build-time wasm |
| Theme | local-only, a persisted `preferences` collection; the DOM is a browser-host projection of it |
| Queue | Enter queues a new question; one answer at a time, in order; steering and cancel later, as durable control |
| Forms | an answer can end with a form; its submission is a new, correlated question (0004) |
| Parity | a test that every user action is reachable by the agent |
| Old code | don't copy `NativeAgent`, the `Cards` union, `HostTools` or the unused `Instructions.ts` into the MVP |
| Telemetry | content-free, proved by a sentinel test |

**Differed:**

| Point | Opus | Sol | Final | Why |
|---|---|---|---|---|
| Theme payload | `light`, `dark` or `toggle` | a setter, `light` or `dark`; the toggle button reads, then sets | Sol, plus `device.theme` on each question | A setter can't invert twice under replay or duplicate delivery. The theme on the question lets "switch the theme" work without a round trip. |
| Agent calling a client flow | write an effect part, answer `{requested: true}`, the device dedupes | a durable command, the cloud step parks, the device returns a receipt through its outbox, deadline and generation fencing | Sol, simplified: setters replace generation fencing; 20 s deadline; the outbox-leader tab applies | Never report a change before it happened (root `AGENTS.md`, M-46's rule for imports). The mechanics exist: `DurableDeferred` tokens let outside code complete a wait, and the `wait` flow awaits inside a cell call. |
| Browser durability | client flows on a bounded memory engine; one atomic local write each; durable browser engine deferred | an OPFS-backed durable browser engine with wake-on-open, as a feature-1 prerequisite | Opus, with Sol's honesty: the docs say client flows aren't journaled; question 2 to Will | Each client flow is one synchronous write, enforced by running it under `Effect.runSync` in a test, so nothing is left to resume. `FlowEngine.layerMemory` never evicts today, so the engine gains retention. |
| Local flow waiting on a remote one | remote starts go through the outbox; results arrive as synced rows | a remote-child port in `@smthrs/flow`: the local parent seals a child reference and waits for its result | Opus | No flow needs a local parent today. It arrives with the first client flow that needs a remote result. |
| Where declarations live | `src/features/<f>/flows.ts` and `src/flows/registry.ts` | `apps/mvp/shared/flows/manifest.ts` and `shared/agent/` | Opus | `docs/state.md` already shares framework-free feature files (`contract.ts`) between the tab and the Worker. A `shared/` root would be a second convention. |
| Identity and collisions | the registry table | qualified `{source, revision, tag}`, reserved app namespaces, a catalog pinned per answer | Sol | The harness already checks each call against the declaration digest its cell was written against. Reserved names mirror the install catalog's `reserved_name`. |
| Parity scope | flows the UI dispatches | every user-facing action, composer and navigation included | Sol, with `userOnlyReason` for gestures | The old app's three-door law names gestures as the only exception. |
| Streaming and conversation shape | `DoneText` projects the `ctx.done` literal; steps and calls in a `parts` column | ordered entries (text, code or tool call, result, render, interaction) with stable ids | Opus's `parts`, with Sol's stable ids `(frame, ordinal)` and "sealed events are authoritative" | Entries would add a table and send code and raw results to every device. Parts hold what a person sees. Sol didn't say how text streams from a cell, which has no prose path. |
| Contract profile | a `conversation` profile in `@smthrs/harness` | not covered | Opus | The workspace contract teaches git and bug-fix rules, and an example whose flows this catalog lacks. |
| Remote-start door | one `POST /api/flows/:name`; `/api/questions` folds in after W5 | not covered | Opus | One bounding policy and one idempotency contract. |
| Failure codes | adds `unfinished` | not covered | Opus | The frame cap needs a name. |
| Standard flows on the host | not covered | don't offer read or bash where there is no filesystem | Sol | `CloudflareHost` refuses `FileSystem` and `ChildProcessSpawner` (HOST-PLAN 1). |
| Questions for Will | three | none | two | The loop's placement contradicts a plausible reading of Will's note. The browser-durability split is a real disagreement over his "everything is a durable flow" rule. |

**Sol's claims checked:**
- **Setter idempotence:** logical. 0002's outbox is at least once, and so is device delivery.
- **The receipt mechanics:** `packages/smithers/flows/flow/src/DurableDeferred.ts` (header: tokens "so external code can complete the correct wait point later"); `packages/smithers/agent/src/StandardFlows.ts` (`wait`: "the enclosing cell call is the durable boundary").
- **QuickJS on workerd:** `packages/smithers/agent/harness/test/WorkerdSmoke.test.ts` ("workerd refuses `WebAssembly.compile` over bytes") and `QuickJSSandbox.layerVariant`.
- **Catalog pinning:** `packages/smithers/agent/docs/concepts/agent-loop.md`, "One catalog, shown and enforced".
- **No filesystem on the host:** HOST-PLAN decision 1.
- **Not adopted, so not checked:** Sol's link to `developers.cloudflare.com/agents/tools/codemode/`. 0004 cites the Code Mode blog and the API reference page, both opened.
