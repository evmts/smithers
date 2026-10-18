---
"@smthrs/sandbox": major
"@smthrs/platform-node": minor
"@smthrs/platform-bun": minor
---

`MicrosandboxSandbox.make` requires a `collector`: the host's
`MicrosandboxSandbox.GarbageCollector` service. The provider no longer reads
the ambient `process` or `Bun`, loads `node:v8` and `node:vm`, or sets V8 flags
itself. It still collects on every 64th command start and before it reconnects
to a guest that stopped answering, through the collector the host provides:

```ts
import { NodeGarbageCollector } from "@smthrs/platform-node"
import { MicrosandboxSandbox } from "@smthrs/sandbox"
import { Effect } from "effect"
import * as Microsandbox from "microsandbox"

const program = Effect.gen(function*() {
  const provider = MicrosandboxSandbox.make({
    sdk: Microsandbox,
    collector: yield* MicrosandboxSandbox.GarbageCollector
  })
  // ...
}).pipe(Effect.provide(NodeGarbageCollector.layer))
```

`NodeGarbageCollector.layer` from `@smthrs/platform-node` provides it on Node,
and `BunGarbageCollector.layer` from `@smthrs/platform-bun` on Bun.
`MicrosandboxSandbox.layerGarbageCollectorNoop` collects nothing, for a host
with no collector to call. `@smthrs/platform-bun` now depends on
`@smthrs/sandbox`.

RC releases carry no stability commitment ([RELEASE_SUPPORT.md (MVP compatibility changes)](../RELEASE_SUPPORT.md#mvp-compatibility-changes)).
