---
"@smthrs/flows": major
"@smthrs/platform-node": major
"@smthrs/platform-bun": major
"@smthrs/jj": major
"@smthrs/sandbox": major
"@smthrs/cli": patch
---

The `@smthrs/flows` root imports no platform code, so it bundles and runs in a
browser and a Cloudflare Worker as well as on Node and Bun. The native runtimes
moved to the host packages, with the same API:

```ts
// Before
import * as NodeRuntime from "@smthrs/flows/NodeRuntime"
import * as SandboxedFlow from "@smthrs/flows/SandboxedFlow"
import * as BunRuntime from "@smthrs/flows/BunRuntime"
import { durableEngine } from "@smthrs/flows/test/TestNodeRuntime"
// After
import { NodeRuntime, SandboxedFlow, TestNodeRuntime } from "@smthrs/platform-node"
import { BunRuntime } from "@smthrs/platform-bun"
TestNodeRuntime.durableEngine(filename, hostId)
```

`@smthrs/platform-node` now depends on `@smthrs/flows`, `@effect/sql-sqlite-node`
and `esbuild`, so `npm install @smthrs/platform-node@next @smthrs/flows@next effect`
installs a Node host. `@smthrs/flows` no longer installs any of them.
`NodeRuntime.RuntimeConfigurationError` is `Runtime.RuntimeConfigurationError`
from `@smthrs/flows`; its tag is unchanged. `Runtime.NativeOptions` is
`NativeRuntime.Options` in `@smthrs/platform-node`. `Runtime` adds `validate`,
`decodeField`, `RegistryArgs` and `registryLayer` for a host that composes the
engine itself.

`@smthrs/sandbox`'s `SandboxMerge.apply` requires `@smthrs/jj`'s new
`RepositoryMutation` service instead of importing `@smthrs/jj/node/NodeJj` at
run time; a Node or Bun host provides `NodeJj.layerRepositoryMutation`.
`retryGitIndexLock` moved from `NodeJj` to the `@smthrs/jj` root. `@smthrs/cli`
takes `@smthrs/platform-bun` as an optional peer for its Bun control host.

RC releases carry no stability commitment ([RELEASE_SUPPORT.md (MVP compatibility changes)](../RELEASE_SUPPORT.md#mvp-compatibility-changes)).
