---
"@smthrs/std": major
"@smthrs/platform-node": major
"@smthrs/kernel": minor
"@smthrs/registry": major
"@smthrs/agent": patch
"@smthrs/cli": patch
---

The `@smthrs/agent` and `@smthrs/std` roots import no platform code and touch
no DOM while they load, so an agent runs in a browser's dedicated worker and a
Cloudflare Worker as well as on Node and Bun.

The Node language-server client moved to the Node host, with the same API:

```ts
// Before
import * as NodeLanguageServer from "@smthrs/std/NodeLanguageServer"
// After
import { NodeLanguageServer } from "@smthrs/platform-node"
```

`@smthrs/platform-node` now depends on `@smthrs/std`.

The web tools (`Fetch`, `HttpPost`, `WebFetch`) resolve names through
`@smthrs/kernel`'s new `HttpClient.ResolveHost`, not `node:dns`. Its default
refuses every name with `HttpClient.ResolveHostUnavailable`, which std reports
as `unsupported`: a browser tab or a Worker can neither resolve a name nor pin a
connection to the checked addresses, so the request is refused, never sent
unchecked. `EgressHttpClient.layer` from `@smthrs/platform-node` provides the
system resolver (`EgressHttpClient.resolveHost`) beside its pinning client, so
`NodeHost` and `BunHost` resolve as before. The public-address policy is
unchanged, except that a zoned IPv6 literal (`fe80::1%eth0`) is never public.
`ChildProcessSpawner.ambientEnvironment()` is now exported from the kernel.

`@smthrs/registry`'s `Prompt.compile(source)` returns an `Effect` and loads the
MDX compiler on its first call. Under the `browser` export condition the
compiler's Markdown parser calls `document` while it loads, which killed the
engine worker of an app that imported the agent.

RC releases carry no stability commitment ([RELEASE_SUPPORT.md (MVP compatibility changes)](../RELEASE_SUPPORT.md#mvp-compatibility-changes)).
