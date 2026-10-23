# Pinned repository flows

`RealmFlow.step` evaluates a pinned TypeScript module in a fresh bounded QuickJS
realm using the actual `@smthrs/flow` interpreter and `@smthrs/plan` nodes.
It returns an `Action` request or a schema-validated `Complete` result.
The host executes each request through its durable engine, persists the receipt,
and supplies all receipts to the next evaluation. Restarting the host rebuilds
the same source and replays receipts; a completed action is never dispatched by
this library. Pin the source, module bundle version, payload and action ceiling
in the durable run before evaluation. `RealmFlow.version` identifies the committed
SDK bundle and realm policy.

```ts
import { RealmFlow } from "@smthrs/harness"
import { Effect } from "effect"

const evaluation = RealmFlow.step({
  source: pinnedSource,
  expectedTag: "example",
  payload: { value: 4 },
  allowedActions: ["read"],
  receipts: savedReceipts
}).pipe(Effect.provide(RealmFlow.layerDefaultVariant))
```

Node and browsers use `layerDefaultVariant`. Cloudflare Workers supply the
existing `QuickJSVariant.layerVariant` over their statically compiled WASM build.
Imports are restricted to `Flow` and `Action` from `@smthrs/flow`, `Node` from
`@smthrs/plan`, and `Schema` from `effect` or `effect/Schema`. Smithers package subpaths refuse execution.
These are the library catalog entries for durable workflows, plan composition,
and identity (`@smthrs/crypto` and `@smthrs/canonical`); there is no replacement
flow model. The action export delegates to actual `Action.make` and retains its
schemas for validating action requests and receipts.

Use `Node.capture` for the flow body and every deferred callback. The real
interpreter requires stable callback identity. Only names listed in
`allowedActions` resolve, including names in an untaken branch. Receipts bind
canonical node identity, action name and canonical payload, and reject duplicate
or unused entries. Success and failure values must satisfy the action's schemas.
The host still authorizes every action against the caller's effective ceiling.
No action implementation or host reference crosses into QuickJS.

The realm exposes no clock, randomness, Proxy, weak references, timers, network,
filesystem, process or arbitrary module imports. Private SDK intrinsics support
planned references and inert capture admission. Their Proxy constructor tracks
all SDK proxies so the restricted clone probe rejects them, and their clock and
process nonce are fixed. These private bindings are inaccessible to repository
code, which is compiled in a separate global lexical environment.
Shared intrinsics and public SDK exports are frozen before repository code runs;
global intrinsic bindings are immutable. Repository code cannot replace JSON
transport, collection methods, receipt checks, or the SDK's public functions.

Each evaluation is limited to 64 MiB of QuickJS heap, a 128 KiB QuickJS stack,
one second and 2,000 interpreter interrupt polls. Source, emitted node records
and serialized output are bounded to 256 KiB. Errors expose only a refusal code;
source, values and exception details are never logged. These bounds do not claim
to bound WebAssembly compilation or the TypeScript compiler's host allocation.

Composition, maps, branches, joins with `Node.all`, sequences and typed catches
use the real interpreter. Engine-owned child executions, trampoline handoffs,
durable waits and race decisions are not provided by this realm's restricted
runtime and refuse execution. Express those operations as named host actions;
the caller's durable engine owns their scheduling and recovery.

`realm/build.mjs` reproducibly generates the committed
`src/internal/RealmFlowBundle.ts` from the workspace's actual SDK sources using
esbuild. `node realm/build.mjs --check` rebuilds and verifies the committed bytes. Regenerate it whenever the authoring libraries or entry change. The
QuickJS tests execute the generated SDK bundle; V8 coverage cannot instrument
code executed by the WASM interpreter, so its behavioral evidence is the realm
suite rather than V8 statement counts inside that bundle.
